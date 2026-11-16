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

export function renderTacticsBoardHtml(m, lang = "zh") {
  const rows = m.rows.map((r) => `<li class="tb-row"><span class="tb-row-label">${esc(r.label)}</span><strong>${esc(r.value)}</strong>${tagHtml(r.tag, lang)}</li>`).join("");
  const coach = m.coach ? `<p class="tb-coach">${esc(TL(lang, "主教练", "Head coach"))}: <strong>${esc(m.coach.name)}</strong></p>` : "";
  const status = m.errors.length
    ? `<p class="tb-status is-error" role="alert">${esc(TL(lang, "当前方案无法执行，请检查首发与设置。", "This plan cannot run — check the starters and settings."))}</p>`
    : m.dirty ? `<p class="tb-status" role="status">${esc(TL(lang, "有未应用的修改", "Unapplied changes"))}</p>` : "";
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
  const paint = () => {
    const model = buildTacticsBoardModel({ team, draft: state.draft, opponent, lang, dirty: isDirty(state) });
    root.innerHTML = renderTacticsBoardHtml(model, lang);
  };
  const dispatch = (action) => { state = tacticalDraftReducer(state, action); paint(); };
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
      case "apply": {
        const res = commitDraft(team, state.draft, { save, opponent });
        if (res.ok) { state = tacticalDraftReducer(state, { type: "MARK_SAVED" }); paint(); onApplied?.(team); }
        return res;
      }
      default: return undefined;
    }
  };
  root.addEventListener("click", onClick);
  paint();
  return { getState: () => state, destroy: () => root.removeEventListener("click", onClick) };
}
