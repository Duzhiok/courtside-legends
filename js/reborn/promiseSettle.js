/**
 * Reborn <-> unified promise engine adapter.
 *
 * Relationship promises ("play me 20 mpg for 5 games", "start me", "re-sign me
 * by 1997") are about the Reborn player, and the only honest evidence for
 * them is what that run really recorded: the season log (minutes, whether he
 * started), the timeline's contract events, and trade records. promiseEvidence.js
 * turns those into stable-id evidence records; this module judges each promise
 * over its own window, settles what is due through the promise engine's
 * stores, and moves the player's coach trust by exactly the settled effects.
 *
 * Nothing is guessed: a game saved without a `started` flag cannot break a
 * start promise, and a trade/contract promise only resolves on a real event
 * or once the deadline season has passed.
 */
import { markTrustEffectsApplied, pendingTrustEffects } from "../career/careerRelationships.js";
import { settleGamePromises } from "../career/promiseEngine.js";
import { collectEvidence, evidenceWindow } from "./promiseEvidence.js";
import { roleForTrust } from "./trust.js";

/** Promise kinds a Reborn run can settle from its own record. */
export const OBSERVABLE_KINDS = Object.freeze(["minutes", "role", "start", "contract", "trade"]);

const clampTrust = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** (promise) => the Reborn player's evidence snapshot over that promise's own window. */
export function rebornPromiseWindow(reborn, { account = null } = {}) {
  return evidenceWindow(collectEvidence(reborn, account), reborn);
}

/**
 * Settle the account's due relationship promises against the Reborn run and
 * apply their trust effects once. Returns { reborn, settled, account }; the
 * input reborn is not mutated. Effects aimed at someone else's player (a
 * targetBref that is not this run's) are marked applied without moving trust.
 */
export function settleRebornPromises(account, reborn) {
  if (!account || !reborn?.player) return { reborn, settled: [], account };
  // The ONE settlement entry (no inbox in a Reborn run, only relationship promises).
  const { settled } = settleGamePromises({
    inbox: null,
    account,
    relationshipState: rebornPromiseWindow(reborn, { account }),
  });
  if (!settled.length) return { reborn, settled: [], account };

  const pending = pendingTrustEffects(account);
  const bref = reborn.identity?.bref || null;
  const applicable = pending.filter((e) => Number.isFinite(e.trustDelta) && (!e.targetBref || !bref || e.targetBref === bref));
  let next = reborn;
  if (applicable.length) {
    next = structuredClone(reborn);
    const before = Number.isFinite(next.player.coachTrust) ? next.player.coachTrust : 25;
    next.player.coachTrust = clampTrust(before + applicable.reduce((s, e) => s + e.trustDelta, 0));
    next.player.rotationRole = roleForTrust(next.player.coachTrust);
  }
  markTrustEffectsApplied(account, pending.map((e) => e.promiseId));
  return { reborn: next, settled, account };
}
