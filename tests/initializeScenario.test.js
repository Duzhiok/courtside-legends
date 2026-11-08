// M2b-2 initializeScenario: invariant validation for the clutch scenario.
// Legal Q4 situations build; illegal input is rejected, never forged.
import test from "node:test";
import assert from "node:assert/strict";
import { initializeScenario, buildClutchTeams, DEFAULT_CLUTCH_SCENARIO } from "../js/engine/clutchController.js";
import { createClutchController } from "../js/engine/clutchController.js";
import { startClutchSim } from "../js/engine/clutchController.js";
import { seededStream } from "../js/core/seededRandom.js";
import { CLUTCH_POOL, buildClutchSim } from "./helpers/clutchSim.js";

test("default scenario: 2016 Warriors vs Cavaliers, down 3, 12s, you control the Warriors", () => {
  const s = initializeScenario({ pool: CLUTCH_POOL });
  assert.equal(s.home.name, "GSW");
  assert.equal(s.away.name, "CLE");
  assert.equal(s.home.players.length, 10);
  assert.equal(s.away.players.length, 10);
  assert.ok(s.home.players.some((p) => /Stephen Curry/.test(p.name)), "Curry is on the 2016 Warriors");
  assert.ok(s.home.players.some((p) => /Klay/.test(p.name)), "Klay is on the 2016 Warriors");
  assert.ok(s.away.players.some((p) => /LeBron/.test(p.name)), "LeBron is on the 2016 Cavaliers");
  assert.equal(s.youSide, "home");
  assert.equal(s.quarter, 4);
  assert.equal(s.clock, 12);
  assert.deepEqual(s.score, { home: 97, away: 100 });
  assert.equal(s.possession, "home");
  assert.deepEqual(DEFAULT_CLUTCH_SCENARIO.score, { home: 97, away: 100 }, "the frozen default is the M2b-1 measured setup");
});

test("team selection is deterministic and orders by scoring + three (same as the M2b-1 sweep)", () => {
  const a = buildClutchTeams(CLUTCH_POOL);
  const b = buildClutchTeams(CLUTCH_POOL);
  assert.deepEqual(a.home.players.map((p) => p.id), b.home.players.map((p) => p.id));
  const key = (p) => (p.scoring || 0) + (p.three || 0);
  for (let i = 1; i < a.home.players.length; i++) {
    assert.ok(key(a.home.players[i - 1]) >= key(a.home.players[i]), "sorted by scoring + three desc");
  }
});

test("illegal input is rejected with a code, never silently fixed", () => {
  const bad = (over, code) => {
    assert.throws(() => initializeScenario({ pool: CLUTCH_POOL, ...over }), (e) => e.code === code, JSON.stringify(over));
  };
  bad({ pool: [] }, "clutch/no-players");
  bad({ pool: CLUTCH_POOL.filter((p) => p.team !== "CLE") }, "clutch/no-players");
  bad({ pool: null }, "clutch/no-pool");
  bad({ clock: -1 }, "clutch/bad-clock");
  bad({ clock: 721 }, "clutch/bad-clock");
  bad({ clock: 12.5 }, "clutch/bad-clock");
  bad({ quarter: 3 }, "clutch/bad-quarter");
  bad({ quarter: 6 }, "clutch/bad-quarter");
  bad({ score: { home: -1, away: 100 } }, "clutch/bad-score");
  bad({ score: { home: 97.5, away: 100 } }, "clutch/bad-score");
  bad({ possession: "bench" }, "clutch/bad-possession");
});

test("boundary: clock 0 is legal (the possession then closes with no_possession)", () => {
  const s = initializeScenario({ pool: CLUTCH_POOL, clock: 0 });
  assert.equal(s.clock, 0);
  const sim = startClutchSim(s, { rng: seededStream(1), onEvent() {}, onTick() {}, onEnd() {} });
  const ctrl = createClutchController({ sim });
  ctrl.openDecision();
  assert.ok(ctrl.select(sim.home.onCourt[0].id, "three").ok);
  assert.ok(ctrl.submit().ok);
  assert.equal(ctrl.resolve().ok, true);
  assert.equal(ctrl.outcome.reason, "no_possession");
});

test("boundary: overtime (quarter 5, 300s clock) is legal; 301s is not", () => {
  const s = initializeScenario({ pool: CLUTCH_POOL, quarter: 5, clock: 300, score: { home: 100, away: 100 } });
  assert.equal(s.quarter, 5);
  assert.equal(s.clock, 300);
  assert.throws(() => initializeScenario({ pool: CLUTCH_POOL, quarter: 5, clock: 301 }), (e) => e.code === "clutch/bad-clock");
});

test("a reused card with non-zero stats is rejected (stats must start consistent)", () => {
  const dirty = CLUTCH_POOL.map((p) => (p.team === "GSW" && p.season === 2016 ? { ...p, stats: { fga: 1, fgm: 0 } } : p));
  assert.throws(() => initializeScenario({ pool: dirty }), (e) => e.code === "clutch/dirty-stats");
  const clean = CLUTCH_POOL.map((p) => (p.team === "GSW" && p.season === 2016 ? { ...p, stats: { fga: 0, fgm: 0 } } : p));
  assert.doesNotThrow(() => initializeScenario({ pool: clean }), "zeroed stats are fine");
});

test("the built sim really is the scenario (5 on court, Q4, 12s, down 3, Warriors ball)", () => {
  const { sim } = buildClutchSim(1);
  assert.equal(sim.home.onCourt.length, 5);
  assert.equal(sim.away.onCourt.length, 5);
  assert.equal(sim.quarter, 4);
  assert.equal(sim.clock, 12);
  assert.deepEqual(sim.score, { home: 97, away: 100 });
  assert.equal(sim.possession, "home");
  assert.equal(sim.you(), sim.home, "you control the Warriors");
});
