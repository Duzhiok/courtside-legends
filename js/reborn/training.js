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
 */
export function chooseFocus(reborn, focus, week) {
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

/** The development-plan map awardGrowth consumes ({ bref: { focus } }). */
export function trainingPlan(reborn) {
  const focus = reborn?.player?.training?.focus;
  if (!TRAINING_FOCI.includes(focus)) return {};
  return { [reborn.identity.bref]: { focus } };
}

/**
 * Convert one game's line into growth under the current plan. Returns the
 * new ledger, the changed values, and the entries the card displays
 * (each leveled attribute with its from → to, so the source is visible).
 * `cards` are the sim-ready roster cards (awardGrowth reads their
 * attributes); `rows` are the raw roster rows (the real card ladder, for
 * ceilings). A custom `ladderOf` overrides the ladder lookup.
 */
export function applyGameGrowth(
  reborn,
  { year, cards = [], rows = [], lines = [], ladderOf = null } = {},
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
    plans: trainingPlan(reborn),
    year,
    players: cards,
    lines,
    ladderOf: ladder,
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
    if (!entry.leveled?.length && entry.xp > 0) {
      lines.push(
        zh
          ? `训练经验 +${entry.xp}（${entry.name}）`
          : `Training XP +${entry.xp} (${entry.name})`,
      );
    }
  }
  return lines;
}
