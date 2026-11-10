/**
 * Workstream G — Basketball Career Network: views for the three playable
 * slices (Scout / Video Analyst / Analytics Specialist) plus the Career
 * Opportunity board.
 *
 * Mount pattern follows js/ui/reborn/rebornView.js: one screen element,
 * created once; the view factory takes its dependencies in
 * ({ getLang, getRows, getAccountId }) so tests can inject rows without
 * the browser. Pure HTML builders are exported for node tests; only
 * open()/event handlers touch the DOM.
 *
 * Persistence for the slice is a namespaced localStorage store
 * (`cl-network-v1`, account-scoped where an account exists) — the same
 * guest-progression pattern as GUEST_AXP_KEY. The career root is NOT
 * touched: moving the network profile into root.* is an integration
 * follow-up once workstreams A (inbox) and E (relationships) land.
 * i18n uses the local L() helper like rebornView (no i18n-phrases.js
 * edits, so no conflicts with the other Career 2.0 workstreams).
 */
import {
  prospectPool, scoutReportFor, developmentReport, gradeScoutRecommendation,
  scoreScoutClass, pickProspects, DEVELOPMENT_TIER_LABEL,
} from "../career/network/scoutCareer.js";
import {
  collectPossessionLog, buildTeamFromRows, buildFilmChallenge,
  gradeFilmAnswer, filmRecommendation, fileFilmRecommendation,
} from "../career/network/videoAnalyst.js";
import {
  buildAnalyticsChallenge, gradeAnalyticsAnswer, findUndervalued,
  contractValueReport,
} from "../career/network/analyticsSpecialist.js";
import {
  NETWORK_ROLES, ENTRY_ROLES, emptyNetworkProfile, generateOpportunities,
  acceptOpportunity, dismissalOutcome, recordSliceResult, reputationStanding,
} from "../career/network/careerOpportunities.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);
const STORE_PREFIX = "cl-network-v1";

let ROWS_CACHE = null;
async function loadRows() {
  if (ROWS_CACHE) return ROWS_CACHE;
  const res = await fetch("./js/data/roster.json");
  const data = await res.json();
  ROWS_CACHE = data.players || [];
  return ROWS_CACHE;
}

export function ensureNetworkScreen() {
  let el = document.querySelector("#screen-network");
  if (el) return el;
  el = document.createElement("main");
  el.id = "screen-network";
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-network-back" type="button"><span>返回</span></button><h2>篮球职业网络 · Career Network</h2></div><div id="network-body"></div>`;
  document.body.appendChild(el);
  return el;
}

function storeKey(kind, accountId) {
  return `${STORE_PREFIX}:${kind}:${accountId || "guest"}`;
}

function readStore(kind, accountId, fallback) {
  try {
    const raw = localStorage.getItem(storeKey(kind, accountId));
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function writeStore(kind, accountId, value) {
  try { localStorage.setItem(storeKey(kind, accountId), JSON.stringify(value)); } catch { /* storage may refuse; the slice still works in-session */ }
}

/* ------------------------------------------------------------------ */
/* Pure render helpers (node-testable)                                 */
/* ------------------------------------------------------------------ */

export function scoutProspectHtml({ report, lang = "zh" } = {}) {
  const [lo, hi] = report.potentialRange || ["?", "?"];
  return `<div class="nw-card" data-bref="${report.bref}">
    <div class="nw-name">${report.name} · ${report.pos} · ${report.team}</div>
    <div class="nw-line">${L("当前实力", "Current", lang)}: ${report.currentGrade} &nbsp; ${L("潜力预测", "Potential", lang)}: ${lo}–${hi} &nbsp; ${L("情报可信度", "Confidence", lang)}: ${report.confidence}%</div>
    <div class="nw-line">${L("已观察", "Observed", lang)}: ${report.sampleSize.gp}${L("场", " gp", lang)} · ${report.sampleSize.mpg}${L("分钟", " mpg", lang)} · ${report.observed.ppg}${L("分", " pts", lang)} · ${report.observed.fg ? `${Math.round(report.observed.fg * 100)}% FG` : ""}</div>
    <div class="nw-actions"><button type="button" class="btn small primary" data-scout-rec="1" data-bref="${report.bref}">${L("推荐选秀", "Recommend", lang)}</button>
    <button type="button" class="btn small" data-scout-rec="0" data-bref="${report.bref}">${L("放弃", "Pass", lang)}</button></div>
  </div>`;
}

export function scoutRevealHtml({ graded, total, lang = "zh" } = {}) {
  const rows = (graded || []).map((g) => {
    const tier = DEVELOPMENT_TIER_LABEL[g.report.tier] || {};
    return `<div class="nw-line">${g.report.name} — ${L("实际发展", "Actually became", lang)}: ${tier[lang === "en" ? "en" : "zh"] || g.report.tier} · ${L("三年后最高", "Peak in 3 yrs", lang)}: ${g.report.peakPpg ?? "—"}${L("分", " pts", lang)} · ${L("判定", "Verdict", lang)}: ${g.verdict} (${g.points > 0 ? "+" : ""}${g.points})</div>`;
  }).join("");
  return `<div class="nw-reveal"><h3>${L("三年后：你的判断得到了验证", "Three years later: your calls, verified", lang)}</h3>${rows}
  <div class="nw-total">${L("本届球探评分", "Scout class score", lang)}: ${total.total} (${L("命中", "hits", lang)} ${total.hits} · ${L("错失", "misses", lang)} ${total.misses})</div>
  <p class="tiny">${L("这是原始时间线的真实发展——在你自己的时间线里，结局可能不同。", "This is the original timeline's real development — in your own timeline it could differ.", lang)}</p></div>`;
}

export function filmStripHtml({ strip, lang = "zh" } = {}) {
  const rows = (strip || []).map((p) => {
    const pts = (p.points?.home || 0) + (p.points?.away || 0);
    const shots = (p.shots || []).map((s) => `${s.made ? "✓" : "✗"}${s.pts}`).join(" ");
    return `<div class="nw-line">Q${p.quarter} ${p.clock ?? ""} · ${p.side === "home" ? L("主队", "Home", lang) : L("客队", "Away", lang)} · +${pts}${L("分", " pts", lang)} ${shots}</div>`;
  }).join("");
  return `<div class="nw-strip">${rows || `<div class="nw-line">${L("暂无回合记录", "No possessions recorded", lang)}</div>`}</div>`;
}

export function filmChallengeHtml({ challenge, lang = "zh" } = {}) {
  const opts = (challenge?.options || []).map((o) => `<button type="button" class="btn nw-opt" data-film-opt="${o.id}">
    <b>${o.titleZh}</b><span>${o.summaryZh}</span></button>`).join("");
  return `<div class="nw-challenge"><h3>${L("找出对手最大的弱点", "Find the opponent's biggest weakness", lang)}</h3>
  <p class="tiny">${challenge.gameLabel} · ${L("最终比分", "Final", lang)} ${challenge.finalScore?.home ?? "?"}–${challenge.finalScore?.away ?? "?"}</p>
  ${filmStripHtml({ strip: challenge.strip, lang })}
  <div class="nw-opts">${opts}</div></div>`;
}

export function analyticsChallengeHtml({ challenge, lang = "zh" } = {}) {
  const opts = (challenge?.options || []).map((o) => `<button type="button" class="btn nw-opt" data-analytics-opt="${o.id}">
    <b>${o.name} · ${o.pos} · ${o.team}</b>
    <span>OVR ${o.ovr} · ¤${o.price} · ${o.stats.ppg}${L("分", " pts", lang)} · ${(o.stats.fg * 100).toFixed(0)}% FG · ${o.stats.mpg}${L("分钟", " min", lang)}</span></button>`).join("");
  return `<div class="nw-challenge"><h3>${L("谁是被低估的球员？", "Who is the most undervalued player?", lang)}</h3>
  <p class="tiny">${L("只看数字：每单位身价的产出最高者获胜。", "Read the numbers: the most production per unit of price wins.", lang)}</p>
  <div class="nw-opts">${opts}</div></div>`;
}

export function networkBoardHtml({ profile, offers, unemployedNote, lang = "zh" } = {}) {
  const standing = reputationStanding(profile.reputation);
  const role = NETWORK_ROLES[profile.currentRole];
  const rows = (offers || []).map((o) => `<div class="nw-line">${o.team ? `${o.team} · ` : ""}${o.titleZh} (${o.level})
    ${o.eligible
      ? `<button type="button" class="btn small primary" data-network-accept="${o.id}">${L("接受", "Accept", lang)}</button>`
      : `<span class="tiny">${L("未达标", "Not eligible", lang)}: ${(o.missing || []).join(", ")}</span>`}</div>`).join("");
  return `<div class="nw-profile"><h3>${L("我的职业", "My career", lang)}</h3>
  <div class="nw-line">${L("当前职位", "Current role", lang)}: ${role ? role.labelZh : profile.currentRole}${profile.team ? ` · ${profile.team}` : ""}</div>
  <div class="nw-line">${L("声望", "Reputation", lang)}: ${profile.reputation}（${standing.labelZh}）· ${L("经验", "Experience", lang)}: ${profile.experienceSeasons}${L("季", " seasons", lang)}</div>
  <div class="nw-line">${L("判断记录", "Judgment record", lang)}: ${L("录像", "Film", lang)} ${profile.decisions?.filmCorrect || 0}/${profile.decisions?.filmTotal || 0} · ${L("球探", "Scout", lang)} ${profile.decisions?.scoutHits || 0}/${profile.decisions?.scoutTotal || 0} · ${L("分析验证", "Analytics verified", lang)} ${profile.decisions?.analyticsVerified || 0}</div>
  ${profile.unemployed ? `<div class="nw-line">${L("状态：失业中", "Status: unemployed", lang)}</div>` : ""}
  ${unemployedNote ? `<p class="tiny">${unemployedNote}</p>` : ""}</div>
  <div class="nw-board"><h3>${L("职业机会", "Career opportunities", lang)}</h3>${rows || `<p class="tiny">${L("暂无职位空缺", "No openings right now", lang)}</p>`}</div>`;
}

/** Demo job board for the slice. Real season-state openings are an A/E integration follow-up. */
export const DEMO_JOB_BOARD = Object.freeze([
  { id: "scout-lal", role: "scout", team: "LAL", level: "staff", requirements: {} },
  { id: "video-chi", role: "videoAnalyst", team: "CHI", level: "staff", requirements: {} },
  { id: "analytics-bos", role: "analytics", team: "BOS", level: "staff", requirements: {} },
  { id: "asst-chi", role: "assistantCoach", team: "CHI", level: "staff", requirements: { minReputation: 45, minExperience: 2 } },
  { id: "hc-van", role: "headCoach", team: "VAN", level: "head", requirements: { minReputation: 70, minExperience: 5, fromRole: "assistantCoach" } },
  { id: "gm-tor", role: "gm", team: "TOR", level: "executive", requirements: { minReputation: 75, minExperience: 6 } },
]);

/* ------------------------------------------------------------------ */
/* View factory                                                        */
/* ------------------------------------------------------------------ */

export function createNetworkView({ getLang, getRows = loadRows, getAccountId = () => null, show, goBack } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  const accountId = () => (typeof getAccountId === "function" ? getAccountId() : null);
  let screen = null;
  let body = null;

  const profile = () => readStore("profile", accountId(), emptyNetworkProfile({}));
  const saveProfile = (p) => writeStore("profile", accountId(), p);

  function mount() {
    screen = ensureNetworkScreen();
    body = screen.querySelector("#network-body");
    if (!screen.dataset.backWired) {
      screen.dataset.backWired = "1";
      screen.querySelector("#btn-network-back")?.addEventListener("click", () => {
        if (typeof goBack === "function") goBack();
        else if (typeof show === "function") show("home");
      });
    }
    return body;
  }

  function homeHtml() {
    return `<div class="nw-home">
      <p>${L("从篮球行业的底层开始，让你自己决定最终成为谁。", "Start at the bottom of the basketball industry — and decide for yourself who you become.", lang())}</p>
      <div class="nw-opts">
        <button type="button" class="btn primary" data-nw-open="scout">${L("球探：发现下一个传奇", "Scout: discover the next legend", lang())}</button>
        <button type="button" class="btn primary" data-nw-open="film">${L("录像分析：找出对手弱点", "Video analyst: find the opponent's weakness", lang())}</button>
        <button type="button" class="btn primary" data-nw-open="analytics">${L("数据分析：发现被低估的球员", "Analytics: find the undervalued player", lang())}</button>
        <button type="button" class="btn primary" data-nw-open="board">${L("职业机会", "Career opportunities", lang())}</button>
      </div>
      <p class="tiny">${L("球探看重未来潜力，数据分析看重已有证据——两种玩法的数据基础不同，体验也不同。", "Scouting bets on future potential; analytics reads past evidence — different data, different feel.", lang())}</p>
    </div>`;
  }

  async function openScout({ season = 1997, seed = 7 } = {}) {
    const rows = await getRows();
    const pool = prospectPool(rows, season);
    const picked = pickProspects(pool, 5, seed);
    const reports = picked.map((p) => scoutReportFor(p, rows, { seed: seed + 1 }));
    const decisions = new Map();
    body.innerHTML = `<h3>${L("球探考察", "Scout evaluation", lang())} · ${season - 1}–${String(season).slice(2)}${L("选秀", " draft", lang())}</h3>
      <p class="tiny">${L("考察 5 名新人：根据球探报告决定推荐或放弃。三年后看真实发展。", "Evaluate 5 prospects: recommend or pass from the scout report. See the real development three years later.", lang())}</p>
      ${reports.map((r) => scoutProspectHtml({ report: r, lang: lang() })).join("")}
      <button type="button" class="btn primary" id="btn-scout-reveal" disabled>${L("三年后揭晓", "Reveal in three years", lang())}</button>
      <div id="scout-result"></div>`;
    const revealBtn = body.querySelector("#btn-scout-reveal");
    body.querySelectorAll("[data-scout-rec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        decisions.set(btn.dataset.bref, btn.dataset.scoutRec === "1");
        btn.closest(".nw-card").querySelectorAll("[data-scout-rec]").forEach((b) => { b.disabled = true; });
        if (decisions.size >= reports.length) revealBtn.disabled = false;
      });
    });
    revealBtn.addEventListener("click", () => {
      const graded = reports.map((report) => {
        const prospect = picked.find((p) => p.row.bref === report.bref);
        const dev = developmentReport(prospect, rows, { years: 3 });
        const g = gradeScoutRecommendation({ recommended: decisions.get(report.bref) === true, pickCost: "mid", report: dev });
        return { ...g, report: dev };
      });
      const total = scoreScoutClass(graded);
      body.querySelector("#scout-result").innerHTML = scoutRevealHtml({ graded, total, lang: lang() });
      // Fold the outcome into the network profile (scout hits build reputation).
      let p = profile();
      for (const g of graded) {
        const correct = g.verdict.startsWith("hit-") || g.verdict === "correct-pass";
        p = recordSliceResult(p, { kind: "scout", correct });
      }
      saveProfile(p);
      writeStore("scout-last", accountId(), { season, graded, total, at: Date.now() });
    });
  }

  async function openFilm({ seed = 11 } = {}) {
    const rows = await getRows();
    body.innerHTML = `<p>${L("正在模拟一场比赛，生成真实回合记录…", "Simulating a game to build a real possession log…", lang())}</p>`;
    const home = buildTeamFromRows(rows, "CHI", 1997);
    const away = buildTeamFromRows(rows, "UTA", 1997);
    const log = collectPossessionLog({ home, away, seed });
    const challenge = buildFilmChallenge(log, { seed, focusSide: "away" });
    if (!challenge) {
      body.innerHTML = `<p>${L("这场比赛没有产生足够的录像发现，换个种子再试一次。", "This game produced too few film findings — try another seed.", lang())}</p>`;
      return;
    }
    body.innerHTML = filmChallengeHtml({ challenge, lang: lang() }) + `<div id="film-result"></div>`;
    body.querySelectorAll("[data-film-opt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const grade = gradeFilmAnswer(challenge, btn.dataset.filmOpt);
        const rec = filmRecommendation(challenge, btn.dataset.filmOpt);
        // [Career 2.0 integration] File it so the coach challenge can
        // actually read it this session — the "filed to the head coach"
        // line below is now backed by the handoff, not just words.
        fileFilmRecommendation(rec);
        body.querySelector("#film-result").innerHTML = `<div class="nw-reveal"><p>${grade.explanationZh}</p>
          <p class="tiny">${L("已提交给主教练的建议", "Recommendation filed to the head coach", lang())}: ${rec.suggestionZh}（${L("可信度", "confidence", lang)}: ${rec.confidence}）</p>
          <p class="tiny">${L("声望变化", "Reputation", lang)}: ${grade.reputationDelta > 0 ? "+" : ""}${grade.reputationDelta}</p></div>`;
        let p = profile();
        p = recordSliceResult(p, { kind: "film", correct: grade.correct });
        saveProfile(p);
      });
    });
  }

  async function openAnalytics({ season = 1997, seed = 3 } = {}) {
    const rows = await getRows();
    const challenge = buildAnalyticsChallenge(rows, { season, seed });
    const board = findUndervalued(rows, { season, minGp: 20, limit: 5 });
    const boardHtml = board.map((b) => `<div class="nw-line">${b.row.name} · ${b.row.pos} · ${b.row.team} — ${L("价值比", "Value ratio", lang())} ${b.valueRatio} · OVR ${b.ovr} · ¤${b.price}</div>`).join("");
    if (!challenge) {
      body.innerHTML = `<p>${L("该赛季数据不足，无法生成挑战。", "Not enough data in this season to build the challenge.", lang())}</p>`;
      return;
    }
    body.innerHTML = analyticsChallengeHtml({ challenge, lang: lang() })
      + `<div id="analytics-result"></div><h3>${L("价值榜", "Value board", lang())}</h3>${boardHtml}`;
    body.querySelectorAll("[data-analytics-opt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const grade = gradeAnalyticsAnswer(challenge, btn.dataset.analyticsOpt);
        body.querySelector("#analytics-result").innerHTML = `<div class="nw-reveal"><p>${grade.explanationZh}</p>
          <p class="tiny">${L("声望变化", "Reputation", lang)}: ${grade.reputationDelta > 0 ? "+" : ""}${grade.reputationDelta}</p></div>`;
        let p = profile();
        p = recordSliceResult(p, { kind: "analytics", correct: grade.correct });
        saveProfile(p);
      });
    });
  }

  function openBoard() {
    const p = profile();
    const { offers, unemployedNote } = generateOpportunities(p, DEMO_JOB_BOARD, { seed: 5 });
    body.innerHTML = networkBoardHtml({ profile: p, offers, unemployedNote, lang: lang() })
      + `<div class="nw-actions"><button type="button" class="btn" id="btn-network-fired">${L("模拟：被解雇", "Simulate: get fired", lang())}</button></div><div id="network-result"></div>`;
    body.querySelectorAll("[data-network-accept]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const offer = offers.find((o) => o.id === btn.dataset.networkAccept);
        if (!offer) return;
        const { profile: next, transition } = acceptOpportunity(p, offer, { year: 1997 });
        saveProfile(next);
        body.querySelector("#network-result").innerHTML = `<p>${L("已接受", "Accepted", lang())}: ${transition.to} · ${transition.toTeam || ""}</p>`;
        openBoard();
      });
    });
    body.querySelector("#btn-network-fired")?.addEventListener("click", () => {
      const { profile: next, noteZh } = dismissalOutcome(p, { reason: "fired", year: 1997 });
      saveProfile(next);
      body.querySelector("#network-result").innerHTML = `<p>${noteZh}</p>`;
      openBoard();
    });
  }

  function open(which = "home") {
    mount();
    if (typeof show === "function") show("network");
    if (which === "scout") openScout();
    else if (which === "film") openFilm();
    else if (which === "analytics") openAnalytics();
    else if (which === "board") openBoard();
    else {
      body.innerHTML = homeHtml();
      body.querySelectorAll("[data-nw-open]").forEach((btn) => {
        btn.addEventListener("click", () => open(btn.dataset.nwOpen));
      });
    }
  }

  return { open, openScout, openFilm, openAnalytics, openBoard, profile, saveProfile };
}
