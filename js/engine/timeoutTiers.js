/**
 * B27: auto-timeout strategy tiers (approved 2026-11-09).
 *
 * Pure table — no randomness, no sim access. `maybeManagedCoach` reads only
 * this; the balanced tier is the pre-B27 behaviour, pinned number for number,
 * so it is the baseline the other two tiers move away from.
 *
 * A tier changes ONLY trigger sensitivity:
 * - conservative: probabilities x0.5, higher thresholds, no late-game
 *   key-possession trigger, same 85s cooldown as balanced.
 * - balanced: current numbers unchanged.
 * - aggressive: probabilities x1.5 (capped at 0.9), lower thresholds,
 *   cooldown 85s -> 60s.
 *
 * B3 is untouched: the reserve rule (assistant may call only with > 4
 * timeouts left) lives in `assistantMayCallTimeout` and applies in every tier.
 */
export const TIMEOUT_TIERS = Object.freeze(["conservative", "balanced", "aggressive"]);

export const DEFAULT_TIMEOUT_TIER = "balanced";

/** Unknown / missing values fall back to balanced (old saves have no tier). */
export function normalizeTimeoutTier(tier) {
  return TIMEOUT_TIERS.includes(tier) ? tier : DEFAULT_TIMEOUT_TIER;
}

/** UI labels for the tier picker (zh / en). */
export const TIMEOUT_TIER_LABELS = Object.freeze({
  conservative: { zh: "保守", en: "Conservative" },
  balanced: { zh: "均衡", en: "Balanced" },
  aggressive: { zh: "积极", en: "Aggressive" },
});

/** Display name for a tier ("保守" / "Conservative"). */
export function timeoutTierLabel(tier, lang = "zh") {
  const entry = TIMEOUT_TIER_LABELS[normalizeTimeoutTier(tier)];
  return lang === "en" ? entry.en : entry.zh;
}

/**
 * Thresholds + probability table for one tier. Field meanings (same five
 * triggers as pre-B27 `maybeManagedCoach`, same order):
 * - momentum / momentumProb: opponent run >= `momentum` points, first match wins.
 * - deficit / deficitProb: trailing by >= `deficit` from Q2 on.
 * - coldProb: team ice cold (avg hot <= -1.1) and trailing by >= 3.
 * - fatigue / fatigueProb: avg fatigue >= `fatigue` with >= 2 timeouts left.
 * - lateEnabled / lateProb: late key-possession chase (Q4, or Q3 < 200s,
 *   deficit 4-14). Conservative disables it outright.
 * - cooldownSec: minimum seconds between two assistant timeouts.
 */
export function timeoutTierParams(tier) {
  switch (normalizeTimeoutTier(tier)) {
    case "conservative":
      return Object.freeze({
        tier: "conservative",
        momentum: 10,
        momentumProb: 0.36, // 0.72 x 0.5
        deficit: 14,
        deficitProb: 0.24, // 0.48 x 0.5
        coldProb: 0.21, // 0.42 x 0.5
        fatigue: 78,
        fatigueProb: 0.15, // 0.30 x 0.5
        lateEnabled: false,
        lateProb: 0.2, // 0.40 x 0.5 (unused while disabled)
        cooldownSec: 85,
      });
    case "aggressive":
      return Object.freeze({
        tier: "aggressive",
        momentum: 6,
        momentumProb: 0.9, // 0.72 x 1.5 = 1.08, capped at 0.9
        deficit: 8,
        deficitProb: 0.72, // 0.48 x 1.5
        coldProb: 0.63, // 0.42 x 1.5
        fatigue: 65,
        fatigueProb: 0.45, // 0.30 x 1.5
        lateEnabled: true,
        lateProb: 0.6, // 0.40 x 1.5
        cooldownSec: 60,
      });
    case "balanced":
    default:
      return Object.freeze({
        tier: "balanced",
        momentum: 8,
        momentumProb: 0.72,
        deficit: 12,
        deficitProb: 0.48,
        coldProb: 0.42,
        fatigue: 72,
        fatigueProb: 0.3,
        lateEnabled: true,
        lateProb: 0.4,
        cooldownSec: 85,
      });
  }
}
