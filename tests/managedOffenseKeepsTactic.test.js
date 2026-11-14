import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";
import { TACTICS } from "../js/data/coaches.js";
import { seededStream } from "../js/core/seededRandom.js";
import { withRng } from "../js/core/rng.js";

/**
 * B34: 「进攻托管」只在你当前用的是进攻体系战术时才换战术（group = offense / spacing / pace_transition）。
 * 沉退联防、无限换防、收缩篮下、铁血半场、冲抢篮板、二次进攻、鼓舞士气、自由发挥不会被顶掉，
 * 但回合重点 / 攻守倾向照常调整。真实 GameSim + 真实 2020 名册卡，不 mock 球员形状。
 */
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool = rows.filter((r) => r.season === 2020).map(seasonToCard);

const team = (name, offset) => {
  const players = pool.slice(offset, offset + 12);
  return { name, players, starterIds: players.slice(0, 5).map((p) => p.id) };
};
// Fixed seed (AI_EFFICIENCY_POLICY rule 7): the sim and every managedOffensePlan call roll from
// seededStream, so "how many systems were swapped" reproduces instead of depending on luck.
const SEED = 20261114;
const sim = (tacticId) => {
  const s = new GameSim({ rng: seededStream(SEED), home: team("Home", 0), away: team("Away", 12), youSide: "home", onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  // every tactic is available to this coach, so the only thing that can stop a swap is the rule under test
  s.you().coach = { ...(s.you().coach || {}), name: "Coach", specialTactics: Object.keys(TACTICS) };
  s.setTactic(tacticId);
  s.setAutoOffense(true);
  return s;
};
/** managedOffensePlan is not a seeded entry point, so run it under the sim's own rng. */
const plan = (s) => withRng(s.rng, () => s.managedOffensePlan({ light: false }));
/** A deficit big enough that the autopilot WANTS to switch to an attacking system. */
const trailing = (s) => {
  s.score[s.opp().side] = 60;
  s.score[s.you().side] = 40;
  s.quarter = 2;
  s.clock = 400;
};

const PROTECTED = {
  zone_drop: "沉退联防",
  switch_all: "无限换防",
  pack_paint: "收缩篮下",
  grind: "铁血半场",
  crash_boards: "冲抢篮板",
  second_chance: "二次进攻",
  morale_boost: "鼓舞士气",
  freestyle: "自由发挥",
};
const SWAPPABLE = ["balanced", "motion", "iso_heavy", "post_up", "smallball", "pace_space", "five_out", "transition"];

test("the eight non-offense tactics from the bug report are all outside the swappable groups", () => {
  for (const id of Object.keys(PROTECTED)) {
    assert.ok(TACTICS[id], `${id} exists`);
    assert.ok(!["offense", "spacing", "pace_transition"].includes(TACTICS[id].group), `${id} is group ${TACTICS[id].group}`);
  }
  for (const id of SWAPPABLE) assert.ok(["offense", "spacing", "pace_transition"].includes(TACTICS[id].group), `${id} is group ${TACTICS[id].group}`);
});

for (const [id, label] of Object.entries(PROTECTED)) {
  test(`${label} (${id}) is NOT replaced by 进攻托管, even when trailing`, () => {
    const s = sim(id);
    trailing(s);
    plan(s);
    assert.equal(s.you().tactic.id, id);
  });
}

test("a protected tactic still gets the rest of the autopilot: play focus and coaching buffs", () => {
  const s = sim("zone_drop");
  trailing(s);
  plan(s);
  assert.equal(s.you().tactic.id, "zone_drop");
  assert.ok(s.focusPlay?.id, "a play focus was still chosen");
  assert.equal(s.you().coach.buffs.offense, 12, "trailing by 20 early still moves the offence dial (12), as before");
});

test("an offensive system IS still swapped when the situation asks for it (behaviour unchanged)", () => {
  let swapped = 0;
  for (const id of SWAPPABLE.filter((t) => t !== "motion" && t !== "iso_heavy")) {
    const s = sim(id);
    trailing(s);
    plan(s);
    if (s.you().tactic.id !== id) swapped++;
  }
  assert.ok(swapped >= 3, `only ${swapped} offensive systems were ever swapped; the autopilot must still work`);
});

test("the rule lives inside managedOffensePlan itself, so it holds however the plan is reached", () => {
  const s = sim("zone_drop");
  s.setAutoOffense(false); // the switch being off is the caller's business; called directly the rule still holds
  trailing(s);
  plan(s);
  assert.equal(s.you().tactic.id, "zone_drop");
});
