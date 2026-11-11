/**
 * Reborn <-> unified promise engine adapter.
 *
 * Relationship promises ("play me 20 mpg for 5 games", "make me a rotation
 * player") are about the Reborn player, and the only honest evidence for them
 * is that player's own season log. This module turns the log into the
 * snapshot evaluatePromise() reads — one window per promise, starting after
 * the game the promise was made — settles what is due through the promise
 * engine's stores, and moves the player's coach trust by exactly the settled
 * effects.
 *
 * What the log cannot show is never guessed: "start", "trade" and "contract"
 * promises have no per-game evidence here, so they stay open (a null clock
 * means "not decidable", not "broken").
 */
import {
  markTrustEffectsApplied,
  pendingTrustEffects,
  relationshipsStore,
  resolveDuePromises,
} from "../career/careerRelationships.js";
import { effectsForType } from "../career/promiseEffects.js";
import { roleForTrust } from "./trust.js";

/** Promise kinds whose outcome the season log can decide. */
export const OBSERVABLE_KINDS = Object.freeze(["minutes", "role"]);

const clampTrust = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** (promise) => the Reborn player's snapshot over that promise's own window. */
export function rebornPromiseWindow(reborn) {
  const log = Array.isArray(reborn?.player?.seasonLog) ? reborn.player.seasonLog : [];
  return (promise) => {
    if (!OBSERVABLE_KINDS.includes(promise?.kind)) return { game: null, season: null };
    const madeSeason = Number.isInteger(promise.madeSeason) ? promise.madeSeason : null;
    const madeGame = Number.isInteger(promise.madeGame) ? promise.madeGame : 0;
    const inWindow = log.filter((e) => madeSeason === null || e.year > madeSeason || (e.year === madeSeason && e.game > madeGame));
    const played = inWindow.filter((e) => e.min > 0);
    const last = log[log.length - 1];
    const mpg = played.length ? played.reduce((s, e) => s + e.min, 0) / played.length : undefined;
    return {
      season: last?.year ?? null,
      // A later season means the game clock restarted: the deadline has passed.
      game: last ? (madeSeason === null || last.year === madeSeason ? last.game : madeGame + 10000) : null,
      gamesPlayed: played.length,
      mpg,
      role: reborn?.player?.rotationRole ?? last?.role,
    };
  };
}

/**
 * Settle the account's due relationship promises against the Reborn run and
 * apply their trust effects once. Returns { reborn, settled, account }; the
 * input reborn is not mutated. Effects aimed at someone else's player (a
 * targetBref that is not this run's) are marked applied without moving trust.
 */
export function settleRebornPromises(account, reborn) {
  if (!account || !reborn?.player) return { reborn, settled: [], account };
  const { resolved } = resolveDuePromises(account, rebornPromiseWindow(reborn));
  if (!resolved.length) return { reborn, settled: [], account };

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

  const promises = relationshipsStore(account).promises;
  const settled = resolved.map((effect) => {
    const p = promises.find((x) => x.id === effect.promiseId);
    return {
      promiseId: effect.promiseId,
      source: "relationship",
      promiseType: "relationship",
      status: effect.outcome,
      effects: { trust: effectsForType("relationship")[effect.outcome].trust, relationship: effect.relationshipDelta },
      reason: `${effect.label}：${p?.text ?? ""}`,
      reasonEn: `${effect.labelEn}: ${p?.textEn || p?.text || ""}`,
    };
  });
  return { reborn: next, settled, account };
}
