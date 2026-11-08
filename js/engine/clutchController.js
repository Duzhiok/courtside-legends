/**
 * M2b-2 Clutch Challenge — ClutchController + initializeScenario + outcome explainer.
 *
 * Spec: docs/implementation/m2b-2-clutch-controller-design.md
 * (product-owner approved 2026-11-07; execution reassigned to Luna the same day).
 *
 * This module is the UI state machine for ONE clutch possession. It never rolls
 * dice and never reads the global random function — all randomness lives in the engine
 * (M2b-0 injectable RNG) behind the existing M2b-1 contract:
 *   GameSim.issueAttemptId() / submitDecision() / sim.clutchLog
 *   + the `coach` event's meta.clutchOutcome (the same object as clutchLog[0]).
 */

import { GameSim } from "./sim.js";

/** The only scenario in M2b-2: M2b-1's measured scenario 1 (first preset, not a permanent restriction). */
export const DEFAULT_CLUTCH_SCENARIO = Object.freeze({
  homeTeam: "GSW",
  awayTeam: "CLE",
  season: 2016,
  youSide: "home",
  quarter: 4,
  clock: 12,
  score: Object.freeze({ home: 97, away: 100 }),
  possession: "home",
});

export const CLUTCH_ACTIONS = Object.freeze(["three", "attack"]);
export const CLUTCH_STATES = Object.freeze([
  "READY",
  "AWAITING_DECISION",
  "RESOLVING",
  "CONTINUING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

/** Every reason the engine can settle a decision with (M2b-1 contract). */
export const CLUTCH_REASONS = new Set([
  "doubled",
  "kicked_out",
  "turnover",
  "foul",
  "not_handed_off",
  "not_on_court",
  "no_possession",
]);

/** What kind of failure a non-shot reason is (for the result page's explanation). */
export const CLUTCH_FAILURE_KINDS = Object.freeze({
  turnover: "turnover",
  foul: "foul",
  doubled: "defense",
  kicked_out: "defense",
  not_handed_off: "not_handed_off",
  not_on_court: "not_on_court",
  no_possession: "no_possession",
});

const QUARTER_SEC = 12 * 60;
const OT_SEC = 5 * 60;

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Pick the two historical teams for the default scenario out of a card pool
 * (the app's PLAYERS in the browser, raw roster rows in Node tests).
 * Same ordering as the M2b-1 measurement sweep: scoring + three, top 10.
 */
export function buildClutchTeams(pool, scenario = DEFAULT_CLUTCH_SCENARIO) {
  if (!Array.isArray(pool)) throw fail("clutch/no-pool", "clutch scenario needs a card pool");
  const pick = (team) =>
    pool
      .filter((p) => p?.team === team && p?.season === scenario.season)
      .sort((a, b) => (b.scoring || 0) + (b.three || 0) - ((a.scoring || 0) + (a.three || 0)))
      .slice(0, 10);
  const home = pick(scenario.homeTeam);
  const away = pick(scenario.awayTeam);
  if (home.length < 5 || away.length < 5) {
    throw fail(
      "clutch/no-players",
      `clutch scenario needs 5+ cards per side, got ${scenario.homeTeam} ${home.length} / ${scenario.awayTeam} ${away.length} (${scenario.season})`,
    );
  }
  return {
    home: { name: scenario.homeTeam, players: home },
    away: { name: scenario.awayTeam, players: away },
  };
}

/**
 * Validate a clutch scenario and return the GameSim-ready pieces.
 * Rejects illegal input instead of forging a snapshot(): quarter must be Q4
 * (or OT), clock non-negative inside the period, scores non-negative integers,
 * possession one side, and the picked players' stats must be initially zero
 * (a reused, already-played card is not a fresh scenario).
 */
export function initializeScenario(input = {}) {
  const cfg = { ...DEFAULT_CLUTCH_SCENARIO, ...input };
  if (![4, 5].includes(cfg.quarter)) {
    throw fail("clutch/bad-quarter", `clutch quarter must be 4 or 5 (OT), got ${cfg.quarter}`);
  }
  const maxClock = cfg.quarter === 5 ? OT_SEC : QUARTER_SEC;
  if (!Number.isInteger(cfg.clock) || cfg.clock < 0 || cfg.clock > maxClock) {
    throw fail("clutch/bad-clock", `clutch clock must be an integer 0–${maxClock}, got ${cfg.clock}`);
  }
  for (const side of ["home", "away"]) {
    const v = cfg.score?.[side];
    if (!Number.isInteger(v) || v < 0) {
      throw fail("clutch/bad-score", `clutch score.${side} must be a non-negative integer, got ${v}`);
    }
  }
  if (!["home", "away"].includes(cfg.possession)) {
    throw fail("clutch/bad-possession", `clutch possession must be "home" or "away", got ${cfg.possession}`);
  }
  const { home, away } = buildClutchTeams(cfg.pool, cfg);
  for (const team of [home, away]) {
    for (const p of team.players) {
      const st = p.stats;
      if (st && Object.values(st).some((v) => typeof v === "number" && v !== 0)) {
        throw fail("clutch/dirty-stats", `clutch scenario needs fresh cards (stats must start at 0): ${p.name || p.id}`);
      }
    }
  }
  return {
    home,
    away,
    youSide: cfg.youSide,
    quarter: cfg.quarter,
    clock: cfg.clock,
    score: { ...cfg.score },
    possession: cfg.possession,
  };
}

/**
 * Explain one settled clutch outcome in structured facts — the result page
 * renders these, never a guess from the score. `outcome` is M2b-1's structured
 * result (sim.clutchLog[0], identical to the coach event's meta.clutchOutcome).
 */
export function explainClutchOutcome(outcome, { shooterName = "", actualShooterName = "" } = {}) {
  if (!outcome || typeof outcome !== "object") throw fail("clutch/no-outcome", "explainClutchOutcome needs a settled outcome");
  const shotByPick = outcome.attempted && outcome.actualShooterId === outcome.shooterId;
  // A "three" call is only executed as chosen if the shot really was a three;
  // an "attack" call lets the engine pick the zone, so any shot by the pick counts.
  const shotAsHinted = shotByPick && (outcome.actionHint === "attack" || outcome.zone === "three");
  const reason = outcome.reason ?? null;
  return {
    attemptId: outcome.attemptId,
    shooterId: outcome.shooterId,
    shooterName,
    actionHint: outcome.actionHint,
    role: outcome.role ?? null,
    delivery: outcome.delivery ?? null,
    receivedBall: !!outcome.handedOff,
    attempted: !!outcome.attempted,
    shotByPick,
    shotAsHinted,
    actualShooterId: outcome.actualShooterId,
    actualShooterName,
    zone: outcome.zone,
    made: !!outcome.made,
    points: outcome.points || 0,
    teamPoints: outcome.teamPoints || 0,
    reason,
    failureKind: reason ? CLUTCH_FAILURE_KINDS[reason] || "unknown" : "none",
  };
}

/**
 * Build the GameSim for a scenario (the UI adapter's single entry point).
 * The constructor always starts a fresh Q1 game, so the scenario's quarter /
 * clock / score / possession are applied afterwards — the same way the M2b-1
 * tests build their fixture. `rng` is the injected stream in tests; the
 * browser passes none (the engine's default global-random forwarding).
 */
export function startClutchSim(scenario, { rng, onEvent, onTick, onEnd } = {}) {
  const sim = new GameSim({
    home: scenario.home,
    away: scenario.away,
    youSide: scenario.youSide,
    injuries: false,
    speed: 3,
    rng,
    onEvent: onEvent || (() => {}),
    onTick: onTick || (() => {}),
    onEnd: onEnd || (() => {}),
  });
  Object.assign(sim, {
    quarter: scenario.quarter,
    clock: scenario.clock,
    score: { ...scenario.score },
    possession: scenario.possession,
    running: true,
    paused: false,
  });
  return sim;
}

/**
 * UI state machine for one clutch possession.
 *   READY -> AWAITING_DECISION -> RESOLVING -> CONTINUING -> COMPLETED
 *   (FAILED / CANCELLED from anywhere before COMPLETED)
 * The controller issues attemptIds; the sim honors the latest only, so
 * replaceDecision() voids the old id by issuing a new one, and cancel()
 * supersedes the open id so a late submit can never land.
 */
export function createClutchController({ sim } = {}) {
  if (!sim || typeof sim.issueAttemptId !== "function" || typeof sim.submitDecision !== "function") {
    throw fail("clutch/no-sim", "ClutchController needs a GameSim (issueAttemptId / submitDecision)");
  }
  let current = sim;
  let state = "READY";
  let attemptId = null;
  let selection = null; // { shooterId, actionHint }
  let replaced = false; // replaceDecision() may be used once per window
  let submitted = false;
  let outcome = null;
  let finalSnapshot = null;
  let failure = null;

  const onCourtIds = () => new Set((current.you()?.onCourt || []).map((p) => p.id));
  const nameOf = (id) => current.you()?.onCourt?.find((p) => p.id === id)?.name
    || current.you()?.roster?.find((p) => p.id === id)?.name || "";

  return {
    get state() {
      return state;
    },
    get attemptId() {
      return attemptId;
    },
    get selection() {
      return selection ? { ...selection } : null;
    },
    get outcome() {
      return outcome;
    },
    get finalSnapshot() {
      return finalSnapshot;
    },
    get failure() {
      return failure;
    },

    /** Open the decision window and issue the attempt id the submit must carry. */
    openDecision() {
      if (state !== "READY") return { ok: false, reason: "wrong_state", state };
      attemptId = current.issueAttemptId();
      state = "AWAITING_DECISION";
      return { ok: true, attemptId };
    },

    /** Record the pick (shooter + action). No engine call yet — submit() arms it. */
    select(shooterId, actionHint) {
      if (state !== "AWAITING_DECISION") return { ok: false, reason: "wrong_state", state };
      if (!CLUTCH_ACTIONS.includes(actionHint)) return { ok: false, reason: "invalid" };
      if (!onCourtIds().has(shooterId)) return { ok: false, reason: "not_on_court" };
      selection = { shooterId, actionHint };
      return { ok: true, selection: { ...selection } };
    },

    /**
     * Change the pick once while the window is still open (before submit).
     * The old attemptId is voided by issuing a new one — the sim only honors
     * the latest, so the old id can never be submitted afterwards.
     */
    replaceDecision(shooterId, actionHint) {
      if (state !== "AWAITING_DECISION") return { ok: false, reason: "wrong_state", state };
      if (submitted) return { ok: false, reason: "locked" };
      if (!selection) return { ok: false, reason: "no_selection" };
      if (replaced) return { ok: false, reason: "already_replaced" };
      if (!CLUTCH_ACTIONS.includes(actionHint)) return { ok: false, reason: "invalid" };
      if (!onCourtIds().has(shooterId)) return { ok: false, reason: "not_on_court" };
      attemptId = current.issueAttemptId();
      selection = { shooterId, actionHint };
      replaced = true;
      return { ok: true, attemptId, selection: { ...selection } };
    },

    /** Arm the decision in the engine. Accepted => the window locks (RESOLVING). */
    submit() {
      if (state !== "AWAITING_DECISION") return { ok: false, reason: "wrong_state", state };
      if (!selection || !attemptId) return { ok: false, reason: "no_selection" };
      const res = current.submitDecision({ attemptId, kind: "clutch_shooter", ...selection });
      if (!res.accepted) return { ok: false, reason: res.reason };
      submitted = true;
      state = "RESOLVING";
      return { ok: true, attemptId };
    },

    /**
     * Play the armed possession out of the real engine, then play the rest of
     * the game out (runFast) so the result page can show the final score.
     * The outcome is the engine's own structured result (clutchLog[0], the
     * same object the coach event's meta.clutchOutcome carries).
     */
    resolve({ maxSteps = 40 } = {}) {
      if (state !== "RESOLVING") return { ok: false, reason: "wrong_state", state };
      let steps = 0;
      while (!current.clutchLog.length && current.running && steps < maxSteps) {
        current.step();
        steps += 1;
      }
      if (!current.clutchLog.length) {
        state = "FAILED";
        failure = "no_outcome";
        return { ok: false, reason: "no_outcome" };
      }
      state = "CONTINUING";
      outcome = current.clutchLog[0];
      finalSnapshot = current.runFast();
      state = "COMPLETED";
      return { ok: true, outcome, finalSnapshot };
    },

    /** Abandon the attempt. Supersedes the open id so a late submit can't land. */
    cancel() {
      if (state === "COMPLETED" || state === "FAILED" || state === "CANCELLED") {
        return { ok: false, reason: "wrong_state", state };
      }
      if (attemptId && !submitted) {
        try {
          current.issueAttemptId();
        } catch {
          /* sim already gone — nothing to supersede */
        }
      }
      attemptId = null;
      selection = null;
      state = "CANCELLED";
      return { ok: true };
    },

    /** Retry: attach a FRESH GameSim (never reuse the finished instance) and reopen. */
    reset(nextSim) {
      if (!nextSim || typeof nextSim.issueAttemptId !== "function") {
        throw fail("clutch/no-sim", "reset() needs a fresh GameSim");
      }
      current = nextSim;
      state = "READY";
      attemptId = null;
      selection = null;
      replaced = false;
      submitted = false;
      outcome = null;
      finalSnapshot = null;
      failure = null;
      return { ok: true };
    },

    /** Structured explanation of the settled outcome, for the result page. */
    explain() {
      if (!outcome) return null;
      const actualName = outcome.actualShooterId ? nameOf(outcome.actualShooterId) : "";
      return explainClutchOutcome(outcome, { shooterName: nameOf(outcome.shooterId), actualShooterName: actualName });
    },
  };
}
