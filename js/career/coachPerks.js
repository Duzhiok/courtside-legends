/**
 * C5 of docs/CAREER_LIFE_ROADMAP.md: the coach earns XP from every game, levels up, and spends the
 * perk points on four lines. Each line hooks one number that is already live in the game:
 *
 *   tactics      -> your shots' make chance          (engine/sim.js calcMakeProb, via season.coachPerkShot)
 *   development  -> in-season player XP              (career/playerGrowth.js awardGrowth)
 *   negotiation  -> salary paid each season          (career/finance.js currentCoachSalary)
 *   media        -> a bad season's reputation loss   (career/reputation.js settleSeasonReputation)
 *
 * Pure: every function takes a coach and returns a number or a new coach; nothing is mutated or saved.
 */
import {
  COACH_PERK_LINES,
  COACH_PERK_MAX_LEVEL,
  COACH_XP_LOSS,
  COACH_XP_PLAYOFF_MULTIPLIER,
  COACH_XP_UPSET,
  COACH_XP_UPSET_GAP,
  COACH_XP_WIN,
  PERK_DEVELOPMENT_XP,
  PERK_MEDIA_SOFTEN,
  PERK_NEGOTIATION_SALARY,
  PERK_TACTICS_SHOT,
} from "./balance.js";
import { applyCoachXp, xpToNextLevel } from "./coachProfile.js";

/** A line's level, 0..COACH_PERK_MAX_LEVEL. Junk in a save reads as 0 instead of poisoning the maths. */
export function perkLevel(coach, line) {
  if (!COACH_PERK_LINES.includes(line)) return 0;
  const value = Number(coach?.perks?.[line]);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(COACH_PERK_MAX_LEVEL, Math.floor(value));
}

/** Relative make-chance bonus for your shots (0.01 = 1% more often). */
export const tacticsShotBonus = (coach) => perkLevel(coach, "tactics") * PERK_TACTICS_SHOT;
export const developmentXpMultiplier = (coach) => 1 + perkLevel(coach, "development") * PERK_DEVELOPMENT_XP;
export const negotiationSalaryBonus = (coach) => perkLevel(coach, "negotiation") * PERK_NEGOTIATION_SALARY;

/** A season's reputation change after media savvy: losses shrink toward 0, gains are untouched. */
export function softenReputationLoss(delta, coach) {
  if (!(delta < 0)) return delta;
  return Math.min(0, delta + perkLevel(coach, "media") * PERK_MEDIA_SOFTEN);
}

/** 0.005 -> "0.5", 0.1 -> "10": a percentage with no trailing ".0". */
const pct = (fraction) => String(Math.round(fraction * 1000) / 10);

/** Names and "what it does at level N", by language ([zh, en]). Every number comes from balance.js. */
export const PERK_LINE_INFO = Object.freeze({
  tactics: {
    label: ["战术大师", "Tactician"],
    effect: (level) => [`我方出手命中率 +${pct(level * PERK_TACTICS_SHOT)}%（相对）`, `Your shots fall ${pct(level * PERK_TACTICS_SHOT)}% more often`],
  },
  development: {
    label: ["球员发展", "Player development"],
    effect: (level) => [`球员比赛经验 +${pct(level * PERK_DEVELOPMENT_XP)}%`, `Player game XP +${pct(level * PERK_DEVELOPMENT_XP)}%`],
  },
  negotiation: {
    label: ["谈判专家", "Negotiator"],
    effect: (level) => [`每季年薪 +¤${level * PERK_NEGOTIATION_SALARY}`, `Salary +¤${level * PERK_NEGOTIATION_SALARY} per season`],
  },
  media: {
    label: ["媒体达人", "Media savvy"],
    effect: (level) => [`坏赛季声望少扣 ${level * PERK_MEDIA_SOFTEN} 点`, `Bad seasons cost ${level * PERK_MEDIA_SOFTEN} less reputation`],
  },
});

export function perkEffectText(line, level, lang = "zh") {
  const info = PERK_LINE_INFO[line];
  if (!info || level <= 0) return "";
  return info.effect(level)[lang === "en" ? 1 : 0];
}

/**
 * Coach XP one game is worth. `youStrength` / `oppStrength` are top-8 OVR averages; when either is
 * unknown the game simply can't be an upset. A tie (no winner) pays like a loss.
 * @returns {{ xp: number, parts: Array<{ id: "win"|"loss"|"upset", xp: number }>, playoff: boolean }}
 */
export function gameCoachXp({ won = false, playoff = false, youStrength = NaN, oppStrength = NaN } = {}) {
  const parts = [won ? { id: "win", xp: COACH_XP_WIN } : { id: "loss", xp: COACH_XP_LOSS }];
  const gap = Number(oppStrength) - Number(youStrength);
  if (won && Number.isFinite(gap) && gap >= COACH_XP_UPSET_GAP) parts.push({ id: "upset", xp: COACH_XP_UPSET });
  const base = parts.reduce((sum, part) => sum + part.xp, 0);
  return { xp: playoff ? base * COACH_XP_PLAYOFF_MULTIPLIER : base, parts, playoff: Boolean(playoff) };
}

/**
 * Pay one game's coach XP.
 * @returns {{ coach, entry: { xp, parts, playoff, level, leveledUp, progress, perkPoints } }}
 *   `entry` is what the post-game card shows.
 */
export function awardCoachXp(coach, game) {
  const earned = gameCoachXp(game);
  const { coach: next, leveledUp } = applyCoachXp(coach, earned.xp);
  return {
    coach: next,
    entry: {
      ...earned,
      level: next.level,
      leveledUp,
      progress: Math.min(1, next.xp / xpToNextLevel(next.level)),
      perkPoints: next.perkPoints,
    },
  };
}
