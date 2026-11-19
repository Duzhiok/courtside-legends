// Player Reborn Playoffs v1: the real pipeline across the years the league changed. No browser. For each season:
//   the whole league plays its regular season with real GameSim (league.js), the player's club is first (his 82 games are a log, the engine is not what is
//   being measured here), the playoffs run on real GameSim, then the offseason: settle, contract, rollover, the next season starts clean.
// It checks conservation (82 games each, wins = losses), the historical series lengths, one champion, honours settled once, a reload changing nothing,
// the roster of every club in every playoff series being that season's (not an empty one), and that the new season's league starts from nothing.
//
// Usage: node scripts/qa/reborn-playoffs-seasons.mjs [years=1997,2002,2003,2005,2009,2014,2025]     (about 30 s a season)
import { readFileSync } from "node:fs";
import { createRebornState } from "../../js/reborn/identity.js";
import { advanceLeague, leagueSchedule, leagueStandings } from "../../js/reborn/league.js";
import { enterPlayoffs, playPlayoffGame, regularGames } from "../../js/reborn/playoffFlow.js";
import { bracketFingerprint, playoffFormat, winsNeeded } from "../../js/reborn/playoffs.js";
import { championships, playoffStats, settlePlayoffSeason } from "../../js/reborn/honors.js";
import { rolloverSeason, settleContract } from "../../js/reborn/contract.js";
import { buildSeason } from "../../js/reborn/season.js";
import { rosterCards } from "../../js/reborn/rosters.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const YEARS = (process.argv[2] ?? "1997,2002,2003,2005,2009,2014,2025").split(",").filter(Boolean).map(Number);
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);
};

/** The player's 82 regular-season games as a log (the player's club always wins: it is the first seed). */
function regularSeasonLog(reborn, year) {
  const me = reborn.player.teamId;
  const log = [];
  for (const g of leagueSchedule(reborn.seed, year).games) {
    if (g.homeId !== me && g.awayId !== me) continue;
    const home = g.homeId === me;
    log.push({ year, game: log.length + 1, gameId: `game:${reborn.seed}:${year}:${log.length + 1}`, opp: home ? g.awayId : g.homeId, home, won: true, ptsFor: 100, ptsAgainst: 90, min: 20, pts: 10 });
  }
  reborn.player.seasonLog = [...(reborn.player.seasonLog || []), ...log];
}

const table = [];
let carry = null;   // the same career, season after season
for (const year of YEARS) {
  const t0 = Date.now();
  const reborn = carry ?? createRebornState(`po-seasons-${year}`, ROWS);
  reborn.player.seasonYear = year;
  reborn.player.coachTrust = 80;
  regularSeasonLog(reborn, year);
  check(`[${year}] the log holds exactly 82 regular-season games`, regularGames(reborn, year).length === 82);

  // The whole league, real engine.
  const lg = advanceLeague(reborn, ROWS, { year });
  const st = leagueStandings(reborn, year);
  const rows = Object.values(st.rows);
  const clubs = year >= 2005 ? 30 : 29;
  check(`[${year}] league: ${clubs} clubs, every one 82 games, wins = losses = ${st.totalGames}, each game once, points balance`,
    lg.complete && rows.length === clubs && rows.every((r) => r.w + r.l === 82) && st.gamesPlayed === st.totalGames
      && rows.reduce((n, r) => n + r.w, 0) === st.totalGames && rows.reduce((n, r) => n + r.l, 0) === st.totalGames
      && rows.reduce((n, r) => n + r.pf, 0) === rows.reduce((n, r) => n + r.pa, 0),
    `${st.totalGames} games, ${Math.round((Date.now() - t0) / 1000)} s`);
  const me = st.rows[reborn.player.teamId];
  check(`[${year}] the player's club is in the table with its 82-0`, me.w === 82 && me.l === 0 && me.confRank === 1);

  // The playoffs, real engine.
  const entered = await enterPlayoffs(reborn, ROWS, { year });
  const po = entered.playoffs;
  const fmt = playoffFormat(year).bestOf;
  check(`[${year}] playoffs: status active, 16 clubs, 15 series, first round best-of-${fmt[0]}`, po.status === "active" && Object.keys(po.seedOf).length === 16 && po.series.length === 15 && po.series.filter((s) => s.round === 1).every((s) => s.bestOf === fmt[0]) && po.series.filter((s) => s.round > 1).every((s) => s.bestOf === 7));
  const fieldsOk = po.series.filter((s) => s.round === 1).flatMap((s) => [s.high, s.low]).every((id) => rosterCards(ROWS, id, year).length >= 8);
  check(`[${year}] every club in the field has that season's full roster`, fieldsOk);

  let state = entered, games = 0, titleFlags = 0;
  for (let out = await playPlayoffGame(state, ROWS, {}); out; out = await playPlayoffGame(state, ROWS, {})) {
    state = out.reborn;
    games += 1;
    if (out.report.isChampionship) titleFlags += 1;
  }
  const end = state.playoffs;
  const wins = (s) => (s.winner === s.high ? s.winsHigh : s.winsLow);
  check(`[${year}] the bracket is complete and consistent: 15 winners, each with ${winsNeeded(fmt[0])}/${winsNeeded(7)} wins, one champion`,
    end.series.every((s) => s.winner && wins(s) === winsNeeded(s.bestOf) && s.games.length <= s.bestOf) && !!end.championId && end.championId !== end.finalsLoserId);
  check(`[${year}] the player's run: ${end.status} after ${games} playoff games, regular season still ${regularGames(state, year).length}`, ["eliminated", "champion"].includes(end.status) && regularGames(state, year).length === 82 && games >= winsNeeded(fmt[0]));
  check(`[${year}] title flag: ${titleFlags} (exactly one iff champion)`, titleFlags === (end.status === "champion" ? 1 : 0));
  const stats = playoffStats(state, year);
  check(`[${year}] honours settled once: timeline ${state.timeline.events.filter((e) => e.event === "playoffs" && e.year === year).length}, titles this year ${championships(state).filter((h) => h.year === year).length} (career ${championships(state).length}), playoff gp ${stats.gp}`,
    state.timeline.events.filter((e) => e.event === "playoffs" && e.year === year).length === 1 && championships(state).filter((h) => h.year === year).length === (end.status === "champion" ? 1 : 0) && stats.gp === games);
  const reloaded = JSON.parse(JSON.stringify(state));
  check(`[${year}] a reload changes nothing: same bracket, nothing settled twice, nothing re-entered`, bracketFingerprint(reloaded.playoffs) === bracketFingerprint(end) && settlePlayoffSeason(reloaded) === reloaded && (await enterPlayoffs(reloaded, ROWS, { year })) === reloaded);

  // The offseason: contract, rollover, a new season from nothing.
  const settled = settleContract(state, { year });
  check(`[${year}] the contract is judged on the 82 games (${settled.outcome.type})`, settled.outcome.games === 82);
  const rolled = rolloverSeason(settled.reborn, { year, players: ROWS });
  const next = buildSeason(rolled.reborn, ROWS);
  check(`[${year}] rollover: ${rolled.year}, no bracket, no league results, history kept, ${next.games.length} games to play from game 1`,
    rolled.year === year + 1 && rolled.reborn.playoffs === undefined && rolled.reborn.league === undefined && !!rolled.reborn.seasonHistory[year] && next.year === year + 1 && next.index === 0);
  table.push({ year, seed: po.seedOf[reborn.player.teamId], status: end.status, games, champion: end.championId, loser: end.finalsLoserId, seconds: Math.round((Date.now() - t0) / 1000) });
  carry = rolled.reborn;
}
console.log("\nyear  seed  result      po games  champion  (Finals loser)  time");
for (const r of table) console.log(`${r.year}  ${String(r.seed).padStart(3)}   ${r.status.padEnd(11)} ${String(r.games).padStart(5)}     ${r.champion}       ${r.loser}          ${r.seconds}s`);
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
