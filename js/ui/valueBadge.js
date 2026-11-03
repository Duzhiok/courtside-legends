/**
 * Which value badge a player may show, and to whom.
 *
 * 妖人 (a bargain) and 高薪低能 (an overpaid let-down) are both hidden facts. Print either on
 * a card you can still pick or buy and the game is solved: nobody picks the let-down, and the
 * bargain stops being a find. So:
 *   - not owned, not scouted  → nothing
 *   - not owned, scout bought → the scout reveals what it can see: the finds, and the traps
 *   - owned                   → you have found out: the let-down is shown
 */
import { scoutLabel, valueLabel } from "../data/intangibles.js";

export function valueBadge(player, { owned = false, scouted = false, lang = "zh" } = {}) {
  if (!player) return null;
  const trap = valueLabel(player, lang);
  const trapBadge = trap ? { text: trap, cls: player.valueArchetype } : null;
  if (owned) return trapBadge;
  if (!scouted) return null;
  const find = scoutLabel(player, lang);
  // Same mapping as before (bargain → "bargain", otherwise "bench-bandit"),
  // keyed on the archetype instead of the Chinese label text so it survives translation.
  if (find) return { text: find, cls: player.valueArchetype === "bargain" ? "bargain" : "bench-bandit" };
  return trapBadge;
}

export function valueBadgeHtml(badge) {
  return badge ? `<span class="value-badge ${badge.cls}">${badge.text}</span>` : "";
}
