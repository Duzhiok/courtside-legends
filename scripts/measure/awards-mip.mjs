// MIP on real simulated seasons: who wins under the year-over-year rule, with the previous real season next to it.
// Usage: node scripts/measure/awards-mip.mjs [games=30]
import { readFileSync } from "node:fs";
import { seasonToCard, PLAYERS } from "../../js/data/players.js";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { createSeason, buildCpuTeamForYear, simScheduledGame, computeAwards } from "../../js/engine/season.js";
import { historicalSeason } from "../../js/data/historicalSeasons.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
const GAMES = Number(process.argv[2] || 30);
for (const year of [1996, 2004, 2012, 2016, 2023]) {
  if (!PLAYERS.some((p) => p.season === year)) PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
  const real = Math.random; Math.random = seededStream(year);
  try {
    const meta = historicalSeason(year).teams[0];
    const st = createSeason({ userTeamId: meta.id, userTeamName: meta.name, userTeam: buildCpuTeamForYear(year, meta, new Set()), mode: "historical", year, seed: 1 });
    const played = {};
    outer: for (const night of st.schedule) {
      for (const g of night) {
        if (g.played) continue;
        simScheduledGame(st, g);
        for (const id of [g.homeId, g.awayId]) played[id] = (played[id] || 0) + 1;
      }
      if (Object.values(played).every((n) => n >= GAMES)) break outer;
    }
    const m = computeAwards(st).mip;
    if (!m) { console.log(year, "no MIP"); continue; }
    const b = m.basis;
    const prev = b.prev ? `${b.prev.season} ${b.prev.ppg}/${b.prev.rpg}/${b.prev.apg} -> ${b.card.season} ${b.card.ppg}/${b.card.rpg}/${b.card.apg}` : "-";
    console.log(`${year}  ${m.name.padEnd(22)} rule=${b.rule} gain=${b.gain ?? "-"}  (sim ${m.ppg}/${m.rpg}/${m.apg})  real ${prev}`);
  } finally { Math.random = real; }
}
