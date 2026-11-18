/**
 * Player Reborn jersey-exchange surface (J3): the pending offers, each with the real evidence behind it. Pure HTML builder;
 * the Reborn view owns state and clicks (data-jersey-accept / data-jersey-decline). Never promises a rating or a shot:
 * a jersey is a keepsake. It is also stated plainly that this is a game story, not a real signed object.
 */
import { esc } from "../../core/html.js";
import { jerseyState, pendingOffers } from "../../collectibles/jerseyExchange.js";
import { jerseySvg } from "../collectibles/jerseySvg.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);
const REASON = {
  MUTUAL_RESPECT: ["彼此欣赏", "Mutual respect"],
  RIVALRY: ["宿敌", "Rivals"],
  DIRECT_MATCHUP: ["今晚正面对位", "Guarded you tonight"],
  CHAMPIONSHIP: ["夺冠", "Title win"],
};

const reasonLine = (offer, lang) =>
  (offer.reasons || []).map((r) => (REASON[r] ? L(REASON[r][0], REASON[r][1], lang) : esc(r))).join(" · ");

function evidenceLine(offer, lang) {
  const e = offer.evidence || {};
  const parts = [L(`交手 ${e.meetings || 0} 次`, `${e.meetings || 0} meetings`, lang)];
  if (e.you && e.rival) parts.push(L(`那一晚你 ${e.you.pts} 分，他 ${e.rival.pts} 分`, `That night: you ${e.you.pts}, him ${e.rival.pts}`, lang));
  if (Number.isFinite(e.margin)) parts.push(L(`${e.won ? "赢" : "输"} ${e.margin} 分`, `${e.won ? "won" : "lost"} by ${e.margin}`, lang));
  return parts.join(" · ");
}

/** One offer card. */
export function jerseyOfferCardHtml(offer, lang = "zh") {
  const name = lang === "en" ? offer.fromNameEn || offer.fromName : offer.fromName;
  return `<article class="reborn-jersey-offer" data-jersey-offer="${esc(offer.id)}">
    <div class="reborn-jersey-art">${jerseySvg(offer.template, { size: 88, label: name })}</div>
    <div class="reborn-jersey-body">
      <strong>${esc(L(`${name} 想和你交换球衣`, `${name} wants to swap jerseys with you`, lang))}</strong>
      <div class="tiny">${esc(reasonLine(offer, lang))}</div>
      <div class="tiny">${esc(evidenceLine(offer, lang))}</div>
      <div class="tiny muted">${esc(L("这是游戏里的剧情：球衣没有签名，也不是现实中存在的实物。", "This is a game story: the jersey is not signed and not a real object.", lang))}</div>
      <div class="reborn-jersey-actions">
        <button type="button" class="btn small primary" data-jersey-accept="${esc(offer.id)}">${esc(L("接受交换", "Accept", lang))}</button>
        <button type="button" class="btn small" data-jersey-decline="${esc(offer.id)}">${esc(L("婉拒", "Decline", lang))}</button>
      </div>
    </div>
  </article>`;
}

/** The "jerseys offered to you" section, or "" when nothing is pending (an old save has none). */
export function jerseyOffersHtml({ reborn, lang = "zh" }) {
  const offers = pendingOffers(jerseyState(reborn));
  if (!offers.length) return "";
  return `<section class="reborn-jersey-offers" aria-label="${esc(L("球衣交换邀请", "Jersey offers", lang))}">
    <h3>${esc(L("球衣交换邀请", "Jersey offers", lang))}</h3>
    <div class="tiny muted">${esc(L("不点就保持待处理，本赛季结束后失效。", "Leave it pending; it lapses when this season ends.", lang))}</div>
    ${offers.map((o) => jerseyOfferCardHtml(o, lang)).join("")}
  </section>`;
}
