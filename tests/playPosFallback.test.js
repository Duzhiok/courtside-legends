import test from "node:test";
import assert from "node:assert/strict";
import { nextEmptyPlayPos, rankedPlayPosFits, recommendPlayPos } from "../js/engine/gameplan.js";

// A real-shaped Andre Drummond-type card: a true back-to-the-basket center.
function bigMan(overrides = {}) {
  return {
    pos: "C",
    heightCm: 211,
    pass: 35,
    speed: 48,
    three: 25,
    paint: 88,
    rebound: 92,
    block: 80,
    strength: 90,
    defense: 65,
    scoring: 55,
    threeTend: 5,
    raw: { apg: 1.0, bpg: 1.6 },
    ...overrides,
  };
}

function guard(overrides = {}) {
  return {
    pos: "PG",
    heightCm: 188,
    pass: 85,
    speed: 88,
    three: 70,
    paint: 30,
    rebound: 35,
    block: 20,
    strength: 55,
    defense: 60,
    scoring: 65,
    threeTend: 55,
    raw: { apg: 8.0, bpg: 0.3 },
    ...overrides,
  };
}

test("a 211cm rim protector is never the top-ranked fit for PG or SG", () => {
  const ranks = rankedPlayPosFits(bigMan());
  assert.ok(!["PG", "SG"].includes(ranks[0]), `top fit was ${ranks[0]}`);
  assert.ok(ranks.indexOf("C") < ranks.indexOf("PG"), "C should outrank PG for a true center");
  assert.ok(ranks.indexOf("C") < ranks.indexOf("SG"), "C should outrank SG for a true center");
});

test("nextEmptyPlayPos never parks a true center at SG just because C and PF are already full — regression for the Andre Drummond 'since when is he a SG' report", () => {
  const picked = [
    { playPos: "C", pos: "C" },
    { playPos: "PF", pos: "PF" },
  ];
  const slot = nextEmptyPlayPos(picked, bigMan());
  assert.ok(["SF"].includes(slot) || slot === "SF", `big man got parked at ${slot}, expected SF (next-best fit, not a blind PG->C scan)`);
  assert.notEqual(slot, "SG");
  assert.notEqual(slot, "PG");
});

test("nextEmptyPlayPos honors a manual preferred slot first, then falls back through the ranked list (not fixed PG->C order) once it's taken", () => {
  const picked = [{ playPos: "SF", pos: "SF" }];
  // Preferred SF is taken; next should be the big man's own best remaining fit, not just "PG because it's first".
  const slot = nextEmptyPlayPos(picked, bigMan(), "SF");
  assert.notEqual(slot, "PG");
});

test("a small, pass-first guard still recommends PG even when some other skinny slot is open first in list order", () => {
  const picked = [];
  assert.equal(nextEmptyPlayPos(picked, guard()), "PG");
  assert.equal(recommendPlayPos(guard()), "PG");
});

test("rankedPlayPosFits always returns exactly the 5 slots, no duplicates, no drops", () => {
  for (const p of [bigMan(), guard(), null, undefined]) {
    const ranks = rankedPlayPosFits(p);
    assert.deepEqual([...ranks].sort(), ["C", "PF", "PG", "SF", "SG"]);
  }
});
