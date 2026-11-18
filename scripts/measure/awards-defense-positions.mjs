// All-Defense composition on real simulated seasons: how many centres / guards make the two teams, before (plain
// top-10 of the DPOY score) and after (one per position). Usage: node scripts/measure/awards-defense-positions.mjs [games=30]
import { readFileSync } from "node:fs";
import { seasonToCard, PLAYERS } from "../../js/data/players.js";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { createSeason, buildCpuTeamForYear, simScheduledGame, computeAwards } from "../../js/engine/season.js";
import { historicalSeason } from "../../js/data/historicalSeasons.js";
import { normalizePos } from "../../js/data/positions.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
const GAMES = Number(process.argv[2] || 30);
const tally = () => ({ PG: 0, SG: 0, SF: 0, PF: 0, C: 0 });
const after = tally(); const before = tally();

for (const year of [1996, 2004, 2016, 2023]) {
  if (!PLAYERS.some((p) => p.season === year)) PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
  const real = Math.random; Math.random = seededStream(year);
  try {
    const hist = historicalSeason(year);
    const meta = hist.teams[0];
    const st = createSeason({ userTeamId: meta.id, userTeamName: meta.name, userTeam: buildCpuTeamForYear(year, meta, new Set()), mode: "historical", year, seed: 1 });
    const played = {};
    outer: for (const night of st.schedule) {
      for (const g of night) {
        if (g.played) continue;
        simScheduledGame(st, g);
        for (const id of [g.homeId, g.awayId]) played[id] = (played[id] || 0) + 1;
      }
      if (Object.values(played).length && Object.values(played).every((n) => n >= GAMES)) break outer;
    }
    const aw = computeAwards(st);
    for (const p of [...aw.allDefense.first, ...aw.allDefense.second]) after[normalizePos(p.pos)]++;
    // "before" = the plain top ten of the same DPOY ranking, rebuilt from the same rows
    const ranked = Object.values(st.playerSeason).filter((r) => r.stats.gp > 0)
      .map((r) => ({ r, s: (r.stats.stl || 0) / r.stats.gp * 3.2 + (r.stats.blk || 0) / r.stats.gp * 3.5 + (r.stats.dreb || 0) / r.stats.gp * 0.35 + (r.stats.reb || 0) / r.stats.gp * 0.15 + (r.ovr || 70) * 0.02 }))
      .sort((a, b) => b.s - a.s).slice(0, 10);
    for (const x of ranked) before[normalizePos(x.r.pos)]++;
  } finally { Math.random = real; }
}
console.log("All-Defense seats over 4 seasons (40 seats)");
console.log("  before (plain top 10):", JSON.stringify(before));
console.log("  after  (one per pos) :", JSON.stringify(after));
