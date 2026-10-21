/**
 * Collection management HTML: capacity bar, 图鉴, one-tap junk recycling,
 * per-card recycle button, and the 技能碎片 skill shop. Pure strings.
 */
import { MAX_BOUGHT_SKILLS, MAX_CARDS, recycleValue } from "../data/accountRecycle.js";
import { SKILL_RARITY_LABEL } from "../data/skills.js";

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
    <p class="tiny">分解不可逆：主力、高成色（S/A）、已升星的卡会二次确认；本命卡不能分解；至少保留 12 张。分解得到的碎片只能换技能。</p>`;
}

export function recycleButtonHtml(card, { isFavorite }) {
  if (isFavorite) return "";
  const value = recycleValue(card);
  return `<button type="button" class="btn small ghost" data-recycle="${card.id}">分解 +¤${value.gold} +${value.fragments}碎</button>`;
}

export function skillShopHtml({ cards, selectedId, options, bought, fragments }, esc) {
  const cardOptions = cards
    .map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${esc(c.name)} · ${c.season}</option>`)
    .join("");
  const full = bought >= MAX_BOUGHT_SKILLS;
  const rows = options
    .slice(0, 40)
    .map((skill) => `<div class="shop-row">
        <span>${esc(skill.name)} <span class="tiny">${esc(SKILL_RARITY_LABEL[skill.rarity] || "")}</span></span>
        <button type="button" class="btn small" data-buy-skill="${skill.id}" ${full || fragments < skill.cost ? "disabled" : ""}>${skill.cost} 碎片</button>
      </div>`)
    .join("");
  return `<details class="skill-shop" ${selectedId ? "open" : ""}>
      <summary>技能店（用技能碎片给球员学技能）</summary>
      <p class="tiny">每张卡最多买 ${MAX_BOUGHT_SKILLS} 个；身高、年龄、专属名单等门槛照常生效。你有 ${fragments} 碎片。</p>
      <label class="tiny">选择球员
        <select data-shop-card><option value="">—</option>${cardOptions}</select>
      </label>
      ${selectedId ? `<p class="tiny">已买 ${bought}/${MAX_BOUGHT_SKILLS}${full ? "，已达上限" : ""}</p><div class="shop-list">${rows || '<p class="tiny">没有可买的技能</p>'}</div>` : ""}
    </details>`;
}
