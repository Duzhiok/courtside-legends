/**
 * Hosted league panel (B47) for the Training Center screen: pure HTML. Rules live in js/data/hostedLeague.js,
 * the games in js/data/hostedPlay.js; this file only shows the plan form, the last settlement and the log.
 */
import { overall } from "../data/players.js";
import { esc } from "./myTeamViewKit.js";
import { resolvePlayers } from "../data/account.js";
import { ATTR_LABELS, CAMPS } from "../data/trainingRules.js";
import { DAILY_GAMES, WEEKLY_PAID_GAMES, hostedState } from "../data/hostedLeague.js";
import { hostedReady } from "../data/hostedPlay.js";

const pick = (lang, zh, en) => (lang === "en" ? en : zh);
const attrName = (key, lang) => (ATTR_LABELS[key] || [key, key])[lang === "en" ? 1 : 0];
const ATTR_KEYS = [...new Set(Object.values(CAMPS).flatMap((c) => c.attrs))];

export function settledHtml(report, lang) {
  if (!report?.days?.length) return "";
  const games = report.days.reduce((n, d) => n + d.games, 0);
  const wins = report.days.reduce((n, d) => n + d.wins, 0);
  return `<p class="tc-hosted-report" role="status">${pick(lang,
    `托管联赛结算：${report.days.length} 天 ${games} 场（${wins} 胜），金币 +¤${report.gold}，经验 +${report.xp}${report.gained ? `，属性 +${report.gained}` : ""}`,
    `Hosted league settled: ${report.days.length} day(s), ${games} games (${wins} W), gold +¤${report.gold}, XP +${report.xp}${report.gained ? `, attribute +${report.gained}` : ""}`)}</p>`;
}

export function hostedHtml(account, { pool, lang }) {
  const state = hostedState(account);
  const owned = resolvePlayers(account.playerIds || [], account, pool).filter(Boolean).sort((a, b) => overall(b) - overall(a));
  const plan = state.plan || {};
  const playerOpts = owned.map((p) => `<option value="${esc(p.id)}"${p.id === plan.playerId ? " selected" : ""}>${esc(`${p.name} ${p.season} · ${overall(p)}`)}</option>`).join("");
  const attrOpts = ATTR_KEYS.map((k) => `<option value="${k}"${k === plan.attr ? " selected" : ""}>${esc(attrName(k, lang))}</option>`).join("");
  const ready = hostedReady(account, pool);
  const log = state.log.slice(0, 5).map((d) => `<li>${pick(lang, "第", "Day ")}${d.day}${pick(lang, "天", "")}: ${d.wins}/${d.games} · ¤${d.gold} · ${d.xp} XP</li>`).join("");
  return `<h3>${pick(lang, "托管联赛", "Hosted league")}</h3>
    <p class="tiny">${pick(lang,
      `你离线时，球队每天自动打最多 ${DAILY_GAMES} 场（真实 GameSim，固定种子，不能刷结果）；每周只有前 ${WEEKLY_PAID_GAMES} 场有奖励，后面的场次奖励递减。不计入排位。`,
      `While you're away your squad plays up to ${DAILY_GAMES} real GameSim games a day (fixed seeds, no rerolls). Only the first ${WEEKLY_PAID_GAMES} games a week pay, with diminishing rewards. Never ranked.`)}</p>
    ${ready ? "" : `<p class="tc-why">${pick(lang, "需要至少 5 位不同的球员才能托管。", "You need at least 5 different players.")}</p>`}
    <label class="tc-field"><span>${pick(lang, "获得经验的球员", "XP goes to")}</span>
      <select data-hosted-player><option value="">${pick(lang, "选择球员…", "Choose a player…")}</option>${playerOpts}</select></label>
    <label class="tc-field"><span>${pick(lang, "训练属性", "Attribute")}</span><select data-hosted-attr>${attrOpts}</select></label>
    <button type="button" class="btn" data-hosted-save${ready ? "" : " disabled"}>${state.plan ? pick(lang, "更新托管", "Update plan") : pick(lang, "开始托管", "Start hosting")}</button>
    ${log ? `<ul class="tc-hosted-log">${log}</ul>` : ""}`;
}
