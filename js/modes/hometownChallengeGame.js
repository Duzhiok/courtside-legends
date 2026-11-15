/**
 * Hometown Challenge game runner (ADR-009 H4, M4-B): play one challenge
 * game on the EXISTING GameSim — no second simulator, no rule changes.
 *
 * Moved here from js/data/hometown/hometownChallenge.js (A-P1-3, 2026-11-15):
 * the data layer must not import the engine. The lineup building stays in
 * js/data/hometown/hometownChallenge.js (buildChallengeTeam,
 * pickOpponentTeam); this module only drives the game. Pure result,
 * nothing is saved here.
 */
import { GameSim } from "../engine/sim.js";
import { seededStream } from "../core/seededRandom.js";

/** Play one challenge game on the existing GameSim with a seeded rng. Pure result, nothing is saved here. */
export function playChallengeGame({ home, away, seed = 1, maxSteps = 4000 } = {}) {
  let ended = null;
  const sim = new GameSim({
    home, away, youSide: "home", injuries: false, speed: 3,
    rng: seededStream(seed),
    onEvent: () => {},
    onTick: () => {},
    onEnd: (snap) => { ended = snap; },
  });
  sim.autoRotation = true;
  sim.running = true;
  let steps = 0;
  while (sim.running && steps < maxSteps) {
    sim.step();
    steps += 1;
    if (sim.paused) sim.setPaused(false);
  }
  const snap = ended || sim.snapshot();
  const homeScore = snap.score?.home ?? 0;
  const awayScore = snap.score?.away ?? 0;
  return { homeScore, awayScore, won: homeScore > awayScore, steps };
}
