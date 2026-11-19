/**
 * Does the simulator turn a player's REAL turnover habit into a plausible one? Measurement only.
 * Pairs every player's simulated turnovers per 36 min with his own real tpg per 36 (same season), across eras, and reports the correlation, the
 * mean sim/real ratio by real-turnover band and by position group, and how the attributes that drive turnovers (pass, handle, composure) relate to it.
 * Usage: node scripts/measure/tov-player-pairing.mjs [gamesPerPair=40]
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2] || 40);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const GROUP = (pos) => (["PG", "SG"].includes(pos) ? "guard" : pos === "SF" ? "wing" : "big");
const acc = new Map();
for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const A = realTeam(a, year), B = realTeam(b, year);
    const sim = new GameSim({ home: i % 2 ? A : B, away: i % 2 ? B : A, youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`cal|${year}|${i}`)) });
    sim.runFast();
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) {
      if (!(p.stats.min > 0)) continue;
      const k = `${year}|${p.id}`;
      const r = acc.get(k) || { year, p, min: 0, tov: 0, ast: 0 };
      r.min += p.stats.min; r.tov += p.stats.tov; r.ast += p.stats.ast;
      acc.set(k, r);
    }
  }
}
const rows = [...acc.values()].filter((r) => r.min >= 15 * N && (r.p.raw?.mpg || 0) >= 15).map((r) => ({
  year: r.year, pos: r.p.pos, pass: r.p.pass, handle: r.p.handle,
  simTov36: (r.tov / r.min) * 36, realTov36: (r.p.raw.tpg / r.p.raw.mpg) * 36, simAst36: (r.ast / r.min) * 36, realAst36: (r.p.raw.apg / r.p.raw.mpg) * 36,
}));
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const corr = (xs, ys) => { const mx = mean(xs), my = mean(ys); let sxy = 0, sx = 0, sy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sx += (x - mx) ** 2; sy += (ys[i] - my) ** 2; }); return sxy / Math.sqrt(sx * sy); };
console.log(`${rows.length} players with real minutes, ${N} games per matchup`);
console.log(`mean TOV/36: sim ${mean(rows.map((r) => r.simTov36)).toFixed(2)}  real ${mean(rows.map((r) => r.realTov36)).toFixed(2)}`);
console.log(`correlation sim vs real TOV/36: ${corr(rows.map((r) => r.simTov36), rows.map((r) => r.realTov36)).toFixed(2)}   (assists/36 for reference: ${corr(rows.map((r) => r.simAst36), rows.map((r) => r.realAst36)).toFixed(2)})`);
console.log(`correlation sim TOV/36 with pass rating: ${corr(rows.map((r) => r.simTov36), rows.map((r) => r.pass)).toFixed(2)};  real TOV/36 with pass rating: ${corr(rows.map((r) => r.realTov36), rows.map((r) => r.pass)).toFixed(2)}`);
console.log("\nby real turnover band (per 36): sim | real  (n)");
for (const [lo, hi] of [[0, 1.2], [1.2, 1.8], [1.8, 2.4], [2.4, 3.2], [3.2, 9]]) {
  const s = rows.filter((r) => r.realTov36 >= lo && r.realTov36 < hi);
  console.log(`  ${lo}-${hi}: ${mean(s.map((r) => r.simTov36)).toFixed(2)} | ${mean(s.map((r) => r.realTov36)).toFixed(2)}  (${s.length})`);
}
console.log("\nby position group: sim | real");
for (const g of ["guard", "wing", "big"]) { const s = rows.filter((r) => GROUP(r.pos) === g); console.log(`  ${g}: ${mean(s.map((r) => r.simTov36)).toFixed(2)} | ${mean(s.map((r) => r.realTov36)).toFixed(2)}  (${s.length})`); }
console.log("\nby era: sim | real");
for (const y of [1986, 1996, 2001, 2008, 2014, 2022]) { const s = rows.filter((r) => r.year === y); console.log(`  ${y}: ${mean(s.map((r) => r.simTov36)).toFixed(2)} | ${mean(s.map((r) => r.realTov36)).toFixed(2)}  (${s.length})`); }
