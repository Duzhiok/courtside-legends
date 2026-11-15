import { overall } from "../data/players.js";
import { estimateAge } from "../data/careerArc.js";
import { canDo, requireCapability } from "../career/careerGuards.js";
// Development rules live in the engine layer (js/engine/developmentRules.js,
// A-P2-6): the pure plan rules are shared by engine/modes/career/reborn.
// FOCUS_ATTRIBUTES and developmentModifier are re-exported below so this
// module's public API is unchanged.
import {
  FOCUS_ATTRIBUTES,
  developmentModifier,
  validatePlan,
} from "../engine/developmentRules.js";

export { FOCUS_ATTRIBUTES, developmentModifier };

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

export function resolvedAge(player) {
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

  // Role split (ADR-006): the coach sets the whole plan (focus / role /
  // mentor / load); the GM manages resources — they may change ONLY the
  // load on a plan that already exists, never invent a focus, a role, or
  // a mentor. A role with neither capability cannot touch plans at all.
  if (!canDo(career, "setTrainingFocus")) {
    const existing = career.management?.developmentPlans?.[bref];
    const loadOnly =
      canDo(career, "allocateDevelopment") &&
      existing &&
      existing.focus === plan.focus &&
      existing.role === plan.role &&
      existing.mentorBref === plan.mentorBref;
    if (!loadOnly) {
      requireCapability(career, "setTrainingFocus");
    }
  }

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

  for (const bref of Object.keys(recommendations.training)) {
    if (!active.has(bref)) delete recommendations.training[bref];
  }

  for (const [bref, value] of Object.entries(manualOverrides.training)) {
    if (!active.has(bref)) continue;
    const reconciled = reconciledPlan(value, bref, roster);
    if (reconciled) {
      manualOverrides.training[bref] = structuredClone(reconciled);
      developmentPlans[bref] = structuredClone(reconciled);
      recommendations.training[bref] = structuredClone(reconciled);
    } else {
      delete recommendations.training[bref];
    }
  }

  for (const [bref, value] of Object.entries(recommendations.training)) {
    if (Object.hasOwn(manualOverrides.training, bref)) continue;
    const reconciled = reconciledPlan(value, bref, roster);
    if (reconciled) {
      recommendations.training[bref] = reconciled;
    } else {
      delete recommendations.training[bref];
    }
  }

  for (const [bref, value] of Object.entries(
    career.management?.developmentPlans || {},
  )) {
    if (!active.has(bref) || Object.hasOwn(manualOverrides.training, bref)) continue;
    const reconciled = reconciledPlan(value, bref, roster);
    developmentPlans[bref] = reconciled || structuredClone(value);
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
