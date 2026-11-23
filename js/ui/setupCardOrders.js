/**
 * Per-player tendency (orders) controls for the pre-game setup cards.
 *
 * The user asked (2026-11-22) for the tendency dropdowns themselves to
 * live on each player card — not the one-line summary the tendencies
 * section used to show — so a card and its instructions are read together
 * and there is nothing to match by name further down the page.
 *
 * `orderSelectHtml` used to live in js/app.js; it moved here so the card
 * block is unit-testable. The live-game coach panel still uses it through
 * the same import, with the same output when no key is passed.
 */
import {
  ORDER_ACTION,
  ORDER_AGGRESSION,
  ORDER_ATTACK,
  ORDER_DEF,
  ORDER_HUNT,
  ORDER_USAGE,
} from "../engine/gameplan.js";
import { esc } from "../core/html.js";

const say = (lang, zh, en) => (lang === "en" ? en : zh);
const orderText = (o, lang) => (lang === "en"
  ? { name: o.nameEn || o.name, hint: o.hintEn || o.hint }
  : { name: o.name, hint: o.hint });

export function orderSelectHtml(list, cur, cls, title, key, lang = "zh") {
  return `<select class="${cls}" title="${esc(title || "")}"${key ? ` data-ord-key="${key}"` : ""}>${list
    .map((o) => {
      const label = orderText(o, lang);
      return `<option value="${o.id}" ${o.id === cur ? "selected" : ""} title="${esc(label.hint)}">${esc(label.name)}</option>`;
    })
    .join("")}</select>`;
}

/**
 * The six tendency dropdowns for one player, as they sit at the bottom of
 * a setup lineup card (starters and bench share the renderer). Values
 * mirror the old tendencies-section rows exactly, including the `|| "auto"`
 * fallback on aggression; `p.orders` is guaranteed by ensurePlayerOrders
 * before any setup card renders. A `推荐` tag marks system-recommended
 * orders that the user has not touched yet.
 */
export function setupCardOrdersHtml(p, lang = "zh") {
  const o = p.orders || {};
  const rec = p.ordersManual ? "" : ` <em class="tiny muted">${say(lang, "推荐", "Suggested")}</em>`;
  const select = (list, cur, cls, zh, en, key) => orderSelectHtml(list, cur, cls, say(lang, zh, en), key, lang);
  return `<div class="setup-orders-block">
    <div class="order-group"><span class="order-group-label">${say(lang, "进攻", "Offense")}</span>${rec}
      <div class="order-controls">
        ${select(ORDER_USAGE, o.usage, "setup-ord-usage setup-ord-select", "组织 / 得分 / 偏防守 / 蓝领冲抢", "Playmaker / scorer / defense / hustle", "usage")}
        ${select(ORDER_AGGRESSION, o.aggression || "auto", "setup-ord-agg setup-ord-select", "攻击欲望 / 专注防守", "Shot appetite / lock down", "aggression")}
        ${select(ORDER_ACTION, o.action, "setup-ord-action setup-ord-select", "挡拆 / 无球 / 冲抢二次", "Screen / off ball / crash", "action")}
        ${select(ORDER_ATTACK, o.attack, "setup-ord-attack setup-ord-select", "终结区域 / 二次进攻", "Finish spot / putbacks", "attack")}
        ${select(ORDER_HUNT, o.hunt, "setup-ord-hunt setup-ord-select", "个人抓机会", "Hunting his own shot", "hunt")}
      </div></div>
    <div class="order-group"><span class="order-group-label">${say(lang, "防守", "Defense")}</span>
      <div class="order-controls">
        ${select(ORDER_DEF, o.defFocus, "setup-ord-def setup-ord-select", "领防 / 全力防守等", "On the ball / all out", "defFocus")}
      </div></div>
  </div>`;
}
