/**
 * Player Reborn — the public entry view (Career Player card, or ?reborn=1).
 *
 * A new run starts in the creation flow (year, destiny, identity); an
 * existing run resumes on the season screen. The view:
 *   - loads the identity from root.reborn (created once, survives refresh)
 *   - plays the 1996-97 season game by game, never bulk-simming silently
 *   - offers one training focus per week, at the week's first game
 *   - opens the takeover dialog when the driver reaches the window
 *   - settles the contract at season end and rolls the timeline over
 * Persistence is the app's root save (root.reborn, additive, v3 stays).
 */
import { mountScreen } from "../screenShell.js";
import { esc } from "../../core/html.js";
import { confirmAction } from "../confirmModal.js";
import { buildPlayerCard } from "../../reborn/identity.js";
import { creationHtml, createRebornFromChoice, seedFromSearch } from "./creation.js";
import { buildSeason, playGame } from "../../reborn/season.js";
import {
  fastForward,
  nextFastForwardTarget,
  describeFastForwardTarget,
  describeFastForwardEvent,
} from "../../reborn/fastForward.js";
import { latestRevealHint, revealLine } from "../../reborn/reveal.js";
import { roleForTrust, describeTrustChange, describeNextTier, TRUST_START } from "../../reborn/trust.js";
import { settleRebornPromises } from "../../reborn/promiseSettle.js";
import { challengeRival, mirrorRivalriesToAccount, rivalryLedger, rivalryTimelineEvent } from "../../reborn/rivalry.js";
import { rivalryPregameHtml, rivalryReportHtml, rivalryTimelineLine, rivalsPanelHtml } from "./rivalryView.js";
import { acceptJerseyExchange, declineJerseyExchange, jerseyState } from "../../collectibles/jerseyExchange.js";
import { mirrorJerseysToAccount } from "../../collectibles/jerseyCollection.js";
import { jerseyOffersHtml } from "./jerseyOfferView.js";
import { promiseBannerHtml } from "../promiseBannerView.js";
import { chooseFocus, TRAINING_FOCI, TRAINING_FOCUS_LABEL, describeGrowth } from "../../reborn/training.js";
import { fragmentsPanelHtml, fragmentsReportLines, intensiveClick, legacyClick, specializeClick, unlockClick } from "./fragmentsView.js";
import { mirrorUnlocksToAccount, runUnlockIds } from "../../collectibles/legacyCosmetics.js";
import { readParticipation, writeParticipation } from "../../reborn/participation.js";
import { createTakeoverHook, describeTakeoverOutcome } from "./takeover.js";
import { describeAgencyFeedback, describeDefenseFeedback, describeTeamplayFeedback, participationBarHtml } from "./agencyView.js";
import { mirrorTeammatesToAccount, teamplayOf } from "../../reborn/teamplay.js";
import { AUTONOMY_START, autonomyTier } from "../../reborn/agency.js";
import { playoffReportLine, playoffsPanelHtml, playoffsTimelineLine, standingsHtml } from "./playoffsView.js";
import { mirrorHonorsToAccount } from "../../reborn/honors.js";
import { enterPlayoffs, playPlayoffGame, regularGames } from "../../reborn/playoffFlow.js";
import { settleContract, rolloverSeason, describeContract, seasonSummary, contractDecision, contractStatusLabel } from "../../reborn/contract.js";
import { overall } from "../../data/players.js";
import { readIdentity } from "../../data/profile.js";
import { createRootState } from "../../data/saveRoot.js";
import { setIdentity } from "../../career/careerIdentity.js";
// Signature Awakening (workstream D): evidence-based skill awakening for the
// Player career — no skill books, no purchases, no dice.
import {
  awakenedSkillIds,
  evidenceFromReport,
  recordGame as recordAwakeningGame,
} from "../../career/player/signatureAwakening.js";
import {
  awakeningProgressHtml,
  awakeningBannerHtml,
  awakeningTimelineLine,
} from "../awakeningView.js";

let ROWS_CACHE = null;
async function loadRows() {
  if (ROWS_CACHE) return ROWS_CACHE;
  const { fetchRosterJson } = await import("../../data/rosterCache.js");
  const { data } = await fetchRosterJson("./js/data/roster.json");
  ROWS_CACHE = data.players || [];
  return ROWS_CACHE;
}

/** The page title, rendered once by the shell in the current language. */
export const REBORN_TITLE = Object.freeze({ zh: "球员重生", en: "Player Reborn" });

/**
 * Mount the Player Reborn screen on the shared Screen Shell (screenShell.js) —
 * the shell owns the panel head (one back button, one single-language title),
 * the focus/scroll lifecycle and the language switch; this view keeps its own
 * business state and renders into the shell body.
 * Host "app" (the default): the creation flow and the season screen are plain
 * long-form page screens that scroll with the page, as before — nothing about
 * them needs to cover the viewport or scroll on its own, so no overlay
 * behaviour. Mounting moves the screen from document.body into the #app
 * column, like the museum / inbox / coaching / gamble / duel / network /
 * relationships screens before it.
 * The back button used to be wired once by wire() behind a __rebornWired
 * guard; that wiring is gone — the shell wires it to onBack, so the
 * goBack-or-home fallback now lives in the factory's mount() instead.
 */
export function ensureRebornScreen({ getLang = () => "zh", onBack, onRelocalize } = {}) {
  const el = mountScreen({ id: "reborn", title: REBORN_TITLE, getLang, onBack, onRelocalize }).el;
  el.classList.add("arena"); // 2026-11 visual upgrade: the career dashboard uses the dark arena look (css/arena.css)
  return el;
}

// `lang` may be the language or the view's getLang function: render() passed the function in 22 places, so the
// whole Reborn screen (play button, season line, training, restart) stayed Chinese in English mode.
const L = (zh, en, lang) => ((typeof lang === "function" ? lang() : lang) === "en" ? en : zh);

/** The identity card: who you are, your trust, your role. */
function autonomyLine(reborn, lang) {
  const a = reborn.player.autonomy ?? AUTONOMY_START;
  const tier = autonomyTier(a);
  return `<p class="reborn-autonomy" data-testid="autonomy">${L("战术自主权", "Tactical autonomy", lang)} ${a} / 100 · ${lang === "en" ? tier.en : tier.zh}</p>`;
}

export function rebornIdentityHtml({ reborn, card, lang = "zh", mode = null } = {}) {
  const name = reborn.identity.revealed ? reborn.identity.name : L("无名试训球员", "Unnamed camp player", lang);
  const trust = reborn.player.coachTrust;
  const role = roleForTrust(trust);
  const roleLabel = { dnp: L("坐冷板凳", "DNP", lang), garbage: L("垃圾时间", "Garbage time", lang), bench: L("板凳末端", "Bench", lang), rotation: L("轮换", "Rotation", lang), starter: L("首发", "Starter", lang) }[role];
  const status = reborn.player.contractStatus;
  // Foreshadowing before the trust-40 reveal: the latest unlocked hint.
  // It never names the player — the reveal module pins that.
  const hint = latestRevealHint(reborn.identity, trust);
  const hintLine = hint ? `<p class="reborn-hint">${hint[lang === "en" ? "en" : "zh"]}</p>` : "";
  const ladder = describeNextTier(trust, lang);
  const ladderLine = ladder ? `<p class="reborn-ladder" data-testid="trust-ladder">${ladder}</p>` : "";
  return `<section class="reborn-identity"><h3>${esc(name)}</h3>`
    + `<p>${reborn.player.teamId} · ${card?.pos || ""} · OVR ${card ? overall(card) : "—"}</p>`
    + `<p>${L("教练信任", "Coach trust", lang)} ${trust} / 100 · ${roleLabel} · ${contractStatusLabel(status, lang)}</p>`
    + `<div class="reborn-trust-bar" role="progressbar" aria-valuenow="${trust}" aria-valuemin="0" aria-valuemax="100"><span style="width:${trust}%"></span></div>`
    + ladderLine
    + autonomyLine(reborn, lang)
    + (mode ? participationBarHtml(mode, lang) : "")
    + hintLine
    + `</section>`;
}

/** The career timeline: season-end contracts and season starts, in order. */
export function careerTimelineHtml({ reborn, lang = "zh" } = {}) {
  const events = (reborn?.timeline?.events || []).filter((e) => e && e.event);
  if (!events.length) return "";
  const lines = events.map((event) => {
    if (event.event === "contract") {
      const label = contractStatusLabel(event.outcome, lang);
      return lang === "en"
        ? `<p>${event.year} season: ${label} (trust ${event.trust}, ${event.games} games, ${event.avgMin} min/game)</p>`
        : `<p>${event.year} 赛季：${label}（信任 ${event.trust}，出战 ${event.games} 场，场均 ${event.avgMin} 分钟）</p>`;
    }
    if (event.event === "season_start") {
      return lang === "en"
        ? `<p>${event.year} season starts (trust ${event.trust})</p>`
        : `<p>${event.year} 赛季开始（信任 ${event.trust}）</p>`;
    }
    if (event.event === "awakening") {
      return awakeningTimelineLine({ event, lang });
    }
    if (event.event === "rivalry") {
      return rivalryTimelineLine({ event, lang });
    }
    if (event.event === "playoffs") {
      return playoffsTimelineLine({ event, lang });
    }
    return "";
  }).filter(Boolean);
  if (!lines.length) return "";
  return `<section class="reborn-timeline"><h3>${L("生涯", "Career", lang)}</h3>${lines.join("")}</section>`;
}

/** One settled game's report: the line, the trust change, the growth, the takeover. */
export function rebornReportHtml({ report, lang = "zh" } = {}) {
  if (!report) return "";
  const parts = describeTrustChange(
    { trust: report.trustAfter, delta: report.trustDelta, role: report.roleAfter, parts: report.trustParts },
    lang,
  );
  const growth = describeGrowth(report.growth, lang);
  const takeover = report.takeover
    ? describeTakeoverOutcome(
        { attempted: report.takeover.attempted, made: report.takeover.made, zone: report.takeover.zone, points: report.takeover.points, reason: report.takeover.reason },
        lang,
      )
    : null;
  const lines = [
    report.po ? `<p>${playoffReportLine(report, lang)} · ${report.home ? L("主场", "Home", lang) : L("客场", "Away", lang)} vs ${report.opp} · ${report.score.home}–${report.score.away} ${report.won ? "W" : "L"}</p>` : `<p>${L("第", "Game ", lang)}${report.game} ${L("场", "", lang)}· ${report.home ? L("主场", "Home", lang) : L("客场", "Away", lang)} vs ${report.opp} · ${report.score.home}–${report.score.away} ${report.won ? L("胜", "W", lang) : L("负", "L", lang)}</p>`,
    `<p>${L("你的数据", "Your line", lang)}：${report.line.min} ${L("分钟", "min", lang)} · ${report.line.pts} ${L("分", "pts", lang)} · ${report.line.reb} ${L("板", "reb", lang)} · ${report.line.ast} ${L("助", "ast", lang)}</p>`,
    `<p>${parts}</p>`,
    ...[...growth, ...fragmentsReportLines(report, lang)].map((g) => `<p>${g}</p>`),
    ...(takeover ? [`<p>${takeover}</p>`] : []),
    ...(report.agency ? [`<p class="reborn-agency-feedback" data-testid="agency-feedback">${describeAgencyFeedback(report.agency, lang)}</p>`] : []),
    ...describeTeamplayFeedback(report.teamplay, lang).map((l) => `<p class="reborn-teamplay-feedback" data-testid="teamplay-feedback">${l}</p>`),
    ...describeDefenseFeedback(report.defense, lang).map((l) => `<p class="reborn-teamplay-feedback" data-testid="defense-feedback">${l}</p>`),
  ];
  return `<section class="reborn-report">${lines.join("")}</section>`;
}

/**
 * R7: stamp the PLAYER identity for a newly created reborn run. Pure —
 * returns a new root; the input is untouched. The stamp is the save-level
 * identity only: a leagueCareer already in this root keeps its own role
 * (a coach career must not turn PLAYER because a player run was created
 * alongside it — the design's "互不干扰"). The M4-C snapshot on the
 * reborn run is untouched by the stamp. Exported for the Node tests —
 * the screen wiring itself needs a DOM and is covered by the Mac
 * browser QA.
 */
export function stampRebornIdentity(root) {
  const leagueCareer = root?.leagueCareer;
  const stamped = setIdentity(root, "PLAYER");
  if (leagueCareer) stamped.leagueCareer = leagueCareer;
  return stamped;
}

export function createRebornView({ getLang, readRootSave, writeRootSave, show, goBack, getAccount = () => null, saveAccount = () => {} } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  let el = null;
  let rows = null;
  let reborn = null;
  let season = null;
  let lastReport = null;
  let contractOutcome = null;
  let busy = false;
  // Skills awakened in the last run of games (manual or fast-forward) — the
  // banner shows them until the next run starts.
  let lastAwakened = [];
  let lastPromises = [];
  // The creation flow's selection state (null once a run exists). The seed
  // is fixed when creation opens so the random draw is stable while the
  // player browses the lists.
  let creating = null;
  // The last fast-forward run: { event, reports, trustBefore } — shown as a
  // summary until the next manual game. Null when nothing was simmed yet.
  let ffState = null;
  // True while a fast-forward run is in flight (progress line in render).
  let ffRunning = false;
  let poProgress = false;   // the league schedule is being caught up before the playoffs

  const currentWeek = () => Math.floor((season?.index || 0) / 4) + 1;

  /**
   * The root to write this run into: the visible root save, or a fresh valid
   * one when none is visible (a new account, or after switching accounts). A
   * bare `{ reborn }` is not a valid root and fails the save validator.
   * `stampPlayer` (R7, creation only): stamp the PLAYER identity in the
   * same write that stores the reborn run — never a half-stamped save.
   * Later persists read the stamped root back and never re-stamp.
   */
  function rootWithReborn({ stampPlayer = false } = {}) {
    let root = readRootSave() || createRootState();
    root.reborn = reborn;
    if (stampPlayer) root = stampRebornIdentity(root);
    return root;
  }

  function persist(options) {
    writeRootSave(rootWithReborn(options));
  }

  /**
   * Signature Awakening (workstream D): feed one settled game's report into
   * the awakening ledger. The card is rebuilt from the post-game state so
   * the ability gate + grant checks see the ratings the player actually had.
   * Newly fired skills are recorded in the career timeline (source:
   * "awakened") and staged for the banner. Mutates `rebornState` in place —
   * the caller persists afterwards.
   */
  /**
   * Sync the account after a game: mirror the run's rivals, then settle the
   * account's due promises against this run (same
   * in-place pattern as applyAwakening). The unified engine does the
   * settling and moves coach trust; this only persists the account and keeps
   * the results for the banner.
   */
  function syncAccount(rebornState) {
    const account = getAccount();
    if (!account || !rebornState) return [];
    // Rivalries: the run's ledger is the truth; the account gets an idempotent copy.
    const hasRivals = rivalryLedger(rebornState).rivals.length > 0;
    if (hasRivals) mirrorRivalriesToAccount(account, rebornState);
    // Teammates (PA3): same rule, the run is the truth and the account's relationship ledger gets an idempotent integer copy.
    const hasMates = Object.keys(teamplayOf(rebornState).mates).length > 0;
    if (hasMates) mirrorTeammatesToAccount(account, rebornState);
    // Kept jerseys: the run is the truth, the account gets an idempotent copy (deduped by instance id).
    const jerseysAdded = mirrorJerseysToAccount(account, jerseyState(rebornState));
    // Titles and Finals losses: the run is the truth, the account's legacy gets an idempotent copy (deduped by id).
    const honorsAdded = mirrorHonorsToAccount(account, rebornState);
    // Career honours redeemed with fragments: same rule, the run is the truth (deduped by id).
    const unlocksAdded = mirrorUnlocksToAccount(account, runUnlockIds(rebornState));
    const out = settleRebornPromises(account, rebornState);
    if (!out.settled.length) {
      if (hasRivals || hasMates || jerseysAdded || honorsAdded || unlocksAdded) { try { saveAccount(account); } catch { /* guest */ } }
      return [];
    }
    if (out.reborn !== rebornState) {
      rebornState.player.coachTrust = out.reborn.player.coachTrust;
      rebornState.player.rotationRole = out.reborn.player.rotationRole;
    }
    try { saveAccount(account); } catch { /* a guest has no account store; trust already moved */ }
    lastPromises = [...lastPromises, ...out.settled];
    return out.settled;
  }

  /** The player's card as the game sees it in `year`: growth deltas + awakened skills (one recipe for every reader). */
  function playerCardFor(rebornState, year) {
    return buildPlayerCard(rebornState.identity, rows, {
      growth: rebornState.player.growth,
      season: year,
      // Signature Awakening (workstream D): awakened skills ride on the card.
      extraSkills: awakenedSkillIds(rebornState.player.awakening),
    });
  }

  function applyAwakening(rebornState, report) {
    if (!rebornState || !report) return [];
    const card = playerCardFor(rebornState, report.year);
    const out = recordAwakeningGame(rebornState.player.awakening, {
      evidence: evidenceFromReport(report),
      card,
    });
    rebornState.player.awakening = out.state;
    if (out.awakened.length) {
      const events = [...(rebornState.timeline?.events || [])];
      for (const a of out.awakened) {
        events.push({
          year: report.year,
          event: "awakening",
          skillId: a.skillId,
          source: "awakened",
          game: a.game,
          evidence: a.evidence,
        });
      }
      rebornState.timeline = { ...(rebornState.timeline || {}), events };
      lastAwakened = [...lastAwakened, ...out.awakened];
    }
    return out.awakened;
  }

  function rebuildSeason() {
    season = buildSeason(reborn, rows);
    // Resume: the log already records the played games of this year.
    season.index = regularGames(reborn, season.year).length;   // playoff games are logged too, but they are not one of the 82
  }

  function render() {
    const body = el.querySelector("#reborn-body");
    if (creating) {
      body.innerHTML = creationHtml({
        rows,
        seed: creating.seed,
        lang: lang(),
        startYear: creating.startYear,
        destiny: creating.destiny,
        pickedBref: creating.pickedBref,
      });
      return;
    }
    const card = playerCardFor(reborn, season.year);
    const summary = seasonSummary(reborn, season.year);
    const done = season.index >= season.games.length;
    const poState = reborn.playoffs?.year === season.year ? reborn.playoffs : null;
    const poOver = !!poState && poState.status !== "active";   // eliminated, champion, missed or unavailable: the season is over
    const week = currentWeek();
    const training = reborn.player.training;
    const canTrain = !done && (!training || training.week < week);
    const nextGame = done ? null : season.games[season.index];
    const ffTarget = done ? null : nextFastForwardTarget(reborn, season, rows);
    const ffLabel = ffTarget ? describeFastForwardTarget(ffTarget, lang()) : null;
    const revealBanner = lastReport?.revealedNow
      ? `<section class="reborn-reveal"><p>${revealLine(reborn.identity, lang())}</p></section>`
      : "";
    const ffSummary = ffRunning
      ? `<p class="reborn-ff-progress">${L("模拟中……", "Simming…", lang)}${L("第", " game ", lang)}${season.index + 1}${L(" 场", "", lang)}</p>`
      : ffState
        ? `<section class="reborn-ff"><p>${describeFastForwardEvent(ffState.event, lang())}</p><p>${L("模拟了", "Simmed ", lang)}${ffState.reports.length}${L(" 场", " games", lang)} · ${ffState.reports.filter((r) => r.won).length}${L("胜", "W", lang)}${ffState.reports.length - ffState.reports.filter((r) => r.won).length}${L("负", "L", lang)} · ${L("信任", "Trust", lang)} ${ffState.trustBefore} → ${reborn.player.coachTrust}</p></section>`
        : "";
    const html = [
      rebornIdentityHtml({ reborn, card, lang: lang(), mode: readParticipation() }),
      revealBanner,
      awakeningBannerHtml({ awakened: lastAwakened, lang: lang() }),
      promiseBannerHtml({ settled: lastPromises, lang: lang() }),
      awakeningProgressHtml({ awakening: reborn.player.awakening, card, lang: lang() }),
      `<p>${L("赛季", "Season", lang)} ${season.year} · ${L("第", "Game ", lang)}${Math.min(season.index + 1, season.games.length)}/${season.games.length} ${L("场", "", lang)} · ${summary.wins}${L("胜", "W", lang)}${summary.games - summary.wins}${L("负", "L", lang)}</p>`,
      canTrain
        ? `<section class="reborn-training"><h3>${L(`第 ${week} 周训练`, `Week ${week} training`, lang)}</h3><p>${L("每周选一个训练方向。", "Pick one training focus per week.", lang)}</p><div class="reborn-training-options">${TRAINING_FOCI.map((f) => {
          const label = TRAINING_FOCUS_LABEL[f][lang() === "en" ? "en" : "zh"];
          return `<button type="button" class="btn" data-train="${f}">${label}</button>`;
        }).join("")}</div></section>`
        : "",
      training && !done
        ? `<p>${L("本周训练：", "This week's training: ", lang)}${TRAINING_FOCUS_LABEL[training.focus][lang() === "en" ? "en" : "zh"]}</p>`
        : "",
      done ? "" : fragmentsPanelHtml({ reborn, week, card, year: season.year, lang: lang() }),
      !done
        ? rivalryPregameHtml({ reborn, rows, nextGame, year: season.year, lang: lang() })
        : "",
      !done
        ? `<button type="button" class="btn" data-play="1" ${busy ? "disabled" : ""}>${L("打下一场", "Play next game", lang)}${nextGame ? ` (${nextGame.homeId === reborn.player.teamId ? L("主场", "Home", lang) : L("客场", "Away", lang)} vs ${nextGame.homeId === reborn.player.teamId ? nextGame.awayId : nextGame.homeId})` : ""}</button>`
        : "",
      !done && ffLabel
        ? `<button type="button" class="btn" data-ff="1" ${busy ? "disabled" : ""}>${ffLabel}</button>`
        : "",
      done ? playoffsPanelHtml({ reborn, year: season.year, lang: lang(), busy, progress: poProgress }) : "",
      done && poOver && !contractOutcome
        ? `<button type="button" class="btn" data-settle="1">${L("赛季结束，结算合同", "Season over — settle contract", lang)}</button>`
        : "",
      contractOutcome
        ? `<section class="reborn-contract"><p>${describeContract(contractOutcome, lang())}</p><button type="button" class="btn" data-rollover="1">${L("开始下赛季", "Start next season", lang)}</button></section>`
        : "",
      ffSummary,
      standingsHtml({ reborn, year: season.year, lang: lang() }),
      rebornReportHtml({ report: lastReport, lang: lang() }),
      rivalryReportHtml({ report: lastReport, reborn, lang: lang() }),
      jerseyOffersHtml({ reborn, lang: lang() }),
      rivalsPanelHtml({ reborn, lang: lang() }),
      careerTimelineHtml({ reborn, lang: lang() }),
      `<button type="button" class="btn" data-reset="1">${L("换一个身份（重新开始）", "New identity (restart)", lang)}</button>`,
    ].join("");
    body.innerHTML = html;
  }

  async function playNext() {
    if (busy || !season || season.index >= season.games.length) return;
    busy = true;
    ffState = null;
    lastAwakened = [];
    lastPromises = [];
    render();
    try {
      const week = currentWeek();
      const out = await playGame(reborn, season, rows, {
        onTakeover: createTakeoverHook({ root: readRootSave(), getLang: lang, getMode: readParticipation, onMode: writeParticipation }),
        participation: { getMode: readParticipation },
        trainingDone: reborn.player.training?.week === week,
      });
      if (!out) return;
      reborn = out.reborn;
      lastReport = out.report;
      applyAwakening(reborn, out.report);
      syncAccount(reborn);
      persist();
    } finally {
      busy = false;
      render();
    }
  }

  /** Start the playoffs once the 82 games are in (a save that never advanced the league is caught up first, a slice at a time). */
  async function enterPlayoffsNow() {
    if (busy || !season || season.index < season.games.length) return;
    busy = true;
    poProgress = true;
    render();
    try {
      reborn = await enterPlayoffs(reborn, rows, { year: season.year, onProgress: () => render() });
      persist();
    } finally {
      busy = false;
      poProgress = false;
      render();
    }
  }

  /** The player's next playoff game: the same real GameSim game and takeover as the regular season, recorded on its series. */
  async function playPlayoffNext() {
    if (busy || !reborn.playoffs) return;
    busy = true;
    lastAwakened = [];
    lastPromises = [];
    ffState = null;
    render();
    try {
      const week = currentWeek();
      const out = await playPlayoffGame(reborn, rows, {
        onTakeover: createTakeoverHook({ root: readRootSave(), getLang: lang, getMode: readParticipation, onMode: writeParticipation }),
        participation: { getMode: readParticipation },
        trainingDone: reborn.player.training?.week === week,
      });
      if (!out) return;
      reborn = out.reborn;
      lastReport = out.report;
      applyAwakening(reborn, out.report);
      syncAccount(reborn);
      persist();
    } finally {
      busy = false;
      render();
    }
  }

  /** Simulate to the next meaningful event (fastForward); the takeover dialog may pause the run mid-game. */
  async function playFastForward() {
    if (busy || !season || season.index >= season.games.length) return;
    busy = true;
    ffRunning = true;
    lastAwakened = [];
    lastPromises = [];
    const trustBefore = reborn.player.coachTrust;
    render();
    try {
      const out = await fastForward(reborn, season, rows, {
        onTakeover: createTakeoverHook({ root: readRootSave(), getLang: lang, getMode: readParticipation, onMode: writeParticipation }),
        participation: { getMode: readParticipation },
        // The second arg is the reborn state after that game: record the
        // awakening evidence live, so a skill fired mid-run is on the card
        // from the next simmed game on.
        onGame: (report, currentReborn) => {
          if (currentReborn) { applyAwakening(currentReborn, report); syncAccount(currentReborn); }
          render();
        },
      });
      reborn = out.reborn;
      lastReport = out.reports.length ? out.reports[out.reports.length - 1] : lastReport;
      ffState = { event: out.stoppedAt, reports: out.reports, trustBefore };
      persist();
    } finally {
      busy = false;
      ffRunning = false;
      render();
    }
  }

  function wire() {
    el.querySelector("#reborn-body").addEventListener("click", async (event) => {
      if (creating) {
        const yearBtn = event.target.closest("[data-reborn-year]");
        if (yearBtn) {
          creating.startYear = Number(yearBtn.dataset.rebornYear);
          creating.pickedBref = null; // the pool changes with the year
          render();
          return;
        }
        const destinyBtn = event.target.closest("[data-reborn-destiny]");
        if (destinyBtn) {
          creating.destiny = destinyBtn.dataset.rebornDestiny;
          creating.pickedBref = null;
          render();
          return;
        }
        const pickBtn = event.target.closest("[data-reborn-pick]");
        if (pickBtn) {
          creating.pickedBref = pickBtn.dataset.rebornPick;
          render();
          return;
        }
        if (event.target.closest("[data-reborn-confirm]")) {
          try {
            reborn = createRebornFromChoice({
              seed: creating.seed,
              rows,
              choice: {
                startYear: creating.startYear,
                destiny: creating.destiny || "random",
                bref: creating.pickedBref,
              },
              // M4-C: freeze the account's identity places as they are at
              // creation (readIdentity covers guests too); later account
              // edits never rewrite this career's snapshot.
              identityPlaces: readIdentity(getAccount()).identityPlaces,
            });
          } catch (e) {
            console.warn(e);
            return;
          }
          creating = null;
          // R7: stamp PLAYER at creation, in the same save as the reborn
          // run itself — later resume / fast-forward persists never re-stamp.
          persist({ stampPlayer: true });
          rebuildSeason();
          contractOutcome = null;
          lastReport = null;
          render();
          return;
        }
        return;
      }
      const challenge = event.target.closest("[data-rival-challenge]");
      if (challenge && lastReport) {
        const out = challengeRival(rivalryLedger(reborn), lastReport, challenge.dataset.rivalChallenge);
        if (out.rival) {
          reborn.rivalries = out.ledger;
          reborn.timeline = { ...(reborn.timeline || {}), events: [...(reborn.timeline?.events || []), rivalryTimelineEvent(out.rival)] };
          syncAccount(reborn);
          persist();
        }
        render();
        return;
      }
      const jersey = event.target.closest("[data-jersey-accept], [data-jersey-decline]");
      if (jersey) {
        const accept = jersey.dataset.jerseyAccept;
        const out = accept ? acceptJerseyExchange(jerseyState(reborn), accept) : declineJerseyExchange(jerseyState(reborn), jersey.dataset.jerseyDecline);
        if (out.ok) {
          reborn.jerseys = out.state;
          syncAccount(reborn);
          persist();
        }
        render();
        return;
      }
      const bought = intensiveClick(event, reborn, currentWeek())
        || specializeClick(event, reborn, currentWeek(), playerCardFor(reborn, season.year));
      if (bought) { reborn = bought; persist(); render(); return; }
      const legacy = legacyClick(event, reborn, season.year, currentWeek()) || unlockClick(event, reborn, season.year);
      if (legacy) { reborn = legacy; syncAccount(reborn); persist(); render(); return; }   // the jersey reaches the account collection now
      const train = event.target.closest("[data-train]");
      if (train) {
        try {
          // R7: personal training is the Player career's own play — the
          // guard refuses a coach/GM root (the handler warns, no crash).
          reborn = chooseFocus(reborn, train.dataset.train, currentWeek(), readRootSave());
          persist();
          render();
        } catch (e) {
          console.warn(e);
        }
        return;
      }
      const modeChip = event.target.closest("[data-mode]");
      if (modeChip) {
        writeParticipation(modeChip.dataset.mode);
        render();
        return;
      }
      if (event.target.closest("[data-play]")) {
        await playNext();
        return;
      }
      if (event.target.closest("[data-po-enter]")) {
        await enterPlayoffsNow();
        return;
      }
      if (event.target.closest("[data-po-play]")) {
        await playPlayoffNext();
        return;
      }
      if (event.target.closest("[data-ff]")) {
        await playFastForward();
        return;
      }
      if (event.target.closest("[data-settle]")) {
        const settled = settleContract(reborn, { year: season.year });
        reborn = settled.reborn;
        contractOutcome = settled.outcome;
        syncAccount(reborn); // the contract event is evidence for contract promises
        persist();
        render();
        return;
      }
      if (event.target.closest("[data-rollover]")) {
        const rolled = rolloverSeason(reborn, { year: season.year, players: rows });
        reborn = rolled.reborn;
        syncAccount(reborn); // the new season passes every old deadline
        contractOutcome = null;
        lastReport = null;
        ffState = null;
        rebuildSeason();
        persist();
        render();
        return;
      }
      if (event.target.closest("[data-reset]")) {
        if (!(await confirmAction(L("确定换一个身份？现在的重生进度会被清除。", "Start over with a new identity? Current progress will be cleared.", lang())))) return;
        const root = readRootSave() || {};
        delete root.reborn;
        writeRootSave(root);
        await open(true);
      }
    });
  }

  async function open(forceNew = false) {
    el = ensureRebornScreen();
    if (!el.__rebornWired) {
      wire();
      el.__rebornWired = true;
    }
    rows = await loadRows();
    const root = readRootSave() || {};
    if (forceNew || !root.reborn) {
      // No run yet: the creation flow (year, destiny, identity). The seed
      // is fixed here so the random draw is stable while the player
      // browses the lists; the run is created only on confirm. A
      // `?reborn-seed=` URL param pins the seed (QA scripts; see
      // seedFromSearch) — normal play always generates a fresh one.
      creating = {
        seed: seedFromSearch(typeof location !== "undefined" ? location.search : "")
          || `reborn-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        startYear: 1996,
        destiny: null,
        pickedBref: null,
      };
      reborn = null;
      season = null;
      lastReport = null;
      ffState = null;
      contractOutcome = null;
      render();
      if (typeof show === "function") show("reborn");
      return;
    }
    creating = null;
    reborn = root.reborn;
    if (typeof reborn.player.coachTrust !== "number") reborn.player.coachTrust = TRUST_START;
    rebuildSeason();
    // Re-opening a settled season shows the rollover button, not settle again.
    const done = season.index >= season.games.length;
    contractOutcome = done && ["resign", "minimum", "cut"].includes(reborn.player.contractStatus)
      ? contractDecision(reborn, season.year)
      : null;
    lastReport = null;
    render();
    if (typeof show === "function") show("reborn");
  }

  /** Mount once (boot) so the screen registry has the element; open() only renders and shows. */
  function mount() {
    return ensureRebornScreen({
      getLang: lang,
      onBack: () => {
        if (typeof goBack === "function") goBack();
        else if (typeof show === "function") show("home");
      },
      // The creation flow and the season screen are both pure renders from
      // state, so a language toggle re-renders the body; before open the
      // body is empty (and the roster is not loaded yet) and relocalize
      // leaves it alone.
      onRelocalize: () => {
        if (el?.querySelector("#reborn-body")?.hasChildNodes?.()) render();
      },
    });
  }

  return { open, render, mount };
}
