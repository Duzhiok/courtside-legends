/**
 * Unified promise engine (Career 2.0 E, product ruling "one fact, one
 * settlement, one outcome").
 *
 * A promise the player makes lives in one of two existing stores, kept as-is
 * so no old save is rewritten:
 *   - inbox:        root.inbox.promises   (Career Inbox decisions; evidence is
 *                   the per-game core scoring line)
 *   - relationship: account.careerRelationships.promises (between two people)
 * This module is the single layer over both:
 *   canonicalPromise()      one contract for either shape (read adapter)
 *   listCanonicalPromises() every promise, each promiseId exactly once
 *   settleGamePromises()    the ONE settlement entry for a game: settles both
 *                           stores, applies each promise's effect once, and
 *                           mirrors inbox outcomes into the account's legacy
 *                           record so the story system sees one history.
 *
 * Idempotence comes from the stores' own status machine (open -> fulfilled |
 * broken, never re-evaluated) plus a deterministic legacy id per promise
 * (`promise:<promiseId>`), so calling settleGamePromises twice for the same
 * game changes nothing. Effect sizes come from promiseEffects.js.
 *
 * Pure with respect to the inputs it is given: it clones the inbox/state and
 * mutates only the `account` object the caller passes (the same contract
 * careerRelationships.js already has).
 */
import { checkPromises } from "./careerDecisions.js";
import { appendLegacyEvent, resolveDuePromises, relationshipsStore } from "./careerRelationships.js";
import { effectsForType } from "./promiseEffects.js";

export const PROMISE_STATUS_FLOW = Object.freeze(["pending", "fulfilled", "broken", "expired"]);

const toCanonicalStatus = (status) => (status === "open" ? "pending" : status);

function fromInbox(raw) {
  const first = Number.isInteger(raw.madeAtGame) ? raw.madeAtGame : 0;
  const last = Number.isInteger(raw.dueGame) ? raw.dueGame : first;
  const gameIds = [];
  for (let g = first; g <= last && gameIds.length < 200; g += 1) gameIds.push(g);
  return {
    promiseId: raw.id,
    source: "inbox",
    promiseType: "inbox",
    kind: raw.kind || null,
    targetId: null,
    createdAt: first,
    dueAt: last,
    status: toCanonicalStatus(raw.status),
    evidence: {
      gameIds,
      requiredCondition: {
        type: "core-pts",
        minCorePtsPerGame: raw.condition?.minCorePtsPerGame ?? 0,
        games: raw.condition?.games ?? 1,
      },
    },
    effects: effectsForType("inbox"),
  };
}

function fromRelationship(raw) {
  const check = raw.check || {};
  const made = Number.isInteger(raw.madeGame) ? raw.madeGame : 0;
  const dueAt = Number.isInteger(check.dueAfterGames) ? made + check.dueAfterGames : (check.dueSeason ?? null);
  return {
    promiseId: raw.id,
    source: "relationship",
    promiseType: "relationship",
    kind: raw.kind || null,
    targetId: raw.targetId ?? null,
    createdAt: made,
    dueAt,
    status: toCanonicalStatus(raw.status),
    evidence: { gameIds: [], requiredCondition: { ...check } },
    effects: effectsForType("relationship"),
  };
}

/** One promise record -> the canonical contract. `source` is "inbox" | "relationship". */
export function canonicalPromise(raw, source) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") return null;
  if (source === "inbox") return fromInbox(raw);
  if (source === "relationship") return fromRelationship(raw);
  return null;
}

/**
 * Every promise from both stores as canonical records. A promiseId present in
 * both stores is reported once (first store wins) and counted in `duplicates`,
 * so a collision can never be settled twice.
 */
export function listCanonicalPromises({ inbox = null, account = null } = {}) {
  const seen = new Set();
  const promises = [];
  let duplicates = 0;
  const add = (raw, source) => {
    const canon = canonicalPromise(raw, source);
    if (!canon) return;
    if (seen.has(canon.promiseId)) {
      duplicates += 1;
      return;
    }
    seen.add(canon.promiseId);
    promises.push(canon);
  };
  for (const raw of inbox?.promises || []) add(raw, "inbox");
  for (const raw of account ? relationshipsStore(account).promises : []) add(raw, "relationship");
  return { promises, duplicates };
}

function unifiedFromInbox(entry) {
  const p = entry.promise;
  const e = entry.effects || {};
  return {
    promiseId: p.id,
    source: "inbox",
    promiseType: "inbox",
    status: entry.fulfilled ? "fulfilled" : "broken",
    effects: { trust: e.trust ?? 0, relationship: e.relationship?.players ?? 0 },
    reason: entry.reason,
    reasonEn: entry.reasonEn,
  };
}

function unifiedFromRelationship(effect, account) {
  const promise = relationshipsStore(account).promises.find((p) => p.id === effect.promiseId);
  return {
    promiseId: effect.promiseId,
    source: "relationship",
    promiseType: "relationship",
    status: effect.outcome,
    effects: { trust: effect.trustDelta, relationship: effect.relationshipDelta },
    reason: `${effect.label}：${promise?.text ?? ""}`,
    reasonEn: `${effect.labelEn}: ${promise?.textEn || promise?.text || ""}`,
  };
}

/**
 * Settle everything that is due after one game, across both stores, once.
 *
 *   inbox, state       the career inbox + its state (required)
 *   gameIndex          games played so far (the inbox deadline clock)
 *   account            optional; enables relationship promises + legacy mirror
 *   relationshipState  optional; the target's snapshot for evaluatePromise —
 *                      an object, or a function (promise) => snapshot so each
 *                      promise is judged over its own window. Without it
 *                      relationship promises are left open (never guessed).
 *
 * Returns { inbox, state, account, settled } where `settled` lists every
 * promise settled by THIS call in one shape: { promiseId, source,
 * promiseType, status, effects: { trust, relationship }, reason, reasonEn }.
 */
export function settleGamePromises({ inbox, state, gameIndex = 0, account = null, relationshipState = null } = {}) {
  const inboxOut = checkPromises(inbox, state, { gameIndex });
  const settled = inboxOut.settled.map(unifiedFromInbox);

  if (account) {
    for (const entry of inboxOut.settled) {
      const p = entry.promise;
      appendLegacyEvent(account, {
        id: `promise:${p.id}`,
        type: "promise",
        year: p.year ?? null,
        summary: `${entry.fulfilled ? "承诺兑现" : "承诺落空"}：${p.text}`,
        summaryEn: `${entry.fulfilled ? "Promise kept" : "Promise broken"}: ${p.textEn || p.text}`,
        data: { promiseId: p.id, outcome: entry.fulfilled ? "fulfilled" : "broken", trustDelta: entry.effects?.trust ?? 0, source: "inbox" },
      });
    }
    if (relationshipState) {
      const { resolved } = resolveDuePromises(account, relationshipState);
      for (const effect of resolved) settled.push(unifiedFromRelationship(effect, account));
    }
  }
  return { inbox: inboxOut.inbox, state: inboxOut.state, account, settled };
}
