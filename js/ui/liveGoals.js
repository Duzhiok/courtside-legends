/**
 * The "本场目标" strip on the live game screen (C6): every goal of the game, with how far along it is,
 * updated as the box score moves. Pure string builder over `career/gameGoals.js` progress -- no DOM,
 * no state -- so it unit-tests and uses the same words as the pre-game and post-game cards.
 *
 * Colour never carries the meaning alone: every row says its status in words too (WCAG 1.4.1).
 */
import { goalText } from "../career/gameGoals.js";
import { esc, tr } from "./timeTravel/format.js";

const STATUS = {
  done: { icon: "✓", zh: "已达成", en: "Done" },
  failed: { icon: "✗", zh: "已失败", en: "Missed" },
  ahead: { icon: "●", zh: "暂时达标", en: "On pace" },
  open: { icon: "○", zh: "进行中", en: "In progress" },
};

/** "7 / 10", with the unit that goal is counted in. A lead can be negative: that reads "落后 3". */
function valueText(item, lang) {
  const { id, cur, target } = item;
  if (id === "margin") {
    const lead = cur >= 0
      ? tr(lang, `领先 ${cur}`, `Up ${cur}`)
      : tr(lang, `落后 ${-cur}`, `Down ${-cur}`);
    return `${lead} / ${target}`;
  }
  if (id === "careful") return `${cur} / ${target} ${tr(lang, "上限", "max")}`;
  if (id === "rookie") return `${cur} / ${target} ${tr(lang, "分钟", "min")}`;
  return `${cur} / ${target}`;
}

/** 0–100 for the bar. A lead below zero and a budget at zero both read as empty. */
export function barPercent(item) {
  if (!item?.target) return 0;
  return Math.max(0, Math.min(100, Math.round((item.cur / item.target) * 100)));
}

export function liveGoalsHtml({ progress, lang = "zh" } = {}) {
  if (!progress?.length) return "";
  const rows = progress.map((item) => {
    const status = STATUS[item.status] || STATUS.open;
    const label = tr(lang, status.zh, status.en);
    return `<li class="lg-goal lg-${esc(item.status)}" data-goal="${esc(item.id)}" data-status="${esc(item.status)}">
      <span class="lg-icon" aria-hidden="true">${status.icon}</span>
      <span class="lg-text">${esc(goalText(item.goal, lang))}</span>
      <span class="lg-value">${esc(valueText(item, lang))}</span>
      <span class="lg-status">${esc(label)}</span>
      <span class="lg-bar" aria-hidden="true"><i style="width:${barPercent(item)}%"></i></span>
    </li>`;
  }).join("");
  return `<p class="lg-title">${esc(tr(lang, "本场目标", "Goals for this game"))}</p><ul class="lg-goals">${rows}</ul>`;
}
