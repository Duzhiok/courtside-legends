import test from "node:test";
import assert from "node:assert/strict";
import {
  INBOX_EVENTS, buildInboxContext, createCareerInboxState, inboxSummary, localizeInboxChoice, localizeInboxEvent,
  pendingInboxEvents, queueInboxEvents, recordNews, screenInboxEvents,
} from "../js/career/careerInbox.js";
import { applyDecision, openPromises } from "../js/career/careerDecisions.js";
import { careerSummary, describeHistoryEntry } from "../js/career/careerHistory.js";
import { describeTimelineStop } from "../js/career/careerTimeline.js";
import { overall } from "../js/data/players.js";
import { INBOX_SEASON_GAMES, inboxBodyHtml } from "../js/ui/careerInboxHtml.js";

// B122 migration of careerInboxView.js + B61-style extraction: render()'s string-built body became the pure
// inboxBodyHtml() written with html`` (every value escaped by default). ORACLE: the old block, verbatim from
// careerInboxView.js at 5ad7ec4f, RUN with the same inputs. Same bytes for ordinary text; the one intended difference
// is that & < > " ' inside values are entities now.
const OLD_BLOCK = "    const header = `<section><h3>CAREER HUB · 1996–97</h3>`\n      + `<p>${L(\"你的篮球世界正在发生变化\", \"Your basketball world is changing\", l)}</p>`\n      + `<p>${L(\"待处理\", \"Pending\", l)} ${summary.pending}（${L(\"紧急\", \"urgent\", l)} ${summary.urgent}）· ${L(\"未读新闻\", \"Unread news\", l)} ${summary.unreadNews} · ${L(\"进行中的承诺\", \"Open promises\", l)} ${summary.openPromises}</p>`\n      + `<p>${L(\"信任\", \"Trust\", l)} ${slice.state.trust} / 100 · ${L(\"媒体压力\", \"Media pressure\", l)} ${slice.state.mediaPressure} · ${L(\"时间线偏离\", \"Timeline divergence\", l)} ${slice.state.divergence}</p>`\n      + (d\n        ? `<p>${d.teamId} · ${L(\"第\", \"Game \", l)}${Math.min(d.index + 1, INBOX_SEASON_GAMES)}/${INBOX_SEASON_GAMES}${L(\" 场\", \"\", l)} · ${d.wins}${L(\"胜\", \"W\", l)}${d.losses}${L(\"负\", \"L\", l)}${core ? ` · ${L(\"核心\", \"Core\", l)} ${core.name}（OVR ${overall(core)}）` : \"\"}</p>`\n        : \"\")\n      + `</section>`;\n\n    const picker = !d\n      ? `<section><h3>${L(\"选一支球队，开始 1996–97 赛季\", \"Pick a team to start the 1996–97 season\", l)}</h3>`\n        + `<p>${L(\"演示赛季：真实赛程、真实比赛（GameSim），收件箱事件由真实状态驱动。\", \"Demo season: real schedule, real games (GameSim); inbox events are driven by real state.\", l)}</p>`\n        + `<select id=\"inbox-team-pick\">${teamOptions(l).map((team) => `<option value=\"${team.id}\">${team.name} · ${team.id}</option>`).join(\"\")}</select> `\n        + `<button type=\"button\" class=\"btn\" data-start-demo=\"1\">${L(\"开始赛季\", \"Start season\", l)}</button></section>`\n      : \"\";\n\n    const timeline = d && !done\n      ? `<section><h3>${L(\"推进时间\", \"Advance time\", l)}</h3>`\n        + `<button type=\"button\" class=\"btn\" data-run=\"next-game\" ${busy ? \"disabled\" : \"\"}>${L(\"下一场比赛\", \"Next game\", l)}</button> `\n        + `<button type=\"button\" class=\"btn\" data-run=\"next-event\" ${busy ? \"disabled\" : \"\"}>${L(\"下一重要事件\", \"Next important event\", l)}</button> `\n        + `<button type=\"button\" class=\"btn\" data-run=\"next-key-node\" ${busy ? \"disabled\" : \"\"}>${targetLabel || L(\"下一赛季关键节点\", \"Next season key node\", l)}</button>`\n        + (lastStop ? `<p>${describeTimelineStop(lastStop, l)}</p>` : \"\")\n        + (lastRun\n          ? `<p>${L(\"模拟了\", \"Simmed \", l)}${lastRun.reports.length}${L(\" 场\", \" games\", l)} · ${lastRun.wins}${L(\"胜\", \"W\", l)}${lastRun.reports.length - lastRun.wins}${L(\"负\", \"L\", l)} · ${L(\"信任\", \"Trust\", l)} ${lastRun.trustBefore} → ${lastRun.trustAfter}</p>`\n          : \"\")\n        + `</section>`\n      : d && done\n        ? `<section><p>${L(\"赛季打完了。\", \"The season is over.\", l)}</p></section>`\n        : \"\";\n\n    const result = lastResult\n      ? `<section><h3>${L(\"决定已记录\", \"Decision recorded\", l)}</h3><p>${l === \"en\" ? lastResult.reasonEn : lastResult.reason}</p>`\n        + lastResult.followUp.map((f) => `<p>${l === \"en\" ? f.textEn : f.text}</p>`).join(\"\")\n        + `</section>`\n      : \"\";\n\n    const pendingHtml = pending.length\n      ? `<section><h3>${L(\"待处理事件\", \"Pending events\", l)}</h3>${pending.map((instance) => {\n        const localized = localizeInboxEvent(instance, l);\n        // Choices come from the definition; look them up by event id.\n        const def = pendingDefinition(instance.eventId);\n        const facts = instance.facts || {};\n        const factsLine = [\n          facts.coreName ? `${L(\"核心\", \"Core\", l)} ${facts.coreName}（${L(\"上场\", \"last game\", l)} ${facts.coreLastPts ?? \"—\"} ${L(\"分，赛季场均\", \"pts, season avg\", l)} ${facts.coreAvgPts != null ? Math.round(facts.coreAvgPts * 10) / 10 : \"—\"}）` : \"\",\n          facts.losingStreak ? `${facts.losingStreak} ${L(\"连败\", \"game losing streak\", l)}` : \"\",\n          facts.prospect ? `${L(\"球探目标\", \"Scout target\", l)} ${facts.prospect.name}（${facts.prospect.pos} · OVR ${facts.prospect.ovr} · ${L(\"评估\", \"estimate\", l)} ${facts.prospect.estimate}）` : \"\",\n          facts.veteran ? `${L(\"老将\", \"Veteran\", l)} ${facts.veteran.name}（${facts.veteran.age} ${L(\"岁\", \"yrs\", l)} · OVR ${facts.veteran.ovr}）` : \"\",\n          facts.contenderName ? `${L(\"对方\", \"Suitor\", l)} ${facts.contenderName}` : \"\",\n        ].filter(Boolean).join(\" · \");\n        return `<article><h4>${instance.urgency === \"urgent\" ? \"❗ \" : \"\"}${localized.title}</h4>`\n          + `<p>${localized.prompt}</p>`\n          + (factsLine ? `<p>${factsLine}</p>` : \"\")\n          + `<div>${(def.choices || []).map((choice) => {\n            const c = localizeInboxChoice(choice, l);\n            return `<button type=\"button\" class=\"btn\" data-decide=\"${instance.eventId}:${choice.id}\">${c.label}</button>`;\n          }).join(\" \")}</div>`\n          + `<div>${(def.choices || []).map((choice) => {\n            const c = localizeInboxChoice(choice, l);\n            return `<p><b>${c.label}</b>：${c.description}<br>${L(\"后果\", \"Consequence\", l)}：${c.consequence}</p>`;\n          }).join(\"\")}</div></article>`;\n      }).join(\"\")}</section>`\n      : `<section><p>${L(\"暂无待处理事件——推进时间，事件会从真实状态中出现。\", \"No pending events — advance time and events will emerge from real state.\", l)}</p></section>`;\n\n    const promisesHtml = promises.length\n      ? `<section><h3>${L(\"进行中的承诺\", \"Open promises\", l)}</h3>${promises.map((p) => `<p>${l === \"en\" ? p.textEn : p.text} · ${L(\"第\", \"due after game \", l)}${p.dueGame + 1}${L(\" 场后检查\", \"\", l)}</p>`).join(\"\")}</section>`\n      : \"\";\n\n    const newsHtml = news.length\n      ? `<section><h3>${L(\"联盟动态\", \"League news\", l)}</h3>${news.map((item) => `<p>${item.read ? \"\" : \"● \"}${l === \"en\" ? item.textEn : item.text}</p>`).join(\"\")}</section>`\n      : \"\";\n\n    const historyHtml = history.length\n      ? `<section><h3>${L(\"生涯记录\", \"Career record\", l)}</h3>${history.map((entry) => `<p>${describeHistoryEntry(entry, l)}</p>`).join(\"\")}`\n        + `<p>${L(\"决定\", \"Decisions\", l)} ${sum.choices} · ${L(\"承诺兑现\", \"Promises kept\", l)} ${sum.promisesKept} · ${L(\"违约\", \"broken\", l)} ${sum.promisesBroken} · ${L(\"时间线偏离\", \"Divergence\", l)} ${sum.divergence}</p></section>`\n      : \"\";\n\n    body.innerHTML = header + picker + timeline + result + pendingHtml + promisesHtml + newsHtml + historyHtml;\n";

const oldBody = new Function(
  "L", "l", "slice", "summary", "d", "core", "done", "busy", "targetLabel", "lastStop", "lastRun", "lastResult", "teamOptions",
  "promises", "pending", "history", "news", "sum", "pendingDefinition", "overall", "INBOX_SEASON_GAMES", "describeTimelineStop",
  "describeHistoryEntry", "localizeInboxEvent", "localizeInboxChoice",
  `const body = { innerHTML: "" };\n${OLD_BLOCK}\nreturn body.innerHTML;`,
);
const L = (zh, en, lang) => (lang === "en" ? en : zh);
const BAD = "<img src=x onerror=alert(1)>";

/** A real inbox slice with pending events, news, a resolved decision (history + promise), driven by the real engine. */
function makeSlice({ coreName = "Michael Jordan", prospectName = "Tim Duncan", veteranName = "Karl Malone", contender = "Utah（Malone）", newsText = "Core scored 40" } = {}) {
  let slice = createCareerInboxState({ role: "coach", seasonYear: 1997, teamId: "CHI" });
  const ctx = (o = {}) => buildInboxContext({
    gameIndex: 10, week: 3, losingStreak: 3, coreLastPts: 8, coreAvgPts: 18, coreName,
    prospect: { name: prospectName, pos: "PF", ovr: 71, estimate: 78, bref: "x01" },
    veteran: { name: veteranName, age: 36, ovr: 75, bref: "y01" }, contenderName: contender,
    trust: 25, pressure: 10, flags: {}, ...o,
  });
  slice.inbox = queueInboxEvents(slice.inbox, screenInboxEvents(slice.inbox, ctx()));
  slice.inbox = recordNews(slice.inbox, { kind: "game", text: newsText, textEn: newsText + " (en)", gameIndex: 9 });
  slice.inbox = recordNews(slice.inbox, { kind: "game", text: "旧闻", textEn: "old news", gameIndex: 8 });
  slice.inbox.news[1].read = true;
  return slice;
}

function resolveOne(slice) {
  const first = pendingInboxEvents(slice.inbox)[0];
  const def = INBOX_EVENTS.find((e) => e.id === first.eventId);
  const out = applyDecision(slice.inbox, slice.state, first.eventId, def.choices[0].id, { gameIndex: 10, year: 1997 });
  return { ...slice, inbox: out.inbox, state: out.state, result: out.result };
}

function inputs(slice, over = {}) {
  const l = over.l || "zh";
  const d = "d" in over ? over.d : { teamId: "CHI", index: 10, wins: 6, losses: 4 };
  const done = d ? d.index >= INBOX_SEASON_GAMES : false;
  return {
    l, slice, summary: inboxSummary(slice.inbox), d, core: "core" in over ? over.core : { name: "Michael Jordan", ovr2k: 99, season: 1996 },
    done, busy: over.busy || false, targetLabel: over.targetLabel ?? "Trade deadline", lastStop: over.lastStop ?? null,
    lastRun: over.lastRun ?? null, lastResult: over.lastResult ?? null,
    teams: [{ id: "CHI", name: "公牛" }, { id: "LAL", name: "湖人" }],
    promises: openPromises(slice.inbox), pending: pendingInboxEvents(slice.inbox),
    history: (slice.inbox.history || []).slice(-10).reverse(), news: (slice.inbox.news || []).slice(-10).reverse(),
    sum: careerSummary(slice.inbox, slice.state, { wins: d?.wins || 0, losses: d?.losses || 0, games: d ? d.index : 0 }),
    definitionOf: (eventId) => INBOX_EVENTS.find((event) => event.id === eventId) || { choices: [] },
  };
}

function runOld(m) {
  return oldBody(L, m.l, m.slice, m.summary, m.d, m.core, m.done, m.busy, m.targetLabel, m.lastStop, m.lastRun, m.lastResult,
    () => m.teams, m.promises, m.pending, m.history, m.news, m.sum, m.definitionOf, overall, INBOX_SEASON_GAMES,
    describeTimelineStop, describeHistoryEntry, localizeInboxEvent, localizeInboxChoice);
}
const runNew = (m) => String(inboxBodyHtml(m));
/** Put back the entities html`` writes for & < > " ' inside VALUES (the literal markup never has any). */
const unescaped = (s) => s.replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

const resolved = resolveOne(makeSlice());
const lastRun = { reports: [1, 2, 3], wins: 2, trustBefore: 25, trustAfter: 30 };
const lastStop = { type: "event", detail: { title: "球探报告", titleEn: "Scout report" } };
const scenarios = {
  "no demo yet (team picker)": () => inputs(makeSlice(), { d: null, core: null }),
  "mid-season, pending events, news": () => inputs(makeSlice()),
  "busy (buttons disabled)": () => inputs(makeSlice(), { busy: true }),
  "no target label": () => inputs(makeSlice(), { targetLabel: null }),
  "after a decision (result, history, promise)": () => inputs(resolved, { lastResult: resolved.result }),
  "with a timeline stop and a run summary": () => inputs(resolved, { lastStop, lastRun }),
  "season over": () => inputs(makeSlice(), { d: { teamId: "CHI", index: 82, wins: 50, losses: 32 } }),
  "no core card": () => inputs(makeSlice(), { core: null }),
  "empty inbox": () => inputs(createCareerInboxState({ role: "coach", seasonYear: 1997, teamId: "CHI" })),
};

for (const l of ["zh", "en"]) {
  for (const [label, build] of Object.entries(scenarios)) {
    test(`inboxBodyHtml matches the old inline render byte-for-byte (${l}: ${label})`, () => {
      const m = { ...build(), l };
      // Chinese text has no apostrophes: strictly the same bytes. English copy does ("player's"): the same text, now
      // escaped as an entity, which the browser renders identically.
      if (l === "zh") assert.equal(runNew(m), runOld(m));
      else assert.equal(unescaped(runNew(m)), runOld(m));
    });
  }
}

test("the oracle is not vacuous: the scenarios really contain events, news, promises, history and a result", () => {
  const out = runOld({ ...scenarios["with a timeline stop and a run summary"](), l: "en", lastResult: resolved.result });
  for (const needle of ["data-decide=", "League news", "Open promises", "Career record", "Decision recorded", "Scout report", "Simmed ", "Pending events"]) {
    assert.ok(out.includes(needle), needle);
  }
  assert.ok(runOld(scenarios["busy (buttons disabled)"]()).includes("disabled"));
  assert.ok(!runOld(scenarios["mid-season, pending events, news"]()).includes("disabled"));
});

test("an apostrophe or ampersand in a name differs from the old bytes only as an entity", () => {
  const m = { ...inputs(makeSlice({ coreName: "Shaquille O'Neal & Co", prospectName: "D'Angelo Russell", veteranName: "Dell Curry & Sons", contender: "AT&T （Dell）", newsText: "O'Neal 40 & 12" })), l: "en" };
  const fresh = runNew(m);
  assert.notEqual(fresh, runOld(m), "entities are the intended difference");
  assert.equal(fresh.replaceAll("&#39;", "'").replaceAll("&amp;", "&"), runOld(m));
});

test("hostile names and persisted news/promise/history text never become markup", () => {
  const slice = makeSlice({ coreName: BAD, prospectName: BAD, veteranName: BAD, contender: BAD, newsText: BAD });
  const m = { ...inputs(slice, { core: { name: BAD, ovr2k: 80, season: 1996 } }), l: "en" };
  m.teams = [{ id: "X", name: BAD }];
  m.promises = [{ text: BAD, textEn: BAD, dueGame: 12 }];
  m.history = [{ type: "story-choice", instanceId: "i", eventId: "e", choiceId: "c", year: 1997, gameIndex: 1, effects: {}, followUp: [], text: BAD, textEn: BAD }];
  m.lastResult = { reason: BAD, reasonEn: BAD, followUp: [{ text: BAD, textEn: BAD }] };
  const html = runNew(m);
  assert.ok(!html.includes(BAD), "raw crafted text leaked");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(runOld(m).includes(BAD), "the old code did leak it (that is the bug this fixes)");
});

test("a missing timeline description writes nothing (the old code wrote the word \"null\" into the page)", () => {
  const m = { ...scenarios["mid-season, pending events, news"](), l: "zh", lastStop: { type: "no-such-stop" } };
  assert.ok(runOld(m).includes("<p>null</p>"), "old behaviour");
  assert.ok(runNew(m).includes("<p></p>") && !runNew(m).includes("null"), "new behaviour");
});
