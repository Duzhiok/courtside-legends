/**
 * Player Reborn — playoffs (Playoffs v1, slices P2 + P3).
 *
 * 16 clubs, 8 per conference, seeded by the regular-season table (league.js); no Play-In. Round lengths follow the historical year: the first round is
 * best-of-5 up to 2002 and best-of-7 after it, every later round is best-of-7 (the table stands for any year, not only the validated 1997-2025).
 * The bracket is fixed: 1v8, 4v5, 2v7, 3v6, then the winners meet in that order, then the conference final and the Finals (home court: the better
 * regular-season record).
 *
 * Who decides a game:
 *  - the player's own games are played by the season loop (playGame, a real GameSim game with the player in it) and only RECORDED here;
 *  - every other series is played here, game by game, by the same GameSim path as the rest of the league (league.js simLeagueGame), seeded by
 *    (run seed, season, series id, game number), so the order of play never changes a result and a reload never rerolls one.
 * Nobody gets a bonus for being the player's club. Round barrier: the other series of a round wait for the player's series, so a player in round 1 does
 * not find the other conference already in the final.
 *
 * Everything here is plain data (it goes into the save as `reborn.playoffs`) and every function that changes it works on the state you hand it.
 */
import { hashSeed } from "../core/seededRandom.js";

export const ROUND_NAMES = Object.freeze([
  { zh: "首轮", en: "First round" },
  { zh: "分区半决赛", en: "Conference semifinals" },
  { zh: "分区决赛", en: "Conference finals" },
  { zh: "总决赛", en: "NBA Finals" },
]);

/** Series length per round for a season. First round best-of-5 through 2002, best-of-7 from 2003 on; every other round best-of-7. */
export const playoffFormat = (year) => ({ bestOf: Number(year) <= 2002 ? [5, 7, 7, 7] : [7, 7, 7, 7] });

export const winsNeeded = (bestOf) => Math.ceil(bestOf / 2);

/** Home court by game number: true = the higher seed hosts. 2-2-1-1-1 (best-of-7) and 2-2-1 (best-of-5). */
const HOME_PATTERN = { 5: [true, true, false, false, true], 7: [true, true, false, false, true, false, true] };
const SEED_PAIRS = [[1, 8], [4, 5], [2, 7], [3, 6]];
const CONFS = ["east", "west"];

/**
 * Build the bracket from a regular-season table (leagueStandings). Eight clubs per conference, all fifteen series laid out; later rounds fill in as
 * their feeder series finish. `userId` decides whether the player's club is in (status "active") or not ("missed").
 */
export function startPlayoffs(standings, { year, userId }) {
  const format = playoffFormat(year);
  const seeds = {};
  const seedOf = {};
  const records = {};
  for (const conf of CONFS) {
    seeds[conf] = standings[conf].slice(0, 8);
    seeds[conf].forEach((id, i) => { seedOf[id] = i + 1; records[id] = { w: standings.rows[id].w, l: standings.rows[id].l }; });
  }
  const series = [];
  const make = (id, round, conf, extra = {}) => ({ id, round, conf, bestOf: format.bestOf[round - 1], high: null, low: null, games: [], winsHigh: 0, winsLow: 0, winner: null, feeds: null, ...extra });
  for (const conf of CONFS) {
    const c = conf[0].toUpperCase();
    const r1 = SEED_PAIRS.map(([hi, lo]) => {
      const s = make(`R1-${c}-${hi}v${lo}`, 1, conf);
      const [high, low] = [seeds[conf][hi - 1], seeds[conf][lo - 1]];
      if (high && low) { s.high = high; s.low = low; }
      return s;
    });
    const r2 = [make(`R2-${c}-A`, 2, conf, { feeds: [r1[0].id, r1[1].id] }), make(`R2-${c}-B`, 2, conf, { feeds: [r1[2].id, r1[3].id] })];
    series.push(...r1, ...r2, make(`CF-${c}`, 3, conf, { feeds: [r2[0].id, r2[1].id] }));
  }
  series.push(make("F", 4, null, { feeds: ["CF-E", "CF-W"] }));
  const inField = (id) => Object.hasOwn(seedOf, id);
  return {
    year,
    userId,
    bestOf: format.bestOf,
    seeds,
    seedOf,
    records,
    series,
    status: inField(userId) ? "active" : "missed",
    championId: null,
    finalsLoserId: null,
  };
}

const byId = (state, id) => state.series.find((s) => s.id === id);

/** Higher seed first; in the Finals (two conferences) the better regular-season record, then the lower seed number, then the id. */
function orderTeams(state, round, a, b) {
  if (round === 4) {
    const [ra, rb] = [state.records[a], state.records[b]];
    const diff = rb.w * (ra.w + ra.l) - ra.w * (rb.w + rb.l);
    if (diff) return diff < 0 ? [a, b] : [b, a];
    return state.seedOf[a] !== state.seedOf[b] ? (state.seedOf[a] < state.seedOf[b] ? [a, b] : [b, a]) : (a < b ? [a, b] : [b, a]);
  }
  return state.seedOf[a] < state.seedOf[b] ? [a, b] : [b, a];
}

/** Fill in the teams of every series whose two feeder series are decided. */
export function resolveFeeds(state) {
  for (const s of state.series) {
    if (s.high || !s.feeds) continue;
    const [a, b] = s.feeds.map((id) => byId(state, id).winner);
    if (a && b) [s.high, s.low] = orderTeams(state, s.round, a, b);
  }
  return state;
}

export const seriesWins = (s, id) => (id === s.high ? s.winsHigh : id === s.low ? s.winsLow : 0);
export const involves = (s, id) => s.high === id || s.low === id;

/** Who hosts the next game of a series, and which game it is. */
export function nextGameOf(s) {
  const n = s.games.length + 1;
  const pattern = HOME_PATTERN[s.bestOf];
  const highHosts = pattern[n - 1];
  return { n, homeId: highHosts ? s.high : s.low, awayId: highHosts ? s.low : s.high };
}

/** Put one decided game on its series and, when that finishes the series, advance the bracket. Returns the series. */
export function recordGame(state, seriesId, { n, homeId, awayId, homeScore, awayScore, gameId = null, user = false }) {
  const s = byId(state, seriesId);
  if (!s || s.winner) return s;
  const expect = nextGameOf(s);
  if (n !== expect.n || homeId !== expect.homeId || awayId !== expect.awayId) throw new Error(`playoff game out of order: ${seriesId} game ${n}`);
  const winnerId = homeScore > awayScore ? homeId : awayId;
  if (winnerId === s.high) s.winsHigh += 1; else s.winsLow += 1;
  s.games.push({ n, homeId, awayId, homeScore, awayScore, winnerId, ...(gameId ? { gameId } : {}), ...(user ? { user: true } : {}) });
  const need = winsNeeded(s.bestOf);
  if (s.winsHigh >= need || s.winsLow >= need) {
    s.winner = s.winsHigh >= need ? s.high : s.low;
    const loser = s.winner === s.high ? s.low : s.high;
    if (s.id === "F") { state.championId = s.winner; state.finalsLoserId = loser; }
    if (state.status === "active" && involves(s, state.userId)) {
      if (s.winner !== state.userId) state.status = "eliminated";
      else if (s.id === "F") state.status = "champion";
    }
    resolveFeeds(state);
  }
  return s;
}

/**
 * Play every series the player is not in, as far as the round barrier allows: all of a round's other series, and only once every series of the
 * round before is decided. `simGame({ series, n, homeId, awayId, key })` -> { home, away } is the GameSim stand-in (league.js simLeagueGame).
 * @returns {number} games played
 */
export function settleOtherSeries(state, simGame) {
  let played = 0;
  for (;;) {
    resolveFeeds(state);
    const open = state.series.filter((s) => !s.winner);
    if (!open.length) return played;
    const round = Math.min(...open.map((s) => s.round));
    const others = open.filter((s) => s.round === round && s.high && s.low && !(state.status === "active" && involves(s, state.userId)));
    if (!others.length) return played;
    for (const s of others) {
      while (!s.winner) {
        const g = nextGameOf(s);
        const r = simGame({ series: s, ...g, key: `po|${s.id}|${g.n}` });
        recordGame(state, s.id, { ...g, homeScore: r.home, awayScore: r.away });
        played += 1;
      }
    }
  }
}

/** The player's open series and its next game, once the other series have been settled; null when the player is out (or never in). */
export function nextUserGame(state) {
  if (state.status !== "active") return null;
  const s = state.series.find((x) => !x.winner && x.high && x.low && involves(x, state.userId));
  if (!s) return null;
  const g = nextGameOf(s);
  const need = winsNeeded(s.bestOf);
  return {
    seriesId: s.id,
    round: s.round,
    bestOf: s.bestOf,
    ...g,
    oppId: s.high === state.userId ? s.low : s.high,
    userWins: seriesWins(s, state.userId),
    oppWins: seriesWins(s, s.high === state.userId ? s.low : s.high),
    // This game ends the Finals in the player's favour if he wins it.
    titleGame: s.id === "F" && seriesWins(s, state.userId) === need - 1,
    key: `po|${s.id}|${g.n}`,
  };
}

/** The finished (or running) run of the player's club through the bracket, newest round last, for the screen and the honours. */
export function userRun(state) {
  if (!state || !state.seedOf?.[state.userId]) return null;
  const mine = state.series.filter((s) => s.high && s.low && involves(s, state.userId));
  return {
    seed: state.seedOf[state.userId],
    series: mine.map((s) => {
      const opp = s.high === state.userId ? s.low : s.high;
      return { id: s.id, round: s.round, bestOf: s.bestOf, oppId: opp, oppSeed: state.seedOf[opp], wins: seriesWins(s, state.userId), losses: seriesWins(s, opp), won: s.winner ? s.winner === state.userId : null };
    }),
  };
}

/** A stable deterministic number for a bracket (tests and the save check use it to prove nothing was rerolled). */
export const bracketFingerprint = (state) => hashSeed(JSON.stringify(state.series.map((s) => [s.id, s.high, s.low, s.games.map((g) => [g.homeScore, g.awayScore])])));
