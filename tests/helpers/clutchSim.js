/** Seeded clutch-scenario sims for the M2b-2 tests (real 2016 GSW / CLE cards). */
import { readFileSync } from "node:fs";
import { seasonToCard } from "../../js/data/players.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { initializeScenario, startClutchSim } from "../../js/engine/clutchController.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
export const CLUTCH_POOL = ROWS.map(seasonToCard);

/** A seeded GameSim in the default clutch scenario (GSW16 vs CLE16, down 3, 12s). */
export function buildClutchSim(seed, overrides = {}) {
  const scenario = initializeScenario({ pool: CLUTCH_POOL, ...overrides });
  const sim = startClutchSim(scenario, {
    rng: seededStream(seed),
    onEvent() {},
    onTick() {},
    onEnd() {},
  });
  return { sim, scenario };
}

/** An on-court player who is NOT the one the late-game script would pick. */
export function otherThanClutch(seed) {
  const { sim } = buildClutchSim(seed);
  sim.step();
  const scriptId = sim.home.temp?.lateChase?.shooterId;
  return sim.home.onCourt.find((p) => p.id !== scriptId) || sim.home.onCourt[0];
}
