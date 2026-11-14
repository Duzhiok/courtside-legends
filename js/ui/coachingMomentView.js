/**
 * Coaching Moment view — the DOM shell for the tactical comeback challenge
 * (workstream B). Thin: it renders what the controller (coachingChallenge.js)
 * reports and forwards clicks to it. All game logic lives in the controller;
 * all engine effects live in GameSim.
 *
 * Mounted by app.js next to the Duel / Reborn screens; dev entry
 * `?coach-tactics=1` opens it after boot.
 */
import { L, getLang } from "../i18n.js";
import { FOCUS_PLAYS, TEMPO_OPTIONS, planLabel } from "../engine/gameplan.js";
import { createCoachingChallenge } from "../career/coach/coachingChallenge.js";
import { tacticName } from "../career/coach/tacticalLearning.js";
import { filmRecommendForMoment, readFiledFilmRecommendation } from "../career/network/videoAnalyst.js";
import { esc } from "../core/html.js";

const CHUNK = 8;

export function ensureCoachingScreen() {
  let el = document.querySelector("#screen-coach-tactics");
  if (el) return el;
  el = document.createElement("main");
  el.id = "screen-coach-tactics";
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-coach-tactics-back" type="button"><span>${L("返回", "Back")}</span></button><h2>${L("教练战术逆转挑战", "Coach Comeback Challenge")}</h2></div><div id="coach-tactics-body"></div>`;
  document.body.appendChild(el);
  return el;
}

const pick = (pair) => (getLang() === "en" ? pair?.en || pair?.zh || "" : pair?.zh || "");
const fmtClock = (s) => {
  const total = Math.max(0, Math.ceil(s || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
export function createCoachingMomentView({ getPool, show, goBack } = {}) {
  let el = null;
  let body = null;
  let challenge = null;
  let report = null;

  function render() {
    if (!body) return;
    if (report) return renderReport();
    if (!challenge) {
      body.innerHTML = `<p>${esc(L("正在加载 2016 勇士 / 骑士名单…", "Loading the 2016 Warriors / Cavaliers rosters…"))}</p>`;
      return;
    }
    const snap = challenge.snapshot();
    const panel = challenge.panel();
    const m = challenge.moment;
    const score = snap.score;
    const meter = (label, v) =>
      `<div class="ct-meter"><span>${esc(label)}</span><div class="ct-bar"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div><b>${Math.round(v)}</b></div>`;
    let html = `<div class="ct-score"><div class="ct-team"><b>GSW</b><span>${score.home}</span></div><div class="ct-clock">Q4 · ${fmtClock(snap.clock)}<small>${L("落后", "Down")} ${Math.max(0, score.away - score.home)} ${L("分", "pts")}</small></div><div class="ct-team"><b>CLE</b><span>${score.away}</span></div></div>`;
    html += `<div class="ct-meters">${meter(L("战术适配", "Fit"), panel.fit)}${meter(L("士气", "Morale"), panel.morale)}${meter(L("球员认同", "Buy-in"), snap.buyIn)}<span class="ct-pill">${L("暂停", "Timeouts")} ${panel.timeouts}</span><span class="ct-pill">${esc(tacticName(panel.tactic || "balanced", getLang()))}</span></div>`;

    if (m) {
      html += `<section class="ct-moment"><h3>${esc(pick(m.title))}</h3><p class="ct-analysis">${esc(pick(m.analysis))}</p>`;
      if (m.recommendation) {
        html += `<p class="ct-rec">📹 ${esc(L("分析师建议", "Analyst suggestion"))}：${esc(m.recommendation.reason || "")} — ${esc(L("建议选择", "suggests"))} <b>${esc(pick(m.choices.find((c) => c.id === m.recommendation.choiceId)?.label || { zh: m.recommendation.choiceId }))}</b></p>`;
      }
      html += `<div class="ct-choices">`;
      for (const choice of m.choices) {
        const rec = m.recommendation?.choiceId === choice.id;
        html += `<button type="button" class="ct-choice${rec ? " ct-recommended" : ""}" data-choice="${esc(choice.id)}" ${choice.disabled ? "disabled" : ""}>
          <b>${esc(pick(choice.label))}${rec ? ` ${esc(L("（分析师推荐）", "(analyst pick)"))}` : ""}</b>
          <span class="ct-preview">${esc(pick(choice.preview))}</span>
          <span class="ct-downside">⚠ ${esc(pick(choice.downside))}</span>
          ${choice.risk ? `<span class="ct-risk">${esc(L("执行风险", "Execution risk"))}: ${esc(choice.risk.level)} — ${esc(choice.risk.reasons.join("；"))}</span>` : ""}
          ${choice.disabled && choice.disabledReason ? `<span class="ct-disabled">${esc(pick(choice.disabledReason))}</span>` : ""}
        </button>`;
      }
      html += `</div></section>`;
    } else {
      html += `<div class="ct-actions">
        <button type="button" class="btn primary" data-act="continue">${esc(L("继续比赛", "Continue the game"))}</button>
        <button type="button" class="btn" data-act="timeout" ${panel.timeouts <= 0 ? "disabled" : ""}>${esc(L("叫暂停", "Call timeout"))} (${panel.timeouts})</button>
        <button type="button" class="btn" data-act="shout">${esc(L("大喊", "Shout"))}</button>
        <button type="button" class="btn" data-act="talk">${esc(L("场边沟通", "Sideline talk"))}</button>
      </div>
      <div class="ct-panel">
        <label>${esc(L("回合重点", "Possession focus"))}<select data-act="focus"><option value="">${esc(L("无", "None"))}</option>${FOCUS_PLAYS.map((f) => `<option value="${f.id}" ${panel.focus === f.id ? "selected" : ""}>${esc(planLabel(f, getLang()).name)}</option>`).join("")}</select></label>
        <label>${esc(L("比赛节奏", "Tempo"))}<select data-act="tempo">${TEMPO_OPTIONS.map((t) => `<option value="${t.id}" ${panel.tempo === t.id ? "selected" : ""}>${esc(planLabel(t, getLang()).name)}</option>`).join("")}</select></label>
        <label>${esc(L("换下", "Sub out"))}<select data-act="sub-out">${panel.onCourt.map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.pos)})</option>`).join("")}</select></label>
        <label>${esc(L("换上", "Sub in"))}<select data-act="sub-in">${panel.bench.map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.pos)})</option>`).join("")}</select></label>
        <button type="button" class="btn small" data-act="sub">${esc(L("换人", "Substitute"))}</button>
      </div>`;
    }
    if (snap.events?.length) {
      html += `<div class="ct-feed">${snap.events.map((e) => `<div>${esc(e.text || "")}</div>`).join("")}</div>`;
    }
    body.innerHTML = html;
    body.querySelectorAll("[data-choice]").forEach((btn) =>
      btn.addEventListener("click", () => onChoose(btn.dataset.choice)),
    );
    body.querySelectorAll("[data-act]").forEach((control) => {
      if (control.tagName === "SELECT") {
        control.addEventListener("change", () => onPanel(control.dataset.act, control.value));
      } else if (control.tagName === "BUTTON") {
        control.addEventListener("click", () => onPanel(control.dataset.act));
      }
    });
  }

  function renderReport() {
    const r = report;
    const rows = r.decisions.map(
      (d) => `<tr><td>${esc(d.momentId)} · ${esc(d.choiceId)}</td><td>${fmtClock(d.clock)}</td><td>${d.score.home}–${d.score.away} → ${d.scoreAfter.home}–${d.scoreAfter.away}</td><td>${d.swing > 0 ? "+" : ""}${d.swing}</td><td>${Math.round(d.fitBefore)} → ${Math.round(d.fitAfter)}</td><td>${Math.round(d.moraleBefore)} → ${Math.round(d.moraleAfter)}</td></tr>`,
    ).join("");
    body.innerHTML = `<section class="ct-report">
      <h3>${r.won ? esc(L("逆转成功！", "Comeback complete!")) : esc(L("没能逆转。", "The comeback fell short."))} ${r.final.home}–${r.final.away}</h3>
      <p>${esc(L("开局落后 10 分，终场分差", "Opened down 10; final margin"))} ${r.deficitEnd > 0 ? esc(L("仍落后", "still down")) + " " + r.deficitEnd : esc(L("反超", "ahead by")) + " " + Math.abs(r.deficitEnd)} ${esc(L("分。每个决策的效果都来自引擎的真实比分变化：", "points. Every decision's effect is the engine's real score swing:"))}</p>
      <table class="ct-table"><thead><tr><th>${esc(L("决策", "Decision"))}</th><th>${esc(L("时间", "Clock"))}</th><th>${esc(L("比分变化", "Score"))}</th><th>${esc(L("净胜分", "Swing"))}</th><th>${esc(L("适配", "Fit"))}</th><th>${esc(L("士气", "Morale"))}</th></tr></thead><tbody>${rows}</tbody></table>
      <p>${esc(L("承诺", "Promises"))}: ${esc(L("兑现", "kept"))} ${r.promises.kept} · ${esc(L("违约", "broken"))} ${r.promises.broken} · ${esc(L("声望变化", "Reputation"))} ${r.careerEffect.reputationDelta > 0 ? "+" : ""}${r.careerEffect.reputationDelta}（${esc(r.careerEffect.summary)}）</p>
      <p>${esc(L("战术熟悉度", "Familiarity"))}: ${Object.entries(r.tactical.familiarity).map(([k, v]) => `${esc(tacticName(k, getLang()))} ${v}`).join(" · ") || "—"} · ${esc(L("球员认同", "Buy-in"))} ${Math.round(r.tactical.buyIn)} · ${esc(L("对手熟悉度", "Opponent readiness"))}: ${Object.entries(r.tactical.opponentReadiness).map(([k, v]) => `${esc(tacticName(k, getLang()))} ${v}`).join(" · ") || "—"}</p>
      <div class="ct-actions"><button type="button" class="btn primary" data-act="retry">${esc(L("再来一次", "Run it back"))}</button><button type="button" class="btn" data-act="exit">${esc(L("返回", "Back"))}</button></div>
    </section>`;
    body.querySelector('[data-act="retry"]').addEventListener("click", () => open());
    body.querySelector('[data-act="exit"]').addEventListener("click", () => { if (typeof goBack === "function") goBack(); else if (typeof show === "function") show("home"); });
  }

  function advance() {
    if (!challenge) return;
    let guard = 0;
    while (guard < 30) {
      guard += 1;
      const res = challenge.playChunk(CHUNK);
      if (!res.ok) break;
      if (res.status === "ended") {
        report = res.report;
        break;
      }
      if (res.status === "moment") break;
      if (challenge.state === "clutch_pending") continue;
      break;
    }
    render();
  }

  function onChoose(choiceId) {
    if (!challenge) return;
    const res = challenge.choose(choiceId);
    if (!res.ok) return;
    if (res.clutchPending) {
      advance();
      return;
    }
    render();
  }

  function onPanel(act, value) {
    if (!challenge) return;
    if (act === "continue") return advance();
    if (act === "timeout") challenge.callTimeout();
    else if (act === "shout") challenge.shout();
    else if (act === "talk") challenge.talk();
    else if (act === "focus") challenge.setFocus(value || "");
    else if (act === "tempo") challenge.setTempo(value);
    else if (act === "sub") {
      const out = body.querySelector('[data-act="sub-out"]')?.value;
      const inn = body.querySelector('[data-act="sub-in"]')?.value;
      if (out && inn) challenge.substitute(out, inn);
    }
    render();
  }

  function open() {
    el = ensureCoachingScreen();
    body = el.querySelector("#coach-tactics-body");
    report = null;
    const pool = typeof getPool === "function" ? getPool() : [];
    if (!Array.isArray(pool) || pool.length < 10) {
      body.innerHTML = `<p>${esc(L("名单还没加载好，请稍后再试。", "The roster has not loaded yet — please try again in a moment."))}</p>`;
      if (typeof show === "function") show("coachTactics");
      return { ok: false, reason: "no_pool" };
    }
    // [Career 2.0 integration] A film report filed this session (the film
    // view's "filed to the head coach") feeds the challenge's recommend
    // hook; without one the challenge simply shows no suggestion.
    const filed = readFiledFilmRecommendation();
    challenge = createCoachingChallenge({
      pool,
      recommend: filed ? (moment) => filmRecommendForMoment(filed, moment, { lang: getLang() }) : null,
    });
    const started = challenge.start();
    if (!started.ok) {
      body.innerHTML = `<p>${esc(L("挑战启动失败：", "The challenge failed to start:"))} ${esc(started.reason || "")}</p>`;
      if (typeof show === "function") show("coachTactics");
      return { ok: false, reason: started.reason };
    }
    if (typeof show === "function") show("coachTactics");
    render();
    return { ok: true };
  }

  return { open, ensureScreen: ensureCoachingScreen };
}
