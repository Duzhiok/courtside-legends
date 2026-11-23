/**
 * B26: does the "push" tempo cost / pay the same for every lineup? (docs/implementation/b26-pace-adaptation-design.md)
 * 22 real team-seasons, each plays the NEXT team of the list; same seeds, only the home side's tempo changes (normal vs push).
 * Reports the NET effect of pushing (margin, turnovers, shots) against the lineup's running score (average speed of the five who start).
 *   node scripts/measure/push-tempo-by-lineup.mjs [games=40] [--json=out.json] [--teams=LAL1986,CHI1996,...]  (only those as the home side; 40 games per team cannot resolve
 *   a 2-point gap between thirds - the noise of a third is about 1.1 and a changed engine reshuffles every seed - so check a spread with a few teams x 150 games)
 */
import fs from "node:fs";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";

const args = process.argv.slice(2);
const jsonOut = args.find((a) => a.startsWith("--json="))?.slice(7);
const games = Number(args.find((a) => /^\d+$/.test(a)) || 40);
const TEAMS = [["CHI", 1996], ["SEA", 1996], ["LAL", 2000], ["POR", 2000], ["BOS", 1986], ["LAL", 1986], ["GSW", 2016], ["SAS", 2014], ["MIA", 2014], ["PHI", 2001],
  ["LAL", 2001], ["BOS", 2008], ["LAL", 2008], ["GSW", 2022], ["BOS", 2022], ["DET", 2004], ["DEN", 2009], ["DAL", 2011], ["HOU", 1995], ["NYK", 1994], ["UTA", 1997], ["ORL", 1995]];
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

function play(i, tempo, g) {
  const [hc, hy] = TEAMS[i], [ac, ay] = TEAMS[(i + 1) % TEAMS.length];
  const home = realTeam(hc, hy);
  home.gameplan = { ...(home.gameplan || {}), tempo };
  const sim = new GameSim({ home, away: realTeam(ac, ay), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`push|${hc}${hy}|${g}`)), onEvent() {}, onTick() {}, onEnd() {} });
  sim.running = true;
  for (let n = 0; sim.running && n < 2000; n += 1) { sim.step(); if (sim.paused) sim.setPaused(false); }
  const sum = (k) => sim.home.roster.reduce((a, p) => a + (p.stats[k] || 0), 0);
  const poss = sum("fga") + 0.44 * sum("fta") + sum("tov") - sum("oreb");
  return { margin: sim.score.home - sim.score.away, pts: sim.score.home, tov: sum("tov"), fga: sum("fga"), poss, runs: avg(sim.home.onCourt.map((p) => p.speed ?? 50)) };
}

const rows = [];
const only = args.find((a) => a.startsWith("--teams="))?.slice(8).split(",");
for (let i = 0; i < TEAMS.length; i += 1) {
  if (only && !only.includes(TEAMS[i].join(""))) continue;
  const a = { margin: 0, pts: 0, tov: 0, fga: 0, poss: 0 }, b = { ...a };
  let speed = 0;
  for (let g = 0; g < games; g += 1) {
    const n = play(i, "normal", g), p = play(i, "push", g);
    for (const k of Object.keys(a)) { a[k] += n[k] / games; b[k] += p[k] / games; }
    speed += n.runs / games;
  }
  rows.push({ team: TEAMS[i].join(" "), speed, dMargin: b.margin - a.margin, dPts: b.pts - a.pts, dTov: b.tov - a.tov, dPoss: b.poss - a.poss, dFga: b.fga - a.fga });
}
rows.sort((x, y) => x.speed - y.speed);
console.log("team".padEnd(10), "avgSpeed", "Δmargin", "Δpts", "Δtov", "Δposs", "Δfga");
for (const r of rows) console.log(r.team.padEnd(10), r.speed.toFixed(1).padStart(8), r.dMargin.toFixed(1).padStart(7), r.dPts.toFixed(1).padStart(5), r.dTov.toFixed(1).padStart(5), r.dPoss.toFixed(1).padStart(6), r.dFga.toFixed(1).padStart(5));
const mx = avg(rows.map((r) => r.speed)), my = avg(rows.map((r) => r.dMargin));
const slope = rows.reduce((s, r) => s + (r.speed - mx) * (r.dMargin - my), 0) / rows.reduce((s, r) => s + (r.speed - mx) ** 2, 0);
const third = Math.max(1, Math.floor(rows.length / 3));
console.log(`\nmean Δmargin ${my.toFixed(2)} | slowest third ${avg(rows.slice(0, third).map((r) => r.dMargin)).toFixed(2)} | fastest third ${avg(rows.slice(-third).map((r) => r.dMargin)).toFixed(2)} | slope ${slope.toFixed(3)} margin per speed point`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ rows, mean: my, slope }, null, 1));
