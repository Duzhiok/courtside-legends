/**
 * "My Jersey Collection" (My World): every jersey the account owns, bought or earned, with its full story one tap away.
 * Pure HTML builder; myWorldScreen owns the clicks (data-mw-action="equip-jersey" / "unequip-jersey").
 *
 * Wearing a jersey puts its colours and number on the 2D figure (avatar2dJersey.js). The 3D figure has no jersey model, and
 * this says so instead of pretending. A silhouette the single 2D cut cannot show is labelled a simplified preview.
 */
import { esc } from "../../core/html.js";
import { ERAS, UNIFORM_FAMILIES } from "../../collectibles/jerseyEras.js";
import { jerseySvg } from "./jerseySvg.js";
import { jerseyKit } from "../avatar2d/avatar2dJersey.js";

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
      ${jerseyKit(t)?.simplified ? `<span class="tiny muted">${esc(L("2D 为简化预览：颜色和号码来自这件球衣，版型沿用同一件。", "2D is a simplified preview: this jersey's colours and number on the same cut.", lang))}</span>` : ""}
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
    <p class="tiny muted">${esc(L("穿上后，2D 形象会换上这件球衣的颜色和号码；3D 形象还没有球衣模型。", "Wear one and the 2D figure puts on its colours and number; the 3D figure has no jersey model yet.", lang))}</p>
    <ul class="mw-jersey-list">${jerseys.list.map((e) => cardHtml(e, e.key === jerseys.equipped, lang)).join("")}</ul></section>`;
}
