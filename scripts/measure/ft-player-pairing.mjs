/**
 * Does the simulator give free throws to the right players? Measurement only.
 * The cards have ppg, fg%, fga, 3p%, 3pa and ft%, so a player's real free throws per game follow:
 *   FTM = ppg - 2 x FGM - 3PM,  FTA = FTM / ft%.
 * Pairs every simulated player's FTA per shot (FTA / FGA) with his own real rate (same season), six eras, paired fixed seeds.
 * Usage: node scripts/measure/ft-player-pairing.mjs [gamesPerPair=40]
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2] || 40);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const GROUP = (pos) => (["PG", "SG"].includes(pos) ? "guard" : pos === "SF" ? "wing" : "big");
const realFtr = (raw) => {
  if (!(raw?.fga > 0) || !(raw.ft > 0.3)) return null;
  const fgm = raw.fg * raw.fga, tpm = (raw.tp || 0) * (raw.tpa || 0);
  const ftm = raw.ppg - 2 * fgm - tpm;
  return ftm > 0 ? ftm / raw.ft / raw.fga : null;
};
const rows = new Map();
for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const sim = new GameSim({ home: i % 2 ? realTeam(a, year) : realTeam(b, year), away: i % 2 ? realTeam(b, year) : realTeam(a, year), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`cal|${year}|${i}`)) });
    sim.runFast();
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) {
      if (!(p.stats.min > 0)) continue;
      const r = rows.get(`${year}|${p.id}`) || { p, min: 0, fga: 0, fta: 0 };
      r.min += p.stats.min; r.fga += p.stats.fga; r.fta += p.stats.fta;
      rows.set(`${year}|${p.id}`, r);
    }
  }
}
const used = [...rows.values()].filter((r) => r.fga >= 100 && realFtr(r.p.raw) != null && (r.p.raw.mpg || 0) >= 15);
const pearson = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
const line = (label, list) => {
  const fga = list.reduce((s, r) => s + r.fga, 0);
  const sim = list.reduce((s, r) => s + r.fta, 0) / fga;
  const real = list.reduce((s, r) => s + realFtr(r.p.raw) * r.fga, 0) / fga;
  return `  ${label.padEnd(16)} n=${String(list.length).padStart(3)}  sim FTA/FGA ${sim.toFixed(3)}  real ${real.toFixed(3)}  ratio ${(sim / real).toFixed(2)}`;
};
console.log(`FREE-THROW RATE (FTA per FGA), ${used.length} players with real shots and minutes:`);
console.log(line("everyone", used));
for (const g of ["guard", "wing", "big"]) console.log(line(g, used.filter((r) => GROUP(r.p.pos) === g)));
const sorted = used.map((r) => realFtr(r.p.raw)).sort((x, y) => x - y);
const cut = [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
console.log(line(`real rate < ${cut[0].toFixed(2)}`, used.filter((r) => realFtr(r.p.raw) < cut[0])));
console.log(line("real rate middle", used.filter((r) => realFtr(r.p.raw) >= cut[0] && realFtr(r.p.raw) < cut[1])));
console.log(line(`real rate >= ${cut[1].toFixed(2)}`, used.filter((r) => realFtr(r.p.raw) >= cut[1])));
console.log(`  correlation, simulated vs real FTA/FGA per player: ${pearson(used.map((r) => r.fta / r.fga), used.map((r) => realFtr(r.p.raw))).toFixed(2)}`);
