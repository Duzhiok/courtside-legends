import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

// A whole roster of the same kind of shooter, everything else (tactics, orders) left alone.
// The raw override keeps the synthetic players consistent: since the B35 §30 anchor blends
// the three share toward each player's real 3PA share, forcing threeTend/skill alone no
// longer builds a three-heavy roster — the roster's real history would drag it back to
// ~0.25 (CHI 1996's real average). So the intended profile is set in raw too (fga/tpa
// only; gp/mpg/ft/ppg stay the real card's, so pace/foul/gameplan reads are unchanged).
const threeShare = (tend, skill, rawShare, games = 16) => {
  let tpa = 0, fga = 0;
  for (let i = 0; i < games; i += 1) {
    const home = realTeam("CHI", 1996);
    for (const p of home.players) { p.threeTend = tend; p.three = skill; p.catchShoot = skill; p.offDribble = skill; p.offenseStyle = "balanced"; p.raw = { ...p.raw, fga: 100, tpa: Math.round(100 * rawShare) }; }
    const sim = new GameSim({ home, away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`share|${i}`)) });
    sim.runFast();
    for (const p of [...sim.home.onCourt, ...sim.home.bench]) { tpa += p.stats.tpa; fga += p.stats.fga; }
  }
  return tpa / fga;
};

test("a roster of real volume shooters takes about half its shots from three, not two thirds (the stack of multipliers saturated)", () => {
  const heavy = threeShare(90, 82, 0.55);
  // Floor 0.35: the B35 §30 anchor ties the share to the roster's real history, so a
  // tend-only override can no longer fake a heavy roster — the profile now lives in
  // raw as well. Heavy is still ~2x the middling roster and far from two thirds.
  // Revisit if it drops toward 0.30.
  assert.ok(heavy > 0.35 && heavy < 0.62, `a three-heavy roster took ${(heavy * 100).toFixed(0)}% of its shots from three`);
});

test("the share still follows the players: a three-heavy roster takes at least twice the threes of a middling one, and a non-shooting one almost none", () => {
  const heavy = threeShare(90, 82, 0.55), middling = threeShare(40, 60, 0.25), none = threeShare(8, 35, 0.02);
  assert.ok(heavy > middling * 2, `heavy ${heavy.toFixed(2)} vs middling ${middling.toFixed(2)}`);
  assert.ok(middling > 0.08 && middling < 0.3, `a middling roster ${middling.toFixed(2)}`);
  assert.ok(none < 0.06, `a non-shooting roster ${none.toFixed(2)}`);
});
