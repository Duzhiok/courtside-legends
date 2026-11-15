// UI 3.0 slice 0: live coaching overrides live in the match, never in the team object the match was built from.
// Gold Challenge passes `career.team` itself to GameSim, so a shared `gameplan` reference used to write a paused
// setTempo / setOffenseFocus (and the autopilot's tempo) straight into the save, and the next game's setup
// pre-filled it as if the player had chosen it as the team default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool = rows.filter((r) => r.season === 2020).map(seasonToCard);

function team(name, offset) {
  const players = pool.slice(offset, offset + 12);
  return {
    name,
    players,
    starterIds: players.slice(0, 5).map((p) => p.id),
    gameplan: { tempo: "normal", offenseFocusId: null, matchup: null },
  };
}

function newSim(home, away) {
  return new GameSim({ home, away, youSide: "home", onEvent() {}, onTick() {}, onEnd() {} });
}

test("a paused live override reaches the sim but not the source team's gameplan", () => {
  const home = team("Home", 0);
  const away = team("Away", 12);
  const before = structuredClone(home.gameplan);
  const sim = newSim(home, away);
  sim.setPaused(true);
  sim.setTempo("push");
  const handler = sim.you().onCourt[1];
  sim.setOffenseFocus(handler.id, { action: "iso", forceUsage: true });

  assert.equal(sim.you().gameplan.tempo, "push", "the live override works inside the match");
  assert.equal(sim.you().gameplan.offenseFocusId, handler.id);
  assert.deepEqual(home.gameplan, before, "the Team Default (source object) is untouched");
});

test("the override survives a mid-game save and still does not touch a team rebuilt from it", () => {
  const home = team("Home", 0);
  const sim = newSim(home, team("Away", 12));
  sim.setPaused(true);
  sim.setTempo("grind");
  const restored = GameSim.fromSave(structuredClone(sim.exportState()), { onEvent() {}, onTick() {}, onEnd() {} });
  assert.equal(restored.you().gameplan.tempo, "grind", "live override restored from the sim snapshot");
  assert.equal(home.gameplan.tempo, "normal");
});

test("two games built from the same team start from the same Team Default", () => {
  const home = team("Home", 0);
  const first = newSim(home, team("Away", 12));
  first.setPaused(true);
  first.setTempo("push");
  const second = newSim(home, team("Away", 12));
  assert.equal(second.you().gameplan.tempo, "normal", "the next game does not inherit the previous live override");
});
