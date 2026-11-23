/**
 * Per-player role + minute target for the pre-game setup cards.
 *
 * The user asked (2026-11-22) for role and minutes to live on each player
 * card too — same as the tendency dropdowns — so a card and its rotation
 * settings are read together and there is nothing to match by name in a
 * separate "角色与分钟" list further down the page. The list itself goes
 * away with the advanced section; only the totals + the two section
 * buttons (suggest minutes / save as default rotation) survive, as a bar
 * under the roster (renderSetupRoles in app.js).
 *
 * Writes go straight onto the player object (roleExpectation /
 * targetMinutes), exactly like the old list rows did; the card binding in
 * app.js calls refreshAfter() after each change so the totals bar and the
 * other cards stay in sync.
 */
import { PLAYER_ROLES, inferPlayerRole, staminaMinuteCap, staminaMinuteHint } from "../data/playerMinutes.js";
import { roleName } from "../engine/gameplan.js";
import { esc } from "../core/html.js";

/** Role select + minutes input + stamina hint, rendered at a card's bottom. */
export function setupCardRoleHtml(p, lang = "zh") {
  const role = p.roleExpectation || inferPlayerRole(p);
  const opts = Object.values(PLAYER_ROLES)
    .map((r) => `<option value="${r.id}" ${r.id === role ? "selected" : ""}>${esc(roleName(r, lang))}</option>`)
    .join("");
  const cap = staminaMinuteCap(p);
  const warn = (p.targetMinutes || 0) > cap ? " over-min" : "";
  const say = (zh, en) => (lang === "en" ? en : zh);
  return `<div class="setup-role-block${warn}">
    <label class="tiny">${say("角色", "Role")} <select class="setup-role-select" data-role-for="${p.id}" title="${say("场上角色", "Role on the floor")}">${opts}</select></label>
    <label class="tiny">${say("分钟", "Min")} <input class="setup-min-input" type="number" min="8" max="48" value="${p.targetMinutes ?? 24}" data-min-for="${p.id}" title="${say(`目标分钟（上限参考体能 ${cap}）`, `Target minutes (stamina suggests ${cap})`)}" /></label>
    <div class="tiny stamina-min-hint">${esc(staminaMinuteHint(p, lang))}</div>
  </div>`;
}
