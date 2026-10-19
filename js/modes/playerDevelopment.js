import { overall } from "../data/players.js";
import { estimateAge } from "../data/careerArc.js";

const FOCUS_ATTRIBUTES = {
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

function requireCareerRoster(career) {
  if (
    !career ||
    typeof career !== "object" ||
    Array.isArray(career) ||
    !["franchise", "timeTravel"].includes(career.kind) ||
    !career.management ||
    typeof career.management !== "object" ||
    Array.isArray(career.management)
  ) {
    throw new TypeError("a valid managed league career is required");
  }
  const teamId = career.season?.userTeamId;
  const roster = career.season?.teams?.[teamId]?.players;
  if (typeof teamId !== "string" || teamId.trim() === "" || !Array.isArray(roster)) {
    throw new TypeError("league career requires a user team roster");
  }
  const seen = new Set();
  for (const player of roster) {
    if (typeof player?.bref !== "string" || player.bref.trim() === "") {
      throw new TypeError("every user-roster player requires a non-empty bref");
    }
    if (seen.has(player.bref)) {
      throw new TypeError("user-roster bref values must be unique");
    }
    seen.add(player.bref);
  }
  return roster;
}

function validatePlan(plan, { source = null } = {}) {
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

function resolvedAge(player) {
  const age = Number(player?.age);
  return Number.isFinite(age) && player?.age !== null ? age : estimateAge(player);
}

function validatePlanForRoster(plan, bref, roster, { source = null } = {}) {
  validatePlan(plan, { source });
  if (plan.mentorBref === bref) {
    throw new TypeError("a player cannot mentor themself");
  }
  if (
    plan.mentorBref !== null &&
    !roster.some((entry) => entry.bref === plan.mentorBref)
  ) {
    throw new TypeError("development plan mentor must be on the user roster");
  }
  return plan;
}

export function validateDevelopmentPlans(career) {
  const roster = requireCareerRoster(career);
  const plans = career.management?.developmentPlans ?? {};
  if (!plans || typeof plans !== "object" || Array.isArray(plans)) {
    throw new TypeError("developmentPlans must be an object");
  }
  const rosterBrefs = new Set(roster.map((player) => player.bref));
  for (const [bref, plan] of Object.entries(plans)) {
    if (typeof bref !== "string" || bref.trim() === "") {
      throw new TypeError("development plan bref must be a non-empty string");
    }
    validatePlan(plan);
    if (rosterBrefs.has(bref)) {
      validatePlanForRoster(plan, bref, roster);
    }
  }
  return true;
}

function cloneTrainingMaps(career) {
  return {
    manualOverrides: {
      ...(career.manualOverrides || {}),
      training: { ...(career.manualOverrides?.training || {}) },
    },
    recommendations: {
      ...(career.recommendations || {}),
      training: { ...(career.recommendations?.training || {}) },
    },
  };
}

export function setDevelopmentPlan(career, bref, plan) {
  const roster = requireCareerRoster(career);
  if (typeof bref !== "string" || bref.trim() === "") {
    throw new TypeError("player bref must be a non-empty string");
  }
  const player = roster.find((entry) => entry.bref === bref);
  if (!player) {
    throw new TypeError("development plan player must be on the user roster");
  }
  validatePlanForRoster(plan, bref, roster, { source: "manual" });

  const { manualOverrides, recommendations } = cloneTrainingMaps(career);
  manualOverrides.training[bref] = structuredClone(plan);
  recommendations.training[bref] = structuredClone(plan);
  return {
    ...career,
    management: {
      ...(career.management || {}),
      developmentPlans: {
        ...(career.management?.developmentPlans || {}),
        [bref]: structuredClone(plan),
      },
    },
    manualOverrides,
    recommendations,
  };
}

function suggestedRole(rank) {
  if (rank === 0) return "alpha";
  if (rank <= 4) return "starter";
  if (rank === 5) return "sixth";
  if (rank <= 8) return "role";
  return "bench";
}

function suggestedFocus(player) {
  const age = resolvedAge(player);
  const position = String(player.playPos || player.pos || "").toUpperCase();
  if (age <= 22) return "conditioning";
  if (position === "PG" && Number(player.pass) < 75) return "playmaking";
  if ((position === "SG" || position === "SF") && Number(player.three) < 75) {
    return "shooting";
  }
  if ((position === "PF" || position === "C") && Number(player.defense) < 75) {
    return "defense";
  }
  return "balanced";
}

function isInjured(player) {
  return Number(player?.injuredGames) > 0 || Boolean(player?.injuryStatus);
}

function suggestedLoad(player) {
  const age = resolvedAge(player);
  if (age <= 24 && Number(player.stamina) >= 70) return "high";
  if (age >= 31 || isInjured(player)) return "low";
  return "normal";
}

function suggestedMentor(roster, player) {
  const candidates = roster
    .filter((entry) => entry.bref !== player.bref && resolvedAge(entry) >= 27)
    .sort(
      (left, right) =>
        Number(right.iq || 0) +
          overall(right) -
          (Number(left.iq || 0) + overall(left)) ||
        left.bref.localeCompare(right.bref),
    );
  return candidates[0]?.bref || null;
}

export function recommendDevelopmentPlans(career) {
  const roster = requireCareerRoster(career);
  const ranked = [...roster].sort(
    (left, right) =>
      overall(right) - overall(left) || left.bref.localeCompare(right.bref),
  );
  const manual = career.manualOverrides?.training || {};
  const existingPlans = career.management?.developmentPlans || {};
  const nextPlans = { ...existingPlans };
  const { manualOverrides, recommendations } = cloneTrainingMaps(career);

  ranked.forEach((player, rank) => {
    if (Object.prototype.hasOwnProperty.call(manual, player.bref)) {
      try {
        validatePlanForRoster(manual[player.bref], player.bref, roster, {
          source: "manual",
        });
        nextPlans[player.bref] = structuredClone(manual[player.bref]);
        recommendations.training[player.bref] = structuredClone(
          manual[player.bref],
        );
      } catch {
        delete nextPlans[player.bref];
      }
      return;
    }
    const recommended = {
      focus: suggestedFocus(player),
      role: suggestedRole(rank),
      mentorBref: suggestedMentor(roster, player),
      load: suggestedLoad(player),
      source: "automatic",
    };
    nextPlans[player.bref] = recommended;
    recommendations.training[player.bref] = structuredClone(recommended);
  });

  return {
    ...career,
    management: {
      ...(career.management || {}),
      developmentPlans: nextPlans,
    },
    manualOverrides,
    recommendations,
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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

export function pruneDevelopmentPlans(career) {
  return reconcileDevelopmentPlans(career);
}

function reconciledPlan(value, bref, roster) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const active = new Set(roster.map((player) => player.bref));
  const candidate = structuredClone(value);
  if (candidate.mentorBref !== null && !active.has(candidate.mentorBref)) {
    candidate.mentorBref = null;
  }
  try {
    validatePlanForRoster(candidate, bref, roster);
    return candidate;
  } catch {
    return null;
  }
}

export function reconcileDevelopmentPlans(career) {
  const roster = requireCareerRoster(career);
  const active = new Set(roster.map((player) => player.bref));
  const { manualOverrides, recommendations } = cloneTrainingMaps(career);
  const developmentPlans = {};

  for (const [bref, value] of Object.entries(manualOverrides.training)) {
    if (!active.has(bref)) continue;
    const reconciled = reconciledPlan(value, bref, roster);
    if (reconciled) {
      manualOverrides.training[bref] = structuredClone(reconciled);
      developmentPlans[bref] = structuredClone(reconciled);
    }
  }

  for (const [bref, value] of Object.entries(recommendations.training)) {
    if (!active.has(bref)) continue;
    const reconciled = reconciledPlan(value, bref, roster);
    if (reconciled) recommendations.training[bref] = reconciled;
  }

  for (const [bref, value] of Object.entries(
    career.management?.developmentPlans || {},
  )) {
    if (!active.has(bref) || Object.hasOwn(manualOverrides.training, bref)) continue;
    const reconciled = reconciledPlan(value, bref, roster);
    if (reconciled) developmentPlans[bref] = reconciled;
  }

  return {
    ...career,
    management: {
      ...(career.management || {}),
      developmentPlans,
    },
    manualOverrides,
    recommendations,
  };
}
