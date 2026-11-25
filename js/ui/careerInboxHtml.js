// The Career Inbox screen body as a pure function of what the view has already worked out (B122 migration + B61-style
// extraction). careerInboxView.js keeps everything stateful -- the demo season, the buttons' handlers, persistence --
// derives these inputs in render(), then writes this onto #career-inbox-body and wires the buttons.
//
// Built with html`` (js/core/html.js): every interpolated value is escaped by default. That matters here because the
// inbox renders player, team and scout-target names and the news / promise / history lines persisted in the root save,
// all of which can arrive from a save file. Output is the old string byte-for-byte for ordinary text; the only change is
// that & < > " ' in those values are now entities.
import { localizeInboxChoice, localizeInboxEvent } from "../career/careerInbox.js";
import { describeHistoryEntry } from "../career/careerHistory.js";
import { describeTimelineStop } from "../career/careerTimeline.js";
import { html } from "../core/html.js";
import { overall } from "../data/players.js";

export const INBOX_SEASON_GAMES = 82;

const L = (zh, en, lang) => (lang === "en" ? en : zh);

function headerHtml({ l, slice, summary, d, core }) {
  return html`${[
    html`<section><h3>CAREER HUB · 1996–97</h3>`,
    html`<p>${L("你的篮球世界正在发生变化", "Your basketball world is changing", l)}</p>`,
    html`<p>${L("待处理", "Pending", l)} ${summary.pending}（${L("紧急", "urgent", l)} ${summary.urgent}）· ${L("未读新闻", "Unread news", l)} ${summary.unreadNews} · ${L("进行中的承诺", "Open promises", l)} ${summary.openPromises}</p>`,
    html`<p>${L("信任", "Trust", l)} ${slice.state.trust} / 100 · ${L("媒体压力", "Media pressure", l)} ${slice.state.mediaPressure} · ${L("时间线偏离", "Timeline divergence", l)} ${slice.state.divergence}</p>`,
    d
      ? html`<p>${d.teamId} · ${L("第", "Game ", l)}${Math.min(d.index + 1, INBOX_SEASON_GAMES)}/${INBOX_SEASON_GAMES}${L(" 场", "", l)} · ${d.wins}${L("胜", "W", l)}${d.losses}${L("负", "L", l)}${core ? html` · ${L("核心", "Core", l)} ${core.name}（OVR ${overall(core)}）` : ""}</p>`
      : "",
    html`</section>`,
  ]}`;
}

function pickerHtml({ l, d, teams }) {
  if (d) return "";
  return html`${[
    html`<section><h3>${L("选一支球队，开始 1996–97 赛季", "Pick a team to start the 1996–97 season", l)}</h3>`,
    html`<p>${L("演示赛季：真实赛程、真实比赛（GameSim），收件箱事件由真实状态驱动。", "Demo season: real schedule, real games (GameSim); inbox events are driven by real state.", l)}</p>`,
    html`<select id="inbox-team-pick">${teams.map((team) => html`<option value="${team.id}">${team.name} · ${team.id}</option>`)}</select> `,
    html`<button type="button" class="btn" data-start-demo="1">${L("开始赛季", "Start season", l)}</button></section>`,
  ]}`;
}

function timelineHtml({ l, d, done, busy, targetLabel, lastStop, lastRun }) {
  if (!d) return "";
  if (done) return html`<section><p>${L("赛季打完了。", "The season is over.", l)}</p></section>`;
  const disabled = busy ? "disabled" : "";
  return html`${[
    html`<section><h3>${L("推进时间", "Advance time", l)}</h3>`,
    html`<button type="button" class="btn" data-run="next-game" ${disabled}>${L("下一场比赛", "Next game", l)}</button> `,
    html`<button type="button" class="btn" data-run="next-event" ${disabled}>${L("下一重要事件", "Next important event", l)}</button> `,
    html`<button type="button" class="btn" data-run="next-key-node" ${disabled}>${targetLabel || L("下一赛季关键节点", "Next season key node", l)}</button>`,
    lastStop ? html`<p>${describeTimelineStop(lastStop, l)}</p>` : "",
    lastRun
      ? html`<p>${L("模拟了", "Simmed ", l)}${lastRun.reports.length}${L(" 场", " games", l)} · ${lastRun.wins}${L("胜", "W", l)}${lastRun.reports.length - lastRun.wins}${L("负", "L", l)} · ${L("信任", "Trust", l)} ${lastRun.trustBefore} → ${lastRun.trustAfter}</p>`
      : "",
    html`</section>`,
  ]}`;
}

function resultHtml({ l, lastResult }) {
  if (!lastResult) return "";
  return html`${[
    html`<section><h3>${L("决定已记录", "Decision recorded", l)}</h3><p>${l === "en" ? lastResult.reasonEn : lastResult.reason}</p>`,
    lastResult.followUp.map((f) => html`<p>${l === "en" ? f.textEn : f.text}</p>`),
    html`</section>`,
  ]}`;
}

/** The one-line facts under a pending event (core player, losing streak, scout target, veteran, suitor). */
function factsLineOf(facts, l) {
  return [
    facts.coreName ? `${L("核心", "Core", l)} ${facts.coreName}（${L("上场", "last game", l)} ${facts.coreLastPts ?? "—"} ${L("分，赛季场均", "pts, season avg", l)} ${facts.coreAvgPts != null ? Math.round(facts.coreAvgPts * 10) / 10 : "—"}）` : "",
    facts.losingStreak ? `${facts.losingStreak} ${L("连败", "game losing streak", l)}` : "",
    facts.prospect ? `${L("球探目标", "Scout target", l)} ${facts.prospect.name}（${facts.prospect.pos} · OVR ${facts.prospect.ovr} · ${L("评估", "estimate", l)} ${facts.prospect.estimate}）` : "",
    facts.veteran ? `${L("老将", "Veteran", l)} ${facts.veteran.name}（${facts.veteran.age} ${L("岁", "yrs", l)} · OVR ${facts.veteran.ovr}）` : "",
    facts.contenderName ? `${L("对方", "Suitor", l)} ${facts.contenderName}` : "",
  ].filter(Boolean).join(" · ");
}

function pendingHtml({ l, pending, definitionOf }) {
  if (!pending.length) {
    return html`<section><p>${L("暂无待处理事件——推进时间，事件会从真实状态中出现。", "No pending events — advance time and events will emerge from real state.", l)}</p></section>`;
  }
  const cards = pending.map((instance) => {
    const localized = localizeInboxEvent(instance, l);
    // Choices come from the definition; look them up by event id.
    const choices = definitionOf(instance.eventId).choices || [];
    const factsLine = factsLineOf(instance.facts || {}, l);
    return html`${[
      html`<article><h4>${instance.urgency === "urgent" ? "❗ " : ""}${localized.title}</h4>`,
      html`<p>${localized.prompt}</p>`,
      factsLine ? html`<p>${factsLine}</p>` : "",
      html`<div>${choices.map((choice) => {
        const c = localizeInboxChoice(choice, l);
        return html`<button type="button" class="btn" data-decide="${instance.eventId}:${choice.id}">${c.label}</button>`;
      }).flatMap((button, i) => (i ? [" ", button] : [button]))}</div>`,
      html`<div>${choices.map((choice) => {
        const c = localizeInboxChoice(choice, l);
        return html`<p><b>${c.label}</b>：${c.description}<br>${L("后果", "Consequence", l)}：${c.consequence}</p>`;
      })}</div></article>`,
    ]}`;
  });
  return html`<section><h3>${L("待处理事件", "Pending events", l)}</h3>${cards}</section>`;
}

function promisesHtml({ l, promises }) {
  if (!promises.length) return "";
  return html`<section><h3>${L("进行中的承诺", "Open promises", l)}</h3>${promises.map((p) => html`<p>${l === "en" ? p.textEn : p.text} · ${L("第", "due after game ", l)}${p.dueGame + 1}${L(" 场后检查", "", l)}</p>`)}</section>`;
}

function newsHtml({ l, news }) {
  if (!news.length) return "";
  return html`<section><h3>${L("联盟动态", "League news", l)}</h3>${news.map((item) => html`<p>${item.read ? "" : "● "}${l === "en" ? item.textEn : item.text}</p>`)}</section>`;
}

function historyHtml({ l, history, sum }) {
  if (!history.length) return "";
  return html`${[
    html`<section><h3>${L("生涯记录", "Career record", l)}</h3>${history.map((entry) => html`<p>${describeHistoryEntry(entry, l)}</p>`)}`,
    html`<p>${L("决定", "Decisions", l)} ${sum.choices} · ${L("承诺兑现", "Promises kept", l)} ${sum.promisesKept} · ${L("违约", "broken", l)} ${sum.promisesBroken} · ${L("时间线偏离", "Divergence", l)} ${sum.divergence}</p></section>`,
  ]}`;
}

/**
 * @param {object} m everything the old render() had in scope:
 *   l (lang), slice, summary (inboxSummary), d (demo or null), core (core card or null), done, busy, targetLabel,
 *   lastStop, lastRun, lastResult, teams ([{ id, name }]), promises, pending, history, news, sum (careerSummary),
 *   definitionOf (eventId -> event definition)
 * @returns {import("../core/html.js").SafeHtml} markup for #career-inbox-body (stringifies for innerHTML)
 */
export function inboxBodyHtml(m) {
  return html`${[headerHtml(m), pickerHtml(m), timelineHtml(m), resultHtml(m), pendingHtml(m), promisesHtml(m), newsHtml(m), historyHtml(m)]}`;
}
