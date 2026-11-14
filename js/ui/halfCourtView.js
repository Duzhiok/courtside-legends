/**
 * Custom 3v3 Half-Court screen (MVP): pick 3 v 3 -> auto-sim -> 2D half-court playback -> result
 * with box score + Retry. Presentation only: the whole game is decided up front by
 * playHalfCourtGame (js/modes/halfCourt3v3.js, the real GameSim underneath); the court just replays
 * its possessions. Nothing is saved and nothing touches the account.
 *
 * Reuses the 时空对决 picker (mountSandbox with min/max 3 and one copy per side) and the Legend
 * Duel court geometry + CSS (css/duel.css `duel-court-*`). Lychee owns the look / responsive pass.
 *
 * QA hook: globalThis.__CLS_3V3_SEED fixes the first game's seed (Retry appends "-r1", "-r2"...).
 */
import { mountSandbox } from "./sandboxView.js";
import { HALF_COURT_RULES, halfCourtTeamTotals, playHalfCourtGame } from "../modes/halfCourt3v3.js";
import { hashSeed } from "../core/seededRandom.js";

const RIM = { x: 50, y: 4 };
/** Three-out spots beyond the 24-unit arc (viewBox 0 0 100 50). */
const SPOTS = [
  { x: 50, y: 33 },
  { x: 22, y: 21 },
  { x: 78, y: 21 },
];
const PLAY_MS = 420;

function courtSvg(label) {
  return `<svg class="hc-court" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label}">
    <rect x="2" y="0" width="96" height="50" class="duel-court-floor" />
    <rect x="2" y="0" width="96" height="50" class="duel-court-line" />
    <rect x="38" y="0" width="24" height="14" class="duel-court-line duel-court-paint" />
    <circle cx="50" cy="14" r="6" class="duel-court-line" />
    <path d="M 26,4 A 24,24 0 0 1 74,4" class="duel-court-line" fill="none" />
    <line x1="26" y1="4" x2="26" y2="0" class="duel-court-line" />
    <line x1="74" y1="4" x2="74" y2="0" class="duel-court-line" />
    <line x1="44" y1="2" x2="56" y2="2" class="duel-court-board" />
    <circle cx="50" cy="4" r="1.8" class="duel-court-rim" />
    <g data-hc-shots></g>
    <g data-hc-players></g>
    <circle data-hc-ball r="1.4" cx="50" cy="33" class="hc-ball" />
  </svg>`;
}

/** Deterministic display spot for a shot (zone only comes from the sim; the exact spot is cosmetic). */
export function shotSpot(zone, key) {
  const h = hashSeed(key);
  const angle = Math.PI * (0.08 + ((h % 1000) / 1000) * 0.84);
  const r = zone === "arc" ? 26 + ((h >>> 10) % 5) : 4 + ((h >>> 10) % 15);
  return { x: +(RIM.x - Math.cos(angle) * r).toFixed(1), y: +(RIM.y + Math.sin(angle) * r).toFixed(1) };
}

const toward = (p, t) => ({ x: p.x + (RIM.x - p.x) * t, y: p.y + (RIM.y - p.y) * t });
const initials = (name) => String(name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
const pct = (m, a) => (a ? `${m}/${a}` : "0/0");

export function createHalfCourtScreen({ root, pool, ovrOf, esc, getLang = () => "zh", onBack = () => {} }) {
  let teams = null;
  let result = null;
  let retries = 0;
  let timer = null;
  let baseSeed = null;
  const en = () => getLang() === "en";
  const T = (zh, enText) => (en() ? enText : zh);
  const q = (sel) => root.querySelector(sel);

  function stopPlayback() {
    clearTimeout(timer);
    timer = null;
  }

  function showPanel(name) {
    for (const panel of root.querySelectorAll("[data-hc-panel]")) panel.hidden = panel.dataset.hcPanel !== name;
  }

  function renderPlayers(play) {
    const offense = play ? play.offense : result.plays[0]?.offense || "home";
    const defense = offense === "home" ? "away" : "home";
    const shooterIds = new Set((play?.lines || []).filter((l) => l.kind === "make" || l.kind === "miss").map((l) => l.playerId));
    const marker = (p, pos, side) =>
      `<g class="hc-player hc-${side}${shooterIds.has(p.id) ? " hc-active" : ""}" transform="translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})"><circle r="3.1" /><text y="1.1" text-anchor="middle">${esc(initials(p.name))}</text></g>`;
    q("[data-hc-players]").innerHTML =
      result.box[offense].map((p, i) => marker(p, SPOTS[i], offense)).join("") +
      result.box[defense].map((p, i) => marker(p, toward(SPOTS[i], 0.28), defense)).join("");
  }

  function renderScore(score, play) {
    const n = result.names;
    q("[data-hc-score]").innerHTML = `<span class="hc-team hc-home">${esc(n.home)}</span>
      <strong>${score.home} : ${score.away}</strong>
      <span class="hc-team hc-away">${esc(n.away)}</span>
      <small>${play ? T(`第 ${play.n} 回合 · 进攻用时 ${play.shotClockUsed}/${HALF_COURT_RULES.shotClock} 秒`, `Possession ${play.n} · shot clock ${play.shotClockUsed}/${HALF_COURT_RULES.shotClock}s`) : T(`先到 ${HALF_COURT_RULES.target} 分且领先 2 分获胜`, `First to ${HALF_COURT_RULES.target}, win by 2`)}</small>`;
  }

  function drawPlay(index) {
    const play = result.plays[index];
    renderScore(play.score, play);
    renderPlayers(play);
    const shots = q("[data-hc-shots]");
    const ball = q("[data-hc-ball]");
    play.lines.forEach((line, li) => {
      if (line.kind !== "make" && line.kind !== "miss") return;
      const spot = shotSpot(line.zone, `${result.seed}|${play.n}|${li}`);
      shots.insertAdjacentHTML("beforeend", `<circle cx="${spot.x}" cy="${spot.y}" r="0.9" class="hc-shot hc-${play.offense}${line.kind === "make" ? " hc-made" : ""}" />`);
      ball.setAttribute("cx", line.kind === "make" ? RIM.x : spot.x);
      ball.setAttribute("cy", line.kind === "make" ? RIM.y : spot.y);
    });
    const log = q("[data-hc-log]");
    const items = play.lines.map((l) => `<li>${esc(l.text)}</li>`).join("");
    const clear = play.clear ? `<li class="tiny">${esc(T("球权转换 · 清球到弧外", "Change of possession · clear it beyond the arc"))}</li>` : "";
    log.insertAdjacentHTML("afterbegin", `<li class="hc-poss"><strong>${play.score.home}:${play.score.away}</strong><ul>${items}${clear}</ul></li>`);
    while (log.children.length > 8) log.lastElementChild.remove();
  }

  function playFrom(index) {
    stopPlayback();
    if (index >= result.plays.length) {
      renderResult();
      return;
    }
    drawPlay(index);
    timer = setTimeout(() => playFrom(index + 1), PLAY_MS);
  }

  function boxTable(side) {
    const lines = result.box[side];
    const tot = halfCourtTeamTotals(lines);
    const row = (l, name) => `<tr><th scope="row">${name}</th><td>${l.pts}</td><td>${pct(l.fgm1, l.fga1)}</td><td>${pct(l.fgm2, l.fga2)}</td><td>${pct(l.ftm, l.fta)}</td><td>${l.reb}</td><td>${l.ast}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.tov}</td><td>${l.fatigue ?? ""}</td></tr>`;
    return `<table class="hc-box" aria-label="${esc(result.names[side])}">
      <caption>${esc(result.names[side])}${result.winner === side ? ` · ${T("胜", "W")}` : ""}</caption>
      <thead><tr><th scope="col">${T("球员", "Player")}</th><th scope="col">${T("得分", "PTS")}</th><th scope="col">${T("1分", "1PT")}</th><th scope="col">${T("2分", "2PT")}</th><th scope="col">${T("罚球", "FT")}</th><th scope="col">${T("板", "REB")}</th><th scope="col">${T("助", "AST")}</th><th scope="col">${T("断", "STL")}</th><th scope="col">${T("帽", "BLK")}</th><th scope="col">${T("失", "TOV")}</th><th scope="col">${T("体力消耗", "Fatigue")}</th></tr></thead>
      <tbody>${lines.map((l) => row(l, `${esc(l.name)} <small>${l.season ?? ""} ${esc(l.pos)}</small>`)).join("")}${row({ ...tot, fatigue: "" }, T("合计", "Total"))}</tbody>
    </table>`;
  }

  function renderResult() {
    stopPlayback();
    const { score, winner, names } = result;
    q("[data-hc-result-body]").innerHTML = `
      <p class="hc-final"><strong>${esc(names[winner])}</strong> ${T("获胜", "win")} · ${score.home} : ${score.away}</p>
      <p class="tiny">${T(`共 ${result.possessions} 回合 · 比赛用时约 ${Math.round(result.elapsedSec / 60)} 分钟`, `${result.possessions} possessions · about ${Math.round(result.elapsedSec / 60)} min of play`)}${result.capped ? T(" · 回合上限保护触发，领先方获胜", " · possession cap hit, leader wins") : ""}</p>
      <div class="hc-boxes">${boxTable("home")}${boxTable("away")}</div>
      <p class="tiny">${T("弧内 1 分、弧外 2 分；罚球按半场规则计（弧内犯规 1 罚、弧外犯规 2 罚）。结果不影响账号与存档。", "1 inside the arc, 2 beyond it; free throws follow half-court rules (1 for a foul inside, 2 on an arc shot). Nothing here touches your account or saves.")}</p>`;
    showPanel("result");
  }

  function start(seed) {
    stopPlayback();
    result = playHalfCourtGame({ home: teams.home, away: teams.away, seed, lang: getLang() });
    q("[data-hc-shots]").innerHTML = "";
    q("[data-hc-log]").innerHTML = "";
    renderScore({ home: 0, away: 0 }, null);
    renderPlayers(null);
    showPanel("play");
    timer = setTimeout(() => playFrom(0), PLAY_MS);
    return result;
  }

  function mount() {
    if (root.dataset.hcMounted) return;
    root.dataset.hcMounted = "1";
    q("[data-hc-stage]").innerHTML = `
      <div class="hc-score" data-hc-score aria-live="polite"></div>
      ${courtSvg(T("3v3 半场", "3v3 half-court"))}
      <ol class="hc-log" data-hc-log></ol>`;
    mountSandbox({
      root: q("[data-hc-picker]"),
      pool,
      ovrOf,
      esc,
      lang: getLang(),
      min: HALF_COURT_RULES.teamSize,
      max: HALF_COURT_RULES.teamSize,
      unique: true,
      teamName: (side, lang) => (lang === "en" ? `Half-Court ${side}` : `半场 ${side} 队`),
      startLabel: (lang) => (lang === "en" ? "Tip Off · 3v3" : "开打 · 3v3 半场"),
      onStart: (teamA, teamB) => {
        teams = { home: teamA, away: teamB };
        retries = 0;
        baseSeed = String(globalThis.__CLS_3V3_SEED ?? Date.now().toString(36));
        start(baseSeed);
      },
    });
    root.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-hc-action]");
      if (!btn) return;
      const action = btn.dataset.hcAction;
      if (action === "skip" && result) renderResult();
      else if (action === "retry" && teams) {
        retries += 1;
        start(`${baseSeed}-r${retries}`);
      } else if (action === "repick") {
        stopPlayback();
        showPanel("pick");
      } else if (action === "back") {
        stopPlayback();
        onBack();
      }
    });
  }

  return {
    open() {
      mount();
      stopPlayback();
      showPanel("pick"); // picks persist (mount-once picker); Tip Off plays a fresh game
    },
    setLang(lang) {
      q("[data-hc-picker]")?.__sandboxSetLang?.(lang);
      if (result && !q('[data-hc-panel="result"]').hidden) renderResult();
    },
    dispose: stopPlayback,
    /** Test/QA view of the last game. */
    get lastResult() {
      return result;
    },
  };
}
