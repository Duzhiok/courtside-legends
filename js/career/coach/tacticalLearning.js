/**
 * Coach tactical learning — the three tactical indicators (workstream B,
 * Career 2.0). Pure module: no sim import, no randomness, no dice.
 *
 * Audit verdict (see docs/implementation/coach-tactical-depth-design.md):
 * - Familiarity: the engine already computes execution quality from the
 *   roster (`lineupFit` / `systemFitScore` / `t.fit`), so this module stores
 *   only the *history* of running each system and reads the engine's live
 *   fit as the execution signal. No new engine field.
 * - Buy-in: the engine already consumes morale / mood / chem (and the
 *   shout() backfire is literally a buy-in check), so buy-in is a *derived
 *   readout* from live morale + fit + the promise record. No stored bonus.
 * - Opponent readiness: NO engine consumer exists (the opponent AI reacts
 *   to score/clock/roster but keeps no memory of your system), so it is a
 *   new field — stored here in the career record, consumed by the moment
 *   generator, the decision preview, and the post-game measurement.
 *
 * Nothing in this module ever touches a shooting or possession probability.
 * The gameplay effect of every indicator is delivered by the coach's own
 * choices through the existing sim interfaces (setTactic / setFocusPlay /
 * setTempo / setDefenseScheme / callTimeout / submitDecision).
 */

import { TACTICS } from "../../data/coaches.js";
import { REPUTATION_GOAL_HIT, REPUTATION_GOAL_MISS } from "../balance.js";

const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** A fresh tactical-learning record. Additive, serializable, namespaced. */
export function createTacticalState() {
  return { version: 1, systems: {}, promises: [], gamesPlayed: 0 };
}

function systemRecord(state, tacticId) {
  const rec = state.systems?.[tacticId];
  return rec || { games: 0, possessions: 0, exposures: {}, gamesSinceRun: 0, lastResult: null };
}

/**
 * Record one game in which a system was run. Returns a NEW state (the input
 * is never mutated, so tests can hold the before/after side by side).
 * `possessions` counts the possessions played under the system in that game;
 * `opponentKey` (e.g. "CLE:2016") is whose film the exposure goes into.
 */
export function recordSystemRun(state, tacticId, { opponentKey = null, possessions = 0, won = null } = {}) {
  const next = { ...state, systems: { ...(state.systems || {}) }, promises: state.promises || [] };
  // Every system ages one game; the one just run resets its staleness.
  for (const [id, rec] of Object.entries(next.systems)) {
    next.systems[id] = { ...rec, exposures: { ...(rec.exposures || {}) }, gamesSinceRun: (rec.gamesSinceRun || 0) + 1 };
  }
  const prev = systemRecord(next, tacticId);
  const exposures = { ...(prev.exposures || {}) };
  if (opponentKey) exposures[opponentKey] = (exposures[opponentKey] || 0) + 1;
  next.systems[tacticId] = {
    games: prev.games + 1,
    possessions: prev.possessions + Math.max(0, possessions | 0),
    exposures,
    gamesSinceRun: 0,
    lastResult: won === null ? prev.lastResult : !!won,
  };
  next.gamesPlayed = (next.gamesPlayed || 0) + 1;
  return next;
}

/**
 * Tactical Familiarity, 0–100: how well the team knows the system, from how
 * often it was actually run. ~6 games to feel familiar; a system left
 * unused decays 4 points per game (stale systems are forgotten).
 */
export function familiarityOf(state, tacticId) {
  const rec = systemRecord(state, tacticId);
  const base = 100 * (1 - Math.pow(0.85, rec.games));
  return clamp100(base - 4 * (rec.gamesSinceRun || 0));
}

/**
 * Player Buy-in, 0–100: a *readout*, not a stored number. It is derived from
 * the engine's live morale and fit (both real sim state) plus the promise
 * record: a kept promise lifts it, a broken one drops it.
 */
export function buyInOf({ morale = 50, fit = 50, promisesKept = 0, promisesBroken = 0 } = {}) {
  return clamp100(0.55 * morale + 0.45 * fit - 8 * promisesBroken + 3 * promisesKept);
}

export function buyInLabel(buyIn) {
  if (buyIn >= 70) return "bought-in";
  if (buyIn >= 45) return "wavering";
  return "tuned-out";
}

/**
 * Opponent Readiness, 0–100: how prepared this opponent is for the system,
 * from how many times they have actually faced it. 4 exposures = fully read.
 * No engine consumer exists for this — it is informational (moment
 * generation, preview, measured attribution), never a sim modifier.
 */
export function opponentReadinessOf(state, tacticId, opponentKey) {
  if (!opponentKey) return 0;
  const rec = systemRecord(state, tacticId);
  return clamp100((rec.exposures?.[opponentKey] || 0) * 25);
}

export function opponentReadinessLabel(readiness) {
  if (readiness >= 75) return "solved";
  if (readiness >= 50) return "read";
  if (readiness >= 25) return "scouted";
  return "unseen";
}

/**
 * Execution risk for running a system right now, from familiarity + the
 * engine's live fit + buy-in. Shown in the decision preview so the player
 * can tell a shaky call from a solid one before committing.
 */
export function executionRisk({ familiarity = 0, fit = 50, buyIn = 50 } = {}) {
  const reasons = [];
  if (familiarity < 30) reasons.push("low familiarity — the team has barely run this system");
  if (fit < 55) reasons.push("poor roster fit for this system");
  if (buyIn < 45) reasons.push("players are tuned out — buy-in is low");
  if (familiarity >= 60 && fit >= 65 && buyIn >= 70) {
    return { level: "solid", reasons: ["familiar system, good fit, players bought in"] };
  }
  if (reasons.length >= 2) return { level: "risky", reasons };
  if (reasons.length === 1) return { level: "shaky", reasons };
  return { level: "solid", reasons: ["no red flags"] };
}

/**
 * Code-verified trade-offs for the choices the slice offers. Each entry cites
 * the sim.js consumption it describes — the preview quotes these, never the
 * TACTICS-table marketing copy (switch_all's desc admits "换防本身没有单独
 * 逻辑"; zone_drop's desc admits the corner weakness "目前没有对应实现").
 */
export const TACTIC_TRADEOFFS = Object.freeze({
  switch_all: Object.freeze({
    lever: "setTactic('switch_all')",
    effect: "defense ×1.10, offense ×0.99 (sim.js:4427–4428); execution from roster fit (lineupFit)",
    downside: "fit-gated — needs switch-capable archetypes (switch_big / two_way_star / pest / versatile_big); a roster without them executes it poorly, and the offense dips slightly",
  }),
  zone_drop: Object.freeze({
    lever: "setTactic('zone_drop')",
    effect: "defense ×1.08, pace ×0.95, own threeRate ×1.05 (sim.js:885, 4427–4428)",
    downside: "slower pace means fewer possessions — costly when chasing 10 points; the advertised mid-range concession and corner weakness are not implemented, so don't count on them (or fear them)",
  }),
  pack_paint: Object.freeze({
    lever: "setTactic('pack_paint')",
    effect: "block chance ×1.25 (sim.js:3831), paint shot base −0.07 (sim.js:4480)",
    downside: "kick-out open +0.08 (sim.js:4295) — a team with real shooters will punish the collapse from three",
  }),
  double_hot_hand: Object.freeze({
    lever: "setDefenseScheme('double', starId)",
    effect: "double-team forces kick-outs (sim.js:794–837); the star's looks get harder",
    downside: "the kick goes to an open teammate — if the kick-out shooter is good, you traded a hard two for an open three",
  }),
  timeout_talk: Object.freeze({
    lever: "callTimeout() + talk()",
    effect: "morale +4, chem +3 (sim.js:2301); a timeout breaks the opponent's run (sim.js:1482)",
    downside: "costs one of 7 timeouts — you may need it more in the final two minutes",
  }),
  pace_three: Object.freeze({
    lever: "setFocusPlay('pace_three')",
    effect: "focus lasts ~6 offensive possessions (sim.js:1573); pace_three leans on threes",
    downside: "the defense stays as-is — if the shots don't fall, the run continues",
  }),
  iso_star: Object.freeze({
    lever: "setFocusPlay('iso_star')",
    effect: "the ball goes to the best scorer for ~6 possessions (sim.js:1573)",
    downside: "predictable — the opponent can load up on one player, and everyone else goes cold",
  }),
  grind: Object.freeze({
    lever: "setTempo('grind') + setFocusPlay('slow_pace')",
    effect: "pace ×0.7, make +0.032, open +0.045, turnovers ×0.78 (gameplan.js TEMPO_OPTIONS)",
    downside: "fewer possessions — a deficit erases slowly, and one empty trip costs more",
  }),
  push: Object.freeze({
    lever: "setTempo('push') + setFocusPlay('pace_three')",
    effect: "pace ×1.32, more possessions (gameplan.js TEMPO_OPTIONS)",
    downside: "rushed shots (make −0.024, open −0.035) and more turnovers (×1.22)",
  }),
});

export function tradeoffFor(choiceId) {
  return TACTIC_TRADEOFFS[choiceId] || null;
}

export function tacticName(tacticId, lang = "zh") {
  const t = TACTICS?.[tacticId];
  if (!t) return tacticId;
  return lang === "en" ? t.nameEn || t.name : t.name;
}

/** Promise kinds the slice settles against the real event log. */
export const PROMISE_KINDS = Object.freeze(["star-touches", "defense-holds", "comeback"]);

/**
 * Record a promise the coach makes in a moment (e.g. "the star gets more
 * touches over the next stretch"). Data only — the check runs later against
 * the real game log, so a promise can never be settled by assertion.
 */
export function recordPromise(state, { id, text, kind, targetId = null, threshold = 0, duePossessions = 6 } = {}) {
  if (!PROMISE_KINDS.includes(kind)) throw new Error(`unknown promise kind: ${kind}`);
  const next = { ...state, systems: state.systems || {}, promises: [...(state.promises || [])] };
  next.promises.push({ id, text, kind, targetId, threshold, duePossessions, status: "open", settledAt: null });
  return next;
}

/**
 * Settle open promises against measured evidence from the game log.
 * evidence: { starAttempts, opponentPoints, deficitChange } over the window
 * since the promise was made. Returns { state, settled: [...] }.
 */
export function settlePromises(state, evidence = {}) {
  const settled = [];
  const promises = (state.promises || []).map((p) => {
    if (p.status !== "open") return p;
    let kept = null;
    if (p.kind === "star-touches") kept = (evidence.starAttempts ?? 0) >= p.threshold;
    else if (p.kind === "defense-holds") kept = (evidence.opponentPoints ?? 99) <= p.threshold;
    else if (p.kind === "comeback") kept = (evidence.deficitChange ?? 0) <= -p.threshold;
    if (kept === null) return p;
    const done = { ...p, status: kept ? "kept" : "broken", settledAt: Date.now() };
    settled.push(done);
    return done;
  });
  return { state: { ...state, promises }, settled };
}

export function promiseCounts(state) {
  const list = state.promises || [];
  return {
    kept: list.filter((p) => p.status === "kept").length,
    broken: list.filter((p) => p.status === "broken").length,
    open: list.filter((p) => p.status === "open").length,
  };
}

/**
 * The career consequence of the challenge, through the existing reputation
 * system — the goal component of `seasonReputationDelta`
 * (js/career/reputation.js: REPUTATION_GOAL_HIT / GOAL_MISS). Deliberately
 * NOT the full season delta: the win-rate component is a season-scale
 * measure, and a single game must not move a season's reputation by a full
 * season's worth. The challenge goal is the part this game can actually
 * settle; the season settles the rest.
 */
export function challengeCareerEffect({ won = false, goalAchieved = null } = {}) {
  const reputationDelta = goalAchieved === true ? REPUTATION_GOAL_HIT : goalAchieved === false ? REPUTATION_GOAL_MISS : 0;
  return {
    reputationDelta,
    goalAchieved,
    won,
    summary:
      goalAchieved === true
        ? "challenge goal met — the front office notices"
        : goalAchieved === false
          ? "challenge goal missed — trust takes a hit"
          : "no challenge goal set — a quiet result",
  };
}
