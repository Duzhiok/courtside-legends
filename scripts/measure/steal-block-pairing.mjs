/**
 * Does the simulator give steals and blocks to the RIGHT players? Measurement only.
 * Pairs every player's simulated steals / blocks per 36 minutes with his own real spg / bpg per 36 (same season), across six eras, and reports the
 * ratio sim / real by position group and by the player's own steal / block rating band. A flat attribute curve shows up as ratios far above 1 in
 * the low bands and near or below 1 in the high bands.
 * Usage: node scripts/measure/steal-block-pairing.mjs [gamesPerPair=40]
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2] || 40);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const GROUP = (pos) => (["PG", "SG"].includes(pos) ? "guard" : pos === "SF" ? "wing" : "big");
const rows = new Map();
for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const sim = new GameSim({ home: i % 2 ? realTeam(a, year) : realTeam(b, year), away: i % 2 ? realTeam(b, year) : realTeam(a, year), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`cal|${year}|${i}`)) });
    sim.runFast();
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) {
      if (!(p.stats.min > 0)) continue;
      const r = rows.get(`${year}|${p.id}`) || { p, min: 0, stl: 0, blk: 0 };
      r.min += p.stats.min; r.stl += p.stats.stl; r.blk += p.stats.blk;
      rows.set(`${year}|${p.id}`, r);
    }
  }
}
const used = [...rows.values()].filter((r) => r.min >= 15 * N && (r.p.raw?.mpg || 0) >= 15);
const sum = (list, f) => list.reduce((s, r) => s + f(r), 0);
const line = (label, list, simF, realF, attrF) => {
  const m = sum(list, (r) => r.min);
  const sim = sum(list, simF) / m * 36, real = sum(list, (r) => realF(r) * r.min) / m;
  return `  ${label.padEnd(14)} n=${String(list.length).padStart(3)}  sim ${sim.toFixed(2)}  real ${real.toFixed(2)}  ratio ${(sim / real).toFixed(2)}${attrF ? `  mean rating ${(sum(list, (r) => attrF(r) * r.min) / m).toFixed(0)}` : ""}`;
};
const BANDS = { steal: [[0, 40], [40, 55], [55, 70], [70, 101]], block: [[0, 35], [35, 50], [50, 65], [65, 80], [80, 101]] };
for (const [name, simF, realF, attrF, field] of [["STEALS", (r) => r.stl, (r) => (r.p.raw.spg / r.p.raw.mpg) * 36, (r) => r.p.steal ?? 50, "steal"], ["BLOCKS", (r) => r.blk, (r) => (r.p.raw.bpg / r.p.raw.mpg) * 36, (r) => r.p.block ?? 40, "block"]]) {
  console.log(`\n${name} per 36 minutes, ${used.length} players with real minutes:`);
  for (const g of ["guard", "wing", "big"]) console.log(line(g, used.filter((r) => GROUP(r.p.pos) === g), simF, realF, attrF));
  for (const [lo, hi] of BANDS[field]) console.log(line(`${field} ${lo}-${hi - 1}`, used.filter((r) => { const a = attrF(r); return a >= lo && a < hi; }), simF, realF));
}
