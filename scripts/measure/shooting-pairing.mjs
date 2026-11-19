/**
 * Does the simulator shoot like the players really shoot? Measurement only.
 * Pairs every simulated player's FG% and 3P% with his own real percentages (same season), six eras, paired fixed seeds. Reports the bias overall, by
 * position group, by thirds of the real percentage (an offset moves every third alike; compression lifts the bottom third and drops the top one) and the
 * per-player correlation. Usage: node scripts/measure/shooting-pairing.mjs [gamesPerPair=40]
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
      const r = rows.get(`${year}|${p.id}`) || { p, fgm: 0, fga: 0, tpm: 0, tpa: 0 };
      r.fgm += p.stats.fgm; r.fga += p.stats.fga; r.tpm += p.stats.tpm; r.tpa += p.stats.tpa;
      rows.set(`${year}|${p.id}`, r);
    }
  }
}
const pearson = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
for (const [name, made, att, realOf, minAtt] of [["FG%", "fgm", "fga", (r) => r.p.raw.fg, 200], ["3P%", "tpm", "tpa", (r) => r.p.raw.tp, 60]]) {
  const used = [...rows.values()].filter((r) => r[att] >= minAtt && realOf(r) > 0 && (r.p.raw.mpg || 0) >= 15);
  const line = (label, list) => {
    const a = list.reduce((s, r) => s + r[att], 0);
    const sim = list.reduce((s, r) => s + r[made], 0) / a, real = list.reduce((s, r) => s + realOf(r) * r[att], 0) / a;
    return `  ${label.padEnd(18)} n=${String(list.length).padStart(3)}  sim ${(sim * 100).toFixed(1)}  real ${(real * 100).toFixed(1)}  diff ${((sim - real) * 100).toFixed(1)}`;
  };
  console.log(`\n${name}, ${used.length} players:`);
  console.log(line("everyone", used));
  for (const g of ["guard", "wing", "big"]) console.log(line(g, used.filter((r) => GROUP(r.p.pos) === g)));
  const sorted = used.map(realOf).sort((x, y) => x - y);
  const cut = [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
  console.log(line(`real < ${(cut[0] * 100).toFixed(0)}%`, used.filter((r) => realOf(r) < cut[0])));
  console.log(line("real middle", used.filter((r) => realOf(r) >= cut[0] && realOf(r) < cut[1])));
  console.log(line(`real >= ${(cut[1] * 100).toFixed(0)}%`, used.filter((r) => realOf(r) >= cut[1])));
  console.log(`  correlation, sim vs real per player: ${pearson(used.map((r) => r[made] / r[att]), used.map(realOf)).toFixed(2)}`);
}
