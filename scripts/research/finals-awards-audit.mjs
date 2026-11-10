// Audit of the Finals All-Team / Finals MVP on real seasons: is the MVP on the All-Team, are the slots sane?
// Usage: node scripts/research/finals-awards-audit.mjs [seasons=6] [year=2020]
import { readFileSync } from "node:fs";
import { seasonToCard, PLAYERS } from "../../js/data/players.js";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { createSeason, buildCpuTeamForYear, simAllPlayoffs, simScheduledGame, computeAwards } from "../../js/engine/season.js";
import { historicalSeason } from "../../js/data/historicalSeasons.js";

const N = Number(process.argv[2] || 6);
const YEAR = Number(process.argv[3] || 2020);
const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
if (!PLAYERS.some((p) => p.season === YEAR)) PLAYERS.push(...ROWS.filter((r) => r.season === YEAR).map(seasonToCard));

let mvpMissing = 0, weirdSlots = 0, benchwarmers = 0;
for (let seed = 1; seed <= N; seed++) {
  const real = Math.random; Math.random = seededStream(seed);
  try {
    const hist = historicalSeason(YEAR);
    const meta = hist.teams[0];
    const st = createSeason({ userTeamId: meta.id, userTeamName: meta.name, userTeam: buildCpuTeamForYear(YEAR, meta, new Set()), mode: "historical", year: YEAR, seed });
    for (const night of st.schedule) for (const g of night) if (!g.played) simScheduledGame(st, g);
    st.awards = computeAwards(st);
    simAllPlayoffs(st);
    const team = st.finalsAllTeam || [];
    const mvp = st.finalsMvp;
    const onTeam = mvp && team.some((p) => p.id === mvp.id);
    if (!onTeam) mvpMissing++;
    for (const p of team) {
      if (p.naturalPos && Math.abs(["PG", "SG", "SF", "PF", "C"].indexOf(p.naturalPos) - ["PG", "SG", "SF", "PF", "C"].indexOf(p.slot)) >= 2) weirdSlots++;
      if (p.ppg < 3 && p.rpg < 6) benchwarmers++;
    }
    console.log(`seed ${seed}: MVP ${mvp?.name} (${mvp?.ppg}/${mvp?.rpg}/${mvp?.apg}, ${mvp?.gp}g) ${onTeam ? "on" : "NOT ON"} All-Team`);
    console.log("   " + team.map((p) => `${p.slot}:${p.name}[${p.naturalPos}] ${p.ppg}/${p.rpg}/${p.apg} gp${p.gp}`).join(" | "));
  } finally { Math.random = real; }
}
console.log(`\nMVP missing from All-Team: ${mvpMissing}/${N}; slots >=2 away from natural pos: ${weirdSlots}; near-zero-impact picks: ${benchwarmers}`);
