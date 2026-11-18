// B4 measurement: does a team that trails big in the second half now fight back (and not distort the game)?
// Fixed seeds, whole games on the real engine. "Trailing" = down >= DEFICIT at the first tick of the 4th quarter.
// Usage: node scripts/measure/b4-comeback.mjs [years=1995,2005,2016] [games=150] [deficit=15]
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";
import { seasonToCard, PLAYERS } from "../../js/data/players.js";
import { buildCpuTeamForYear } from "../../js/engine/season.js";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { historicalSeason } from "../../js/data/historicalSeasons.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
const YEARS = (process.argv[2] || "1995,2005,2016").split(",").map(Number);
const GAMES = Number(process.argv[3] || 150);
const DEFICIT = Number(process.argv[4] || 15);
const f = (x, d = 1) => Number(x).toFixed(d);
const T = { games: 0, trailing: 0, comebacks: 0, ties: 0, margin: 0, total: 0, shrink: 0 };

for (const year of YEARS) {
  if (!PLAYERS.some((p) => p.season === year)) PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
  const teams = historicalSeason(year).teams;
  for (let g = 0; g < GAMES; g++) {
    const rng = seededStream(hashSeed(`b4|${year}|${g}`));
    const a = teams[Math.floor(rng() * teams.length)];
    let b = teams[Math.floor(rng() * teams.length)];
    if (b === a) b = teams[(teams.indexOf(a) + 1) % teams.length];
    let q4 = null;
    // Some team building still draws from the global Math.random; pin it per game so before/after runs are reproducible.
    Math.random = seededStream(hashSeed(`b4-global|${year}|${g}`));
    const sim = new GameSim({
      home: buildCpuTeamForYear(year, a, new Set()), away: buildCpuTeamForYear(year, b, new Set()),
      youSide: "home", injuries: false, speed: 3, rng,
    });
    // runFast is quiet (no onTick / onEvent) and the engine keeps no line score: note the score as the 4th quarter opens.
    const nextQuarter = sim.nextQuarter.bind(sim);
    sim.nextQuarter = (...args) => {
      const r = nextQuarter(...args);
      if (!q4 && sim.quarter === 4) q4 = { home: sim.score.home, away: sim.score.away };
      return r;
    };
    sim.runFast();
    const end = { home: sim.score.home, away: sim.score.away };
    T.games++; T.total += end.home + end.away; T.margin += Math.abs(end.home - end.away);
    if (!q4) continue;
    const lead = q4.home >= q4.away ? "home" : "away"; const trail = lead === "home" ? "away" : "home";
    const gap = q4[lead] - q4[trail];
    if (gap >= DEFICIT) {
      T.trailing++;
      const endGap = end[lead] - end[trail];
      if (end[trail] > end[lead]) T.comebacks++; else if (end[trail] === end[lead]) T.ties++;
      T.shrink += gap - endGap; // positive = the deficit shrank over the 4th quarter
    }
  }
}
console.log(`games ${T.games} · avg total ${f(T.total / T.games)} · avg final margin ${f(T.margin / T.games)}`);
console.log(`trailing >=${DEFICIT} at the start of Q4: ${T.trailing} games (${f((T.trailing / T.games) * 100)}%) · trailing side won ${T.comebacks} (${f((T.comebacks / Math.max(1, T.trailing)) * 100)}%) · tied after reg ${T.ties} · avg deficit change in Q4 ${f(T.shrink / Math.max(1, T.trailing))} pts`);
