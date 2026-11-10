// Fixed-seed A/B for the coach tactical comeback challenge (workstream B).
// Same Q4, same seed, four arms: baseline (raw engine, no player decisions)
// vs each opening defensive system, with a FIXED follow-up policy (always
// the first available choice at later moments) so the only difference is
// the opening choice. The RNG stream is identical per seed; any gap is the
// engine's own consumption of the choice — no new dice anywhere.
// Usage: node scripts/measure/coach-tactics-ab.mjs [seeds] [startSeed]
import { seededStream } from "../../js/core/seededRandom.js";
import { CLUTCH_POOL } from "../../tests/helpers/clutchSim.js";
import { startClutchSim } from "../../js/engine/clutchController.js";
import { buildClutchTeams } from "../../js/engine/clutchController.js";
import { createCoachingChallenge, COACH_COMEBACK_SCENARIO } from "../../js/career/coach/coachingChallenge.js";

const SEEDS = Number(process.argv[2] || 40);
const START = Number(process.argv[3] || 1);
const OPENINGS = ["switch_all", "zone_drop", "pack_paint"];

function baseline(seed) {
  const { home, away } = buildClutchTeams(CLUTCH_POOL, COACH_COMEBACK_SCENARIO);
  const sim = startClutchSim(
    { ...COACH_COMEBACK_SCENARIO, home, away },
    { rng: seededStream(seed), onEvent() {}, onTick() {}, onEnd() {} },
  );
  const snap = sim.runFast();
  return { margin: snap.score.home - snap.score.away, won: snap.score.home > snap.score.away };
}

function arm(seed, opening) {
  const c = createCoachingChallenge({ pool: CLUTCH_POOL, rng: seededStream(seed) });
  c.start();
  c.choose(opening);
  let guard = 0;
  while (c.state !== "ended" && guard < 40) {
    const res = c.playChunk(8);
    if (res.status === "moment") {
      const choice = res.moment.choices.find((x) => !x.disabled) || res.moment.choices[0];
      c.choose(choice.id);
    } else if (res.status === "ended") {
      return res.report;
    }
    guard += 1;
  }
  return c.finish().report;
}

const rows = { baseline: [], switch_all: [], zone_drop: [], pack_paint: [] };
const openingSwings = { switch_all: [], zone_drop: [], pack_paint: [] };
for (let s = START; s < START + SEEDS; s += 1) {
  const b = baseline(s);
  rows.baseline.push(b);
  for (const opening of OPENINGS) {
    const r = arm(s, opening);
    rows[opening].push({ margin: r.final.home - r.final.away, won: r.won });
    if (r.decisions[0]) openingSwings[opening].push(r.decisions[0].swing);
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`coach-tactics A/B — ${SEEDS} seeds (${START}..${START + SEEDS - 1}), Q4 down 10, fixed follow-up policy (first available choice)`);
console.log("arm           win%   mean margin  mean opening swing");
for (const name of ["baseline", ...OPENINGS]) {
  const rs = rows[name];
  const win = (rs.filter((r) => r.won).length / rs.length) * 100;
  const mg = mean(rs.map((r) => r.margin)).toFixed(2);
  const sw = openingSwings[name] ? mean(openingSwings[name]).toFixed(2) : "—";
  console.log(`${name.padEnd(13)} ${win.toFixed(1).padStart(5)}%  ${mg.padStart(11)}  ${String(sw).padStart(10)}`);
}
console.log("Baseline = raw engine, no player decisions. Arms differ ONLY in the opening defensive system.");
