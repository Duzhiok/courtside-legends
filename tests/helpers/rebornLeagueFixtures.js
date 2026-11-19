// Shared by the Reborn league and playoff tests.
import { readFileSync } from "node:fs";
import { leagueSchedule } from "../../js/reborn/league.js";
import { createRebornState } from "../../js/reborn/identity.js";
import { hashSeed } from "../../js/core/seededRandom.js";
import { nextUserGame, recordGame, settleOtherSeries } from "../../js/reborn/playoffs.js";

export const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;

/** A run whose season is `year` (the player's club, the real schedule of that year). */
export const run = (seed, year) => {
  const r = createRebornState(seed, ROWS);
  r.player.seasonYear = year;
  return r;
};

/** A cheap, controlled stand-in for the engine: the home side wins when slot + team id is odd, 100-90. */
export const coin = ({ game }) => (((game.ordinal ?? 0) + game.homeId.charCodeAt(0) + (game.n ?? 0)) % 2 ? { home: 100, away: 90 } : { home: 90, away: 100 });

/**
 * The player's 82 games as the season log would have them (a test double for the GameSim result, built from the same schedule slots).
 * `result({ game })` -> { home, away } decides each one; the default is `coin`.
 */
export const fakeUserLog = (state, year, result = coin) => {
  const userId = state.player.teamId;
  const log = [];
  for (const g of leagueSchedule(state.seed, year).games) {
    if (g.homeId !== userId && g.awayId !== userId) continue;
    const r = result({ game: g });
    const home = g.homeId === userId;
    log.push({ year, game: log.length + 1, opp: home ? g.awayId : g.homeId, home, won: home ? r.home > r.away : r.away > r.home, ptsFor: home ? r.home : r.away, ptsAgainst: home ? r.away : r.home, min: 20, pts: 10 });
  }
  state.player.seasonLog = [...(state.player.seasonLog || []).filter((e) => e.year !== year), ...log];
  return log;
};

/** Every game the player wins (or loses): to put his club first (or out of the playoffs) in the table. */
export const userAlways = (state, wins) => ({ game }) => {
  const userHome = game.homeId === state.player.teamId;
  return wins === userHome ? { home: 100, away: 90 } : { home: 90, away: 100 };
};

/** The CPU series stand-in for fast tests: the home side wins 60% of the time, decided by the game's key only. */
export const poSim = ({ key }) => (hashSeed(key) % 5 < 3 ? { home: 100, away: 90 } : { home: 90, away: 100 });

/**
 * Play out the player's playoff run on a bracket: he wins every series of round <= winRounds, then loses one. Returns the titleGame flags he met.
 * With `reborn`, every game he plays is also written to his season log (as playGame would: po, minutes, points, gameId).
 */
export function playRun(po, winRounds, { reborn = null, minutes = 20 } = {}) {
  const flags = [];
  settleOtherSeries(po, poSim);
  for (let g = nextUserGame(po); g; g = nextUserGame(po)) {
    flags.push(g.titleGame);
    const userHome = g.homeId === po.userId;
    const win = g.round <= winRounds;
    const gameId = `po:${g.seriesId}:${g.n}`;
    recordGame(po, g.seriesId, { n: g.n, homeId: g.homeId, awayId: g.awayId, homeScore: userHome === win ? 100 : 90, awayScore: userHome === win ? 90 : 100, gameId, user: true });
    reborn?.player.seasonLog.push({ year: po.year, game: reborn.player.seasonLog.length + 1, gameId, started: minutes > 0, opp: g.oppId, home: userHome, min: minutes, pts: minutes ? 12 : 0, reb: minutes ? 4 : 0, ast: minutes ? 3 : 0, won: win, po: { round: g.round, series: g.seriesId, n: g.n } });
    settleOtherSeries(po, poSim);
  }
  return flags;
}
