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

/** A story jersey (earned in a Reborn run: swapped, or the player's own legacy one) rather than a Shop product. */
const isStory = (entry) => entry.source !== "shop";
const TAG = { shop: { zh: "商城购买", en: "Bought" }, exchange: { zh: "交换所得", en: "Earned" }, legacy: { zh: "传承", en: "Legacy" } };

function titleOf(entry, lang) {
  const t = entry.template;
  if (isStory(entry)) {
    const who = lang === "en" ? t.playerNameEn || t.playerName : t.playerName;
    return entry.source === "legacy"
      ? L(`${who} · ${t.season} 传承球衣`, `${who} · ${t.season} legacy jersey`, lang)
      : L(`${who} · ${t.season} 交换球衣`, `${who} · ${t.season} swapped jersey`, lang);
  }
  return lang === "en" ? t.label?.en || t.playerName : t.label?.zh || t.playerName;
}

/** Team . season . number, from the template only; a story jersey states no number, and that is said rather than guessed. */
function factsLine(entry, lang) {
  const t = entry.template;
  const team = t.teamName ? L(t.teamName.zh, t.teamName.en, lang) : t.teamCode || null;
  const season = t.season != null ? String(t.season) : null;
  const number = t.number != null && t.number !== "" ? `#${t.number}` : L("号码未记载", "number not recorded", lang);
  return [team, season, number].filter(Boolean).join(" · ");
}

/** How and when it was acquired, from the evidence the collection actually holds (the Shop stores no purchase date, so none is shown). */
function acquiredLine(entry, lang) {
  const p = entry.instance?.provenance;
  if (!isStory(entry) || !p) return L("商城购买", "Bought in the Shop", lang);
  if (entry.source === "legacy") return L(`${p.year} 赛季 · 用 ${p.cost} 个职业碎片兑换`, `${p.year} · redeemed for ${p.cost} career fragments`, lang);
  const who = lang === "en" ? p.fromNameEn || p.fromName : p.fromName;
  const result = p.margin != null ? L(`${p.won ? "赢" : "输"} ${p.margin} 分`, `${p.won ? "won" : "lost"} by ${p.margin}`, lang) : "";
  return [L(`${p.year} 赛季第 ${p.game ?? "?"} 场`, `${p.year}, game ${p.game ?? "?"}`, lang), L(`与 ${who} 交换`, `swapped with ${who}`, lang), result].filter(Boolean).join(" · ");
}

function provenanceHtml(entry, lang) {
  const p = entry.instance?.provenance;
  if (entry.source === "shop") return `<p class="tiny">${esc(L("来源：商城购买 · 原创复古球衣，不属于任何真实球队的官方商品。", "Source: bought in the Shop · an original throwback, not an official team product.", lang))}</p>`;
  if (!p) return "";
  if (entry.source === "legacy") {
    return [
      L(`${p.playerName} 的 ${p.year} 赛季球衣${p.team ? `（${p.team}）` : ""}，用 ${p.cost} 个职业碎片兑换。`, `${p.playerNameEn || p.playerName}'s own ${p.year} jersey${p.team ? ` (${p.team})` : ""}, redeemed for ${p.cost} career fragments.`, lang),
      L("职业碎片只能靠比赛表现获得（高光表现、宿敌对决获胜），每个赛季只能兑换一件，商城不卖。", "Career fragments are earned only by play (standout games, rivalry wins); one per season, never sold in the Shop.", lang),
      L("这是游戏里的剧情，不是现实中存在的实物。", "A game story, not a real object.", lang),
    ].map((x) => `<p class="tiny">${esc(x)}</p>`).join("");
  }
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
    <div class="mw-jersey-art">${jerseySvg(t, { size: 96, label: titleOf(entry, lang) })}</div>
    <div class="mw-jersey-info">
      <strong>${esc(titleOf(entry, lang))}</strong>
      <span class="mw-jersey-tag">${esc(L((TAG[entry.source] || TAG.shop).zh, (TAG[entry.source] || TAG.shop).en, lang))}</span>
      ${isStory(entry) ? `<span class="mw-jersey-facts">${esc(factsLine(entry, lang))}</span>` : ""}
      <span class="tiny muted">${esc(eraLabel(t, lang))}${fam ? ` · ${esc(L(fam.zh, fam.en, lang))}` : ""}</span>
      ${isStory(entry) ? `<span class="mw-jersey-acq">${esc(L("获得：", "Acquired: ", lang))}${esc(acquiredLine(entry, lang))}</span>` : ""}
      ${equipped ? `<span class="mw-owned-state">${esc(L("✓ 当前球衣", "✓ Current", lang))}</span>` : ""}
      ${jerseyKit(t)?.simplified ? `<span class="mw-jersey-tag mw-jersey-simple">${esc(L("简化预览", "Simplified preview", lang))}</span>` : ""}
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
    <p class="tiny muted">${esc(L("穿上后，2D 形象会换上这件球衣的颜色和号码。标有「简化预览」的，版型沿用同一件，只有颜色和号码是这件球衣的。3D 形象还没有球衣模型。", "Wear one and the 2D figure puts on its colours and number. \"Simplified preview\" means the cut is the same one for every jersey; only the colours and number are this jersey's. The 3D figure has no jersey model yet.", lang))}</p>
    <ul class="mw-jersey-list">${jerseys.list.map((e) => cardHtml(e, e.key === jerseys.equipped, lang)).join("")}</ul></section>`;
}
