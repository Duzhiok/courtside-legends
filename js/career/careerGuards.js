/**
 * Career role guards (ADR-006 R4).
 *
 * This is the single place that turns a career's role into an allow/deny
 * decision. Every guarded operation calls `requireCapability()` (or the
 * `canDo()` read for UI gating) at the point where the operation lives —
 * hiding a button is NOT permission control, so the button state and the
 * operation check both read this module, and the operation still refuses
 * when called directly.
 *
 * How the role is resolved (one rule, everywhere):
 * - a career stamped with a role at creation (`createLeagueCareer({role})`)
 *   plays as that role;
 * - a career without a role falls back to `identityOf(root)` — which reads
 *   `root.identity.currentRole` and maps a missing/invalid identity to the
 *   Classic GM + Coach, so old saves keep full control with no migration.
 *
 * `CareerPermissionError` is thrown, never returned as a boolean: the
 * existing career UI handlers already `catch (error) { alert(error.message) }`,
 * so a refusal surfaces to the player as a readable reason instead of a
 * silent no-op or a crash.
 */
import {
  CAREER_ROLES,
  identityOf,
  permissionsFor,
} from "./careerIdentity.js";

/**
 * Thrown when a role attempts an operation it does not hold.
 * `code` is stable for tests and QA scripts; `message` is the zh reason
 * (the UI renders in the player's language — see denyMessage()).
 */
export class CareerPermissionError extends Error {
  constructor(role, capability) {
    super(denyMessage(role, capability, "zh"));
    this.name = "CareerPermissionError";
    this.code = "ROLE_NOT_PERMITTED";
    this.role = role;
    this.capability = capability;
  }
}

/**
 * Which role a career plays as. `career.role` wins when it is a known
 * role; otherwise the save's identity decides (missing identity reads as
 * the Classic GM + Coach, per ADR-006 Q1).
 * @param {object|null|undefined} career the leagueCareer wrapper (may be a bare test double)
 * @param {object|null|undefined} root the long-career root save (v3), optional
 * @returns {"PLAYER"|"COACH"|"GM"|"GM_COACH"}
 */
export function careerRole(career, root) {
  if (career && CAREER_ROLES.includes(career.role)) return career.role;
  return identityOf(root);
}

/**
 * Read-only check, for UI gating (disable/hide) and for branching a
 * handler between the execute path and the suggest path. The operation
 * itself must still call requireCapability() — this read alone is not
 * a permission check.
 */
export function canDo(career, capability, root) {
  return permissionsFor(careerRole(career, root)).has(capability);
}

/**
 * Enforce a capability at the operation entry point. Returns the
 * resolved role when allowed; throws CareerPermissionError otherwise.
 */
export function requireCapability(career, capability, root) {
  const role = careerRole(career, root);
  if (!permissionsFor(role).has(capability)) {
    throw new CareerPermissionError(role, capability);
  }
  return role;
}

/**
 * The manual-override category each coaching operation lives under.
 * `setManualOverride` / `clearManualOverride` / `applyRecommendation`
 * refuse categories on this map for roles that lack the capability;
 * a category with no entry here is not a role-gated operation (new
 * categories must add their mapping — do not silently treat a new
 * coaching category as ungated).
 */
export const OVERRIDE_CAPABILITIES = {
  rotation: "setRotation",
  lineup: "setRotation",
  tactics: "commandGame",
  gameplan: "commandGame",
  training: "setTrainingFocus",
};

/** Capability guarding a manual-override category, or null when ungated. */
export function capabilityForOverrideCategory(category) {
  return OVERRIDE_CAPABILITIES[category] ?? null;
}

/**
 * Why a role may not do something, in the player's language. Each line
 * names what the role CAN do instead, so the refusal teaches the split
 * rather than just saying no.
 */
const DENY_MESSAGES = {
  takeover: [
    "亲自接管关键回合是球员生涯的玩法，教练和经理不亲自上场。",
    "Playing the clutch moments yourself is the Player career — coaches and GMs don't take the court.",
  ],
  personalTraining: [
    "自我训练是球员生涯的玩法。",
    "Training yourself is the Player career.",
  ],
  commandGame: [
    "临场指挥是教练的职责。经理观看或模拟比赛，不亲自指挥。",
    "Calling games is the coach's job. A GM watches or simulates instead of coaching.",
  ],
  setRotation: [
    "排兵布阵是教练的职责。经理不直接设定轮换。",
    "Setting the rotation is the coach's job. A GM doesn't set lineups directly.",
  ],
  teamTraining: [
    "球队训练由教练负责。",
    "Team training is run by the coach.",
  ],
  setTrainingFocus: [
    "设定训练方向是教练的职责。经理只调整训练投入。",
    "Setting a training focus is the coach's job. A GM only adjusts how much training resource a player gets.",
  ],
  suggestTrade: [
    "只有教练和经理兼教练能给出交易建议。",
    "Only a coach (or GM + Coach) suggests trades.",
  ],
  suggestDraft: [
    "只有教练和经理兼教练能给出选秀建议。",
    "Only a coach (or GM + Coach) suggests draft picks.",
  ],
  trade: [
    "执行交易是经理的职责。教练可以给出交易建议，但不能拍板。",
    "Executing trades is the GM's job. A coach may suggest a deal, not close one.",
  ],
  signFreeAgent: [
    "签约自由球员是经理的职责。",
    "Signing free agents is the GM's job.",
  ],
  release: [
    "裁掉球员是经理的职责。",
    "Cutting a player is the GM's job.",
  ],
  draft: [
    "选秀是经理的职责。教练可以给出选秀建议，由管理层执行。",
    "Drafting is the GM's job. A coach suggests picks and the front office executes them.",
  ],
  allocateDevelopment: [
    "分配训练资源是经理的职责。",
    "Allocating training resources is the GM's job.",
  ],
  watchGame: [
    "观看比赛对所有身份开放。",
    "Watching games is open to every identity.",
  ],
  signOwnContract: [
    "签订自己的合同对所有身份开放。",
    "Signing your own contract is open to every identity.",
  ],
};

export function denyMessage(role, capability, lang = "zh") {
  const entry = DENY_MESSAGES[capability];
  if (!entry) return lang === "en" ? "This role may not do that." : "这个身份不能执行该操作。";
  return lang === "en" ? entry[1] : entry[0];
}
