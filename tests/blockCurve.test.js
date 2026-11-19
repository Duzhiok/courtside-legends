import test from "node:test";
import assert from "node:assert/strict";
import { calcBlockChance } from "../js/engine/sim.js";

const body = (block) => ({ block, heightCm: 200, strength: 60, playPos: "SF", pos: "SF", paint: 60, skills: [] });
const chanceAt = (block, zone = "paint") => calcBlockChance(body(50), body(block), { zone, pts: zone === "three" ? 3 : 2 }, 0.5);

// (rating 0 is skipped on purpose: `defender.block || 40` reads a rating of exactly 0 as "missing" and uses 40. An old quirk, not part of this change.)
test("block chance rises with the defender's block rating, in every zone", () => {
  for (const zone of ["paint", "mid", "three"]) {
    let last = -1;
    for (let r = 5; r <= 100; r += 10) { const c = chanceAt(r, zone); assert.ok(c >= last, `${zone} rating ${r}`); last = c; }   // >=: the mid-range chance has a 10% cap
    assert.ok(chanceAt(100, zone) > chanceAt(5, zone), `${zone}: a high rating is above a low one`);
  }
});

test("the rating does the work: an elite rim protector blocks at least 4x as often as a rating-10 guard at the rim (the old floor allowed 3x)", () => {
  assert.ok(chanceAt(95) / chanceAt(10) >= 4, `${chanceAt(95).toFixed(3)} vs ${chanceAt(10).toFixed(3)}`);
});

test("a rating-10 defender has a small but non-zero chance at the rim (never zero, never the old 8%)", () => {
  const c = chanceAt(10);
  assert.ok(c > 0.02 && c < 0.06, String(c));
});

test("elite rim protection is not weakened: a rating-95 defender is still above 15% at the rim on an open look", () => {
  assert.ok(chanceAt(95) >= 0.15, String(chanceAt(95)));
});

test("the size and position mismatch discounts still apply (a point guard rejecting a center is still almost never)", () => {
  const center = { ...body(50), heightCm: 213, strength: 80, playPos: "C", pos: "C" };
  const guard = { ...body(20), heightCm: 188, playPos: "PG", pos: "PG" };
  assert.ok(calcBlockChance(center, guard, { zone: "paint", pts: 2 }, 0.5) < 0.01);
});
