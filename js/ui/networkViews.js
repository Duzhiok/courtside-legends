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
  scoreScoutClass, pickProspects, DEVELOPMENT_TIER_LABEL, SCOUT_VERDICT_LABEL,
} from "../career/network/scoutCareer.js";
import {
  collectPossessionLog, buildTeamFromRows, buildFilmChallenge,
  gradeFilmAnswer, filmRecommendation, fileFilmRecommendation,
} from "../career/network/videoAnalyst.js";
import {
  buildAnalyticsChallenge, gradeAnalyticsAnswer, findUndervalued,
} from "../career/network/analyticsSpecialist.js";
import {
  NETWORK_ROLES, emptyNetworkProfile, generateOpportunities,
  acceptOpportunity, dismissalOutcome, recordSliceResult, reputationStanding,
  missingLabel,
} from "../career/network/careerOpportunities.js";
import { mountScreen } from "./screenShell.js";
import { html, raw } from "../core/html.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);
const STORE_PREFIX = "cl-network-v1";

let ROWS_CACHE = null;
async function loadRows() {
  if (ROWS_CACHE) return ROWS_CACHE;
  const { fetchRosterJson } = await import("../data/rosterCache.js");
  const { data } = await fetchRosterJson("./js/data/roster.json");
  ROWS_CACHE = data.players || [];
  return ROWS_CACHE;
}

/** The page title, rendered once by the shell in the current language. */
export const NETWORK_TITLE = Object.freeze({ zh: "篮球职业网络", en: "Career Network" });

/**
 * Mount the Career Network screen on the shared Screen Shell (screenShell.js) —
 * the shell owns the panel head (one back button, one single-language title),
 * the focus/scroll lifecycle and the language switch; this view keeps its own
 * business state and renders into the shell body.
 * Host "app" (the default): the network slices are plain long-form page
 * screens that scroll with the page, as before — nothing about them needs to
 * cover the viewport or scroll on its own, so no overlay behaviour. Mounting
 * moves the screen from document.body into the #app column, like the museum /
 * inbox / coaching / gamble screens before it.
 * The back button used to be wired by the view factory with a backWired flag;
 * that branch is gone — the shell wires it to onBack, so a click can no
 * longer fire goBack twice.
 */
function ensureNetworkScreen({ getLang = () => "zh", onBack, onRelocalize } = {}) {
  return mountScreen({ id: "network", title: NETWORK_TITLE, getLang, onBack, onRelocalize }).el;
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

// Every builder below goes through html``: all data is escaped by default. The exported builders return a
// plain string (their callers and tests concatenate and search it); nested fragments stay html``.
const pick = (lang, zh, en) => (lang === "en" ? en : zh);

export function scoutProspectHtml({ report, lang = "zh" } = {}) {
  const [lo, hi] = report.potentialRange || ["?", "?"];
  const fg = report.observed.fg ? `${Math.round(report.observed.fg * 100)}% FG` : "";
  return html`<div class="nw-card" data-bref="${report.bref}">
    <div class="nw-name">${report.name} · ${report.pos} · ${report.team}</div>
    <div class="nw-line">${L("当前实力", "Current", lang)}: ${report.currentGrade} &nbsp; ${L("潜力预测", "Potential", lang)}: ${lo}–${hi} &nbsp; ${L("情报可信度", "Confidence", lang)}: ${report.confidence}%</div>
    <div class="nw-line">${L("已观察", "Observed", lang)}: ${report.sampleSize.gp}${L("场", " gp", lang)} · ${report.sampleSize.mpg}${L("分钟", " mpg", lang)} · ${report.observed.ppg}${L("分", " pts", lang)} · ${fg}</div>
    <div class="nw-actions"><button type="button" class="btn small primary" data-scout-rec="1" data-bref="${report.bref}">${L("推荐选秀", "Recommend", lang)}</button>
    <button type="button" class="btn small" data-scout-rec="0" data-bref="${report.bref}">${L("放弃", "Pass", lang)}</button></div>
  </div>`.toString();
}

export function scoutRevealHtml({ graded, total, lang = "zh" } = {}) {
  const rows = (graded || []).map((g) => {
    const tier = DEVELOPMENT_TIER_LABEL[g.report.tier] || {};
    const verdict = SCOUT_VERDICT_LABEL[g.verdict] || {};
    const sign = g.points > 0 ? "+" : "";
    return html`<div class="nw-line">${g.report.name} — ${L("实际发展", "Actually became", lang)}: ${tier[lang === "en" ? "en" : "zh"] || g.report.tier} · ${L("三年后最高", "Peak in 3 yrs", lang)}: ${g.report.peakPpg ?? "—"}${L("分", " pts", lang)} · ${L("判定", "Verdict", lang)}: ${verdict[lang === "en" ? "en" : "zh"] || g.verdict} (${sign}${g.points})</div>`;
  });
  return html`<div class="nw-reveal"><h3>${L("三年后：你的判断得到了验证", "Three years later: your calls, verified", lang)}</h3>${rows}
  <div class="nw-total">${L("本届球探评分", "Scout class score", lang)}: ${total.total} (${L("命中", "hits", lang)} ${total.hits} · ${L("错失", "misses", lang)} ${total.misses})</div>
  <p class="tiny">${L("这是原始时间线的真实发展——在你自己的时间线里，结局可能不同。", "This is the original timeline's real development — in your own timeline it could differ.", lang)}</p></div>`.toString();
}

function filmStripHtml({ strip, lang = "zh" } = {}) {
  const rows = (strip || []).map((p) => {
    const pts = (p.points?.home || 0) + (p.points?.away || 0);
    const shots = (p.shots || []).map((s) => `${s.made ? "✓" : "✗"}${s.pts}`).join(" ");
    return html`<div class="nw-line">Q${p.quarter} ${p.clock ?? ""} · ${p.side === "home" ? L("主队", "Home", lang) : L("客队", "Away", lang)} · +${pts}${L("分", " pts", lang)} ${shots}</div>`;
  });
  const empty = html`<div class="nw-line">${L("暂无回合记录", "No possessions recorded", lang)}</div>`;
  return html`<div class="nw-strip">${rows.length ? rows : empty}</div>`;
}

export function filmChallengeHtml({ challenge, lang = "zh" } = {}) {
  const opts = (challenge?.options || []).map((o) => html`<button type="button" class="btn nw-opt" data-film-opt="${o.id}">
    <b>${pick(lang, o.titleZh, o.titleEn || o.titleZh)}</b><span>${pick(lang, o.summaryZh, o.summaryEn || o.summaryZh)}</span></button>`);
  return html`<div class="nw-challenge"><h3>${L("找出对手最大的弱点", "Find the opponent's biggest weakness", lang)}</h3>
  <p class="tiny">${challenge.gameLabel} · ${L("最终比分", "Final", lang)} ${challenge.finalScore?.home ?? "?"}–${challenge.finalScore?.away ?? "?"}</p>
  ${filmStripHtml({ strip: challenge.strip, lang })}
  <div class="nw-opts">${opts}</div></div>`.toString();
}

export function analyticsChallengeHtml({ challenge, lang = "zh" } = {}) {
  const opts = (challenge?.options || []).map((o) => html`<button type="button" class="btn nw-opt" data-analytics-opt="${o.id}">
    <b>${o.name} · ${o.pos} · ${o.team}</b>
    <span>OVR ${o.ovr} · ¤${o.price} · ${o.stats.ppg}${L("分", " pts", lang)} · ${(o.stats.fg * 100).toFixed(0)}% FG · ${o.stats.mpg}${L("分钟", " min", lang)}</span></button>`);
  return html`<div class="nw-challenge"><h3>${L("谁是被低估的球员？", "Who is the most undervalued player?", lang)}</h3>
  <p class="tiny">${L("只看数字：每单位身价的产出最高者获胜。", "Read the numbers: the most production per unit of price wins.", lang)}</p>
  <div class="nw-opts">${opts}</div></div>`.toString();
}

function offerRowHtml(o, lang) {
  const action = o.eligible
    ? html`<button type="button" class="btn small primary" data-network-accept="${o.id}">${L("接受", "Accept", lang)}</button>`
    : html`<span class="tiny">${L("未达标", "Not eligible", lang)}: ${(o.missing || []).map((m) => missingLabel(m, lang)).join(lang === "en" ? ", " : "、")}</span>`;
  return html`<div class="nw-line">${o.team ? `${o.team} · ` : ""}${pick(lang, o.titleZh, o.titleEn || o.titleZh)} (${o.level})
    ${action}</div>`;
}

export function networkBoardHtml({ profile, offers, unemployedNote, lang = "zh" } = {}) {
  const standing = reputationStanding(profile.reputation);
  const role = NETWORK_ROLES[profile.currentRole];
  const rows = (offers || []).map((o) => offerRowHtml(o, lang));
  const roleLabel = role ? pick(lang, role.labelZh, role.labelEn || role.labelZh) : profile.currentRole;
  const standingLabel = lang === "en" ? ` (${standing.labelEn || standing.labelZh})` : `（${standing.labelZh}）`;
  const note = typeof unemployedNote === "string" ? unemployedNote
    : unemployedNote && (lang === "en" ? (unemployedNote.en || unemployedNote.zh || "") : (unemployedNote.zh || unemployedNote.en || ""));
  const d = profile.decisions;
  return html`<div class="nw-profile"><h3>${L("我的职业", "My career", lang)}</h3>
  <div class="nw-line">${L("当前职位", "Current role", lang)}: ${roleLabel}${profile.team ? ` · ${profile.team}` : ""}</div>
  <div class="nw-line">${L("声望", "Reputation", lang)}: ${profile.reputation}${standingLabel}· ${L("经验", "Experience", lang)}: ${profile.experienceSeasons}${L("季", " seasons", lang)}</div>
  <div class="nw-line">${L("判断记录", "Judgment record", lang)}: ${L("录像", "Film", lang)} ${d?.filmCorrect || 0}/${d?.filmTotal || 0} · ${L("球探", "Scout", lang)} ${d?.scoutHits || 0}/${d?.scoutTotal || 0} · ${L("分析验证", "Analytics verified", lang)} ${d?.analyticsVerified || 0}</div>
  ${profile.unemployed && html`<div class="nw-line">${L("状态：失业中", "Status: unemployed", lang)}</div>`}
  ${note && html`<p class="tiny">${note}</p>`}</div>
  <div class="nw-board"><h3>${L("职业机会", "Career opportunities", lang)}</h3>${rows.length ? rows : html`<p class="tiny">${L("暂无职位空缺", "No openings right now", lang)}</p>`}</div>`.toString();
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
  let currentView = null; // "home" | "scout" | "film" | "analytics" | "board"
  // Challenge state, kept across a language switch (U-P2-1): the challenge is
  // built once from a fixed seed, and the player's answers are stored here,
  // so relocalize re-renders from the same challenge instead of rebuilding
  // it or wiping a decision.
  let scoutState = null; // { season, seed, rows, reports, picked, decisions: Map<bref, boolean>, revealed: { graded, total } | null }
  let filmState = null; // { seed, challenge, answered: { optionId, grade, rec } | null }
  let analyticsState = null; // { season, seed, challenge, board, answered: { optionId, grade } | null }

  const profile = () => readStore("profile", accountId(), emptyNetworkProfile({}));
  const saveProfile = (p) => writeStore("profile", accountId(), p);

  /** Mount once (boot) so the screen registry has the element; open() only renders and shows. */
  function mount() {
    if (!screen) {
      screen = ensureNetworkScreen({
        getLang: lang,
        onBack: () => {
          if (typeof goBack === "function") goBack();
          else if (typeof show === "function") show("home");
        },
        // Every view re-renders in the new language from its stored state
        // (U-P2-1). Scout / film / analytics keep their challenge (built
        // once from a fixed seed) plus the player's answers, so a toggle
        // never rebuilds the challenge or wipes a decision.
        onRelocalize: () => {
          if (!body?.hasChildNodes()) return;
          if (currentView === "home") renderHome();
          else if (currentView === "board") openBoard();
          else if (currentView === "scout") renderScout();
          else if (currentView === "film") renderFilm();
          else if (currentView === "analytics") renderAnalytics();
        },
      });
      body = screen.querySelector("#network-body");
    }
    return screen;
  }

  function renderHome() {
    body.innerHTML = homeHtml();
    body.querySelectorAll("[data-nw-open]").forEach((btn) => {
      btn.addEventListener("click", () => open(btn.dataset.nwOpen));
    });
  }

  function homeHtml() {
    return html`<div class="nw-home">
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
    currentView = "scout";
    const rows = await getRows();
    const pool = prospectPool(rows, season);
    const picked = pickProspects(pool, 5, seed);
    const reports = picked.map((p) => scoutReportFor(p, rows, { seed: seed + 1 }));
    scoutState = { season, seed, rows, reports, picked, decisions: new Map(), revealed: null };
    renderScout();
  }

  /** Render the scout challenge from stored state; decisions + reveal survive a language switch. */
  function renderScout() {
    const s = scoutState;
    if (!s || !body) return;
    const decided = s.decisions.size >= s.reports.length;
    body.innerHTML = html`<h3>${L("球探考察", "Scout evaluation", lang())} · ${s.season - 1}–${String(s.season).slice(2)}${L("选秀", " draft", lang())}</h3>
      <p class="tiny">${L("考察 5 名新人：根据球探报告决定推荐或放弃。三年后看真实发展。", "Evaluate 5 prospects: recommend or pass from the scout report. See the real development three years later.", lang())}</p>
      ${s.reports.map((r) => raw(scoutProspectHtml({ report: r, lang: lang() })))}
      <button type="button" class="btn primary" id="btn-scout-reveal" ${decided ? "" : "disabled"}>${L("三年后揭晓", "Reveal in three years", lang())}</button>
      <div id="scout-result">${s.revealed && raw(scoutRevealHtml({ graded: s.revealed.graded, total: s.revealed.total, lang: lang() }))}</div>`;
    body.querySelectorAll("[data-scout-rec]").forEach((btn) => {
      btn.disabled = s.decisions.has(btn.dataset.bref);
      btn.addEventListener("click", () => {
        s.decisions.set(btn.dataset.bref, btn.dataset.scoutRec === "1");
        renderScout();
      });
    });
    body.querySelector("#btn-scout-reveal")?.addEventListener("click", () => {
      if (s.revealed) return; // reveal once: re-rendering must not re-apply reputation or re-store
      const graded = s.reports.map((report) => {
        const prospect = s.picked.find((p) => p.row.bref === report.bref);
        const dev = developmentReport(prospect, s.rows, { years: 3 });
        const g = gradeScoutRecommendation({ recommended: s.decisions.get(report.bref) === true, pickCost: "mid", report: dev });
        return { ...g, report: dev };
      });
      const total = scoreScoutClass(graded);
      s.revealed = { graded, total };
      // Fold the outcome into the network profile (scout hits build reputation).
      let p = profile();
      for (const g of graded) {
        const correct = g.verdict.startsWith("hit-") || g.verdict === "correct-pass";
        p = recordSliceResult(p, { kind: "scout", correct });
      }
      saveProfile(p);
      writeStore("scout-last", accountId(), { season: s.season, graded, total, at: Date.now() });
      renderScout();
    });
  }

  async function openFilm({ seed = 11 } = {}) {
    currentView = "film";
    const rows = await getRows();
    body.innerHTML = html`<p>${L("正在模拟一场比赛，生成真实回合记录…", "Simulating a game to build a real possession log…", lang())}</p>`;
    const home = buildTeamFromRows(rows, "CHI", 1997);
    const away = buildTeamFromRows(rows, "UTA", 1997);
    const log = collectPossessionLog({ home, away, seed });
    const challenge = buildFilmChallenge(log, { seed, focusSide: "away" });
    if (!challenge) {
      body.innerHTML = html`<p>${L("这场比赛没有产生足够的录像发现，换个种子再试一次。", "This game produced too few film findings — try another seed.", lang())}</p>`;
      filmState = null;
      return;
    }
    filmState = { seed, challenge, answered: null };
    renderFilm();
  }

  /** The graded film answer, rendered from stored state in the current language. */
  function filmResultHtml({ grade, rec }) {
    const filmLang = lang();
    const filmExplanation = filmLang === "en" ? (grade.explanationEn || grade.explanationZh) : grade.explanationZh;
    const filmSuggestion = filmLang === "en" ? (rec.suggestionEn || rec.suggestionZh) : rec.suggestionZh;
    const filmParens = filmLang === "en" ? ["(", ")"] : ["（", "）"];
    return html`<div class="nw-reveal"><p>${filmExplanation}</p>
      <p class="tiny">${L("已提交给主教练的建议", "Recommendation filed to the head coach", filmLang)}: ${filmSuggestion}${filmParens[0]}${L("可信度", "confidence", filmLang)}: ${rec.confidence}${filmParens[1]}</p>
      <p class="tiny">${L("声望变化", "Reputation", filmLang)}: ${grade.reputationDelta > 0 ? "+" : ""}${grade.reputationDelta}</p></div>`;
  }

  /** Render the film challenge from stored state; the answer survives a language switch. */
  function renderFilm() {
    const f = filmState;
    if (!f || !body) return;
    body.innerHTML = html`${raw(filmChallengeHtml({ challenge: f.challenge, lang: lang() }))}<div id="film-result">${f.answered && filmResultHtml(f.answered)}</div>`;
    body.querySelectorAll("[data-film-opt]").forEach((btn) => {
      btn.disabled = !!f.answered;
      btn.addEventListener("click", () => {
        if (f.answered) return; // answer once: a second click used to re-grade and double-count reputation
        const grade = gradeFilmAnswer(f.challenge, btn.dataset.filmOpt);
        const rec = filmRecommendation(f.challenge, btn.dataset.filmOpt);
        // [Career 2.0 integration] File it so the coach challenge can
        // actually read it this session — the "filed to the head coach"
        // line below is now backed by the handoff, not just words.
        fileFilmRecommendation(rec);
        f.answered = { optionId: btn.dataset.filmOpt, grade, rec };
        let p = profile();
        p = recordSliceResult(p, { kind: "film", correct: grade.correct });
        saveProfile(p);
        renderFilm();
      });
    });
  }

  async function openAnalytics({ season = 1997, seed = 3 } = {}) {
    currentView = "analytics";
    const rows = await getRows();
    const challenge = buildAnalyticsChallenge(rows, { season, seed });
    const board = findUndervalued(rows, { season, minGp: 20, limit: 5 });
    if (!challenge) {
      body.innerHTML = html`<p>${L("该赛季数据不足，无法生成挑战。", "Not enough data in this season to build the challenge.", lang())}</p>`;
      analyticsState = null;
      return;
    }
    analyticsState = { season, seed, challenge, board, answered: null };
    renderAnalytics();
  }

  /** The graded analytics answer in the current language (was hardcoded explanationZh). */
  function analyticsResultHtml({ grade }) {
    const aLang = lang();
    const explanation = aLang === "en" ? (grade.explanationEn || grade.explanationZh) : grade.explanationZh;
    return html`<div class="nw-reveal"><p>${explanation}</p>
      <p class="tiny">${L("声望变化", "Reputation", aLang)}: ${grade.reputationDelta > 0 ? "+" : ""}${grade.reputationDelta}</p></div>`;
  }

  /** Render the analytics challenge from stored state; the answer survives a language switch. */
  function renderAnalytics() {
    const a = analyticsState;
    if (!a || !body) return;
    const boardHtml = a.board.map((b) => html`<div class="nw-line">${b.row.name} · ${b.row.pos} · ${b.row.team} — ${L("价值比", "Value ratio", lang())} ${b.valueRatio} · OVR ${b.ovr} · ¤${b.price}</div>`);
    body.innerHTML = html`${raw(analyticsChallengeHtml({ challenge: a.challenge, lang: lang() }))}<div id="analytics-result">${a.answered && analyticsResultHtml(a.answered)}</div><h3>${L("价值榜", "Value board", lang())}</h3>${boardHtml}`;
    body.querySelectorAll("[data-analytics-opt]").forEach((btn) => {
      btn.disabled = !!a.answered;
      btn.addEventListener("click", () => {
        if (a.answered) return; // answer once: a second click used to re-grade and double-count reputation
        const grade = gradeAnalyticsAnswer(a.challenge, btn.dataset.analyticsOpt);
        a.answered = { optionId: btn.dataset.analyticsOpt, grade };
        let p = profile();
        p = recordSliceResult(p, { kind: "analytics", correct: grade.correct });
        saveProfile(p);
        renderAnalytics();
      });
    });
  }

  function openBoard() {
    currentView = "board";
    const p = profile();
    const { offers, unemployedNote } = generateOpportunities(p, DEMO_JOB_BOARD, { seed: 5 });
    body.innerHTML = html`${raw(networkBoardHtml({ profile: p, offers, unemployedNote, lang: lang() }))}<div class="nw-actions"><button type="button" class="btn" id="btn-network-fired">${L("模拟：被解雇", "Simulate: get fired", lang())}</button></div><div id="network-result"></div>`;
    body.querySelectorAll("[data-network-accept]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const offer = offers.find((o) => o.id === btn.dataset.networkAccept);
        if (!offer) return;
        const { profile: next, transition } = acceptOpportunity(p, offer, { year: 1997 });
        saveProfile(next);
        // Re-render first, then write the result into the fresh #network-result:
        // writing before openBoard() wiped the line (the board replaces the body).
        openBoard();
        const toRole = NETWORK_ROLES[transition.to];
        const toLabel = toRole ? pick(lang(), toRole.labelZh, toRole.labelEn || toRole.labelZh) : transition.to;
        body.querySelector("#network-result").innerHTML = html`<p>${L("已接受", "Accepted", lang())}: ${toLabel} · ${transition.toTeam || ""}</p>`;
      });
    });
    body.querySelector("#btn-network-fired")?.addEventListener("click", () => {
      const { profile: next, noteZh, noteEn } = dismissalOutcome(p, { reason: "fired", year: 1997 });
      saveProfile(next);
      openBoard();
      body.querySelector("#network-result").innerHTML = html`<p>${pick(lang(), noteZh, noteEn || noteZh)}</p>`;
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
      currentView = "home";
      renderHome();
    }
  }

  return { open, mount, openScout, openFilm, openAnalytics, openBoard, profile, saveProfile };
}
