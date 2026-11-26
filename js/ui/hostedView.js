/**
 * Hosted league card on the Training Center screen (B47). Pure HTML builders + a thin mount that owns the form state.
 * The rules live in js/data/hostedLeague.js (and the game in hostedPlay.js); this file only presents them, story first
 * (welcome back, the game worth remembering, who grew) and numbers second.
 *
 * Built with html`` (js/core/html.js): card names, team names and everything else interpolated is escaped by default.
 */
import { html, raw } from "../core/html.js";
import { overall } from "../data/players.js";
import { TEAM_NAMES_ZH } from "../data/legends.js";
import { teamNameL } from "../i18n.js";
import { trainingInfo } from "../data/trainingCamp.js";
import { ATTR_LABELS, CAMPS } from "../data/trainingRules.js";
import {
  DAILY_GAMES, WEEKLY_PAID_GAMES, clearHostedPlan, dayOf, hostedState, setHostedPlan, settleHostedAsync, weekOf,
} from "../data/hostedLeague.js";
import { createHostedPlayGame, hostedReady } from "../data/hostedPlay.js";

const pick = (lang, zh, en) => (lang === "en" ? en : zh);
const attrName = (key, lang) => (ATTR_LABELS[key] || [key, key])[lang === "en" ? 1 : 0];
const ATTR_KEYS = [...new Set(Object.values(CAMPS).flatMap((camp) => camp.attrs))];
const cardOf = (pool, id) => pool.find((p) => p.id === id);
/** `day` is a local-calendar day number; as a UTC date it reads back as that same calendar date. */
const dayLabel = (day) => new Date(day * 86400000).toISOString().slice(5, 10);
const record = (rows) => ({ wins: rows.reduce((n, r) => n + r.wins, 0), games: rows.reduce((n, r) => n + r.games, 0) });

/** The internal opponent key "SEA|2008" as a name a player can read: "2008 超音速" / "2008 SuperSonics". An abbreviation with no known name stays as the abbreviation. */
export function opponentLabel(key, lang) {
  const [abbr, season] = String(key ?? "").split("|");
  const zh = TEAM_NAMES_ZH[abbr];
  const name = zh ? teamNameL(zh, lang) : abbr;
  return season ? `${season} ${name}` : name;
}

/** One sentence about the game worth remembering (row.key), or "" for rows saved before it existed. */
function keyGameLine(key, lang) {
  if (!key) return "";
  const score = `${key.me}–${key.opponentScore}`;
  return key.margin > 0
    ? pick(lang, `最精彩：第 ${key.index} 场 ${score} 大胜 ${opponentLabel(key.opponent, lang)}（+${key.margin}）`, `Best game: #${key.index}, ${score} over ${opponentLabel(key.opponent, lang)} (+${key.margin})`)
    : pick(lang, `最接近的一场：第 ${key.index} 场 ${score} 惜败 ${opponentLabel(key.opponent, lang)}`, `Closest one: #${key.index}, ${score} against ${opponentLabel(key.opponent, lang)}`);
}

/** The "welcome back" card for a settlement that just happened: story first, then the numbers. */
export function hostedReportHtml(result, plan, { pool, lang }) {
  if (!result?.days?.length) return "";
  const { wins, games } = record(result.days);
  const best = result.days.map((d) => d.key).filter(Boolean).sort((a, b) => b.margin - a.margin)[0];
  const card = plan?.playerId ? cardOf(pool, plan.playerId) : null;
  const grew = card && plan.attr
    ? (result.gained
      ? pick(lang, `${card.name} 的${attrName(plan.attr, lang)} +${result.gained}（+${result.xp} 经验）`, `${card.name}: ${attrName(plan.attr, lang)} +${result.gained} (+${result.xp} XP)`)
      : pick(lang, `${card.name} 积累了 ${result.xp} 点${attrName(plan.attr, lang)}经验，再攒一点就会突破`, `${card.name} banked ${result.xp} ${attrName(plan.attr, lang)} XP — close to a breakthrough`))
    : "";
  return html`<div class="hl-report" data-hosted-report>
    <h4>${pick(lang, `欢迎回来！你的球队离线打了 ${result.days.length} 天`, `Welcome back! Your team played ${result.days.length} day(s) while you were away`)}</h4>
    <p class="hl-story">${pick(lang, `${games} 场 ${wins} 胜 ${games - wins} 负`, `${wins}–${games - wins} over ${games} games`)}</p>
    ${best ? html`<p class="hl-story">${keyGameLine(best, lang)}</p>` : ""}
    ${grew ? html`<p class="hl-story">${grew}</p>` : ""}
    <p class="hl-numbers">${pick(lang, `金币 +¤${result.gold} · 经验 +${result.xp}`, `Gold +¤${result.gold} · XP +${result.xp}`)}</p>
  </div>`.toString();
}

/** The recent days, newest first (kept in the save, so it survives leaving the screen). */
export function hostedLogHtml(account, { lang }) {
  const log = hostedState(account).log.slice(0, 7);
  if (!log.length) return html`<p class="tiny">${pick(lang, "还没有结算过的托管比赛。开启后，从明天起每天的比赛会在你回来时结算。", "No hosted games settled yet. Once it is on, each full day is settled when you come back.")}</p>`.toString();
  return html`<ul class="hl-log">${log.map((row) => html`<li><b>${dayLabel(row.day)}</b> ${pick(lang, `${row.wins} 胜 ${row.games - row.wins} 负`, `${row.wins}–${row.games - row.wins}`)} · ¤${row.gold} · +${row.xp} XP${row.paid === 0 ? html`<small> · ${pick(lang, "本周奖励已满", "weekly rewards used up")}</small>` : ""}${row.key ? html`<small class="hl-key">${keyGameLine(row.key, lang)}</small>` : ""}</li>`)}</ul>`.toString();
}

/** Status + plan editor. `sel` = { playerId, attr }. */
export function hostedFormHtml(account, sel, { now, pool, lang }) {
  const state = hostedState(account);
  const on = !!state.plan;
  const week = weekOf(dayOf(now));
  const paid = state.paidWeek.week === week ? state.paidWeek.paid : 0;
  const ready = hostedReady(account, pool);
  const owned = (account.playerIds || []).map((id) => cardOf(pool, id)).filter(Boolean).sort((a, b) => overall(b) - overall(a));
  const info = sel.playerId ? trainingInfo(account, sel.playerId, pool) : null;
  const planCard = on && state.plan.playerId ? cardOf(pool, state.plan.playerId) : null;
  const status = on
    ? pick(lang, `托管中${planCard ? ` · 训练重点：${planCard.name} · ${attrName(state.plan.attr, lang)}` : " · 只赚金币"}`, `On${planCard ? ` · focus: ${planCard.name} · ${attrName(state.plan.attr, lang)}` : " · gold only"}`)
    : pick(lang, "未开启", "Off");
  return html`<p class="tiny">${pick(lang,
    `你离线时，球队每天自动打 ${DAILY_GAMES} 场，次日回来结算。前 5 场全额、6–10 场半额、之后只给少量经验；每周最多 ${WEEKLY_PAID_GAMES} 场有奖励。不影响排位。`,
    `While you are away your team plays ${DAILY_GAMES} games a day, settled when you return. Games 1–5 pay in full, 6–10 half, after that a little XP only; at most ${WEEKLY_PAID_GAMES} paid games a week. Ranked is never affected.`)}</p>
    <p class="hl-status" role="status"><b>${status}</b><span class="tiny hl-week">${pick(lang, `本周已计奖励 ${paid}/${WEEKLY_PAID_GAMES} 场`, `paid this week ${paid}/${WEEKLY_PAID_GAMES}`)}</span></p>
    ${ready ? "" : html`<p class="tc-why" role="status">${pick(lang, "至少需要 5 位不同的球员才能组队托管。", "You need at least 5 different players to field a hosted team.")}</p>`}
    <label class="tc-field"><span>${pick(lang, "成长重点球员", "Growth focus")}</span>
      <select data-hosted-player><option value="">${pick(lang, "不指定（只赚金币）", "None (gold only)")}</option>${owned.map((p) => html`<option value="${p.id}" ${p.id === sel.playerId ? "selected" : ""}>${p.name} ${p.season} · ${overall(p)}</option>`)}</select></label>
    ${info ? html`<div class="tc-row">${ATTR_KEYS.map((key) => {
      const a = info.attrs[key];
      return html`<button type="button" class="tc-chip ${key === sel.attr ? "on" : ""}" data-hosted-attr="${key}">${attrName(key, lang)} ${a.value}${a.capped ? " ✓" : ""}</button>`;
    })}</div>` : ""}
    <div class="tc-row">
      <button type="button" class="btn primary" data-hosted-save ${ready ? "" : "disabled"}>${on ? pick(lang, "更新托管计划", "Update plan") : pick(lang, "开启托管", "Turn on")}</button>
      ${on ? html`<button type="button" class="btn ghost" data-hosted-off>${pick(lang, "关闭托管", "Turn off")}</button>` : ""}
    </div>`.toString();
}

/** Resolve after the browser has had a chance to paint (the next frame, then a task); plain timer where there is no rAF. */
const afterPaint = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(resolve, 0));
  else setTimeout(resolve, 0);
});

/**
 * Mount on `root` (the training screen; the card lives in [data-hosted]). `open()` settles whatever is owed, paints,
 * and resolves to true when something was settled (the caller repaints gold). Games run on the main thread (~30 ms each,
 * 140 for the 7-day catch-up cap), so they are played in chunks of a few games with a paint in between and a live
 * percentage on the "settling" line; the page stays responsive.
 */
export function createHostedPanel({ root, getAccount, pool, getLang = () => "zh", now = () => Date.now(), play = createHostedPlayGame, save }) {
  const box = () => root.querySelector("[data-hosted]");
  const top = () => root.querySelector("[data-hosted-top]"); // the welcome-back card lives at the TOP of the screen, above the training form
  let sel = { playerId: "", attr: "three" };
  let reportHtml = "";
  let settling = false;
  let progress = null; // { done, total } games while settling
  const ctx = () => ({ now: now(), pool: pool(), lang: getLang() });

  const settlingText = (lang) => `${pick(lang, "正在结算你离线时的比赛", "Settling the games played while you were away")}${progress ? ` · ${Math.round((progress.done / progress.total) * 100)}%` : ""}…`;
  /** Progress ticks several times a second: update the one line, never repaint the form (it would eat clicks). */
  function paintSettling() {
    const line = top()?.querySelector(".hl-settling");
    if (line) line.textContent = settlingText(getLang());
  }

  function paint() {
    const acc = getAccount();
    const el = box();
    if (!acc || !el) return;
    const { lang } = ctx();
    const head = top();
    if (head) {
      head.innerHTML = html`${settling ? html`<p class="hl-settling" role="status">${settlingText(lang)}</p>` : ""}${reportHtml ? raw(reportHtml) : ""}`.toString();
    }
    el.innerHTML = html`<h3>${pick(lang, "托管联赛", "Hosted league")}</h3>
      ${raw(hostedFormHtml(acc, sel, ctx()))}
      <h4>${pick(lang, "最近几天", "Recent days")}</h4>${raw(hostedLogHtml(acc, ctx()))}`.toString();
  }

  async function open() {
    if (settling) return false; // a second visit while the first is still settling must not settle the same days twice
    const acc = getAccount();
    if (!acc || !box()) return false;
    const plan = hostedState(acc).plan;
    sel = { playerId: plan?.playerId || "", attr: plan?.attr || "three" };
    reportHtml = "";
    const state = hostedState(acc);
    const owes = state.plan && state.settledDay !== null && dayOf(now()) - 1 > state.settledDay && hostedReady(acc, pool());
    let settled = false;
    if (owes) {
      settling = true;
      progress = null;
      paint();
      await afterPaint(); // the "settling" line must be ON SCREEN before the games block the thread (a bare timer is not a paint)
      try {
        const result = await settleHostedAsync(getAccount, {
          now: now(), playGame: play(acc, { pool: pool() }), pool: pool(), ...(save ? { save } : {}),
          yieldFrame: afterPaint, onProgress: (p) => { progress = p; paintSettling(); },
        });
        if (result.days.length) {
          reportHtml = hostedReportHtml(result, hostedState(acc).plan, ctx());
          settled = true;
        }
      } catch (error) {
        console.error("[hosted] settle failed", error); // leave the day unsettled: the next visit tries again
      }
      settling = false;
      progress = null;
    }
    paint();
    return settled;
  }

  root.addEventListener("click", (event) => {
    const t = event.target.closest("button");
    if (!t || !root.contains(t) || !box()?.contains(t) || settling) return; // plan edits wait until the games are done
    const acc = getAccount();
    if (!acc) return;
    if (t.dataset.hostedAttr) {
      sel = { ...sel, attr: t.dataset.hostedAttr };
      paint();
    } else if (t.hasAttribute("data-hosted-save")) {
      setHostedPlan(acc, { playerId: sel.playerId || null, attr: sel.playerId ? sel.attr : null }, { now: now(), ...(save ? { save } : {}) });
      paint();
    } else if (t.hasAttribute("data-hosted-off")) {
      clearHostedPlan(acc, save ? { save } : {});
      reportHtml = "";
      paint();
    }
  });
  root.addEventListener("change", (event) => {
    if (!event.target.matches("[data-hosted-player]") || !box()?.contains(event.target) || settling) return;
    sel = { ...sel, playerId: event.target.value };
    paint();
  });

  return { open };
}
