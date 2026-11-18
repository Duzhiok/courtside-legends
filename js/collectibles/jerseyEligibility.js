/**
 * Who may offer you a jersey, and why (J3). Pure: no DOM, no storage, no Math.random.
 *
 * "Respect" is DERIVED from the run's real rivalry ledger (reborn.rivalries) -- it is not a second trust ledger. It
 * grows with real meetings, close games and duels. A man does not have to be a formal rival: the ledger's `watch` list
 * (the men you keep guarding) counts too, which is what makes this reachable in a real season.
 *
 * The three triggers of the design:
 *   - CHAMPIONSHIP  a title won against him. Reborn has no playoffs yet, so `isChampionship` is never true today; the
 *                   rule is implemented and tested so it only needs the game evidence to start flowing.
 *   - MUTUAL RESPECT / RIVALRY RESOLUTION  enough real meetings that the respect score alone reaches MIN_RESPECT.
 *
 * All numbers are initial values to tune with fixed-seed seasons, not final balance.
 */
import { directMatchup } from "../reborn/rivalry.js";

export const EXCHANGE_RULES = Object.freeze({
  MIN_RESPECT: 65, // respect needed on its own (no title)
  RESPECT_FLOOR: 40, // even after a title, a stranger offers nothing
  CHAMPIONSHIP_BONUS: 20,
  RIVALRY_BONUS: 10,
  MATCHUP_BONUS: 10,
  MIN_MEETINGS: 2,
  MAX_OFFERS: 3, // per game
  MAX_PER_PERSON_SEASON: 1,
  MAX_PER_SEASON: 2, // a keepsake stays rare: pending + kept, all rivals together
  MAX_ACCEPTED_PER_GAME: 1,
});

const RESPECT_BASE = 30;
const PER_MEETING = 8;
const MEETINGS_COUNTED = 6;
const PER_CLOSE_GAME = 6;
const CLOSE_MARGIN = 6;
const PER_DUEL = 8;
const DUEL_GAME_SCORE = 10;
const PER_EXTRA_HEAT = 7; // between a close game (6) and a duel (8)

/** Respect (0..100) he has for you, read off the real head-to-head games of a rivalry record. */
export function respectFromRival(rival) {
  const games = Array.isArray(rival?.games) ? rival.games : [];
  if (!games.length) return 0;
  const close = games.filter((g) => Math.abs(g.margin ?? 99) <= CLOSE_MARGIN).length;
  const duels = games.filter((g) => (g.you?.gs || 0) >= DUEL_GAME_SCORE && (g.rival?.gs || 0) >= DUEL_GAME_SCORE).length;
  const raw = RESPECT_BASE + PER_MEETING * Math.min(games.length, MEETINGS_COUNTED) + PER_CLOSE_GAME * close + PER_DUEL * duels;
  return Math.min(100, raw);
}

/**
 * Respect for a man you keep facing who is NOT (yet) a rival: the ledger only keeps `meetings` and `heat` for him
 * (heat = 1 per meeting, +1 for a close game, +1 for a duel), so the close/duel part is read back from the heat
 * above one-per-meeting. Same scale as respectFromRival, so the two never disagree about a man who is both.
 */
export function respectFromWatch(watch) {
  const meetings = Math.max(0, Math.floor(watch?.meetings) || 0);
  if (!meetings) return 0;
  const extra = Math.max(0, (Math.floor(watch?.heat) || 0) - meetings);
  return Math.min(100, RESPECT_BASE + PER_MEETING * Math.min(meetings, MEETINGS_COUNTED) + PER_EXTRA_HEAT * extra);
}

/** Respect and meetings for either kind of relationship record (a rival with games, or a watch entry). */
export function relationSummary(rel) {
  if (!rel) return null;
  if (Array.isArray(rel.games)) return { respect: respectFromRival(rel), meetings: rel.games.length };
  return { respect: respectFromWatch(rel), meetings: Math.floor(rel.meetings) || 0 };
}

/**
 * The game as evidence, built ONLY from what the run recorded: who really played (`opponents` with minutes), who is a
 * rival, and who was your direct matchup. Nothing here is invented; a missing field stays missing.
 */
export function gameEvidenceFromReport(report, ledger) {
  const matchup = directMatchup(report);
  return {
    id: report?.gameId || null,
    settled: !!report?.gameId && (report?.line?.min || 0) > 0,
    isChampionship: report?.isChampionship === true,
    year: report?.year ?? null,
    game: report?.game ?? null,
    won: !!report?.won,
    margin: report?.margin ?? null,
    participants: (report?.opponents || []).filter((o) => o.bref && o.min > 0).map((o) => o.bref),
    rivalIds: (ledger?.rivals || []).map((r) => r.bref),
    directMatchups: matchup ? [{ playerId: "you", opponentId: matchup.bref }] : [],
  };
}

/**
 * Is `opponent` willing to swap a jersey after this game? Returns { eligible, reason } or { eligible, score, reasons }.
 * `respect` is respectFromRival(...); `player` is only used to match the direct-matchup evidence ("you").
 */
export function evaluateExchangeCandidate({ opponent, game, respect, meetings = 0 }) {
  if (!game?.id || !game.settled) return { eligible: false, reason: "GAME_NOT_SETTLED" };
  if (!opponent?.bref || !game.participants?.includes(opponent.bref)) return { eligible: false, reason: "NOT_A_PARTICIPANT" };
  if (!Number.isFinite(respect)) return { eligible: false, reason: "MISSING_RELATIONSHIP" };
  if (meetings < EXCHANGE_RULES.MIN_MEETINGS) return { eligible: false, reason: "TOO_FEW_MEETINGS" };

  const championship = game.isChampionship === true;
  const rivalry = game.rivalIds?.includes(opponent.bref) ?? false;
  const matchup = game.directMatchups?.some((m) => m.opponentId === opponent.bref) ?? false;
  const reasons = [...(championship ? ["CHAMPIONSHIP"] : []), ...(rivalry ? ["RIVALRY"] : []), ...(matchup ? ["DIRECT_MATCHUP"] : [])];
  const score =
    respect +
    (championship ? EXCHANGE_RULES.CHAMPIONSHIP_BONUS : 0) +
    (rivalry ? EXCHANGE_RULES.RIVALRY_BONUS : 0) +
    (matchup ? EXCHANGE_RULES.MATCHUP_BONUS : 0);

  if (championship) {
    if (respect < EXCHANGE_RULES.RESPECT_FLOOR) return { eligible: false, reason: "LOW_RESPECT", score };
    return { eligible: score >= EXCHANGE_RULES.MIN_RESPECT, score, reasons: reasons.length ? reasons : ["CHAMPIONSHIP"], ...(score < EXCHANGE_RULES.MIN_RESPECT ? { reason: "LOW_SCORE" } : {}) };
  }
  if (respect < EXCHANGE_RULES.MIN_RESPECT) return { eligible: false, reason: "LOW_RESPECT", score };
  // Mutual respect needs real evidence that the two of you actually faced off tonight.
  if (!matchup) return { eligible: false, reason: "NO_DIRECT_MATCHUP", score };
  return { eligible: true, score, reasons: ["MUTUAL_RESPECT", ...reasons] };
}
