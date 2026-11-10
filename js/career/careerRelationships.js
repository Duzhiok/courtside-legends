/**
 * Career Relationships & Legacy (workstream E, Career 2.0).
 *
 * The shared layer the other careers read from: people, relationships,
 * promises, and the legacy record of one account's basketball life.
 *
 * Source of truth: completed records on the account
 * (`account.careerRelationships`, an array-of-records store). Nothing here
 * is stored as a separate boolean that could contradict the record — the
 * same pattern as careerAchievements.js (`account.careerCompletions`).
 * The store is additive and optional: an account without it reads as
 * empty, and every reader is defensive. Callers mutate the account in
 * place and persist it themselves (saveAccount), like the rest of the
 * account helpers.
 *
 * What this module is NOT:
 * - It is not the old `root.story.promises` store (seasonGoals.js documents
 *   that one as flavor text copied once and never read again). Promises
 *   here live on the account, are evaluated against real season state,
 *   and produce real effects — they are never written to root.story.
 * - It does not run games, roll dice, or touch sim.js. GameSim stays the
 *   sole authority on game results.
 *
 * Every number here has a consumer (no decorative relationship stats):
 * - Promise resolution -> trust delta, applied to the live Reborn run via
 *   applyPromiseTrustToRoot() (writes root.reborn.player.coachTrust, the
 *   same 0-100 scale trust.js uses; a trust change moves the rotation
 *   role, which moves minutes). Effects that cannot be applied yet
 *   (no live run loaded) stay visible via pendingTrustEffects() so the
 *   next consumer can apply them instead of losing them.
 * - Promise history -> negotiationStanding(), the -2..+2 modifier the
 *   GM negotiation layer (workstream C) reads when pricing a deal with
 *   a party the account has kept or broken promises to.
 * - Rivalry strength -> rivalryStakes(), the trust swing at stake in
 *   the next key game against that rival (read by the takeover / key-game
 *   UI, workstream A). Stakes change what a game MEANS (trust), never
 *   the dice.
 * - Coaching trust -> coachingTrustFor(), the 0-100 coaching-trust value
 *   between a coach and a player, read by the trust path.
 * - The legacy record -> legacySummaryFor(), the presentation-ready
 *   summary in the architectTitlesFor() style. My World honours-wall
 *   display is a follow-up; this module does not touch myWorld files.
 *
 * This module is pure: no localStorage, no DOM, no network, no
 * Math.random. All decisions are deterministic functions of the stored
 * record and the state snapshot the caller passes in.
 */

export const RELATIONSHIP_KINDS = ["rivalry", "mentorship", "coaching-trust", "management", "owner"];
export const PROMISE_KINDS = ["minutes", "role", "start", "trade", "contract"];
export const PROMISE_STATUSES = ["open", "fulfilled", "broken"];
export const LEGACY_EVENT_TYPES = ["transition", "trade", "draft", "divergence", "promise", "rivalry-game"];

/** Role order for the "role" promise check (same ladder as trust.js). */
export const ROLE_RANK = { dnp: 0, garbage: 1, bench: 2, rotation: 3, starter: 4 };

/** Promise effects. Sized like a single game's trust swing (trust.js
 * bounds one game to -5..+7) so one promise never swings a season. */
export const PROMISE_TRUST_FULFILLED = 3;
export const PROMISE_TRUST_BROKEN = -5;
export const PROMISE_REL_FULFILLED = 8;
export const PROMISE_REL_BROKEN = -12;
/** Negotiation standing: one step per net kept/broken promise, capped. */
export const NEGOTIATION_STEP = 1;
export const NEGOTIATION_CAP = 2;
/** Rivalry strength moves 4 points per game against the rival. */
export const RIVALRY_WIN_DELTA = 4;
export const RIVALRY_LOSS_DELTA = -4;
/** Coaching trust with no recorded relationship: neutral. */
export const NEUTRAL_COACHING_TRUST = 50;
/** A promise implies a working relationship; created at this strength. */
export const PROMISE_RELATIONSHIP_START = 50;

const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

/** The store on an account; missing/invalid reads as empty, never throws. */
export function relationshipsStore(account) {
  const raw = account?.careerRelationships;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { version: 1, people: [], relationships: [], promises: [], legacy: [] };
  }
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    version: 1,
    people: list(raw.people),
    relationships: list(raw.relationships),
    promises: list(raw.promises),
    legacy: list(raw.legacy),
  };
}

/** Write the normalized store back onto the account (mutates in place). */
function writeStore(account, store) {
  account.careerRelationships = {
    version: 1,
    people: store.people,
    relationships: store.relationships,
    promises: store.promises,
    legacy: store.legacy,
  };
  return account;
}

export function peopleOf(account) {
  return relationshipsStore(account).people;
}
export function relationshipsOf(account) {
  return relationshipsStore(account).relationships;
}
export function promisesOf(account) {
  return relationshipsStore(account).promises;
}
export function legacyOf(account) {
  return relationshipsStore(account).legacy;
}

/** Upsert a person. Players are keyed by bref; others by caller id.
 * Returns the account (mutated in place). */
export function recordPerson(account, person) {
  if (!account || !person || !isNonEmptyString(person.id)) return account;
  const store = relationshipsStore(account);
  const i = store.people.findIndex((p) => p.id === person.id);
  const entry = {
    id: person.id,
    kind: person.kind || "player",
    name: person.name || person.id,
    ...(isNonEmptyString(person.nameEn) ? { nameEn: person.nameEn } : {}),
    ...(isNonEmptyString(person.bref) ? { bref: person.bref } : {}),
    ...(isNonEmptyString(person.teamId) ? { teamId: person.teamId } : {}),
    ...(Number.isInteger(person.season) ? { season: person.season } : {}),
  };
  if (i >= 0) store.people[i] = { ...store.people[i], ...entry };
  else store.people.push(entry);
  return writeStore(account, store);
}

/** Find a person by id, or null. */
export function personById(account, id) {
  if (!isNonEmptyString(id)) return null;
  return peopleOf(account).find((p) => p.id === id) || null;
}

const relKey = (aId, bId, kind) => `${aId}::${bId}::${kind}`;

/**
 * Add a relationship between two people. Idempotent: the same
 * (aId, bId, kind) pair returns the existing record. Direction does not
 * matter for lookup — (a, b) and (b, a) are the same relationship.
 * Returns the relationship record (or null on bad input).
 */
export function addRelationship(account, { aId, bId, kind, strength = 50, season = null } = {}) {
  if (!account || !isNonEmptyString(aId) || !isNonEmptyString(bId) || aId === bId) return null;
  if (!RELATIONSHIP_KINDS.includes(kind)) return null;
  const store = relationshipsStore(account);
  const existing = store.relationships.find(
    (r) => r.kind === kind && ((r.aId === aId && r.bId === bId) || (r.aId === bId && r.bId === aId)),
  );
  if (existing) return existing;
  const rel = {
    id: relKey(aId, bId, kind),
    aId,
    bId,
    kind,
    strength: clamp100(strength),
    state: "active",
    ...(Number.isInteger(season) ? { sinceSeason: season } : {}),
    history: [],
  };
  store.relationships.push(rel);
  writeStore(account, store);
  return rel;
}

/** The relationship between two people (either direction), or null. */
export function relationshipBetween(account, aId, bId, kind = null) {
  if (!isNonEmptyString(aId) || !isNonEmptyString(bId)) return null;
  return (
    relationshipsOf(account).find(
      (r) =>
        ((r.aId === aId && r.bId === bId) || (r.aId === bId && r.bId === aId)) &&
        (kind === null || r.kind === kind),
    ) || null
  );
}

/**
 * Move a relationship's strength, clamped 0-100, with a reasoned history
 * entry. Returns the relationship, or null when the id is unknown.
 */
export function adjustRelationship(account, relId, delta, reason = "") {
  if (!account || !isNonEmptyString(relId) || !Number.isFinite(delta)) return null;
  const store = relationshipsStore(account);
  const rel = store.relationships.find((r) => r.id === relId);
  if (!rel) return null;
  rel.strength = clamp100(rel.strength + delta);
  rel.history = [
    ...(Array.isArray(rel.history) ? rel.history : []),
    { delta, reason: String(reason || ""), at: Date.now() },
  ];
  writeStore(account, store);
  return rel;
}

/**
 * Coaching trust between a coach and a player (0-100). No recorded
 * coaching-trust relationship reads as neutral (50), never as 0 — the
 * absence of a record is not distrust.
 */
export function coachingTrustFor(account, coachId, playerId) {
  const rel = relationshipBetween(account, coachId, playerId, "coaching-trust");
  if (!rel) return NEUTRAL_COACHING_TRUST;
  return clamp100(rel.strength);
}

// ---------------------------------------------------------------- promises

const CHECK_TYPES = {
  minutes: ["minGames", "minMpg", "dueAfterGames"],
  role: ["role", "dueAfterGames"],
  start: ["dueAfterGames"],
  trade: ["dueSeason"],
  contract: ["dueSeason"],
};

function validateCheck(kind, check) {
  if (!check || typeof check !== "object" || check.type !== kind) return false;
  const required = CHECK_TYPES[kind];
  if (!required) return false;
  if (kind === "minutes") {
    return Number.isFinite(check.minGames) && check.minGames > 0
      && Number.isFinite(check.minMpg) && check.minMpg >= 0
      && Number.isInteger(check.dueAfterGames) && check.dueAfterGames > 0;
  }
  if (kind === "role") {
    return isNonEmptyString(check.role) && ROLE_RANK[check.role] !== undefined
      && Number.isInteger(check.dueAfterGames) && check.dueAfterGames > 0;
  }
  if (kind === "start") {
    return Number.isInteger(check.dueAfterGames) && check.dueAfterGames > 0;
  }
  // trade / contract: a season deadline; the condition is checked against
  // the state the caller passes in (traded / signed).
  return Number.isInteger(check.dueSeason);
}

/**
 * Make a promise from maker to target. Validates kind + check shape
 * (throws on bad input — a malformed promise must never be stored).
 * A promise implies a working relationship: when maker and target have
 * none, a "management" relationship is created at PROMISE_RELATIONSHIP_START.
 * An identical open promise (same maker, target, kind, check) is
 * returned as-is instead of duplicated. Returns the promise record.
 */
export function makePromise(
  account,
  { makerId, targetId, kind, text, textEn = null, madeSeason = null, madeGame = 0, check } = {},
) {
  if (!account) throw new Error("makePromise: no account");
  if (!isNonEmptyString(makerId) || !isNonEmptyString(targetId) || makerId === targetId) {
    throw new Error("makePromise: maker and target must be different people");
  }
  if (!PROMISE_KINDS.includes(kind)) throw new Error(`makePromise: unknown kind ${kind}`);
  if (!validateCheck(kind, check)) throw new Error(`makePromise: invalid check for ${kind}`);
  if (!isNonEmptyString(text)) throw new Error("makePromise: text is required");
  const store = relationshipsStore(account);
  const sameCheck = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const existing = store.promises.find(
    (p) =>
      p.status === "open" && p.makerId === makerId && p.targetId === targetId
      && p.kind === kind && sameCheck(p.check, check),
  );
  if (existing) return existing;
  if (!relationshipBetween(account, makerId, targetId)) {
    addRelationship(account, { aId: makerId, bId: targetId, kind: "management", strength: PROMISE_RELATIONSHIP_START, season: madeSeason });
  }
  const promise = {
    id: `promise_${makerId}_${targetId}_${kind}_${madeSeason ?? "?"}_${madeGame}`,
    makerId,
    targetId,
    kind,
    text,
    ...(isNonEmptyString(textEn) ? { textEn } : {}),
    madeSeason: Number.isInteger(madeSeason) ? madeSeason : null,
    madeGame: Number.isInteger(madeGame) ? madeGame : 0,
    check: { ...check },
    status: "open",
    resolvedSeason: null,
    effect: null,
  };
  // Re-read the store: addRelationship above may have written it.
  const fresh = relationshipsStore(account);
  fresh.promises.push(promise);
  writeStore(account, fresh);
  return promise;
}

/**
 * Pure evaluation of one promise against the target's current season
 * state. `state` is the caller's snapshot for the TARGET player:
 * { season, game, gamesPlayed, mpg, role, started, traded, signed }.
 * Returns "fulfilled" | "broken" | "open". A deadline that has not
 * arrived yet can never break a promise; a met condition fulfills it
 * early, before the deadline.
 */
export function evaluatePromise(promise, state = {}) {
  if (!promise || promise.status !== "open") return promise?.status || "open";
  const check = promise.check || {};
  const game = Number.isInteger(state.game) ? state.game : null;
  const season = Number.isInteger(state.season) ? state.season : null;
  if (check.type === "minutes") {
    const met =
      Number.isFinite(state.gamesPlayed) && state.gamesPlayed >= check.minGames
      && Number.isFinite(state.mpg) && state.mpg >= check.minMpg;
    if (met) return "fulfilled";
    if (game !== null && game >= promise.madeGame + check.dueAfterGames) return "broken";
    return "open";
  }
  if (check.type === "role") {
    const rank = ROLE_RANK[state.role];
    if (rank !== undefined && rank >= ROLE_RANK[check.role]) return "fulfilled";
    if (game !== null && game >= promise.madeGame + check.dueAfterGames) return "broken";
    return "open";
  }
  if (check.type === "start") {
    if (state.started === true) return "fulfilled";
    if (game !== null && game >= promise.madeGame + check.dueAfterGames) return "broken";
    return "open";
  }
  if (check.type === "trade") {
    if (state.traded === true) return "fulfilled";
    if (season !== null && season > check.dueSeason) return "broken";
    return "open";
  }
  if (check.type === "contract") {
    if (state.signed === true) return "fulfilled";
    if (season !== null && season > check.dueSeason) return "broken";
    return "open";
  }
  return "open";
}

/** The effect of a resolved promise. Pure; the numbers are the contract
 * the trust / negotiation consumers read. */
export function promiseEffect(promise, outcome) {
  if (outcome === "fulfilled") {
    return {
      outcome: "fulfilled",
      trustDelta: PROMISE_TRUST_FULFILLED,
      relationshipDelta: PROMISE_REL_FULFILLED,
      negotiationDelta: NEGOTIATION_STEP,
      label: "承诺兑现",
      labelEn: "Promise kept",
      applied: false,
    };
  }
  return {
    outcome: "broken",
    trustDelta: PROMISE_TRUST_BROKEN,
    relationshipDelta: PROMISE_REL_BROKEN,
    negotiationDelta: -NEGOTIATION_STEP,
    label: "承诺落空",
    labelEn: "Promise broken",
    applied: false,
  };
}

/**
 * Resolve every open promise whose outcome is now decidable against the
 * state snapshot. For each resolution: the promise status + effect are
 * stored, the maker-target relationship moves, and a legacy event is
 * written. Idempotent: a second call with the same state resolves
 * nothing (resolved promises are never re-evaluated).
 * Returns { resolved: [effect...], count }.
 */
export function resolveDuePromises(account, state = {}) {
  if (!account) return { resolved: [], count: 0 };
  const store = relationshipsStore(account);
  const resolved = [];
  for (const promise of store.promises) {
    if (promise.status !== "open") continue;
    const outcome = evaluatePromise(promise, state);
    if (outcome === "open") continue;
    const effect = promiseEffect(promise, outcome);
    promise.status = outcome;
    promise.resolvedSeason = Number.isInteger(state.season) ? state.season : promise.madeSeason;
    promise.effect = { ...effect, promiseId: promise.id, targetId: promise.targetId, makerId: promise.makerId };
    const rel = relationshipBetween(account, promise.makerId, promise.targetId);
    if (rel) {
      adjustRelationship(account, rel.id, effect.relationshipDelta, `${effect.label}: ${promise.text}`);
    }
    // Re-read: adjustRelationship wrote the store; the promise object
    // above is the same reference, so its mutation survives.
    appendLegacyEvent(account, {
      type: "promise",
      season: promise.resolvedSeason,
      summary: `${effect.label}：${promise.text}`,
      summaryEn: `${effect.labelEn}: ${promise.textEn || promise.text}`,
      data: { promiseId: promise.id, outcome, trustDelta: effect.trustDelta },
    });
    resolved.push(promise.effect);
  }
  writeStore(account, relationshipsStore(account));
  return { resolved, count: resolved.length };
}

/** Resolved promise effects not yet applied to a trust consumer. */
export function pendingTrustEffects(account) {
  return promisesOf(account)
    .filter((p) => p.status !== "open" && p.effect && p.effect.applied !== true && Number.isFinite(p.effect.trustDelta))
    .map((p) => ({
      promiseId: p.id,
      targetId: p.targetId,
      makerId: p.makerId,
      outcome: p.status,
      trustDelta: p.effect.trustDelta,
      targetBref: personById(account, p.targetId)?.bref || null,
    }));
}

/** Mark promise effects applied (after the trust consumer persisted them). */
export function markTrustEffectsApplied(account, promiseIds = []) {
  if (!account || !Array.isArray(promiseIds) || !promiseIds.length) return account;
  const store = relationshipsStore(account);
  const ids = new Set(promiseIds);
  for (const promise of store.promises) {
    if (ids.has(promise.id) && promise.effect) promise.effect.applied = true;
  }
  return writeStore(account, store);
}

/**
 * Apply promise trust effects to a live Reborn run. Pure: returns a new
 * root with root.reborn.player.coachTrust moved by the summed deltas
 * (clamped 0-100, the trust.js scale) and a promise-resolved entry in
 * the event log. Effects whose targetBref is set and does not match the
 * run's player bref are skipped — a promise to someone else is not your
 * trust. Roots without a Reborn run are returned unchanged.
 * The caller persists the returned root and marks the effects applied.
 */
export function applyPromiseTrustToRoot(root, effects = []) {
  if (!root || !root.reborn || !root.reborn.player || !Array.isArray(effects) || !effects.length) return root;
  const playerBref = root.reborn.identity?.bref || null;
  const applicable = effects.filter(
    (e) => Number.isFinite(e.trustDelta) && (!e.targetBref || !playerBref || e.targetBref === playerBref),
  );
  if (!applicable.length) return root;
  const delta = applicable.reduce((sum, e) => sum + e.trustDelta, 0);
  const next = structuredClone(root);
  const before = Number.isFinite(next.reborn.player.coachTrust) ? next.reborn.player.coachTrust : 25;
  next.reborn.player.coachTrust = Math.max(0, Math.min(100, Math.round(before + delta)));
  const log = Array.isArray(next.story?.eventLog) ? next.story.eventLog : [];
  next.story = {
    ...(next.story || {}),
    eventLog: [
      ...log,
      {
        type: "promise-resolved",
        promiseIds: applicable.map((e) => e.promiseId),
        delta,
        trustBefore: before,
        trustAfter: next.reborn.player.coachTrust,
        at: Date.now(),
      },
    ],
  };
  return next;
}

// ------------------------------------------------------- negotiation / rivalry

/**
 * Negotiation standing with one party, from the resolved promise record
 * with them: +1 per kept promise, -1 per broken one, capped at +/-2.
 * This is the modifier the GM negotiation layer reads when pricing a
 * deal — a party you burned charges more; a party you kept faith with
 * deals easier. Pure.
 */
export function negotiationStanding(account, partyId) {
  if (!isNonEmptyString(partyId)) return { modifier: 0, fulfilled: 0, broken: 0, label: "", labelEn: "" };
  let fulfilled = 0;
  let broken = 0;
  for (const p of promisesOf(account)) {
    if (p.status === "open") continue;
    if (p.makerId !== partyId && p.targetId !== partyId) continue;
    if (p.status === "fulfilled") fulfilled += 1;
    if (p.status === "broken") broken += 1;
  }
  const modifier = Math.max(-NEGOTIATION_CAP, Math.min(NEGOTIATION_CAP, (fulfilled - broken) * NEGOTIATION_STEP));
  const label =
    modifier > 0 ? `信守承诺 ×${fulfilled}，谈判更顺利` : modifier < 0 ? `失信 ×${broken}，对方要价更高` : "无承诺记录，正常谈判";
  const labelEn =
    modifier > 0 ? `${fulfilled} promises kept — smoother talks` : modifier < 0 ? `${broken} promises broken — they ask for more` : "No promise history — standard terms";
  return { modifier, fulfilled, broken, label, labelEn };
}

/**
 * The stakes of the next key game against a rival: an active rivalry
 * with the opponent, its strength, and the trust swing on the line.
 * Stakes change what the game means, never the dice.
 */
export function rivalryStakes(account, opponentBref) {
  const empty = { active: false, strength: 0, trustSwing: 0, label: "", labelEn: "" };
  if (!isNonEmptyString(opponentBref)) return empty;
  const person = peopleOf(account).find((p) => p.bref === opponentBref || p.id === opponentBref);
  if (!person) return empty;
  const rel = relationshipsOf(account).find(
    (r) => r.kind === "rivalry" && r.state === "active" && (r.aId === person.id || r.bId === person.id),
  );
  if (!rel) return empty;
  const trustSwing = Math.round(clamp100(rel.strength) / 25);
  return {
    active: true,
    strength: clamp100(rel.strength),
    trustSwing,
    label: `宿敌对决：胜负将影响 ${trustSwing} 点信任`,
    labelEn: `Rivalry game: ${trustSwing} trust on the line`,
  };
}

/**
 * Record a game against a rival: a win heats the rivalry up (+4), a
 * loss cools it (-4). Writes a legacy event. Returns the rivalry record
 * (or null when no active rivalry exists with that opponent).
 */
export function recordRivalryGame(account, { season = null, opponentBref, won } = {}) {
  if (!account || !isNonEmptyString(opponentBref) || typeof won !== "boolean") return null;
  const person = peopleOf(account).find((p) => p.bref === opponentBref || p.id === opponentBref);
  if (!person) return null;
  const rel = relationshipsOf(account).find(
    (r) => r.kind === "rivalry" && r.state === "active" && (r.aId === person.id || r.bId === person.id),
  );
  if (!rel) return null;
  const delta = won ? RIVALRY_WIN_DELTA : RIVALRY_LOSS_DELTA;
  const updated = adjustRelationship(account, rel.id, delta, won ? "宿敌对决取胜" : "宿敌对决落败");
  appendLegacyEvent(account, {
    type: "rivalry-game",
    season,
    summary: `宿敌对决${won ? "取胜" : "落败"}：${person.name}`,
    summaryEn: `Rivalry game ${won ? "won" : "lost"} vs ${person.nameEn || person.name}`,
    data: { opponentBref, won, strength: updated?.strength ?? rel.strength },
  });
  return updated;
}

// ------------------------------------------------------------------- legacy

/**
 * Append a legacy event. Dedupe: an event with the same caller-supplied
 * id is never written twice. Returns the account (mutated in place).
 */
export function appendLegacyEvent(account, { id = null, type, season = null, year = null, summary, summaryEn = null, data = null } = {}) {
  if (!account || !LEGACY_EVENT_TYPES.includes(type) || !isNonEmptyString(summary)) return account;
  const store = relationshipsStore(account);
  const eventId = isNonEmptyString(id) ? id : `${type}:${season ?? "?"}:${summary}`;
  if (store.legacy.some((e) => e.id === eventId)) return account;
  store.legacy.push({
    id: eventId,
    type,
    season: Number.isInteger(season) ? season : null,
    ...(Number.isInteger(year) ? { year } : {}),
    summary,
    ...(isNonEmptyString(summaryEn) ? { summaryEn } : {}),
    ...(data && typeof data === "object" ? { data } : {}),
  });
  return writeStore(account, store);
}

/** A career transition: new team, new role, retirement, comeback. */
export function recordCareerTransition(account, { id = null, season = null, year = null, from = null, to = null, reason = null } = {}) {
  const summary = `职业转折：${from || "—"} → ${to || "—"}${reason ? `（${reason}）` : ""}`;
  const summaryEn = `Career move: ${from || "—"} → ${to || "—"}${reason ? ` (${reason})` : ""}`;
  return appendLegacyEvent(account, { id, type: "transition", season, year, summary, summaryEn, data: { from, to, reason } });
}

/** A trade the account made or was part of. */
export function recordTradeDecision(account, { id = null, season = null, year = null, playerName, playerBref = null, fromTeam = null, toTeam = null, note = null } = {}) {
  if (!isNonEmptyString(playerName)) return account;
  const summary = `交易：${playerName} ${fromTeam || "?"} → ${toTeam || "?"}${note ? `（${note}）` : ""}`;
  const summaryEn = `Trade: ${playerName} ${fromTeam || "?"} → ${toTeam || "?"}${note ? ` (${note})` : ""}`;
  return appendLegacyEvent(account, { id, type: "trade", season, year, summary, summaryEn, data: { playerName, playerBref, fromTeam, toTeam, note } });
}

/** A draft pick the account made. */
export function recordDraftDecision(account, { id = null, season = null, year = null, pick = null, playerName, playerBref = null, note = null } = {}) {
  if (!isNonEmptyString(playerName)) return account;
  const summary = `选秀：第${pick ?? "?"}顺位选中 ${playerName}${note ? `（${note}）` : ""}`;
  const summaryEn = `Draft: picked ${playerName} at #${pick ?? "?"}${note ? ` (${note})` : ""}`;
  return appendLegacyEvent(account, { id, type: "draft", season, year, summary, summaryEn, data: { pick, playerName, playerBref, note } });
}

/**
 * A historical divergence: what actually happened in real history vs
 * what happened in this timeline, and what caused it. This is the
 * record the news / history UI reads — one entry per divergence, in
 * the account's own words, never a global "deviation percentage".
 */
export function recordDivergence(account, { id = null, season = null, year = null, subject, realOutcome, newOutcome, cause = null } = {}) {
  if (!isNonEmptyString(subject) || !isNonEmptyString(realOutcome) || !isNonEmptyString(newOutcome)) return account;
  const summary = `历史偏离：${subject} —— 原本${realOutcome}，如今${newOutcome}${cause ? `（${cause}）` : ""}`;
  const summaryEn = `Divergence: ${subject} — in real history ${realOutcome}; in this timeline ${newOutcome}${cause ? ` (${cause})` : ""}`;
  return appendLegacyEvent(account, {
    id,
    type: "divergence",
    season,
    year,
    summary,
    summaryEn,
    data: { subject, realOutcome, newOutcome, cause },
  });
}

/**
 * Presentation-ready legacy summary, in the architectTitlesFor() style:
 * counts, the record grouped by kind, and deterministic headlines
 * (most recent legacy events first, max 5). My World reads this later;
 * this module never touches myWorld files.
 */
export function legacySummaryFor(account) {
  const store = relationshipsStore(account);
  const byType = (type) => store.legacy.filter((e) => e.type === type);
  const promises = store.promises;
  const open = promises.filter((p) => p.status === "open").length;
  const fulfilled = promises.filter((p) => p.status === "fulfilled").length;
  const broken = promises.filter((p) => p.status === "broken").length;
  const sorted = [...store.legacy].sort((a, b) => {
    const sa = a.season ?? -1;
    const sb = b.season ?? -1;
    return sb - sa;
  });
  return {
    people: store.people.length,
    rivalries: store.relationships.filter((r) => r.kind === "rivalry" && r.state === "active").length,
    mentorships: store.relationships.filter((r) => r.kind === "mentorship" && r.state === "active").length,
    promises: { open, fulfilled, broken },
    transitions: byType("transition"),
    trades: byType("trade"),
    drafts: byType("draft"),
    divergences: byType("divergence"),
    headlines: sorted.slice(0, 5).map((e) => ({
      zh: e.summary,
      en: e.summaryEn || e.summary,
      season: e.season,
      type: e.type,
    })),
  };
}
