import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

// Give every player of one team the same real three-point percentage and see what the game does with it. Only threeFg / raw.tp are changed (the
// skill ratings stay those of the real roster), so the absolute level is not the point: the SPREAD between a poor and a good shooting roster is.
// Before the calibration a 30% roster shot 51.9% and a 42% roster 51.4%: the 45% ceiling decided everything.
const threePctFor = (pct, games = 24) => {
  let made = 0, att = 0;
  for (let i = 0; i < games; i += 1) {
    const home = realTeam("GSW", 2016);
    for (const p of home.players) { p.threeFg = pct; if (p.raw) p.raw.tp = pct; }
    const sim = new GameSim({ home, away: realTeam("SAS", 2016), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`three|${i}`)) });
    sim.runFast();
    for (const p of [...sim.home.onCourt, ...sim.home.bench]) { made += p.stats.tpm; att += p.stats.tpa; }
  }
  return made / att;
};

test("the three-point percentage follows the shooters' real percentage instead of piling up at the ceiling", () => {
  const poor = threePctFor(0.3), good = threePctFor(0.42);
  assert.ok(good - poor >= 0.05, `a 30% team shot ${(poor * 100).toFixed(1)}%, a 42% team shot ${(good * 100).toFixed(1)}%`);
});
