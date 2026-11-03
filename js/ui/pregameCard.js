/**
 * What the season hub's "next game" card says before the game: the goals (C6). Pure string builder
 * over `career/gameGoals.js` -- no DOM, no state -- so it unit-tests, and the same words are used
 * on the post-game card afterwards.
 */
import { GAME_GOALS_PER_GAME, GAME_GOAL_XP_BONUS, HAND_PLAY_XP_MULTIPLIER } from "../career/balance.js";
import { goalText } from "../career/gameGoals.js";
import { esc, tr } from "./timeTravel/format.js";

/** 0.25 -> "25", 1.5 -> "1.5". */
const pct = (fraction) => String(Math.round(fraction * 100));

export function pregameCardHtml({ goals, lang = "zh" } = {}) {
  if (!goals?.length) return "";
  const rows = goals.slice(0, GAME_GOALS_PER_GAME).map((goal, index) => {
    // The second goal only counts when you coach the game; say so on the row, not just in a footnote.
    const tag = index > 0
      ? ` <span class="pg-pre-tag">${esc(tr(lang, "亲自指挥才计入", "Counts if you coach"))}</span>`
      : "";
    return `<li class="pg-pre-goal">${esc(goalText(goal, lang))}${tag}</li>`;
  }).join("");
  const note = tr(
    lang,
    `每达成一个：本场球员与教练 XP +${pct(GAME_GOAL_XP_BONUS)}%。亲自指挥：XP ×${HAND_PLAY_XP_MULTIPLIER}，并多一个目标。`,
    `Each goal met: this game's player and coach XP +${pct(GAME_GOAL_XP_BONUS)}%. Coach it yourself: XP ×${HAND_PLAY_XP_MULTIPLIER} and a second goal.`,
  );
  return `<div class="pg-pre">
    <p class="pg-pre-title">${esc(tr(lang, "本场目标", "Goals for this game"))}</p>
    <ul class="pg-pre-goals">${rows}</ul>
    <p class="pg-pre-note">${esc(note)}</p>
  </div>`;
}
