/**
 * Career 2.0 decision 4 — Player Reborn career fragments (碎片).
 *
 * A Reborn-only resource, earned from real game evidence and spent on bounded growth:
 *
 *   reborn.player.fragments = { balance, intensiveWeek, history: [{ gameId, earned, reasons }] }
 *
 * Economy rules (the reason this is NOT `account.fragments`):
 * - account fragments come from recycling cards, and cards come from packs that account gold buys. Letting them
 *   reach a Reborn player would let gold buy competitive power. This ledger lives on the Reborn save, is only
 *   ever credited by `earnFromGame`, and nothing converts between the two.
 * - earning needs evidence from a real game (a standout line against the role's own expectation, a rivalry
 *   meeting won); each game pays at most MAX_PER_GAME and pays once (keyed by its gameId).
 * - spending buys "intensive training": this week's training XP x INTENSIVE_XP_MULTIPLIER through the existing
 *   awardGrowth (ceilings still apply), once per week, only on top of a focus already chosen. No new growth
 *   channel, no OVR or shooting bonus, no skill purchase.
 *
 * Numbers are provisional (balance them with fixed-seed seasons, as the epiphany ones). Pure functions: inputs
 * are never mutated.
 */
import { expectedGameScore } from "./trust.js";

export const STANDOUT_MARGIN = 3; // Game Score above what the role is expected to produce
const MAX_PER_GAME = 2;
export const INTENSIVE_COST = 3;
export const INTENSIVE_XP_MULTIPLIER = 1.5;
const HISTORY = 12; // recent paid games kept: idempotency window + what the card shows

const EMPTY = Object.freeze({ balance: 0, intensiveWeek: null, history: [] });

/** The ledger of a Reborn save (an old save without one reads as empty). */
export function fragmentLedger(reborn) {
  const f = reborn?.player?.fragments;
  return {
    balance: Number.isInteger(f?.balance) && f.balance > 0 ? f.balance : 0,
    intensiveWeek: Number.isInteger(f?.intensiveWeek) ? f.intensiveWeek : null,
    history: Array.isArray(f?.history) ? f.history : [],
  };
}

/** Why this game pays, from its evidence only. */
function fragmentReasons({ min = 0, gameScore = 0, role = "bench", rivalryWon = false } = {}) {
  const reasons = [];
  if (min > 0 && gameScore >= expectedGameScore(role) + STANDOUT_MARGIN) reasons.push("standout");
  if (rivalryWon) reasons.push("rivalry-win");
  return reasons.slice(0, MAX_PER_GAME);
}

/**
 * Credit one finished game. Idempotent: a gameId already in the history pays nothing.
 * @returns { ledger, earned, reasons }
 */
export function earnFromGame(ledger = EMPTY, { gameId, ...evidence } = {}) {
  if (!gameId || ledger.history.some((h) => h.gameId === gameId)) return { ledger, earned: 0, reasons: [] };
  const reasons = fragmentReasons(evidence);
  if (!reasons.length) return { ledger, earned: 0, reasons };
  const history = [...ledger.history, { gameId, earned: reasons.length, reasons }].slice(-HISTORY);
  return { ledger: { ...ledger, balance: ledger.balance + reasons.length, history }, earned: reasons.length, reasons };
}

/** Why intensive training can't be bought this week (null when it can). */
export function intensiveBlocker(reborn, week) {
  const ledger = fragmentLedger(reborn);
  if (reborn?.player?.training?.week !== week) return "no-focus";
  if (ledger.intensiveWeek === week) return "already";
  if (ledger.balance < INTENSIVE_COST) return "short";
  return null;
}

/** Spend INTENSIVE_COST on this week's training. Returns a new reborn state; throws when blocked. */
export function buyIntensive(reborn, week) {
  const blocker = intensiveBlocker(reborn, week);
  if (blocker) throw new Error(`intensive training unavailable: ${blocker}`);
  const ledger = fragmentLedger(reborn);
  const next = structuredClone(reborn);
  next.player.fragments = { ...ledger, balance: ledger.balance - INTENSIVE_COST, intensiveWeek: week };
  return next;
}

/** The XP multiplier a game of `week` trains with (1 unless intensive training was bought for that week). */
export function intensiveMultiplier(reborn, week) {
  const ledger = fragmentLedger(reborn);
  return ledger.intensiveWeek === week && reborn?.player?.training?.week === week ? INTENSIVE_XP_MULTIPLIER : 1;
}
