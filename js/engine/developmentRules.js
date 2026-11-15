/**
 * Pure player-development rules, shared by engine, modes, career and reborn.
 *
 * Moved here verbatim from js/modes/playerDevelopment.js (FOCUS_ATTRIBUTES,
 * validatePlan, developmentModifier) and js/career/playerGrowth.js
 * (carriedDeltas) per review A-P2-6: js/engine/develop.js is the engine
 * layer and must not import the career/modes layers above it. The higher
 * layers import these rules back from here instead:
 * - js/modes/playerDevelopment.js re-exports FOCUS_ATTRIBUTES and
 *   developmentModifier (its public API is unchanged);
 * - js/career/playerGrowth.js imports FOCUS_ATTRIBUTES from here;
 * - js/reborn/contract.js imports carriedDeltas from here.
 *
 * Nothing here touches a season or a save; the functions are pure.
 */
import { GROWTH_CARRYOVER } from "../core/tuning.js";
import { clamp } from "../core/seededRandom.js";

export const FOCUS_ATTRIBUTES = {
  shooting: ["three", "mid", "scoring"],
  playmaking: ["pass", "iq", "speed"],
  defense: ["defense", "steal", "block"],
  conditioning: ["stamina", "speed", "strength"],
  balanced: ["scoring", "pass", "defense"],
};
const ROLES = new Set(["alpha", "starter", "sixth", "role", "bench"]);
const LOADS = new Set(["low", "normal", "high"]);
const ROLE_MINUTES = {
  alpha: 36,
  starter: 30,
  sixth: 24,
  role: 18,
  bench: 12,
};
const PLAN_KEYS = ["focus", "role", "mentorBref", "load", "source"];

export function validatePlan(plan, { source = null } = {}) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("development plan must be a non-null object");
  }
  const keys = Object.keys(plan);
  if (
    keys.length !== PLAN_KEYS.length ||
    PLAN_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(plan, key))
  ) {
    throw new TypeError("development plan is malformed");
  }
  if (!Object.prototype.hasOwnProperty.call(FOCUS_ATTRIBUTES, plan.focus)) {
    throw new TypeError("development plan focus is invalid");
  }
  if (!ROLES.has(plan.role)) {
    throw new TypeError("development plan role is invalid");
  }
  if (!LOADS.has(plan.load)) {
    throw new TypeError("development plan load is invalid");
  }
  if (
    plan.mentorBref !== null &&
    (typeof plan.mentorBref !== "string" || plan.mentorBref.trim() === "")
  ) {
    throw new TypeError("development plan mentorBref must be null or a non-empty string");
  }
  if (!["manual", "automatic"].includes(plan.source) || (source && plan.source !== source)) {
    throw new TypeError(`development plan source must be ${source || "manual or automatic"}`);
  }
  return plan;
}

export function developmentModifier(player, plan, context = {}) {
  validatePlan(plan);
  if (!player || typeof player !== "object" || Array.isArray(player)) {
    throw new TypeError("player must be an object");
  }
  let budget = plan.load === "high" ? 2 : plan.load === "normal" ? 1 : 0;
  let injuryRiskDelta = plan.load === "high" ? 8 : plan.load === "low" ? -8 : 0;
  let moraleDelta = 0;
  const reasons = [`${plan.load} load`];

  if (context.roleStable === true) {
    budget += 1;
    moraleDelta += 2;
    reasons.push("stable role");
  }

  const rosterBrefs = Array.isArray(context.rosterBrefs)
    ? new Set(context.rosterBrefs)
    : null;
  const mentor = context.mentor;
  const mentorQualifies =
    plan.mentorBref !== null &&
    mentor?.bref === plan.mentorBref &&
    Number(mentor.age) >= 27 &&
    Number(mentor.iq) >= 72 &&
    (!rosterBrefs || rosterBrefs.has(mentor.bref));
  if (mentorQualifies) {
    budget += 1;
    moraleDelta += 1;
    reasons.push("qualified mentor");
  }

  const minutes = Number(context.averageMinutes);
  if (Number.isFinite(minutes) && minutes < ROLE_MINUTES[plan.role] / 2) {
    budget -= 1;
    moraleDelta -= 2;
    reasons.push("low minutes");
  }
  if (Number(context.morale) < 40) {
    budget -= 1;
    reasons.push("low morale");
  }
  if (context.injured === true) {
    budget -= 1;
    moraleDelta -= 2;
    injuryRiskDelta += 6;
    reasons.push("ended season injured");
  }
  if (budget < 0 && moraleDelta >= 0) moraleDelta = -1;

  const available = clamp(budget, 0, 3);
  const attributes = FOCUS_ATTRIBUTES[plan.focus];
  const attributeDeltas = {};
  let totalPoints = 0;
  let cursor = 0;
  while (
    totalPoints < available &&
    attributes.some(
      (attribute) =>
        Number(player[attribute] ?? 10) + Number(attributeDeltas[attribute] || 0) < 99,
    )
  ) {
    const attribute = attributes[cursor % attributes.length];
    cursor += 1;
    if (
      Number(player[attribute] ?? 10) + Number(attributeDeltas[attribute] || 0) >=
      99
    ) {
      continue;
    }
    attributeDeltas[attribute] = Number(attributeDeltas[attribute] || 0) + 1;
    totalPoints += 1;
  }

  return {
    attributeDeltas,
    moraleDelta: clamp(moraleDelta, -5, 5),
    injuryRiskDelta,
    totalPoints,
    reasons,
  };
}

/**
 * What survives the rollover into next year's real card: GROWTH_CARRYOVER of each attribute gain
 * (rounded half up). Entries from any other year carry nothing -- they are stale.
 */
export function carriedDeltas(entry, year) {
  if (!entry || entry.year !== year) return {};
  const kept = {};
  for (const [attribute, delta] of Object.entries(entry.deltas || {})) {
    const amount = Math.round(delta * GROWTH_CARRYOVER);
    if (amount > 0) kept[attribute] = amount;
  }
  return kept;
}
