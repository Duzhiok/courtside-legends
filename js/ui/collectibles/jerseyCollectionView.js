/**
 * "My Jersey Collection" (My World): every jersey the account owns, bought or earned, with its full story one tap away.
 * Pure HTML builder; myWorldScreen owns the clicks (data-mw-action="equip-jersey" / "unequip-jersey").
 *
 * Wearing a jersey records the choice only: the avatar renderer does not draw jersey templates yet, and this says so
 * instead of pretending (J2 follow-up in docs/implementation/JERSEY-COLLECTION.md).
 */
import { esc } from "../../core/html.js";
import { ERAS, UNIFORM_FAMILIES } from "../../collectibles/jerseyEras.js";
import { jerseySvg } from "./jerseySvg.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);
const eraLabel = (t, lang) => {
  const e = ERAS.find((x) => x.id === t.era);
  return e ? L(e.zh, e.en, lang) : "—";
};

function titleOf(entry, lang) {
  const t = entry.template;
  if (entry.source === "exchange") {
    const who = lang === "en" ? t.playerNameEn || t.playerName : t.playerName;
    return L(`${who} · ${t.season} 交换球衣`, `${who} · ${t.season} swapped jersey`, lang);
  }
  return lang === "en" ? t.label?.en || t.playerName : t.label?.zh || t.playerName;
}

function provenanceHtml(entry, lang) {
  const p = entry.instance?.provenance;
  if (entry.source === "shop") return `<p class="tiny">${esc(L("来源：商城购买 · 原创复古球衣，不属于任何真实球队的官方商品。", "Source: bought in the Shop · an original throwback, not an official team product.", lang))}</p>`;
  if (!p) return "";
  const lines = [
    L(`${p.fromName} 在 ${p.year} 赛季第 ${p.game ?? "?"} 场之后与你交换。`, `${p.fromNameEn || p.fromName} swapped with you after game ${p.game ?? "?"} of ${p.year}.`, lang),
    p.you && p.rival ? L(`那一晚你 ${p.you.pts} 分，他 ${p.rival.pts} 分，${p.won ? "你赢了" : "你输了"} ${p.margin} 分。`, `That night: you ${p.you.pts}, him ${p.rival.pts}; ${p.won ? "won" : "lost"} by ${p.margin}.`, lang) : "",
    L(`交手 ${p.meetings} 次 · 尊重度 ${p.respect}`, `${p.meetings} meetings · respect ${p.respect}`, lang),
    entry.instance.signed ? L("已签名", "Signed", lang) : L("未签名", "Not signed", lang),
    L("这是游戏里的剧情，不是现实中存在的实物。", "A game story, not a real object.", lang),
  ].filter(Boolean);
  return lines.map((x) => `<p class="tiny">${esc(x)}</p>`).join("");
}

function cardHtml(entry, equipped, lang) {
  const t = entry.template;
  const fam = UNIFORM_FAMILIES[t.family];
  const btn = equipped
    ? `<button type="button" class="btn small ghost" data-mw-action="unequip-jersey">${esc(L("取下", "Take off", lang))}</button>`
    : `<button type="button" class="btn small mw-gold" data-mw-action="equip-jersey">${esc(L("设为当前球衣", "Wear it", lang))}</button>`;
  return `<li class="mw-jersey-card${equipped ? " is-equipped" : ""}" data-jersey-key="${esc(entry.key)}">
    <div class="mw-jersey-art">${jerseySvg(t, { size: 84, label: titleOf(entry, lang) })}</div>
    <div class="mw-jersey-info">
      <strong>${esc(titleOf(entry, lang))}</strong>
      <span class="mw-jersey-tag">${esc(entry.source === "exchange" ? L("交换所得", "Earned", lang) : L("商城购买", "Bought", lang))}</span>
      <span class="tiny">${esc(eraLabel(t, lang))}${fam ? ` · ${esc(L(fam.zh, fam.en, lang))}` : ""}${t.number != null ? ` · #${esc(t.number)}` : ""}</span>
      ${equipped ? `<span class="mw-owned-state">${esc(L("✓ 当前球衣", "✓ Current", lang))}</span>` : ""}
      <details class="mw-jersey-story"><summary>${esc(L("来源与故事", "Story", lang))}</summary>${provenanceHtml(entry, lang)}</details>
      ${btn}
    </div>
  </li>`;
}

/** `jerseys` = { list: [owned entries], equipped: key|null }, or null for a guest (the section is hidden). */
export function jerseyCollectionHtml(jerseys, lang = "zh") {
  if (!jerseys) return "";
  const head = `<h3>${esc(L("球衣收藏", "Jersey Collection", lang))}</h3>`;
  if (!jerseys.list.length) {
    return `<section class="mw-card mw-jerseys">${head}<p class="mw-empty">${esc(L("还没有球衣。商城里能买到原创复古球衣；在穿越生涯里和宿敌打出真正的尊重，对手可能提出和你交换球衣。", "No jerseys yet. The Shop sells original throwbacks, and in a Reborn run a rival who really respects you may offer to swap.", lang))}</p></section>`;
  }
  return `<section class="mw-card mw-jerseys">${head}
    <p class="tiny muted">${esc(L("穿上只记录你的选择：头像暂时还不会画出球衣。", "Wearing records your choice only: the avatar does not draw jerseys yet.", lang))}</p>
    <ul class="mw-jersey-list">${jerseys.list.map((e) => cardHtml(e, e.key === jerseys.equipped, lang)).join("")}</ul></section>`;
}
