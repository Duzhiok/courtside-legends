/**
 * Training Center screen (My Team). Pure HTML builders + a thin mount that owns
 * the form state and a 1-second tick for the countdowns. All rules live in
 * js/data/trainingCamp.js / trainingRules.js; this file only presents them.
 */
import { photoImg } from "../data/photo.js";
import { overall } from "../data/players.js";
import { esc } from "./myTeamViewKit.js";
import {
  cancelTraining, claimTraining, sessionProgress, sessionStatus, slotCount, startBlocker,
  startTraining, trainingInfo, trainingState,
} from "../data/trainingCamp.js";
import { ATTR_LABELS, CAMPS, DURATIONS, refundShare } from "../data/trainingRules.js";

const pick = (lang, zh, en) => (lang === "en" ? en : zh);
const attrName = (key, lang) => (ATTR_LABELS[key] || [key, key])[lang === "en" ? 1 : 0];

export function fmtDuration(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

const cardOf = (pool, id) => pool.find((p) => p.id === id);

function sessionHtml(session, { now, pool, lang }) {
  const card = cardOf(pool, session.playerId);
  const camp = CAMPS[session.campId];
  const dur = DURATIONS[session.durationId];
  const ready = sessionStatus(session, now) === "ready";
  const progress = sessionProgress(session, now);
  const refund = Math.floor(session.cost * refundShare(progress));
  const head = `<div class="tc-slot-head">
      <div class="tc-portrait">${card ? photoImg(card, "headshot") : ""}</div>
      <div class="tc-slot-who"><strong>${esc(card?.name || session.playerId)}</strong>
        <small>${esc(card?.season || "")} · ${esc(pick(lang, camp.label, camp.labelEn))} · ${esc(attrName(session.attr, lang))}</small>
        <small>${esc(pick(lang, dur.label, dur.labelEn))} · +${session.xp} XP</small></div></div>`;
  if (ready) {
    return `<div class="tc-slot ready" data-session="${esc(session.id)}">${head}
      <div class="tc-bar"><i style="width:100%"></i></div>
      <p class="tc-ready">${pick(lang, "训练完成 · 奖励一直为你保留", "Training complete · your reward waits for you")}</p>
      <button type="button" class="btn primary" data-tc-claim="${esc(session.id)}">${pick(lang, "领取奖励", "Claim reward")}</button></div>`;
  }
  return `<div class="tc-slot active" data-session="${esc(session.id)}">${head}
    <div class="tc-bar"><i style="width:${Math.round(progress * 100)}%"></i></div>
    <p class="tc-eta">${Math.floor(progress * 100)}% · ${pick(lang, "剩余", "left")} ${fmtDuration(session.completesAt - now)}</p>
    <button type="button" class="btn ghost" data-tc-cancel="${esc(session.id)}">${pick(lang, `取消训练（退 ¤${refund}）`, `Cancel (refund ¤${refund})`)}</button></div>`;
}

export function slotsHtml(account, { now, pool, lang }) {
  const sessions = trainingState(account).sessions;
  const total = slotCount();
  const cells = sessions.map((s) => sessionHtml(s, { now, pool, lang }));
  for (let i = sessions.length; i < total; i += 1) {
    cells.push(`<div class="tc-slot empty"><strong>${pick(lang, "空闲训练位", "Free slot")}</strong>
      <small>${pick(lang, "在下方选择球员和训练项目", "Pick a player and a camp below")}</small></div>`);
  }
  return cells.join("");
}

export function logHtml(account, { pool, lang }) {
  const log = trainingState(account).log;
  if (!log.length) return `<p class="tiny">${pick(lang, "还没有领取过训练奖励。", "No rewards claimed yet.")}</p>`;
  return `<ul class="tc-log">${log.map((r) => {
    const card = cardOf(pool, r.playerId);
    const skill = r.skillName ? ` · <b class="tc-skill">✦ ${esc(r.skillName)}</b>` : "";
    const gain = r.gained ? `${attrName(r.attr, lang)} +${r.gained}` : pick(lang, "经验已积累", "XP banked");
    return `<li>${esc(card?.name || r.playerId)} — ${esc(gain)} (+${r.xp} XP)${skill}</li>`;
  }).join("")}</ul>`;
}

/** The start form. `sel` = { playerId, campId, attr, durationId }. */
export function formHtml(account, sel, { pool, lang }) {
  const owned = (account.playerIds || []).map((id) => cardOf(pool, id)).filter(Boolean).sort((a, b) => overall(b) - overall(a));
  const busy = new Set(trainingState(account).sessions.map((s) => s.playerId));
  const options = owned.map((p) => {
    const info = trainingInfo(account, p.id, pool);
    const label = `${p.name} ${p.season} · ${overall(p)} · ${pick(lang, info.budget.label, info.budget.labelEn)}${busy.has(p.id) ? pick(lang, "（训练中）", " (training)") : ""}`;
    return `<option value="${esc(p.id)}"${p.id === sel.playerId ? " selected" : ""}${busy.has(p.id) ? " disabled" : ""}>${esc(label)}</option>`;
  }).join("");
  const camp = CAMPS[sel.campId];
  const info = sel.playerId ? trainingInfo(account, sel.playerId, pool) : null;
  const campBtns = Object.entries(CAMPS).map(([id, c]) => `<button type="button" class="tc-chip${id === sel.campId ? " on" : ""}" data-tc-camp="${id}">${esc(pick(lang, c.label, c.labelEn))}</button>`).join("");
  const attrBtns = camp.attrs.map((key) => {
    const a = info?.attrs[key];
    const note = a ? ` ${a.value}${a.bonus ? ` (+${a.bonus})` : ""}${a.capped ? " ✓" : ""}` : "";
    return `<button type="button" class="tc-chip${key === sel.attr ? " on" : ""}" data-tc-attr="${key}">${esc(attrName(key, lang))}${note}</button>`;
  }).join("");
  const durBtns = Object.entries(DURATIONS).map(([id, d]) => `<button type="button" class="tc-dur${id === sel.durationId ? " on" : ""}" data-tc-dur="${id}">
      <strong>${esc(pick(lang, d.label, d.labelEn))}</strong><small>${fmtDuration(d.ms)} · ¤${d.cost}</small><small>+${d.xp} XP${d.skillChance ? ` · ✦${Math.round(d.skillChance * 1000) / 10}%` : ""}</small></button>`).join("");
  const budget = info ? `<p class="tiny">${pick(lang, "成长预算", "Growth budget")}: ${info.used}/${info.budget.total} · ${pick(lang, "单项上限", "per attribute")} +${info.budget.perAttr} · ${pick(lang, "可领悟技能", "skills")} ≤ ${info.budget.skills}</p>` : "";
  const blocker = sel.playerId ? startBlocker(account, sel, { pool }) : null;
  const why = blocker ? pick(lang, blocker.message, blocker.en) : "";
  return `<label class="tc-field"><span>${pick(lang, "球员", "Player")}</span>
      <select data-tc-player><option value="">${pick(lang, "选择一名球员…", "Choose a player…")}</option>${options}</select></label>
    ${budget}
    <div class="tc-row">${campBtns}</div>
    <div class="tc-row">${attrBtns}</div>
    <div class="tc-durs">${durBtns}</div>
    <p class="tc-why" role="status">${esc(why)}</p>
    <button type="button" class="btn primary" data-tc-start${!sel.playerId || blocker ? " disabled" : ""}>${pick(lang, "开始训练", "Start training")}</button>`;
}

export function createTrainingScreen({ root, getAccount, pool, getLang = () => "zh", now = () => Date.now(), save }) {
  let sel = { playerId: "", campId: "shooting", attr: "three", durationId: "fullDay" };
  let timer = null;
  const $ = (s) => root.querySelector(s);
  const ctx = () => ({ now: now(), pool: pool(), lang: getLang() });
  const opts = () => ({ now: now(), pool: pool(), ...(save ? { save } : {}) });

  function paintSlots() {
    const acc = getAccount();
    if (!acc || !$("[data-tc-slots]")) return;
    $("[data-tc-slots]").innerHTML = slotsHtml(acc, ctx());
    readyCount = trainingState(acc).sessions.filter((x) => sessionStatus(x, now()) === "ready").length;
    $("[data-tc-gold]").textContent = `¤${acc.gold || 0}`;
  }
  /** 1 Hz: update countdown text/bars in place (a full repaint would eat clicks); repaint only when a session finishes. */
  let readyCount = 0;
  function tick() {
    const acc = getAccount();
    if (!acc || !$("[data-tc-slots]")) return;
    const { now: at, lang } = ctx();
    const sessions = trainingState(acc).sessions;
    const ready = sessions.filter((x) => sessionStatus(x, at) === "ready").length;
    if (ready !== readyCount) {
      readyCount = ready;
      paintSlots();
      return;
    }
    for (const x of sessions) {
      if (sessionStatus(x, at) === "ready") continue;
      const el = root.querySelector(`[data-session="${CSS.escape(x.id)}"]`);
      if (!el) continue;
      const progress = sessionProgress(x, at);
      el.querySelector(".tc-bar i").style.width = `${Math.round(progress * 100)}%`;
      el.querySelector(".tc-eta").textContent = `${Math.floor(progress * 100)}% · ${pick(lang, "剩余", "left")} ${fmtDuration(x.completesAt - at)}`;
    }
  }
  function paintForm() {
    const acc = getAccount();
    if (acc) $("[data-tc-form]").innerHTML = formHtml(acc, sel, ctx());
  }
  function paintAll() {
    const acc = getAccount();
    $("[data-tc-log]").innerHTML = acc ? logHtml(acc, ctx()) : "";
    paintSlots();
    paintForm();
  }
  function toast(zh, en) {
    const el = $("[data-tc-toast]");
    if (el) el.textContent = pick(getLang(), zh, en);
  }
  function attempt(fn) {
    try {
      return fn();
    } catch (error) {
      toast(error.message, error.en || error.message);
      return null;
    }
  }

  function onClick(event) {
    const t = event.target.closest("button");
    if (!t || !root.contains(t)) return;
    const acc = getAccount();
    if (!acc) return;
    if (t.dataset.tcCamp) {
      sel = { ...sel, campId: t.dataset.tcCamp, attr: CAMPS[t.dataset.tcCamp].attrs[0] };
      paintForm();
    } else if (t.dataset.tcAttr) {
      sel = { ...sel, attr: t.dataset.tcAttr };
      paintForm();
    } else if (t.dataset.tcDur) {
      sel = { ...sel, durationId: t.dataset.tcDur };
      paintForm();
    } else if (t.hasAttribute("data-tc-start")) {
      if (attempt(() => startTraining(acc, sel, opts()))) {
        toast("训练开始！关掉游戏也会继续。", "Training started — it keeps going while you're away.");
        sel = { ...sel, playerId: "" };
        paintAll();
      }
    } else if (t.dataset.tcClaim) {
      const r = attempt(() => claimTraining(acc, t.dataset.tcClaim, opts()));
      if (r) {
        toast(r.skillName ? `训练突破！领悟「${r.skillName}」` : r.gained ? `${attrName(r.attr, "zh")} +${r.gained}` : "经验已积累，继续训练就会突破", r.skillName ? `Breakthrough! Learned "${r.skillName}"` : r.gained ? `${attrName(r.attr, "en")} +${r.gained}` : "XP banked — keep training to break through");
        paintAll();
      }
    } else if (t.dataset.tcCancel) {
      const r = attempt(() => cancelTraining(acc, t.dataset.tcCancel, opts()));
      if (r) {
        toast(`已取消，退还 ¤${r.refund}`, `Cancelled, refunded ¤${r.refund}`);
        paintAll();
      }
    }
  }
  function onChange(event) {
    if (event.target.matches("[data-tc-player]")) {
      sel = { ...sel, playerId: event.target.value };
      paintForm();
    }
  }
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);

  return {
    open() {
      sel = { ...sel, playerId: "" };
      toast("", "");
      paintAll();
      clearInterval(timer);
      timer = setInterval(tick, 1000);
    },
    dispose() {
      clearInterval(timer);
      timer = null;
    },
  };
}
