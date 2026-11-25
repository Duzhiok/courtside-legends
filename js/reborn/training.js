/**
 * Player Reborn PR3 — weekly training (ADR-005 §3, prep doc).
 *
 * One focus choice per week (shooter / defense / playmaker), written into
 * the growth plan. Game XP then converts into attribute gains through the
 * existing awardGrowth + ceilings — no new growth channel. Every gain
 * shows its source on the card, and training can never exceed ceilings
 * (awardGrowth enforces them). Pure functions; playerGrowth.js is only
 * read, never modified.
 */
import { awardGrowth, trainedAttributes } from "../career/playerGrowth.js";
import { seasonToCard } from "../data/players.js";
import { identityOf } from "../career/careerIdentity.js";
import { requireCapability } from "../career/careerGuards.js";
import { specialtyAttributes } from "./fragments.js";
import { esc } from "../core/html.js";

export const TRAINING_FOCI = ["shooting", "defense", "playmaking"];

export const TRAINING_FOCUS_LABEL = {
  shooting: { zh: "射手", en: "Shooting" },
  defense: { zh: "防守", en: "Defense" },
  playmaking: { zh: "组织", en: "Playmaking" },
};

/** The attributes a focus trains (same source the growth engine uses). */
export function focusAttributes(focus) {
  return [...trainedAttributes({ focus })];
}

/**
 * Choose this week's training focus. One choice per week — choosing again
 * in the same week throws. Returns a new reborn state; the input is never
 * mutated. `week` is the season week number (1-based).
 *
 * R7: personal training is the Player career's own play — a coach or GM
 * root reaching this entry is refused with CareerPermissionError. `root`
 * is the long-career root save (optional; a missing root reads as the
 * Classic GM + Coach, which holds everything). Reborn has no
 * leagueCareer object, so the guard reads a bare { role }.
 */
export function chooseFocus(reborn, focus, week, root) {
  requireCapability({ role: identityOf(root) }, "personalTraining", root);
  if (!TRAINING_FOCI.includes(focus)) {
    throw new TypeError(`training focus is invalid: ${focus}`);
  }
  if (!Number.isInteger(week) || week < 1) {
    throw new TypeError(`training week is invalid: ${week}`);
  }
  const current = reborn?.player?.training;
  if (current?.week === week) {
    throw new Error(`training focus already chosen for week ${week}`);
  }
  const next = structuredClone(reborn);
  next.player.training = { focus, week };
  return next;
}

/**
 * The development-plan map awardGrowth consumes ({ bref: { focus } }). In a week a skill is being specialised
 * (fragments.js) the plan also names that skill's attributes, which awardGrowth levels instead of the focus's.
 */
export function trainingPlan(reborn, week = null) {
  const focus = reborn?.player?.training?.focus;
  if (!TRAINING_FOCI.includes(focus)) return {};
  const attributes = specialtyAttributes(reborn, week);
  return { [reborn.identity.bref]: attributes ? { focus, attributes } : { focus } };
}

/**
 * Convert one game's line into growth under the current plan. Returns the
 * new ledger, the changed values, and the entries the card displays
 * (each leveled attribute with its from → to, so the source is visible).
 * `cards` are the sim-ready roster cards (awardGrowth reads their
 * attributes); `rows` are the raw roster rows (the real card ladder, for
 * ceilings). A custom `ladderOf` overrides the ladder lookup. `xpMultiplier` is awardGrowth's own boost
 * (intensive training, js/reborn/fragments.js); the ceilings still bound every gain. `week` is the game's week: a
 * specialisation bought for it steers the levels (no week = no specialisation).
 */
export function applyGameGrowth(
  reborn,
  { year, cards = [], rows = [], lines = [], ladderOf = null, xpMultiplier = 1, week = null } = {},
) {
  const ladder =
    ladderOf ||
    ((bref) =>
      (rows || [])
        .filter((r) => r?.bref === bref)
        .map((r) => {
          try {
            return seasonToCard(r);
          } catch {
            return null;
          }
        })
        .filter(Boolean));
  const out = awardGrowth({
    growth: reborn?.player?.growth || {},
    plans: trainingPlan(reborn, week),
    year,
    players: cards,
    lines,
    ladderOf: ladder,
    xpMultiplier,
  });
  const next = structuredClone(reborn);
  next.player.growth = out.growth;
  return { reborn: next, growth: out.growth, changes: out.changes, entries: out.entries };
}

/** Render growth entries as card lines with their source. */
export function describeGrowth(entries, lang = "zh") {
  const zh = lang !== "en";
  const lines = [];
  for (const entry of entries || []) {
    for (const step of entry.leveled || []) {
      lines.push(
        zh
          ? `训练：${step.attribute} ${step.from} → ${step.to}`
          : `Training: ${step.attribute} ${step.from} → ${step.to}`,
      );
    }
    if (entry.practice > 0) {
      lines.push(
        zh
          ? `训练日：不上场也在进步，本周训练 +${entry.practice} 经验（升级进度 ${Math.round((entry.progress || 0) * 100)}%）`
          : `Practice day: you grow off the court too, +${entry.practice} XP this week (level progress ${Math.round((entry.progress || 0) * 100)}%)`,
      );
    }
    // Practice-day XP has its own line above; this one is the game's own XP (minutes played).
    const gameXp = entry.xp - (entry.practice || 0);
    if (!entry.leveled?.length && gameXp > 0) {
      lines.push(
        zh
          ? `训练经验 +${gameXp}${entry.name ? `（${esc(entry.name)}）` : ""}`
          : `Training XP +${gameXp}${entry.name ? ` (${esc(entry.name)})` : ""}`,
      );
    }
  }
  return lines;
}
