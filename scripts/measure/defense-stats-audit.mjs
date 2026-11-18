/**
 * Defensive statistics audit: simulated steals / blocks against the REAL numbers of the same player-season (roster.json).
 * Measurement only: nothing here changes GameSim, a probability or a weight.
 *
 * For each era a fixed-seed league season is simulated (the same path the Season mode uses) and every player with real minutes is paired
 * with his own real line, so the question is "does the simulator turn THIS man's real season into a plausible one?" and not "is the
 * league average close". Reports: league totals per team-game, per-36 distributions, ratios by position and era, outliers with the
 * attributes that produced them, and how concentrated a team's steals / blocks are in one player.
 *
 * Usage: node scripts/measure/defense-stats-audit.mjs [games=30] [years=1985,1996,2004,2013,2022]
 */
import { readFileSync } from "node:fs";
import { seasonToCard, PLAYERS } from "../../js/data/players.js";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";
import { seededStream } from "../../js/core/seededRandom.js";
import { createSeason, buildCpuTeamForYear, simScheduledGame } from "../../js/engine/season.js";
import { historicalSeason } from "../../js/data/historicalSeasons.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
const GAMES = Number(process.argv[2] || 30);
const YEARS = (process.argv[3] || "1985,1996,2004,2013,2022").split(",").map(Number);
const MIN_SIM_MIN = 15 * Math.min(GAMES, 20);   // enough minutes for a per-36 to mean something
const pct = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : NaN; };
const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "-");
const POS_GROUP = (p) => (["PG", "SG"].includes(p) ? "guard" : ["SF"].includes(p) ? "wing" : ["PF", "C"].includes(p) ? "big" : "other");

const all = [];            // paired rows across eras
const eraTotals = [];
for (const year of YEARS) {
  if (!PLAYERS.some((p) => p.season === year)) PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
  const realRandom = Math.random; Math.random = seededStream(year);
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
    const teamStl = {}; const teamBlk = {}; const top = { stl: [], blk: [] };
    for (const row of Object.values(st.playerSeason)) {
      teamStl[row.teamId] = (teamStl[row.teamId] || 0) + row.stats.stl;
      teamBlk[row.teamId] = (teamBlk[row.teamId] || 0) + row.stats.blk;
    }
    const teamIds = Object.keys(played);
    const perGame = (m) => teamIds.map((id) => (m[id] || 0) / played[id]);
    const realRows = ROWS.filter((r) => r.season === year);
    // real league per team-game: sum(spg*gp) over every real row / (teams * the real season's length, 82 except 1999 / 2012 / 2020 / 2021)
    const realLen = { 1999: 50, 2012: 66, 2020: 72, 2021: 72 }[year] || 82;
    const realTeams = new Set(realRows.map((r) => r.team)).size || 30;
    const realStl = realRows.reduce((n, r) => n + (r.spg || 0) * (r.gp || 0), 0) / (realTeams * realLen);
    const realBlk = realRows.reduce((n, r) => n + (r.bpg || 0) * (r.gp || 0), 0) / (realTeams * realLen);
    eraTotals.push({ year, teams: teamIds.length, simStl: perGame(teamStl).reduce((a, b) => a + b, 0) / teamIds.length, simBlk: perGame(teamBlk).reduce((a, b) => a + b, 0) / teamIds.length, realStl, realBlk });

    for (const row of Object.values(st.playerSeason)) {
      const bref = row.bref; if (!bref) continue;
      const real = realRows.find((r) => r.bref === bref); if (!real || (real.mpg || 0) < 15 || (real.gp || 0) < 25) continue;
      const s = row.stats; if (s.min < MIN_SIM_MIN) continue;
      const card = (st.teams[row.teamId]?.players || []).find((c) => c.id === row.playerId) || {};
      const per36 = (n, min) => (n * 36) / min;
      all.push({
        year, name: row.name, pos: real.pos, group: POS_GROUP(real.pos), bref,
        simStl36: per36(s.stl, s.min), simBlk36: per36(s.blk, s.min),
        realStl36: per36((real.spg || 0) * real.gp, real.mpg * real.gp), realBlk36: per36((real.bpg || 0) * real.gp, real.mpg * real.gp),
        simSpg: s.stl / s.gp, simBpg: s.blk / s.gp, realSpg: real.spg, realBpg: real.bpg, mpg: s.min / s.gp,
        stealAttr: card.steal, blockAttr: card.block, skills: card.skills || [],
        teamId: row.teamId,
      });
    }
    // concentration: the share of a team's steals / blocks taken by its top player
    for (const id of teamIds) {
      const rows = Object.values(st.playerSeason).filter((r) => r.teamId === id);
      const ts = rows.reduce((n, r) => n + r.stats.stl, 0); const tb = rows.reduce((n, r) => n + r.stats.blk, 0);
      if (ts) top.stl.push(Math.max(...rows.map((r) => r.stats.stl)) / ts);
      if (tb) top.blk.push(Math.max(...rows.map((r) => r.stats.blk)) / tb);
    }
    eraTotals.at(-1).topStlShare = top.stl.reduce((a, b) => a + b, 0) / (top.stl.length || 1);
    eraTotals.at(-1).topBlkShare = top.blk.reduce((a, b) => a + b, 0) / (top.blk.length || 1);
  } finally { Math.random = realRandom; }
}

console.log(`\n=== League totals per team-game (${GAMES} games per team, fixed seeds) vs the REAL league of that season ===`);
console.log("year | sim STL | real STL | ratio | sim BLK | real BLK | ratio | top-player share of team STL / BLK (sim)");
for (const e of eraTotals) console.log(`${e.year} | ${f(e.simStl)} | ${f(e.realStl)} | ${f(e.simStl / e.realStl)} | ${f(e.simBlk)} | ${f(e.realBlk)} | ${f(e.simBlk / e.realBlk)} | ${f(e.topStlShare * 100, 0)}% / ${f(e.topBlkShare * 100, 0)}%`);

const summary = (rows, label) => {
  if (!rows.length) return;
  const rs = rows.map((r) => r.simStl36 / Math.max(0.2, r.realStl36)); const rb = rows.map((r) => r.simBlk36 / Math.max(0.2, r.realBlk36));
  console.log(`${label.padEnd(10)} n=${String(rows.length).padStart(3)} | STL/36 sim p50 ${f(pct(rows.map((r) => r.simStl36), 0.5))} p90 ${f(pct(rows.map((r) => r.simStl36), 0.9))} max ${f(pct(rows.map((r) => r.simStl36), 1))} · real p50 ${f(pct(rows.map((r) => r.realStl36), 0.5))} p90 ${f(pct(rows.map((r) => r.realStl36), 0.9))} max ${f(pct(rows.map((r) => r.realStl36), 1))} · per-man ratio sim/real median ${f(pct(rs, 0.5))} p90 ${f(pct(rs, 0.9))}`);
  console.log(`${"".padEnd(10)}           | BLK/36 sim p50 ${f(pct(rows.map((r) => r.simBlk36), 0.5))} p90 ${f(pct(rows.map((r) => r.simBlk36), 0.9))} max ${f(pct(rows.map((r) => r.simBlk36), 1))} · real p50 ${f(pct(rows.map((r) => r.realBlk36), 0.5))} p90 ${f(pct(rows.map((r) => r.realBlk36), 0.9))} max ${f(pct(rows.map((r) => r.realBlk36), 1))} · per-man ratio sim/real median ${f(pct(rb, 0.5))} p90 ${f(pct(rb, 0.9))}`);
};
console.log(`\n=== Per-36 distributions, simulated vs the same men's real seasons (≥15 real mpg, ≥${MIN_SIM_MIN} simulated minutes) ===`);
summary(all, "ALL");
console.log("-- by position group");
for (const g of ["guard", "wing", "big"]) summary(all.filter((r) => r.group === g), g);
console.log("-- by era");
for (const y of YEARS) summary(all.filter((r) => r.year === y), String(y));

const worst = (key, simKey, realKey, n = 8) => [...all].sort((a, b) => b[simKey] / Math.max(0.2, b[realKey]) - a[simKey] / Math.max(0.2, a[realKey])).slice(0, n);
for (const [label, simKey, realKey, spg, rpg, attr] of [["STEALS", "simStl36", "realStl36", "simSpg", "realSpg", "stealAttr"], ["BLOCKS", "simBlk36", "realBlk36", "simBpg", "realBpg", "blockAttr"]]) {
  console.log(`\n=== Biggest ${label} outliers (sim per-36 / real per-36) ===`);
  for (const r of worst(label, simKey, realKey)) console.log(`${r.name} ${r.year} ${r.pos} ${f(r.mpg, 0)}mpg | sim ${f(r[spg], 1)}/g (${f(r[simKey], 1)}/36) vs real ${f(r[rpg], 1)}/g (${f(r[realKey], 1)}/36) = x${f(r[simKey] / Math.max(0.2, r[realKey]), 1)} | ${attr.replace("Attr", "")} attr ${r[attr]} | skills ${r.skills.join(",") || "-"}`);
}
// attribute -> output curve: is the response to the rating linear, or does it run away at the top?
console.log("\n=== Output by attribute band (sim per-36 / real per-36 ratio): does the rating run away at the top? ===");
for (const [label, attr, simKey, realKey] of [["steal", "stealAttr", "simStl36", "realStl36"], ["block", "blockAttr", "simBlk36", "realBlk36"]]) {
  const bands = [[0, 50], [50, 60], [60, 70], [70, 80], [80, 101]];
  console.log(`${label}: ` + bands.map(([a, b]) => { const r = all.filter((x) => x[attr] >= a && x[attr] < b); return `${a}-${b === 101 ? "100" : b - 1}: n=${r.length} sim ${f(r.reduce((n, x) => n + x[simKey], 0) / (r.length || 1))} real ${f(r.reduce((n, x) => n + x[realKey], 0) / (r.length || 1))} x${f(r.reduce((n, x) => n + x[simKey], 0) / Math.max(0.01, r.reduce((n, x) => n + x[realKey], 0)))}`; }).join("  |  "));
}
