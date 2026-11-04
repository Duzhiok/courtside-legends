import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";

/**
 * Shout presentation (B: presentation only, numbers untouched): the feed must
 * name the players being pulled back into the system instead of only counting
 * them, and the snapshot must carry the tactic-hold window so the live UI can
 * show its remaining rounds.
 */
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool2020 = rows.filter((r) => r.season === 2020).map(seasonToCard);

function freshSim(events) {
  return new GameSim({
    home: {
      name: "Home",
      players: pool2020.slice(0, 12),
      starterIds: pool2020.slice(0, 5).map((p) => p.id),
    },
    away: {
      name: "Away",
      players: pool2020.slice(12, 24),
      starterIds: pool2020.slice(12, 17).map((p) => p.id),
    },
    youSide: "home",
    onEvent: (e) => events.push(e),
    onTick: () => {},
    onEnd: () => {},
  });
}

function setEgo(p, ego) {
  p.personality = { ...(p.personality || {}), ego };
}

function setAdapt(p, adapt, ballNeed = 50) {
  p.intangibles = { ...(p.intangibles || {}), systemAdapt: adapt, ballNeed };
}

test("shout names the drifted players instead of only counting them", () => {
  const events = [];
  const sim = freshSim(events);
  const you = sim.you();
  // Pin every ego first: a high-ego default roster would otherwise trip the
  // 25% backfire (egoAvg > 75) and make this test flaky. One star at 100,
  // the rest at 50 -> avg 60, backfire impossible, drift still guaranteed.
  for (const p of you.onCourt) setEgo(p, 50);
  const star = you.onCourt[0];
  setEgo(star, 100); // ego term alone is (100-60)*0.4 = 16 >= 10 drift
  sim.shout();
  const texts = events.map((e) => e.text);
  assert.ok(
    texts.some((t) => t.includes(star.name) && t.includes("勒令集中执行")),
    `expected a shout line naming ${star.name}; got ${JSON.stringify(texts)}`
  );
  assert.equal(sim.you().temp.tacticHold, 0.78);
  assert.equal(sim.you().temp.ttl, 6);
  assert.ok((star.tempTacticFocus || 0) >= 5, `expected a long lock-in, got ${star.tempTacticFocus}`);
});

test("shout with nobody drifting keeps the everyone-locks-in line", () => {
  const events = [];
  const sim = freshSim(events);
  // adapt 100 -> fit 64 -> fit term 0; ego/ballNeed neutral -> drift 0 for all.
  for (const p of sim.you().onCourt) {
    setEgo(p, 50);
    setAdapt(p, 100, 50);
  }
  sim.shout();
  const texts = events.map((e) => e.text);
  assert.ok(
    texts.some((t) => t.includes("全员集中注意力")),
    `expected the everyone line; got ${JSON.stringify(texts)}`
  );
});

test("snapshot carries the tactic-hold window for the live countdown", () => {
  const events = [];
  const sim = freshSim(events);
  // Same backfire guard as above: pin egos so the 25% early return can't fire.
  for (const p of sim.you().onCourt) setEgo(p, 50);
  sim.shout();
  const snap = sim.snapshot();
  const you = snap.youSide === "home" ? snap.home : snap.away;
  assert.equal(you.temp.tacticHold, 0.78);
  assert.equal(you.temp.ttl, 6);
});
