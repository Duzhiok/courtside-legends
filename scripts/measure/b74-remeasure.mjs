/**
 * B74 re-measurement: FGA/36 by position group on the FIXED sim, plus the
 * 3PA share of bigs (mix proxy for the wPaint double-count check) and team
 * points per team-game. Same pairs, seeds, filters and yardstick as
 * scripts/measure/reb-ast-pairing.mjs (N=20 default = 120 games, the same
 * seeds the pre-fix ablation used), so baseline vs ablation is paired.
 * Usage: node scripts/measure/b74-remeasure.mjs [gamesPerPair=20]
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2] || 20);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const GROUP = (pos) => (["PG", "SG"].includes(pos) ? "guard" : pos === "SF" ? "wing" : "big");
const rows = new Map();
let games = 0;
let teamPts = 0;
for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const sim = new GameSim({ home: i % 2 ? realTeam(a, year) : realTeam(b, year), away: i % 2 ? realTeam(b, year) : realTeam(a, year), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`cal|${year}|${i}`)) });
    sim.runFast();
    games += 1;
    teamPts += (sim.score?.home || 0) + (sim.score?.away || 0);
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) {
      if (!(p.stats.min > 0)) continue;
      const r = rows.get(`${year}|${p.id}`) || { p, min: 0, fga: 0, tpa: 0 };
      r.min += p.stats.min; r.fga += p.stats.fga; r.tpa += p.stats.tpa || 0;
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
const rate = (r) => (r.p.raw.fga / r.p.raw.mpg) * 36;
const line = (label, list) => {
  const m = list.reduce((s, r) => s + r.min, 0);
  const sim = list.reduce((s, r) => s + r.fga, 0) / m * 36, real = list.reduce((s, r) => s + rate(r) * r.min, 0) / m;
  const tpaShare = list.reduce((s, r) => s + r.tpa, 0) / Math.max(1, list.reduce((s, r) => s + r.fga, 0));
  return `  ${label.padEnd(10)} n=${String(list.length).padStart(3)}  FGA/36 sim ${sim.toFixed(2)} real ${real.toFixed(2)} ratio ${(sim / real).toFixed(2)}  3PA/FGA ${tpaShare.toFixed(2)}`;
};
console.log(`B74 re-measure, ${games} games (${used.length} players, min>=${15 * N}):`);
for (const g of ["guard", "wing", "big"]) console.log(line(g, used.filter((r) => GROUP(r.p.pos) === g)));
console.log(line("everyone", used));
console.log(`  corr sim vs real per player: ${pearson(used.map((r) => r.fga / r.min * 36), used.map(rate)).toFixed(2)}`);
console.log(`  team pts per team-game: ${(teamPts / games / 2).toFixed(1)}`);
