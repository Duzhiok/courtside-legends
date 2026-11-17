// B35: the recommended player orders must not starve real scorers or inflate non-scorers. Measured on 1995 season 2:
// Rice (scoring 81, three 92) was set to usage "defend" and scored 3.8 ppg vs 22.3 real; Kidd (55) was set to
// score/iso/high and piled up points. Design goals only (no tuned numbers).
import test from "node:test";
import assert from "node:assert/strict";
import { recommendPlayerOrders, aggressionLevel } from "../js/engine/gameplan.js";

// A spot-up wing: three-heavy style, low playmaking, not a guard.
const shooter = (scoring, extra = {}) => ({
  scoring, three: 85, pass: 42, defense: 55, rebound: 40, speed: 55, steal: 40, strength: 40,
  threeTend: 95, paintTend: 25, midTend: 30, shotTend: 60, offenseStyle: "stretch", playPos: "SF",
  raw: { ppg: 15, apg: 2.5 }, ...extra,
});
const slasher = (scoring, extra = {}) => ({
  scoring, three: 45, pass: 55, defense: 55, rebound: 30, speed: 85, steal: 50, strength: 40,
  threeTend: 20, paintTend: 70, midTend: 30, shotTend: 60, offenseStyle: "slash", playPos: "PG",
  raw: { ppg: 12, apg: 4 }, ...extra,
});

test("a spot-up shooter who can really score is not a 'defend' role (Rice 81 / Mashburn 68 were starved)", () => {
  for (const scoring of [66, 72, 81]) {
    const o = recommendPlayerOrders(shooter(scoring));
    assert.notEqual(o.usage, "defend", `scoring ${scoring}`);
    assert.equal(o.action, "spot");
    assert.ok(aggressionLevel({ orders: o }) >= 0.25, `scoring ${scoring}: still willing to shoot (level ${aggressionLevel({ orders: o })})`);
  }
});

test("a genuinely low-scoring spot-up piece keeps the defend / low-aggression role", () => {
  const o = recommendPlayerOrders(shooter(55, { defense: 70 }));
  assert.equal(o.usage, "defend");
  assert.equal(o.aggression, "low");
});

test("an elite shooting scorer is still the first option (unchanged)", () => {
  assert.equal(recommendPlayerOrders(shooter(84)).usage, "score");
  assert.equal(recommendPlayerOrders(shooter(84)).aggression, "normal");
});

test("a fast driver who cannot score is a secondary creator, not a score/iso first option (Kidd 55 / Coles 54)", () => {
  const weak = recommendPlayerOrders(slasher(55));
  assert.notEqual(weak.usage, "score");
  assert.notEqual(weak.action, "iso");
  assert.notEqual(weak.aggression, "high");
  const real = recommendPlayerOrders(slasher(82));
  assert.equal(real.usage, "score");
  assert.equal(real.action, "iso");
  assert.equal(real.aggression, "high");
});
