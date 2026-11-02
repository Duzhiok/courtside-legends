// 排兵布阵 (default rotation) board: pure HTML builders. app.js keeps the state and the event wiring;
// everything a player SEES lives here, so it can be unit-tested without a browser.
import { MAX_EPIPHANY } from "../engine/epiphany.js";
import { SKILL_PACKS } from "../data/skills.js";
import { skillNameL } from "../i18n.js";
import { esc, tr } from "./timeTravel/format.js";

export const TOTAL_MINUTES = 240; // 5 on the floor x 48
export const STARTER_SLOTS = 5;
const TIRED_CAP = 36; // below this a player really can't carry a starter's load: worth a warning

/** The eight attributes shown on every row: [short zh, short en, key]. */
export const ATTRS = [
  ["攻", "Off", "scoring"], ["三分", "3PT", "three"], ["防", "Def", "defense"], ["板", "Reb", "rebound"],
  ["传", "Pass", "pass"], ["断", "Stl", "steal"], ["帽", "Blk", "block"], ["速", "Spd", "speed"], ["力", "Str", "strength"],
];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** The two best attribute keys of a player: the ones a coach should notice first. */
export function topAttributes(player, count = 2) {
  return ATTRS.map(([, , key]) => [key, num(player?.[key])])
    .filter(([, v]) => v !== null)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key]) => key);
}

export function attributeChipsHtml(player, lang) {
  const best = new Set(topAttributes(player));
  return ATTRS.map(([zh, en, key]) => {
    const value = num(player?.[key]);
    return `<span class="rot-attr${best.has(key) ? " hi" : ""}"><b>${tr(lang, zh, en)}</b>${value === null ? "—" : value}</span>`;
  }).join("");
}

// ---------------------------------------------------------------- epiphany ("已领悟")
/** Skill ids this player has learned from play (the C3 ledger), junk filtered out. */
export function learnedSkillIds(ledger, bref) {
  const list = ledger?.[bref]?.learned;
  return Array.isArray(list) ? list.filter((id) => typeof id === "string" && id) : [];
}

const skillName = (id, lang) => (SKILL_PACKS[id]?.name ? skillNameL(SKILL_PACKS[id].name, lang) : id);

/** "✦ 已领悟 1/2" (hover or the second line names the skills). Nothing at all when he hasn't learned any. */
export function learnedBadgeHtml(ids, lang) {
  if (!ids.length) return "";
  const names = ids.map((id) => skillName(id, lang)).join(" · ");
  return `<span class="rot-learned" title="${esc(names)}"><i aria-hidden="true">✦</i>${tr(lang, "已领悟", "Learned")} ${ids.length}/${MAX_EPIPHANY}</span>`;
}

export const learnedLineHtml = (ids, lang) => (ids.length
  ? `<div class="rot-learned-line">${tr(lang, "场上领悟：", "Learned in play: ")}${esc(ids.map((id) => skillName(id, lang)).join(" · "))}</div>`
  : "");

// ---------------------------------------------------------------- minutes
/** How the 240 minutes stand: ok / short (some are unassigned) / over (more than a game has). */
export function minuteBudget(players) {
  const total = players.reduce((sum, p) => sum + (Number(p.targetMinutes) || 0), 0);
  const diff = total - TOTAL_MINUTES;
  return { total, diff, state: diff === 0 ? "ok" : diff < 0 ? "short" : "over" };
}

export function budgetLabel(budget, lang) {
  const n = Math.abs(budget.diff);
  if (budget.state === "ok") return tr(lang, `刚好 ${TOTAL_MINUTES} 分钟`, `Exactly ${TOTAL_MINUTES} minutes`);
  return budget.state === "short"
    ? tr(lang, `还有 ${n} 分钟没分配`, `${n} minutes still unassigned`)
    : tr(lang, `多排了 ${n} 分钟`, `${n} minutes over-assigned`);
}

/** One stacked bar for the whole game: a segment per player (teal starters, slate bench), biggest first. */
export function budgetBarHtml(players, starterIds, lang) {
  const budget = minuteBudget(players);
  const scale = Math.max(TOTAL_MINUTES, budget.total);
  const starters = new Set(starterIds);
  const segs = [...players]
    .filter((p) => (Number(p.targetMinutes) || 0) > 0)
    .sort((a, b) => (b.targetMinutes || 0) - (a.targetMinutes || 0))
    .map((p) => `<i class="${starters.has(p.id) ? "st" : "bn"}" style="width:${(((Number(p.targetMinutes) || 0) / scale) * 100).toFixed(2)}%" title="${esc(p.name)} ${p.targetMinutes}′"></i>`)
    .join("");
  return `<div class="rot-budget rot-budget-${budget.state}" role="group" aria-label="${esc(budgetLabel(budget, lang))}">
    <div class="rot-budget-top"><strong>${budget.total}<small> / ${TOTAL_MINUTES}</small></strong><span>${esc(budgetLabel(budget, lang))}</span></div>
    <div class="rot-budget-bar" aria-hidden="true">${segs}</div>
    <div class="rot-budget-key" aria-hidden="true"><span class="st">${tr(lang, "首发", "Starters")}</span><span class="bn">${tr(lang, "替补", "Bench")}</span></div>
  </div>`;
}

/** Team lineup fit only means something with a full five: before that show a dash, not a number about nobody. */
export const fitLabel = (starterCount, fit) => (starterCount >= STARTER_SLOTS && fit != null ? fit : "—");

// ---------------------------------------------------------------- rows
/**
 * One player row. `ctx` carries what only app.js knows (rendered option lists, photo, skill chips, the stamina
 * cap) so this stays a pure function of its inputs.
 */
export function rotationRowHtml(p, ctx) {
  const { lang, starter, over, cap, cardPos, ovr, photo, skillChips, posOpts, roleOpts, learned, hint } = ctx;
  const minutes = Number(p.targetMinutes ?? 24);
  const tired = over || cap < TIRED_CAP;
  return `<div class="rot-row${starter ? " starter" : ""}${over ? " over-min" : ""}" data-id="${esc(p.id)}">
    <label class="rot-starter" title="${tr(lang, "默认首发", "Default starter")}"><input type="checkbox" class="rot-start-cb" ${starter ? "checked" : ""} /><span>${tr(lang, "首发", "Start")}</span></label>
    <div class="rot-name">
      ${photo}
      <div class="rot-name-text">
        <div class="rot-name-line"><span class="rot-pos-chip pos-${cardPos.toLowerCase()}">${cardPos}</span><strong>${esc(p.name)}</strong><span class="rot-ovr" title="OVR">${ovr}</span><span class="rot-year">${esc(p.season)}</span>${learnedBadgeHtml(learned, lang)}</div>
        ${tired ? `<div class="rot-sub"><span class="rot-tired stamina-min-hint">${esc(hint)}</span></div>` : ""}
        <div class="rot-attrs">${attributeChipsHtml(p, lang)}</div>
        ${learnedLineHtml(learned, lang)}
        ${skillChips ? `<div class="skill-row">${skillChips}</div>` : ""}
      </div>
    </div>
    <label class="rot-min-wrap" title="${tr(lang, "目标分钟", "Target minutes")}">
      <span class="rot-min-box"><input class="rot-min" type="number" min="8" max="48" value="${minutes}" /><span>${tr(lang, "分钟", "min")}</span></span>
      <i class="rot-bar${over ? " over" : ""}" style="--m:${Math.min(100, (minutes / 48) * 100).toFixed(1)}%;--cap:${Math.min(100, (cap / 48) * 100).toFixed(1)}%"></i>
    </label>
    <select class="rot-pos" title="${tr(lang, "上场位置", "Court position")}">${posOpts}</select>
    <select class="rot-role" title="${tr(lang, "角色", "Role")}">${roleOpts}</select>
  </div>`;
}

/** "首发五人 3/5" with its rows, or the empty-state card telling the player what to do about it. */
export function startersSectionHtml(rowsHtml, count, lang) {
  const body = count
    ? `<div class="rot-list">${rowsHtml}</div>`
    : `<p class="rot-empty">${tr(lang, "还没有首发：勾选下面球员的「首发」，或点上面的「OVR 前五当首发」。", "No starters yet: tick “Start” on a player below, or press “Top 5 by OVR”.")}</p>`;
  return `<section class="rot-section rot-section-starters"><h5>${tr(lang, "首发五人", "Starting five")} <em class="${count === STARTER_SLOTS ? "full" : ""}">${count}/${STARTER_SLOTS}</em></h5>${body}</section>`;
}

/** `noStarters`: with nobody picked yet "bench" would be a lie, so the whole roster is just "all players". */
export const benchSectionHtml = (rowsHtml, count, lang, { noStarters = false } = {}) => (count
  ? `<section class="rot-section rot-section-bench"><h5>${noStarters ? tr(lang, "全部球员", "All players") : tr(lang, "替补轮换", "Bench rotation")} <em>${count}</em></h5><div class="rot-list">${rowsHtml}</div></section>`
  : "");
