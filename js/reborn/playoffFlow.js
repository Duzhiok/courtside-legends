/**
 * Player Reborn — playoffs: the bridge between the save, the season loop and the bracket (playoffs.js).
 *
 * The life of one season after game 82:
 *   enterPlayoffs      the whole league is brought up to date (league.js), the table is seeded, the other series of round one are played
 *                      -> reborn.playoffs, with status "active" (the club made it), "missed", or "unavailable" (no roster data for the season)
 *   playPlayoffGame    the player's next game, a real GameSim game through playGame, recorded on its series; then the other series that the
 *                      round barrier lets go are played. A lost series ends the player's run and the rest of the bracket is played out.
 *   settleChampionship (P3) the title: honours and the timeline, once.
 * All of it is idempotent: entering twice, or recording a game twice, changes nothing; nothing is rolled again after a reload.
 */
import { completeLeague, leagueStandings, simLeagueGame } from "./league.js";
import { rosterCards } from "./rosters.js";
import { playGame } from "./season.js";
import { nextUserGame, recordGame, seriesWins, settleOtherSeries, startPlayoffs } from "./playoffs.js";

/** The regular-season games of a year in the log (the ones that count toward 82); playoff entries carry `po`. */
export const regularGames = (reborn, year) => (reborn?.player?.seasonLog || []).filter((e) => e.year === year && !e.po);
const yearGames = (reborn, year) => (reborn?.player?.seasonLog || []).filter((e) => e.year === year);

/** GameSim stand-in for a series the player is not in (the same path as the league's other games). */
function otherGameSim(reborn, players, year) {
  const cache = new Map();
  const cards = (id) => {
    if (!cache.has(id)) cache.set(id, rosterCards(players, id, year));
    return cache.get(id);
  };
  return ({ homeId, awayId, key }) => simLeagueGame({ cards, game: { homeId, awayId, key }, seed: reborn.seed, year });
}

/**
 * Start the playoffs of the player's season, once its 82 games are in the log. Returns a new state (the input is untouched). Idempotent: a state that
 * already has this season's playoffs is returned as it is.
 */
export async function enterPlayoffs(reborn, players, { year = reborn.player.seasonYear, onProgress } = {}) {
  if (reborn.playoffs?.year === year) return reborn;
  const next = structuredClone(reborn);
  const league = await completeLeague(next, players, { year, onProgress });
  if (league.unavailable) {
    next.playoffs = { year, status: "unavailable", series: [], seedOf: {}, userId: next.player.teamId };
    return next;
  }
  const standings = leagueStandings(next, year);
  const state = startPlayoffs(standings, { year, userId: next.player.teamId });
  settleOtherSeries(state, otherGameSim(next, players, year));
  next.playoffs = state;
  return next;
}

/**
 * Play the player's next playoff game: a real GameSim game with the player in it (the same playGame as the regular season: trust, growth,
 * rivalries, takeovers), recorded on its series. Then the other series are played as far as the round barrier lets them.
 * @returns {Promise<{ reborn, report }|null>} null when there is no game to play (out of the playoffs, or not in them)
 */
export async function playPlayoffGame(reborn, players, opts = {}) {
  const state = reborn.playoffs;
  const game = state && nextUserGame(state);
  if (!game) return null;
  const year = state.year;
  const home = game.homeId, away = game.awayId;
  const desc = {
    homeId: home,
    awayId: away,
    po: { round: game.round, series: game.seriesId, n: game.n, bestOf: game.bestOf, titleGame: game.titleGame },
  };
  const pseudo = { year, teamId: reborn.player.teamId, games: [], index: yearGames(reborn, year).length };
  const out = await playGame(reborn, pseudo, players, { ...opts, game: desc });
  if (!out) return null;
  const next = out.reborn;
  recordGame(next.playoffs, game.seriesId, { n: game.n, homeId: home, awayId: away, homeScore: out.report.score.home, awayScore: out.report.score.away, gameId: out.report.gameId, user: true });
  settleOtherSeries(next.playoffs, otherGameSim(next, players, year));
  const s = next.playoffs.series.find((x) => x.id === game.seriesId);
  const userWins = seriesWins(s, reborn.player.teamId);
  const playoffs = { status: next.playoffs.status, seriesId: s.id, userWins, oppWins: s.games.length - userWins, seriesOver: !!s.winner, ...(s.winner ? { seriesWon: s.winner === reborn.player.teamId } : {}) };
  return { reborn: next, report: { ...out.report, playoffs } };
}
