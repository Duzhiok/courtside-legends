/**
 * Career Inbox view (Career 2.0, workstream A).
 *
 * The playable slice of the shared Career Inbox. A dev entry (?inbox=1)
 * opens it; it does not restructure careerEntry.js or any My World file.
 *
 * The slice runs a demo career on real 1996-97 data: the player picks a
 * real team, the schedule is the real generated schedule for that team,
 * and every game is a real GameSim (auto offense / defense / rotation,
 * seeded rng — the same construction as js/reborn/season.js's playGame,
 * without the Reborn player). The inbox screens state-driven events
 * from the live demo facts (losing streak, core line, prospect,
 * veteran, contender); the timeline advances with the three speeds.
 *
 * Persistence is the app's root save: root.careerInbox (additive,
 * optional, version 1 — see js/career/careerInbox.js). The demo season
 * progress lives under slice.demo; the engine never reads it.
 *
 * Boundaries: this view owns the demo driver and the rendering. The
 * scout-report event only surfaces a prospect and records the choice —
 * the deep scouting system (confidence, multiple opinions, tryouts) is
 * workstream C's scoutingIntel.js. The trade-deadline "ask for more"
 * outcome is workstream C's negotiation.js. The Legacy Archive
 * presentation is workstream E's.
 */
import { GameSim } from "../engine/sim.js";
import { buildSeason, rosterCards } from "../reborn/season.js";
import { seasonToCard, overall } from "../data/players.js";
import { historicalSeason } from "../data/historicalSeasons.js";
import { seededStream, hashSeed } from "../core/seededRandom.js";
import {
  buildInboxContext,
  createCareerInboxState,
  inboxSummary,
  localizeInboxChoice,
  localizeInboxEvent,
  pendingInboxEvents,
  queueInboxEvents,
  recordNews,
  screenInboxEvents,
  INBOX_EVENTS,
  INBOX_GAMES_PER_WEEK,
} from "../career/careerInbox.js";
import { applyDecision, openPromises } from "../career/careerDecisions.js";
import {
  advanceTimeline,
  describeTimelineStop,
  describeTimelineTarget,
  nextTimelineTarget,
} from "../career/careerTimeline.js";
import { careerSummary, describeHistoryEntry } from "../career/careerHistory.js";

export const INBOX_SEASON_YEAR = 1997;
export const INBOX_SEASON_GAMES = 82;

const L = (zh, en, lang) => (lang === "en" ? en : zh);

let ROWS_CACHE = null;
async function loadRows() {
  if (ROWS_CACHE) return ROWS_CACHE;
  const res = await fetch("./js/data/roster.json");
  const data = await res.json();
  ROWS_CACHE = data.players || [];
  return ROWS_CACHE;
}

export function ensureInboxScreen() {
  let el = document.querySelector("#screen-career-inbox");
  if (el) return el;
  el = document.createElement("main");
  el.id = "screen-career-inbox";
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-career-inbox-back" type="button"><span>返回</span></button><h2>职业收件箱 · Career Inbox</h2></div><div id="career-inbox-body"></div>`;
  document.body.appendChild(el);
  return el;
}

/**
 * The scout's estimate for a bench player, from real data only: age
 * (young = more room), athleticism (speed + strength), current level
 * (OVR). It is a judgment, not a fact — the estimate can be wrong, and
 * the "investigate" choice reveals the components instead of hiding
 * them behind a single number. Mirrors the bench pool of
 * js/reborn/identity.js (mpg < 12, gp >= 10) without depending on the
 * Player line: the shared inbox must not import the Reborn identity.
 */
export function findScoutProspect(rows, { season = INBOX_SEASON_YEAR, excludeTeamId = null, excludeBrefs = [] } = {}) {
  const excluded = new Set(excludeBrefs || []);
  const candidates = (rows || [])
    .filter(
      (r) =>
        r &&
        Number(r.season) === Number(season) &&
        Number(r.mpg) < 12 &&
        Number(r.gp) >= 10 &&
        r.team !== excludeTeamId &&
        !excluded.has(r.bref),
    )
    .map((r) => seasonToCard(r));
  if (!candidates.length) return null;
  const scored = candidates.map((card) => {
    const age = Number.isFinite(card.age) ? card.age : 26;
    const ovr = overall(card);
    const athleticism = Math.round(((card.speed || 50) + (card.strength || 50)) / 2);
    const estimate = Math.round((30 - age) * 2 + athleticism / 2 + ovr / 2);
    return {
      bref: card.bref,
      name: card.name,
      nameEn: card.nameEn,
      team: card.team,
      teamLabel: card.teamLabel,
      pos: card.pos,
      age,
      ovr,
      mpg: card.raw?.mpg ?? null,
      estimate,
      reasons: [`年龄 ${age} 岁`, `运动能力 ${athleticism}`, `当前 OVR ${ovr}`],
      reasonsEn: [`Age ${age}`, `Athleticism ${athleticism}`, `Current OVR ${ovr}`],
    };
  });
  scored.sort((a, b) => b.estimate - a.estimate || String(a.bref).localeCompare(String(b.bref)));
  return scored[0];
}

/** The oldest rotation player on the team (mpg >= 15) — the trade chip. */
export function findVeteran(cards) {
  const veterans = (cards || [])
    .filter((card) => Number(card.raw?.mpg) >= 15 && Number.isFinite(card.age))
    .sort((a, b) => b.age - a.age || overall(b) - overall(a));
  const card = veterans[0];
  if (!card) return null;
  return {
    id: card.id,
    name: card.name,
    nameEn: card.nameEn,
    team: card.team,
    pos: card.pos,
    age: card.age,
    ovr: overall(card),
    mpg: card.raw?.mpg ?? null,
  };
}

/**
 * The contender at the trade deadline, from real historical data: the
 * team (other than mine) whose top star scored the most in 1996-97.
 * For CHI that is UTA (Malone 27.4); for anyone else it is CHI
 * (Jordan 29.6). Deterministic, checkable, never invented.
 */
export function deadlineContender(seasonYear, myTeamId) {
  const season = historicalSeason(seasonYear);
  if (!season || !Array.isArray(season.teams)) return null;
  const scored = season.teams
    .filter((team) => team.id !== myTeamId && Array.isArray(team.stars) && team.stars.length)
    .map((team) => {
      const top = team.stars
        .map((entry) => {
          const match = /^(.*)\(([\d.]+)\)$/.exec(String(entry));
          return match ? { name: match[1], ppg: Number(match[2]) } : { name: String(entry), ppg: 0 };
        })
        .sort((a, b) => b.ppg - a.ppg)[0];
      return { id: team.id, name: team.name, star: top.name, starPpg: top.ppg };
    });
  scored.sort((a, b) => b.starPpg - a.starPpg || String(a.id).localeCompare(String(b.id)));
  return scored[0] || null;
}

/**
 * Play the demo's next game through a real GameSim. Same construction as
 * js/reborn/season.js's playGame (auto everything, seeded rng, quiet
 * drive loop) but without the Reborn player — the demo is a team season,
 * not a player career. Returns the report the timeline screens on, or
 * null when the schedule is exhausted.
 */
export async function playDemoGame(demo, players) {
  const game = demo.games[demo.index];
  if (!game) return null;
  const year = INBOX_SEASON_YEAR;
  const teamId = demo.teamId;
  const isHome = game.homeId === teamId;
  const oppId = isHome ? game.awayId : game.homeId;
  const starters = (cards) =>
    [...cards].sort((a, b) => overall(b) - overall(a)).slice(0, 5).map((p) => p.id);
  const homeCards = rosterCards(players, game.homeId, year);
  const awayCards = rosterCards(players, game.awayId, year);
  const sim = new GameSim({
    home: { name: game.homeId, players: homeCards, starterIds: starters(homeCards) },
    away: { name: game.awayId, players: awayCards, starterIds: starters(awayCards) },
    youSide: isHome ? "home" : "away",
    injuries: false,
    speed: 3,
    rng: seededStream(hashSeed(`${demo.seed}|${year}|${demo.index}`)),
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  sim.autoOffense = true;
  sim.autoDefense = true;
  sim.autoRotation = true;
  sim._quiet = true;
  sim.running = true;
  sim.paused = false;
  sim.breakReason = null;
  let guard = 0;
  while (sim.running && guard++ < 8000) sim.step();
  const youSide = sim.youSide === "home" ? sim.home : sim.away;
  const stats = youSide.roster.find((p) => p.id === demo.coreId)?.stats || {};
  const won = isHome ? sim.score.home > sim.score.away : sim.score.away > sim.score.home;
  return {
    game: demo.index,
    day: game.day,
    opp: oppId,
    home: isHome,
    score: { ...sim.score },
    won,
    corePts: stats.pts || 0,
    coreMin: Math.round((stats.min || 0) * 10) / 10,
    coreReb: stats.reb || 0,
    coreAst: stats.ast || 0,
  };
}

export function createCareerInboxView({ getLang, readRootSave, writeRootSave, show, goBack, getAccount = () => null, saveAccount = () => {} } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  let el = null;
  let rows = null;
  let slice = null;
  let lastResult = null;
  let lastStop = null;
  let lastRun = null;
  let busy = false;

  function persist() {
    const root = readRootSave() || {};
    root.careerInbox = slice;
    writeRootSave(root);
  }

  function loadSlice() {
    const root = readRootSave() || {};
    if (root.careerInbox && root.careerInbox.version === 1) {
      slice = root.careerInbox;
    } else {
      slice = createCareerInboxState({ role: "coach", seasonYear: INBOX_SEASON_YEAR, teamId: null });
      persist();
    }
    return slice;
  }

  function demo() {
    return slice?.demo || null;
  }

  function myCards() {
    const d = demo();
    if (!d || !rows) return [];
    return rosterCards(rows, d.teamId, INBOX_SEASON_YEAR);
  }

  function coreCard() {
    const cards = myCards();
    return cards.length ? cards[0] : null;
  }

  function losingStreak() {
    const d = demo();
    if (!d) return 0;
    let streak = 0;
    for (let i = d.results.length - 1; i >= 0; i -= 1) {
      if (d.results[i].won) break;
      streak += 1;
    }
    return streak;
  }

  function coreAvgPts() {
    const d = demo();
    if (!d || !d.coreLog.length) return null;
    return d.coreLog.reduce((sum, entry) => sum + (entry.pts || 0), 0) / d.coreLog.length;
  }

  function reportedProspectBrefs() {
    const flags = slice?.inbox?.flags || {};
    return Object.keys(flags)
      .filter((key) => key.startsWith("prospect-"))
      .map((key) => key.split(":")[1])
      .filter(Boolean);
  }

  /** The live screening context, built from real demo facts. */
  function demoContext() {
    const d = demo();
    const core = coreCard();
    const coreLog = d?.coreLog || [];
    const lastCore = coreLog.length ? coreLog[coreLog.length - 1] : null;
    const prospect = rows ? findScoutProspect(rows, {
      excludeTeamId: d?.teamId || null,
      excludeBrefs: reportedProspectBrefs(),
    }) : null;
    const veteran = findVeteran(myCards());
    const contender = d ? deadlineContender(INBOX_SEASON_YEAR, d.teamId) : null;
    return buildInboxContext({
      gameIndex: d ? d.index : 0,
      week: d ? Math.floor(d.index / INBOX_GAMES_PER_WEEK) + 1 : 1,
      losingStreak: losingStreak(),
      coreLastPts: lastCore ? lastCore.pts : null,
      coreAvgPts: coreAvgPts(),
      prospect,
      veteran,
      contenderName: contender ? `${contender.name}（${contender.star}）` : null,
      trust: slice.state.trust,
      pressure: slice.state.mediaPressure,
      flags: slice.inbox.flags,
      coreName: core ? core.name : null,
    });
  }

  /** One game's news, derived from the real result — folded in after the run. */
  function newsForGame(report) {
    const d = demo();
    const items = [];
    const streak = losingStreak();
    if (streak === 3) {
      items.push({
        kind: "streak",
        text: `球队遭遇 3 连败，${L("更衣室", "The locker room", lang())}需要一个答案。`,
        textEn: "The team has lost 3 in a row — the locker room needs an answer.",
        gameIndex: report.game,
      });
    }
    const wins = d.results.filter((entry) => entry.won).length;
    if (d.results.length >= 3 && wins === d.results.length) {
      items.push({
        kind: "streak",
        text: `球队开局 ${wins} 连胜，势头正盛。`,
        textEn: `The team has opened ${wins}-0 — the momentum is real.`,
        gameIndex: report.game,
      });
    }
    if (report.corePts >= 30) {
      items.push({
        kind: "core",
        text: `核心本场砍下 ${report.corePts} 分。`,
        textEn: `The core dropped ${report.corePts} points tonight.`,
        gameIndex: report.game,
      });
    }
    if ((report.game + 1) % 4 === 0) {
      const week = Math.floor((report.game + 1) / 4) + 1;
      items.push({
        kind: "week",
        text: `第 ${week} 周开始。`,
        textEn: `Week ${week} begins.`,
        gameIndex: report.game,
      });
    }
    return items;
  }

  /** The timeline's playOne: one real game, demo updated, context built. */
  async function playOne() {
    const d = demo();
    const report = await playDemoGame(d, rows);
    if (!report) return null;
    d.results.push({ game: report.game, opp: report.opp, home: report.home, won: report.won, score: report.score });
    d.coreLog.push({ game: report.game, pts: report.corePts, min: report.coreMin });
    d.index += 1;
    if (report.won) d.wins += 1;
    else d.losses += 1;
    return { report: { ...report, news: newsForGame(report) }, context: demoContext() };
  }

  async function runTimeline(speed) {
    if (busy || !demo()) return;
    busy = true;
    lastResult = null;
    lastStop = null;
    render();
    const startIndex = demo().index;
    const trustBefore = slice.state.trust;
    const account = getAccount();
    const out = await advanceTimeline(slice.inbox, slice.state, {
      playOne,
      speed,
      gameIndex: startIndex,
      gamesTotal: INBOX_SEASON_GAMES,
      onGame: () => {},
      account,
    });
    // The engine mirrors settled promises into the account's legacy record.
    if (account && out.stoppedAt?.type === "promise") {
      try { saveAccount(account); } catch { /* guests have no account store */ }
    }
    // The timeline worked on copies; the demo advanced for real inside
    // playOne. Take the timeline's inbox/state back, fold the per-game
    // news in, and persist once.
    let nextInbox = out.inbox;
    for (const report of out.reports) {
      for (const item of report.news || []) {
        nextInbox = recordNews(nextInbox, { ...item, year: INBOX_SEASON_YEAR });
      }
    }
    slice.inbox = nextInbox;
    slice.state = out.state;
    lastStop = out.stoppedAt;
    lastRun = {
      reports: out.reports,
      wins: out.reports.filter((r) => r.won).length,
      trustBefore,
      trustAfter: slice.state.trust,
    };
    busy = false;
    persist();
    render();
  }

  function decide(eventId, choiceId) {
    if (busy) return;
    const out = applyDecision(slice.inbox, slice.state, eventId, choiceId, {
      gameIndex: demo() ? demo().index : 0,
      year: INBOX_SEASON_YEAR,
    });
    slice.inbox = out.inbox;
    slice.state = out.state;
    lastResult = out.result;
    lastStop = null;
    persist();
    render();
  }

  function startDemo(teamId) {
    const cards = rosterCards(rows, teamId, INBOX_SEASON_YEAR);
    const core = cards.length ? cards[0] : null;
    const season = buildSeason({ startYear: 1996, player: { teamId } }, rows);
    slice.teamId = teamId;
    slice.inbox.teamId = teamId;
    slice.demo = {
      teamId,
      seed: `inbox-demo|${teamId}`,
      games: season.games,
      index: 0,
      wins: 0,
      losses: 0,
      coreId: core ? core.id : null,
      coreLog: [],
      results: [],
    };
    persist();
    // Screen once on the fresh state so week-1 facts (if any) show up.
    const screened = screenInboxEvents(slice.inbox, demoContext());
    if (screened.length) slice.inbox = queueInboxEvents(slice.inbox, screened);
    persist();
    render();
  }

  function teamOptions() {
    const season = historicalSeason(INBOX_SEASON_YEAR);
    const teams = (season?.teams || []).map((team) => ({ id: team.id, name: team.name }));
    return teams.length ? teams : [{ id: "CHI", name: "公牛" }];
  }

  function render() {
    const body = el.querySelector("#career-inbox-body");
    const l = lang();
    const summary = inboxSummary(slice.inbox);
    const d = demo();
    const core = coreCard();
    const done = d ? d.index >= INBOX_SEASON_GAMES : false;
    const target = d && !done ? nextTimelineTarget({ gameIndex: d.index, gamesTotal: INBOX_SEASON_GAMES }) : null;
    const targetLabel = target ? describeTimelineTarget(target, l) : null;
    const promises = openPromises(slice.inbox);
    const pending = pendingInboxEvents(slice.inbox);
    const history = (slice.inbox.history || []).slice(-10).reverse();
    const news = (slice.inbox.news || []).slice(-10).reverse();
    const sum = careerSummary(slice.inbox, slice.state, {
      wins: d?.wins || 0,
      losses: d?.losses || 0,
      games: d ? d.index : 0,
    });

    const header = `<section><h3>CAREER HUB · 1996–97</h3>`
      + `<p>${L("你的篮球世界正在发生变化", "Your basketball world is changing", l)}</p>`
      + `<p>${L("待处理", "Pending", l)} ${summary.pending}（${L("紧急", "urgent", l)} ${summary.urgent}）· ${L("未读新闻", "Unread news", l)} ${summary.unreadNews} · ${L("进行中的承诺", "Open promises", l)} ${summary.openPromises}</p>`
      + `<p>${L("信任", "Trust", l)} ${slice.state.trust} / 100 · ${L("媒体压力", "Media pressure", l)} ${slice.state.mediaPressure} · ${L("时间线偏离", "Timeline divergence", l)} ${slice.state.divergence}</p>`
      + (d
        ? `<p>${d.teamId} · ${L("第", "Game ", l)}${Math.min(d.index + 1, INBOX_SEASON_GAMES)}/${INBOX_SEASON_GAMES}${L(" 场", "", l)} · ${d.wins}${L("胜", "W", l)}${d.losses}${L("负", "L", l)}${core ? ` · ${L("核心", "Core", l)} ${core.name}（OVR ${overall(core)}）` : ""}</p>`
        : "")
      + `</section>`;

    const picker = !d
      ? `<section><h3>${L("选一支球队，开始 1996–97 赛季", "Pick a team to start the 1996–97 season", l)}</h3>`
        + `<p>${L("演示赛季：真实赛程、真实比赛（GameSim），收件箱事件由真实状态驱动。", "Demo season: real schedule, real games (GameSim); inbox events are driven by real state.", l)}</p>`
        + `<select id="inbox-team-pick">${teamOptions().map((team) => `<option value="${team.id}">${team.name} · ${team.id}</option>`).join("")}</select> `
        + `<button type="button" data-start-demo="1">${L("开始赛季", "Start season", l)}</button></section>`
      : "";

    const timeline = d && !done
      ? `<section><h3>${L("推进时间", "Advance time", l)}</h3>`
        + `<button type="button" data-run="next-game" ${busy ? "disabled" : ""}>${L("下一场比赛", "Next game", l)}</button> `
        + `<button type="button" data-run="next-event" ${busy ? "disabled" : ""}>${L("下一重要事件", "Next important event", l)}</button> `
        + `<button type="button" data-run="next-key-node" ${busy ? "disabled" : ""}>${targetLabel || L("下一赛季关键节点", "Next season key node", l)}</button>`
        + (lastStop ? `<p>${describeTimelineStop(lastStop, l)}</p>` : "")
        + (lastRun
          ? `<p>${L("模拟了", "Simmed ", l)}${lastRun.reports.length}${L(" 场", " games", l)} · ${lastRun.wins}${L("胜", "W", l)}${lastRun.reports.length - lastRun.wins}${L("负", "L", l)} · ${L("信任", "Trust", l)} ${lastRun.trustBefore} → ${lastRun.trustAfter}</p>`
          : "")
        + `</section>`
      : d && done
        ? `<section><p>${L("赛季打完了。", "The season is over.", l)}</p></section>`
        : "";

    const result = lastResult
      ? `<section><h3>${L("决定已记录", "Decision recorded", l)}</h3><p>${l === "en" ? lastResult.reasonEn : lastResult.reason}</p>`
        + lastResult.followUp.map((f) => `<p>${l === "en" ? f.textEn : f.text}</p>`).join("")
        + `</section>`
      : "";

    const pendingHtml = pending.length
      ? `<section><h3>${L("待处理事件", "Pending events", l)}</h3>${pending.map((instance) => {
        const localized = localizeInboxEvent(instance, l);
        // Choices come from the definition; look them up by event id.
        const def = pendingDefinition(instance.eventId);
        const facts = instance.facts || {};
        const factsLine = [
          facts.coreName ? `${L("核心", "Core", l)} ${facts.coreName}（${L("上场", "last game", l)} ${facts.coreLastPts ?? "—"} ${L("分，赛季场均", "pts, season avg", l)} ${facts.coreAvgPts != null ? Math.round(facts.coreAvgPts * 10) / 10 : "—"}）` : "",
          facts.losingStreak ? `${facts.losingStreak} ${L("连败", "game losing streak", l)}` : "",
          facts.prospect ? `${L("球探目标", "Scout target", l)} ${facts.prospect.name}（${facts.prospect.pos} · OVR ${facts.prospect.ovr} · ${L("评估", "estimate", l)} ${facts.prospect.estimate}）` : "",
          facts.veteran ? `${L("老将", "Veteran", l)} ${facts.veteran.name}（${facts.veteran.age} ${L("岁", "yrs", l)} · OVR ${facts.veteran.ovr}）` : "",
          facts.contenderName ? `${L("对方", "Suitor", l)} ${facts.contenderName}` : "",
        ].filter(Boolean).join(" · ");
        return `<article><h4>${instance.urgency === "urgent" ? "❗ " : ""}${localized.title}</h4>`
          + `<p>${localized.prompt}</p>`
          + (factsLine ? `<p>${factsLine}</p>` : "")
          + `<div>${(def.choices || []).map((choice) => {
            const c = localizeInboxChoice(choice, l);
            return `<button type="button" data-decide="${instance.eventId}:${choice.id}">${c.label}</button>`;
          }).join(" ")}</div>`
          + `<div>${(def.choices || []).map((choice) => {
            const c = localizeInboxChoice(choice, l);
            return `<p><b>${c.label}</b>：${c.description}<br>${L("后果", "Consequence", l)}：${c.consequence}</p>`;
          }).join("")}</div></article>`;
      }).join("")}</section>`
      : `<section><p>${L("暂无待处理事件——推进时间，事件会从真实状态中出现。", "No pending events — advance time and events will emerge from real state.", l)}</p></section>`;

    const promisesHtml = promises.length
      ? `<section><h3>${L("进行中的承诺", "Open promises", l)}</h3>${promises.map((p) => `<p>${l === "en" ? p.textEn : p.text} · ${L("第", "due after game ", l)}${p.dueGame + 1}${L(" 场后检查", "", l)}</p>`).join("")}</section>`
      : "";

    const newsHtml = news.length
      ? `<section><h3>${L("联盟动态", "League news", l)}</h3>${news.map((item) => `<p>${item.read ? "" : "● "}${l === "en" ? item.textEn : item.text}</p>`).join("")}</section>`
      : "";

    const historyHtml = history.length
      ? `<section><h3>${L("生涯记录", "Career record", l)}</h3>${history.map((entry) => `<p>${describeHistoryEntry(entry, l)}</p>`).join("")}`
        + `<p>${L("决定", "Decisions", l)} ${sum.choices} · ${L("承诺兑现", "Promises kept", l)} ${sum.promisesKept} · ${L("违约", "broken", l)} ${sum.promisesBroken} · ${L("时间线偏离", "Divergence", l)} ${sum.divergence}</p></section>`
      : "";

    body.innerHTML = header + picker + timeline + result + pendingHtml + promisesHtml + newsHtml + historyHtml;

    body.querySelector("[data-start-demo]")?.addEventListener("click", () => {
      const pick = body.querySelector("#inbox-team-pick");
      startDemo(pick ? pick.value : "CHI");
    });
    body.querySelectorAll("[data-run]").forEach((button) => {
      button.addEventListener("click", () => runTimeline(button.getAttribute("data-run")));
    });
    body.querySelectorAll("[data-decide]").forEach((button) => {
      button.addEventListener("click", () => {
        const [eventId, choiceId] = button.getAttribute("data-decide").split(":");
        decide(eventId, choiceId);
      });
    });
  }

  // The definition lookup for rendering choices (the pending instance
  // carries facts, not the choice list — the definition owns the list).
  function pendingDefinition(eventId) {
    return INBOX_EVENTS.find((event) => event.id === eventId) || { choices: [] };
  }

  return {
    async open() {
      el = ensureInboxScreen();
      el.querySelector("#btn-career-inbox-back")?.addEventListener("click", () => goBack());
      rows = await loadRows();
      loadSlice();
      render();
      show("careerInbox");
    },
  };
}
