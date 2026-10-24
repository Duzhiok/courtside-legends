/**
 * 成色 (per-copy hidden roll).
 *
 * Every owned copy of a season card gets a bounded random offset on top of the
 * card's historical intangibles. Identity stays anchored — a 妖人 is still a
 * 妖人 — but two copies of 2015 Livingston can differ by a few points.
 *
 * Design rules (see docs in the PR / chat):
 *  - Offsets are capped at ±ROLL_SPREAD, so no roll can turn an 81 into a 95.
 *  - A duplicate never cherry-picks per attribute: the player keeps one whole
 *    roll or the other (per-attribute max would converge every card to 99s).
 *  - Role fingerprints (ballNeed / offBall) are never rolled; dual-core clash
 *    detection relies on them being stable.
 */
import { clamp, hashSeed, seededStream } from "../core/seededRandom.js";

export const ROLL_SPREAD = 6;

const ROLLED_KEYS = [
  "gravity",
  "shotCreation",
  "toughness",
  "leadership",
  "motor",
  "composure",
  "killerInstinct",
  "switchability",
  "chemistryMagnet",
  "clutchVision",
  "winningImpact",
  "ceiling",
  "systemAdapt",
];
/** A good roll lowers these. */
const INVERTED_KEYS = new Set(["injuryRisk"]);
const ALL_KEYS = [...ROLLED_KEYS, "injuryRisk"];

/** Triangular quality q ∈ (-1, 1): extremes are rare, B-grade is the norm. */
export const GRADE_BANDS = [
  { grade: "S", min: 0.6 },
  { grade: "A", min: 0.25 },
  { grade: "B", min: -0.25 },
  { grade: "C", min: -0.6 },
  { grade: "D", min: -Infinity },
];

/** Weighted single number shown to players as 隐藏能力. */
const HIDDEN_RATING_WEIGHTS = {
  winningImpact: 0.35,
  ceiling: 0.25,
  systemAdapt: 0.2,
  composure: 0.1,
  chemistryMagnet: 0.1,
};

export function newRollSeed(rng = Math.random) {
  return Math.floor(rng() * 2147483647) + 1;
}

/** Stable fallback roll for copies owned before 成色 existed. */
export function legacyRollSeed(accountId, playerId) {
  return hashSeed(`${accountId || "local"}|${playerId}`) || 1;
}

export function rollOffsets(seed) {
  const next = seededStream(seed);
  const quality = next() + next() - 1;
  const offsets = {};
  for (const key of ALL_KEYS) {
    const noise = (next() - 0.5) * 0.6;
    const value = Math.round(clamp(quality + noise, -1, 1) * ROLL_SPREAD);
    offsets[key] = INVERTED_KEYS.has(key) ? -value : value;
  }
  return { quality, offsets };
}

export function rollGrade(quality) {
  return GRADE_BANDS.find((band) => quality >= band.min).grade;
}

export function hiddenRating(player) {
  const intangibles = player?.intangibles || {};
  let total = 0;
  for (const [key, weight] of Object.entries(HIDDEN_RATING_WEIGHTS)) {
    total += (intangibles[key] ?? 50) * weight;
  }
  return Math.round(total);
}

/**
 * Mutates `player` (callers pass a clone): shifts intangibles by the roll and
 * tags the card with its grade + 隐藏能力.
 */
export function applyHiddenRoll(player, seed) {
  if (!player || !seed) return player;
  const { quality, offsets } = rollOffsets(seed);
  const intangibles = { ...(player.intangibles || {}) };
  for (const [key, delta] of Object.entries(offsets)) {
    if (intangibles[key] == null) continue;
    intangibles[key] = clamp(intangibles[key] + delta, 15, 99);
  }
  player.intangibles = intangibles;
  player.hiddenRoll = {
    seed,
    grade: rollGrade(quality),
    rating: hiddenRating(player),
  };
  return player;
}

/** Preview two rolls of the same base card side by side (duplicate choice UI). */
export function compareRolls(basePlayer, currentSeed, candidateSeed) {
  const preview = (seed) => {
    const copy = structuredClone(basePlayer);
    applyHiddenRoll(copy, seed);
    return { seed, ...copy.hiddenRoll };
  };
  return { current: preview(currentSeed), candidate: preview(candidateSeed) };
}
