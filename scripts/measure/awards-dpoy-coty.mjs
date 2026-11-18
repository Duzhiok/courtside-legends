// DPOY and Coach of the Year on real simulated seasons: do the winners reflect team defense / over-achievement?
// Measurement only. Usage: node scripts/measure/awards-dpoy-coty.mjs [games=30]
import { readFileSync } from "node:fs";
import { seasonToCard, PLAYERS, overall } from "../../js/data/players.js";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { createSeason, buildCpuTeamForYear, simScheduledGame, computeAwards, standingsList } from "../../js/engine/season.js";
import { historicalSeason } from "../../js/data/historicalSeasons.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
const GAMES = Number(process.argv[2] || 30);
const rankOf = (list, id, key, dir) => 1 + list.filter((t) => (dir > 0 ? t[key] > list.find((x) => x.id === id)[key] : t[key] < list.find((x) => x.id === id)[key])).length;

for (const year of [1996, 2004, 2012, 2016, 2023]) {
  if (!PLAYERS.some((p) => p.season === year)) PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
  const real = Math.random; Math.random = seededStream(year);
  try {
    const meta = historicalSeason(year).teams[0];
    const st = createSeason({ userTeamId: meta.id, userTeamName: meta.name, userTeam: buildCpuTeamForYear(year, meta, new Set()), mode: "historical", year, seed: year });
    const played = {};
    outer: for (const night of st.schedule) {
      for (const g of night) {
        if (g.played) continue;
        simScheduledGame(st, g);
        for (const id of [g.homeId, g.awayId]) played[id] = (played[id] || 0) + 1;
      }
      if (Object.values(played).every((n) => n >= GAMES)) break outer;
    }
    const aw = computeAwards(st);
    const table = standingsList(st).map((t) => {
      const r = st.standings[t.id] || {};
      const gp = (r.w || 0) + (r.l || 0) || 1;
      const cards = (st.teams[t.id]?.players || []).map((c) => overall(c)).sort((a, b) => b - a).slice(0, 8);
      return { id: t.id, name: t.name, w: r.w, l: r.l, winPct: (r.w || 0) / gp, pa: (r.pa || 0) / gp, strength: cards.reduce((n, x) => n + x, 0) / (cards.length || 1) };
    });
    const teamOf = (name) => table.find((t) => t.name === name);
    console.log(`\n=== ${year} (${GAMES} games each) ===`);
    const d = aw.dpoy;
    if (d) {
      const t = teamOf(d.teamName);
      console.log(`DPOY ${d.name} ${d.pos || ""} · ${d.mpg ?? "?"} mpg · ${d.spg} stl ${d.bpg} blk ${d.rpg} reb · team ${d.teamName}: opp ppg rank ${t ? rankOf(table, t.id, "pa", -1) : "?"}/${table.length} (${t ? t.pa.toFixed(1) : "?"})`);
    }
    const stronger = [...table].sort((a, b) => b.strength - a.strength);
    const c = aw.coty; const ct = c && table.find((t) => t.id === c.teamId);
    if (ct) {
      const best = stronger[0];
      const resid = (t) => t.winPct - (0.5 + (t.strength - table.reduce((n, x) => n + x.strength, 0) / table.length) * 0.04);
      const over = [...table].sort((a, b) => resid(b) - resid(a))[0];
      console.log(`COTY ${c.name} (${c.teamName} ${c.w}-${c.l}) · preseason strength rank ${rankOf(table, ct.id, "strength", 1)}/${table.length}`);
      console.log(`     strongest roster: ${best.name} ${best.w}-${best.l} · biggest overachiever (record vs strength): ${over.name} ${over.w}-${over.l} (strength rank ${rankOf(table, over.id, "strength", 1)})`);
    }
  } finally { Math.random = real; }
}
