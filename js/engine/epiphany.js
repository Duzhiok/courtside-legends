/**
 * 领悟 (in-game epiphany): a card that keeps producing in one area can learn
 * a matching skill. Guardrails so it stays special instead of a skill faucet:
 *  - STREAK consecutive qualifying games, each with ≥ MIN_MINUTES played;
 *  - only a skill from the matching family (assists → passing skills);
 *  - normal gates still apply (height, curated lists, exclusives never);
 *  - a roll, not a guarantee — a longer streak simply gets more rolls;
 *  - at most MAX_EPIPHANY learned this way per card.
 * Pure: callers persist the returned mod.
 */
import { SKILL_PACKS, canRetainSkill, isLearnableSkill } from "../data/skills.js";

export const STREAK = 3;
export const MIN_MINUTES = 18;
export const EPIPHANY_CHANCE = 0.5;
export const MAX_EPIPHANY = 2;
const FORM_KEEP = 5;

export const EPIPHANY_RULES = [
  { id: "playmaker", label: "连续高助攻", stat: "ast", min: 9, skills: ["dime_dropper", "clean_dime", "floor_commander", "qb_outlet"] },
  { id: "shooter", label: "连续三分爆发", stat: "tpm", min: 4, skills: ["rainmaker", "corner_sniper", "splash_spot"] },
  { id: "scorer", label: "连续高得分", stat: "pts", min: 25, skills: ["cold_mid", "mid_maestro", "freeze_iso"] },
  { id: "finisher", label: "连续内线强攻", stat: "twoPm", min: 8, skills: ["paint_finisher", "first_step"] },
  { id: "rebounder", label: "连续篮板统治", stat: "reb", min: 12, skills: ["glass_cleaner", "board_man"] },
  { id: "rim", label: "连续封盖", stat: "blk", min: 3, skills: ["block_artist", "rim_protector"] },
  { id: "thief", label: "连续抢断", stat: "stl", min: 3, skills: ["thief", "glove"] },
];

export function formLine(stats) {
  return {
    min: stats.min || 0,
    pts: stats.pts || 0,
    reb: stats.reb || 0,
    ast: stats.ast || 0,
    stl: stats.stl || 0,
    blk: stats.blk || 0,
    tpm: stats.tpm || 0,
    twoPm: Math.max(0, (stats.fgm || 0) - (stats.tpm || 0)),
  };
}

/** Rule with the strongest current streak, or null. */
export function hotStreak(form) {
  const recent = (form || []).slice(-STREAK);
  if (recent.length < STREAK || recent.some((game) => game.min < MIN_MINUTES)) return null;
  let best = null;
  for (const rule of EPIPHANY_RULES) {
    if (!recent.every((game) => game[rule.stat] >= rule.min)) continue;
    const strength = recent.reduce((sum, game) => sum + game[rule.stat] / rule.min, 0);
    if (!best || strength > best.strength) best = { rule, strength };
  }
  return best?.rule || null;
}

function learnableFrom(rule, player, owned) {
  return rule.skills.filter((id) => SKILL_PACKS[id] && isLearnableSkill(id) && !owned.has(id) && canRetainSkill(player, id));
}

/**
 * Record one game and maybe learn a skill.
 * Returns { mod, learned: { skillId, name, rule } | null }.
 */
export function recordGameAndCheck(mod, player, stats, rng = Math.random) {
  const form = [...(mod?.form || []), formLine(stats)].slice(-FORM_KEEP);
  const next = { merges: 0, skills: [], ...mod, form };
  const learnedSoFar = next.epiphany || [];
  if (learnedSoFar.length >= MAX_EPIPHANY) return { mod: next, learned: null };

  const rule = hotStreak(form);
  if (!rule) return { mod: next, learned: null };
  const owned = new Set([...(player?.skills || []), ...(next.skills || [])]);
  const options = learnableFrom(rule, player, owned);
  if (!options.length || rng() >= EPIPHANY_CHANCE) return { mod: next, learned: null };

  const skillId = options[Math.floor(rng() * options.length)];
  return {
    mod: { ...next, skills: [...next.skills, skillId], epiphany: [...learnedSoFar, skillId], form: [] },
    learned: { skillId, name: SKILL_PACKS[skillId].name, rule },
  };
}
