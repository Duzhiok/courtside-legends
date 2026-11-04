/**
 * B18 — 传奇时刻的高光卡片（对照概念图）：抬头（火焰 + HIGHLIGHT · 主/客队 + 队标 + 时钟）、
 * 大头像、加粗标题、一句说明。纯字符串构造，不碰 DOM；队标/时钟/比分条由调用方（feedView）
 * 传入现成 HTML，避免和 feedView 循环依赖。所有进入 HTML 的动态文本都走 escFn。
 */
import { legendHeadline } from "./feedTier.js";

const FLAME =
  '<svg class="feed-flame" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M8 1c.5 2.2 3.5 3.8 3.5 7.2A3.5 3.5 0 0 1 8 11.8a3.5 3.5 0 0 1-3.5-3.6c0-1.4.7-2.4 1.5-3.2.1 1 .6 1.6 1.2 1.9C7 5.3 7.2 3 8 1Z"/></svg>';

const SIDE_LABEL = { home: { zh: "主队", en: "HOME" }, away: { zh: "客队", en: "AWAY" } };
export const sideLabel = (side, lang) => SIDE_LABEL[side]?.[lang === "en" ? "en" : "zh"] ?? "";

/** The one-sentence description under the title. Names are plain text here; the caller's escFn runs on the result. */
export function legendSubline(kind, { actorName, ev, run, side, lang }) {
  const en = lang === "en";
  if (kind === "run") {
    const who = sideLabel(side, lang);
    return en ? `${who} has scored ${run?.points ?? 0} straight — no answer yet!` : `${who}连拿 ${run?.points ?? 0} 分，对手还没还手！`;
  }
  if (kind === "block") {
    const blocked = ev?.meta?.block?.blockedName;
    if (actorName && blocked) return en ? `${actorName} rejects ${blocked}!` : `${actorName} 盖掉了 ${blocked} 的出手！`;
    return en ? "A huge block in crunch time!" : "关键时刻的一记大帽！";
  }
  // buzzer / goahead: a made shot that takes the lead
  const three = ev?.meta?.shot?.pts === 3;
  if (actorName) {
    return en
      ? `${actorName} hits the key ${three ? "three" : "shot"} to take the lead!`
      : `${actorName} 命中关键${three ? "三分" : "投篮"}，反超比分！`;
  }
  return en ? "The key shot takes the lead!" : "关键一击，反超比分！";
}

/**
 * @param {object} p
 * @param {string} p.kind        legend kind from feedEventTier
 * @param {object} p.ev          the sim event
 * @param {object} [p.run]       run-tracker result (kind "run")
 * @param {"home"|"away"} p.side the side that made the highlight play (the blocker's side for blocks)
 * @param {string} p.chipHtml    team chip for that side
 * @param {string} p.metaHtml    clock label markup (may be "")
 * @param {string} p.scoreHtml   score chip markup (may be "")
 * @param {string} p.actorName   plain name of the player the card is about, or ""
 * @param {string|null} p.avatarHtml  pre-built avatar markup, or null
 * @param {function} p.escFn
 * @param {string} p.lang
 */
export function legendCardHtml({ kind, ev, run, side, chipHtml, metaHtml, scoreHtml, actorName, avatarHtml, escFn, lang }) {
  const title = legendHeadline(kind, lang, { points: run?.points });
  const sub = legendSubline(kind, { actorName, ev, run, side, lang });
  const head =
    `<span class="feed-legend-head">${FLAME}<span class="feed-legend-label">HIGHLIGHT · ${escFn(sideLabel(side, lang))}</span>` +
    `${chipHtml}${metaHtml}</span>`;
  const avatar = avatarHtml ? `<span class="feed-legend-avatar">${avatarHtml}</span>` : "";
  const body =
    `<span class="feed-legend-body">${avatar}` +
    `<span class="feed-legend-copy"><strong class="feed-legend-title">${escFn(title)}</strong>` +
    `<span class="feed-legend-sub">${escFn(sub)}</span></span>${scoreHtml}</span>`;
  return head + body;
}
