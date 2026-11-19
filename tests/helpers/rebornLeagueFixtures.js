// Shared by the Reborn league and playoff tests.
import { readFileSync } from "node:fs";
import { leagueSchedule } from "../../js/reborn/league.js";
import { createRebornState } from "../../js/reborn/identity.js";

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
