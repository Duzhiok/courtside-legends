/**
 * Player Reborn — the whole league's regular season (Playoffs v1, slice P1).
 *
 * Reborn only plays the player's own games. The rest of the league needs a result too, or there is no table, no seeding and no
 * playoffs. Rules this file keeps:
 *  - Every other game is a real GameSim run (`runFast`, the same engine and the same automatic coaching as the player's games),
 *    never a rating coin-flip. Its seed depends only on (run seed, season, the game's place in the schedule), so it does not matter
 *    in which order or in how many pieces the league is advanced: the result of a game is the same, and reloading a save never rerolls it.
 *  - The player's own games are NOT simulated here: their result is the one already in the season log, played by GameSim.
 *  - The league advances with the player (one schedule day at a time, ~13 games, 0.3 s) because a whole season at once is ~27 s.
 *  - Results are stored packed (home score * 1000 + away score) per schedule slot, current season only.
 *  - If the roster data does not cover every club that season, there is no league (never invented numbers).
 */
import { generateSchedule } from "../engine/season.js";
import { GameSim } from "../engine/sim.js";
import { hashSeed, seededStream } from "../core/seededRandom.js";
import { leagueLayout } from "./franchises.js";
import { autoCoach, bestFive, rosterCards } from "./rosters.js";

const pack = (home, away) => home * 1000 + away;
const unpack = (v) => [Math.floor(v / 1000), v % 1000];

const scheduleCache = new Map();

/** The league's schedule for a run and season: the clubs of that year, the nights, and the games in one flat order (`ordinal`). */
export function leagueSchedule(seed, year) {
  const key = `${seed}|${year}`;
  let found = scheduleCache.get(key);
  if (!found) {
    const layout = leagueLayout(year);
    const nights = generateSchedule(layout.teamIds, hashSeed(key), { eastIds: layout.eastIds, westIds: layout.westIds, confById: layout.confById });
    const games = [];
    nights.forEach((night, d) => night.forEach((g) => games.push({ ordinal: games.length, day: d + 1, homeId: g.homeId, awayId: g.awayId })));
    found = { layout, nights, games };
    if (scheduleCache.size > 8) scheduleCache.clear();
    scheduleCache.set(key, found);
  }
  return found;
}

/** Does the roster data hold a playable roster for every club of that season? */
function leagueDataComplete(players, year, layout = leagueLayout(year)) {
  return layout.teamIds.every((id) => rosterCards(players, id, year).length >= 5);
}

/** One CPU-vs-CPU game, exactly as the player's games are built (best five start, automatic coaching), seeded by its slot only. */
export function simLeagueGame({ cards, game, seed, year }) {
  const home = cards(game.homeId), away = cards(game.awayId);
  const sim = autoCoach(new GameSim({
    home: { name: game.homeId, players: home, starterIds: bestFive(home) },
    away: { name: game.awayId, players: away, starterIds: bestFive(away) },
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(hashSeed(`${seed}|${year}|${game.key ?? `lg|${game.ordinal}`}`)),   // a playoff game names its own key (playoffs.js)
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  }));
  const snap = sim.runFast();
  return { home: snap.score.home, away: snap.score.away, sim };
}

const isUserGame = (g, userId) => g.homeId === userId || g.awayId === userId;

/**
 * Play every other game up to and including schedule day `throughDay`, writing the results into `state.league`. MUTATES `state` (call it on
 * the copy you own, as playGame does). `maxGames` bounds one call so a caller can slice a long catch-up. Idempotent: a slot with a result is
 * never played again. `simulate` is for tests only (a controlled stand-in for simLeagueGame); the game never passes it.
 * @returns {{ simulated:number, complete:boolean, unavailable:boolean }} complete = every other game of the season has its result.
 */
export function advanceLeague(state, players, { year = state?.player?.seasonYear, throughDay = Infinity, maxGames = Infinity, simulate = simLeagueGame } = {}) {
  const { layout, games } = leagueSchedule(state.seed, year);
  const userId = state.player.teamId;
  if (!leagueDataComplete(players, year, layout)) return { simulated: 0, complete: false, unavailable: true };
  const prev = state.league?.year === year && state.league.scores?.length === games.length ? state.league.scores : null;
  const scores = prev ? prev.slice() : new Array(games.length).fill(0);
  const cardsOf = new Map();
  const cards = (id) => {
    if (!cardsOf.has(id)) cardsOf.set(id, rosterCards(players, id, year));
    return cardsOf.get(id);
  };
  let simulated = 0;
  let complete = true;
  for (const g of games) {
    if (isUserGame(g, userId) || scores[g.ordinal]) continue;
    if (g.day > throughDay || simulated >= maxGames) { complete = false; continue; }
    const r = simulate({ cards, game: g, seed: state.seed, year });
    scores[g.ordinal] = pack(r.home, r.away);
    simulated += 1;
  }
  state.league = { year, scores };
  return { simulated, complete, unavailable: false };
}

/** Bring the league fully up to date, a slice at a time, handing control back between slices (a save that never advanced it needs all ~27 s). */
export async function completeLeague(state, players, { year, onProgress, slice = 60, simulate } = {}) {
  for (;;) {
    const r = advanceLeague(state, players, { year, maxGames: slice, ...(simulate ? { simulate } : {}) });
    if (r.unavailable || r.complete) return r;
    onProgress?.(r);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const cmpPct = (a, b) => b.w * (a.w + a.l) - a.w * (b.w + b.l);   // exact: no float noise on equal records

/**
 * Order one conference. Rows carry w, l, confW, confL, diff and id; `h2h[a][b]` is how many times a beat b. Win percentage first; a tie of exactly two teams
 * goes to head-to-head, then (any tie) conference record, point difference and finally the id, so the same results always give the same table.
 */
export function rankConference(rows, h2h = {}) {
  const sorted = [...rows].sort((a, b) => cmpPct(a, b) || (a.id < b.id ? -1 : 1));
  const confPct = (r) => (r.confW + r.confL ? r.confW / (r.confW + r.confL) : 0);
  const out = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j < sorted.length && cmpPct(sorted[i], sorted[j]) === 0) j += 1;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      group.sort((a, b) => (group.length === 2 ? ((h2h[b.id]?.[a.id] || 0) - (h2h[a.id]?.[b.id] || 0)) : 0) || confPct(b) - confPct(a) || b.diff - a.diff || (a.id < b.id ? -1 : 1));
    }
    out.push(...group);
    i = j;
  }
  return out;
}

/**
 * The table of a season so far, from the results actually on record: the player team's games from the season log (played by GameSim),
 * every other game from the league results. Ranks inside a conference by win percentage; ties by head-to-head (two teams only),
 * then conference record, then point difference, then team id, so the order is always the same for the same results.
 */
export function leagueStandings(state, year = state?.player?.seasonYear) {
  const { layout, games } = leagueSchedule(state.seed, year);
  const userId = state.player.teamId;
  const row = (id) => ({ id, conf: layout.confById[id], w: 0, l: 0, pf: 0, pa: 0, confW: 0, confL: 0 });
  const rows = Object.fromEntries(layout.teamIds.map((id) => [id, row(id)]));
  const h2h = {};
  let played = 0;
  const settle = (winnerId, loserId, winnerPts, loserPts) => {
    const w = rows[winnerId], l = rows[loserId];
    if (!w || !l) return;
    w.w += 1; l.l += 1;
    w.pf += winnerPts; w.pa += loserPts; l.pf += loserPts; l.pa += winnerPts;
    if (w.conf === l.conf) { w.confW += 1; l.confL += 1; }
    (h2h[winnerId] ||= {})[loserId] = ((h2h[winnerId] || {})[loserId] || 0) + 1;
    played += 1;
  };
  const scores = state.league?.year === year ? state.league.scores : [];
  for (const g of games) {
    if (isUserGame(g, userId) || !scores[g.ordinal]) continue;
    const [hs, as] = unpack(scores[g.ordinal]);
    if (hs > as) settle(g.homeId, g.awayId, hs, as); else settle(g.awayId, g.homeId, as, hs);
  }
  for (const e of state.player.seasonLog || []) {
    if (e.year !== year || e.po || !rows[e.opp]) continue;
    const mine = Number.isFinite(e.ptsFor) ? e.ptsFor : 0, theirs = Number.isFinite(e.ptsAgainst) ? e.ptsAgainst : 0;   // a log from before scores were kept still counts W-L
    if (e.won) settle(userId, e.opp, mine, theirs); else settle(e.opp, userId, theirs, mine);
  }
  const list = Object.values(rows);
  for (const r of list) { r.pct = r.w + r.l ? r.w / (r.w + r.l) : 0; r.diff = r.pf - r.pa; }
  const east = rankConference(list.filter((r) => r.conf === "east"), h2h), west = rankConference(list.filter((r) => r.conf === "west"), h2h);
  east.forEach((r, i) => { r.confRank = i + 1; });
  west.forEach((r, i) => { r.confRank = i + 1; });
  return { year, gamesPlayed: played, totalGames: games.length, complete: played === games.length, rows: rows, east: east.map((r) => r.id), west: west.map((r) => r.id) };
}
