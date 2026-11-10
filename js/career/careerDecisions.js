/**
 * Career Decisions (Career 2.0, workstream A).
 *
 * Validates inbox decisions and applies them as structured results.
 * Every decision records three things, so the player can always see why
 * something happened and when to expect the rest of it:
 *
 *   - reason — why this consequence follows from the choice (zh/en);
 *   - effects — the immediate state change, in the same vocabulary as
 *     js/story/eventEngine.js ({ trust, mediaPressure, divergence,
 *     relationship, flags });
 *   - followUp — what is still pending and when it resolves (a promise
 *     with a game-index deadline, a flag another system consumes, or
 *     nothing).
 *
 * Promises are the commitment system the user asked for: a promise (e.g.
 * "more minutes in the next 5 games") is recorded with its deadline and
 * its check condition, and checkPromises() settles it automatically once
 * the deadline passes — against the per-game evidence log
 * (recordGameEvidence), never against a summary or a guess. Fulfilled
 * promises raise trust; broken ones cost trust and set a flag other
 * systems can react to (e.g. a trade request).
 *
 * Pure functions: every function takes (inbox, state, ...) and returns
 * new objects; nothing here touches the DOM, storage, or GameSim.
 */
import { inboxEventById } from "./careerInbox.js";

/** Clamp helper (trust and pressure live on the 0-100 scale). */
function clamp100(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Apply an effect bundle to a career state. Returns a new state object.
 * Relationship keys are the eventEngine vocabulary (owner / players /
 * gm / coach / media); unknown keys are ignored, never invented.
 */
export function applyInboxEffects(state, effects = {}) {
  const next = structuredClone(state);
  next.trust = clamp100((next.trust ?? 25) + (effects.trust || 0));
  next.mediaPressure = clamp100((next.mediaPressure ?? 0) + (effects.mediaPressure || 0));
  next.divergence = Math.max(0, (next.divergence ?? 0) + (effects.divergence || 0));
  next.relationships = { ...(next.relationships || {}) };
  for (const [key, value] of Object.entries(effects.relationship || {})) {
    next.relationships[key] = (next.relationships[key] || 0) + value;
  }
  next.flags = { ...(next.flags || {}), ...(effects.flags || {}) };
  return next;
}

/** The pending instance for an event id, or null. */
export function pendingInstance(inbox, eventId) {
  return inbox.pending.find((entry) => entry.eventId === eventId) || null;
}

/**
 * Validate that a decision can be made. Throws on: unknown event,
 * unknown choice, or no pending instance (already resolved, or never
 * screened). Callers surface the message; the inbox is never half-updated.
 */
export function validateDecision(inbox, eventId, choiceId) {
  const event = inboxEventById(eventId);
  const choice = event.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) throw new RangeError(`unknown choice for inbox event: ${choiceId}`);
  const instance = pendingInstance(inbox, eventId);
  if (!instance) throw new Error(`no pending inbox event: ${eventId}`);
  return { event, choice, instance };
}

/**
 * Make a decision. Returns { inbox, state, result } — the inbox with the
 * instance moved pending -> resolved (and the choice recorded in history),
 * the state with the effects applied, and the structured result:
 *
 *   result = {
 *     eventId, choiceId, instanceId,
 *     reason, reasonEn,          // why this consequence follows
 *     effects,                   // the immediate change, verbatim
 *     followUp: [{ kind, text, textEn, dueGame }],  // what is still pending
 *     promise,                   // the recorded promise, or null
 *     at, gameIndex, year,
 *   }
 */
export function applyDecision(inbox, state, eventId, choiceId, { gameIndex = 0, year = 1997 } = {}) {
  const { event, choice, instance } = validateDecision(inbox, eventId, choiceId);
  const nextInbox = structuredClone(inbox);
  const nextState = applyInboxEffects(state, choice.effects || {});

  // The instance leaves the pending queue and lands in resolved + history.
  nextInbox.pending = nextInbox.pending.filter((entry) => entry.instanceId !== instance.instanceId);
  const historyEntry = {
    type: "story-choice",
    instanceId: instance.instanceId,
    eventId,
    choiceId,
    year,
    gameIndex,
    effects: structuredClone(choice.effects || {}),
    at: Date.now(),
  };
  nextInbox.resolved.push({
    instanceId: instance.instanceId,
    eventId,
    choiceId,
    gameIndex,
    year,
    at: Date.now(),
  });
  nextInbox.history.push(historyEntry);
  while (nextInbox.history.length > 200) nextInbox.history.shift();

  // A choice that carries a promise records it with its deadline and
  // check condition; checkPromises() settles it later, automatically.
  let promise = null;
  if (choice.promise) {
    promise = {
      id: `promise:${instance.instanceId}:${choiceId}`,
      instanceId: instance.instanceId,
      eventId,
      choiceId,
      kind: choice.promise.kind,
      text: choice.promise.text,
      textEn: choice.promise.textEn,
      madeAtGame: gameIndex,
      dueGame: gameIndex + choice.promise.games,
      condition: {
        minCorePtsPerGame: choice.promise.minCorePtsPerGame,
        games: choice.promise.games,
      },
      status: "open",
      resolvedAtGame: null,
      at: Date.now(),
    };
    nextInbox.promises.push(promise);
  }

  // Choice flags land on both the state and the inbox, so screening (which
  // reads inbox.flags via the context) and other systems see them.
  const choiceFlags = choice.flags || {};
  nextInbox.flags = { ...(nextInbox.flags || {}), ...choiceFlags };
  // Per-instance flags (prospect investigated / veteran traded, ...) are
  // namespaced by instance so one event's flag never collides with another's.
  if (event.id === "scout-report-gem" && instance.facts?.prospect?.bref) {
    const bref = instance.facts.prospect.bref;
    const key = choiceId === "pass" ? `prospect-passed:${bref}` : `prospect-${choiceId}:${bref}`;
    nextInbox.flags[key] = true;
    nextState.flags[key] = true;
  }
  if (event.id === "trade-deadline-interest" && instance.facts?.veteran?.id) {
    const key = `deadline-veteran:${instance.facts.veteran.id}:${choiceId}`;
    nextInbox.flags[key] = true;
    nextState.flags[key] = true;
  }

  const followUp = [];
  if (promise) {
    followUp.push({
      kind: "promise",
      text: `承诺将在第 ${promise.dueGame + 1} 场后自动检查（${promise.text}）。`,
      textEn: `This promise is checked automatically after game ${promise.dueGame + 1} (${promise.textEn}).`,
      dueGame: promise.dueGame,
    });
  }
  if (choiceId === "ask-more") {
    followUp.push({
      kind: "negotiation",
      text: "对方是否回价由谈判系统决定（GM 线）；本决定只记录了你的要价。",
      textEn: "Whether they come back is for the negotiation system (GM line); this decision only records your ask.",
      dueGame: null,
    });
  }
  if (choiceId === "investigate") {
    followUp.push({
      kind: "scouting",
      text: "试训报告已写入生涯记录；球探系统（GM 线）可消费这条标记。",
      textEn: "The tryout report is in the career record; the scouting system (GM line) can consume this flag.",
      dueGame: null,
    });
  }

  const result = {
    eventId,
    choiceId,
    instanceId: instance.instanceId,
    reason:
      `选择了「${choice.label}」：${choice.description}后果：${choice.consequence}`,
    reasonEn:
      `Chose "${choice.labelEn}": ${choice.descriptionEn} Consequence: ${choice.consequenceEn}`,
    effects: structuredClone(choice.effects || {}),
    followUp,
    promise: promise ? structuredClone(promise) : null,
    at: Date.now(),
    gameIndex,
    year,
  };
  return { inbox: nextInbox, state: nextState, result };
}

/**
 * Settle every open promise whose deadline has passed, against the
 * per-game evidence log. A promise is fulfilled only when the recorded
 * evidence meets its condition over the promised games; otherwise it is
 * broken. Returns { inbox, state, settled } — settled is the list of
 * { promise, fulfilled, reason, reasonEn, effects } so the view can show
 * exactly what happened and why.
 *
 * The check is deterministic: same evidence, same verdict. A game with no
 * recorded core line counts as 0 points for that game (missing evidence
 * never silently passes a promise).
 */
export function checkPromises(inbox, state, { gameIndex = 0 } = {}) {
  const nextInbox = structuredClone(inbox);
  let nextState = structuredClone(state);
  const settled = [];
  for (const promise of nextInbox.promises) {
    if (promise.status !== "open") continue;
    if (gameIndex < promise.dueGame) continue;
    const window = nextInbox.evidence.filter(
      (entry) => entry.gameIndex > promise.madeAtGame && entry.gameIndex <= promise.dueGame,
    );
    const games = promise.condition.games || 1;
    const total = window.reduce((sum, entry) => sum + (Number.isFinite(entry.corePts) ? entry.corePts : 0), 0);
    const avg = window.length ? total / window.length : 0;
    const fulfilled = window.length >= games && avg >= (promise.condition.minCorePtsPerGame ?? 0);
    promise.status = fulfilled ? "fulfilled" : "broken";
    promise.resolvedAtGame = gameIndex;
    const effects = fulfilled
      ? { trust: 5, relationship: { players: 3 } }
      : { trust: -6, relationship: { players: -4 } };
    nextState = applyInboxEffects(nextState, effects);
    if (!fulfilled) {
      nextState.flags[`promise-broken:${promise.id}`] = true;
      nextInbox.flags[`promise-broken:${promise.id}`] = true;
    }
    nextInbox.history.push({
      type: "promise-settled",
      instanceId: promise.instanceId,
      eventId: promise.eventId,
      choiceId: promise.choiceId,
      promiseId: promise.id,
      fulfilled,
      avgCorePts: Math.round(avg * 10) / 10,
      gamesObserved: window.length,
      year: 1997,
      gameIndex,
      effects: structuredClone(effects),
      at: Date.now(),
    });
    while (nextInbox.history.length > 200) nextInbox.history.shift();
    settled.push({
      promise: structuredClone(promise),
      fulfilled,
      reason: fulfilled
        ? `承诺兑现：核心在承诺的 ${games} 场里场均 ${Math.round(avg * 10) / 10} 分（要求 ${promise.condition.minCorePtsPerGame}+），信任 +5。`
        : `承诺违约：核心在承诺的 ${games} 场里场均 ${Math.round(avg * 10) / 10} 分（要求 ${promise.condition.minCorePtsPerGame}+，只观察到 ${window.length} 场），信任 −6。`,
      reasonEn: fulfilled
        ? `Promise kept: the core averaged ${Math.round(avg * 10) / 10} pts over the promised ${games} games (needed ${promise.condition.minCorePtsPerGame}+), trust +5.`
        : `Promise broken: the core averaged ${Math.round(avg * 10) / 10} pts over the promised ${games} games (needed ${promise.condition.minCorePtsPerGame}+, only ${window.length} games observed), trust −6.`,
      effects: structuredClone(effects),
    });
  }
  return { inbox: nextInbox, state: nextState, settled };
}

/** Open promises, oldest first. */
export function openPromises(inbox) {
  return (inbox.promises || []).filter((entry) => entry.status === "open");
}
