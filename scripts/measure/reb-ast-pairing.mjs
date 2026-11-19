/**
 * Does the simulator give rebounds, assists and shots (B35: who takes them) to the right players? Measurement only.
 * Pairs every player's simulated rebounds / assists per 36 minutes with his own real rpg / apg per 36 (same season), six eras, paired fixed seeds.
 * Reports sim/real by position group, by thirds of the real rate, the per-player correlation, and the team offensive-rebound share.
 * Usage: node scripts/measure/reb-ast-pairing.mjs [gamesPerPair=40]
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2] || 40);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const GROUP = (pos) => (["PG", "SG"].includes(pos) ? "guard" : pos === "SF" ? "wing" : "big");
const rows = new Map();
let orb = 0, drb = 0, games = 0, miss = 0, ftMiss = 0;
for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const sim = new GameSim({ home: i % 2 ? realTeam(a, year) : realTeam(b, year), away: i % 2 ? realTeam(b, year) : realTeam(a, year), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`cal|${year}|${i}`)) });
    sim.runFast();
    games += 1;
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) {
      orb += p.stats.oreb || 0; drb += p.stats.dreb || 0; miss += p.stats.fga - p.stats.fgm; ftMiss += p.stats.fta - p.stats.ftm;
      if (!(p.stats.min > 0)) continue;
      const r = rows.get(`${year}|${p.id}`) || { p, min: 0, reb: 0, ast: 0, fga: 0, pts: 0 };
      r.min += p.stats.min; r.reb += p.stats.reb; r.ast += p.stats.ast; r.fga += p.stats.fga; r.pts += p.stats.pts;
      rows.set(`${year}|${p.id}`, r);
    }
  }
}
const used = [...rows.values()].filter((r) => r.min >= 15 * N && (r.p.raw?.mpg || 0) >= 15);
const pearson = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
for (const [name, simKey, rate] of [["REBOUNDS", "reb", (r) => (r.p.raw.rpg / r.p.raw.mpg) * 36], ["ASSISTS", "ast", (r) => (r.p.raw.apg / r.p.raw.mpg) * 36], ["SHOTS (FGA)", "fga", (r) => (r.p.raw.fga / r.p.raw.mpg) * 36], ["POINTS", "pts", (r) => (r.p.raw.ppg / r.p.raw.mpg) * 36]]) {
  const line = (label, list) => {
    const m = list.reduce((s, r) => s + r.min, 0);
    const sim = list.reduce((s, r) => s + r[simKey], 0) / m * 36, real = list.reduce((s, r) => s + rate(r) * r.min, 0) / m;
    return `  ${label.padEnd(18)} n=${String(list.length).padStart(3)}  sim ${sim.toFixed(2)}  real ${real.toFixed(2)}  ratio ${(sim / real).toFixed(2)}`;
  };
  console.log(`\n${name} per 36 minutes, ${used.length} players:`);
  console.log(line("everyone", used));
  for (const g of ["guard", "wing", "big"]) console.log(line(g, used.filter((r) => GROUP(r.p.pos) === g)));
  const sorted = used.map(rate).sort((x, y) => x - y);
  const cut = [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
  console.log(line(`real < ${cut[0].toFixed(1)}`, used.filter((r) => rate(r) < cut[0])));
  console.log(line("real middle", used.filter((r) => rate(r) >= cut[0] && rate(r) < cut[1])));
  console.log(line(`real >= ${cut[1].toFixed(1)}`, used.filter((r) => rate(r) >= cut[1])));
  console.log(`  correlation, sim vs real per player: ${pearson(used.map((r) => r[simKey] / r.min * 36), used.map(rate)).toFixed(2)}`);
}
console.log(`\nMissed field goals per team-game ${(miss / games / 2).toFixed(1)}, missed free throws ${(ftMiss / games / 2).toFixed(1)}, rebounds credited ${((orb + drb) / games / 2).toFixed(1)}`);
console.log(`Team rebounds per team-game: offensive ${(orb / games / 2).toFixed(1)}, defensive ${(drb / games / 2).toFixed(1)}  (offensive share of all ${(orb / (orb + drb) * 100).toFixed(1)}%)`);
