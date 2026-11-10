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
import { buildPlayerCard } from "../../reborn/identity.js";
import { creationHtml, createRebornFromChoice } from "./creation.js";
import { buildSeason, playGame } from "../../reborn/season.js";
import {
  fastForward,
  nextFastForwardTarget,
  describeFastForwardTarget,
  describeFastForwardEvent,
} from "../../reborn/fastForward.js";
import { latestRevealHint, revealLine } from "../../reborn/reveal.js";
import { roleForTrust, describeTrustChange, TRUST_START } from "../../reborn/trust.js";
import { chooseFocus, TRAINING_FOCI, TRAINING_FOCUS_LABEL, describeGrowth } from "../../reborn/training.js";
import { createTakeoverHook, describeTakeoverOutcome } from "./takeover.js";
import { settleContract, rolloverSeason, describeContract, seasonSummary, contractDecision } from "../../reborn/contract.js";
import { overall } from "../../data/players.js";

let ROWS_CACHE = null;
async function loadRows() {
  if (ROWS_CACHE) return ROWS_CACHE;
  const res = await fetch("./js/data/roster.json");
  const data = await res.json();
  ROWS_CACHE = data.players || [];
  return ROWS_CACHE;
}

export function ensureRebornScreen() {
  let el = document.querySelector("#screen-reborn");
  if (el) return el;
  el = document.createElement("main");
  el.id = "screen-reborn";
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-reborn-back" type="button"><span>返回</span></button><h2>球员重生 · Player Reborn</h2></div><div id="reborn-body"></div>`;
  document.body.appendChild(el);
  return el;
}

const L = (zh, en, lang) => (lang === "en" ? en : zh);

/** The identity card: who you are, your trust, your role. */
export function rebornIdentityHtml({ reborn, card, lang = "zh" } = {}) {
  const name = reborn.identity.revealed ? reborn.identity.name : L("无名试训球员", "Unnamed camp player", lang);
  const trust = reborn.player.coachTrust;
  const role = roleForTrust(trust);
  const roleLabel = { dnp: L("坐冷板凳", "DNP", lang), garbage: L("垃圾时间", "Garbage time", lang), bench: L("板凳末端", "Bench", lang), rotation: L("轮换", "Rotation", lang), starter: L("首发", "Starter", lang) }[role];
  const status = reborn.player.contractStatus;
  // Foreshadowing before the trust-40 reveal: the latest unlocked hint.
  // It never names the player — the reveal module pins that.
  const hint = latestRevealHint(reborn.identity, trust);
  const hintLine = hint ? `<p class="reborn-hint">${hint[lang === "en" ? "en" : "zh"]}</p>` : "";
  return `<section class="reborn-identity"><h3>${name}</h3>`
    + `<p>${reborn.player.teamId} · ${card?.pos || ""} · OVR ${card ? overall(card) : "—"}</p>`
    + `<p>${L("教练信任", "Coach trust", lang)} ${trust} / 100 · ${roleLabel} · ${status}</p>`
    + `<div class="reborn-trust-bar" role="progressbar" aria-valuenow="${trust}" aria-valuemin="0" aria-valuemax="100"><span style="width:${trust}%"></span></div>`
    + hintLine
    + `</section>`;
}

/** The career timeline: season-end contracts and season starts, in order. */
export function careerTimelineHtml({ reborn, lang = "zh" } = {}) {
  const events = (reborn?.timeline?.events || []).filter((e) => e && e.event);
  if (!events.length) return "";
  const lines = events.map((event) => {
    if (event.event === "contract") {
      const label = { resign: L("续约", "Re-signed", lang), minimum: L("底薪留队", "Minimum deal", lang), cut: L("被裁", "Cut", lang) }[event.outcome] || event.outcome;
      return `<p>${event.year} ${L("赛季", "season", lang)}：${label}（${L("信任", "trust", lang)} ${event.trust}，${L("出战", "", lang)} ${event.games} ${L("场，场均", "games, ", lang)} ${event.avgMin} ${L("分钟", "min", lang)}）</p>`;
    }
    if (event.event === "season_start") {
      return `<p>${event.year} ${L("赛季开始", "season starts", lang)}（${L("信任", "trust", lang)} ${event.trust}）</p>`;
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
    `<p>${L("第", "Game ", lang)}${report.game} ${L("场", "", lang)}· ${report.home ? L("主场", "Home", lang) : L("客场", "Away", lang)} vs ${report.opp} · ${report.score.home}–${report.score.away} ${report.won ? L("胜", "W", lang) : L("负", "L", lang)}</p>`,
    `<p>${L("你的数据", "Your line", lang)}：${report.line.min} ${L("分钟", "min", lang)} · ${report.line.pts} ${L("分", "pts", lang)} · ${report.line.reb} ${L("板", "reb", lang)} · ${report.line.ast} ${L("助", "ast", lang)}</p>`,
    `<p>${parts}</p>`,
    ...growth.map((g) => `<p>${g}</p>`),
    ...(takeover ? [`<p>${takeover}</p>`] : []),
  ];
  return `<section class="reborn-report">${lines.join("")}</section>`;
}

export function createRebornView({ getLang, readRootSave, writeRootSave, show, goBack } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  let el = null;
  let rows = null;
  let reborn = null;
  let season = null;
  let lastReport = null;
  let contractOutcome = null;
  let busy = false;
  // The creation flow's selection state (null once a run exists). The seed
  // is fixed when creation opens so the random draw is stable while the
  // player browses the lists.
  let creating = null;
  // The last fast-forward run: { event, reports, trustBefore } — shown as a
  // summary until the next manual game. Null when nothing was simmed yet.
  let ffState = null;
  // True while a fast-forward run is in flight (progress line in render).
  let ffRunning = false;

  const currentWeek = () => Math.floor((season?.index || 0) / 4) + 1;

  function persist() {
    const root = readRootSave() || {};
    root.reborn = reborn;
    writeRootSave(root);
  }

  function rebuildSeason() {
    season = buildSeason(reborn, rows);
    // Resume: the log already records the played games of this year.
    season.index = (reborn.player.seasonLog || []).filter((g) => g.year === season.year).length;
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
    const card = buildPlayerCard(reborn.identity, rows, {
      growth: reborn.player.growth,
      season: season.year,
    });
    const summary = seasonSummary(reborn, season.year);
    const done = season.index >= season.games.length;
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
      rebornIdentityHtml({ reborn, card, lang: lang() }),
      revealBanner,
      `<p>${L("赛季", "Season", lang)} ${season.year} · ${L("第", "Game ", lang)}${Math.min(season.index + 1, season.games.length)}/${season.games.length} ${L("场", "", lang)} · ${summary.wins}${L("胜", "W", lang)}${summary.games - summary.wins}${L("负", "L", lang)}</p>`,
      canTrain
        ? `<section class="reborn-training"><h3>${L(`第 ${week} 周训练`, `Week ${week} training`, lang)}</h3><p>${L("每周选一个训练方向。", "Pick one training focus per week.", lang)}</p><div class="reborn-training-options">${TRAINING_FOCI.map((f) => {
          const label = TRAINING_FOCUS_LABEL[f][lang() === "en" ? "en" : "zh"];
          return `<button type="button" data-train="${f}">${label}</button>`;
        }).join("")}</div></section>`
        : "",
      training && !done
        ? `<p>${L("本周训练：", "This week's training: ", lang)}${TRAINING_FOCUS_LABEL[training.focus][lang() === "en" ? "en" : "zh"]}</p>`
        : "",
      !done
        ? `<button type="button" data-play="1" ${busy ? "disabled" : ""}>${L("打下一场", "Play next game", lang)}${nextGame ? ` (${nextGame.homeId === reborn.player.teamId ? L("主场", "Home", lang) : L("客场", "Away", lang)} vs ${nextGame.homeId === reborn.player.teamId ? nextGame.awayId : nextGame.homeId})` : ""}</button>`
        : "",
      !done && ffLabel
        ? `<button type="button" data-ff="1" ${busy ? "disabled" : ""}>${ffLabel}</button>`
        : "",
      done && !contractOutcome
        ? `<button type="button" data-settle="1">${L("赛季结束，结算合同", "Season over — settle contract", lang)}</button>`
        : "",
      contractOutcome
        ? `<section class="reborn-contract"><p>${describeContract(contractOutcome, lang())}</p><button type="button" data-rollover="1">${L("开始下赛季", "Start next season", lang)}</button></section>`
        : "",
      ffSummary,
      rebornReportHtml({ report: lastReport, lang: lang() }),
      careerTimelineHtml({ reborn, lang: lang() }),
      `<button type="button" data-reset="1">${L("换一个身份（重新开始）", "New identity (restart)", lang)}</button>`,
    ].join("");
    body.innerHTML = html;
  }

  async function playNext() {
    if (busy || !season || season.index >= season.games.length) return;
    busy = true;
    ffState = null;
    render();
    try {
      const week = currentWeek();
      const out = await playGame(reborn, season, rows, {
        onTakeover: createTakeoverHook(),
        trainingDone: reborn.player.training?.week === week,
      });
      if (!out) return;
      reborn = out.reborn;
      lastReport = out.report;
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
    const trustBefore = reborn.player.coachTrust;
    render();
    try {
      const out = await fastForward(reborn, season, rows, {
        onTakeover: createTakeoverHook(),
        onGame: () => render(),
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
    el.querySelector("#btn-reborn-back").addEventListener("click", () => {
      if (typeof goBack === "function") goBack();
      else if (typeof show === "function") show("home");
    });
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
            });
          } catch (e) {
            console.warn(e);
            return;
          }
          creating = null;
          const root = readRootSave() || {};
          root.reborn = reborn;
          writeRootSave(root);
          rebuildSeason();
          contractOutcome = null;
          lastReport = null;
          render();
          return;
        }
        return;
      }
      const train = event.target.closest("[data-train]");
      if (train) {
        try {
          reborn = chooseFocus(reborn, train.dataset.train, currentWeek());
          persist();
          render();
        } catch (e) {
          console.warn(e);
        }
        return;
      }
      if (event.target.closest("[data-play]")) {
        await playNext();
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
        persist();
        render();
        return;
      }
      if (event.target.closest("[data-rollover]")) {
        const rolled = rolloverSeason(reborn, { year: season.year, players: rows });
        reborn = rolled.reborn;
        contractOutcome = null;
        lastReport = null;
        ffState = null;
        rebuildSeason();
        persist();
        render();
        return;
      }
      if (event.target.closest("[data-reset]")) {
        if (!window.confirm(L("确定换一个身份？现在的重生进度会被清除。", "Start over with a new identity? Current progress will be cleared.", lang()))) return;
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
      // browses the lists; the run is created only on confirm.
      creating = {
        seed: `reborn-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
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

  return { open, render };
}
