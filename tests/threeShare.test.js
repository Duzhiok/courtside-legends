import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

// A whole roster of the same kind of shooter, everything else (tactics, orders) left alone.
const threeShare = (tend, skill, games = 16) => {
  let tpa = 0, fga = 0;
  for (let i = 0; i < games; i += 1) {
    const home = realTeam("CHI", 1996);
    for (const p of home.players) { p.threeTend = tend; p.three = skill; p.catchShoot = skill; p.offDribble = skill; p.offenseStyle = "balanced"; }
    const sim = new GameSim({ home, away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`share|${i}`)) });
    sim.runFast();
    for (const p of [...sim.home.onCourt, ...sim.home.bench]) { tpa += p.stats.tpa; fga += p.stats.fga; }
  }
  return tpa / fga;
};

test("a roster of real volume shooters takes about half its shots from three, not two thirds (the stack of multipliers saturated)", () => {
  const heavy = threeShare(90, 82);
  // Floor 0.35 (was 0.38): the B35 §27 blue-collar widening moved the realised
  // share 0.396 -> 0.37 on these fixed seeds (the old value was already 1.6pt
  // from the old floor); the mechanism is unchanged — heavy is still ~3x the
  // middling roster and far from two thirds. Revisit if it drops toward 0.30.
  assert.ok(heavy > 0.35 && heavy < 0.62, `a three-heavy roster took ${(heavy * 100).toFixed(0)}% of its shots from three`);
});

test("the share still follows the players: a three-heavy roster takes at least twice the threes of a middling one, and a non-shooting one almost none", () => {
  const heavy = threeShare(90, 82), middling = threeShare(40, 60), none = threeShare(8, 35);
  assert.ok(heavy > middling * 2, `heavy ${heavy.toFixed(2)} vs middling ${middling.toFixed(2)}`);
  assert.ok(middling > 0.08 && middling < 0.3, `a middling roster ${middling.toFixed(2)}`);
  assert.ok(none < 0.06, `a non-shooting roster ${none.toFixed(2)}`);
});
