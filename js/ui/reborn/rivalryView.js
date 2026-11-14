/**
 * Player Reborn rivalry surfaces (Career 2.0 decision 2): the pre-game
 * rivalry card, the rivals list with head-to-head, the post-game rivalry
 * lines + challenge buttons, and the timeline line. Pure HTML builders; the
 * Reborn view owns state and clicks. Nothing here promises a rating or
 * shooting edge, because there is none.
 */
import {
  RIVALRY_TAKEOVER_WINDOW,
  challengeCandidates,
  headToHead,
  rivalryLedger,
  rivalsOnRoster,
} from "../../reborn/rivalry.js";
import { rosterCards } from "../../reborn/season.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);
const nameOf = (r, lang) => (lang === "en" ? r.nameEn || r.name : r.name);
const record = (r, lang) => {
  const h = headToHead(r);
  return L(`交手 ${h.meetings} 次 · ${h.wins}胜${h.losses}负`, `${h.meetings} meetings · ${h.wins}-${h.losses}`, lang);
};

const ORIGIN = {
  auto: ["屡次交锋", "Repeated battles"],
  story: ["剧情引爆", "Story beat"],
  challenge: ["你下的战书", "Your challenge"],
};

/** The pre-game line: why tonight is personal. */
function pregameLine(rival, lang) {
  const n = nameOf(rival, lang);
  if (rival.reason === "taunt") return L(`上次输球后，${n} 在采访里说你"还嫩"。`, `After the last loss, ${n} told reporters you're "still green".`, lang);
  if (rival.reason === "clutch") return L(`上一次关键回合，你和 ${n} 正面对上了。`, `Last time it came down to you and ${n} in the clutch.`, lang);
  if (rival.reason === "challenge") return L(`这是你自己向 ${n} 下的战书。`, `You called out ${n} yourself.`, lang);
  return L(`又是 ${n}。你们已经很熟悉彼此了。`, `${n} again. You know each other's game by now.`, lang);
}

/** Pre-game card when a rival is on the next opponent's roster ("" otherwise). */
export function rivalryPregameHtml({ reborn, rows, nextGame, year, lang = "zh" } = {}) {
  if (!nextGame || !reborn) return "";
  const teamId = reborn.player.teamId;
  const oppId = nextGame.homeId === teamId ? nextGame.awayId : nextGame.homeId;
  const rivals = rivalsOnRoster(rivalryLedger(reborn), rosterCards(rows, oppId, year));
  if (!rivals.length) return "";
  const minutes = RIVALRY_TAKEOVER_WINDOW.clock / 60;
  const lines = rivals.map((r) => `<p><strong>${nameOf(r, lang)}</strong> · ${record(r, lang)}</p><p>${pregameLine(r, lang)}</p>`);
  return `<section class="reborn-rivalry-pregame" data-testid="rivalry-pregame"><h3>${L("宿敌对决", "Rivalry game", lang)}</h3>${lines.join("")}`
    + `<p class="tiny">${L(`关键回合接管窗口更宽：末节最后 ${minutes} 分钟、分差 ${RIVALRY_TAKEOVER_WINDOW.margin} 分以内。投进与否仍由比赛决定。`, `Wider takeover window: last ${minutes} min of the 4th, within ${RIVALRY_TAKEOVER_WINDOW.margin}. Whether it goes in is still up to the game.`, lang)}</p></section>`;
}

/** Your rivals with their real head-to-head ("" when none yet). */
export function rivalsPanelHtml({ reborn, lang = "zh" } = {}) {
  const rivals = rivalryLedger(reborn).rivals;
  if (!rivals.length) return "";
  const items = rivals.map((r) => `<li>${nameOf(r, lang)}（${r.team || "—"}）· ${L(...(ORIGIN[r.origin] || ORIGIN.auto), lang)} · ${record(r, lang)}</li>`);
  return `<section class="reborn-rivals" data-testid="rivals-panel"><h3>${L("宿敌", "Rivals", lang)}</h3><ul>${items.join("")}</ul></section>`;
}

const FORMED = {
  auto: ["连续几场的正面交锋之后，", "After game after game head to head, "],
  taunt: ["他赛后公开嘲讽了你，", "He mocked you after the game — "],
  clutch: ["关键回合你们正面对决，", "You met him head-on in the clutch — "],
  challenge: ["你向他下了战书，", "You called him out — "],
};

/** Post-game: rivalries born or renewed tonight, and who you could challenge. */
export function rivalryReportHtml({ report, reborn, lang = "zh" } = {}) {
  if (!report?.rivalry) return "";
  const lines = [];
  for (const f of report.rivalry.formed) {
    const lead = FORMED[f.origin === "story" ? f.reason : f.origin] || FORMED.auto;
    lines.push(`<p class="reborn-rivalry-born">${L(...lead, lang)}${L(`${f.name} 成了你的宿敌。`, `${f.nameEn || f.name} is your rival now.`, lang)}</p>`);
  }
  for (const m of report.rivalry.met) {
    lines.push(`<p>${L(`宿敌对决 vs ${m.name}：你 ${m.you.pts} 分，他 ${m.rival.pts} 分，${m.won ? "你赢了" : "你输了"} · 现在 ${m.wins}胜${m.losses}负`, `Rivalry game vs ${m.nameEn || m.name}: you ${m.you.pts}, him ${m.rival.pts}, ${m.won ? "you won" : "you lost"} · now ${m.wins}-${m.losses}`, lang)}</p>`);
  }
  for (const m of report.rivalry.missed || []) {
    const n = nameOf(m, lang);
    lines.push(`<p class="tiny">${m.why === "you-dnp"
      ? L(`${n} 就在对面，但你今晚没有上场——这不算一次交手。`, `${n} was right there, but you didn't get in tonight — not a meeting.`, lang)
      : L(`${n} 今晚没有上场，这场不算宿敌交手。`, `${n} didn't play tonight — not a rivalry meeting.`, lang)}</p>`);
  }
  const candidates = challengeCandidates(rivalryLedger(reborn), report);
  if (candidates.length) {
    const buttons = candidates.map((o) => `<button type="button" data-rival-challenge="${o.bref}">${L(`向 ${o.name} 下战书`, `Challenge ${o.nameEn || o.name}`, lang)}（${o.pts} ${L("分", "pts", lang)}）</button>`);
    lines.push(`<div class="reborn-rival-challenge"><p class="tiny">${L("今晚谁让你不服？", "Who got under your skin tonight?", lang)}</p>${buttons.join("")}</div>`);
  }
  return lines.length ? `<section class="reborn-rivalry" data-testid="rivalry-report">${lines.join("")}</section>` : "";
}

/** One career-timeline line for a rivalry event. */
export function rivalryTimelineLine({ event, lang = "zh" } = {}) {
  const how = L(...(ORIGIN[event.origin] || ORIGIN.auto), lang);
  return `<p>${event.year} ${L("赛季", "season", lang)}：${L(`宿敌诞生 — ${event.name}（${how}）`, `Rivalry born — ${event.nameEn || event.name} (${how})`, lang)}</p>`;
}
