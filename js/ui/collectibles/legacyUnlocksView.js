/**
 * "Career honours" in My World: titles and portrait frames redeemed with Player Reborn career fragments
 * (js/collectibles/legacyCosmetics.js). Pure HTML builder; myWorldScreen owns the clicks:
 * a title -> data-mw-action="equip-title" / "unequip-title" (data-unlock); a frame reuses the owned-item row and its
 * "equip-owned" / "unequip-owned" actions, because it sits in the Shop's own portrait-frame slot.
 */
import { esc } from "../../core/html.js";
import { unlockLabel } from "../../collectibles/legacyCosmetics.js";
import { ownedRow } from "../myWorldView.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);

function titleRow({ unlock, worn }, lang) {
  const btn = worn
    ? `<button type="button" class="btn small ghost" data-mw-action="unequip-title">${esc(L("取下", "Take off", lang))}</button>`
    : `<button type="button" class="btn small mw-gold" data-mw-action="equip-title">${esc(L("设为称号", "Use as title", lang))}</button>`;
  return `<li class="mw-owned-row"><span class="mw-owned-name">「${esc(unlockLabel(unlock, lang))}」</span>${worn ? `<span class="mw-owned-state">${esc(L("✓ 正在使用", "✓ In use", lang))}</span>` : ""}<span class="mw-owned-actions" data-unlock="${esc(unlock.id)}">${btn}</span></li>`;
}

/** `list` = ownedUnlocks(account, equippedFrame) entries, or null for a guest (the section is hidden). */
export function legacyUnlocksHtml(list, lang = "zh") {
  if (!list) return "";
  const head = `<h3>${esc(L("职业荣誉", "Career Honours", lang))}</h3>`;
  if (!list.length) {
    return `<section class="mw-card mw-honours">${head}<p class="mw-empty">${esc(L("还没有职业荣誉。在穿越生涯里用职业碎片兑换称号和头像框；称号要先在比赛里真的做到（觉醒、结成宿敌、总冠军）。", "No career honours yet. In a Reborn run, redeem titles and a portrait frame with career fragments; a title needs the real thing first (an awakening, a rivalry, a championship).", lang))}</p></section>`;
  }
  const titles = list.filter((e) => e.unlock.kind === "title").map((e) => titleRow(e, lang)).join("");
  const frames = list.filter((e) => e.unlock.kind === "frame").map((e) => ownedRow({ item: e.unlock, kind: "frame", equipped: e.worn }, lang)).join("");
  return `<section class="mw-card mw-honours">${head}
    <p class="tiny muted">${esc(L("用职业碎片兑换，商城不卖，不影响比赛能力。", "Redeemed with career fragments; never sold in the Shop; no effect on play.", lang))}</p>
    <ul class="mw-owned-list">${titles}${frames}</ul>
    <p class="mw-status" id="mw-honours-status" role="status" aria-live="polite"></p></section>`;
}
