/**
 * Starting-five setup card (2026-11 redesign after the Stitch "首发阵容 · 位置图谱" board).
 *
 * The card leads with what a coach reads first: photo, position, OVR, four stats that matter for the spot he plays, his
 * stamina, and the skills. Everything that is a SETTING (the six tendency dropdowns, role + minutes) and the full 19-stat
 * sheet stay on the same card, as the user asked on 2026-11-22, but fold into one <details> drawer whose summary line
 * says what is set. Pure: no DOM, no `state`; app.js passes the open/closed state in and wires the events.
 */
import { ORDER_USAGE, ORDER_DEF, roleName } from "../engine/gameplan.js";
import { PLAYER_ROLES, inferPlayerRole } from "../data/playerMinutes.js";
import { esc } from "../core/html.js";

const say = (lang, zh, en) => (lang === "en" ? en : zh);

/** Four stats per playing position: [field, zh, en]. Sub-attributes (handle, perimDef, offDribble) come derived. */
export const KEY_STATS = {
  PG: [["pass", "传球", "PAS"], ["handle", "控球", "HDL"], ["three", "三分", "3PT"], ["speed", "速度", "SPD"]],
  SG: [["scoring", "得分", "ATK"], ["three", "三分", "3PT"], ["offDribble", "持球投", "OD"], ["perimDef", "外防", "PD"]],
  SF: [["scoring", "得分", "ATK"], ["three", "三分", "3PT"], ["defense", "防守", "DEF"], ["speed", "速度", "SPD"]],
  PF: [["paint", "内线", "INS"], ["rebound", "篮板", "REB"], ["defense", "防守", "DEF"], ["strength", "力量", "STR"]],
  C: [["paint", "内线", "INS"], ["rebound", "篮板", "REB"], ["block", "盖帽", "BLK"], ["strength", "力量", "STR"]],
};

export const statTone = (n) => (n >= 80 ? "hi" : n >= 65 ? "mid" : "lo");

/** The four headline stats for `pos` read from `src` (the player merged with his derived sub-attributes). */
export function setupKeyStats(src, pos) {
  const list = KEY_STATS[pos] || KEY_STATS.SF;
  return list.map(([key, zh, en]) => ({ key, zh, en, value: Number(src?.[key]) || 0 }));
}

export function setupKeyStatsHtml(src, pos, lang = "zh") {
  const cells = setupKeyStats(src, pos)
    .map((s) => `<span class="setup-key-stat ${statTone(s.value)}"><em>${say(lang, s.zh, s.en)}</em><b>${s.value || "—"}</b></span>`)
    .join("");
  const stam = Math.max(0, Math.min(100, Number(src?.stamina) || 0));
  const stamBar = stam
    ? `<div class="setup-stamina" title="${say(lang, "体能", "Stamina")} ${stam}"><span class="tiny">${say(lang, "体能", "STA")} ${stam}</span><i style="--v:${stam}%"></i></div>`
    : "";
  return `<div class="setup-key-stats">${cells}</div>${stamBar}`;
}

const orderName = (list, id, lang) => {
  const o = list.find((x) => x.id === id) || list[0];
  return o ? (lang === "en" ? o.nameEn || o.name : o.name) : "";
};

/** One line that says what the drawer holds: role · minutes · offense usage / defense focus. */
export function setupCardSummary(p, lang = "zh") {
  const role = PLAYER_ROLES[p?.roleExpectation || inferPlayerRole(p)] || PLAYER_ROLES.role;
  const min = p?.targetMinutes ?? 24;
  const o = p?.orders || {};
  const off = orderName(ORDER_USAGE, o.usage, lang);
  const def = orderName(ORDER_DEF, o.defFocus, lang);
  return `${roleName(role, lang)} · ${min}${say(lang, " 分钟", " min")} · ${say(lang, "攻", "O")} ${off} / ${say(lang, "防", "D")} ${def}`;
}

/**
 * The fold-out drawer. `body` is the already-rendered settings + full stat sheet; `open` restores the drawer after a
 * re-render (every change on the board re-renders all cards).
 */
export function setupCardMoreHtml(p, body, { open = false, lang = "zh" } = {}) {
  const label = say(lang, "指令 · 角色 · 全部属性", "Orders · role · all ratings");
  return `<details class="setup-card-more" data-more-for="${esc(p?.id ?? "")}"${open ? " open" : ""}>
    <summary><span class="setup-card-more-label">${label}</span><span class="setup-card-more-sum">${esc(setupCardSummary(p, lang))}</span></summary>
    ${body}
  </details>`;
}
