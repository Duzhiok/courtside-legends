/**
 * 领悟 (in-game epiphany): a card that keeps producing in one area can learn
 * a matching skill. Evidence first, dice second (Career 2.0 final ruling 3):
 *  - Stage 1, candidates from evidence: every family whose rule held for
 *    STREAK consecutive games (each with ≥ MIN_MINUTES) is a candidate —
 *    nothing outside those families can ever be learned. A family the
 *    player's development plan trains (RULE_FOCUS) weighs TRAINING_WEIGHT×.
 *  - The chance to awaken at all grows with how far the streak beat the
 *    bar (EPIPHANY_BASE_CHANCE × margin, capped at EPIPHANY_MAX_CHANCE).
 *    These two numbers are provisional, pending fixed-seed season tuning.
 *  - Stage 2, controlled randomness: a weighted pick among the candidate
 *    families, then one skill from that family.
 *  - normal gates still apply (height, curated lists, exclusives never, no
 *    skill already owned); at most MAX_EPIPHANY learned this way per card.
 * Pure: callers persist the returned mod.
 */
import { SKILL_PACKS, canRetainSkill, isLearnableSkill } from "../data/skills.js";

export const STREAK = 3;
export const MIN_MINUTES = 18;
export const EPIPHANY_BASE_CHANCE = 0.4;
export const EPIPHANY_MAX_CHANCE = 0.75;
export const TRAINING_WEIGHT = 1.5;
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

/** Which development-plan focus (playerDevelopment FOCUS_ATTRIBUTES) trains each family. */
export const RULE_FOCUS = Object.freeze({
  playmaker: "playmaking",
  shooter: "shooting",
  scorer: "shooting",
  finisher: "conditioning",
  rebounder: "conditioning",
  rim: "defense",
  thief: "defense",
});

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

/** One game counts toward a streak: enough minutes AND the rule's stat line. */
const qualifies = (game, rule) => game.min >= MIN_MINUTES && game[rule.stat] >= rule.min;

/** Rule with the strongest current streak, or null. */
export function hotStreak(form) {
  const recent = (form || []).slice(-STREAK);
  if (recent.length < STREAK || recent.some((game) => game.min < MIN_MINUTES)) return null;
  let best = null;
  for (const rule of EPIPHANY_RULES) {
    if (!recent.every((game) => qualifies(game, rule))) continue;
    const strength = recent.reduce((sum, game) => sum + game[rule.stat] / rule.min, 0);
    if (!best || strength > best.strength) best = { rule, strength };
  }
  return best?.rule || null;
}

function learnableFrom(rule, player, owned) {
  return rule.skills.filter((id) => SKILL_PACKS[id] && isLearnableSkill(id) && !owned.has(id) && canRetainSkill(player, id));
}

/** Consecutive qualifying games at the END of the form, for one rule. */
function trailingGames(form, rule) {
  let games = 0;
  for (let i = form.length - 1; i >= 0 && qualifies(form[i], rule); i -= 1) games += 1;
  return games;
}

/**
 * "Heating up": one qualifying game short of a roll (or already rolling). Only when a roll could
 * actually END in a skill -- under the cap and with something left to learn -- so the card never
 * promises what can't happen. Returns { rule, games } or null; the skill itself stays a surprise.
 */
export function heatHint(mod, player) {
  if ((mod?.epiphany || []).length >= MAX_EPIPHANY) return null;
  const form = mod?.form || [];
  const owned = new Set([...(player?.skills || []), ...(mod?.skills || [])]);
  let best = null;
  for (const rule of EPIPHANY_RULES) {
    const games = trailingGames(form, rule);
    if (games < STREAK - 1 || !learnableFrom(rule, player, owned).length) continue;
    const strength = form.slice(-games).reduce((sum, game) => sum + game[rule.stat] / rule.min, 0);
    if (!best || games > best.games || (games === best.games && strength > best.strength)) best = { rule, games, strength };
  }
  return best && { rule: best.rule, games: best.games };
}

/**
 * Stage 1: every family the last STREAK games prove, with something left to
 * learn. Each candidate: { rule, strength, weight, options }. `strength` is
 * the summed stat/bar ratio over the streak (STREAK = exactly at the bar).
 */
export function epiphanyCandidates(form, player, owned = new Set(), focus = null) {
  const recent = (form || []).slice(-STREAK);
  if (recent.length < STREAK || recent.some((game) => game.min < MIN_MINUTES)) return [];
  const out = [];
  for (const rule of EPIPHANY_RULES) {
    if (!recent.every((game) => qualifies(game, rule))) continue;
    const options = learnableFrom(rule, player, owned);
    if (!options.length) continue;
    const strength = recent.reduce((sum, game) => sum + game[rule.stat] / rule.min, 0);
    const weight = strength * (focus && RULE_FOCUS[rule.id] === focus ? TRAINING_WEIGHT : 1);
    out.push({ rule, strength, weight, options });
  }
  return out;
}

/** The chance to awaken at all: the further the best streak beat its bar, the likelier. */
export function epiphanyChance(candidates) {
  if (!candidates.length) return 0;
  const margin = Math.max(...candidates.map((c) => c.strength)) / STREAK;
  return Math.min(EPIPHANY_MAX_CHANCE, EPIPHANY_BASE_CHANCE * margin);
}

function weightedPick(items, rng) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Record one game and maybe learn a skill. `focus` is the player's
 * development-plan focus when the caller has one (training history).
 * Returns { mod, learned: { skillId, name, rule } | null }.
 */
export function recordGameAndCheck(mod, player, stats, rng = Math.random, { focus = null } = {}) {
  const form = [...(mod?.form || []), formLine(stats)].slice(-FORM_KEEP);
  const next = { merges: 0, skills: [], ...mod, form };
  const learnedSoFar = next.epiphany || [];
  if (learnedSoFar.length >= MAX_EPIPHANY) return { mod: next, learned: null };

  const owned = new Set([...(player?.skills || []), ...(next.skills || [])]);
  const candidates = epiphanyCandidates(form, player, owned, focus);
  if (!candidates.length || rng() >= epiphanyChance(candidates)) return { mod: next, learned: null };

  const { rule, options } = weightedPick(candidates, rng);
  const skillId = options[Math.floor(rng() * options.length)];
  return {
    mod: { ...next, skills: [...next.skills, skillId], epiphany: [...learnedSoFar, skillId], form: [] },
    learned: { skillId, name: SKILL_PACKS[skillId].name, rule },
  };
}
