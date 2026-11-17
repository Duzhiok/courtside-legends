// B35 fix check: fixed-seed league-wide game stats, so a change to the recommended player orders (usage/aggression
// defaults) can be compared before/after. Team totals must stay in a sane band; only the DISTRIBUTION among teammates
// should move. Usage: node scripts/measure/b35-usage-defaults.mjs [year=1995,2005,2016] [games=60]
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
const GAMES = Number(process.argv[3] || 60);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const f = (x, d = 1) => Number(x).toFixed(d);

for (const year of YEARS) {
  if (!PLAYERS.some((p) => p.season === year)) PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
  const teams = historicalSeason(year).teams;
  let pts = 0, fga = 0, fgm = 0, tpa = 0, tpm = 0, fta = 0, tov = 0, n = 0, top = 0, topShare = 0;
  for (let g = 0; g < GAMES; g++) {
    const rng = seededStream(hashSeed(`b35|${year}|${g}`));
    const a = teams[Math.floor(rng() * teams.length)];
    let b = teams[Math.floor(rng() * teams.length)];
    if (b === a) b = teams[(teams.indexOf(a) + 1) % teams.length];
    const sim = new GameSim({ home: buildCpuTeamForYear(year, a, new Set()), away: buildCpuTeamForYear(year, b, new Set()), youSide: "home", injuries: false, speed: 3, rng });
    sim.runFast();
    for (const side of ["home", "away"]) {
      const roster = sim[side].roster;
      const tp = sum(roster.map((p) => p.stats?.pts || 0));
      pts += tp; n++;
      fga += sum(roster.map((p) => p.stats?.fga || 0)); fgm += sum(roster.map((p) => p.stats?.fgm || 0));
      tpa += sum(roster.map((p) => p.stats?.tpa || 0)); tpm += sum(roster.map((p) => p.stats?.tpm || 0));
      fta += sum(roster.map((p) => p.stats?.fta || 0)); tov += sum(roster.map((p) => p.stats?.tov || 0));
      const sorted = [...roster].sort((x, y) => (y.stats?.pts || 0) - (x.stats?.pts || 0));
      topShare += (sorted[0].stats?.pts || 0) / Math.max(1, tp); top += sorted[0].stats?.pts || 0;
    }
  }
  console.log(`${year} · ${n} team-games: pts/team ${f(pts / n)} · FGA ${f(fga / n)} · FG% ${f((fgm / fga) * 100)} · 3PA ${f(tpa / n)} · 3P% ${f((tpm / Math.max(1, tpa)) * 100)} · FTA ${f(fta / n)} · TOV ${f(tov / n)} · top scorer ${f(top / n)} pts (${f((topShare / n) * 100)}% of team)`);
}
