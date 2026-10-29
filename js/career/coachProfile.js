/**
 * The time-travel coach's own profile: age, reputation, mood, money, energy,
 * and a small level/perk-point system. This is step A1 of
 * docs/CAREER_LIFE_ROADMAP.md -- just the state shape, pure helpers, and
 * save-compatible defaults. Nothing in here is wired into gameplay yet; that
 * is for the B/C phases to do once this foundation exists.
 *
 * Pure module: every function takes a coach profile and returns a new one
 * (or a result object), never mutates its input. Persisted inside
 * `root.coach` by js/data/saveRoot.js, which treats the field as optional so
 * every save made before this field existed keeps loading unchanged --
 * ensureCoachProfile() is how call sites backfill a default for those saves.
 */
import {
  COACH_PERK_LINES,
  COACH_PERK_MAX_LEVEL,
  COACH_RETIRE_AGE,
  COACH_START_AGE,
  COACH_START_MOOD,
  COACH_START_REPUTATION,
  COACH_XP_PER_LEVEL,
} from "./balance.js";

/** Bump only if createCoachProfile()'s shape changes in a way old saves can't read as-is. */
export const COACH_PROFILE_VERSION = 1;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A brand-new coach at the start of a time-travel career. */
export function createCoachProfile(overrides = {}) {
  return {
    version: COACH_PROFILE_VERSION,
    age: COACH_START_AGE,
    reputation: COACH_START_REPUTATION,
    cash: 0,
    mood: COACH_START_MOOD,
    energy: 0,
    level: 1,
    xp: 0,
    perkPoints: 0,
    perks: Object.fromEntries(COACH_PERK_LINES.map((line) => [line, 0])),
    ...overrides,
  };
}

/**
 * Read a coach profile off a root, defaulting to a fresh one when the root
 * predates this field. Does not mutate `root` -- callers that want the
 * default persisted should pass the result to withCoachProfile() and save
 * the resulting root themselves, same pattern as
 * `employment || { status: "active" }` in careerContract.js.
 */
export function ensureCoachProfile(root) {
  return isPlainObject(root?.coach) ? root.coach : createCoachProfile();
}

/** Pure update: returns a new root with `coach` replaced. */
export function withCoachProfile(root, coach) {
  return { ...root, coach };
}

/**
 * Defensive normalization: clamps every field into its valid range and drops
 * unknown perk lines. Useful for sanitizing data from an untrusted source
 * (e.g. an imported save) before it is used, separate from saveRoot.js's
 * stricter validateRoot(), which rejects rather than repairs.
 */
export function clampCoachProfile(coach) {
  const perks = {};
  for (const line of COACH_PERK_LINES) {
    perks[line] = clamp(Math.round(coach?.perks?.[line] ?? 0), 0, COACH_PERK_MAX_LEVEL);
  }
  return {
    version: COACH_PROFILE_VERSION,
    age: Math.max(0, Math.round(Number(coach?.age) || 0)),
    reputation: clamp(Math.round(Number(coach?.reputation) || 0), 0, 100),
    cash: Number.isFinite(coach?.cash) ? coach.cash : 0,
    mood: clamp(Math.round(Number(coach?.mood) || 0), 0, 100),
    energy: Math.max(0, Math.round(Number(coach?.energy) || 0)),
    level: Math.max(1, Math.round(Number(coach?.level) || 1)),
    xp: Math.max(0, Number(coach?.xp) || 0),
    perkPoints: Math.max(0, Math.round(Number(coach?.perkPoints) || 0)),
    perks,
  };
}

export function isRetirementAge(coach, retireAge = COACH_RETIRE_AGE) {
  return coach.age >= retireAge;
}

/** One season has passed. */
export function advanceCoachAge(coach) {
  return { ...coach, age: coach.age + 1 };
}

export function xpToNextLevel(level) {
  return level * COACH_XP_PER_LEVEL;
}

/**
 * Add XP, leveling up as many times as the amount allows (each level grants
 * one perk point). Returns { coach, leveledUp } rather than mutating in
 * place, matching the `{ stars, skill }`-style result objects already used
 * elsewhere in this codebase (e.g. starUpWithSouls in accountGacha.js).
 */
export function applyCoachXp(coach, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return { coach, leveledUp: 0 };
  let { level, xp, perkPoints } = coach;
  xp += amount;
  let leveledUp = 0;
  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
    perkPoints += 1;
    leveledUp += 1;
  }
  return { coach: { ...coach, level, xp, perkPoints }, leveledUp };
}

/** Spend one perk point on a line. Throws rather than silently no-op'ing on bad input. */
export function spendPerkPoint(coach, line) {
  if (!COACH_PERK_LINES.includes(line)) {
    throw new RangeError(`unknown perk line: ${line}`);
  }
  if (coach.perkPoints <= 0) {
    throw new Error("no perk points available");
  }
  const current = coach.perks[line] ?? 0;
  if (current >= COACH_PERK_MAX_LEVEL) {
    throw new Error(`${line} perk is already maxed`);
  }
  return {
    ...coach,
    perkPoints: coach.perkPoints - 1,
    perks: { ...coach.perks, [line]: current + 1 },
  };
}

/**
 * Set energy to exactly `amount` (not add to it). Used at week/offseason boundaries
 * (js/career/calendar.js) -- unspent energy from the previous window is intentionally lost, not
 * carried over, per roadmap §2.1 ("不用的精力不累积，逼你做出选择").
 */
export function grantEnergy(coach, amount) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`energy grant must be a non-negative number, got ${amount}`);
  }
  return { ...coach, energy: amount };
}

export function canAffordEnergy(coach, cost) {
  return Number.isFinite(cost) && cost >= 0 && coach.energy >= cost;
}

/** Spend `cost` energy. Callers should check canAffordEnergy() first; this throws rather than
 * clamping, so a bug that tries to overspend fails loudly instead of silently going negative. */
export function spendEnergy(coach, cost) {
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new RangeError(`energy cost must be a positive number, got ${cost}`);
  }
  if (!canAffordEnergy(coach, cost)) {
    throw new Error("not enough energy");
  }
  return { ...coach, energy: coach.energy - cost };
}
