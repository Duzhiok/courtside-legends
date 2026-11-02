// "已领悟" (skills learned from play, the C3 ledger) as a badge + a one-line list, for every place that shows a
// player row: the rotation board, the roster evaluation, the season market. Pure HTML builders.
import { MAX_EPIPHANY } from "../engine/epiphany.js";
import { SKILL_PACKS } from "../data/skills.js";
import { skillNameL } from "../i18n.js";
import { esc, tr } from "./timeTravel/format.js";

/** Skill ids this player has learned from play (the C3 ledger, keyed by bref), junk filtered out. */
export function learnedSkillIds(ledger, bref) {
  const list = ledger?.[bref]?.learned;
  return Array.isArray(list) ? list.filter((id) => typeof id === "string" && id) : [];
}

const skillName = (id, lang) => (SKILL_PACKS[id]?.name ? skillNameL(SKILL_PACKS[id].name, lang) : id);

/** "✦ 已领悟 1/2" (hover or the second line names the skills). Nothing at all when he hasn't learned any. */
export function learnedBadgeHtml(ids, lang) {
  if (!ids.length) return "";
  const names = ids.map((id) => skillName(id, lang)).join(" · ");
  return `<span class="learned-badge" title="${esc(names)}"><i aria-hidden="true">✦</i>${tr(lang, "已领悟", "Learned")} ${ids.length}/${MAX_EPIPHANY}</span>`;
}

/** The skills' names on their own line: a phone has no hover, so the badge alone would hide them. */
export const learnedLineHtml = (ids, lang) => (ids.length
  ? `<div class="learned-line">${tr(lang, "场上领悟：", "Learned in play: ")}${esc(ids.map((id) => skillName(id, lang)).join(" · "))}</div>`
  : "");
