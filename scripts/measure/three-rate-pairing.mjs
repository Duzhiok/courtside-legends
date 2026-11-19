/**
 * Does the simulator take threes the way each player really does? Measurement only.
 * Pairs every simulated player's three-point share of his shots (3PA / FGA) with his own real share (same season), six eras, paired fixed seeds.
 * Reports sim vs real by thirds of the real share, by position group and by era, and the per-player correlation.
 * Usage: node scripts/measure/three-rate-pairing.mjs [gamesPerPair=40]
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
      const r = rows.get(`${year}|${p.id}`) || { p, year, fga: 0, tpa: 0 };
      r.fga += p.stats.fga; r.tpa += p.stats.tpa;
      rows.set(`${year}|${p.id}`, r);
    }
  }
}
const realShare = (r) => (r.p.raw.fga > 0 ? (r.p.raw.tpa || 0) / r.p.raw.fga : null);
const used = [...rows.values()].filter((r) => r.fga >= 150 && realShare(r) != null && (r.p.raw.mpg || 0) >= 15);
const pearson = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
const line = (label, list) => {
  const fga = list.reduce((s, r) => s + r.fga, 0);
  const sim = list.reduce((s, r) => s + r.tpa, 0) / fga, real = list.reduce((s, r) => s + realShare(r) * r.fga, 0) / fga;
  return `  ${label.padEnd(18)} n=${String(list.length).padStart(3)}  sim ${(sim * 100).toFixed(1)}%  real ${(real * 100).toFixed(1)}%  ratio ${(sim / Math.max(real, 1e-9)).toFixed(2)}`;
};
console.log(`THREE-POINT SHARE OF SHOTS (3PA / FGA), ${used.length} players:`);
console.log(line("everyone", used));
for (const g of ["guard", "wing", "big"]) console.log(line(g, used.filter((r) => GROUP(r.p.pos) === g)));
for (const y of [1986, 1996, 2001, 2008, 2014, 2022]) console.log(line(String(y), used.filter((r) => r.year === y)));
const sorted = used.map(realShare).sort((x, y) => x - y);
const cut = [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
console.log(line(`real < ${(cut[0] * 100).toFixed(0)}%`, used.filter((r) => realShare(r) < cut[0])));
console.log(line("real middle", used.filter((r) => realShare(r) >= cut[0] && realShare(r) < cut[1])));
console.log(line(`real >= ${(cut[1] * 100).toFixed(0)}%`, used.filter((r) => realShare(r) >= cut[1])));
console.log(`  correlation, sim vs real per player: ${pearson(used.map((r) => r.tpa / r.fga), used.map(realShare)).toFixed(2)}`);
