/**
 * Training Camp balancing — every tunable number lives here (D1 ruling:
 * centralised, not scattered). Initial parameters, pending real play data.
 *
 * Tiers map the EXISTING card rarity (playerLegacyBadge().cls), not a new
 * rarity system. The badge is taken from the untouched catalog card so a
 * card's tier never drifts as it trains.
 */

/** Camps reuse the 本命 growth attribute vocabulary and the epiphany skill families. */
export const CAMPS = {
  shooting: { label: "投篮训练营", labelEn: "Shooting Camp", attrs: ["three", "mid", "scoring"], families: ["shooter", "scorer"], gateAttr: "three" },
  playmaking: { label: "组织训练营", labelEn: "Playmaking Camp", attrs: ["pass", "iq", "clutch"], families: ["playmaker"], gateAttr: "pass" },
  defense: { label: "防守训练营", labelEn: "Defense Camp", attrs: ["defense", "steal", "block"], families: ["rim", "thief"], gateAttr: "defense" },
  inside: { label: "内线训练营", labelEn: "Post Camp", attrs: ["paint", "rebound", "strength"], families: ["finisher", "rebounder"], gateAttr: "paint" },
};

/** Attribute display names (zh / en). */
export const ATTR_LABELS = {
  three: ["三分", "3PT"], mid: ["中投", "Mid-range"], scoring: ["得分", "Scoring"],
  pass: ["传球", "Passing"], iq: ["球商", "IQ"], clutch: ["关键球", "Clutch"],
  defense: ["防守", "Defense"], steal: ["抢断", "Steal"], block: ["盖帽", "Block"],
  paint: ["内线", "Paint"], rebound: ["篮板", "Rebound"], strength: ["力量", "Strength"],
};

const HOUR = 60 * 60 * 1000;

/** Longer sessions are slightly better value per gold (never punish players who can't log in daily). */
export const DURATIONS = {
  warmup: { label: "热身训练", labelEn: "Warm-up", ms: 2 * HOUR, cost: 20, xp: 10, skillChance: 0 },
  regular: { label: "常规训练", labelEn: "Regular", ms: 8 * HOUR, cost: 60, xp: 32, skillChance: 0.003 },
  fullDay: { label: "全天训练", labelEn: "Full day", ms: 24 * HOUR, cost: 150, xp: 100, skillChance: 0.01 },
  intensive: { label: "强化训练", labelEn: "Intensive", ms: 72 * HOUR, cost: 400, xp: 300, skillChance: 0.03 },
  elite: { label: "精英训练", labelEn: "Elite", ms: 7 * 24 * HOUR, cost: 1000, xp: 760, skillChance: 0.07 },
};

/** D1 growth budgets. Common cards have the MOST room on purpose. */
export const TIER_BUDGETS = {
  common: { label: "普通", labelEn: "Common", perAttr: 5, total: 25, skills: 3 },
  good: { label: "优秀", labelEn: "Good", perAttr: 4, total: 20, skills: 3 },
  allstar: { label: "全明星", labelEn: "All-Star", perAttr: 3, total: 15, skills: 2 },
  superstar: { label: "超级巨星", labelEn: "Superstar", perAttr: 2, total: 10, skills: 2 },
  legend: { label: "巅峰传奇", labelEn: "Peak Legend", perAttr: 2, total: 8, skills: 2 },
};

/** playerLegacyBadge().cls -> training tier. Anything unlisted ("" role / rotation / starter) is common. */
const BADGE_TO_TIER = { myth: "legend", legend: "legend", super: "superstar", allstar: "allstar", star: "good", goto: "good" };
export function tierFromBadge(cls) {
  return BADGE_TO_TIER[cls] || "common";
}

export const INITIAL_SLOTS = 2;
export const ATTR_CEILING = 99;
/** A skill breakthrough needs a real base in the camp's discipline. */
export const SKILL_GATE_MIN = 65;

/** XP to go from `value` to `value + 1`: higher ratings cost more (≈30 at 50, ≈113 at 80, ≈217 at 95). */
export function xpRequired(value) {
  return Math.round(30 * Math.pow(1.045, Math.max(0, value - 50)));
}

/** D2: refund share by progress (0..1). Completed sessions cannot be cancelled at all. */
export function refundShare(progress) {
  if (progress <= 0.05) return 1;
  if (progress <= 0.25) return 0.75;
  if (progress <= 0.5) return 0.5;
  return 0;
}

/** Mutates a cloned card: add the training bonus, never past ATTR_CEILING. */
export function applyTrainingBonus(player, training) {
  const attrs = training?.attrs;
  if (!attrs) return player;
  for (const [key, bonus] of Object.entries(attrs)) {
    if (player[key] == null || !(bonus > 0)) continue;
    const value = Math.round(Number(player[key]) || 0);
    if (value >= ATTR_CEILING) continue; // never pull an already-higher rating down
    player[key] = Math.min(ATTR_CEILING, value + bonus);
  }
  return player;
}
