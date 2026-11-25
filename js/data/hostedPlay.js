/**
 * Hosted league -> real GameSim (B47 slice 2). Supplies the `playGame` that settleHosted() takes: the account's own
 * best squad (position-balanced five + bench, automatic coaching, the card's training bonuses) against a real
 * historical team-season, with the game's RNG fixed by the settle seed. No UI, no save writes: it only plays.
 */
import { PLAYERS, overall } from "./players.js";
import { resolvePlayers, uniqueByPerson } from "./account.js";
import { GameSim } from "../engine/sim.js";
import { bestStarters } from "../engine/lineupSlots.js";
import { seededStream } from "../core/seededRandom.js";
import { autoCoach } from "../reborn/rosters.js";

export const OPPONENT_MIN_SEASON = 1985;
const SQUAD_SIZE = 10;
const opponentCache = new WeakMap();

/** Every real team-season of the pool with a playable roster, built once per pool, in a stable order. */
export function hostedOpponents(pool = PLAYERS) {
  let found = opponentCache.get(pool);
  if (found && found.size === pool.length) return found.teams;
  const groups = new Map();
  for (const card of pool) {
    if (!card?.team || !(card.season >= OPPONENT_MIN_SEASON)) continue;
    const key = `${card.team}|${card.season}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(card);
  }
  const teams = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, cards]) => ({ name, players: cards.sort((a, b) => overall(b) - overall(a)).slice(0, SQUAD_SIZE) }))
    .filter((t) => t.players.length >= 7)
    .map((t) => ({ ...t, starterIds: bestStarters(t.players, overall).map((p) => p.id) }));
  opponentCache.set(pool, { size: pool.length, teams });
  return teams;
}

/** The account's squad as the sim wants it, or null when it cannot field a team (fewer than 5 distinct people). */
export function hostedSquad(account, pool = PLAYERS) {
  const owned = uniqueByPerson(resolvePlayers(account?.playerIds, account, pool));
  if (owned.length < 5) return null;
  const players = owned.sort((a, b) => overall(b) - overall(a)).slice(0, SQUAD_SIZE);
  return { name: "HOSTED", players, starterIds: bestStarters(players, overall).map((p) => p.id) };
}

/** Can a hosted day be played right now? (Needs a squad and the roster pool loaded.) */
export const hostedReady = (account, pool = PLAYERS) => !!hostedSquad(account, pool) && hostedOpponents(pool).length > 0;

/** `playGame({ seed }) -> { won, score, opponent }` for settleHosted. Same seed, same game, always. */
export function createHostedPlayGame(account, { pool = PLAYERS } = {}) {
  const mine = hostedSquad(account, pool);
  const opponents = hostedOpponents(pool);
  if (!mine || !opponents.length) throw new Error("hosted league: no squad or no opponents");
  return ({ seed }) => {
    const opponent = opponents[seed % opponents.length];
    const sim = autoCoach(new GameSim({
      home: mine,
      away: { name: opponent.name, players: opponent.players, starterIds: opponent.starterIds },
      youSide: "home",
      injuries: false,
      speed: 3,
      rng: seededStream(seed),
      onEvent: () => {},
      onTick: () => {},
      onEnd: () => {},
    }));
    const snap = sim.runFast();
    return { won: snap.score.home > snap.score.away, score: { me: snap.score.home, opponent: snap.score.away }, opponent: opponent.name };
  };
}
