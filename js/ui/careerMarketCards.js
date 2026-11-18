/**
 * The two buy-cards of the gold-challenge market (a coach to hire, a skill pack to buy). Pure HTML builders, shared by the
 * merged market list and the setup / live skill shelves. Moved out of app.js (B61).
 */
import { coachTactics, coachSpecialtyLabel, isLegendCoach } from "../data/coaches.js";
import { coachRecordLabel } from "../data/account.js";
import { esc } from "../core/html.js";
import { shortfallLabel } from "./shortfall.js";
import { careerCoachPrice } from "../career/coachMarket.js";

/** 单个教练招聘卡的 HTML——被金币晋级赛合并列表和被隐藏的旧面板共用，不重复模板。 */
export function coachMarketCardHtml(offer, gold, coach) {
  const cost = offer.hireCost ?? careerCoachPrice(offer);
  const book = coachTactics(offer)
    .slice(0, 3)
    .map((t) => t.name)
    .join(" / ");
  const can = gold >= cost;
  const isCur = coach?.id === offer.id;
  return `<div class="career-coach-card ${isCur ? "current" : ""}">
    <strong>${esc(offer.name)}${isLegendCoach(offer) ? ' <span class="rarity-tag myth">名帅</span>' : ""}</strong>
    <div class="tiny">${esc(coachRecordLabel(offer))}</div>
    <div class="tiny">擅长 ${esc(coachSpecialtyLabel(offer))}</div>
    <div class="tiny">${esc(offer.style || "")}</div>
    <div class="tiny">战术板：${esc(book || "—")}</div>
    <div class="tiny">${esc(offer.note || "")}</div>
    <button type="button" class="btn small primary" data-hire-career-coach="${offer.id}" ${
      can && !isCur ? "" : "disabled"
    }>${isCur ? "已是主帅" : can ? `聘请 ¤${cost}` : shortfallLabel(cost, gold)}</button>
  </div>`;
}

/** 单个技能包购买卡的 HTML——被金币晋级赛合并列表和 setup/live 两处技能货架共用。 */
export function skillOfferCardHtml(offer, gold) {
  const cost = offer.cost || 99;
  const canAfford = gold >= cost;
  const rarity = offer.rarityLabel || offer.rarity || "";
  return `<div class="career-skill-card rarity-${esc(offer.rarity || "common")}">
    <strong>${esc(offer.name)}${
      rarity ? ` <span class="rarity-tag ${esc(offer.rarity || "")}">${esc(rarity)}</span>` : ""
    }</strong>
    <div class="tiny">${esc(offer.desc || "")}</div>
    <div class="tiny">标价 ¤${cost}${offer.rarity === "mythic" ? " · 对齐超巨身价" : ""}</div>
    <button type="button" class="btn small primary" data-buy-skill="${offer.id}" ${
      canAfford ? "" : "disabled"
    }>${canAfford ? `买入入库 ¤${cost}` : shortfallLabel(cost, gold)}</button>
  </div>`;
}
