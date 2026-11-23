// The draft screen's title and money line, as pure functions of the draft.
// A fresh draft (`initDraft`) and a resumed one (`continueFromSave`) both
// paint these, so they must come from the same place or the two drift apart
// (B94: a resumed draft showed the template's stale "预算：15" and an older
// custom-mode title).
import { CUSTOM_BUDGET } from "../data/customPool.js";
import { DRAFT_FREE_REFRESHES, draftRefreshCost } from "../engine/draft.js";
import { L } from "../i18n.js";

// Raw Chinese on purpose: the static phrase table translates the page once at
// boot / on a language switch, and that is how this title has always behaved.
export function draftTitle(mode) {
  if (mode === "custom") return "自定义 · 15 块轮抽 → 32 历史球队淘汰赛";
  if (mode === "duel") return "双人对抗 · 金币买球员（刷新另计）";
  return "选秀建队";
}

/** The "budget / gold" line above the pack. `d` is a live draft (reads A's gold). */
export function draftMoneyLabelHtml(d) {
  const gold = d.teams.A.gold;
  if (d.mode === "custom") return `预算：<strong id="draft-gold">${CUSTOM_BUDGET}</strong> 块`;
  if (d.buyPlayers) return `金币：<strong id="draft-gold">${gold}</strong>`;
  // Draft Team: picking is free; the gold only pays for refreshing the list once the free ones are used
  const cost = draftRefreshCost(d);
  return L(
    `选人免费 · 刷新用金币：<strong id="draft-gold">${gold}</strong>（前 ${DRAFT_FREE_REFRESHES} 次刷新免费，之后每次 ¤${cost}）`,
    `Picks are free · gold for refreshing: <strong id="draft-gold">${gold}</strong> (first ${DRAFT_FREE_REFRESHES} refreshes free, then ¤${cost} each)`,
  );
}
