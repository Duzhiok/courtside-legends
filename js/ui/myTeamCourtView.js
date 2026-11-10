/**
 * Starting-five court (pure HTML). Each starter stands on the spot of his own position (courtSlots.js: looked up by
 * name, not by array index). The cards are big on purpose: the five players ARE the picture; the court is only
 * the stage behind them. Heights are fixed per breakpoint in myTeamClubhouse.css so cards never overlap or clip.
 */
import { overall } from "../data/players.js";
import { photoImg } from "../data/photo.js";
import { playerSlotPos } from "../engine/gameplan.js";
import { SLOT_ORDER, COURT_SLOTS, assignCourtSlots } from "../myteam/courtSlots.js";
import { esc, T, displayName } from "./myTeamViewKit.js";

function starterCard(card, pos, lang) {
  return `<div class="mtc-court-card" data-card="${esc(card.id)}" data-pos="${pos}">
    <span class="mtc-court-photo">${photoImg(card, "headshot")}</span>
    <span class="mtc-court-name">${esc(displayName(card, lang))}</span>
    <span class="mtc-court-meta"><b>${pos}</b> · OVR ${overall(card)}</span>
    <button type="button" class="btn small ghost mtc-swap-btn" data-act="swap" data-card="${esc(card.id)}">${T(lang, "换人", "Swap")}</button>
  </div>`;
}

export function courtHtml(s, lang) {
  const placed = assignCourtSlots(s.starters, playerSlotPos, overall);
  const slots = SLOT_ORDER.map((pos) => {
    const { left, top } = COURT_SLOTS[pos];
    const card = placed[pos];
    const inner = card ? starterCard(card, pos, lang) : `<span class="mtc-court-empty">${pos} · ${T(lang, "空缺", "Open")}</span>`;
    return `<div class="mtc-court-slot" data-slot="${pos}" style="left:${left}%;top:${top}%">${inner}</div>`;
  }).join("");
  const benchNote = s.bench.length
    ? T(lang, `替补 ${s.bench.length} 人 · 点「换人」用替补换下首发`, `${s.bench.length} on the bench · tap Swap to bring one in`)
    : T(lang, "没有替补可换 — 先在收藏里抽卡扩充名单", "No bench players to swap in — draw more cards to grow the roster");
  return `<section class="mtc-card mtc-court-sec">
    <div class="mtc-sec-head">
      <h3>${T(lang, "我的首发五虎", "My Starting Five")}</h3>
      <button type="button" class="mtc-link" data-act="edit-lineup">${T(lang, "调整阵容", "Edit lineup")}</button>
    </div>
    <div class="mtc-court" role="img" aria-label="${T(lang, "首发五虎站位图", "Starting five court diagram")}">
      <div class="mtc-court-paint"></div><div class="mtc-court-arc"></div><div class="mtc-court-hoop"></div>
      ${slots}
    </div>
    <p class="tiny mtc-note">${benchNote}</p>
  </section>`;
}
