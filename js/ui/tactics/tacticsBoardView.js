// UI 3.0 slice 1 — Gold pre-game tactics board: HTML + a tiny controller. Isolated module: the setup screen mounts it
// with one call (wiring is a separate step, see docs/AGENT_CHAT.md). Every edit goes through tacticalDraft's reducer;
// only Apply writes to the team (commitDraft: validate, write, save, roll back on failure).
import { esc } from "../../core/html.js";
import { TL } from "../../i18n.js";
import { createEditorState, tacticalDraftReducer, isDirty, commitDraft } from "./tacticalDraft.js";
import { buildTacticsBoardModel } from "./tacticsBoardModel.js";

const TAG_TEXT = { sim: ["模拟生效", "Sim effect"], advice: ["仅分析", "Analysis only"] };
const tagHtml = (tag, lang) => `<span class="tb-tag tb-tag-${tag}">${esc(TL(lang, ...TAG_TEXT[tag]))}</span>`;
const SOURCE_TEXT = { coach: ["教练招牌", "Coach system"], roster: ["阵容解锁", "Roster unlock"], open: ["通用", "Open"] };

function systemsHtml(m, lang) {
  return m.systems.map((s) => `<button type="button" class="tb-system${s.active ? " is-active" : ""}" data-tb="scheme" data-id="${esc(s.id)}" aria-pressed="${s.active}">
    <span class="tb-system-name">${esc(s.name)}</span>
    <span class="tb-system-meta">${esc(TL(lang, ...SOURCE_TEXT[s.source]))} · ${esc(TL(lang, "契合", "Fit"))} ${s.fit} · ${s.proficiencyPct}%</span>
  </button>`).join("");
}

function courtHtml(m, lang) {
  const spots = m.slots.map((s) => {
    if (!s.player) return `<div class="tb-spot is-empty" style="left:${s.left}%;top:${s.top}%"><span>${esc(s.slot)}</span></div>`;
    const p = s.player;
    const label = TL(lang, `设 ${p.name} 为持球核心`, `Make ${p.name} the ball handler`);
    return `<button type="button" class="tb-spot${p.isHandler ? " is-handler" : ""}" style="left:${s.left}%;top:${s.top}%" data-tb="handler" data-id="${esc(p.id)}" aria-pressed="${p.isHandler}" aria-label="${esc(label)}">
      <span class="tb-spot-pos">${esc(s.slot)}</span><span class="tb-spot-name">${esc(p.short)}</span><span class="tb-spot-ovr">${p.ovr}</span>${p.isHandler ? `<span class="tb-ball" aria-hidden="true">●</span>` : ""}
    </button>`;
  }).join("");
  return `<div class="tb-court" role="group" aria-label="${esc(TL(lang, "首发站位", "Starting five"))}">${spots}</div>`;
}

function actionsHtml(m, lang) {
  if (!m.ballActions.length) return `<p class="tb-hint">${esc(TL(lang, "点球场上的球员设为持球核心。", "Tap a player on the court to make him the ball handler."))}</p>`;
  return `<div class="tb-actions" role="group" aria-label="${esc(TL(lang, "持球打法", "Ball-handler play"))}">${m.ballActions.map((a) => `<button type="button" class="tb-action${a.selected ? " is-active" : ""}" data-tb="action" data-id="${esc(a.id)}" aria-pressed="${a.selected}">${esc(a.name)}${a.suggested ? ` <small>${esc(TL(lang, "推荐", "Suggested"))}</small>` : ""}</button>`).join("")}</div>`;
}

/** What each blocking error means to the player. (A missing/stale defense target is only a warning: the engine ignores it.) */
export const ERROR_TEXT = {
  STARTERS_INVALID: ["首发必须是 5 名不同的球员", "Pick 5 different starters"],
  SCHEME_UNKNOWN: ["进攻体系无效", "Unknown offensive system"],
  TEMPO_INVALID: ["节奏设置无效", "Invalid tempo"],
  HANDLER_NOT_ON_TEAM: ["持球核心不在本队", "The ball handler is not on your team"],
  BALL_ACTION_INVALID: ["持球打法无效", "Invalid ball-handler play"],
  DEFENSE_SCHEME_INVALID: ["防守方案无效", "Invalid defensive scheme"],
  DEFENDER_NOT_ON_TEAM: ["指定的防守人不在本队", "The chosen defender is not on your team"],
};
/** Poor-but-legal plans still apply. The player has to be able to see why the choice will not show up in the game. */
export const WARNING_TEXT = {
  SCHEME_NOT_AVAILABLE_FOR_COACH_OR_ROSTER: ["这套进攻当前教练或阵容打不了，比赛里不会生效", "This offense is not available for this coach or roster, so it will not run"],
  HANDLER_NOT_A_STARTER: ["持球核心不在首发里，开场不会由他持球", "The ball handler is not starting, so he will not bring the ball up"],
  DEFENSE_TARGET_MISSING: ["盯防没有目标，这套防守不会触发", "This defense has no target, so it will not trigger"],
  DEFENSE_TARGET_NOT_ON_OPPONENT: ["盯防目标不在本场对手里，这套防守不会触发", "The defensive target is not on this opponent, so that defense will not trigger"],
};
const reasonsText = (codes, text, lang) => codes.map((c) => (text[c] ? TL(lang, ...text[c]) : c)).join(TL(lang, "；", "; "));

export function renderTacticsBoardHtml(m, lang = "zh") {
  const rows = m.rows.map((r) => `<li class="tb-row"><span class="tb-row-label">${esc(r.label)}</span><strong>${esc(r.value)}</strong>${tagHtml(r.tag, lang)}</li>`).join("");
  const coach = m.coach ? `<p class="tb-coach">${esc(TL(lang, "主教练", "Head coach"))}: <strong>${esc(m.coach.name)}</strong></p>` : "";
  const status = [
    m.errors.length
      ? `<p class="tb-status is-error" role="alert">${esc(TL(lang, "当前方案无法执行：", "This plan cannot run: "))}${esc(reasonsText(m.errors, ERROR_TEXT, lang))}</p>`
      : m.dirty ? `<p class="tb-status" role="status">${esc(TL(lang, "有未应用的修改", "Unapplied changes"))}</p>` : "",
    m.warnings?.length
      ? `<p class="tb-status is-warn" role="status">${esc(TL(lang, "注意：", "Note: "))}${esc(reasonsText(m.warnings, WARNING_TEXT, lang))}</p>`
      : "",
    m.saveFailed
      ? `<p class="tb-status is-warn" role="status">${esc(TL(lang, "已应用，但这次没能保存到本机（存档被占用或空间不足），下次保存时会再试", "Applied, but this save could not be written (the save slot is in use or full); it will be retried on the next save"))}</p>`
      : "",
  ].join("");
  return `<section class="tb" aria-label="${esc(TL(lang, "赛前战术", "Game plan"))}">
    <div class="tb-main">${courtHtml(m, lang)}${actionsHtml(m, lang)}</div>
    <aside class="tb-side">${coach}<ul class="tb-rows">${rows}</ul><h3 class="tb-h">${esc(TL(lang, "进攻体系", "Offensive system"))}</h3><div class="tb-systems">${systemsHtml(m, lang)}</div></aside>
    <div class="tb-bar">${status}<button type="button" class="btn ghost" data-tb="reset"${m.dirty ? "" : " disabled"}>${esc(TL(lang, "重置", "Reset"))}</button><button type="button" class="btn primary" data-tb="apply"${m.canApply ? "" : " disabled"}>${esc(TL(lang, "应用方案", "Apply plan"))}</button></div>
  </section>`;
}

/**
 * Mount on `root`. `save` is the caller's persistence (Gold: autosaveCareer); `onApplied(team)` lets the caller refresh.
 * Returns { getState, destroy }.
 */
export function mountTacticsBoard(root, { team, opponent = null, lang = "zh", save = null, onApplied = null } = {}) {
  let state = createEditorState(team);
  let saveFailed = false;
  const paint = () => {
    const model = buildTacticsBoardModel({ team, draft: state.draft, opponent, lang, dirty: isDirty(state), saveFailed });
    root.innerHTML = renderTacticsBoardHtml(model, lang);
  };
  const dispatch = (action) => { state = tacticalDraftReducer(state, action); paint(); };
  const apply = () => {
    const res = commitDraft(team, state.draft, { save, opponent });
    if (res.ok) { saveFailed = !!res.saveFailed; state = tacticalDraftReducer(state, { type: "MARK_SAVED" }); paint(); onApplied?.(team); }
    else paint(); // show the error row for a plan the engine cannot run
    return res;
  };
  const onClick = (ev) => {
    const el = ev.target.closest("[data-tb]");
    if (!el || !root.contains(el) || el.disabled) return;
    // re-picking what is already shown (incl. the suggested play) is not an edit, so it must not dirty the draft
    if (el.dataset.tb !== "handler" && el.getAttribute("aria-pressed") === "true") return;
    const id = el.dataset.id;
    switch (el.dataset.tb) {
      case "scheme": return dispatch({ type: "SET_SCHEME", schemeId: id });
      case "handler": return dispatch({ type: "SET_BALL_HANDLER", playerId: id === state.draft.ballHandlerId ? null : id });
      case "action": return dispatch({ type: "SET_BALL_ACTION", actionId: id });
      case "reset": return dispatch({ type: "RESET" });
      case "apply": return apply();
      default: return undefined;
    }
  };
  root.addEventListener("click", onClick);
  paint();
  return {
    getState: () => state,
    /** The roster list changed who starts. */
    syncStarters: (starterIds) => dispatch({ type: "SYNC_STARTERS", starterIds }),
    /** Pressing "start the game" must not silently drop board edits: apply them first (no-op when nothing is pending). */
    applyPending: () => (isDirty(state) ? apply() : { ok: true, applied: false }),
    destroy: () => root.removeEventListener("click", onClick),
  };
}
