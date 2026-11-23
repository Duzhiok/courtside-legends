/**
 * B26: how is the late-game chase pace spent? (docs/implementation/b26-pace-adaptation-design.md)
 * Plays real team-seasons and, after every possession, reads the chase script (`temp.lateChase`) of both sides.
 * Reports: how many chase possessions a game has, the spread of deficit / seconds-per-point of deficit, the pace multiplier the engine used
 * (1.38 flat before B26), and what the final five minutes look like (possessions, trailing team's win rate when it trails by 1-9 at 5:00).
 *   node scripts/measure/late-chase-pace.mjs [games=300] [--json=out.json]
 */
import fs from "node:fs";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";

const args = process.argv.slice(2);
const jsonOut = args.find((a) => a.startsWith("--json="))?.slice(7);
const games = Number(args.find((a) => /^\d+$/.test(a)) || 300);
const TEAMS = [["CHI", 1996], ["SEA", 1996], ["LAL", 2000], ["POR", 2000], ["BOS", 1986], ["LAL", 1986], ["GSW", 2016], ["SAS", 2014], ["MIA", 2014], ["PHI", 2001],
  ["LAL", 2001], ["BOS", 2008], ["LAL", 2008], ["GSW", 2022], ["BOS", 2022], ["DET", 2004], ["DEN", 2009], ["DAL", 2011], ["HOU", 1995], ["NYK", 1994], ["UTA", 1997], ["ORL", 1995]];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

const chase = [], perGame = [], fiveMinPoss = [];
let closeAt5 = 0, trailWon = 0;
for (let g = 0; g < games; g += 1) {
  const [hc, hy] = TEAMS[g % TEAMS.length], [ac, ay] = TEAMS[(g * 7 + 3) % TEAMS.length];
  if (hc === ac && hy === ay) continue;
  const sim = new GameSim({ home: realTeam(hc, hy), away: realTeam(ac, ay), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`chase|${g}`)), onEvent() {}, onTick() {}, onEnd() {} });
  sim.running = true;
  let n = 0, p5 = 0, trailSide = null;
  for (let s = 0; sim.running && s < 2000; s += 1) {
    sim.step(); if (sim.paused) sim.setPaused(false);
    for (const side of [sim.home, sim.away]) {
      const c = side.temp?.lateChase;
      if (c?.paceBoost) { n += 1; chase.push({ deficit: c.deficit, clock: sim.clock, mult: c.paceMult ?? 1.38 }); }
    }
    if (sim.quarter === 4 && sim.clock <= 300) {
      p5 += 1;
      if (trailSide === null) { const d = sim.score.home - sim.score.away; if (Math.abs(d) >= 1 && Math.abs(d) <= 9) { trailSide = d < 0 ? "home" : "away"; closeAt5 += 1; } else trailSide = false; }
    }
  }
  perGame.push(n); fiveMinPoss.push(p5);
  if (trailSide) { const d = sim.score.home - sim.score.away; if ((trailSide === "home" && d > 0) || (trailSide === "away" && d < 0)) trailWon += 1; }
}
const bucket = (lo, hi) => chase.filter((c) => c.deficit >= lo && c.deficit <= hi);
const spp = (c) => c.clock / Math.max(1, c.deficit);
console.log(`${games} games | chase possessions per game ${mean(perGame).toFixed(2)} | possessions in the last 5:00 of Q4 ${mean(fiveMinPoss).toFixed(2)}`);
console.log(`pace multiplier used: mean ${mean(chase.map((c) => c.mult)).toFixed(3)} (min ${Math.min(...chase.map((c) => c.mult)).toFixed(2)}, max ${Math.max(...chase.map((c) => c.mult)).toFixed(2)})`);
console.log(`seconds of clock per point of deficit: mean ${mean(chase.map(spp)).toFixed(1)}`);
for (const [lo, hi] of [[1, 3], [4, 6], [7, 9]]) { const b = bucket(lo, hi); console.log(`  deficit ${lo}-${hi}: ${b.length} possessions, mean clock ${mean(b.map((c) => c.clock)).toFixed(0)}s, sec/pt ${mean(b.map(spp)).toFixed(1)}, mult ${mean(b.map((c) => c.mult)).toFixed(3)}`); }
console.log(`trailing team (1-9 down at 5:00 of Q4) won ${trailWon}/${closeAt5} = ${(100 * trailWon / Math.max(1, closeAt5)).toFixed(1)}%`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ chase, perGame, fiveMinPoss, trailWon, closeAt5 }));
