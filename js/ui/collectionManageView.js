/**
 * Collection management HTML: capacity bar, 图鉴, one-tap junk recycling,
 * and per-card recycle buttons. Pure strings. (The 技能碎片 skill shop
 * was removed with the skill-book system — S0.)
 */
import { MAX_CARDS, recycleValue } from "../data/accountRecycle.js";

export function manageBarHtml({ account, codex, junk }) {
  const used = (account.playerIds || []).length;
  const full = used >= MAX_CARDS;
  const junkLine = junk.count
    ? `<button type="button" class="btn small" data-recycle-junk>一键分解低价值卡（${junk.count} 张 → ¤${junk.gold} + ${junk.fragments} 碎片）</button>`
    : '<span class="tiny">没有明显的低价值卡可分解</span>';
  return `<div class="manage-bar${full ? " full" : ""}">
      <span class="manage-cap" role="status">卡库 <strong>${used}/${MAX_CARDS}</strong>${full ? " · 已满，抽卡前先分解" : ""}</span>
      <span>技能碎片 <strong>${account.fragments || 0}</strong></span>
      <span title="分解掉的卡也算图鉴">图鉴 <strong>${codex.people}</strong>/${codex.total} 人 · 超巨以上 ${codex.superstars}</span>
      ${junkLine}
    </div>
    <p class="tiny">分解不可逆：主力、高成色（S/A）、已升星的卡会二次确认；本命卡不能分解；至少保留 12 张。分解得到的技能碎片目前没有可兑换的物品。</p>`;
}

export function recycleButtonHtml(card, { isFavorite }) {
  if (isFavorite) return "";
  const value = recycleValue(card);
  return `<button type="button" class="btn small ghost" data-recycle="${card.id}">分解 → ¤${value.gold} + ${value.fragments} 碎片</button>`;
}
