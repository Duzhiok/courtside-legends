/**
 * M2b-0 golden hashes: play 20 seeded whole games on the real engine and hash each event log.
 *
 *   node scripts/sim/golden-hash.mjs global      # seed by swapping Math.random (works on ANY engine version)
 *   node scripts/sim/golden-hash.mjs injected    # seed through GameSim({ rng })        (needs M2b-0)
 *   node scripts/sim/golden-hash.mjs record      # = global, writes tests/fixtures/simGolden.json
 *
 * Even seeds are plain runFast games; odd seeds also poke the interactive entry points (step,
 * callTimeout, shout, talk, substitute, runManagedBreak) so every dice-rolling door is covered.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";

export const GOLDEN_SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
const MATCHUPS = [
  ["CHI", 1996, "SEA", 1996],
  ["LAL", 2001, "SAS", 2003],
  ["GSW", 2016, "CLE", 2016],
  ["BOS", 1986, "HOU", 1986],
];

function playOne(seed, rng) {
  const [h, hy, a, ay] = MATCHUPS[seed % MATCHUPS.length];
  const events = [];
  const opts = { home: realTeam(h, hy), away: realTeam(a, ay), youSide: "home", injuries: seed % 3 === 0, speed: 3 };
  if (rng) opts.rng = rng;
  const sim = new GameSim({ ...opts, onEvent: (e) => events.push(e), onTick: () => {}, onEnd: () => {} });
  sim.running = true;
  if (seed % 2) {
    for (let i = 0; i < 30; i++) sim.step();
    sim.callTimeout("home");
    sim.shout();
    sim.talk();
    const out = sim.home.onCourt[0];
    const inn = sim.home.bench?.[0];
    if (out && inn) sim.substitute(out.id, inn.id, "home");
    sim.runManagedBreak("timeout");
    for (let i = 0; i < 20; i++) sim.step();
  }
  const snap = sim.runFast();
  const text = JSON.stringify({ events, score: snap.score, home: sim.home.players?.map((p) => p.stats), away: sim.away.players?.map((p) => p.stats) });
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function run(mode) {
  const out = {};
  for (const seed of GOLDEN_SEEDS) {
    if (mode === "injected") {
      out[seed] = playOne(seed, seededStream(seed));
    } else {
      const real = Math.random;
      Math.random = seededStream(seed);
      try {
        out[seed] = playOne(seed, null);
      } finally {
        Math.random = real;
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || "global";
  const res = run(mode === "record" ? "global" : mode);
  if (mode === "record") {
    writeFileSync(new URL("../../tests/fixtures/simGolden.json", import.meta.url), JSON.stringify(res, null, 2) + "\n");
    console.log("recorded", Object.keys(res).length);
  } else console.log(JSON.stringify(res));
}
