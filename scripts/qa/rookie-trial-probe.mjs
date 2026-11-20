// Rookie trial-period probe (Alpha Playability): what does a diligent bench rookie actually experience?
// Real GameSim, fixed seeds, trust starts at the real TRUST_START, training done EVERY week, takeover passed.
//   node scripts/qa/rookie-trial-probe.mjs [seedCount=4] [games=82] [firstSeed=1]
// Per seed: games with any minutes / 12+ minutes, total minutes, trust at checkpoints, rivalries by origin,
// growth (card OVR start -> end, levels gained) and how many reports carried a visible coaching note.
// Scores are deterministic per (seed, year, game index): the sim rng is seeded, so before/after runs compare.
import { readFileSync } from "node:fs";
import { createRebornState, buildPlayerCard } from "../../js/reborn/identity.js";
import { buildSeason, playGame } from "../../js/reborn/season.js";
import { rivalryLedger } from "../../js/reborn/rivalry.js";
import { overall } from "../../js/data/players.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const SEEDS = Number(process.argv[2]) || 4;
const GAMES = Number(process.argv[3]) || 82;
const FIRST = Number(process.argv[4]) || 1;
const week = (i) => Math.floor(i / 4) + 1;

async function oneSeed(seedName) {
  let reborn = createRebornState(seedName, ROWS);
  const season = buildSeason(reborn, ROWS);
  const ovrOf = (r) => overall(buildPlayerCard(r.identity, ROWS, { growth: r.player.growth, season: season.year }));
  const ovr0 = ovrOf(reborn);
  const mins = [];
  const trustAt = {};
  let unplayedNotes = 0;
  let practiceWeeks = 0;
  for (let i = 0; i < Math.min(GAMES, season.games.length); i += 1) {
    // The real UI marks the week's training done once the player picked a focus.
    reborn.player.training = { focus: "defense", week: week(season.index) }; // what chooseFocus stores
    const out = await playGame(reborn, season, ROWS, { trainingDone: true });
    if (!out) break;
    reborn = out.reborn;
    mins.push(out.report.line?.min ?? reborn.player.seasonLog.at(-1).min);
    if ([10, 20, 40, 82].includes(i + 1)) trustAt[i + 1] = reborn.player.coachTrust;
    // Player-visible coaching feedback actually carried by the reports.
    if ((out.report.trustParts || []).some((x) => x.kind === "unplayed")) unplayedNotes += 1;
    if ((out.report.growth || []).some((e) => e.practice > 0)) practiceWeeks += 1;
  }
  const rivals = rivalryLedger(reborn).rivals || [];
  const byOrigin = rivals.reduce((m, r) => ({ ...m, [r.origin]: (m[r.origin] || 0) + 1 }), {});
  return {
    seed: seedName, name: reborn.identity?.name || reborn.identity?.bref, kind: reborn.identity?.kind, ovr0, ovr1: ovrOf(reborn),
    games: mins.length, anyMin: mins.filter((m) => m > 0).length, min12: mins.filter((m) => m >= 12).length,
    totalMin: Math.round(mins.reduce((a, b) => a + b, 0)), trustAt, finalRole: reborn.player.rotationRole,
    rivals: rivals.length, byOrigin, unplayedNotes, practiceWeeks,
    growthLevels: Object.values(reborn.player.growth || {}).reduce((n, e) => n + (e.levels || 0), 0),
    growthXp: Object.values(reborn.player.growth || {}).reduce((n, e) => n + (e.xp || 0), 0),
  };
}

const rows = [];
for (let s = FIRST; s < FIRST + SEEDS; s += 1) {
  const t0 = Date.now();
  const r = await oneSeed(`rookie-trial-${s}`);
  rows.push(r);
  console.log(JSON.stringify(r), `${Date.now() - t0}ms`);
}
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log(`TOTAL seeds=${rows.length} anyMin=${sum("anyMin")}/${sum("games")} min12=${sum("min12")} totalMin=${sum("totalMin")} rivals=${sum("rivals")} levels=${sum("growthLevels")} unplayedNotes=${sum("unplayedNotes")} practiceWeeks=${sum("practiceWeeks")}`);
