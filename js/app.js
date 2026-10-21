import {
  accountToTeam,
  canDailyDraw,
  coachRecordLabel,
  createAccount,
  deleteAccount,
  finalizeOnboarding,
  getAccount,
  getActiveAccountId,
  listAccounts,
  performDailyDraw,
  rarityLabel,
  recordRankedResult,
  resolveCoach,
  resolvePlayers,
  ownedCoaches,
  rollCoachOffers,
  rollStarterOffers,
  rollSystemSeven,
  setActiveAccountId,
  setAccountCoach,
  setAccountTactic,
} from "./data/account.js";
import {
  ASSISTANTS,
  COACHES,
  TACTICS,
  applyCoachPhilosophy,
  availableTactics,
  coachSpecialtyLabel,
  coachTactics,
  ensureTeamStaff,
  isLegendCoach,
  isObscureStaff,
  rosterTacticUnlocks,
  tacticUnlockHint,
} from "./data/coaches.js";
import { FRANCHISES, POS_SLOTS, playersForFranchise } from "./data/franchises.js";
import {
  applyLineupPositionEffects,
  isHiddenGem,
  isPlayerAvailable,
  marketMeta,
  playerPrice,
  rollAdvancementInjuries,
  scoutLabel,
  systemFitNote,
  topIntangibles,
  valueLabel,
} from "./data/intangibles.js";
import {
  CUSTOM_BUDGET,
  CUSTOM_REFRESH_COST,
  CUSTOM_ROSTER_SIZE,
  clearPeakPoolCache,
  customPriceOf,
  drawZeroCostPack,
  listPaidPeaks,
} from "./data/customPool.js";
import { photoImg } from "./data/photo.js";
import {
  loadPlayers,
  overall,
  physiqueLabel,
  tendencyLabel,
  PLAYERS,
  clonePlayer,
} from "./data/players.js";
import { initBgm } from "./data/bgm.js";
import { clearRosterCache } from "./data/rosterCache.js";
import {
  clearSave,
  formatSaveLabel,
  hasSave,
  peekSave,
  readSave,
  reviveCareer,
  reviveDraft,
  reviveLegend,
  serializeAppSlice,
  writeSave,
} from "./data/savegame.js";
import {
  ROOT_SAVE_VERSION,
  clearRootSave,
  createRootState,
  exportRootSave,
  importRootSave,
  migrateLegacySaves,
  readRootSave,
  writeRootSave,
} from "./data/saveRoot.js";
import {
  grantSkillToPlayer,
  listAwardSkillCatalog,
  markPurchasedSkill,
  nonDuoSkillCount,
  purchasedSkillsRefund,
  removableSkills,
  removeSkillFromPlayer,
  rollSkillShopOffers,
  skillChipsHtml,
  SKILL_PACKS,
  SKILL_SELL_RATE,
  syncTeamDuoSkills,
} from "./data/skills.js";
import { lineupBallNote, lineupFit, teamChemistry } from "./engine/chemistry.js";
import { autoFillTeam, cpuUpgradeRoster, drawPack, teamPowerLabel } from "./engine/draft.js";
import {
  allPodsDone,
  applyMatchResult,
  buildStagePods,
  careerStageLabel,
  collectAdvancers,
  findYourOpenMatch,
  finalizePod,
  kindLabel,
  listPodMatches,
  nextStageSize,
  progressPodAfterMid,
  progressPodAfterOpeners,
} from "./engine/careerBracket.js";
import {
  advanceLeagueOffseason,
  advancePlayoffs,
  advanceToUserGame,
  claimAwardSkill,
  clearSeasonSave,
  buildCpuTeamForYear,
  computeFinalsAllTeam,
  createSeason,
  loadSeason,
  nextUserGame,
  prepareSeasonState,
  recordUserLiveResult,
  saveSeason,
  seasonProgressLabel,
  seasonTeamIds,
  simAllPlayoffs,
  simScheduledGame,
  simUserNextGame,
  snapFromResultLog,
  standingsList,
  startPlayoffs,
  userGamesPlayed,
} from "./engine/season.js";
import {
  HISTORICAL_CHAMPION_CHALLENGERS,
  HISTORICAL_PLAYOFF_CHALLENGERS,
  challengeTierMeta,
} from "./data/careerChallenges.js";
import { historicalUpsideHint } from "./engine/develop.js";
import {
  HISTORICAL_YEARS,
  historicalSeason,
  listHistoricalYears,
} from "./data/historicalSeasons.js";
import {
  acceptInterviewOffer,
  createTimeTravelPrologue,
  resolveFutureKnowledgeChoice,
} from "./modes/timeTravelCareer.js";
import {
  buildCareerReport,
  finalizeCareerEnding,
  getStoryEvent,
  queueNextStoryEvent,
  queueStoryEvent,
  resolveStoryEvent,
} from "./story/eventEngine.js";
import { summarizeMatchResult } from "./engine/matchExplain.js";
import {
  advanceCareerOffseason,
  completeCareerOffseason,
  createLeagueCareer,
  hasExistingCareerRoot,
  isSeasonProgressMode,
  makeCareerDraftPick,
  prepareCareerOffseason,
  recoverCareerPhase,
  resolveRootLiveGame,
  upgradeLeagueCareerManagement,
} from "./modes/leagueCareer.js";
import {
  careerForPersistence,
  isManagedCareer,
  runCareerTransition,
} from "./modes/leagueCareerPhase.js";
import {
  recommendDevelopmentPlans,
  reconcileDevelopmentPlans,
  setDevelopmentPlan,
} from "./modes/playerDevelopment.js";
import {
  renderCareerHistory,
  renderDevelopmentPlans,
  renderDraftBoard,
} from "./ui/leagueManagementView.js";
import { confirmAction } from "./ui/confirmModal.js";
import {
  SEASON_APRON,
  SEASON_MAX_ROSTER,
  SEASON_MIN_ROSTER,
  SEASON_SALARY_CAP,
  cutPlayer,
  executeTrade,
  fireAssistant,
  fireCoach,
  formatSalary,
  hireAssistant,
  hireCoach,
  payrollSummary,
  playerSalary,
  refreshFreeAgency,
  refreshStaffMarket,
  salaryLine,
  signFreeAgent,
  staffMarketLabel,
  staffSalary,
  upcomingUserGames,
} from "./engine/seasonMarket.js";
import {
  autoFillSeasonDraft,
  drawFranchiseOffers,
  offerLabel,
  resetFranchiseBag,
  rollRandomFranchise,
  seasonDraftOutOfMoney,
  SEASON_DRAFT_TARGET,
} from "./engine/seasonDraft.js";
import {
  FOCUS_PLAYS,
  LINEUP_PACK_DEFS,
  ORDER_ACTION,
  ORDER_ATTACK,
  ORDER_DEF,
  ORDER_AGGRESSION,
  ORDER_HUNT,
  ORDER_USAGE,
  PLAYER_ROLES,
  TEMPO_OPTIONS,
  applyRotationPlan,
  captureRotationPlan,
  staminaMinuteCap,
  staminaMinuteHint,
  suggestTargetMinutes,
  autoBuildAllPacks,
  applyRecommendedDefaults,
  ensurePlayerDefaults,
  ensurePlayerOrders,
  ensureRoles,
  getTempoDef,
  inferPlayerRole,
  markOrdersManual,
  markPlayPosManual,
  normalizeTempo,
  ordersLabel,
  recommendPlayPos,
  suggestedBallHandlerAction,
  usageForBallAction,
} from "./engine/gameplan.js";
import {
  accumulateGameToAllTeamBoard,
  allTeamFromRosters,
  selectAllTeamByPos,
} from "./engine/allTeam.js";
import { CourtView } from "./engine/court.js";
import { GameSim } from "./engine/sim.js";
import {
  confidenceLabel,
  formatGameLine,
  summarizeRecentForm,
  syncFormToTeams,
  tacticalLabel,
} from "./engine/form.js";

/** @deprecated prefer careerStageLabel(stageSize) */
const CAREER_ROUND_LABELS = {
  1: "三十二强 · 32进16",
  2: "十六强 · 16进8",
  3: "八强 · 8进4",
  4: "四强 · 4进2",
  5: "总决赛 · 2进1",
};

const DRAFT_FREE_REFRESHES = 3;
const DRAFT_REFRESH_COST = 40;

const $ = (sel) => document.querySelector(sel);
const screens = {
  loading: $("#screen-loading"),
  home: $("#screen-home"),
  account: $("#screen-account"),
  onboard: $("#screen-onboard"),
  collection: $("#screen-collection"),
  draw: $("#screen-draw"),
  draft: $("#screen-draft"),
  customHub: $("#screen-custom-hub"),
  legend: $("#screen-legend"),
  setup: $("#screen-setup"),
  market: $("#screen-market"),
  game: $("#screen-game"),
  result: $("#screen-result"),
  tournament: $("#screen-tournament"),
  season: $("#screen-season"),
  timeTravel: $("#screen-time-travel"),
};

let state = {
  mode: null,
  draft: null,
  setup: null,
  pendingMatch: null,
  career: null,
  sim: null,
  speed: 1,
  tournament: null,
  legend: null,
  season: null,
  leagueCareer: null,
  story: null,
  longCareerRoot: null,
  seasonPendingGame: null,
  seasonRosterDraft: null,
  lastMode: null,
  lineupSig: "",
  court: null,
  subOutId: null,
  subInId: null,
  onboard: null,
  managed: false,
};
let timeTravelPrologue = null;

function show(name) {
  Object.values(screens).forEach((el) => el && el.classList.remove("active"));
  screens[name].classList.add("active");
  if (name === "home") {
    refreshAccountHomeBar();
    refreshSaveHomeBar();
    refreshLongCareerHomeBar();
  }
}

function activeScreenName() {
  for (const [k, el] of Object.entries(screens)) {
    if (el?.classList.contains("active")) return k;
  }
  return "home";
}

function buildSaveLabel() {
  if (state.sim) {
    const s = state.sim.snapshot();
    const q = s.quarter > 4 ? "OT" : `Q${s.quarter}`;
    return `比赛 ${q} ${s.score.home}-${s.score.away}`;
  }
  if (state.draft) {
    const a = state.draft.teams?.A?.players?.length ?? 0;
    const b = state.draft.teams?.B?.players?.length ?? 0;
    return `选秀 ${state.draft.mode || state.mode || ""} · ${a}/${b}人`;
  }
  if (state.setup) return `赛前选首发 ${state.setup.selected?.size ?? 0}/5`;
  if (state.legend) return `传奇组队 · 已选 ${state.legend.roster?.length ?? 0}`;
  if (state.career?.kind === "career") {
    const tier = challengeTierMeta(state.career.challengeTier || "gold");
    const stage = careerStageLabel(state.career.stageSize, {
      finals: !!state.career.finals,
    });
    return `${tier.name} · ${stage}`;
  }
  if (state.career?.kind === "duel") return `双人模式进度`;
  if (state.tournament) return `淘汰赛进度`;
  return `进度 · ${state.mode || activeScreenName()}`;
}

/** 金币晋级赛自动存档（静默），防止误退丢进度 */
function autosaveCareer() {
  if (!state.career || state.career.kind !== "career") return false;
  const screen = activeScreenName();
  let forceScreen = "market";
  if (state.sim) forceScreen = "game";
  else if (screen === "setup" && state.pendingMatch) forceScreen = "setup";
  return saveProgress({ silent: true, forceScreen });
}

function collectFeedLines() {
  const feed = $("#play-feed");
  if (!feed) return [];
  return [...feed.querySelectorAll(".event")]
    .slice(0, 24)
    .map((el) => ({
      type: el.classList.contains("score")
        ? "score"
        : el.classList.contains("coach")
          ? "coach"
          : el.classList.contains("miss")
            ? "miss"
            : "event",
      text: el.textContent || "",
    }));
}

function clonePersistedState(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function currentRootState({ liveGame = "preserve" } = {}) {
  const leagueCareer = careerForPersistence(state.leagueCareer, state.season);
  const includedLiveGame = liveGame === "include" && state.sim
    ? {
        context: state.pendingMatch,
        seasonPendingGame: state.seasonPendingGame,
        sim: state.sim.exportState(),
        feed: collectFeedLines(),
        manualOverrides: state.leagueCareer?.manualOverrides || {},
      }
    : null;
  return createRootState({
    activeMode: state.mode === "timeTravel" ? "timeTravel" : "franchise",
    profile: {
      accountId: getActiveAccountId() || null,
      settings: {},
      accessibility: {},
    },
    leagueCareer,
    story: state.story,
    liveGame: resolveRootLiveGame(
      liveGame,
      includedLiveGame,
      state.longCareerRoot?.liveGame,
    ),
  });
}

function saveLongCareer({ liveGame = "preserve" } = {}) {
  if (!state.leagueCareer) return false;
  try {
    const persisted = writeRootSave(currentRootState({ liveGame }));
    state.longCareerRoot = clonePersistedState(persisted);
    refreshLongCareerHomeBar();
    return true;
  } catch (error) {
    console.error("[long-career-save]", error);
    return false;
  }
}

function restoreLongCareerCheckpoint(root) {
  if (!root) return;
  const active = clonePersistedState(root);
  state.longCareerRoot = clonePersistedState(root);
  state.leagueCareer = active.leagueCareer;
  state.story = active.story;
  state.season = active.leagueCareer?.season ?? null;
}

function resumeLongCareer(root = readRootSave()) {
  if (!root?.leagueCareer?.season) return false;
  const active = clonePersistedState(root);
  const beforeManagement = JSON.stringify(active.leagueCareer.management);
  active.leagueCareer = recoverCareerPhase(
    upgradeLeagueCareerManagement(active.leagueCareer),
  );
  if (JSON.stringify(active.leagueCareer.management) !== beforeManagement) {
    try {
      writeRootSave(active);
    } catch (error) {
      console.warn("[long-career-upgrade-save]", error);
      alert("旧存档已在内存中升级，但暂时无法写回浏览器存储；你仍可继续游玩，请稍后手动保存。");
    }
  }
  state.mode = active.activeMode;
  state.leagueCareer = active.leagueCareer;
  state.story = active.story;
  state.longCareerRoot = clonePersistedState(active);
  state.season = active.leagueCareer.season;
  if (active.liveGame?.sim) {
    try {
      if (active.liveGame.manualOverrides) {
        state.leagueCareer = {
          ...state.leagueCareer,
          manualOverrides: clonePersistedState(active.liveGame.manualOverrides),
        };
      }
      const context = active.liveGame.context || {};
      state.pendingMatch = context;
      const savedSeasonGame = active.liveGame.seasonPendingGame;
      state.seasonPendingGame = savedSeasonGame
        ? state.season.schedule
            ?.flat()
            .find(
              (game) =>
                !game.played
                && game.homeId === savedSeasonGame.homeId
                && game.awayId === savedSeasonGame.awayId,
            ) || savedSeasonGame
        : null;
      const homeTeam = context.home || {
        name: active.liveGame.sim.home?.name,
        players: active.liveGame.sim.home?.roster,
        coach: active.liveGame.sim.home?.coach,
      };
      const awayTeam = context.away || {
        name: active.liveGame.sim.away?.name,
        players: active.liveGame.sim.away?.roster,
        coach: active.liveGame.sim.away?.coach,
      };
      restoreSavedGame({
        simSave: active.liveGame.sim,
        context,
        feed: active.liveGame.feed,
        homeTeam,
        awayTeam,
      });
      return true;
    } catch (error) {
      console.error("[long-career-resume]", error);
      alert(`长期生涯比赛恢复失败：${error?.message || error}`);
      show("home");
      return false;
    }
  }
  if (state.story?.pendingDecision && screens.timeTravel) {
    timeTravelPrologue = null;
    renderTimeTravelStoryState();
    show("timeTravel");
  } else {
    show("season");
    renderSeasonHub();
    showSeasonTab(state.leagueCareer?.phase === "draft" ? "draftBoard" : "standings");
  }
  return true;
}

function refreshLongCareerHomeBar() {
  const bar = $("#long-career-home-bar");
  const meta = $("#long-career-home-meta");
  if (!bar || !meta) return;
  const root = state.longCareerRoot || readRootSave();
  const career = root?.leagueCareer;
  if (!career) {
    bar.hidden = true;
    return;
  }
  const season = career.season;
  const team = season?.teams?.[season.userTeamId];
  const story = root.story;
  const details = [
    team?.name || "未命名球队",
    `${story?.startYear ?? season?.year ?? "—"} → ${season?.year ?? "—"}`,
    `阶段：${career.phase || season?.phase || "—"}`,
  ];
  if (story && Number.isFinite(story.futureKnowledge)) {
    details.push(`未来知识 ${story.futureKnowledge}`);
  }
  if (story && Number.isFinite(story.frontOfficeTrust)) {
    details.push(`管理层信任 ${story.frontOfficeTrust}`);
  }
  meta.textContent = details.join(" · ");
  bar.hidden = false;
}

function setTimeTravelStatus(message, isError = false) {
  const status = $("#time-travel-status");
  if (!status) return;
  status.textContent = message || "";
  status.style.color = isError ? "var(--bad)" : "";
}

function ensureTimeTravelYears() {
  const select = $("#time-travel-year");
  if (!select || select.options.length) return;
  const years = listHistoricalYears().sort((a, b) => b - a);
  for (const year of years) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    select.appendChild(option);
  }
  select.value = years.includes(1991) ? "1991" : String(years[0] || "");
}

function renderTimeTravelResources() {
  const story = state.story;
  const resources = $("#time-travel-resources");
  if (!resources || !story) return;
  resources.innerHTML = [
    `未来知识 <strong>${story.futureKnowledge ?? 0}</strong>`,
    `管理层信任 <strong>${story.frontOfficeTrust ?? 0}</strong>`,
    `媒体压力 <strong>${story.mediaPressure ?? 0}</strong>`,
    `时间线偏离 <strong>${story.timelineDivergence ?? 0}</strong>`,
  ]
    .map((item) => `<span>${item}</span>`)
    .join("");
}

function renderTimeTravelReport() {
  const card = $("#time-travel-report");
  const text = $("#time-travel-report-text");
  const status = $("#time-travel-report-status");
  const seasons = $("#time-travel-report-seasons");
  const list = $("#time-travel-report-list");
  if (!card || !text || !state.leagueCareer || !state.story) return;
  const report = buildCareerReport(currentRootState());
  const latest = report.seasons.at(-1);
  card.hidden = report.choices === 0;
  if (card.hidden) return;
  const record = latest?.record ? `${latest.record.w}胜${latest.record.l}负` : "赛季尚未结算";
  const ending = report.ending ? ` · 当前结局倾向：${report.ending.label}` : "";
  text.textContent = `${report.currentYear} · ${record} · 已作出 ${report.choices} 个故事选择 · 时间线偏离 ${report.timelineDivergence} · 管理层信任 ${report.frontOfficeTrust}${ending}`;
  if (status) {
    status.textContent = report.finished
      ? `五年篇章已完成 · 冠军 ${report.championships} 次${report.ending ? ` · 结局：${report.ending.label}` : ""}`
      : `五年篇章进度：${report.seasonCount}/${report.maxSeasons}`;
  }
  if (seasons) {
    seasons.innerHTML = "";
    for (const season of report.seasons) {
      const item = document.createElement("li");
      const score = season.record ? `${season.record.w}胜${season.record.l}负` : "无战绩";
      item.textContent = `${season.year} · ${score} · ${season.champion ? "夺冠" : season.finish || "赛季进行中"}`;
      seasons.appendChild(item);
    }
  }
  if (list) {
    list.innerHTML = "";
    for (const change of report.historyChanges) {
      const item = document.createElement("li");
      item.textContent = `${change.year}：史实冠军 ${change.historicalChampion} → 当前时间线 ${change.currentChampion}`;
      list.appendChild(item);
    }
    if (!report.historyChanges.length) {
      const item = document.createElement("li");
      item.textContent = "目前还没有改写史实冠军，分叉仍在积累。";
      list.appendChild(item);
    }
  }
}

function renderPendingStoryEvent() {
  const card = $("#time-travel-event");
  const title = $("#time-travel-event-title");
  const prompt = $("#time-travel-event-prompt");
  const choices = $("#time-travel-event-choices");
  const pending = state.story?.pendingDecision;
  const isEvent = pending?.type === "story-event";
  if (!card || !title || !prompt || !choices) return;
  card.hidden = !isEvent;
  if (!isEvent) {
    choices.innerHTML = "";
    return;
  }
  const event = getStoryEvent(pending.eventId);
  title.textContent = event.title;
  prompt.textContent = event.prompt;
  choices.innerHTML = "";
  for (const choice of event.choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn story-event-choice";
    button.dataset.eventChoice = choice.id;
    button.innerHTML = `<strong>${choice.label}</strong><span>${choice.description}</span>`;
    button.addEventListener("click", () => resolvePendingStoryEvent(choice.id));
    choices.appendChild(button);
  }
}

function queueNextTimeTravelEvent() {
  if (state.leagueCareer?.kind !== "timeTravel" || !state.story) return;
  const root = state.longCareerRoot || currentRootState();
  const next = queueNextStoryEvent(root, { year: state.season?.year });
  const finalized = next === root ? finalizeCareerEnding(root) : next;
  if (finalized === root) return;
  state.story = finalized.story;
  state.longCareerRoot = finalized;
  saveLongCareer();
}

function resolvePendingStoryEvent(choiceId) {
  try {
    const resolved = resolveStoryEvent(currentRootState(), choiceId);
    const root = queueNextStoryEvent(resolved, {
      year: resolved.leagueCareer?.season?.year,
    });
    state.mode = root.activeMode;
    state.leagueCareer = root.leagueCareer;
    state.story = root.story;
    state.season = root.leagueCareer?.season || state.season;
    state.longCareerRoot = root;
    if (!saveLongCareer()) throw new Error("存档写入失败，这次事件尚未生效");
    setTimeTravelStatus("事件已记录。你的选择会在赛季总结和后续时间线中留下痕迹。");
    renderTimeTravelStoryState();
  } catch (error) {
    setTimeTravelStatus(error?.message || "无法处理这个事件", true);
  }
}

function renderTimeTravelStoryState({ showResolved = false } = {}) {
  const create = $("#time-travel-create");
  const offers = $("#time-travel-offers");
  const decision = $("#time-travel-decision");
  const continueButton = $("#btn-time-travel-continue");
  const pending = state.story?.pendingDecision === "future-knowledge-intro";
  const resolved = !!state.story?.flags?.futureKnowledgeIntroResolved;
  if (create) create.hidden = !!state.leagueCareer;
  if (offers && !timeTravelPrologue) offers.hidden = true;
  if (decision) decision.hidden = !(pending || (showResolved && resolved));
  if (continueButton) continueButton.hidden = !state.leagueCareer || pending || state.story?.pendingDecision?.type === "story-event";
  renderTimeTravelResources();
  renderPendingStoryEvent();
  renderTimeTravelReport();
  document.querySelectorAll("[data-story-choice]").forEach((button) => {
    button.disabled = !pending;
  });
}

function renderTimeTravelOffers() {
  const box = $("#time-travel-offers");
  if (!box || !timeTravelPrologue) return;
  const labels = {
    rebuild: "重建队",
    middle: "中游队",
    contender: "争冠队",
  };
  box.innerHTML = "";
  for (const offer of timeTravelPrologue.offers.slice(0, 3)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "interview-offer";
    button.dataset.offerId = offer.id;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute(
      "aria-label",
      `${offer.teamName}，${labels[offer.archetype]}面试邀请。${offer.summary}。首年目标：${offer.firstYearGoal}。权限 ${offer.authority}，信任 ${offer.trust}，压力 ${offer.pressure}`
    );
    button.innerHTML = `
      <span>${labels[offer.archetype]}</span>
      <strong>${offer.teamName}</strong>
      <span>${offer.summary}</span>
      <span>首年目标：${offer.firstYearGoal}</span>
      <div class="interview-metrics">
        <span>权限 ${offer.authority}</span>
        <span>信任 ${offer.trust}</span>
        <span>压力 ${offer.pressure}</span>
      </div>`;
    button.addEventListener("click", async () => {
      if (state.leagueCareer?.kind === "timeTravel") return;
      const existingRoot = state.longCareerRoot || readRootSave();
      if (
        hasExistingCareerRoot(existingRoot)
        && !(await confirmAction("接受新邀请将替换当前长期生涯存档，确定继续？", {
          title: "覆盖长期生涯？",
          acceptLabel: "覆盖并继续",
        }))
      ) return;
      const previous = {
        mode: state.mode,
        leagueCareer: state.leagueCareer,
        story: state.story,
        season: state.season,
        longCareerRoot: state.longCareerRoot,
        selectedOfferId: timeTravelPrologue.selectedOfferId,
      };
      try {
        const root = acceptInterviewOffer(timeTravelPrologue, offer.id);
        state.mode = root.activeMode;
        state.leagueCareer = root.leagueCareer;
        state.story = root.story;
        state.season = root.leagueCareer.season;
        state.longCareerRoot = root;
        timeTravelPrologue.selectedOfferId = offer.id;
        if (!saveLongCareer()) {
          state.mode = previous.mode;
          state.leagueCareer = previous.leagueCareer;
          state.story = previous.story;
          state.season = previous.season;
          state.longCareerRoot = previous.longCareerRoot;
          timeTravelPrologue.selectedOfferId = previous.selectedOfferId;
          throw new Error("存档写入失败，尚未接受球队邀请");
        }
        box.querySelectorAll(".interview-offer").forEach((candidate) => {
          const selected = candidate.dataset.offerId === offer.id;
          candidate.classList.toggle("selected", selected);
          candidate.setAttribute("aria-pressed", String(selected));
          candidate.disabled = true;
        });
        setTimeTravelStatus(`已接受 ${offer.teamName} 的邀请，先决定如何使用未来知识。`);
        renderTimeTravelStoryState();
      } catch (error) {
        setTimeTravelStatus(error?.message || "无法接受球队邀请", true);
      }
    });
    box.appendChild(button);
  }
  box.hidden = false;
}

function openTimeTravelScreen() {
  ensureTimeTravelYears();
  const hasCareer = state.leagueCareer?.kind === "timeTravel";
  if (hasCareer) {
    if (state.story?.pendingDecision) {
      renderTimeTravelStoryState();
      setTimeTravelStatus("继续完成序章决定。");
    } else {
      $("#time-travel-create").hidden = true;
      $("#time-travel-offers").hidden = true;
      $("#time-travel-decision").hidden = true;
      $("#btn-time-travel-continue").hidden = false;
      setTimeTravelStatus("生涯已经建立，可以继续进入赛季中心。");
    }
  } else {
    timeTravelPrologue = null;
    $("#time-travel-create").hidden = false;
    $("#time-travel-offers").hidden = true;
    $("#time-travel-offers").innerHTML = "";
    $("#time-travel-decision").hidden = true;
    $("#time-travel-event").hidden = true;
    $("#time-travel-report").hidden = true;
    $("#btn-time-travel-continue").hidden = true;
    setTimeTravelStatus("");
  }
  show("timeTravel");
}

$("#btn-time-travel-back")?.addEventListener("click", () => show("home"));
$("#btn-time-travel-interview")?.addEventListener("click", () => {
  try {
    const year = Number($("#time-travel-year")?.value);
    const philosophy = $("#time-travel-philosophy")?.value;
    const seed = Date.now() >>> 0;
    timeTravelPrologue = createTimeTravelPrologue({ year, philosophy, seed });
    renderTimeTravelOffers();
    setTimeTravelStatus("收到三份面试邀请，请选择你的历史起点。");
  } catch (error) {
    setTimeTravelStatus(error?.message || "无法生成面试邀请", true);
  }
});
document.querySelectorAll("[data-story-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.story?.pendingDecision !== "future-knowledge-intro") return;
    const previous = {
      mode: state.mode,
      leagueCareer: state.leagueCareer,
      story: state.story,
      season: state.season,
      longCareerRoot: state.longCareerRoot,
    };
    document.querySelectorAll("[data-story-choice]").forEach((choice) => {
      choice.disabled = true;
    });
    try {
      const resolvedRoot = resolveFutureKnowledgeChoice(currentRootState(), button.dataset.storyChoice);
      const root = queueStoryEvent(resolvedRoot, "first-year-owner-test", {
        year: resolvedRoot.leagueCareer?.season?.year,
      });
      state.mode = root.activeMode;
      state.leagueCareer = root.leagueCareer;
      state.story = root.story;
      state.season = root.leagueCareer.season;
      state.longCareerRoot = root;
      if (!saveLongCareer()) {
        state.mode = previous.mode;
        state.leagueCareer = previous.leagueCareer;
        state.story = previous.story;
        state.season = previous.season;
        state.longCareerRoot = previous.longCareerRoot;
        throw new Error("存档写入失败，这次决定尚未生效");
      }
      setTimeTravelStatus("决定已保存。资源与时间线已更新。");
      renderTimeTravelStoryState({ showResolved: true });
    } catch (error) {
      setTimeTravelStatus(error?.message || "无法处理这个决定", true);
      renderTimeTravelStoryState();
    }
  });
});
$("#btn-time-travel-continue")?.addEventListener("click", () => {
  if (!state.leagueCareer?.season) return;
  state.season = state.leagueCareer.season;
  renderSeasonHub();
  show("season");
  showSeasonTab("standings");
});

$("#btn-long-career-resume")?.addEventListener("click", () => {
  resumeLongCareer(state.longCareerRoot || readRootSave());
});
$("#btn-long-career-export")?.addEventListener("click", () => {
  const root = state.longCareerRoot || readRootSave();
  if (!root?.leagueCareer) return;
  try {
    const blob = new Blob([exportRootSave(root)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "courtside-legends-save.json";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error?.message || "导出存档失败");
  }
});
$("#btn-long-career-import")?.addEventListener("click", () => {
  $("#long-career-import-file")?.click();
});
$("#long-career-import-file")?.addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const imported = importRootSave(await file.text());
    if (!(await confirmAction("导入将替换当前长期生涯存档，确定继续？", {
      title: "导入长期生涯？",
      acceptLabel: "导入并覆盖",
    }))) return;
    const persisted = writeRootSave(imported);
    state.longCareerRoot = persisted;
    refreshLongCareerHomeBar();
    resumeLongCareer(persisted);
  } catch (error) {
    alert(error?.message || "导入存档失败");
  } finally {
    input.value = "";
  }
});

function saveSeasonAndCareer(st = state.season, { liveGame = "preserve" } = {}) {
  if (state.leagueCareer && st === state.season) {
    const checkpoint = clonePersistedState(state.longCareerRoot);
    state.leagueCareer = careerForPersistence(state.leagueCareer, st);
    if (!saveLongCareer({ liveGame })) {
      restoreLongCareerCheckpoint(checkpoint);
      alert("长期生涯保存失败，刚才的改动已撤销。请检查浏览器存储空间后重试。");
      return false;
    }
    if (!saveSeason(st)) {
      console.warn("[season-compat-save] 根存档已保存，但兼容赛季存档写入失败");
    }
    return true;
  }
  const seasonSaved = saveSeason(st);
  if (!seasonSaved) {
    alert("赛季保存失败：可能是存档太大或浏览器存储空间不足。");
  }
  return seasonSaved;
}

function commitManagedCareer(career, activeTab) {
  if (!career?.season) return false;
  const previous = {
    leagueCareer: state.leagueCareer,
    season: state.season,
    longCareerRoot: state.longCareerRoot,
  };
  state.leagueCareer = career;
  state.season = career.season;
  if (!saveSeasonAndCareer(state.season)) {
    if (!state.longCareerRoot) {
      state.leagueCareer = previous.leagueCareer;
      state.season = previous.season;
      state.longCareerRoot = previous.longCareerRoot;
    }
    renderSeasonHub({ persist: false });
    showSeasonTab(state.leagueCareer?.phase === "draft" ? "draftBoard" : activeTab);
    return false;
  }
  renderSeasonHub({ persist: false });
  showSeasonTab(activeTab);
  return true;
}

/** 保存当前进度到本机（可中途离开，回来继续）。 */
function saveProgress({ andGoHome = false, silent = false, forceScreen = null } = {}) {
  const screen = activeScreenName();
  const savable = ["game", "draft", "setup", "market", "legend", "tournament", "result"].includes(
    screen
  );
  if (
    !savable
    && !state.sim
    && !state.draft
    && !state.career
    && !state.legend
    && !state.leagueCareer
  ) {
    if (!silent) alert("当前没有可保存的进度（请在比赛、选秀、赛前或晋级赛中保存）");
    return false;
  }
  try {
    if (state.sim && !state.sim.paused) {
      state.sim.setPaused(true, "manual");
      syncPauseUI(state.sim.snapshot());
    }
    if (state.draft?._cpuTimer) {
      clearTimeout(state.draft._cpuTimer);
      state.draft._cpuTimer = null;
    }
    if (state.leagueCareer) {
      const saved = saveLongCareer({
        liveGame: state.sim ? "include" : "preserve",
      });
      if (!saved) {
        if (!silent) alert("长期生涯进度保存失败，请重试。");
        return false;
      }
      if (!silent) {
        const tip = andGoHome
          ? "长期生涯进度已保存。可随时在首页继续。"
          : "长期生涯进度已保存到本机。";
        if (state.sim) pushFeed("coach", tip);
        else alert(tip);
      }
      if (andGoHome) {
        if (state.sim) state.sim.stop();
        state.sim = null;
        show("home");
      }
      return true;
    }
    const payload = {
      screen: state.sim ? "game" : screen === "home" ? "game" : screen,
      label: buildSaveLabel(),
      app: serializeAppSlice(state),
      sim: state.sim ? state.sim.exportState() : null,
      feed: collectFeedLines(),
    };
    // Prefer game screen if sim exists
    if (forceScreen) payload.screen = forceScreen;
    else if (state.sim) payload.screen = "game";
    else if (state.draft) payload.screen = "draft";
    else if (state.setup) payload.screen = "setup";
    else if (state.legend) payload.screen = "legend";
    else if (state.career) payload.screen = "market";
    else if (state.tournament) payload.screen = "tournament";

    writeSave(payload);
    if (!silent) {
      const tip = andGoHome ? "进度已保存。可随时在首页点「继续进度」。" : "进度已保存到本机。";
      if (state.sim) pushFeed("coach", tip);
      else alert(tip);
    }
    refreshSaveHomeBar();
    if (andGoHome) {
      if (state.sim) state.sim.stop();
      state.sim = null;
      show("home");
    }
    return true;
  } catch (err) {
    console.error("[save]", err);
    if (!silent) alert("保存失败：可能是存档太大或浏览器限制。请再试一次。");
    return false;
  }
}

function refreshSaveHomeBar() {
  const bar = $("#save-home-bar");
  const meta = $("#save-home-meta");
  const btnCont = $("#btn-continue-save");
  const btnClear = $("#btn-clear-save");
  if (!bar) return;
  const peek = peekSave();
  if (!peek) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  if (meta) meta.textContent = formatSaveLabel(peek);
  if (btnCont) btnCont.disabled = false;
  if (btnClear) btnClear.disabled = false;
}

function restoreFeed(lines) {
  const feed = $("#play-feed");
  if (!feed || !lines?.length) return;
  feed.innerHTML = "";
  // saved newest-first; prepend in reverse so oldest ends at bottom
  for (const line of [...lines].reverse()) {
    pushFeed(line.type || "event", line.text || "");
  }
}

function wireRestoredSim(sim, homeTeam, awayTeam, youSide) {
  if (state.sim) state.sim.stop();
  state.sim = sim;
  state.lineupSig = "";
  state.subOutId = null;
  state.subInId = null;
  state.court = new CourtView($("#court-root"));
  state.court.ensureDom();
  $("#game-team-a").textContent = homeTeam?.name || sim.home.name;
  $("#game-team-b").textContent = awayTeam?.name || sim.away.name;
  $("#you-side").textContent =
    youSide === "home" ? $("#game-team-a").textContent : $("#game-team-b").textContent;

  const isDraftGame = state.mode === "draft" || state.mode === "duel" || state.mode === "custom";
  state.speed = sim.speed || 1;
  const speedBtn = $("#btn-speed");
  if (speedBtn) {
    speedBtn.hidden = isDraftGame;
    const label = state.speed === 1 ? "真实" : state.speed === 2 ? "加速" : "最快";
    speedBtn.textContent = `速度 x${state.speed} · ${label}`;
  }
  state.managed = !!sim.managed;
  syncManagedUI();

  const you = youSide === "home" ? sim.home : sim.away;
  fillTacticSelect(you);
  syncLivePhilFromCoach(you.coach);
  initFocusAndPacksUI(homeTeam || sim.home, awayTeam || sim.away, youSide);

  show("game");
  const snap0 = sim.snapshot();
  paintScore(snap0);
  paintLineups(snap0);
  paintMeters(snap0);
  fillSubSelects(snap0, true);
  state.court.render(snap0);
  syncPauseUI(snap0);
  pushFeed("coach", "已读取存档——点「继续比赛」接着打");
}

function restoreSavedGame({ simSave, context = {}, feed = [], homeTeam, awayTeam, onFinished }) {
  const youSide = simSave.youSide || context.youSide || "home";
  const sim = GameSim.fromSave(simSave, {
    onEvent: (event) => handleSimEvent(event),
    onTick: (snap) => {
      try {
        paintScore(snap);
        paintLineups(snap);
        paintMeters(snap);
        fillSubSelects(snap);
        state.court?.render(snap);
        syncPauseUI(snap);
      } catch (error) {
        console.error("[ui] onTick", error);
      }
    },
    onEnd: (snap) => {
      syncInjuriesToTeams(sim, homeTeam, awayTeam);
      const formNotes = syncFormToTeams(sim, homeTeam, awayTeam);
      showResult(snap, { formNotes });
      onFinished?.();
    },
  });
  const feedElement = $("#play-feed");
  if (feedElement) feedElement.innerHTML = "";
  wireRestoredSim(sim, homeTeam, awayTeam, youSide);
  restoreFeed(feed);
  return sim;
}

/** 从本机存档恢复。 */
function continueFromSave() {
  const data = readSave();
  if (!data?.app) {
    alert("没有找到存档");
    refreshSaveHomeBar();
    return;
  }
  try {
    const app = data.app;
    state.mode = app.mode;
    state.lastMode = app.lastMode || app.mode;
    state.speed = app.speed || 1;
    state.managed = !!app.managed;
    state.career = reviveCareer(app.career);
    state.tournament = app.tournament || null;
    state.legend = reviveLegend(app.legend);
    state.draft = reviveDraft(app.draft);
    state.pendingMatch = app.pendingMatch || null;
    state.setup = null;

    if (data.sim) {
      const homeTeam = state.pendingMatch?.home || {
        name: data.sim.home.name,
        players: data.sim.home.roster,
        coach: data.sim.home.coach,
      };
      const awayTeam = state.pendingMatch?.away || {
        name: data.sim.away.name,
        players: data.sim.away.roster,
        coach: data.sim.away.coach,
      };
      restoreSavedGame({
        simSave: data.sim,
        context: state.pendingMatch || {},
        feed: data.feed,
        homeTeam,
        awayTeam,
        onFinished: () => {
          if (state.career?.kind === "career") autosaveCareer();
          else clearSave();
          refreshSaveHomeBar();
        },
      });
      return;
    }

    if (data.screen === "draft" && state.draft) {
      show("draft");
      $("#draft-title").textContent =
        state.draft.mode === "custom"
          ? "自定义对战 · 先花 15 块再补 0 块"
          : state.draft.mode === "duel"
            ? "双人对抗 · 金币买球员（刷新另计）"
            : "选秀建队";
      $("#roster-a-title").textContent = state.draft.teams.A.name;
      $("#roster-b-title").textContent = state.draft.teams.B.name;
      if (typeof updateCustomDraftChrome === "function") updateCustomDraftChrome();
      refreshDraftUI();
      renderPack();
      updateRefreshBtn();
      $("#btn-start-game").disabled = !isDraftDone(state.draft);
      return;
    }

    if (data.screen === "setup" && state.pendingMatch) {
      const { home, away, youSide } = state.pendingMatch;
      const savedIds = app.setup?.selected || [];
      openSetup(home, away, youSide);
      if (savedIds.length && state.setup) {
        state.setup.selected = new Set(savedIds);
        renderSetupRoster();
        renderSetupRoles();
        renderSetupOrders();
        renderSetupGameplan();
      }
      return;
    }

    if (data.screen === "legend" && state.legend) {
      show("legend");
      const L = state.legend;
      const chipBox = $("#legend-franchises");
      if (chipBox && L.franchises?.length) {
        chipBox.innerHTML = L.franchises
          .map(
            (f) =>
              `<span class="franchise-chip" data-id="${f.id}">${f.name} <small>${f.id}</small></span>`
          )
          .join("");
      }
      $("#legend-pos").innerHTML = POS_SLOTS.map(
        (s) =>
          `<label><input type="radio" name="legend-pos" value="${s.id}" ${
            s.id === (L.pickPos || "SF") ? "checked" : ""
          }/> ${s.label}</label>`
      ).join("");
      $("#legend-pos").onchange = () => {
        const v = $("#legend-pos").querySelector("input:checked")?.value;
        if (v) state.legend.pickPos = v;
      };
      markLegendFranchiseChips(L);
      renderLegendRoster();
      // 重新刷当前队可选池（不推进队列）
      if (L.current) {
        L.franchiseQueue = [L.current, ...(L.franchiseQueue || []).filter((f) => f.id !== L.current.id)];
      }
      rollLegendTeam();
      return;
    }

    if (data.screen === "market" && state.career) {
      openMarket({
        career: state.career.kind === "career",
        duel: state.career.kind === "duel",
      });
      return;
    }

    if (data.screen === "tournament" && state.tournament) {
      show("tournament");
      return;
    }

    alert("存档内容不完整，无法继续。已留在首页。");
    show("home");
  } catch (err) {
    console.error("[load]", err);
    alert("读取存档失败：" + (err?.message || err));
  }
}

document.querySelectorAll(".mode-card[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => startMode(btn.dataset.mode));
});

function startMode(mode) {
  if (!mode) return;
  if (mode === "timeTravel") {
    state.mode = mode;
    state.lastMode = mode;
    openTimeTravelScreen();
    return;
  }
  state.mode = mode;
  state.lastMode = mode;
  state.career = null;
  state.tournament = null;
  state.legend = null;
  if (!["season", "franchise"].includes(mode)) state.seasonPendingGame = null;
  if (mode === "ranked") {
    startRankedMatch();
    return;
  }
  if (mode === "custom") {
    show("customHub");
    return;
  }
  if (mode === "season" || mode === "franchise") {
    seasonSetupKind = mode;
    state.leagueCareer = null;
    state.story = null;
    state.season = null;
    state.seasonPendingGame = null;
    openSeasonScreen();
    return;
  }
  if (mode === "quick") {
    const home = autoFillTeam("主队传奇", 10);
    const away = autoFillTeam("客队传奇", 10);
    openSetup(home, away, "home");
    return;
  }
  if (mode === "legend") {
    startLegendMode();
    return;
  }
  if (mode === "career") {
    startCareer(false);
    return;
  }
  if (mode === "tournament") {
    show("tournament");
    return;
  }
  initDraft(mode);
  show("draft");
}

$("#btn-custom-hub-back")?.addEventListener("click", () => show("home"));
$("#btn-custom-budget")?.addEventListener("click", () => {
  state.mode = "custom";
  state.lastMode = "custom";
  initDraft("custom");
  show("draft");
});
$("#btn-custom-duel")?.addEventListener("click", () => {
  state.mode = "duel";
  state.lastMode = "duel";
  initDraft("duel");
  show("draft");
});
$("#btn-custom-legend")?.addEventListener("click", () => {
  state.mode = "legend";
  state.lastMode = "legend";
  startLegendMode();
});

$("#btn-draft-back").onclick = () => {
  if (state.mode === "custom" || state.lastMode === "custom") show("customHub");
  else show("home");
};
$("#btn-tour-back").onclick = () => show("home");
$("#btn-legend-back").onclick = () => show("home");
$("#btn-setup-back").onclick = () => {
  // 选完首发后仍可回市场装技能 / 调阵容
  const c = state.career;
  if (c?.kind === "career") {
    openMarket({ career: true });
    return;
  }
  if (c?.kind === "duel") {
    openMarket({ duel: true });
    return;
  }
  show("home");
};
$("#btn-home").onclick = () => show("home");
$("#btn-again").onclick = () => {
  // Rematch / new run — warn if abandoning an active career roster
  const abandoning =
    state.career?.kind === "career" ||
    state.career?.kind === "duel" ||
    state.tournament;
  if (
    abandoning &&
    !confirm("再来一局会清空当前阵容与进度，重新开局。若要保留阵容请点「备战下一轮」。确定重开？")
  ) {
    return;
  }
  startMode(state.lastMode || "quick");
};

// —— Account binder (persistent collection) ——
function activeAccount() {
  return getAccount(getActiveAccountId());
}

function requireAccountReady() {
  const acc = activeAccount();
  if (!acc) {
    show("account");
    renderAccountList();
    return null;
  }
  if (!acc.onboardingDone || (acc.playerIds || []).length < 12 || !acc.coachId) {
    startOnboarding(acc);
    return null;
  }
  return acc;
}

function refreshAccountHomeBar() {
  const chip = $("#btn-account-chip");
  const nameEl = $("#account-home-name");
  const metaEl = $("#account-home-meta");
  const drawBtn = $("#btn-daily-draw");
  const acc = activeAccount();
  if (!acc) {
    if (chip) chip.textContent = "未登录";
    if (nameEl) nameEl.textContent = "尚未创建账号";
    if (metaEl) metaEl.textContent = "开局先看系统 7 人，再自选 5 人；每天可抽 1 张；班底永久保存，用于排位赛。";
    if (drawBtn) drawBtn.disabled = true;
    return;
  }
  const n = acc.playerIds?.length || 0;
  const coach = resolveCoach(acc.coachId);
  const dailyOk = canDailyDraw(acc);
  if (chip) chip.textContent = acc.name;
  if (nameEl) nameEl.textContent = `${acc.name} · ${n} 张卡`;
  if (metaEl) {
    metaEl.textContent = acc.onboardingDone
      ? `教练 ${coach ? `${coach.name}（${coachRecordLabel(coach)}）` : "未定"} · 排位 ${acc.rankedWins || 0}胜${acc.rankedLosses || 0}负 · ${dailyOk ? "今日可抽卡" : "今日已抽"}`
      : "请先完成开局：先看系统 7 人 → 自选 5 人 + 教练 + 战术";
  }
  if (drawBtn) {
    drawBtn.disabled = !acc.onboardingDone || !dailyOk;
    drawBtn.textContent = dailyOk ? "每日抽卡" : "今日已抽";
  }
}

function renderAccountList() {
  const box = $("#account-list");
  if (!box) return;
  const list = listAccounts();
  const activeId = getActiveAccountId();
  if (!list.length) {
    box.innerHTML = `<p class="tiny">还没有账号。上方输入昵称创建，开局先看 7 人再自选 5 人。</p>`;
    return;
  }
  box.innerHTML = list
    .map((a) => {
      const active = a.id === activeId ? " active" : "";
      return `<div class="account-row${active}">
        <div>
          <strong>${esc(a.name)}</strong>
          <div class="tiny">${a.cardCount} 张卡 · ${a.ready ? "可排位" : "未完成开局"}</div>
        </div>
        <div class="btn-row">
          <button class="btn small" data-acc-login="${a.id}">进入</button>
          <button class="btn small ghost" data-acc-del="${a.id}">删除</button>
        </div>
      </div>`;
    })
    .join("");
  box.querySelectorAll("[data-acc-login]").forEach((btn) => {
    btn.onclick = () => {
      setActiveAccountId(btn.dataset.accLogin);
      const acc = activeAccount();
      if (acc && !acc.onboardingDone) startOnboarding(acc);
      else {
        refreshAccountHomeBar();
        show("home");
      }
    };
  });
  box.querySelectorAll("[data-acc-del]").forEach((btn) => {
    btn.onclick = () => {
      if (!confirm("删除该账号及其全部球员卡？不可恢复。")) return;
      deleteAccount(btn.dataset.accDel);
      renderAccountList();
      refreshAccountHomeBar();
    };
  });
}

$("#btn-account-chip")?.addEventListener("click", () => {
  show("account");
  renderAccountList();
});
$("#btn-switch-account")?.addEventListener("click", () => {
  show("account");
  renderAccountList();
});
$("#btn-account-back")?.addEventListener("click", () => show("home"));
$("#btn-open-collection")?.addEventListener("click", () => {
  if (!requireAccountReady()) return;
  openCollection();
});
$("#btn-daily-draw")?.addEventListener("click", () => {
  if (!requireAccountReady()) return;
  openDailyDraw();
});
$("#btn-collection-back")?.addEventListener("click", () => show("home"));
$("#btn-draw-back")?.addEventListener("click", () => {
  refreshAccountHomeBar();
  show("collection");
  openCollection();
});
$("#btn-collection-draw")?.addEventListener("click", () => openDailyDraw());
$("#btn-collection-ranked")?.addEventListener("click", () => startRankedMatch());

$("#btn-account-create")?.addEventListener("click", () => {
  const name = $("#account-new-name")?.value || "";
  const acc = createAccount(name);
  if ($("#account-new-name")) $("#account-new-name").value = "";
  startOnboarding(acc);
});

function onboardCardHtml(p, { selectable = false, selected = false } = {}) {
  const ovr = overall(p);
  const sel = selected ? " selected" : "";
  const tag = selectable ? ` data-pick="${p.id}"` : "";
  const el = selectable ? "button" : "div";
  const type = selectable ? ' type="button"' : "";
  const view = selectable ? "" : " view-only";
  return `<${el}${type} class="player-card${sel}${view}"${tag}>
    ${photoImg(p, 56)}
    <div class="name">${esc(p.name)}${rarityLabel(ovr) ? ` <span class="rarity-tag ${rarityClass(ovr)}">${rarityLabel(ovr)}</span>` : ""}${p.twilight ? '<span class="tag-twilight">生涯末期</span>' : ""}</div>
    <div class="meta">${p.season} · ${esc(p.teamLabel || p.team || "")} · ${p.pos} · OVR ${ovr}${p.twilight ? " · 头像为生涯照" : ""}</div>
  </${el}>`;
}

function startOnboarding(acc) {
  const autoFilled = rollSystemSeven();
  const exclude = new Set(autoFilled.map((p) => p.id));
  state.onboard = {
    accountId: acc.id,
    step: 1,
    autoFilled,
    offers: [],
    selected: new Set(),
    rosterIds: [],
    coachOffers: rollCoachOffers(5),
    coachId: null,
    tacticId: null,
    _exclude: exclude,
  };
  renderOnboard();
  show("onboard");
}

function renderOnboard() {
  const ob = state.onboard;
  if (!ob) return;
  const hint = $("#onboard-hint");
  const label = $("#onboard-step-label");
  const pool = $("#onboard-pool");
  const next = $("#btn-onboard-next");
  if (ob.step === 1) {
    const auto = ob.autoFilled || [];
    const g = auto.filter((p) => ["PG", "SG"].includes(p.pos)).length;
    const f = auto.filter((p) => ["SF", "PF"].includes(p.pos)).length;
    const c = auto.filter((p) => p.pos === "C").length;
    if (label) label.textContent = "1/4 系统先给 7 人";
    if (hint) {
      hint.textContent = `先看这 7 张系统卡（后卫${g} / 前锋${f} / 中锋${c}）。看完后再从候选池自选 5 人，凑满 12 人班底。`;
    }
    pool.innerHTML = auto.map((p) => onboardCardHtml(p)).join("");
    if (next) {
      next.disabled = auto.length < 7;
      next.textContent = "看完了，去自选 5 人";
    }
  } else if (ob.step === 2) {
    if (label) label.textContent = `2/4 自选球员（${ob.selected.size}/5）`;
    if (hint) {
      hint.textContent =
        "上面那 7 人已进班底。再从候选池点选 5 人（不可整批刷新）。";
    }
    pool.innerHTML = ob.offers
      .map((p) => onboardCardHtml(p, { selectable: true, selected: ob.selected.has(p.id) }))
      .join("");
    pool.querySelectorAll("[data-pick]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.pick;
        if (ob.selected.has(id)) ob.selected.delete(id);
        else if (ob.selected.size < 5) ob.selected.add(id);
        renderOnboard();
      };
    });
    if (next) {
      next.disabled = ob.selected.size !== 5;
      next.textContent = "确认自选 5 人";
    }
  } else if (ob.step === 3) {
    if (label) label.textContent = "3/4 选教练";
    if (hint) {
      hint.textContent =
        "班底 12 人已定。开局只能选菜鸟/边缘主帅——菲尔、波波维奇等名帅需每日抽卡获得。";
    }
    pool.innerHTML = ob.coachOffers
      .map((c) => {
        const sel = ob.coachId === c.id ? " selected" : "";
        const book = coachTactics(c)
          .map((t) => t.name)
          .join("、");
        return `<button type="button" class="coach-card${sel}" data-coach="${c.id}">
          <div class="name">${esc(c.name)}</div>
          <div class="meta">${coachRecordLabel(c)}</div>
          <div class="tiny"><strong>擅长</strong> ${esc(coachSpecialtyLabel(c))}</div>
          <div class="tiny">战术板：${esc(book)} · ${esc(c.note || "")}</div>
        </button>`;
      })
      .join("");
    pool.querySelectorAll("[data-coach]").forEach((btn) => {
      btn.onclick = () => {
        ob.coachId = btn.dataset.coach;
        renderOnboard();
      };
    });
    if (next) {
      next.disabled = !ob.coachId;
      next.textContent = "下一步：选战术";
    }
  } else {
    const coach = ob.coachOffers.find((c) => c.id === ob.coachId) || resolveCoach(ob.coachId);
    const tactics = coachTactics(coach);
    if (label) label.textContent = "4/4 选战术";
    if (hint) {
      hint.textContent = `「${coach?.name || "教练"}」擅长：${coachSpecialtyLabel(coach)}。只显示其战术板上的体系（不同教练不一样）。`;
    }
    pool.innerHTML = tactics
      .map((t) => {
        const sel = ob.tacticId === t.id ? " selected" : "";
        return `<button type="button" class="coach-card${sel}" data-tactic="${t.id}">
          <div class="name">${esc(t.name)}</div>
          <div class="tiny">${esc(t.desc || "")}</div>
        </button>`;
      })
      .join("");
    pool.querySelectorAll("[data-tactic]").forEach((btn) => {
      btn.onclick = () => {
        ob.tacticId = btn.dataset.tactic;
        renderOnboard();
      };
    });
    if (next) {
      next.disabled = !ob.tacticId;
      next.textContent = "完成开局";
    }
  }
}

function rarityClass(ovr) {
  if (ovr >= 100) return "myth";
  if (ovr >= 96) return "myth";
  if (ovr >= 93) return "legend";
  if (ovr >= 90) return "super";
  if (ovr >= 85) return "allstar";
  return "";
}

$("#btn-onboard-next")?.addEventListener("click", () => {
  const ob = state.onboard;
  if (!ob) return;
  if (ob.step === 1) {
    if ((ob.autoFilled || []).length < 7) return;
    const exclude = ob._exclude || new Set(ob.autoFilled.map((p) => p.id));
    ob.offers = rollStarterOffers(20, exclude);
    ob.selected = new Set();
    ob.step = 2;
    renderOnboard();
    return;
  }
  if (ob.step === 2) {
    if (ob.selected.size !== 5) return;
    const picked = resolvePlayers([...ob.selected]);
    const full = [...(ob.autoFilled || []), ...picked];
    ob.rosterIds = full.map((p) => p.id);
    ob.step = 3;
    renderOnboard();
    return;
  }
  if (ob.step === 3) {
    if (!ob.coachId) return;
    ob.step = 4;
    const coach = ob.coachOffers.find((c) => c.id === ob.coachId);
    const first = coachTactics(coach)[0];
    ob.tacticId = first?.id || "balanced";
    renderOnboard();
    return;
  }
  const acc = getAccount(ob.accountId);
  const ids = ob.rosterIds?.length === 12 ? ob.rosterIds : [...ob.selected];
  finalizeOnboarding(acc, {
    playerIds: ids,
    coachId: ob.coachId,
    tacticId: ob.tacticId,
  });
  state.onboard = null;
  refreshAccountHomeBar();
  openCollection();
});

function openCollection() {
  const acc = requireAccountReady();
  if (!acc) return;
  const players = resolvePlayers(acc.playerIds, acc).sort((a, b) => overall(b) - overall(a));
  const coach = resolveCoach(acc.coachId);
  const tactic = TACTICS[acc.tacticId] || TACTICS.balanced;
  const sum = $("#collection-summary");
  if (sum) {
    sum.innerHTML = `
      <span><strong>${esc(acc.name)}</strong></span>
      <span>收藏 ${players.length} 张</span>
      <span>排位 ${acc.rankedWins || 0}-${acc.rankedLosses || 0}</span>
      <span>金币 ¤${acc.gold || 0}</span>
      <span>${canDailyDraw(acc) ? "今日可抽" : "今日已抽"}</span>`;
  }
  const staff = $("#collection-staff");
  if (staff) {
    const owned = ownedCoaches(acc);
    const coachOpts = (owned.length ? owned : COACHES.filter((c) => c.id === acc.coachId))
      .map((c) => {
        const tag = isLegendCoach(c) ? " · 名帅" : "";
        return `<option value="${c.id}" ${c.id === acc.coachId ? "selected" : ""}>${esc(c.name)}（${c.season} ${c.team}${tag}）</option>`;
      })
      .join("");
    staff.innerHTML = coach
      ? `<strong>主教练</strong> ${esc(coach.name)} · ${esc(coachRecordLabel(coach))}${
          isLegendCoach(coach) ? ' <span class="rarity-tag myth">名帅</span>' : ""
        }<br/>
         <span class="tiny">${esc(coach.style)} · 擅长 ${esc(coachSpecialtyLabel(coach))} · 默认「${esc(tactic.name)}」</span>
         <p class="tiny">${esc(coach.note || "")} · 已拥有教练 ${owned.length} 名（名帅靠抽卡）。</p>
         <div class="btn-row" style="margin-top:8px">
           <label class="tiny">更换战术（仅本教头战术板）
             <select id="collection-tactic">${coachTactics(coach)
               .map(
                 (t) =>
                   `<option value="${t.id}" ${t.id === acc.tacticId ? "selected" : ""}>${esc(t.name)}</option>`
               )
               .join("")}</select>
           </label>
           <label class="tiny">更换教练
             <select id="collection-coach">${coachOpts}</select>
           </label>
         </div>`
      : `<span class="tiny">未绑定教练</span>`;
    const tacSel = $("#collection-tactic");
    if (tacSel) {
      tacSel.onchange = () => {
        setAccountTactic(acc, tacSel.value);
        openCollection();
      };
    }
    const coachSel = $("#collection-coach");
    if (coachSel) {
      coachSel.onchange = () => {
        setAccountCoach(acc, coachSel.value);
        const nextCoach = resolveCoach(coachSel.value);
        const book = coachTactics(nextCoach).map((t) => t.id);
        if (book.length && !book.includes(acc.tacticId)) {
          setAccountTactic(acc, book[0]);
        }
        openCollection();
      };
    }
  }
  const grid = $("#collection-grid");
  if (grid) {
    grid.innerHTML = players
      .map((p) => {
        const ovr = overall(p);
        return `<div class="player-card">
          ${photoImg(p, 56)}
          <div class="name">${esc(p.name)}${rarityLabel(ovr) ? ` <span class="rarity-tag ${rarityClass(ovr)}">${rarityLabel(ovr)}</span>` : ""}${p.mergeLevel ? `<span class="tag-merge">合×${p.mergeLevel}</span>` : ""}${p.twilight ? '<span class="tag-twilight">生涯末期</span>' : ""}</div>
          <div class="meta">${p.season} · ${esc(p.teamLabel || p.team || "")} · ${p.pos} · OVR ${ovr}${p.age ? ` · ${p.age}岁` : ""}${p.careerPhaseLabel ? ` · ${esc(p.careerPhaseLabel)}` : ""}${p.twilight ? " · 头像为生涯照" : ""}</div>
          ${skillChipsHtml(p)}
        </div>`;
      })
      .join("");
  }
  const drawBtn = $("#btn-collection-draw");
  if (drawBtn) {
    drawBtn.disabled = !canDailyDraw(acc);
    drawBtn.textContent = canDailyDraw(acc) ? "每日抽卡" : "今日已抽";
  }
  show("collection");
}

function openDailyDraw() {
  const acc = requireAccountReady();
  if (!acc) return;
  const stage = $("#draw-stage");
  const pull = $("#btn-draw-pull");
  if (stage) {
    stage.innerHTML = canDailyDraw(acc)
      ? `<p class="tiny">准备就绪——新卡入账；抽到已有卡会自动合并（全属性+1并随机领悟技能）。</p>`
      : `<p class="tiny">今日已抽取。明天再来扩充班底。</p>`;
  }
  if (pull) {
    pull.disabled = !canDailyDraw(acc);
    pull.textContent = canDailyDraw(acc) ? "抽取今日卡" : "明日再来";
  }
  show("draw");
}

$("#btn-draw-pull")?.addEventListener("click", () => {
  const acc = activeAccount();
  if (!acc || !canDailyDraw(acc)) return;
  try {
    const result = performDailyDraw(acc);
    const stage = $("#draw-stage");
    if (stage) {
      if (result.kind === "coach") {
        const c = result.coach;
        stage.innerHTML = `<div class="draw-reveal">
          <div class="name">${esc(c.name)}${result.rarity ? ` <span class="rarity-tag myth">${result.rarity}</span>` : ""}</div>
          <div class="meta">${coachRecordLabel(c)}</div>
          <p class="tiny">${esc(c.style)} · ${esc(c.note || "")}</p>
          <p class="tiny">${
            result.duplicate
              ? `重复教练卡，折合 ¤${result.goldGain}`
              : isLegendCoach(c)
                ? "名帅卡入账！可在「我的球员卡」更换主教练"
                : "新教练卡已加入教头收藏"
          }</p>
        </div>`;
      } else {
        stage.innerHTML = `<div class="draw-reveal">
          ${photoImg(result.player, 96)}
          <div class="name">${esc(result.player.name)}${result.rarity ? ` <span class="rarity-tag ${rarityClass(result.ovr)}">${result.rarity}</span>` : ""}</div>
          <div class="meta">${result.player.season} · ${result.player.pos} · OVR ${result.ovr} · ${result.player.team || ""}</div>
          <p class="tiny">${
            result.merged && result.merge
              ? `重复卡已合并！全属性 +1（合并×${result.merge.merges}）${
                  result.merge.learnedName
                    ? ` · 领悟「${esc(result.merge.learnedName)}」`
                    : " · 可领悟技能已集齐"
                }`
              : result.duplicate
                ? `重复卡已达合并上限，折合 ¤${result.goldGain}`
                : "新卡已加入你的永久班底"
          }</p>
          ${result.merged ? skillChipsHtml(result.player) : ""}
        </div>`;
      }
    }
    const pull = $("#btn-draw-pull");
    if (pull) {
      pull.disabled = true;
      pull.textContent = "今日已抽";
    }
    refreshAccountHomeBar();
  } catch (e) {
    alert(e.message || "抽卡失败");
  }
});

function startRankedMatch() {
  const acc = requireAccountReady();
  if (!acc) return;
  const home = accountToTeam(acc);
  if (!home || home.players.length < 5) {
    alert("班底不足 5 人，无法排位。");
    return;
  }
  // Prefer account tactic as coach special focus
  if (acc.tacticId && home.coach) {
    home.coach = structuredClone(home.coach);
    if (!home.coach.specialTactics?.includes(acc.tacticId)) {
      home.coach.specialTactics = [...(home.coach.specialTactics || []), acc.tacticId];
    }
  }
  applyLineupPositionEffects(home.players);
  const used = new Set(home.players.map((p) => p.id));
  const power = Math.min(3, Math.floor((acc.rankedWins || 0) / 3));
  const away = autoFillTeam("排位对手", 10, { excludeIds: used, power });
  state.career = { kind: "ranked", accountId: acc.id };
  openSetup(home, away, "home");
}

// —— Draft ——
function initDraft(mode) {
  const isDuel = mode === "duel";
  const isCustom = mode === "custom";
  const isHumanVsHuman = isDuel || isCustom;
  const picksPerSide = isCustom ? CUSTOM_ROSTER_SIZE : isDuel ? 8 : 10;
  if (state.draft?._cpuTimer) clearTimeout(state.draft._cpuTimer);
  state.draft = {
    mode,
    picksPerSide,
    budgetMode: isCustom, // 15 块买巅峰卡
    // spend = 列出全部 5→1 价轮选花光预算；filler = 随机 0 块补大名单
    customPhase: isCustom ? "spend" : null,
    customPriceFilter: "5", // 默认先看 5 块档；可切 all/4/3/2/1
    buyPlayers: isCustom || isDuel, // 钱扣在球员上（双人用金币，自定义用块）
    picksDone: { A: 0, B: 0 },
    needCoach: { A: true, B: true },
    needAssistant: { A: true, B: true },
    freeRefreshes: {
      A: isCustom ? 4 : DRAFT_FREE_REFRESHES,
      B: isCustom ? 4 : DRAFT_FREE_REFRESHES,
    },
    turn: "A",
    round: 1,
    teams: {
      A: {
        name: isHumanVsHuman ? "玩家 A" : "你的球队",
        players: [],
        coach: null,
        assistant: null,
        gold: isCustom ? CUSTOM_BUDGET : isDuel ? 800 : 600,
      },
      B: {
        name: isHumanVsHuman ? "玩家 B" : "CPU",
        players: [],
        coach: null,
        assistant: null,
        gold: isCustom ? CUSTOM_BUDGET : isDuel ? 800 : 600,
      },
    },
    used: new Set(),
    pack: [],
    cpu: !isHumanVsHuman,
    picking: false,
    _cpuTimer: null,
  };
  if (isCustom) {
    $("#draft-title").textContent = "自定义 · 15 块轮抽 → 32 历史球队淘汰赛";
  } else if (isDuel) {
    $("#draft-title").textContent = "双人对抗 · 金币买球员（刷新另计）";
  } else {
    $("#draft-title").textContent = "选秀建队";
  }
  const moneyLabel = $("#draft-money-label");
  if (moneyLabel) {
    moneyLabel.innerHTML = isCustom
      ? `预算：<strong id="draft-gold">${CUSTOM_BUDGET}</strong> 块`
      : `金币：<strong id="draft-gold">${state.draft.teams.A.gold}</strong>`;
  }
  updateCustomDraftChrome();
  $("#roster-a-title").textContent = state.draft.teams.A.name;
  $("#roster-b-title").textContent = state.draft.teams.B.name;
  $("#btn-start-game").disabled = true;
  refreshDraftUI();
  dealPack();
}

/** 自定义：某边是否还能从 5→1 价池里买人 */
function customSideCanSpend(d, side) {
  if (!d?.budgetMode) return false;
  const team = d.teams[side];
  if (!team || team.players.length >= d.picksPerSide) return false;
  const gold = team.gold ?? 0;
  if (gold <= 0) return false;
  return listPaidPeaks(d.used).some((c) => customPriceOf(c.data) <= gold);
}

function customSpendPhaseDone(d = state.draft) {
  if (!d?.budgetMode) return true;
  return !customSideCanSpend(d, "A") && !customSideCanSpend(d, "B");
}

function updateCustomDraftChrome() {
  const d = state.draft;
  const packArea = document.querySelector(".pack-area");
  const filters = $("#custom-price-filters");
  const hint = $("#pack-hint");
  const title = $("#pack-title");
  if (!d?.budgetMode) {
    packArea?.classList.remove("custom-spend", "custom-filler");
    if (filters) filters.hidden = true;
    if (title) title.textContent = "本轮卡包（点选一名）";
    if (hint) {
      hint.textContent =
        d?.mode === "duel"
          ? "点选球员会扣除其身价金币；钱不够不能买。刷新可花金币或用免费次数。"
          : "可抽到球员、主教练或助教。新人/边缘教练放权更高，常激发潜力。";
    }
    return;
  }
  const spend = d.customPhase === "spend";
  packArea?.classList.toggle("custom-spend", spend);
  packArea?.classList.toggle("custom-filler", !spend);
  if (title) {
    title.textContent = spend
      ? "有价巅峰卡（5→1 块全表 · 轮流点选直到花光 15 块）"
      : "0 块角色包（随机若干 · 点选补满大名单）";
  }
  if (hint) {
    hint.textContent = spend
      ? "先组先发核：列出全部标价 5～1 的巅峰卡。买不起的会灰掉；轮到你时点一人，双方交替，直到预算花光或买不起为止。"
      : "预算阶段结束。现在只出 0 块球员；可刷新换一批，轮流点选直到两边名单满员。";
  }
  if (filters) {
    if (!spend) {
      filters.hidden = true;
      filters.innerHTML = "";
    } else {
      filters.hidden = false;
      const cur = d.customPriceFilter || "all";
      const tabs = [
        ["all", "全部"],
        ["5", "5 块"],
        ["4", "4 块"],
        ["3", "3 块"],
        ["2", "2 块"],
        ["1", "1 块"],
      ];
      filters.innerHTML = tabs
        .map(
          ([v, lab]) =>
            `<button type="button" class="btn small ${cur === v ? "active" : ""}" data-price-filter="${v}">${lab}</button>`
        )
        .join("");
      filters.querySelectorAll("[data-price-filter]").forEach((btn) => {
        btn.onclick = () => {
          d.customPriceFilter = btn.getAttribute("data-price-filter") || "all";
          renderPack();
          updateCustomDraftChrome();
        };
      });
    }
  }
}

function isDraftDone(d = state.draft) {
  if (!d) return false;
  return (
    d.teams.A.players.length >= d.picksPerSide &&
    d.teams.B.players.length >= d.picksPerSide &&
    !!d.teams.A.coach &&
    !!d.teams.B.coach &&
    !!d.teams.A.assistant &&
    !!d.teams.B.assistant
  );
}

function dealPack() {
  const d = state.draft;
  if (!d || isDraftDone(d)) return;
  const side = d.turn;
  if (d.budgetMode) {
    if (d.customPhase === "spend" && customSpendPhaseDone(d)) {
      d.customPhase = "filler";
    }
    if (d.customPhase === "spend") {
      d.pack = listPaidPeaks(d.used);
      // 若当前回合已花光/买不起，跳到还能花的一方
      if (!customSideCanSpend(d, d.turn)) {
        const other = d.turn === "A" ? "B" : "A";
        if (customSideCanSpend(d, other)) d.turn = other;
      }
    } else {
      d.pack = drawZeroCostPack(5, d.used);
    }
    updateCustomDraftChrome();
    renderPack();
    updateRefreshBtn();
    refreshDraftUI();
    return;
  }
  const needPlayers = d.teams[side].players.length < d.picksPerSide;
  // While roster incomplete, prefer player cards; staff only as extras
  const needCoachCard =
    needPlayers && d.needCoach[side] && (d.picksDone[side] >= 2 || Math.random() < 0.35);
  const needAsstCard =
    needPlayers && d.needAssistant[side] && (d.picksDone[side] >= 4 || Math.random() < 0.25);
  d.pack = drawPack(5, {
    includeCoach: needCoachCard || (!needPlayers && d.needCoach[side]) || Math.random() < 0.08,
    includeAssistant: needAsstCard || (!needPlayers && d.needAssistant[side]) || Math.random() < 0.08,
    excludeIds: d.used,
  });
  renderPack();
  updateRefreshBtn();
}

function draftRefreshCost(d) {
  return d?.budgetMode ? CUSTOM_REFRESH_COST : DRAFT_REFRESH_COST;
}

function updateRefreshBtn() {
  const d = state.draft;
  const btn = $("#btn-refresh-pack");
  if (!d || !btn) return;
  if (isDraftDone(d)) {
    btn.disabled = true;
    btn.textContent = "选人已完成";
    return;
  }
  // 预算花光阶段：全表列出，不刷新
  if (d.budgetMode && d.customPhase === "spend") {
    btn.disabled = true;
    btn.textContent = "全表点选中（无需刷新）";
    return;
  }
  if (d.picking || (d.cpu && d.turn === "B")) {
    btn.disabled = true;
    btn.textContent = "CPU 选人中…";
    return;
  }
  if (d.budgetMode && d.customPhase === "filler") {
    btn.disabled = false;
    btn.textContent = "刷新 0 块卡包（免费）";
    return;
  }
  const side = d.turn;
  const freeLeft = d.freeRefreshes[side] ?? 0;
  const gold = d.teams[side].gold ?? 0;
  const cost = draftRefreshCost(d);
  const unit = d.budgetMode ? "块" : "¤";
  if (freeLeft > 0) {
    btn.disabled = false;
    btn.textContent = `刷新列表（免费 ${freeLeft}）`;
  } else {
    btn.disabled = gold < cost;
    btn.textContent = `刷新列表（${unit}${cost}）`;
  }
}

$("#btn-refresh-pack").onclick = () => {
  const d = state.draft;
  if (!d || d.picking || isDraftDone(d)) return;
  if (d.cpu && d.turn === "B") return;
  if (d.budgetMode && d.customPhase === "spend") return;
  if (d.budgetMode && d.customPhase === "filler") {
    dealPack();
    refreshDraftUI();
    return;
  }
  const side = d.turn;
  const freeLeft = d.freeRefreshes[side] ?? 0;
  const cost = draftRefreshCost(d);
  if (freeLeft > 0) {
    d.freeRefreshes[side] = freeLeft - 1;
  } else {
    if ((d.teams[side].gold ?? 0) < cost) return;
    d.teams[side].gold -= cost;
  }
  dealPack();
  refreshDraftUI();
};

/** Cost to acquire a player in current draft mode. */
function pickCost(d, player) {
  if (!d?.buyPlayers) return 0;
  if (d.budgetMode) return customPriceOf(player);
  return playerPrice(player);
}

function renderPack() {
  const d = state.draft;
  const box = $("#pack-cards");
  if (!box || !d) return;
  box.innerHTML = "";
  const cpuTurn = d.cpu && d.turn === "B";
  let cards = d.pack;
  if (d.budgetMode && d.customPhase === "spend") {
    const f = d.customPriceFilter || "all";
    if (f !== "all") {
      const want = Number(f);
      cards = cards.filter((c) => c.kind === "player" && customPriceOf(c.data) === want);
    }
  }
  if (!cards.length) {
    box.innerHTML = `<p class="tiny">${
      d.budgetMode && d.customPhase === "spend"
        ? "该价位暂无球员，换个筛选项，或继续轮到对方选。"
        : "本包暂无可用卡，请刷新。"
    }</p>`;
    return;
  }
  for (const card of cards) {
    const el = document.createElement("button");
    el.type = "button";
    el.disabled = cpuTurn || !!d.picking;
    el.className =
      card.kind === "player" ? "player-card" : card.kind === "assistant" ? "coach-card asst-card" : "coach-card";
    if (card.kind === "player") {
      const p = card.data;
      const cost = pickCost(d, p);
      const gold = d.teams[d.turn].gold ?? 0;
      const cantAfford = d.buyPlayers && cost > gold;
      if (cantAfford) {
        el.disabled = true;
        el.classList.add("card-disabled");
      }
      const tips = topIntangibles(p, 2)
        .map((t) => `<span class="chip growth">${t.name} ${t.value}</span>`)
        .join("");
      const priceTxt = d.budgetMode
        ? `${cost} 块${p.peakLabel ? " · 巅峰" : ""}`
        : `¤${playerPrice(p)}`;
      const compact = d.budgetMode && d.customPhase === "spend";
      el.innerHTML = `
        <div class="card-head">
          ${photoImg(p, compact ? "headshot" : "headshot lg")}
          <div>
            <div class="name">${p.name} <span class="pos-badge">${normalizePos(p.pos)}</span>${
              valueLabel(p) ? ` <span class="value-badge ${p.valueArchetype}">${valueLabel(p)}</span>` : ""
            }${cantAfford ? ` <span class="chip warn">买不起</span>` : ""}</div>
            <div class="meta">${p.season} · ${p.team} · ${p.pos} · OVR ${overall(p)} · ${priceTxt}</div>
            <div class="meta tiny">${d.budgetMode ? `当前方剩余 ${gold} 块` : marketMeta(p)}</div>
          </div>
        </div>
        <div class="stat-chips">
          <span class="chip">得分 ${p.scoring}</span>
          <span class="chip">传球 ${p.pass}</span>
          <span class="chip">防守 ${p.defense}</span>
          <span class="chip">篮板 ${p.rebound}</span>
          ${tips}
          ${(p.tags || [])
            .filter((t) => t !== "妖人")
            .slice(0, 2)
            .map((t) => `<span class="chip warn">${t}</span>`)
            .join("")}
        </div>`;
    } else if (card.kind === "assistant") {
      const a = card.data;
      el.innerHTML = `
        <div class="name">助教 · ${a.name}</div>
        <div class="meta">${a.season} · ${a.role || "助教"} · 名气 ${a.fame ?? "-"}</div>
        <div class="stat-chips">
          <span class="chip">攻 +${a.buffs?.offense || 0}</span>
          <span class="chip">防 +${a.buffs?.defense || 0}</span>
          <span class="chip">自主 +${a.playerAutonomy || 0}</span>
          <span class="chip growth">激发 ${a.sparkPotential || 0}</span>
        </div>
        <p class="tiny" style="margin:8px 0 0">${a.note || ""}</p>`;
    } else {
      const c = card.data;
      const auto = c.playerAutonomy ?? "-";
      const obscure = isObscureStaff(c);
      el.innerHTML = `
        <div class="name">教练 · ${c.name}</div>
        <div class="meta">${c.season} · ${c.team} · ${c.style}${obscure ? " · 放权型" : ""}</div>
        <div class="stat-chips">
          <span class="chip">攻 +${c.buffs?.offense || 0}</span>
          <span class="chip">防 +${c.buffs?.defense || 0}</span>
          <span class="chip">士气 +${c.buffs?.morale || 0}</span>
          <span class="chip growth">自主 ${auto}</span>
        </div>
        <p class="tiny" style="margin:8px 0 0">${c.note || ""}</p>`;
    }
    el.onclick = () => {
      if (d.cpu && d.turn === "B") return;
      pickCard(card);
    };
    box.appendChild(el);
  }
}

function pickCard(card) {
  const d = state.draft;
  if (!d || !card || d.picking) return;
  const side = d.turn;
  const team = d.teams[side];
  // Ignore stale clicks once that side's roster is full
  if (card.kind === "player" && team.players.length >= d.picksPerSide) return;
  if (card.kind === "coach" && team.coach && !d.needCoach[side]) return;
  if (card.kind === "assistant" && team.assistant && !d.needAssistant[side]) return;

  if (card.kind === "player" && d.buyPlayers) {
    const cost = pickCost(d, card.data);
    if (d.budgetMode && d.customPhase === "filler" && cost > 0) {
      alert("补员阶段只能选 0 块球员");
      return;
    }
    if ((team.gold ?? 0) < cost) {
      alert(d.budgetMode ? `预算不足（需要 ${cost} 块，剩余 ${team.gold}）` : `金币不足（身价 ¤${cost}）`);
      return;
    }
  }

  d.picking = true;
  try {
    if (card.kind === "player") {
      const cost = pickCost(d, card.data);
      if (d.buyPlayers && cost > 0) team.gold -= cost;
      applyRecommendedDefaults(card.data, { force: !card.data.playPosManual });
      team.players.push(card.data);
      d.used.add(card.data.id);
      d.picksDone[side] += 1;
    } else if (card.kind === "assistant") {
      if (team.assistant) d.used.delete(team.assistant.id);
      team.assistant = card.data;
      d.used.add(card.data.id);
      d.needAssistant[side] = false;
    } else {
      if (team.coach) d.used.delete(team.coach.id);
      team.coach = card.data;
      d.used.add(card.data.id);
      d.needCoach[side] = false;
    }
    advanceTurn();
    if (d.budgetMode && d.customPhase === "spend" && customSpendPhaseDone(d)) {
      d.customPhase = "filler";
    }
    ensureStaffIfReady();
    refreshDraftUI();
    if (isDraftDone(d)) {
      d.picking = false;
      $("#btn-start-game").disabled = false;
      $("#btn-refresh-pack").disabled = true;
      $("#btn-refresh-pack").textContent = "选人已完成";
      updateCustomDraftChrome();
      $("#pack-cards").innerHTML = `<p class="tiny">选人完成。强度 A ${teamPowerLabel(d.teams.A)} / B ${teamPowerLabel(d.teams.B)}。下一步设置首发与执教方针。</p>`;
      return;
    }
    if (d.cpu && d.turn === "B") {
      d.picking = false;
      updateRefreshBtn();
      d._cpuTimer = setTimeout(cpuPick, 280);
    } else {
      d.picking = false;
      dealPack();
    }
  } catch (err) {
    console.error("[draft] pickCard", err);
    d.picking = false;
    updateRefreshBtn();
  }
}

function cpuPick() {
  const d = state.draft;
  if (!d || d.turn !== "B" || isDraftDone(d)) {
    if (d) {
      d.picking = false;
      updateRefreshBtn();
    }
    return;
  }
  d.picking = true;
  updateRefreshBtn();
  try {
    const team = d.teams.B;
    const needPlayers = team.players.length < d.picksPerSide;
    // Quiet deal — don't enable player clicks mid-CPU
    const needCoachCard = d.needCoach.B && (!needPlayers || d.picksDone.B >= 2);
    const needAsstCard = d.needAssistant.B && !needPlayers;
    d.pack = drawPack(5, {
      includeCoach: needCoachCard || (!needPlayers && d.needCoach.B),
      includeAssistant: needAsstCard,
      excludeIds: d.used,
    });
    renderPack();

    let choice = null;
    if (needPlayers) {
      const players = d.pack
        .filter((c) => c.kind === "player")
        .sort((a, b) => overall(b.data) - overall(a.data));
      choice = players[0];
    }
    if (!choice && d.needCoach.B) choice = d.pack.find((c) => c.kind === "coach");
    if (!choice && d.needAssistant.B) choice = d.pack.find((c) => c.kind === "assistant");
    if (!choice) choice = d.pack.find((c) => c.kind === "player") || d.pack[0];

    // Fallback: pull best unused player directly if pack failed
    if (!choice && needPlayers) {
      const fallback = PLAYERS.filter((p) => !d.used.has(p.id))
        .sort((a, b) => overall(b) - overall(a))
        .slice(0, 1)
        .map((p) => ({ kind: "player", data: clonePlayer(p) }))[0];
      choice = fallback || null;
    }

    d.picking = false;
    if (choice) {
      pickCard(choice);
    } else {
      // Nothing to pick — skip CPU turn to avoid soft-lock
      console.warn("[draft] CPU pack empty, skipping turn");
      advanceTurn();
      ensureStaffIfReady();
      refreshDraftUI();
      if (isDraftDone(d)) {
        $("#btn-start-game").disabled = false;
        $("#pack-cards").innerHTML = `<p class="tiny">选人完成。可进入赛前设置。</p>`;
      } else dealPack();
    }
  } catch (err) {
    console.error("[draft] cpuPick", err);
    d.picking = false;
    advanceTurn();
    refreshDraftUI();
    dealPack();
  }
}

function advanceTurn() {
  const d = state.draft;
  if (d.budgetMode && d.customPhase === "spend") {
    const other = d.turn === "A" ? "B" : "A";
    if (customSideCanSpend(d, other)) {
      d.turn = other;
    } else if (customSideCanSpend(d, d.turn)) {
      // 对方花光了，当前方继续花
    } else {
      d.customPhase = "filler";
      d.turn = other; // 换边开始补 0 块
    }
  } else if (d.budgetMode && d.customPhase === "filler") {
    const other = d.turn === "A" ? "B" : "A";
    if (d.teams[other].players.length < d.picksPerSide) d.turn = other;
    // 对方已满则本方继续补人
  } else {
    d.turn = d.turn === "A" ? "B" : "A";
  }
  d.round = Math.min(d.picksDone.A, d.picksDone.B) + 1;
}

function ensureStaffIfReady() {
  const d = state.draft;
  if (!d) return;
  if (d.teams.A.players.length < d.picksPerSide || d.teams.B.players.length < d.picksPerSide) return;
  for (const side of ["A", "B"]) {
    const other = side === "A" ? "B" : "A";
    const staff = ensureTeamStaff(d.teams[side], {
      preferStarter: true,
      excludeIds: [
        ...d.used,
        d.teams[other].coach?.id,
        d.teams[other].assistant?.id,
      ].filter(Boolean),
    });
    if (staff.coach?.id) d.used.add(staff.coach.id);
    if (staff.assistant?.id) d.used.add(staff.assistant.id);
    d.needCoach[side] = false;
    d.needAssistant[side] = false;
  }
}

function draftComplete() {
  const d = state.draft;
  if (!d) return false;
  ensureStaffIfReady();
  return isDraftDone(d);
}

function refreshDraftUI() {
  const d = state.draft;
  $("#draft-turn").textContent = d.turn === "A" ? d.teams.A.name : d.teams.B.name;
  const staffLeft = d.budgetMode
    ? 0
    : (d.needCoach[d.turn] ? 1 : 0) + (d.needAssistant[d.turn] ? 1 : 0);
  $("#draft-left").textContent = String(
    d.picksPerSide - d.teams[d.turn].players.length + staffLeft
  );
  $("#draft-round").textContent = String(d.round);
  const goldEl = $("#draft-gold");
  if (goldEl) goldEl.textContent = String(d.teams[d.turn].gold ?? 0);
  // 自定义模式两边阵容都可拖拽改位（选人过程中也能摆）
  renderRoster("a", d.teams.A, { editable: !!d.budgetMode || d.mode === "duel" });
  renderRoster("b", d.teams.B, { editable: !!d.budgetMode || d.mode === "duel" });
  updateRefreshBtn();
}

/** Map any roster pos string into PG/SG/SF/PF/C. */
function normalizePos(pos) {
  const p = String(pos || "SF").toUpperCase();
  if (POS_SLOTS.some((s) => s.id === p)) return p;
  if (p.includes("G") && p.startsWith("P")) return "PG";
  if (p.includes("G")) return "SG";
  if (p.includes("C")) return "C";
  if (p.includes("F") && p.startsWith("P")) return "PF";
  return "SF";
}

function playerSlotPos(p) {
  return normalizePos(p.playPos || p.pos);
}

/** Group players into five position buckets for draft/legend browsing. */
function groupByPosition(players) {
  const buckets = Object.fromEntries(POS_SLOTS.map((s) => [s.id, []]));
  for (const p of players || []) {
    const slot = playerSlotPos(p);
    (buckets[slot] || buckets.SF).push(p);
  }
  return buckets;
}

function renderPosBoard(players, { usePlayPosLabel = false, editable = false } = {}) {
  const buckets = groupByPosition(players);
  const missing = POS_SLOTS.filter((s) => !buckets[s.id].length).map((s) => s.id);
  const gap = POS_SLOTS.map((s) => {
    const n = buckets[s.id].length;
    return `<span class="pos-gap-chip ${n ? "ok" : "need"}">${s.id}${n ? `×${n}` : " 缺"}</span>`;
  }).join("");
  const missLine = missing.length
    ? `<div class="tiny" style="margin:0 0 6px">还缺位置：<strong>${missing.join("、")}</strong></div>`
    : `<div class="tiny" style="margin:0 0 6px">五位置已覆盖</div>`;
  const editHint = editable
    ? `<div class="tiny pos-edit-hint">可随时改位置：拖到其他号位，或用下拉框。适配与暗属性会随阵容重算。</div>`
    : "";

  const rows = POS_SLOTS.map((s) => {
    const list = buckets[s.id];
    const body = list.length
      ? list
          .map((p) => {
            const natural = p.pos && normalizePos(p.pos) !== s.id ? `原${p.pos}·` : "";
            const label = usePlayPosLabel
              ? `${p.name} <span class="tiny">(${p.season} ${natural}${p.franchiseId || p.team || ""})</span>`
              : `${p.name} <span class="tiny">(${p.season}${p.pos && p.pos !== s.id ? ` · 原${p.pos}` : ""})</span>`;
            const boost = editable && p._posBoostNote
              ? `<div class="tiny pos-boost-note">↑ ${escAttr(p._posBoostNote)}</div>`
              : "";
            const sel = editable
              ? `<select class="pos-select pos-board-select" data-id="${p.id}" title="改打位置">${POS_SLOTS.map(
                  (slot) =>
                    `<option value="${slot.id}" ${slot.id === s.id ? "selected" : ""}>${slot.id}${
                      slot.id === normalizePos(p.pos) ? "·本职" : ""
                    }</option>`
                ).join("")}</select>`
              : "";
            const drag = editable ? `draggable="true" data-drag-id="${p.id}"` : "";
            return `<li class="roster-line ${editable ? "editable" : ""}" ${drag}>
              ${photoImg(p, "headshot sm")}
              <span class="roster-line-main">${label}${boost}</span>
              ${sel}
            </li>`;
          })
          .join("")
      : `<li class="pos-empty-hint">空缺 — ${editable ? "把球员拖到这里" : `建议补一名 ${s.label}`}</li>`;
    return `<div class="pos-row ${list.length ? "" : "empty"}" data-drop-pos="${s.id}">
      <div class="pos-row-head"><span>${s.label}</span><span class="pos-count">${list.length} 人</span></div>
      <ul class="pos-row-body">${body}</ul>
    </div>`;
  }).join("");

  return `<div class="pos-gap">${gap}</div>${missLine}${editHint}${rows}`;
}

/** Wire drag + dropdown on an editable pos board. */
function bindEditablePosBoard(box, players, onChanged) {
  if (!box || !players) return;
  box.querySelectorAll(".pos-board-select").forEach((sel) => {
    sel.onchange = (e) => {
      e.stopPropagation();
      const p = players.find((x) => x.id === sel.dataset.id);
      if (!p) return;
      markPlayPosManual(p, sel.value);
      onChanged?.();
    };
    sel.onclick = (e) => e.stopPropagation();
  });
  let dragId = null;
  box.querySelectorAll(".roster-line[draggable]").forEach((li) => {
    li.addEventListener("dragstart", (e) => {
      dragId = li.dataset.dragId;
      li.classList.add("dragging");
      e.dataTransfer?.setData("text/plain", dragId);
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      box.querySelectorAll(".pos-row").forEach((r) => r.classList.remove("drag-over"));
      dragId = null;
    });
  });
  box.querySelectorAll(".pos-row[data-drop-pos]").forEach((row) => {
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const id = e.dataTransfer?.getData("text/plain") || dragId;
      const p = players.find((x) => x.id === id);
      if (!p) return;
      const next = normalizePos(row.dataset.dropPos);
      if (normalizePos(p.playPos || p.pos) === next) return;
      markPlayPosManual(p, next);
      onChanged?.();
    });
  });
}

function lineupChemistryPreviewHtml(players, coach = null, tactic = null, { primaryId = null } = {}) {
  if (!players?.length) return "";
  const ballOpts = { primaryId };
  const fit = lineupFit(players, coach, tactic, ballOpts);
  const chem = teamChemistry(players, ballOpts);
  const ball = lineupBallNote(players, ballOpts);
  const boostNotes = players.filter((p) => p._posBoostNote).slice(0, 3);
  const bits = [`适配 ${fit}`, `化学反应 ${chem}`];
  if (ball) bits.push(ball);
  const boostLine = boostNotes.length
    ? `<div class="tiny pos-boost-summary">${boostNotes
        .map((p) => `${p.name}↑ ${escAttr(p._posBoostNote)}`)
        .join(" · ")}</div>`
    : "";
  return `<div class="legend-fit-preview"><strong>${bits.join(" · ")}</strong>${boostLine}</div>`;
}

function renderRoster(key, team, { editable = false } = {}) {
  const box = $(`#roster-${key}`);
  if (box) {
    if (editable) applyLineupPositionEffects(team.players);
    box.innerHTML = renderPosBoard(team.players, {
      usePlayPosLabel: true,
      editable,
    });
    if (editable) bindEditablePosBoard(box, team.players, () => refreshDraftUI());
  }
  const spent =
    state.draft?.budgetMode && Array.isArray(team.players)
      ? team.players.reduce((s, p) => s + customPriceOf(p), 0)
      : null;
  const budgetBit =
    spent != null ? ` · 已花 ${spent}/${CUSTOM_BUDGET} 块 · 剩 ${team.gold ?? 0}` : "";
  const autoHint =
    team.coach && isObscureStaff(team.coach)
      ? ` · 放权 ${team.coach.playerAutonomy ?? "?"}`
      : team.coach
        ? ` · 自主 ${team.coach.playerAutonomy ?? "-"}`
        : "";
  $(`#coach-${key}`).textContent = team.coach
    ? `教练：${team.coach.name}（${team.coach.season}）· ${team.coach.style}${autoHint}`
    : `未选教练${budgetBit}`;
  if (!team.coach && budgetBit) {
    $(`#coach-${key}`).textContent = `预算${budgetBit}`;
  }
  const asstEl = $(`#asst-${key}`);
  if (asstEl) {
    asstEl.textContent = team.assistant
      ? `助教：${team.assistant.name} · ${team.assistant.role || "助教"}（激发 ${team.assistant.sparkPotential ?? "-"}）`
      : team.coach
        ? "未选助教"
        : budgetBit
          ? `剩 ${team.gold ?? 0} 块`
          : "未选助教";
  }
}

$("#btn-start-game").onclick = () => {
  const d = state.draft;
  if (!draftComplete()) return;
  if (d.mode === "custom") {
    applyLineupPositionEffects(d.teams.A.players);
    // 15 块预算轮抽完成 → 带着名单挑战 32 支历史球队淘汰赛
    beginCustomHistoricalCareer(d.teams.A);
    return;
  }
  if (d.mode === "duel") {
    // Duel: market bidding first, then setup+series style single game for now → career-like gold path
    state.career = {
      kind: "duel",
      round: 1,
      goldA: d.teams.A.gold || 800,
      goldB: d.teams.B.gold || 800,
      teamA: d.teams.A,
      teamB: d.teams.B,
      used: new Set([...d.teams.A.players, ...d.teams.B.players].map((p) => p.id)),
      shop: null,
      finals: false,
      series: null,
    };
    openMarket({ duel: true, refillShop: true });
    return;
  }
  openSetup(d.teams.A, d.teams.B, "home");
};

// —— Career progression ——
// —— Legend Mode ——
function shuffleCopy(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Same person across seasons — Mourning 1994 and 1995 share one key. */
function legendPlayerKey(p) {
  return String(p.bref || p.nameEn || p.name || p.id)
    .toLowerCase()
    .trim();
}

function startLegendMode() {
  const eight = shuffleCopy(FRANCHISES).slice(0, 8);
  state.legend = {
    franchises: eight,
    /** Shuffle once; consume without replacement until empty, then reshuffle. */
    franchiseQueue: shuffleCopy(eight),
    lastFranchiseId: null,
    roster: [],
    usedIds: new Set(),
    usedPlayerKeys: new Set(),
    current: null,
    pickId: null,
    pickPos: "SF",
    targetSize: 10,
  };
  $("#legend-franchises").innerHTML = eight
    .map((f) => `<span class="franchise-chip" data-id="${f.id}">${f.name} <small>${f.id}</small></span>`)
    .join("");
  $("#legend-pos").innerHTML = POS_SLOTS.map(
    (s) =>
      `<label><input type="radio" name="legend-pos" value="${s.id}" ${s.id === "SF" ? "checked" : ""}/> ${s.label}</label>`
  ).join("");
  $("#legend-pos").onchange = () => {
    const v = $("#legend-pos").querySelector("input:checked")?.value;
    if (v) state.legend.pickPos = v;
  };
  const status = $("#legend-status");
  if (status) {
    status.textContent =
      "本局八支传奇球队如下。每轮抽队选人（可先指定位置）。加入后仍可在右侧阵容里随时改位（拖拽或下拉）；适配、化学反应与暗属性会随阵容重算——例如欧文选 1 号后可改打 2 号，旁边有组织后卫时无球/适配可能提升。";
  }
  renderLegendRoster();
  rollLegendTeam();
  show("legend");
}

function nextLegendFranchise() {
  const L = state.legend;
  if (!L.franchiseQueue.length) {
    // New cycle: reshuffle all eight; avoid immediately repeating the last team
    let next = shuffleCopy(L.franchises);
    if (L.lastFranchiseId && next.length > 1 && next[0].id === L.lastFranchiseId) {
      const swap = next.findIndex((f) => f.id !== L.lastFranchiseId);
      if (swap > 0) [next[0], next[swap]] = [next[swap], next[0]];
    }
    L.franchiseQueue = next;
  }
  const f = L.franchiseQueue.shift();
  L.lastFranchiseId = f.id;
  return f;
}

function rollLegendTeam() {
  const L = state.legend;
  if (!L) return;
  // Try up to all franchises if a team's pool is empty after exclusions
  let f = null;
  let list = [];
  const tried = new Set();
  while (tried.size < L.franchises.length) {
    f = nextLegendFranchise();
    tried.add(f.id);
    const pool = playersForFranchise(PLAYERS, f).filter((p) => !L.usedPlayerKeys.has(legendPlayerKey(p)));
    const byKey = new Map();
    for (const p of pool) {
      const key = legendPlayerKey(p);
      const prev = byKey.get(key);
      if (!prev || overall(p) > overall(prev)) byKey.set(key, p);
    }
    list = [...byKey.values()].sort((a, b) => overall(b) - overall(a));
    if (list.length) break;
  }

  L.current = f;
  L.pickId = null;
  $("#legend-round-team").textContent = `${f.name}（${f.id}）`;
  markLegendFranchiseChips(L);

  const top = list.slice(0, 16);
  const rest = shuffleCopy(list.slice(16)).slice(0, 10);
  list = shuffleCopy([...top, ...rest]).slice(0, 18);

  const box = $("#legend-pool");
  if (!list.length) {
    box.innerHTML = `<p class="tiny">可用历史球员已抽空，请点「换下一队」。</p>`;
  } else {
    box.innerHTML = list
      .map((p) => {
        const tips = topIntangibles(p, 2)
          .map((t) => `${t.name}${t.value}`)
          .join(" · ");
        return `<button class="setup-player" data-id="${p.id}">
          ${photoImg(p)}
          <div>
            <strong>${p.name}</strong>
            <div class="tiny">${p.season} · 原位置 ${p.pos} · OVR ${overall(p)} · ${p.team}${
              physiqueLabel(p) ? ` · ${physiqueLabel(p)}` : ""
            }</div>
            <div class="tiny">攻${p.scoring} 防${p.defense} 传${p.pass} 板${p.rebound} 断${p.steal} 帽${p.block}</div>
            <div class="tiny">暗属性 ${tips}</div>
          </div>
        </button>`;
      })
      .join("");
    box.querySelectorAll(".setup-player").forEach((btn) => {
      btn.onclick = () => {
        L.pickId = btn.dataset.id;
        box.querySelectorAll(".setup-player").forEach((b) => b.classList.toggle("selected", b.dataset.id === L.pickId));
        const p = list.find((x) => x.id === L.pickId);
        $("#legend-picked").textContent = p
          ? `已选：${p.name}（${p.season}）· 将放入你指定的位置`
          : "未选球员";
        $("#btn-legend-confirm").disabled = !L.pickId;
      };
    });
  }
  $("#btn-legend-confirm").disabled = true;
  $("#legend-picked").textContent = "未选球员";
  $("#legend-count").textContent = String(L.roster.length);
  $("#btn-legend-finish").disabled = L.roster.length < L.targetSize;
}

function markLegendFranchiseChips(L) {
  const remaining = new Set((L.franchiseQueue || []).map((f) => f.id));
  $("#legend-franchises").querySelectorAll(".franchise-chip").forEach((el) => {
    const id = el.dataset.id;
    el.classList.toggle("active", id === L.current?.id);
    // Already drawn this cycle (not in queue, not current)
    el.classList.toggle("drawn", id !== L.current?.id && !remaining.has(id));
  });
}

function renderLegendRoster() {
  const L = state.legend;
  const box = $("#legend-roster");
  if (box) {
    if (!L.roster.length) {
      box.innerHTML = `<p class="tiny">还没有人选 — 按 1～5 号位挑选；加入后可随时改位</p>`;
    } else {
      applyLineupPositionEffects(L.roster);
      box.innerHTML =
        renderPosBoard(L.roster, { usePlayPosLabel: true, editable: true }) +
        lineupChemistryPreviewHtml(L.roster, null, null);
      bindEditablePosBoard(box, L.roster, () => renderLegendRoster());
    }
  }
  $("#legend-count").textContent = String(L.roster.length);
  $("#btn-legend-finish").disabled = L.roster.length < L.targetSize;
}

$("#btn-legend-confirm").onclick = () => {
  const L = state.legend;
  if (!L?.pickId || !L.current) return;
  const pos = $("#legend-pos").querySelector("input:checked")?.value || L.pickPos || "SF";
  const src = PLAYERS.find((p) => p.id === L.pickId);
  if (!src) return;
  const card = clonePlayer(src);
  card.playPos = pos;
  card.franchiseId = L.current.id;
  card.tags = [...(card.tags || []), `${L.current.name}传奇`].slice(0, 4);
  L.roster.push(card);
  applyLineupPositionEffects(L.roster);
  L.usedIds.add(card.id);
  L.usedPlayerKeys.add(legendPlayerKey(card));
  renderLegendRoster();
  if (L.roster.length >= L.targetSize) {
    $("#legend-picked").textContent = "已满 10 人，可去赛前设置；也可继续抽人到 12。";
    $("#btn-legend-finish").disabled = false;
    if (L.roster.length >= 12) {
      $("#btn-legend-confirm").disabled = true;
      return;
    }
  }
  rollLegendTeam();
};

$("#btn-legend-next-team").onclick = () => rollLegendTeam();

$("#btn-legend-finish").onclick = () => {
  const L = state.legend;
  if (!L || L.roster.length < L.targetSize) return;
  applyLineupPositionEffects(L.roster);
  const coach = structuredClone(COACHES[Math.floor(Math.random() * COACHES.length)]);
  // Prefer one player per slot for default starters when possible
  const bySlot = groupByPosition(L.roster);
  const starters = [];
  for (const s of POS_SLOTS) {
    if (bySlot[s.id]?.[0]) starters.push(bySlot[s.id][0]);
  }
  for (const p of L.roster) {
    if (starters.length >= 5) break;
    if (!starters.includes(p)) starters.push(p);
  }
  const home = {
    name: "传奇联军",
    players: L.roster.slice(0, 12),
    coach,
    starterIds: starters.slice(0, 5).map((p) => p.id),
  };
  const away = autoFillTeam("挑战者", 10);
  openSetup(home, away, "home");
};

const MARKET_REFRESH_COST = 50;
const COACH_REFRESH_COST = 30;
const SKILL_REFRESH_COST = 25;
const SKILL_SHOP_SIZE = 6;

/** 刷新教练货架 + 技能包货架（可只刷其一） */
function rollCareerStaffShops(c, { coaches = true, skills = true } = {}) {
  if (!c || c.kind !== "career") return;
  if (coaches) rollCareerCoachShop(c);
  if (skills) {
    const prev = (c.skillShop || []).map((x) => x.id);
    // 连续刷新避开上一柜，并记住近期出现过的，减少「来回就那几样」
    const recent = [...new Set([...(c.skillShopRecent || []), ...prev])].slice(-18);
    c.skillShop = rollSkillShopOffers(SKILL_SHOP_SIZE, recent);
    c.skillShopRecent = [...new Set([...recent, ...c.skillShop.map((x) => x.id)])].slice(-24);
  }
}
const SCOUT_PACK_COST_MIN = 70;
const SCOUT_PACK_COST_MAX = 100;
/** 换货时出现球探包的基础概率（新一轮 / 手动刷新都会重 roll，不是每轮必出） */
const SCOUT_PACK_CHANCE = 0.28;
/** 花钱刷新球员市场时略低，避免刷出来 */
const SCOUT_PACK_REFRESH_CHANCE = 0.2;

/** Gold cost to hire a coach in 晋级赛 (one-time buyout). */
function careerCoachPrice(coach) {
  if (!coach) return 80;
  const tier = coach.hiddenTier || "bench";
  const table = {
    nba50: 520,
    hof: 420,
    superstar: 360,
    allstar: 280,
    star: 200,
    starter: 130,
    bench: 70,
    water_cooler: 45,
    undrafted_gleague: 35,
  };
  let price = table[tier] ?? 90;
  if (isLegendCoach(coach)) price = Math.max(price, 380);
  const fame = Number(coach.fame) || 0;
  if (fame >= 90) price += 40;
  else if (fame >= 75) price += 20;
  return price;
}

function rollCareerCoachShop(c, size = 5) {
  if (!c) return [];
  // Coach pool is small — only hide current staff + coaches already bought this run
  const blocked = new Set([...(c.hiredCoachIds || [])]);
  if (c.team?.coach?.id) blocked.add(c.team.coach.id);
  if (c.team?.assistant?.id) blocked.add(c.team.assistant.id);
  let pool = shuffleArr(COACHES.filter((x) => x?.id && !blocked.has(x.id)));
  if (pool.length < size) {
    // Allow previously fired staff back onto the board if pool is thin
    pool = shuffleArr(COACHES.filter((x) => x?.id && x.id !== c.team?.coach?.id));
  }
  const picks = [];
  for (const coach of pool) {
    if (picks.length >= size) break;
    const card = structuredClone(coach);
    card.hireCost = careerCoachPrice(coach);
    picks.push(card);
  }
  c.coachShop = picks;
  return picks;
}

function hireCareerCoach(coachId) {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  const offer = (c.coachShop || []).find((x) => x.id === coachId);
  if (!offer) {
    alert("该教练已不在市场上");
    return;
  }
  const cost = offer.hireCost ?? careerCoachPrice(offer);
  if ((c.gold || 0) < cost) {
    alert(`聘请「${offer.name}」需要 ¤${cost}，当前 ¤${c.gold || 0}`);
    return;
  }
  const old = c.team.coach;
  let refund = 0;
  if (old?.id && old.id !== offer.id) {
    refund = Math.round(careerCoachPrice(old) * 0.4);
  }
  c.gold = (c.gold || 0) - cost + refund;
  c.team.coach = structuredClone(offer);
  delete c.team.coach.hireCost;
  // Keep default playbook on their first special tactic
  const book = coachTactics(c.team.coach);
  if (book[0] && !c.team.coach.specialTactics?.includes(book[0].id)) {
    c.team.coach.specialTactics = [book[0].id, ...(c.team.coach.specialTactics || [])];
  }
  c.hiredCoachIds = [...new Set([...(c.hiredCoachIds || []), offer.id])];
  c.coachShop = (c.coachShop || []).filter((x) => x.id !== offer.id);
  const tip = refund
    ? `已聘请「${offer.name}」（花 ¤${cost}，旧帅折现 ¤${refund}）`
    : `已聘请「${offer.name}」（¤${cost}）`;
  openMarket({ career: true });
  alert(tip);
}

function renderCareerCoachPanel(c) {
  const panel = $("#career-coach-panel");
  const shopBox = $("#career-coach-shop");
  const skillBox = $("#career-skill-shop");
  const curEl = $("#career-coach-current");
  if (!panel || !shopBox) return;
  const show = c?.kind === "career";
  panel.hidden = !show;
  if (!show) return;
  if (!c.coachShop?.length || !c.skillShop?.length) {
    rollCareerStaffShops(c, {
      coaches: !c.coachShop?.length,
      skills: !c.skillShop?.length,
    });
  }
  const coach = c.team?.coach;
  const tactics = coach ? coachTactics(coach) : [];
  if (curEl) {
    curEl.innerHTML = coach
      ? `当前：<strong>${esc(coach.name)}</strong> · ${esc(coachRecordLabel(coach))} · 擅长 ${esc(
          coachSpecialtyLabel(coach)
        )} · 战术 ${tactics
          .slice(0, 3)
          .map((t) => esc(t.name))
          .join(" / ")}${isLegendCoach(coach) ? ' <span class="rarity-tag myth">名帅</span>' : ""} · 身价约 ¤${careerCoachPrice(
          coach
        )}`
      : `<em class="inj">尚未聘请主教练——可从下方市场选，或不请直接出战（系统随机 roll 主教练+助教）</em>`;
  }
  const gold = c.gold || 0;
  shopBox.innerHTML = (c.coachShop || [])
    .map((offer) => {
      const cost = offer.hireCost ?? careerCoachPrice(offer);
      const book = coachTactics(offer)
        .slice(0, 3)
        .map((t) => t.name)
        .join(" / ");
      const can = gold >= cost;
      const isCur = coach?.id === offer.id;
      return `<div class="career-coach-card ${isCur ? "current" : ""}">
        <strong>${esc(offer.name)}${isLegendCoach(offer) ? ' <span class="rarity-tag myth">名帅</span>' : ""}</strong>
        <div class="tiny">${esc(coachRecordLabel(offer))}</div>
        <div class="tiny">擅长 ${esc(coachSpecialtyLabel(offer))}</div>
        <div class="tiny">${esc(offer.style || "")}</div>
        <div class="tiny">战术板：${esc(book || "—")}</div>
        <div class="tiny">${esc(offer.note || "")}</div>
        <button type="button" class="btn small primary" data-hire-career-coach="${offer.id}" ${
          can && !isCur ? "" : "disabled"
        }>${isCur ? "已是主帅" : can ? `聘请 ¤${cost}` : `差钱 ¤${cost}`}</button>
      </div>`;
    })
    .join("");
  shopBox.querySelectorAll("[data-hire-career-coach]").forEach((btn) => {
    btn.onclick = () => hireCareerCoach(btn.dataset.hireCareerCoach);
  });
  renderCareerSkillShop(c);
}

function ensureSkillInventory(c) {
  if (!c) return [];
  if (!Array.isArray(c.skillInventory)) c.skillInventory = [];
  return c.skillInventory;
}

/** 市场 / 选首发 / 暂停 — 三处技能货架与技能库 */
function skillPanelRoots() {
  return [
    {
      shop: $("#career-skill-shop"),
      inv: $("#career-skill-inventory"),
      hint: $("#career-skill-hint"),
    },
    {
      shop: $("#setup-skill-shop"),
      inv: $("#setup-skill-inventory"),
      hint: $("#setup-skill-hint"),
    },
    {
      shop: $("#live-skill-shop"),
      inv: $("#live-skill-inventory"),
      hint: $("#live-skill-hint"),
    },
  ];
}

function paintSkillShopRoot({ shop: skillBox, inv: invBox, hint }, c) {
  if (!skillBox) return;
  if (!c?.skillShop?.length) rollCareerStaffShops(c, { coaches: false, skills: true });
  const roster = c.team?.players || [];
  const gold = c.gold || 0;
  const inv = ensureSkillInventory(c);
  if (hint) {
    hint.textContent = `货架 6 格，刷新会避开近期出现过的包；铁肺/永动机/铁人会提高曝光。满员可卸或替换。已购卸下退回库；卖掉按约 ${Math.round(SKILL_SELL_RATE * 100)}% 变现。组合技不可买/卸。刷新 ¤${SKILL_REFRESH_COST}。`;
  }
  skillBox.innerHTML = (c.skillShop || [])
    .map((offer) => {
      const cost = offer.cost || 99;
      const canAfford = gold >= cost;
      const rarity = offer.rarityLabel || offer.rarity || "";
      return `<div class="career-skill-card rarity-${escAttr(offer.rarity || "common")}">
        <strong>${esc(offer.name)}${
          rarity ? ` <span class="rarity-tag ${escAttr(offer.rarity || "")}">${esc(rarity)}</span>` : ""
        }</strong>
        <div class="tiny">${esc(offer.desc || "")}</div>
        <div class="tiny">标价 ¤${cost}${offer.rarity === "mythic" ? " · 对齐超巨身价" : ""}</div>
        <button type="button" class="btn small primary" data-buy-skill="${offer.id}" ${
          canAfford ? "" : "disabled"
        }>${canAfford ? `买入入库 ¤${cost}` : `差钱 ¤${cost}`}</button>
      </div>`;
    })
    .join("") || `<p class="tiny">货架空了——可在市场刷新技能包。</p>`;
  skillBox.querySelectorAll("[data-buy-skill]").forEach((btn) => {
    btn.onclick = () => buyCareerSkillPack(btn.dataset.buySkill);
  });

  if (!invBox) return;
  const manageHtml = paintSkillManageBlock(roster);
  if (!inv.length) {
    invBox.innerHTML =
      `<p class="tiny">技能库空着——买入后会出现在这里，可随时安装。</p>` + manageHtml;
    bindSkillManageClicks(invBox);
    return;
  }
  invBox.innerHTML =
    inv
      .map((owned, idx) => {
        const pack = SKILL_PACKS[owned.id] || owned;
        const opts = roster
          .map((p) => {
            const have = (p.skills || []).includes(owned.id);
            const full = nonDuoSkillCount(p) >= 7;
            const disabled = have || !roster.length;
            const tag = have ? " · 已有" : full ? " · 已满可替换" : "";
            const seasonBit = p.season ? ` ${p.season}` : "";
            return `<option value="${p.id}" ${disabled ? "disabled" : ""}>${esc(p.name)}${seasonBit}${tag}</option>`;
          })
          .join("");
        const anyTarget = roster.some((p) => !(p.skills || []).includes(owned.id));
        const dropOpts = roster
          .flatMap((p) =>
            removableSkills(p).map((sid) => {
              const sn = SKILL_PACKS[sid]?.name || sid;
              return `<option value="${p.id}::${sid}">卸 ${esc(p.name)} · ${esc(sn)}</option>`;
            })
          )
          .join("");
        return `<div class="career-skill-card rarity-${escAttr(owned.rarity || "common")}">
        <strong>${esc(pack.name || owned.name)}</strong>
        <div class="tiny">${esc(pack.desc || owned.desc || "")}</div>
        <div class="skill-install-row">
          <select data-inv-target="${idx}" title="装给谁">${opts || "<option value=''>—</option>"}</select>
          <select data-inv-drop="${idx}" title="技能已满时选择卸下哪项（有空位可留空）">
            <option value="">满员时先卸…</option>
            ${dropOpts}
          </select>
          <button type="button" class="btn small primary" data-install-inv="${idx}" ${
            anyTarget ? "" : "disabled"
          }>${anyTarget ? "安装" : roster.length ? "无人可装" : "无球员"}</button>
        </div>
      </div>`;
      })
      .join("") + manageHtml;
  invBox.querySelectorAll("[data-install-inv]").forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.installInv);
      const sel = invBox.querySelector(`select[data-inv-target="${idx}"]`);
      const dropSel = invBox.querySelector(`select[data-inv-drop="${idx}"]`);
      let dropSkillId = null;
      const dropVal = dropSel?.value || "";
      if (dropVal.includes("::")) {
        const [pid, sid] = dropVal.split("::");
        if (pid === sel?.value) dropSkillId = sid;
      }
      installInventorySkill(idx, sel?.value, dropSkillId);
    };
  });
  bindSkillManageClicks(invBox);
}

function paintSkillManageBlock(roster) {
  const rows = (roster || [])
    .filter((p) => removableSkills(p).length)
    .map((p) => {
      const chips = removableSkills(p)
        .map((id) => {
          const s = SKILL_PACKS[id];
          if (!s) return "";
          const bought = (p.purchasedSkills || []).includes(id);
          return `<span class="skill-chip removable ${s.tone}${bought ? " bought" : ""}" data-forget-player="${p.id}" data-forget-skill="${id}" title="点击卸下「${escAttr(s.name)}」${bought ? "（退回技能库）" : ""}">${s.name}</span>`;
        })
        .join("");
      return `<div class="skill-manage-card">
        <strong>${esc(p.name)}</strong>
        <span class="tiny"> · 点芯片卸下（组合技除外）</span>
        <div class="skill-row">${chips}</div>
      </div>`;
    })
    .join("");
  if (!rows) return "";
  return `<div class="skill-manage-list"><h4 class="tiny" style="margin:8px 0 0">已装技能 · 点击卸下</h4>${rows}</div>`;
}

function bindSkillManageClicks(root) {
  root?.querySelectorAll("[data-forget-skill]").forEach((chip) => {
    chip.onclick = () => forgetPlayerSkill(chip.dataset.forgetPlayer, chip.dataset.forgetSkill);
  });
}

function renderCareerSkillShop(c) {
  if (!c || c.kind !== "career") return;
  syncTeamDuoSkills(c.team?.players || []);
  for (const root of skillPanelRoots()) paintSkillShopRoot(root, c);
}

/** 金币变动后立刻刷新自由市场可买态（否则会「显示可点、点了才说差钱」） */
function refreshMarketGoldUi(c = state.career) {
  if (!c) return;
  if (c.kind === "career") {
    const goldEl = $("#gold-amt");
    if (goldEl) goldEl.textContent = String(c.gold || 0);
    const hint = $("#shop-budget-hint");
    if (hint && c.shop) {
      hint.textContent = `当前可负担约 ¤${c.gold || 0} 以内 · 列表 ${c.shop.length} 人`;
    }
    if (c.shop?.length && $("#free-agent-list")) paintFreeAgentList(c, false);
    paintScoutPackOffer(c);
    renderCareerCoachPanel(c);
  } else if (c.kind === "duel") {
    const goldEl = $("#gold-amt");
    if (goldEl) goldEl.textContent = `A ${c.goldA} / B ${c.goldB}`;
    if (c.shop?.length && $("#free-agent-list")) paintFreeAgentList(c, true);
    paintScoutPackOffer(c);
  }
}

/** 买/装技能后停留在当前页，不强制跳回市场 */
function afterSkillChange(msg) {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  if (c.team) c.team.gold = c.gold;
  syncTeamDuoSkills(c.team?.players || []);
  if (state.setup?.you?.players) syncTeamDuoSkills(state.setup.you.players);
  try {
    const you = state.sim?.you?.();
    if (you?.roster) syncTeamDuoSkills(you.roster);
  } catch (_) {
    /* ignore */
  }
  const screen = activeScreenName();
  // 市场页：先重绘阵容技能栏，再刷货架/金币/自由市场灰态
  if (screen === "market") {
    try {
      refreshMarketRosterView();
    } catch (_) {
      /* ignore */
    }
    try {
      refreshMarketGoldUi(c);
    } catch (_) {
      /* ignore */
    }
  } else {
    renderCareerSkillShop(c);
    const goldEl = $("#gold-amt");
    if (goldEl) goldEl.textContent = String(c.gold || 0);
  }
  // 选首发页：刷新技能芯片
  if (state.setup?.you && screen === "setup") {
    try {
      renderSetupRoster();
      renderCareerSkillShop(c);
    } catch (_) {
      /* ignore */
    }
  }
  // 暂停中：刷新场上展示
  if (state.sim?.paused) {
    try {
      const snap = state.sim.snapshot();
      paintLineups(snap);
      paintMeters(snap);
      renderCareerSkillShop(c);
    } catch (_) {
      /* ignore */
    }
  }
  if (msg) alert(msg);
}

/** 买入入库（不立刻装到球员） */
function buyCareerSkillPack(skillId) {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  const offer = (c.skillShop || []).find((x) => x.id === skillId);
  if (!offer) {
    alert("该技能包已不在货架上");
    return;
  }
  if (SKILL_PACKS[skillId]?.duo || SKILL_PACKS[skillId]?.exclusive) {
    alert("组合技 / 专属技不可购买学习");
    return;
  }
  const cost = offer.cost || 99;
  if ((c.gold || 0) < cost) {
    alert(`「${offer.name}」需要 ¤${cost}，当前 ¤${c.gold || 0}`);
    return;
  }
  const inv = ensureSkillInventory(c);
  c.gold = (c.gold || 0) - cost;
  inv.push({
    id: offer.id,
    name: offer.name,
    desc: offer.desc,
    rarity: offer.rarity,
    rarityLabel: offer.rarityLabel,
    cost,
  });
  c.skillShop = (c.skillShop || []).filter((x) => x.id !== skillId);
  afterSkillChange(`已将「${offer.name}」放入技能库（¤${cost}）——可随时安装`);
}

/** 收集同 id 球员的所有活引用（生涯名单 / 赛前 / 场上 clone） */
function skillInstallTargets(playerId) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  const c = state.career;
  add(c?.team?.players?.find((p) => p.id === playerId));
  add(state.setup?.you?.players?.find((p) => p.id === playerId));
  try {
    const you = state.sim?.you?.();
    add((you?.roster || []).find((p) => p.id === playerId));
    add((you?.onCourt || []).find((p) => p.id === playerId));
    add((you?.bench || []).find((p) => p.id === playerId));
  } catch (_) {
    /* ignore */
  }
  return out;
}

/** 卸下球员技能；已购的退回技能库 */
function forgetPlayerSkill(playerId, skillId) {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  const targets = skillInstallTargets(playerId);
  const player = targets[0];
  if (!player) {
    alert("找不到该球员");
    return;
  }
  const pack = SKILL_PACKS[skillId];
  if (!pack) return;
  if (pack.duo) {
    alert("组合技不可手动卸下");
    return;
  }
  if (!confirm(`卸下 ${player.name} 的「${pack.name}」？${(player.purchasedSkills || []).includes(skillId) ? "（已购技能退回技能库）" : ""}`)) {
    return;
  }
  let returned = null;
  for (const t of targets) {
    const res = removeSkillFromPlayer(t, skillId);
    if (res.ok && res.returnToInv) returned = res.returnToInv;
  }
  if (returned) {
    ensureSkillInventory(c).push(returned);
  }
  afterSkillChange(
    returned
      ? `已卸下「${pack.name}」，退回技能库`
      : `已卸下 ${player.name} 的「${pack.name}」`
  );
}

/** 从技能库安装到指定球员（市场 / 选首发 / 暂停皆可）；满员时可指定 dropSkillId 替换 */
function installInventorySkill(invIndex, playerId, dropSkillId = null) {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  const inv = ensureSkillInventory(c);
  const owned = inv[invIndex];
  if (!owned) {
    alert("技能库里找不到这项");
    return;
  }
  const targets = skillInstallTargets(playerId);
  const player = targets[0];
  if (!player) {
    alert("请选择要安装的球员");
    return;
  }
  if ((player.skills || []).includes(owned.id)) {
    alert(`${player.name} 已有「${owned.name}」`);
    return;
  }
  let dropId = dropSkillId;
  if (nonDuoSkillCount(player) >= 7) {
    if (!dropId) {
      const list = removableSkills(player)
        .map((id, i) => `${i + 1}. ${SKILL_PACKS[id]?.name || id}`)
        .join("\n");
      const pick = prompt(
        `${player.name} 技能位已满。输入要卸下的序号（1-${removableSkills(player).length}）：\n${list}`
      );
      const n = Number(pick);
      if (!Number.isFinite(n) || n < 1 || n > removableSkills(player).length) {
        alert("已取消。也可在下方「已装技能」点芯片卸下后再装。");
        return;
      }
      dropId = removableSkills(player)[n - 1];
    }
    if (dropId === owned.id) {
      alert("不能卸下与要安装的同一技能");
      return;
    }
    let returned = null;
    for (const t of targets) {
      const res = removeSkillFromPlayer(t, dropId);
      if (!res.ok && t === player) {
        alert(res.reason || "卸下失败");
        return;
      }
      if (res.ok && res.returnToInv) returned = res.returnToInv;
    }
    if (returned) ensureSkillInventory(c).push(returned);
  }
  let ok = false;
  for (const t of targets) {
    if ((t.skills || []).includes(owned.id)) {
      markPurchasedSkill(t, owned.id, owned.cost);
      ok = true;
      continue;
    }
    if (grantSkillToPlayer(t, owned.id)) {
      markPurchasedSkill(t, owned.id, owned.cost);
      ok = true;
    }
  }
  if (!ok) {
    alert("安装失败（组合技等专属技能不可学习）");
    return;
  }
  for (const t of targets) {
    markPurchasedSkill(t, owned.id, owned.cost);
    if (!(t.skills || []).includes(owned.id)) {
      t.skills = [...(t.skills || []), owned.id];
    }
  }
  inv.splice(invIndex, 1);
  const dropName = dropId ? SKILL_PACKS[dropId]?.name : null;
  afterSkillChange(
    dropName
      ? `已卸下「${dropName}」，并将「${owned.name}」装到 ${player.name}`
      : `已将「${owned.name}」装到 ${player.name}（卖掉时可按约 ${Math.round(SKILL_SELL_RATE * 100)}% 变现）`
  );
}

/** Best unique-bref cards who ever suited up for a franchise. */
function buildFranchiseRoster(franchise, used, n = 10, power = 0) {
  const byBref = new Map();
  for (const p of playersForFranchise(PLAYERS, franchise)) {
    if (used.has(p.id)) continue;
    const prev = byBref.get(p.bref);
    if (!prev || overall(p) > overall(prev)) byBref.set(p.bref, p);
  }
  let picks = [...byBref.values()].sort((a, b) => overall(b) - overall(a));
  if (power > 0 && picks.length > n) {
    // Slightly deeper pool then keep top n after shuffle of top band
    const band = picks.slice(0, Math.min(picks.length, n + power * 3));
    picks = shuffleArr(band).sort((a, b) => overall(b) - overall(a));
  }
  picks = picks.slice(0, n).map((p) => clonePlayer(p));
  for (const p of picks) used.add(p.id);
  if (picks.length < n) {
    const fill = autoFillTeam(franchise.name, n - picks.length, { excludeIds: used, power });
    for (const p of fill.players) {
      if (picks.length >= n) break;
      picks.push(p);
      used.add(p.id);
    }
  }
  return picks;
}

const CHALLENGER_NAMES = [
  "星火联队",
  "黑翼军",
  "银狼",
  "赤焰",
  "北境游侠",
  "湾区海盗",
  "高原猎鹰",
  "港口铁卫",
  "沙漠蝎",
  "雾都影",
  "雷鸣骑兵",
  "寒霜",
  "翡翠城",
  "铜锤",
  "夜鹰",
  "白浪",
  "赤兔",
  "青锋",
  "岚队",
  "潮汐",
  "磐石",
  "流星",
  "苍穹",
  "金戈",
  "玄铁",
  "飞羽",
  "破晓",
  "残阳",
  "孤狼",
  "群鸦",
  "猎手",
];

function makeFranchiseCareerTeam(franchise, { used, isYou = false, power = 0, index = 0 } = {}) {
  const name = isYou ? `你的${franchise.name}` : franchise.name;
  const players = buildFranchiseRoster(franchise, used, isYou ? 8 : 9 + Math.min(2, power), power);
  const starters = COACHES.filter((c) =>
    ["bench", "water_cooler", "undrafted_gleague", "starter"].includes(c.hiddenTier || "")
  );
  const coach = isYou
    ? structuredClone(starters[Math.floor(Math.random() * starters.length)] || COACHES[0])
    : structuredClone(
        COACHES[Math.floor(Math.random() * COACHES.length)] || starters[0] || COACHES[0]
      );
  const team = {
    name,
    franchiseId: franchise.id,
    players,
    coach,
    assistant: null,
    gold: isYou ? 600 : 260 + Math.floor(Math.random() * 140) + power * 40,
    isCpu: !isYou,
    bracketId: isYou ? "you" : `cpu-${franchise.id}-${index}`,
    losses: 0,
  };
  ensureTeamStaff(team, { preferStarter: isYou });
  return team;
}

/** 金币晋级赛：非历史绑定的随机联队（越往后升级越狠） */
function makeRandomCareerTeam({ used, isYou = false, power = 0, index = 0, name = null } = {}) {
  const label =
    name ||
    (isYou
      ? "你的联队"
      : CHALLENGER_NAMES[index % CHALLENGER_NAMES.length] +
        (index >= CHALLENGER_NAMES.length ? `·${index + 1}` : ""));
  const n = isYou ? 8 : 9 + Math.min(3, power);
  const fill = autoFillTeam(label, n, {
    excludeIds: used,
    power: power + (isYou ? 1 : 0),
  });
  for (const p of fill.players) used.add(p.id);
  if (fill.coach?.id) used.add(fill.coach.id);
  if (fill.assistant?.id) used.add(fill.assistant.id);
  const team = {
    name: label,
    franchiseId: null,
    players: fill.players,
    coach: fill.coach || null,
    assistant: fill.assistant || null,
    gold: isYou ? 600 : 240 + Math.floor(Math.random() * 160) + power * 55,
    isCpu: !isYou,
    bracketId: isYou ? "you" : `cpu-r${index}`,
    losses: 0,
  };
  ensureTeamStaff(team, { preferStarter: isYou });
  return team;
}

function bootCareerBracket({
  you,
  field,
  fieldSource,
  fromCustom = false,
  hintGold = null,
  stageSize = null,
  challengeTier = "gold",
  skillInventory = null,
  hiredCoachIds = null,
} = {}) {
  const used = new Set();
  for (const t of field) {
    for (const p of t.players || []) used.add(p.id);
    if (t.coach?.id) used.add(t.coach.id);
    if (t.assistant?.id) used.add(t.assistant.id);
  }
  const n = (field || []).length;
  const startSize = stageSize || (n <= 2 ? 2 : n <= 8 ? 8 : n <= 16 ? 16 : 32);
  state.career = {
    kind: "career",
    fieldSource: fieldSource || "random", // historical | random
    fromCustom: !!fromCustom,
    challengeTier: challengeTier || "gold",
    stageSize: startSize,
    round: 1,
    maxRounds: 5,
    gold: hintGold != null ? hintGold : you.gold,
    team: you,
    used,
    hiredCoachIds: hiredCoachIds || (you.coach?.id ? [you.coach.id] : []),
    shop: null,
    coachShop: null,
    skillShop: null,
    skillInventory: Array.isArray(skillInventory) ? skillInventory : [],
    finals: startSize === 2,
    series: null,
    field,
    alive: shuffleArr(field),
    pods: [],
    roundMatches: [],
    bracketLog: [],
    losses: Object.fromEntries(field.map((t) => [t.bracketId, 0])),
    allTeamBoard: {},
    allTeam: null,
  };
  you.gold = state.career.gold;
  seedCareerStage();
  openMarket({ career: true, refillShop: true });
  autosaveCareer();
}

/** 用史实某年某队阵容做挑战对手 */
function makeYearChallengeTeam(def, used, index, power = 2) {
  const meta = {
    id: def.teamId,
    bref: def.bref || def.teamId,
    name: def.name,
  };
  const built = buildCpuTeamForYear(def.year, meta, used);
  const team = {
    name: def.label || `${def.year} ${def.name}`,
    franchiseId: def.teamId,
    players: built.players || [],
    coach: built.coach || null,
    assistant: built.assistant || null,
    gold: 200 + power * 40,
    isCpu: true,
    bracketId: `cpu-${def.year}-${def.teamId}-${index}`,
    losses: 0,
    challengeYear: def.year,
  };
  ensureTeamStaff(team, { preferStarter: false });
  if (team.coach?.id) used.add(team.coach.id);
  if (team.assistant?.id) used.add(team.assistant.id);
  return team;
}

/**
 * 金币赛冠军后进入下一阶挑战（保留你的阵容/金币/技能库存）。
 * @param {"playoff15"|"champ7"} tier
 */
function beginCareerChallengeTier(tier) {
  const prev = state.career;
  if (!prev?.team) return;
  const defs =
    tier === "champ7" ? HISTORICAL_CHAMPION_CHALLENGERS : HISTORICAL_PLAYOFF_CHALLENGERS;
  const you = {
    name: prev.team.name || "你的联队",
    franchiseId: prev.team.franchiseId || null,
    players: (prev.team.players || []).map((p) => clonePlayer(p)),
    coach: prev.team.coach ? structuredClone(prev.team.coach) : null,
    assistant: prev.team.assistant ? structuredClone(prev.team.assistant) : null,
    gold: prev.gold,
    isCpu: false,
    bracketId: "you",
    losses: 0,
    starterIds: prev.team.starterIds ? [...prev.team.starterIds] : null,
    lineupPacks: prev.team.lineupPacks || null,
    gameplan: prev.team.gameplan ? structuredClone(prev.team.gameplan) : null,
  };
  ensureTeamStaff(you, { preferStarter: true });
  const used = new Set(you.players.map((p) => p.id));
  if (you.coach?.id) used.add(you.coach.id);
  if (you.assistant?.id) used.add(you.assistant.id);

  const field = [you];
  const power = tier === "champ7" ? 3 : 2;
  for (let i = 0; i < defs.length; i++) {
    field.push(makeYearChallengeTeam(defs[i], used, i, power));
  }
  state.mode = "career";
  bootCareerBracket({
    you,
    field,
    fieldSource: "historical",
    fromCustom: false,
    hintGold: prev.gold,
    stageSize: tier === "champ7" ? 8 : 16,
    challengeTier: tier,
    skillInventory: [...(prev.skillInventory || [])],
    hiredCoachIds: [...(prev.hiredCoachIds || [])],
  });
}

/** 金币晋级赛：32 支随机联队（不绑历史球队），深入后对手阵容迭代 */
function startCareer() {
  const used = new Set();
  const you = makeRandomCareerTeam({ used, isYou: true, power: 1, index: 0 });
  const field = [you];
  for (let i = 1; i < 32; i++) {
    field.push(
      makeRandomCareerTeam({
        used,
        isYou: false,
        power: Math.floor(i / 7),
        index: i,
      })
    );
  }
  bootCareerBracket({
    you,
    field,
    fieldSource: "random",
    fromCustom: false,
    challengeTier: "gold",
    stageSize: 32,
  });
}

/**
 * 自定义预算轮抽（15 块）完成后：带着你的名单进 32 支历史球队淘汰赛。
 * 抽卡预算仍是 15 块；晋级赛市场另给开局金币。
 */
function beginCustomHistoricalCareer(draftTeam) {
  const used = new Set((draftTeam.players || []).map((p) => p.id));
  if (draftTeam.coach?.id) used.add(draftTeam.coach.id);
  if (draftTeam.assistant?.id) used.add(draftTeam.assistant.id);

  const you = {
    name: draftTeam.name || "你的球队",
    franchiseId: null,
    players: (draftTeam.players || []).map((p) => clonePlayer(p)),
    coach: draftTeam.coach ? structuredClone(draftTeam.coach) : null,
    assistant: draftTeam.assistant ? structuredClone(draftTeam.assistant) : null,
    gold: 520,
    isCpu: false,
    bracketId: "you",
    losses: 0,
  };
  ensureTeamStaff(you, { preferStarter: true });
  if (you.coach?.id) used.add(you.coach.id);
  if (you.assistant?.id) used.add(you.assistant.id);

  const franchises = shuffleArr([...FRANCHISES]);
  while (franchises.length < 31) {
    franchises.push({
      id: `X${franchises.length}`,
      name: `联盟队${franchises.length + 1}`,
      aliases: [],
    });
  }
  const field = [you];
  for (let i = 0; i < 31; i++) {
    const f = franchises[i];
    field.push(
      makeFranchiseCareerTeam(f, {
        used,
        isYou: false,
        power: Math.floor(i / 8),
        index: i,
      })
    );
  }
  state.mode = "career";
  state.lastMode = "custom";
  bootCareerBracket({
    you,
    field,
    fieldSource: "historical",
    fromCustom: true,
    hintGold: 520,
  });
}

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function careerRoundLabel(roundOrStage, finals = false) {
  const c = state.career;
  if (c?.stageSize) return careerStageLabel(c.stageSize, { finals: finals || c.stageSize === 2 });
  if (finals) return CAREER_ROUND_LABELS[5];
  return CAREER_ROUND_LABELS[roundOrStage] || `第 ${roundOrStage} 轮`;
}

function resolveTeamRef(c, teamLike) {
  if (!teamLike) return null;
  const id = teamLike.bracketId;
  if (id === "you") return c.team;
  return (c.alive || c.field || []).find((t) => t.bracketId === id) || teamLike;
}

function runCpuMatchInto(match) {
  if (!match || match.done || match.yours) return;
  const c = state.career;
  const result = simulateCpuMatch(match.a, match.b);
  applyMatchResult(match, result.winner);
  match.score = result.score;
  match.startersA = result.startersA;
  match.startersB = result.startersB;
  if (result.snap) noteCareerAllTeamGame(c, result.snap, match.a, match.b);
  if (match.loser) noteCareerLoss(c, match.loser);
}

function noteCareerAllTeamGame(c, snap, homeTeam, awayTeam) {
  if (!c || !snap) return;
  if (!c.allTeamBoard) c.allTeamBoard = {};
  accumulateGameToAllTeamBoard(c.allTeamBoard, snap, homeTeam, awayTeam);
}

/** 总决赛后：按 PG→C 评出本届最佳阵容 */
function computeCareerAllTeam(c) {
  if (!c) return [];
  if (!c.allTeamBoard) c.allTeamBoard = {};
  let team = selectAllTeamByPos(c.allTeamBoard);
  if (team.length < 5) {
    const finalsTeams = [];
    if (c.team) finalsTeams.push(c.team);
    for (const t of c.alive || []) {
      if (t && !finalsTeams.some((x) => x.bracketId === t.bracketId)) finalsTeams.push(t);
    }
    const m = yourCareerMatch();
    if (m?.a && !finalsTeams.some((x) => x.bracketId === m.a.bracketId)) finalsTeams.push(m.a);
    if (m?.b && !finalsTeams.some((x) => x.bracketId === m.b.bracketId)) finalsTeams.push(m.b);
    if (c.series?.opp && !finalsTeams.some((x) => x.bracketId === c.series.opp.bracketId)) {
      finalsTeams.push(c.series.opp);
    }
    team = allTeamFromRosters(finalsTeams);
  }
  c.allTeam = team;
  return team;
}

function renderResultAllTeam(team, title = "总决赛最佳阵容") {
  const box = $("#result-all-team");
  if (!box) return;
  if (!team?.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <h3>${title}</h3>
    <p class="tiny">按位置 PG → C 各选一人（本届出场表现 + 实力）</p>
    <div class="all-team-row">
      ${team
        .map((p) => {
          const avg =
            p.gp > 0
              ? `${p.ppg}分 ${p.rpg}板 ${p.apg}助 · ${p.gp}场`
              : `OVR ${p.ovr || "—"}`;
          return `<div class="all-team-slot">
            <span class="all-team-pos">${p.slot || p.pos}</span>
            ${photoImg(p, "headshot")}
            <strong>${p.name}</strong>
            <em class="tiny">${p.teamName || ""}</em>
            <span class="tiny">${avg}</span>
          </div>`;
        })
        .join("")}
    </div>`;
}

/** Simulate all CPU matches in current pods; refresh roundMatches for scout + your next game. */
function syncCareerMatchesFromPods() {
  const c = state.career;
  if (!c?.pods?.length) return;
  // Fill starters on pending matches
  for (const m of listPodMatches(c.pods)) {
    if (!m.startersA) m.startersA = teamStarters(m.a);
    if (!m.startersB) m.startersB = teamStarters(m.b);
  }
  // Progress pods that can move without the user
  let guard = 0;
  while (guard++ < 40) {
    let progressed = false;
    for (const pod of c.pods) {
      if (pod.done) continue;
      if (pod.isFinal) {
        runCpuMatchInto(pod.openerA);
        if (pod.openerA?.done) {
          finalizePod(pod);
          progressed = true;
        }
        continue;
      }
      runCpuMatchInto(pod.openerA);
      runCpuMatchInto(pod.openerB);
      const mid = progressPodAfterOpeners(pod);
      for (const m of mid) {
        if (!m.startersA) m.startersA = teamStarters(m.a);
        if (!m.startersB) m.startersB = teamStarters(m.b);
      }
      runCpuMatchInto(pod.winnersMatch);
      runCpuMatchInto(pod.revivalMatch);
      const dec = progressPodAfterMid(pod);
      for (const m of dec) {
        if (!m.startersA) m.startersA = teamStarters(m.a);
        if (!m.startersB) m.startersB = teamStarters(m.b);
      }
      runCpuMatchInto(pod.deciderMatch);
      if (pod.deciderMatch?.done) {
        finalizePod(pod);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  c.roundMatches = listPodMatches(c.pods);
}

function noteCareerLoss(c, team) {
  if (!c?.losses || !team?.bracketId) return;
  c.losses[team.bracketId] = (c.losses[team.bracketId] || 0) + 1;
}

function seedCareerStage() {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  const alive = (c.alive || []).map((t) => (t.bracketId === "you" ? c.team : t));
  c.alive = alive;
  if (alive.length === 1) {
    c.pods = [];
    c.roundMatches = [];
    return;
  }
  if (alive.length === 2) {
    c.stageSize = 2;
    c.finals = true;
  }
  const { pods } = buildStagePods(alive);
  c.pods = pods;
  syncCareerMatchesFromPods();
}

/** @deprecated name kept — seeds current stage pods */
function seedCareerRound() {
  seedCareerStage();
}

function teamStarters(team) {
  if (!team?.players?.length) return [];
  const healthy = team.players.filter(isPlayerAvailable);
  const pool = healthy.length ? healthy : team.players;
  if (team.starterIds?.length >= 5) {
    const pick = team.starterIds.map((id) => team.players.find((p) => p.id === id)).filter(Boolean);
    if (pick.length >= 5) return pick.slice(0, 5);
  }
  return [...pool].sort((a, b) => overall(b) - overall(a)).slice(0, 5);
}

function simulateCpuMatch(home, away) {
  const h = {
    ...home,
    starterIds: teamStarters(home).map((p) => p.id),
  };
  const a = {
    ...away,
    starterIds: teamStarters(away).map((p) => p.id),
  };
  let finalSnap = null;
  const sim = new GameSim({
    home: h,
    away: a,
    youSide: "home",
    injuries: true,
    speed: 3,
    onEvent: () => {},
    onTick: () => {},
    onEnd: (snap) => {
      finalSnap = snap;
    },
  });
  const snap = sim.runFast() || finalSnap || sim.snapshot();
  const hs = snap.score.home;
  const as = snap.score.away;
  // Tie-break: higher team power
  let winner = hs >= as ? home : away;
  if (hs === as) winner = teamPowerLabel(home) >= teamPowerLabel(away) ? home : away;
  return {
    score: { home: hs, away: as },
    winner,
    snap,
    startersA: snap.home?.onCourt?.length ? snap.home.onCourt.slice(0, 5) : teamStarters(home),
    startersB: snap.away?.onCourt?.length ? snap.away.onCourt.slice(0, 5) : teamStarters(away),
  };
}

function yourCareerMatch() {
  const c = state.career;
  if (c?.pods?.length) {
    const open = findYourOpenMatch(c.pods);
    if (open) return open;
  }
  return (
    c?.roundMatches?.find((m) => m.yours && !m.done) ||
    c?.roundMatches?.find((m) => m.yours) ||
    null
  );
}

function formatStarterLine(players) {
  if (!players?.length) return "—";
  return players
    .map((p) => `${p.pos || p.playPos || "?"} ${p.name}${p.season ? `('${String(p.season).slice(2)})` : ""}`)
    .join(" · ");
}

function renderScoutBoard(targetEl, { highlightYours = true } = {}) {
  const el = typeof targetEl === "string" ? $(targetEl) : targetEl;
  if (!el) return;
  const c = state.career;
  if (!c || c.kind !== "career") {
    el.innerHTML = `<p class="tiny">非晋级赛模式</p>`;
    return;
  }
  const label = careerRoundLabel(c.round, c.finals);
  const roundLabel = $("#scout-round-label");
  if (roundLabel) roundLabel.textContent = label;

  const blocks = [];
  blocks.push(
    `<div class="scout-match"><strong>${label}</strong> · 四人一组：开门赛 → 胜者组 / 复活赛 → 晋级决胜（两败出局）</div>`
  );
  for (const log of c.bracketLog || []) {
    blocks.push(`<div class="scout-match"><strong>${log.label}</strong>（已结束）</div>`);
    for (const m of log.matches || []) blocks.push(scoutMatchHtml(m, false));
  }
  for (const pod of c.pods || []) {
    const tag = pod.isFinal ? "决赛组" : `第 ${pod.id + 1} 组`;
    const adv = (pod.advancers || []).map((t) => t.name).join("、") || "—";
    blocks.push(
      `<div class="scout-match"><strong>${tag}</strong>${
        pod.done ? ` · 晋级：${adv}` : ""
      }</div>`
    );
    for (const m of [
      pod.openerA,
      pod.openerB,
      pod.winnersMatch,
      pod.revivalMatch,
      pod.deciderMatch,
    ]) {
      if (m) blocks.push(scoutMatchHtml(m, highlightYours && m.yours));
    }
  }
  el.innerHTML = blocks.join("") || `<p class="tiny">暂无对阵</p>`;
}

function scoutMatchHtml(m, isYours) {
  const kind = m.kind ? `〔${kindLabel(m.kind)}〕` : "";
  let outcome = "";
  if (m.done && m.winner) {
    if (m.kind === "winners") outcome = ` · ${m.winner.name} 直接晋级`;
    else if (m.kind === "revival") outcome = ` · ${m.winner.name} 复活成功`;
    else if (m.kind === "decider" || m.kind === "final") outcome = ` · ${m.winner.name} 晋级`;
    else outcome = ` · ${m.winner.name} 胜`;
  }
  const score =
    m.done && m.score
      ? `<div class="score">${m.score.home} - ${m.score.away}${outcome}</div>`
      : `<div class="score">${isYours ? "待你出战" : m.done ? "已赛" : "待赛"}</div>`;
  return `<div class="scout-match ${isYours ? "yours" : ""}">
    <div>${kind} ${m.a?.name || "?"} vs ${m.b?.name || "?"}${isYours ? " · <em>你的比赛</em>" : ""}</div>
    ${score}
    <div class="scout-lineup"><strong>${m.a?.name || ""}</strong>：${formatStarterLine(m.startersA)}</div>
    <div class="scout-lineup"><strong>${m.b?.name || ""}</strong>：${formatStarterLine(m.startersB)}</div>
  </div>`;
}

function slimMatchForLog(m) {
  return {
    a: { name: m.a?.name, bracketId: m.a?.bracketId },
    b: { name: m.b?.name, bracketId: m.b?.bracketId },
    kind: m.kind,
    yours: m.yours,
    done: true,
    score: m.score,
    winner: m.winner ? { name: m.winner.name, bracketId: m.winner.bracketId } : null,
    loser: m.loser ? { name: m.loser.name, bracketId: m.loser.bracketId } : null,
    startersA: (m.startersA || []).map((p) => ({
      name: p.name,
      pos: p.pos || p.playPos,
      season: p.season,
    })),
    startersB: (m.startersB || []).map((p) => ({
      name: p.name,
      pos: p.pos || p.playPos,
      season: p.season,
    })),
  };
}

function upgradeCpuAdvancers(c, survivors) {
  // stageSize 仍是晋级前规模：32→16 时为 32；越深入 depth 越大
  const depth = Math.max(0, 5 - Math.log2(Math.max(2, c.stageSize || 32)));
  const randomField = c.fieldSource === "random";
  const purseBase = randomField ? 200 : 140;
  const purse = purseBase + depth * (randomField ? 95 : 55);
  const passes = randomField ? 1 + Math.floor(depth) : 1; // 随机联队：越往后多轮换血
  for (const t of survivors) {
    if (!t?.isCpu) continue;
    t.gold = (t.gold || 0) + purse + Math.floor(Math.random() * (randomField ? 120 : 80));
    for (let i = 0; i < passes; i++) {
      const spend = Math.min(
        t.gold,
        110 + Math.floor(purse * 0.75) + Math.floor(Math.random() * 70) + depth * 40
      );
      if (spend < 40) break;
      const res = cpuUpgradeRoster(t, spend, c.used);
      t.gold = Math.max(0, (t.gold || 0) - res.spent);
    }
    t.starterIds = null;
  }
}

/** Archive finished stage and seed next (16/8/4/2). */
function advanceCareerToNextStage() {
  const c = state.career;
  if (!allPodsDone(c.pods)) return false;
  const finished = listPodMatches(c.pods).filter((m) => m.done);
  c.bracketLog.push({
    label: careerStageLabel(c.stageSize, { finals: c.stageSize === 2 }),
    matches: finished.map(slimMatchForLog),
  });
  const survivors = collectAdvancers(c.pods).map((t) =>
    t.bracketId === "you" ? c.team : t
  );
  upgradeCpuAdvancers(c, survivors);
  c.alive = shuffleArr(survivors.filter((t) => t.bracketId === "you" || t.isCpu));
  c.alive = c.alive.map((t) => (t.bracketId === "you" ? c.team : t));
  c.round = (c.round || 1) + 1;
  // 每一轮独立：负场清零，再输两场才出局
  c.losses = Object.fromEntries((c.alive || []).map((t) => [t.bracketId, 0]));
  const next = nextStageSize(c.stageSize);
  if (!next || c.alive.length <= 1) {
    c.pods = [];
    c.roundMatches = [];
    return true; // champion
  }
  c.stageSize = next;
  c.finals = next === 2;
  seedCareerStage();
  return false;
}

/**
 * Apply your live result into the current open match; progress pods.
 * @returns {{ eliminated: boolean, advancedStage: boolean, needAnotherGame: boolean, champion: boolean, match: object|null }}
 */
function resolveCareerYourResult(youWon, yourOpp) {
  const c = state.career;
  syncCareerMatchesFromPods();
  const match = findYourOpenMatch(c.pods) || yourCareerMatch();
  if (!match) {
    return { eliminated: !youWon, advancedStage: false, needAnotherGame: false, champion: false, match: null };
  }
  const winner = youWon ? c.team : yourOpp;
  applyMatchResult(match, winner);
  if (match.loser) noteCareerLoss(c, match.loser);
  // Progress this pod + sim CPU
  syncCareerMatchesFromPods();

  const yourLosses = c.losses?.you || 0;
  // 总决赛一败即出局；其他轮次两败出局
  const stillAlive = c.stageSize === 2 ? !!youWon : yourLosses < 2;
  const youAdvanced = (c.pods || []).some(
    (pod) => pod.done && (pod.advancers || []).some((t) => t.bracketId === "you")
  );
  const needAnother = stillAlive && !!findYourOpenMatch(c.pods);

  if (!stillAlive) {
    return { eliminated: true, advancedStage: false, needAnotherGame: false, champion: false, match };
  }
  if (needAnother) {
    return { eliminated: false, advancedStage: false, needAnotherGame: true, champion: false, match };
  }
  // You finished your pod path — wait for all pods then next stage
  if (allPodsDone(c.pods)) {
    const champ = advanceCareerToNextStage();
    if (champ || (c.alive || []).length === 1) {
      return { eliminated: false, advancedStage: true, needAnotherGame: false, champion: true, match };
    }
    return { eliminated: false, advancedStage: true, needAnotherGame: false, champion: false, match };
  }
  // Pod done for you but others still playing — treat as waiting / next market then re-sync
  if (youAdvanced || yourLosses === 0 || yourLosses === 1) {
    // Force-sim remaining CPU pods so the stage can close
    syncCareerMatchesFromPods();
    if (allPodsDone(c.pods)) {
      const champ = advanceCareerToNextStage();
      return {
        eliminated: false,
        advancedStage: true,
        needAnotherGame: false,
        champion: !!champ || (c.alive || []).length === 1,
        match,
      };
    }
  }
  return { eliminated: false, advancedStage: false, needAnotherGame: false, champion: false, match };
}

/** Legacy wrapper used by older call sites — prefer resolveCareerYourResult. */
function advanceCareerBracket(youWon, yourOpp) {
  resolveCareerYourResult(youWon, yourOpp);
}

function budgetGold(c) {
  if (c.kind === "duel") return Math.max(c.goldA || 0, c.goldB || 0);
  return c.gold || 0;
}

/** Build a shop skewed toward what you can afford now. */
function buildAffordableShop(c, size = 12) {
  const exclude = c.used || new Set();
  const budget = Math.max(80, budgetGold(c));
  const pool = PLAYERS.filter((p) => !exclude.has(p.id) && !(c.shop || []).some((s) => s.id === p.id));
  const priced = pool.map((p) => ({ p, price: playerPrice(p) }));
  const cheap = priced.filter((x) => x.price <= budget * 0.55);
  const mid = priced.filter((x) => x.price > budget * 0.55 && x.price <= budget);
  const stretch = priced.filter((x) => x.price > budget && x.price <= budget * 1.35);
  const gems = priced.filter((x) => isHiddenGem(x.p) && x.price <= budget * 1.2);

  const pick = (arr, n) => {
    const copy = [...arr];
    const out = [];
    while (copy.length && out.length < n) {
      const i = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(i, 1)[0].p);
    }
    return out;
  };

  // Mostly buyable: 7 cheap + 4 mid + 1 stretch tease; sometimes seed hidden gems
  let shop = [...pick(cheap, 7), ...pick(mid, 4), ...pick(stretch, 1)];
  if (gems.length && Math.random() < 0.62) {
    shop = [...pick(gems, Math.min(2, gems.length)), ...shop];
  }
  if (shop.length < size) {
    shop = shop.concat(pick(priced, size - shop.length));
  }
  // de-dupe
  const seen = new Set();
  shop = shop.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  return shop.slice(0, size).map(clonePlayer);
}

/**
 * 每换一批货重新 roll：有时出球探包，有时没有（不是每轮必买）。
 * @param {"round"|"refresh"} reason
 */
function rollScoutPackOffer(c, reason = "round") {
  c.scoutActive = false;
  const chance = reason === "refresh" ? SCOUT_PACK_REFRESH_CHANCE : SCOUT_PACK_CHANCE;
  if (Math.random() >= chance) {
    c.scoutOffer = null;
    return;
  }
  const span = SCOUT_PACK_COST_MAX - SCOUT_PACK_COST_MIN;
  const cost = SCOUT_PACK_COST_MIN + Math.floor(Math.random() * (span + 1));
  c.scoutOffer = { cost, bought: false, reason };
}

function paintPendingChallengeBanner(c) {
  const el = $("#scout-pack-offer");
  if (!el || !c?.pendingChallenge) return false;
  const next = c.pendingChallenge;
  const label =
    next === "champ7" ? "挑战 7 支历史总冠军" : "挑战 15 支历史季后赛球队";
  el.hidden = false;
  el.innerHTML = `<div class="scout-pack-card">
    <div>
      <strong>冠军挑战待开启</strong>
      <div class="tiny">进度已自动保存。可随时开始：${label}（保留阵容 / 金币 / 技能库存）</div>
    </div>
    <button type="button" class="btn small primary" id="btn-start-challenge">开始挑战</button>
  </div>`;
  const btn = $("#btn-start-challenge");
  if (btn) {
    btn.onclick = () => {
      c.pendingChallenge = null;
      beginCareerChallengeTier(next);
    };
  }
  return true;
}

function paintScoutPackOffer(c) {
  const el = $("#scout-pack-offer");
  if (!el) return;
  if (paintPendingChallengeBanner(c)) return;
  const offer = c.scoutOffer;
  if (!offer || offer.bought) {
    if (c.scoutActive) {
      el.hidden = false;
      el.innerHTML = `<span class="scout-pack-active">球探已启用 · 本批名单已标出妖人 / 板凳匪徒</span>`;
    } else {
      // 本批没有球探包：轻提示，避免误以为每轮都能买
      el.hidden = false;
      el.innerHTML = `<span class="scout-pack-miss tiny">本批无球探包（随机出现，约三成换货会刷出）</span>`;
    }
    return;
  }
  const budget = c.kind === "duel" ? Math.max(c.goldA || 0, c.goldB || 0) : c.gold || 0;
  const can = budget >= offer.cost;
  el.hidden = false;
  el.innerHTML = `<div class="scout-pack-card">
    <div>
      <strong>球探包</strong>
      <div class="tiny">花 ¤${offer.cost} 买球探报告：标出本批里的性价比妖人与板凳匪徒（换货随机刷出）</div>
    </div>
    <button class="btn small" id="btn-buy-scout-pack" ${can ? "" : "disabled"}>买入 ¤${offer.cost}</button>
  </div>`;
  const btn = $("#btn-buy-scout-pack");
  if (btn) btn.onclick = () => buyScoutPack();
}

function buyScoutPack() {
  const c = state.career;
  if (!c?.scoutOffer || c.scoutOffer.bought) return;
  const cost = c.scoutOffer.cost || SCOUT_PACK_COST_MIN;
  if (c.kind === "career") {
    if ((c.gold || 0) < cost) {
      alert(`球探包需要 ¤${cost}`);
      return;
    }
    c.gold -= cost;
  } else {
    let charged = false;
    if ((c.goldA || 0) >= cost) {
      c.goldA -= cost;
      charged = true;
    }
    if ((c.goldB || 0) >= cost) {
      c.goldB -= cost;
      charged = true;
    }
    if (!charged) {
      alert(`球探包需要至少一方有 ¤${cost}`);
      return;
    }
  }
  c.scoutOffer.bought = true;
  c.scoutActive = true;
  openMarket({ career: c.kind === "career", duel: c.kind === "duel" });
}

function shopRevealBadge(p, scoutActive) {
  const pub = valueLabel(p);
  if (pub) return `<span class="value-badge ${p.valueArchetype}">${pub}</span>`;
  if (!scoutActive) return "";
  const sc = scoutLabel(p);
  if (!sc) return "";
  const cls = sc === "妖人" ? "bargain" : "bench-bandit";
  return `<span class="value-badge ${cls}">${sc}</span>`;
}

function openMarket({ career = false, duel = false, afterWin = false, refillShop = false } = {}) {
  show("market");
  const c = state.career;
  const isDuel = duel || c?.kind === "duel";
  $("#bid-panel").hidden = !isDuel;
  const mScoutPre = $("#market-scout");
  if (mScoutPre && isDuel) mScoutPre.hidden = true;
  // 组合技按整队名单显隐（詹韦须两人同队）
  if (c?.kind === "career" && c.team?.players) syncTeamDuoSkills(c.team.players);
  ensureSkillInventory(c);

  if (refillShop || !c.shop || !c.shop.length) {
    c.shop = buildAffordableShop(c, 12);
    rollScoutPackOffer(c, "round");
  }
  if (!isDuel && (refillShop || !c.coachShop?.length || !c.skillShop?.length)) {
    rollCareerStaffShops(c, {
      coaches: refillShop || !c.coachShop?.length,
      skills: refillShop || !c.skillShop?.length,
    });
  }

  if (!isDuel) {
    const losses = c.losses?.you || 0;
    const roundBit = c.roundMatches?.length
      ? `当前 ${careerRoundLabel(c.round, c.finals)}（四人一组 · 复活赛 · 两败出局；你已负 ${losses}/2）。下方可查看其他对决与阵容。`
      : "";
    const tier = challengeTierMeta(c.challengeTier || "gold");
    const fieldBit =
      c.challengeTier === "playoff15"
        ? "历史季后赛挑战：你 + 15 支经典季后赛强队（16 强起）"
        : c.challengeTier === "champ7"
          ? "历史总冠军挑战：你 + 7 支史实冠军班底（8 强起）"
          : c.fieldSource === "historical"
            ? c.fromCustom
              ? "自定义 15 块轮抽完成 · 挑战 32 支历史球队"
              : "历史球队挑战赛"
            : "金币联赛：32 支随机联队（夺冠后可挑战历史季后赛 / 总冠军）";
    $("#market-hint").textContent = afterWin
      ? `赛果奖金已入账 · ${tier.name}。可买球员/教练/技能包；刷新 ¤${MARKET_REFRESH_COST}。球探包随机刷出。${roundBit}`
      : `${fieldBit}。当前 ¤${c.gold || 600}。球探包随机出现（约三成换货）。${roundBit}`;
    $("#market-right-title").textContent = "自由市场（可连买）";
    $("#market-left-title").textContent = "我的球队（评估是否卖出）";
    $("#gold-amt").textContent = String(c.gold);
    $("#shop-budget-hint").textContent = `当前可负担约 ¤${c.gold} 以内 · 列表 ${c.shop.length} 人`;
    renderCareerCoachPanel(c);
    const mScout = $("#market-scout");
    if (mScout) {
      mScout.hidden = !(c.roundMatches?.length || c.bracketLog?.length);
      if (!mScout.hidden) renderScoutBoard(mScout);
    }
    paintScoutPackOffer(c);
    ensurePlayerDefaults(c.team?.players || []);
    renderMarketRoster([c.team], true);
    paintFreeAgentList(c, false);
    if (afterWin || refillShop) autosaveCareer();
  } else {
    const coachPanel = $("#career-coach-panel");
    if (coachPanel) coachPanel.hidden = true;
    $("#market-hint").textContent = `双人市场可连买/竞价；左侧可对比 A/B 双方现有阵容数据再卖人。偶有球探包。`;
    $("#market-right-title").textContent = "自由市场 / 竞价池";
    $("#market-left-title").textContent = "双方阵容（评估是否卖出）";
    $("#gold-amt").textContent = `A ${c.goldA} / B ${c.goldB}`;
    $("#shop-budget-hint").textContent = `列表 ${c.shop.length} 人（不会因买一人而整页刷新）`;
    paintScoutPackOffer(c);
    renderMarketRoster(
      [
        { ...c.teamA, _side: "A", _label: c.teamA.name || "玩家 A" },
        { ...c.teamB, _side: "B", _label: c.teamB.name || "玩家 B" },
      ],
      true
    );
    paintFreeAgentList(c, true);
    renderBidCard(c);
  }
  $("#roster-cap").textContent = String((c.team || c.teamA).players.length);
}

function marketTeamPlayers(side = "") {
  const c = state.career;
  if (!c) return [];
  if (c.kind === "duel") return side === "B" ? c.teamB.players : c.teamA.players;
  return c.team.players;
}

function refreshMarketRosterView() {
  const c = state.career;
  if (!c) return;
  if (c.kind === "duel") {
    renderMarketRoster(
      [
        { ...c.teamA, _side: "A", _label: c.teamA.name || "玩家 A" },
        { ...c.teamB, _side: "B", _label: c.teamB.name || "玩家 B" },
      ],
      true
    );
  } else {
    renderMarketRoster([c.team], true);
  }
}

function marketFormBlock(p) {
  const conf = Number(p.confidence);
  const tac = Number(p.tacticalStatus);
  const recent = summarizeRecentForm(p);
  const games = Array.isArray(p.recentGames)
    ? p.recentGames
    : p.lastGame
      ? [p.lastGame]
      : [];
  const cardAvg = p.raw
    ? `卡面赛季 ${Number(p.raw.ppg || 0).toFixed(1)}分 ${Number(p.raw.rpg || 0).toFixed(1)}板 ${Number(
        p.raw.apg || 0
      ).toFixed(1)}助`
    : "";
  if (!recent && !Number.isFinite(conf) && !cardAvg) {
    return `<div class="tiny market-form muted">本模式尚未出战 · 暂无近况</div>`;
  }
  const mood =
    Number.isFinite(conf) || Number.isFinite(tac)
      ? `<div class="tiny market-form-mood">状态 ${
          Number.isFinite(conf) ? confidenceLabel(conf) + conf : "—"
        } · ${Number.isFinite(tac) ? tacticalLabel(tac) : "—"}</div>`
      : "";
  const avgLine = recent
    ? `<div class="tiny market-form-avg"><strong>近${recent.games}场</strong> ${recent.ppg}分 ${recent.rpg}板 ${recent.apg}助${
        recent.spg ? ` ${recent.spg}断` : ""
      }${        recent.bpg ? ` ${recent.bpg}帽` : ""} · ${recent.mpg}分钟${
        recent.wins + recent.losses
          ? ` · ${recent.wins}胜${recent.losses}负`
          : ""
      }${recent.lastNote ? ` · 近况「${recent.lastNote}」` : ""}</div>`
    : "";
  const log =
    games.length > 0
      ? `<ul class="market-form-log">${games
          .slice()
          .reverse()
          .map((g, i) => {
            const label = i === 0 ? "上场" : `${i + 1}场前`;
            return `<li><span class="form-when">${label}</span> ${formatGameLine(g)}</li>`;
          })
          .join("")}</ul>`
      : "";
  const cardLine = cardAvg ? `<div class="tiny market-form-card">${cardAvg}</div>` : "";
  // 卖人提示：上场哑火 / 高薪低能近况差
  let tip = "";
  if (recent && recent.games >= 2 && recent.ppg < 6 && (p.scoring || 0) >= 78) {
    tip = `<div class="tiny market-form-tip warn">巨星近况低迷，可考虑卖出换血</div>`;
  } else if (recent?.lastNote && /哑火|不顺|自我怀疑/.test(recent.lastNote + confidenceLabel(conf || 50))) {
    tip = `<div class="tiny market-form-tip warn">近况不佳</div>`;
  } else if (recent && recent.ppg >= 22) {
    tip = `<div class="tiny market-form-tip hot">近期火力足，慎卖</div>`;
  }
  return `<div class="market-form">${mood}${avgLine}${log}${cardLine}${tip}</div>`;
}

function marketOwnedCard(p, canSell, sideLabel = "") {
  const buy = playerPrice(p);
  const bodySell = Math.round(buy * 0.65);
  const skillRefund = purchasedSkillsRefund(p);
  const sell = bodySell + skillRefund.gold;
  const skillBit =
    skillRefund.gold > 0
      ? `（含技能变现 ¤${skillRefund.gold}）`
      : "";
  const v = valueLabel(p);
  const tips = topIntangibles(p, 3)
    .map((t) => `${t.name}${t.value}`)
    .join(" · ");
  const inj =
    p.injuredGames > 0 ? ` · <em class="inj">${p.injuryStatus || "伤停"}${p.injuredGames}场</em>` : "";
  const tags = (p.tags || [])
    .filter((t) => t !== "妖人")
    .slice(0, 2)
    .map((t) => `<span class="chip warn">${t}</span>`)
    .join("");
  const boost = p._posBoostNote
    ? `<div class="tiny pos-boost-note">↑ ${escAttr(p._posBoostNote)}</div>`
    : "";
  const posCtrl = posSelectHtml(p).replace(
    'class="pos-select"',
    'class="pos-select market-pos-select"'
  );
  return `<div class="market-row owned editable" draggable="true" data-drag-id="${p.id}" data-side="${sideLabel}">
    ${photoImg(p)}
    <div class="market-owned-body">
      <div class="market-owned-head">
        <strong>${p.name}${v ? ` <span class="value-badge ${p.valueArchetype}">${v}</span>` : ""}</strong>
        ${posCtrl}
      </div>
      <div class="tiny">${p.season} · 原${p.pos} · OVR ${overall(p)}${inj}${
        physiqueLabel(p) ? ` · ${physiqueLabel(p)}` : ""
      }</div>
      ${boost}
      <div class="tiny market-stats">攻${p.scoring} 防${p.defense} 传${p.pass} 板${p.rebound} 断${p.steal ?? "-"} 帽${p.block ?? "-"} 速${p.speed} 力${p.strength ?? "-"}</div>
      ${marketFormBlock(p)}
      <div class="tiny">${tendencyLabel(p)}</div>
      <div class="tiny">暗属性 ${tips || "—"}</div>
      <div class="tiny">${marketMeta(p)}</div>
      ${p.skills?.length ? `<div class="skill-row">${skillChipsHtml(p)}</div>` : ""}
      <div class="tiny">估价 ¤${buy} · <strong>卖出 ¤${sell}</strong>${skillBit}${
        v === "高薪低能" ? " · 可考虑卖出腾薪资" : ""
      }</div>
      <div class="stat-chips">${tags}</div>
    </div>
    ${
      canSell
        ? `<button class="btn small" data-sell="${p.id}" data-side="${sideLabel}">卖出 ¤${sell}</button>`
        : ""
    }
  </div>`;
}

/** @param {Array} teams - one or more team objects; optional _side/_label for duel */
function renderMarketRoster(teams, canSell) {
  const box = $("#my-market-roster");
  const summary = $("#my-roster-summary");
  const list = Array.isArray(teams) ? teams : [teams];
  const parts = [];
  const gapNotes = [];

  for (const team of list) {
    const side = team._side || "";
    const label = team._label || team.name || "我的球队";
    const players = team.players || [];
    applyLineupPositionEffects(players);
    const buckets = groupByPosition(players);
    const missing = POS_SLOTS.filter((s) => !buckets[s.id].length).map((s) => s.id);
    if (missing.length) gapNotes.push(`${label}缺 ${missing.join("/")}`);

    if (list.length > 1) {
      parts.push(`<h4 class="market-team-head">${label} · ${players.length} 人</h4>`);
    }

    parts.push(
      `<div class="pos-gap market-pos-dock" data-side="${side}" title="把球员拖到这里改位置">
        <span class="tiny market-dock-label">拖到位置：</span>
        ${POS_SLOTS.map((s) => {
          const n = buckets[s.id].length;
          return `<span class="pos-gap-chip ${n ? "ok" : "need"}" data-drop-pos="${s.id}" data-side="${side}">${s.id}${n ? `×${n}` : " 缺"}</span>`;
        }).join("")}
      </div>`
    );
    parts.push(
      `<p class="tiny market-pos-hint" data-side="${side}">下拉改位，或拖到<strong>上方位置条</strong>（滚动时也固定）；也可拖到对应位置行</p>`
    );

    for (const s of POS_SLOTS) {
      const group = buckets[s.id];
      parts.push(`<div class="pos-row ${group.length ? "" : "empty"}" data-drop-pos="${s.id}" data-side="${side}">
        <div class="pos-row-head"><span>${s.label}</span><span class="pos-count">${group.length} 人</span></div>
        <div class="pos-row-body market-pos-body">
          ${
            group.length
              ? group
                  .slice()
                  .sort((a, b) => overall(b) - overall(a))
                  .map((p) => marketOwnedCard(p, canSell, side))
                  .join("")
              : `<span class="pos-empty-hint">空缺 — 拖球员到这里</span>`
          }
        </div>
      </div>`);
    }
  }

  if (summary) {
    const n = list.reduce((a, t) => a + (t.players?.length || 0), 0);
    summary.textContent = gapNotes.length
      ? `共 ${n} 人 · ${gapNotes.join("；")} · 可改位置 · 卖出价约 70%`
      : `共 ${n} 人 · 五位置已覆盖 · 可改位置 · 卖出价约 70%`;
  }

  box.innerHTML = parts.join("") || `<p class="tiny">名单为空</p>`;
  box.querySelectorAll("[data-sell]").forEach((btn) => {
    btn.onclick = () => sellPlayer(btn.dataset.sell, btn.dataset.side);
  });
  bindMarketPosEditors(box);
}

function bindMarketPosEditors(box) {
  if (!box) return;
  const applyPos = (id, side, next) => {
    const players = marketTeamPlayers(side);
    const p = players.find((x) => x.id === id);
    if (!p) return;
    const pos = normalizePos(next);
    if (normalizePos(p.playPos || p.pos) === pos) return;
    markPlayPosManual(p, pos);
    applyLineupPositionEffects(players);
    refreshMarketRosterView();
  };

  box.querySelectorAll(".market-pos-select").forEach((sel) => {
    sel.onchange = (e) => {
      e.stopPropagation();
      const row = sel.closest("[data-side]");
      applyPos(sel.dataset.id, row?.dataset.side || "", sel.value);
    };
    sel.onclick = (e) => e.stopPropagation();
    sel.onmousedown = (e) => e.stopPropagation();
  });

  let dragId = null;
  let dragSide = "";
  box.querySelectorAll(".market-row.owned[draggable]").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragId = row.dataset.dragId;
      dragSide = row.dataset.side || "";
      row.classList.add("dragging");
      e.dataTransfer?.setData("text/plain", `${dragSide}|${dragId}`);
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      box.querySelectorAll(".pos-row, .pos-gap-chip").forEach((r) => r.classList.remove("drag-over"));
      dragId = null;
      dragSide = "";
    });
  });

  // 拖到顶部/底部边缘时自动滚列表，否则「往上拖」出不了视口
  const onDragScroll = (e) => {
    const rect = box.getBoundingClientRect();
    const edge = 72;
    const speed = 22;
    if (e.clientY < rect.top + edge) box.scrollTop -= speed;
    else if (e.clientY > rect.bottom - edge) box.scrollTop += speed;
  };
  box.addEventListener("dragover", onDragScroll);

  const bindDropTarget = (el) => {
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.classList.add("drag-over");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      const raw = e.dataTransfer?.getData("text/plain") || `${dragSide}|${dragId}`;
      const [side, id] = raw.includes("|") ? raw.split("|") : [dragSide, raw];
      const dropSide = el.dataset.side || "";
      if (!id || dropSide !== (side || "")) return;
      applyPos(id, side, el.dataset.dropPos);
    });
  };

  box.querySelectorAll(".pos-gap-chip[data-drop-pos]").forEach(bindDropTarget);
  box.querySelectorAll(".pos-row[data-drop-pos]").forEach((row) => {
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const raw = e.dataTransfer?.getData("text/plain") || `${dragSide}|${dragId}`;
      const [side, id] = raw.includes("|") ? raw.split("|") : [dragSide, raw];
      if (!id || (row.dataset.side || "") !== (side || "")) return;
      applyPos(id, side || "", row.dataset.dropPos);
    });
  });
}

function marketSortKey() {
  return $("#market-sort")?.value || state.marketSort || "ovr";
}

function sortedMarketShop(shop) {
  const key = marketSortKey();
  state.marketSort = key;
  const list = [...(shop || [])];
  const attr = (p, k) => Number(p?.[k]) || 0;
  const cmp = {
    ovr: (a, b) => overall(b) - overall(a) || playerPrice(b) - playerPrice(a),
    scoring: (a, b) => attr(b, "scoring") - attr(a, "scoring") || overall(b) - overall(a),
    defense: (a, b) => attr(b, "defense") - attr(a, "defense") || overall(b) - overall(a),
    pass: (a, b) => attr(b, "pass") - attr(a, "pass") || overall(b) - overall(a),
    rebound: (a, b) => attr(b, "rebound") - attr(a, "rebound") || overall(b) - overall(a),
    speed: (a, b) => attr(b, "speed") - attr(a, "speed") || overall(b) - overall(a),
    strength: (a, b) => attr(b, "strength") - attr(a, "strength") || overall(b) - overall(a),
    height: (a, b) => attr(b, "heightCm") - attr(a, "heightCm") || overall(b) - overall(a),
    price: (a, b) => playerPrice(b) - playerPrice(a) || overall(b) - overall(a),
    price_asc: (a, b) => playerPrice(a) - playerPrice(b) || overall(b) - overall(a),
  }[key] || null;
  if (cmp) list.sort(cmp);
  return list;
}

function paintFreeAgentList(c, duel = false) {
  const box = $("#free-agent-list");
  if (!box) return;
  const budget =
    c.kind === "duel" ? Math.max(c.goldA || 0, c.goldB || 0) : Number(c.gold) || 0;
  const sortEl = $("#market-sort");
  if (sortEl && state.marketSort) sortEl.value = state.marketSort;
  if (!c.shop?.length) {
    box.innerHTML = `<p class="tiny">市场空了。点「刷新自由市场」花 ¤${MARKET_REFRESH_COST} 换一批。</p>`;
    return;
  }
  const scoutOn = !!c.scoutActive;
  box.innerHTML = sortedMarketShop(c.shop)
    .map((p) => {
      const price = playerPrice(p);
      const afford = price <= budget;
      const badge = shopRevealBadge(p, scoutOn);
      return `<div class="market-row ${afford ? "" : "unaffordable"}">
        ${photoImg(p)}
        <div style="flex:1">
          <strong>${p.name}${badge ? ` ${badge}` : ""}</strong>
          <div class="tiny">${p.season} ${p.pos} · OVR ${overall(p)} · <strong>¤${price}</strong>${
            afford ? "" : " · 超出预算"
          }${physiqueLabel(p) ? ` · ${physiqueLabel(p)}` : ""}</div>
          <div class="tiny">${marketMeta(p)}</div>
          ${p.skills?.length ? `<div class="skill-row">${skillChipsHtml(p)}</div>` : ""}
        </div>
        ${
          duel
            ? `<button class="btn small" data-bid="${p.id}">加入竞价</button>`
            : `<button class="btn small ${afford ? "" : "buy-disabled"}" data-buy="${p.id}" ${
                afford ? "" : "disabled"
              }>${afford ? "买入" : `差钱 ¤${price}`}</button>`
        }
      </div>`;
    })
    .join("");
  box.querySelectorAll("[data-buy]").forEach((btn) => {
    if (btn.disabled) return;
    btn.onclick = () => buyPlayer(btn.dataset.buy);
  });
  box.querySelectorAll("[data-bid]").forEach((btn) => {
    btn.onclick = () => {
      c.bidTarget = c.shop.find((p) => p.id === btn.dataset.bid);
      renderBidCard(c);
    };
  });
}

$("#market-sort")?.addEventListener("change", () => {
  const c = state.career;
  if (!c?.shop) return;
  state.marketSort = $("#market-sort").value || "ovr";
  paintFreeAgentList(c, c.kind === "duel");
});

$("#btn-refresh-coaches")?.addEventListener("click", () => {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  if ((c.gold || 0) < COACH_REFRESH_COST) {
    alert(`刷新教练市场需要 ¤${COACH_REFRESH_COST}，当前 ¤${c.gold || 0}`);
    return;
  }
  c.gold -= COACH_REFRESH_COST;
  rollCareerStaffShops(c, { coaches: true, skills: false });
  openMarket({ career: true });
});

$("#btn-refresh-skills")?.addEventListener("click", () => {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  if ((c.gold || 0) < SKILL_REFRESH_COST) {
    alert(`刷新技能包货架需要 ¤${SKILL_REFRESH_COST}，当前 ¤${c.gold || 0}`);
    return;
  }
  c.gold -= SKILL_REFRESH_COST;
  rollCareerStaffShops(c, { coaches: false, skills: true });
  openMarket({ career: true });
});

$("#btn-refresh-market").onclick = () => {
  const c = state.career;
  if (!c) return;
  if (c.kind === "career") {
    if (c.gold < MARKET_REFRESH_COST) {
      alert(`刷新需要 ¤${MARKET_REFRESH_COST}，当前不够`);
      return;
    }
    c.gold -= MARKET_REFRESH_COST;
    c.shop = buildAffordableShop(c, 12);
    rollScoutPackOffer(c, "refresh");
    // 球员市场刷新时，教练与技能包也一起随机换一批
    rollCareerStaffShops(c, { coaches: true, skills: true });
    openMarket({ career: true });
    return;
  }
  // duel: charge whoever can pay; prefer charging both if both can
  let charged = false;
  if (c.goldA >= MARKET_REFRESH_COST) {
    c.goldA -= MARKET_REFRESH_COST;
    charged = true;
  }
  if (c.goldB >= MARKET_REFRESH_COST) {
    c.goldB -= MARKET_REFRESH_COST;
    charged = true;
  }
  if (!charged) {
    alert(`刷新需要至少一方有 ¤${MARKET_REFRESH_COST}`);
    return;
  }
  c.shop = buildAffordableShop(c, 12);
  rollScoutPackOffer(c, "refresh");
  openMarket({ duel: true });
};

function renderBidCard(c) {
  const p = c.bidTarget || c.shop?.[0];
  c.bidTarget = p;
  if (!p) {
    $("#bid-card").innerHTML = "<p class='tiny'>暂无可竞价球员</p>";
    return;
  }
  $("#bid-card").innerHTML = `${photoImg(p, "headshot lg")} <strong>${p.name}</strong> · 估价 ¤${playerPrice(p)}`;
  $("#bid-a").value = Math.min(c.goldA, playerPrice(p));
  $("#bid-b").value = Math.min(c.goldB, Math.round(playerPrice(p) * 0.9));
}

function sellPlayer(id, side = "") {
  const c = state.career;
  const settle = (p) => {
    const body = Math.round(playerPrice(p) * 0.65);
    const skills = purchasedSkillsRefund(p);
    return { total: body + skills.gold, body, skills };
  };
  if (c.kind === "career") {
    if (c.team.players.length <= 8) {
      alert("至少保留 8 人");
      return;
    }
    const idx = c.team.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [p] = c.team.players.splice(idx, 1);
    const { total, body, skills } = settle(p);
    c.gold += total;
    const skillNote =
      skills.gold > 0
        ? `（身价 ¤${body} + 已购技能变现 ¤${skills.gold}：${skills.lines
            .map((l) => `${l.name}¤${l.refund}`)
            .join("、")}）`
        : "";
    openMarket({ career: true });
    if (skillNote) alert(`卖出 ${p.name} 入账 ¤${total}${skillNote}`);
  } else {
    const team = side === "B" ? c.teamB : c.teamA;
    if (team.players.length <= 8) {
      alert("至少保留 8 人");
      return;
    }
    const idx = team.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [p] = team.players.splice(idx, 1);
    const { total } = settle(p);
    if (side === "B") c.goldB += total;
    else c.goldA += total;
    openMarket({ duel: true });
  }
}

function buyPlayer(id) {
  const c = state.career;
  const p = c.shop.find((x) => x.id === id);
  if (!p) return;
  const price = playerPrice(p);
  if (c.team.players.length >= 12) {
    alert("名单已满 12 人");
    return;
  }
  if (c.gold < price) {
    alert("金币不足");
    return;
  }
  c.gold -= price;
  const card = clonePlayer(p);
  applyRecommendedDefaults(card, { force: true });
  c.team.players.push(card);
  c.used.add(p.id);
  // Remove bought player only — do NOT refresh whole list
  c.shop = c.shop.filter((x) => x.id !== id);
  openMarket({ career: true });
}

$("#btn-bid-resolve").onclick = () => {
  const c = state.career;
  const p = c.bidTarget;
  if (!p) return;
  const a = Math.max(0, Number($("#bid-a").value) || 0);
  const b = Math.max(0, Number($("#bid-b").value) || 0);
  if (a === b) {
    alert("出价相同，请再加价");
    return;
  }
  const winnerIsA = a > b;
  const bid = winnerIsA ? a : b;
  const team = winnerIsA ? c.teamA : c.teamB;
  const goldKey = winnerIsA ? "goldA" : "goldB";
  if (c[goldKey] < bid) {
    alert("胜出方金币不足");
    return;
  }
  if (team.players.length >= 12) {
    alert("胜出方名单已满");
    return;
  }
  c[goldKey] -= bid;
  const card = clonePlayer(p);
  applyRecommendedDefaults(card, { force: true });
  team.players.push(card);
  c.used.add(p.id);
  c.shop = c.shop.filter((x) => x.id !== p.id);
  c.bidTarget = c.shop[0] || null;
  openMarket({ duel: true });
};

$("#btn-market-done").onclick = () => {
  const c = state.career;
  if (c.kind === "career") {
    if (c.team.players.length < 8) {
      alert("至少 8 人才能出战");
      return;
    }
    {
      const staff = ensureTeamStaff(c.team, { preferStarter: true });
      const bits = [];
      if (staff.rolledCoach && staff.coach) {
        c.hiredCoachIds = [...new Set([...(c.hiredCoachIds || []), staff.coach.id])];
        bits.push(`主教练「${staff.coach.name}」`);
      }
      if (staff.rolledAsst && staff.assistant) bits.push(`助教「${staff.assistant.name}」`);
      if (bits.length) alert(`教练组空缺——系统随机指派 ${bits.join(" + ")}`);
    }
    c.team.gold = c.gold;
    ensurePlayerDefaults(c.team.players || []);
    if (c.finals && c.series) {
      openSetup(c.team, c.series.opp, "home");
      return;
    }
    const match = yourCareerMatch();
    const opp = match ? (match.a.bracketId === "you" ? match.b : match.a) : null;
    if (!opp) {
      alert("对阵尚未生成，请重开晋级赛");
      return;
    }
    // Refresh starter preview for scout
    if (match) {
      match.startersA = teamStarters(match.a);
      match.startersB = teamStarters(match.b);
    }
    openSetup(c.team, opp, "home");
    return;
  }
  // duel → setup for A vs B
  ensurePlayerDefaults(c.teamA?.players || []);
  ensurePlayerDefaults(c.teamB?.players || []);
  openSetup(c.teamA, c.teamB, "home");
};

// —— Setup: starters + philosophy ——
function openSetup(home, away, youSide) {
  // 组合技按整队名单显隐（詹韦等须搭档同队）
  if (home?.players) syncTeamDuoSkills(home.players);
  if (away?.players) syncTeamDuoSkills(away.players);
  // 没请教练组就随便 roll：主教练 + 助教都要有
  ensureTeamStaff(home, {
    preferStarter: true,
    excludeIds: [away?.coach?.id, away?.assistant?.id],
  });
  ensureTeamStaff(away, {
    preferStarter: true,
    excludeIds: [home?.coach?.id, home?.assistant?.id],
  });
  state.pendingMatch = { home, away, youSide };
  const you = youSide === "home" ? home : away;
  const healthy = you.players.filter(isPlayerAvailable);
  const sorted = [...(healthy.length ? healthy : you.players)].sort((a, b) => overall(b) - overall(a));
  state.setup = {
    you,
    selected: new Set(sorted.slice(0, 5).map((p) => p.id)),
  };
  const asstBit = you.assistant
    ? ` ｜ 助教 ${you.assistant.name}（激发 ${you.assistant.sparkPotential ?? "-"}）`
    : "";
  const autoBit =
    you.coach?.playerAutonomy != null ? ` · 场上自主 ${you.coach.playerAutonomy}` : "";
  $("#setup-coach-base").textContent = `基础教练：${you.coach?.name || "自定义"}（${you.coach?.style || ""}${autoBit}）${asstBit}`;
  renderPhilTactics(you);
  if (you.coach?.buffs) {
    $("#phil-off").value = you.coach.buffs.offense;
    $("#phil-def").value = you.coach.buffs.defense;
    $("#phil-morale").value = you.coach.buffs.morale;
    $("#phil-stam").value = you.coach.buffs.stamina;
  }
  // 未手动改过的位置/倾向按属性推荐填充
  // Season default rotation: restore starters / minutes / orders if saved
  if (state.season) {
    const live = state.season.teams[state.season.userTeamId];
    if (live?.rotation) {
      applyRotationPlan(you, live.rotation);
      if (live.rotation.starterIds?.length === 5) {
        state.setup.selected = new Set(live.rotation.starterIds.filter((id) => you.players.some((p) => p.id === id)));
      }
      if (live.rotation.phil) {
        $("#phil-off").value = live.rotation.phil.offense ?? $("#phil-off").value;
        $("#phil-def").value = live.rotation.phil.defense ?? $("#phil-def").value;
        $("#phil-morale").value = live.rotation.phil.morale ?? $("#phil-morale").value;
        $("#phil-stam").value = live.rotation.phil.stamina ?? $("#phil-stam").value;
        if (live.rotation.phil.styleName) $("#phil-name").value = live.rotation.phil.styleName;
      }
    } else if (live) {
      // First game: seed from live roster fields
      applyRotationPlan(you, captureRotationPlan(live, live.starterIds));
    }
  }
  syncPhilLabels();
  syncPhilRosterHint();
  ensurePlayerDefaults(you.players);
  ensureRoles(you.players);
  you.lineupPacks = you.lineupPacks || autoBuildAllPacks(you.players);
  you.gameplan = you.gameplan || { matchup: null };
  state.setup.packPreview = null;
  renderSetupRoster();
  renderSetupPacks();
  renderSetupTempo();
  renderSetupRoles();
  renderSetupOrders();
  renderSetupGameplan();
  // 生涯：选首发页也能买/装技能；返回键回市场
  const setupSkillPanel = $("#setup-skill-panel");
  const backBtn = $("#btn-setup-back");
  const isCareer = state.career?.kind === "career";
  const isDuel = state.career?.kind === "duel";
  if (setupSkillPanel) {
    setupSkillPanel.hidden = !isCareer;
    if (isCareer) {
      // setup.you 与 career.team 通常同一引用；保证技能装在可见名单上
      if (state.career.team && you === state.career.team) {
        /* same ref */
      } else if (state.career.team && you?.players) {
        state.career.team.players = you.players;
      }
      renderCareerSkillShop(state.career);
    }
  }
  if (backBtn) {
    backBtn.textContent = isCareer || isDuel ? "返回市场" : "返回";
    backBtn.title = isCareer || isDuel ? "回到转会市场继续买人/装技能" : "返回首页";
  }
  const scout = $("#scout-board");
  if (scout) {
    if (state.career?.kind === "career") renderScoutBoard(scout);
    else {
      const oppTeam = youSide === "home" ? away : home;
      scout.innerHTML = `<div class="scout-match yours">
        <div>本场对手：${oppTeam.name}</div>
        <div class="scout-lineup"><strong>预计首发</strong>：${formatStarterLine(teamStarters(oppTeam))}</div>
      </div>`;
      const rl = $("#scout-round-label");
      if (rl) rl.textContent = "对手情报";
    }
  }
  show("setup");
}

function fillTempoSelect(sel, currentId) {
  if (!sel) return;
  const cur = normalizeTempo(currentId);
  sel.innerHTML = TEMPO_OPTIONS.map(
    (t) =>
      `<option value="${t.id}" title="${escAttr(t.desc)}" ${t.id === cur ? "selected" : ""}>${t.name}</option>`
  ).join("");
}

function syncTempoHelp(el, tempoId) {
  if (!el) return;
  const t = getTempoDef(tempoId);
  el.textContent = t?.desc || "";
}

function renderSetupTempo() {
  const you = state.setup?.you;
  const sel = $("#setup-tempo-select");
  if (!sel || !you) return;
  you.gameplan = you.gameplan || {};
  if (!you.gameplan.tempo) you.gameplan.tempo = "normal";
  fillTempoSelect(sel, you.gameplan.tempo);
  syncTempoHelp($("#setup-tempo-help"), you.gameplan.tempo);
  sel.onchange = () => {
    you.gameplan.tempo = normalizeTempo(sel.value);
    syncTempoHelp($("#setup-tempo-help"), you.gameplan.tempo);
  };
}

function renderSetupPacks() {
  const box = $("#setup-packs");
  const you = state.setup?.you;
  if (!box || !you) return;
  you.lineupPacks = you.lineupPacks || autoBuildAllPacks(you.players);
  box.innerHTML = LINEUP_PACK_DEFS.map((d) => {
    const ids = you.lineupPacks[d.id] || [];
    const names = ids
      .map((id) => you.players.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .slice(0, 3)
      .join("/");
    const active = state.setup.packPreview === d.id ? " active" : "";
    return `<button type="button" class="btn small${active}" data-pack="${d.id}" title="${escAttr(d.hint)}">${d.name}${
      names ? ` · ${names}` : ""
    }</button>`;
  }).join("");
  box.querySelectorAll("[data-pack]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.pack;
      // Rebuild from current roster then apply as starter selection
      you.lineupPacks = autoBuildAllPacks(you.players);
      const ids = you.lineupPacks[id] || [];
      state.setup.selected = new Set(ids);
      state.setup.packPreview = id;
      for (const p of you.players) {
        if (ids.includes(p.id) && !p.playPos) p.playPos = normalizePos(p.pos);
      }
      autoAssignUniquePositions(you.players.filter((p) => ids.includes(p.id)));
      renderSetupRoster();
      renderSetupPacks();
      renderSetupRoles();
      renderSetupOrders();
    };
  });
}

function orderSelectHtml(list, cur, cls, title) {
  return `<select class="${cls}" title="${escAttr(title || "")}">${list
    .map((o) => `<option value="${o.id}" ${o.id === cur ? "selected" : ""} title="${escAttr(o.hint)}">${o.name}</option>`)
    .join("")}</select>`;
}

function fillBallActionSelect(sel, preferred = "pnr") {
  if (!sel) return;
  const cur = sel.value || preferred;
  sel.innerHTML = ORDER_ACTION.filter((a) => a.id !== "auto")
    .map(
      (a) =>
        `<option value="${a.id}" title="${escAttr(a.hint)}" ${a.id === cur ? "selected" : ""}>${a.name}</option>`
    )
    .join("");
  if ([...sel.options].some((o) => o.value === preferred)) sel.value = preferred;
  syncBallActionDesc(sel);
}

/** 在持球打法下拉旁展示当前选项说明（挡拆等） */
function syncBallActionDesc(sel) {
  if (!sel) return;
  const id = sel.id || "";
  const descEl =
    id === "setup-ball-action"
      ? $("#setup-ball-action-desc")
      : id === "offense-ball-action"
        ? $("#offense-ball-action-desc")
        : null;
  if (!descEl) return;
  const act = ORDER_ACTION.find((a) => a.id === sel.value);
  if (act?.hint) {
    descEl.textContent = `${act.name}：${act.hint}`;
  } else if (id === "setup-ball-action") {
    descEl.textContent = "先选持球人与打法；其余人可在下方设成「无球定点」配合。不指定则按本能抢球。";
  } else {
    descEl.textContent = "";
  }
}

function syncSetupBallHandlerUi() {
  const you = state.setup?.you;
  const focusSel = $("#setup-offense-focus");
  const actionSel = $("#setup-ball-action");
  if (!you || !focusSel) return;
  const id = focusSel.value || "";
  if (!you.gameplan) you.gameplan = {};
  you.gameplan.offenseFocusId = id || null;
  const p = id ? you.players.find((x) => x.id === id) : null;
  if (p) {
    ensurePlayerOrders([p]);
    const act = actionSel?.value || suggestedBallHandlerAction(p);
    if (actionSel) fillBallActionSelect(actionSel, act);
    p.orders.action = actionSel?.value || act;
    const u = usageForBallAction(p.orders.action);
    if (u && p.orders.usage === "auto") p.orders.usage = u;
  } else if (actionSel) {
    fillBallActionSelect(actionSel, "pnr");
  }
}

function renderSetupOrders() {
  const box = $("#setup-orders");
  const focusSel = $("#setup-offense-focus");
  const actionSel = $("#setup-ball-action");
  const you = state.setup?.you;
  if (!you) return;
  ensurePlayerOrders(you.players);
  const picked = you.players.filter((p) => state.setup.selected.has(p.id));
  const list = picked.length ? picked : [...you.players].sort((a, b) => overall(b) - overall(a)).slice(0, 8);
  if (focusSel) {
    const prev = you.gameplan?.offenseFocusId || focusSel.value || "";
    focusSel.innerHTML =
      `<option value="">（不指定 · 按本能）</option>` +
      list.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    if (prev && list.some((p) => p.id === prev)) focusSel.value = prev;
    else focusSel.value = "";
    focusSel.onchange = () => {
      syncSetupBallHandlerUi();
      renderSetupOrders();
      renderSetupRoster();
    };
  }
  if (actionSel) {
    const focusId = focusSel?.value || you.gameplan?.offenseFocusId;
    const p = focusId ? you.players.find((x) => x.id === focusId) : null;
    fillBallActionSelect(actionSel, p ? suggestedBallHandlerAction(p) : "pnr");
    actionSel.disabled = !focusId;
    actionSel.onchange = () => {
      syncSetupBallHandlerUi();
      renderSetupOrders();
      renderSetupRoster();
    };
  }
  if (!box) return;
  box.innerHTML = list
    .map((p) => {
      const o = p.orders;
      const posBit = normalizePos(p.playPos || p.pos);
      const recTag = p.ordersManual ? "" : `<em class="tiny muted">推荐</em>`;
      return `<div class="order-row" data-id="${p.id}">
        <div class="order-name">${p.name}<em class="tiny"> · ${posBit}${p.playPosManual ? "" : "·荐"}</em>
          <span class="tiny order-summary">${escAttr(ordersLabel(o) || "自由发挥")}</span>
          ${recTag}
        </div>
        <div class="order-group">
          <span class="order-group-label">进攻</span>
          <div class="order-controls">
            ${orderSelectHtml(ORDER_USAGE, o.usage, "ord-usage", "组织 / 得分 / 偏防守 / 蓝领冲抢")}
            ${orderSelectHtml(ORDER_AGGRESSION, o.aggression || "auto", "ord-agg", "攻击欲望 / 专注防守")}
            ${orderSelectHtml(ORDER_ACTION, o.action, "ord-action", "挡拆 / 无球 / 冲抢二次")}
            ${orderSelectHtml(ORDER_ATTACK, o.attack, "ord-attack", "终结区域 / 二次进攻")}
            ${orderSelectHtml(ORDER_HUNT, o.hunt, "ord-hunt", "个人抓机会")}
          </div>
        </div>
        <div class="order-group">
          <span class="order-group-label">防守</span>
          <div class="order-controls">
            ${orderSelectHtml(ORDER_DEF, o.defFocus, "ord-def", "领防 / 全力防守等")}
          </div>
        </div>
      </div>`;
    })
    .join("");
  box.querySelectorAll(".order-row").forEach((row) => {
    const p = you.players.find((x) => x.id === row.dataset.id);
    if (!p) return;
    const bind = (cls, key) => {
      row.querySelector(`.${cls}`).onchange = (e) => {
        markOrdersManual(p, { [key]: e.target.value });
        renderSetupOrders();
      };
    };
    bind("ord-usage", "usage");
    bind("ord-agg", "aggression");
    bind("ord-action", "action");
    bind("ord-attack", "attack");
    bind("ord-hunt", "hunt");
    bind("ord-def", "defFocus");
  });
}

function renderSetupRoles() {
  const box = $("#setup-roles");
  const you = state.setup?.you;
  if (!box || !you) return;
  ensureRoles(you.players);
  ensurePlayerOrders(you.players);
  // Season / experiment: show full roster minutes; otherwise starters + top bench
  const picked = you.players.filter((p) => state.setup.selected.has(p.id));
  const list =
    state.season || you.players.length <= 12
      ? [...you.players].sort((a, b) => (b.targetMinutes || 0) - (a.targetMinutes || 0) || overall(b) - overall(a))
      : picked.length
        ? [
            ...picked,
            ...you.players
              .filter((p) => !state.setup.selected.has(p.id))
              .sort((a, b) => overall(b) - overall(a))
              .slice(0, 5),
          ]
        : [...you.players].sort((a, b) => overall(b) - overall(a)).slice(0, 10);
  const totalMin = list.reduce((s, p) => s + (Number(p.targetMinutes) || 0), 0);
  box.innerHTML =
    `<p class="tiny">目标分钟合计约 <strong>${totalMin}</strong>（五人同时上场约 240）。体能差的人打 35+ 会崩，铁肺可接近 48。</p>` +
    list
      .map((p) => {
        const role = p.roleExpectation || inferPlayerRole(p);
        const opts = Object.values(PLAYER_ROLES)
          .map((r) => `<option value="${r.id}" ${r.id === role ? "selected" : ""}>${r.name}</option>`)
          .join("");
        const cap = staminaMinuteCap(p);
        const warn = (p.targetMinutes || 0) > cap ? " over-min" : "";
        return `<div class="role-row${warn}" data-id="${p.id}">
        <span>${p.name}<em class="tiny"> · ${p.playPos || p.pos} · 本职${p.pos}</em>
          <div class="tiny stamina-min-hint">${staminaMinuteHint(p)}</div>
        </span>
        <select class="role-select">${opts}</select>
        <input class="min-input" type="number" min="8" max="48" value="${p.targetMinutes ?? 24}" title="目标分钟（上限参考体能 ${cap}）" />
      </div>`;
      })
      .join("") +
    `<div class="btn-row" style="margin-top:6px">
      <button type="button" class="btn small" id="btn-setup-suggest-mins">按体能建议分钟</button>
      ${state.season ? `<button type="button" class="btn small primary" id="btn-setup-save-rotation">保存为默认轮换</button>` : ""}
    </div>`;
  box.querySelectorAll(".role-row").forEach((row) => {
    const p = you.players.find((x) => x.id === row.dataset.id);
    if (!p) return;
    row.querySelector(".role-select").onchange = (e) => {
      p.roleExpectation = e.target.value;
      p._roleManual = true;
      p.targetMinutes = suggestTargetMinutes(p);
      renderSetupRoles();
    };
    row.querySelector(".min-input").onchange = (e) => {
      p.targetMinutes = clamp(Number(e.target.value) || 20, 8, 48);
      renderSetupRoles();
    };
  });
  $("#btn-setup-suggest-mins")?.addEventListener("click", () => {
    for (const p of you.players) p.targetMinutes = suggestTargetMinutes(p);
    renderSetupRoles();
  });
  $("#btn-setup-save-rotation")?.addEventListener("click", () => {
    persistSeasonRotationFromTeam(you, [...(state.setup?.selected || [])]);
    alert("已保存为本赛季默认轮换（位置 / 分钟 / 角色 / 指令 / 首发）。下场比赛会自动套用。");
  });
}

/** Write setup/rotation fields back onto the live season roster. */
function persistSeasonRotationFromTeam(youTeam, starterIds = null) {
  const st = state.season;
  if (!st || !youTeam) return false;
  const team = st.teams[st.userTeamId];
  if (!team) return false;
  const byId = Object.fromEntries((youTeam.players || []).map((p) => [p.id, p]));
  for (const p of team.players || []) {
    const src = byId[p.id];
    if (!src) continue;
    if (src.playPos) p.playPos = src.playPos;
    if (src.roleExpectation) p.roleExpectation = src.roleExpectation;
    if (src._roleManual) p._roleManual = true;
    if (src.targetMinutes != null) p.targetMinutes = src.targetMinutes;
    if (src.orders) p.orders = structuredClone(src.orders);
  }
  const starters = starterIds || youTeam.starterIds || team.starterIds || [];
  team.starterIds = [...starters].slice(0, 5);
  if (youTeam.gameplan) team.gameplan = structuredClone(youTeam.gameplan);
  if (youTeam.coach) team.coach = structuredClone(youTeam.coach);
  if (youTeam.lineupPacks) team.lineupPacks = structuredClone(youTeam.lineupPacks);
  team.rotation = captureRotationPlan(team, team.starterIds);
  if (!saveSeasonAndCareer(st)) return false;
  return true;
}

const MATCHUP_POS_ORDER = ["PG", "SG", "SF", "PF", "C"];
const MATCHUP_NEAR_POS = {
  PG: ["SG", "SF"],
  SG: ["PG", "SF"],
  SF: ["SG", "PF", "PG"],
  PF: ["C", "SF"],
  C: ["PF", "SF"],
};

function matchupPosOf(p) {
  return normalizePos(p?.playPos || p?.pos);
}

function sortByMatchupPos(list) {
  return [...(list || [])].sort((a, b) => {
    const da = MATCHUP_POS_ORDER.indexOf(matchupPosOf(a));
    const db = MATCHUP_POS_ORDER.indexOf(matchupPosOf(b));
    return (da < 0 ? 99 : da) - (db < 0 ? 99 : db) || (b.defense || 0) - (a.defense || 0);
  });
}

/** 同位置优先互防；同位置多人取防守更高者；再邻位，最后才随便补 */
function buildSamePosMatchups(youPool, oppPool, saved = {}) {
  const you = sortByMatchupPos(youPool);
  const opp = sortByMatchupPos(oppPool);
  const youById = new Map(you.map((p) => [p.id, p]));
  const assignments = {};
  const used = new Set();

  const claim = (opId, defId) => {
    if (!opId || !defId || used.has(defId) || !youById.has(defId)) return false;
    assignments[opId] = defId;
    used.add(defId);
    return true;
  };

  // 保留玩家已选手动对位（含故意错位），只要防守人仍在名单里
  for (const op of opp) {
    const sid = saved[op.id];
    if (!sid || !youById.has(sid) || used.has(sid)) continue;
    claim(op.id, sid);
  }

  const pickBest = (op, pred) => {
    const cands = you
      .filter((p) => !used.has(p.id) && pred(p))
      .sort((a, b) => (b.defense || 0) - (a.defense || 0) || overall(b) - overall(a));
    return cands[0] || null;
  };

  // 1) 同位置
  for (const op of opp) {
    if (assignments[op.id]) continue;
    const bp = matchupPosOf(op);
    const hit = pickBest(op, (p) => matchupPosOf(p) === bp);
    if (hit) claim(op.id, hit.id);
  }
  // 2) 邻位
  for (const op of opp) {
    if (assignments[op.id]) continue;
    const near = MATCHUP_NEAR_POS[matchupPosOf(op)] || [];
    const hit = pickBest(op, (p) => near.includes(matchupPosOf(p)));
    if (hit) claim(op.id, hit.id);
  }
  // 3) 剩余
  for (const op of opp) {
    if (assignments[op.id]) continue;
    const hit = pickBest(op, () => true);
    if (hit) claim(op.id, hit.id);
  }
  return assignments;
}

function matchupOptionList(youPool, oppPlayer, selectedId) {
  const bp = matchupPosOf(oppPlayer);
  const near = MATCHUP_NEAR_POS[bp] || [];
  const rank = (p) => {
    const dp = matchupPosOf(p);
    if (dp === bp) return 0;
    if (near.includes(dp)) return 1;
    return 2;
  };
  return sortByMatchupPos(youPool)
    .sort((a, b) => rank(a) - rank(b) || (b.defense || 0) - (a.defense || 0))
    .map((p) => {
      const dp = matchupPosOf(p);
      const tag = dp === bp ? " · 同位置" : near.includes(dp) ? " · 邻位" : "";
      return `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${dp} ${esc(
        p.name
      )}（防${p.defense}${tag}）</option>`;
    })
    .join("");
}

function renderMatchupBoard(box, youPool, oppPool, assignments, { live = false } = {}) {
  if (!box) return;
  const youSorted = sortByMatchupPos(youPool);
  const oppSorted = sortByMatchupPos(oppPool);
  const assign = buildSamePosMatchups(youSorted, oppSorted, assignments || {});
  box.innerHTML = oppSorted
    .map((op) => {
      const cur = assign[op.id] || "";
      return `<div class="matchup-row" data-opp="${op.id}">
        <div class="matchup-opp">${matchupPosOf(op)} ${esc(op.name)} · OVR ${overall(op)}</div>
        <span class="matchup-arrow">←防</span>
        <select data-matchup-opp="${op.id}" ${live ? 'data-live-matchup="1"' : ""}>
          ${matchupOptionList(youSorted, op, cur)}
        </select>
      </div>`;
    })
    .join("");
  box.querySelectorAll("select[data-matchup-opp]").forEach((sel) => {
    sel.onchange = () => {
      if (live) {
        if (!state.sim?.paused) {
          pushFeed("coach", "活球中不能改对位——请先叫暂停或等到节间");
          paintLiveMatchupBoard(state.sim.snapshot());
          return;
        }
        state.sim.setMatchupAssignment(sel.dataset.matchupOpp, sel.value || null);
        const snap = state.sim.snapshot();
        paintLiveMatchupBoard(snap);
        syncDefendHint(snap);
        paintLineups(snap);
      }
    };
  });
  return assign;
}

function readSetupMatchupAssignments() {
  const box = $("#setup-matchup-board");
  const out = {};
  box?.querySelectorAll("select[data-matchup-opp]").forEach((sel) => {
    if (sel.value) out[sel.dataset.matchupOpp] = sel.value;
  });
  return out;
}

function renderSetupGameplan() {
  const defSel = $("#gp-defender");
  const tgtSel = $("#gp-target");
  if (!defSel || !tgtSel || !state.setup) return;
  const { home, away, youSide } = state.pendingMatch;
  const you = youSide === "home" ? home : away;
  const opp = youSide === "home" ? away : home;
  // 用已选首发五人做对位（没有则全名单）；按位置排，禁止防高的中锋去锁对方后卫
  const selectedIds = state.setup?.selected;
  const youStarters = selectedIds?.size
    ? [...selectedIds].map((id) => you.players.find((p) => p.id === id)).filter(Boolean)
    : (you.starterIds || []).map((id) => you.players.find((p) => p.id === id)).filter(Boolean);
  const youPool = sortByMatchupPos(youStarters.length >= 5 ? youStarters : you.players);
  const oppStarters = (opp.starterIds || [])
    .map((id) => opp.players.find((p) => p.id === id))
    .filter(Boolean);
  const boardOpp = sortByMatchupPos(
    (oppStarters.length >= 5 ? oppStarters : [...opp.players].sort((a, b) => overall(b) - overall(a)).slice(0, 5)).slice(
      0,
      5
    )
  );
  const saved =
    you.gameplan?.matchup?.assignments || you.gameplan?.matchupAssignments || {};
  const resolved = renderMatchupBoard($("#setup-matchup-board"), youPool, boardOpp, saved, {
    live: false,
  });
  // 写回默认同位置对位，开打即生效
  if (resolved && Object.keys(resolved).length) {
    you.gameplan = you.gameplan || {};
    you.gameplan.matchupAssignments = resolved;
    you.gameplan.matchup = {
      ...(you.gameplan.matchup || {}),
      assignments: resolved,
    };
  }
  defSel.innerHTML =
    `<option value="">（跟对位表）</option>` +
    youPool
      .map((p) => `<option value="${p.id}">${matchupPosOf(p)} ${p.name}（防${p.defense}）</option>`)
      .join("");
  tgtSel.innerHTML = boardOpp
    .map((p) => `<option value="${p.id}">${matchupPosOf(p)} ${p.name}（OVR ${overall(p)}）</option>`)
    .join("");
  if (you.gameplan?.matchup?.defenderId) defSel.value = you.gameplan.matchup.defenderId;
  if (you.gameplan?.matchup?.targetId) tgtSel.value = you.gameplan.matchup.targetId;
  if (you.gameplan?.matchup?.scheme) $("#gp-scheme").value = you.gameplan.matchup.scheme;
}

function paintLiveMatchupBoard(snap) {
  if (!snap || !state.sim) return;
  const you = snap.youSide === "home" ? snap.home : snap.away;
  const opp = snap.youSide === "home" ? snap.away : snap.home;
  const youPool = sortByMatchupPos(you.onCourt || []);
  const oppPool = sortByMatchupPos(opp.onCourt || []);
  const prev = snap.defensePlan?.assignments || {};
  const resolved = renderMatchupBoard($("#live-matchup-board"), youPool, oppPool, prev, {
    live: true,
  });
  // 若还没手设过对位表，把同位置默写进 sim
  if (resolved && (!prev || !Object.keys(prev).length) && state.sim.defensePlan) {
    state.sim.defensePlan.assignments = { ...resolved };
  }
  const defSel = $("#defend-defender");
  if (defSel) {
    const cur = defSel.value || snap.defensePlan?.defenderId || "";
    defSel.innerHTML =
      `<option value="">（跟对位表 / 自动）</option>` +
      youPool
        .map(
          (p) =>
            `<option value="${p.id}">${matchupPosOf(p)} ${p.name}（防${p.defense}）</option>`
        )
        .join("");
    if (cur && [...defSel.options].some((o) => o.value === cur)) defSel.value = cur;
  }
}

function syncPhilLabels() {
  $("#phil-off-v").textContent = $("#phil-off").value;
  $("#phil-def-v").textContent = $("#phil-def").value;
  $("#phil-morale-v").textContent = $("#phil-morale").value;
  $("#phil-stam-v").textContent = $("#phil-stam").value;
}
["phil-off", "phil-def", "phil-morale", "phil-stam"].forEach((id) => {
  $(`#${id}`).oninput = () => {
    syncPhilLabels();
    syncPhilRosterHint();
    if (state.setup) renderSetupRoster();
  };
});

/** Setup: tactics unlocked by coach book and/or current starters. */
function renderPhilTactics(you) {
  const box = $("#phil-tactics");
  if (!box || !you) return;
  const picked = (you.players || []).filter((p) => state.setup?.selected?.has(p.id));
  const roster = picked.length >= 5 ? picked : you.players || [];
  const unlock = rosterTacticUnlocks(roster);
  const rosterIds = new Set(unlock.ids);
  const coachIds = new Set(you.coach?.specialTactics || ["balanced"]);
  const current = new Set(you.coach?.specialTactics || ["balanced"]);
  // Auto-check newly unlocked roster tactics so they're ready for tip-off
  for (const id of rosterIds) current.add(id);
  box.innerHTML = Object.values(TACTICS)
    .map((t) => {
      const fromRoster = rosterIds.has(t.id);
      const fromCoach = coachIds.has(t.id) || t.id === "balanced";
      const unlocked = fromRoster || fromCoach;
      const badge = fromRoster && !fromCoach ? " · 阵容" : fromCoach && fromRoster ? " · 双解锁" : "";
      const why = unlock.reasons[t.id] || t.desc || "";
      return `<label class="${unlocked ? "" : "tactic-locked"}" title="${escAttr(
        unlocked ? why : `${t.desc || ""}（需：双组织 / 优质内线 / 双塔等阵容条件，或教练自带）`
      )}"><input type="checkbox" value="${t.id}" ${unlocked ? "" : "disabled"} ${
        current.has(t.id) && unlocked ? "checked" : ""
      }/> ${t.name}${badge}</label>`;
    })
    .join("");
  const hint = $("#phil-tactics-hint");
  if (hint) {
    const bits = Object.values(unlock.reasons);
    hint.textContent = bits.length
      ? `阵容解锁：${bits.slice(0, 4).join("；")}`
      : "选满首发后：双组织→动态传导/魔球；优质中锋→挡拆/低位/收缩；双塔→冲板/二次进攻等。";
  }
}

/** In-game / resume: fill tactic dropdown from coach ∪ on-court unlocks. */
function fillTacticSelect(team, { preferId = null } = {}) {
  const sel = $("#tactic-select");
  if (!sel || !team) return;
  const court = team.onCourt?.length ? team.onCourt : team.players || [];
  const tactics = availableTactics(team.coach || { specialTactics: ["balanced"] }, court);
  const cur = preferId || sel.value || team.tactic?.id || "";
  sel.innerHTML = tactics
    .map((t) => {
      const why = tacticUnlockHint(t.id, court);
      const title = why ? `${t.desc || ""}（${why}）` : t.desc || "";
      return `<option value="${t.id}" title="${escAttr(title)}">${t.name}${
        why ? " ★" : ""
      }</option>`;
    })
    .join("");
  if (cur && tactics.some((t) => t.id === cur)) sel.value = cur;
  else if (tactics[0]) sel.value = tactics[0].id;
  syncTacticHelp();
}

/** Live hint: how offense/defense sliders interact with current roster. */
function syncPhilRosterHint() {
  const offHint = document.querySelector('.help-desc[data-for="phil-off"]');
  const defHint = document.querySelector('.help-desc[data-for="phil-def"]');
  const you = state.setup?.you;
  const off = Number($("#phil-off")?.value ?? 8);
  const def = Number($("#phil-def")?.value ?? 8);
  if (offHint) {
    if (!you?.players?.length) {
      offHint.textContent =
        "抓机会：过高时偏防/弱攻球员也会自主进攻，浪费球权与体力；进攻型阵容则抓机会极强。";
    } else {
      const pool = you.players.filter((p) => state.setup.selected?.has(p.id));
      const list = pool.length >= 3 ? pool : you.players;
      const scorers = list.filter(
        (p) =>
          (p.scoring || 0) >= 78 ||
          /iso_|scorer|creator|shooter|versatile/.test(p.archetype || "")
      ).length;
      const share = scorers / Math.max(1, list.length);
      if (off >= 14 && share < 0.4) {
        offHint.textContent = `抓机会偏高（${off}）：当前进攻型偏少（${scorers}/${list.length}）——弱攻球员也容易乱出手，浪费球权与体力。`;
      } else if (off >= 12 && share >= 0.55) {
        offHint.textContent = `抓机会偏高（${off}）：进攻手充足（${scorers}/${list.length}）——见空档就打，群狼效率很强。`;
      } else {
        offHint.textContent = `抓机会 ${off}：见空档就攻。过高时弱攻/偏防也会出手；进攻型越多，抓机会越强（当前约 ${scorers}/${list.length} 进攻型）。`;
      }
    }
  }
  if (defHint) {
    defHint.textContent =
      def >= 14
        ? `防守压迫很高（${def}）：盯防更紧，但体力差的球员会快速透支；威少类铁肺几乎无感。`
        : `防守压迫 ${def}：抬高盯防/协防，吃体力并与球员体力挂钩；体力越好越扛得住高压防守。`;
  }
}
$("#phil-tactics")?.addEventListener("change", () => {
  if (state.setup) renderSetupRoster();
});

function escAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
function esc(s) {
  return escAttr(s).replace(/'/g, "&#39;");
}

function posSelectHtml(player, { selectedPos = null, disabled = false } = {}) {
  const cur = normalizePos(selectedPos || player.playPos || player.pos);
  const opts = POS_SLOTS.map(
    (s) =>
      `<option value="${s.id}" ${s.id === cur ? "selected" : ""}>${s.id}${
        s.id === normalizePos(player.pos) ? "·本职" : ""
      }</option>`
  ).join("");
  return `<select class="pos-select" data-id="${player.id}" ${disabled ? "disabled" : ""} title="指定场上位置（错位降低适配度）">${opts}</select>`;
}

/** Visible PG–C chips instead of a dropdown. */
function posChipsHtml(player, { selectedPos = null, dataKey = "data-pos-for" } = {}) {
  const cur = normalizePos(selectedPos || player.playPos || player.pos);
  const nat = normalizePos(player.pos);
  return `<div class="pos-chips" ${dataKey}="${player.id}" role="group" aria-label="场上位置">
    ${POS_SLOTS.map(
      (s) =>
        `<button type="button" class="pos-chip${s.id === cur ? " active" : ""}${
          s.id === nat ? " natural" : ""
        }" data-pos="${s.id}" title="${s.id === nat ? "本职 " + s.id : "改打 " + s.id}">${s.id}</button>`
    ).join("")}
  </div>`;
}

function byOverallDesc(a, b) {
  return overall(b) - overall(a) || String(a.name || "").localeCompare(String(b.name || ""));
}

/** Prefer unique PG–C coverage when auto-filling playPos for starters. */
function autoAssignUniquePositions(players) {
  const order = ["PG", "SG", "SF", "PF", "C"];
  const used = new Set();
  // 已手动指定位置的先占坑
  for (const p of players || []) {
    if (p.playPosManual && p.playPos) used.add(normalizePos(p.playPos));
  }
  const sorted = [...players].sort((a, b) => {
    const pa = a.playPosManual ? normalizePos(a.playPos || a.pos) : recommendPlayPos(a);
    const pb = b.playPosManual ? normalizePos(b.playPos || b.pos) : recommendPlayPos(b);
    const da = order.indexOf(pa);
    const db = order.indexOf(pb);
    return da - db || overall(b) - overall(a);
  });
  for (const p of sorted) {
    if (p.playPosManual && p.playPos) {
      p.playPos = normalizePos(p.playPos);
      continue;
    }
    const preferred = recommendPlayPos(p);
    if (!used.has(preferred)) {
      p.playPos = preferred;
      used.add(preferred);
      continue;
    }
    // nearest free slot around recommendation
    const idx = order.indexOf(preferred);
    let best = null;
    let bestDist = 99;
    for (let i = 0; i < order.length; i++) {
      if (used.has(order[i])) continue;
      const d = Math.abs(i - idx);
      if (d < bestDist) {
        bestDist = d;
        best = order[i];
      }
    }
    p.playPos = best || preferred;
    if (best) used.add(best);
  }
}

/** First empty PG–C slot, preferring natural position. */
function nextEmptyPlayPos(picked, naturalPos) {
  const used = new Set(picked.map((p) => normalizePos(p.playPos || p.pos)));
  const nat = normalizePos(naturalPos);
  if (!used.has(nat)) return nat;
  for (const s of POS_SLOTS) {
    if (!used.has(s.id)) return s.id;
  }
  return nat;
}

function setupPosSelectHtml(p) {
  const cur = normalizePos(p.playPos || p.pos);
  const nat = normalizePos(p.pos);
  const rec = recommendPlayPos(p);
  return `<select class="setup-pos-select" data-pos-for="${p.id}" title="改打哪个位置（未手动改过则用属性推荐）" onclick="event.stopPropagation()">
    ${POS_SLOTS.map(
      (s) =>
        `<option value="${s.id}" ${s.id === cur ? "selected" : ""}>${s.id}${
          s.id === rec ? "（推荐）" : s.id === nat ? "（本职）" : ""
        }</option>`
    ).join("")}
  </select>`;
}

/** 简短位置建议：按属性提示更适合打哪 */
function setupPosFitHint(p) {
  const nat = normalizePos(p.pos);
  const pass = p.pass || 0;
  const three = p.three || 0;
  const reb = p.rebound || 0;
  const blk = p.block || 0;
  const def = p.defense || 0;
  const spd = p.speed || 0;
  const paint = p.paint || 0;
  const scoring = p.scoring || 0;
  const skills = p.skills || [];
  // 全能 / 位置模糊核：不因高内线分被标成「只能打大前/中锋」
  const positionless =
    skills.includes("positionless") ||
    String(p.bref || "").toLowerCase() === "jamesle01" ||
    (paint >= 78 && pass >= 70 && spd >= 72 && scoring >= 80);
  if (positionless) {
    const extra = [];
    if (pass >= 70) extra.push("擅挡拆");
    else if (pass >= 62) extra.push("可掩护");
    if (def >= 75 && spd >= 72) extra.push("可换防");
    return [`全能→PG–C`, ...extra].slice(0, 2).join(" · ");
  }
  const tips = [];
  if (pass >= 78 || (pass >= 70 && spd >= 70)) tips.push("擅组织→PG");
  if (three >= 78 && (spd >= 68 || pass >= 60)) tips.push("外线→SG/SF");
  if (three >= 80 && reb < 65) tips.push("定点射手");
  if (reb >= 78 || blk >= 72 || (paint >= 80 && pass < 65 && spd < 70)) tips.push("内线→PF/C");
  if (def >= 82 && spd >= 72) tips.push("锁防守");
  if (!tips.length) tips.push(`本职 ${nat}`);
  return tips.slice(0, 2).join(" · ");
}

function setupStatGridHtml(p) {
  const row = (label, v) => {
    const n = Number(v) || 0;
    const tone = n >= 80 ? "hi" : n >= 65 ? "mid" : "lo";
    return `<span class="setup-stat ${tone}" title="${label}"><em>${label}</em>${n || "—"}</span>`;
  };
  return `<div class="setup-stat-grid">
    ${row("攻", p.scoring)}
    ${row("三分", p.three)}
    ${row("中投", p.mid)}
    ${row("内线", p.paint)}
    ${row("传", p.pass)}
    ${row("防", p.defense)}
    ${row("板", p.rebound)}
    ${row("断", p.steal)}
    ${row("帽", p.block)}
    ${row("速", p.speed)}
    ${row("力", p.strength)}
    ${row("球商", p.iq)}
  </div>`;
}

function setupMiniCardHtml(p, { onCourt = false } = {}) {
  const out = !isPlayerAvailable(p);
  const ovr = overall(p);
  const phy = physiqueLabel(p);
  const actionLabel = onCourt ? "拖下去 / 点下场" : state.setup.selected.size >= 5 ? "拖到格子可换人" : "拖上去 / 点上场";
  // 用 div 而不是 button：浏览器对 button 的 HTML5 拖拽经常丢 drop
  return `<div class="setup-mini ${onCourt ? "on-court" : "bench"} ${out ? "injured" : ""}" data-id="${p.id}" data-action="toggle" draggable="${out ? "false" : "true"}" role="button" tabindex="0" ${
    out ? 'aria-disabled="true"' : ""
  }>
    <div class="setup-mini-top">
      ${photoImg(p, "headshot sm")}
      <div class="setup-mini-body">
        <strong>${p.name}</strong>
        <div class="tiny">OVR ${ovr} · ${p.season} · 本职 ${normalizePos(p.pos)}${phy ? ` · ${phy}` : ""}</div>
        <div class="tiny setup-fit-hint">${setupPosFitHint(p)}</div>
        ${onCourt ? `<div class="setup-pos-row"><span class="tiny">打</span>${setupPosSelectHtml(p)}</div>` : ""}
      </div>
      <span class="setup-action-label">${out ? "伤停" : actionLabel}</span>
    </div>
    ${setupStatGridHtml(p)}
    ${p.skills?.length ? `<div class="skill-row compact">${skillChipsHtml(p)}</div>` : ""}
  </div>`;
}

/** 找出挤在同一位置的「多余」首发（导致空位却显示 5/5）。 */
function findStackedStarter(picked) {
  const seen = new Map();
  for (const p of picked) {
    const pos = normalizePos(p.playPos || p.pos);
    if (seen.has(pos)) return p;
    seen.set(pos, p);
  }
  return null;
}

/** 把叠位的人自动挪到空位，避免「5 人但 SF 空着」。 */
function resolveStarterPositionCollisions(picked) {
  if (!picked?.length) return;
  const byPos = Object.fromEntries(POS_SLOTS.map((s) => [s.id, []]));
  for (const p of picked) {
    const pos = normalizePos(p.playPos || p.pos);
    (byPos[pos] || byPos.SF).push(p);
  }
  const empty = POS_SLOTS.map((s) => s.id).filter((id) => !byPos[id].length);
  for (const s of POS_SLOTS) {
    const list = byPos[s.id];
    while (list.length > 1 && empty.length) {
      const mover = list.pop();
      const dest = empty.shift();
      mover.playPos = dest;
      byPos[dest].push(mover);
    }
  }
}

/** Drop player onto a starter slot (move / swap / replace). */
function setupDropOntoSlot(you, playerId, slotPos) {
  const p = you.players.find((x) => x.id === playerId);
  if (!p || !isPlayerAvailable(p)) return false;
  const next = normalizePos(slotPos);
  const picked = you.players.filter((x) => state.setup.selected.has(x.id));
  const occupant = picked.find((x) => normalizePos(x.playPos || x.pos) === next && x.id !== p.id);

  // 已是首发：拖到空位=改位；拖到有人=互换
  if (state.setup.selected.has(p.id)) {
    if (occupant) {
      const from = normalizePos(p.playPos || p.pos);
      markPlayPosManual(occupant, from);
    }
    markPlayPosManual(p, next);
    resolveStarterPositionCollisions(
      you.players.filter((x) => state.setup.selected.has(x.id))
    );
    return true;
  }

  // 从替补拖上来：有人则换下原主
  if (occupant) {
    state.setup.selected.delete(occupant.id);
    markPlayPosManual(p, next);
    state.setup.selected.add(p.id);
    return true;
  }

  // 空位：名单未满直接上
  if (state.setup.selected.size < 5) {
    markPlayPosManual(p, next);
    state.setup.selected.add(p.id);
    return true;
  }

  // 名单已满但此格为空 → 通常有人叠位；挤掉叠位者，让新来的填空位
  const stacked = findStackedStarter(picked);
  if (stacked) {
    state.setup.selected.delete(stacked.id);
    markPlayPosManual(p, next);
    state.setup.selected.add(p.id);
    return true;
  }
  return false;
}

function bindSetupDragDrop(box, you, refreshAfter) {
  let dragId = null;
  let dragged = false;
  box.querySelectorAll(".setup-mini[draggable='true']").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      dragId = el.dataset.id;
      dragged = true;
      el.classList.add("dragging");
      try {
        e.dataTransfer.setData("text/plain", dragId);
        e.dataTransfer.effectAllowed = "move";
      } catch (_) {
        /* ignore */
      }
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      box.querySelectorAll(".setup-slot, .setup-pool-panel").forEach((n) => n.classList.remove("drag-over"));
      // 下一帧清掉，避免紧跟的 click 误触上下场
      setTimeout(() => {
        dragId = null;
        dragged = false;
      }, 0);
    });
  });

  const allowDrop = (e, highlight) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    highlight?.classList.add("drag-over");
  };

  box.querySelectorAll(".setup-slot[data-drop-slot]").forEach((slot) => {
    slot.addEventListener("dragenter", (e) => allowDrop(e, slot));
    slot.addEventListener("dragover", (e) => allowDrop(e, slot));
    slot.addEventListener("dragleave", (e) => {
      if (!slot.contains(e.relatedTarget)) slot.classList.remove("drag-over");
    });
    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      slot.classList.remove("drag-over");
      const id = e.dataTransfer?.getData("text/plain") || dragId;
      if (!id) return;
      if (setupDropOntoSlot(you, id, slot.dataset.dropSlot)) refreshAfter();
    });
  });

  const bench = box.querySelector(".setup-pool-panel");
  if (bench) {
    bench.addEventListener("dragenter", (e) => allowDrop(e, bench));
    bench.addEventListener("dragover", (e) => allowDrop(e, bench));
    bench.addEventListener("dragleave", (e) => {
      if (!bench.contains(e.relatedTarget)) bench.classList.remove("drag-over");
    });
    bench.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      bench.classList.remove("drag-over");
      const id = e.dataTransfer?.getData("text/plain") || dragId;
      if (!id || !state.setup.selected.has(id)) return;
      state.setup.selected.delete(id);
      refreshAfter();
    });
  }

  // 暴露给 click：刚拖过就别触发点选
  box._setupDidDrag = () => dragged;
}

function renderSetupRoster() {
  const you = state.setup.you;
  const box = $("#setup-roster");
  const picked = you.players.filter((p) => state.setup.selected.has(p.id));
  // 5 人却空一格：通常是两人叠位，渲染前自动拆开
  resolveStarterPositionCollisions(picked);
  const slotMap = Object.fromEntries(POS_SLOTS.map((s) => [s.id, []]));
  for (const p of picked) {
    const pos = normalizePos(p.playPos || p.pos);
    (slotMap[pos] || slotMap.SF).push(p);
  }
  for (const s of POS_SLOTS) slotMap[s.id].sort(byOverallDesc);
  const pool = you.players.filter((p) => !state.setup.selected.has(p.id)).sort(byOverallDesc);
  const left = 5 - state.setup.selected.size;

  const slotsHtml = POS_SLOTS.map((s) => {
    const list = slotMap[s.id];
    if (!list.length) {
      return `<div class="setup-slot empty" data-drop-slot="${s.id}">
        <span class="slot-badge">${s.id}</span>
        <span class="slot-empty-hint">拖到这里</span>
      </div>`;
    }
    const p = list[0];
    return `<div class="setup-slot filled" data-drop-slot="${s.id}" data-id="${p.id}">
        <span class="slot-badge">${s.id}</span>
        ${setupMiniCardHtml(p, { onCourt: true })}
      </div>`;
  }).join("");

  box.innerHTML = `<div class="setup-lineup-board">
    <section class="setup-oncourt-panel">
      <header class="setup-panel-head">
        <h4>场上五人</h4>
        <span class="tiny">拖到格子换位 · 点一下也可下场</span>
      </header>
      <div class="setup-slots setup-slots-row">${slotsHtml}</div>
    </section>
    <section class="setup-pool-panel" data-drop-bench="1">
      <header class="setup-panel-head">
        <h4>替补席</h4>
        <span class="tiny">${
          left > 0 ? `拖到上方上场（还差 ${left}）` : "首发已满 · 拖到有人的格子可换人"
        }</span>
      </header>
      <div class="setup-pool">${
        pool.length
          ? pool.map((p) => setupMiniCardHtml(p, { onCourt: false })).join("")
          : `<p class="tiny">替补席空了</p>`
      }</div>
    </section>
  </div>`;

  $("#starter-count").textContent = String(state.setup.selected.size);
  const confirmBtn = $("#btn-setup-confirm");
  if (confirmBtn) {
    confirmBtn.disabled = state.setup.selected.size !== 5;
    confirmBtn.textContent =
      state.setup.selected.size === 5 ? "确认开打" : `再选 ${left} 人后开打`;
  }
  const noteEl = $("#setup-ball-note");
  const posNote = $("#setup-pos-note");
  if (noteEl) {
    if (picked.length < 2) {
      noteEl.hidden = true;
      noteEl.textContent = "";
    } else {
      const tacticId = [...($("#phil-tactics")?.querySelectorAll("input:checked") || [])][0]?.value;
      const tactic = TACTICS[tacticId] || null;
      const previewCoach = applyCoachPhilosophy(you.coach, {
        styleName: $("#phil-name")?.value || you.coach?.style,
        offense: Number($("#phil-off")?.value ?? you.coach?.buffs?.offense ?? 8),
        defense: Number($("#phil-def")?.value ?? you.coach?.buffs?.defense ?? 8),
        morale: Number($("#phil-morale")?.value ?? you.coach?.buffs?.morale ?? 8),
        stamina: Number($("#phil-stam")?.value ?? you.coach?.buffs?.stamina ?? 2),
        tactics: tacticId ? [tacticId] : you.coach?.specialTactics,
      });
      const primaryId = you.gameplan?.offenseFocusId || $("#setup-offense-focus")?.value || null;
      const ballOpts = { primaryId: primaryId || null };
      const ball = lineupBallNote(picked, ballOpts);
      const fit = lineupFit(picked, previewCoach, tactic, ballOpts);
      const chem = teamChemistry(picked, ballOpts);
      applyLineupPositionEffects(picked);
      noteEl.hidden = false;
      noteEl.textContent = `搭配参考：适配 ${fit} · 化学反应 ${chem}${ball ? " · " + ball : ""}`;
    }
  }
  if (posNote) {
    if (picked.length === 5) {
      const slots = POS_SLOTS.map((s) => {
        const who = slotMap[s.id][0];
        return who ? `${s.id} ${who.name}` : `${s.id} 空`;
      });
      const overlap = picked.length - new Set(picked.map((p) => normalizePos(p.playPos || p.pos))).size;
      posNote.textContent = overlap
        ? `有位置挤在一起了，把人拖开即可`
        : `首发已齐：${slots.join(" · ")}`;
    } else {
      posNote.textContent = `还差 ${left} 人 · 从替补席拖到空位`;
    }
  }

  const refreshAfter = () => {
    renderSetupRoster();
    renderSetupRoles();
    renderSetupOrders();
    if (state.setup?.you) {
      renderPhilTactics(state.setup.you);
      syncPhilRosterHint();
    }
  };

  bindSetupDragDrop(box, you, refreshAfter);

  box.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
    btn.onclick = (e) => {
      if (box._setupDidDrag?.()) return;
      if (e.target.closest(".setup-pos-select")) return;
      const id = btn.dataset.id;
      const p = you.players.find((x) => x.id === id);
      if (!isPlayerAvailable(p)) return;
      if (state.setup.selected.has(id)) {
        state.setup.selected.delete(id);
      } else if (state.setup.selected.size < 5) {
        const current = you.players.filter((x) => state.setup.selected.has(x.id));
        if (!p.playPosManual) {
          p.playPos = nextEmptyPlayPos(current, recommendPlayPos(p));
        } else {
          p.playPos = nextEmptyPlayPos(current, p.playPos || p.pos);
        }
        state.setup.selected.add(id);
        const five = you.players.filter((x) => state.setup.selected.has(x.id));
        if (five.length === 5) autoAssignUniquePositions(five);
      }
      refreshAfter();
    };
  });
  box.querySelectorAll(".setup-pos-select").forEach((sel) => {
    sel.onchange = (e) => {
      e.stopPropagation();
      const id = sel.getAttribute("data-pos-for");
      const p = you.players.find((x) => x.id === id);
      if (!p) return;
      markPlayPosManual(p, sel.value);
      const five = you.players.filter((x) => state.setup.selected.has(x.id));
      applyLineupPositionEffects(five.length ? five : you.players);
      refreshAfter();
    };
    sel.onclick = (e) => e.stopPropagation();
  });
}

$("#btn-setup-confirm").onclick = () => {
  if (state.setup.selected.size !== 5) return;
  const { home, away, youSide } = state.pendingMatch;
  const you = youSide === "home" ? home : away;
  const tactics = [...$("#phil-tactics").querySelectorAll("input:checked")].map((x) => x.value);
  you.coach = applyCoachPhilosophy(you.coach, {
    styleName: $("#phil-name").value || "自定义方针",
    offense: Number($("#phil-off").value),
    defense: Number($("#phil-def").value),
    morale: Number($("#phil-morale").value),
    stamina: Number($("#phil-stam").value),
    tactics: tactics.length ? tactics : ["balanced"],
    note: "玩家自定义执教方针",
  });
  you.starterIds = [...state.setup.selected];
  // Persist assigned playPos onto roster cards used by the sim
  for (const p of you.players) {
    if (state.setup.selected.has(p.id)) {
      p.playPos = normalizePos(p.playPos || p.pos);
    }
  }
  // Save gameplan matchup + full assignment board
  const defId = $("#gp-defender")?.value || null;
  const tgtId = $("#gp-target")?.value || null;
  const scheme = $("#gp-scheme")?.value || "focus";
  const assignments = readSetupMatchupAssignments();
  const focusId = $("#setup-offense-focus")?.value || null;
  const ballAction = $("#setup-ball-action")?.value || null;
  const tempoId = normalizeTempo($("#setup-tempo-select")?.value || you.gameplan?.tempo);
  const focusDef = defId || (tgtId && assignments[tgtId]) || null;
  you.gameplan = {
    matchup:
      tgtId || Object.keys(assignments).length
        ? {
            defenderId: focusDef,
            targetId: tgtId || null,
            scheme: tgtId ? scheme : null,
            assignments,
          }
        : null,
    matchupAssignments: assignments,
    offenseFocusId: focusId || null,
    tempo: tempoId,
  };
  ensurePlayerOrders(you.players);
  if (focusId) {
    const bp = you.players.find((x) => x.id === focusId);
    if (bp) {
      const act = ballAction && ballAction !== "auto" ? ballAction : suggestedBallHandlerAction(bp);
      bp.orders.action = act;
      const u = usageForBallAction(act);
      if (u && (bp.orders.usage === "auto" || !bp.orders.usage)) bp.orders.usage = u;
    }
  }
  you.lineupPacks = you.lineupPacks || autoBuildAllPacks(you.players);
  // Persist as season default rotation so next game / hub board stay in sync
  if (state.season) {
    persistSeasonRotationFromTeam(you, you.starterIds);
  }
  // CPU side auto starters (skip injured) + spread positions
  const opp = youSide === "home" ? away : home;
  if (!opp.starterIds) {
    const pool = opp.players.filter(isPlayerAvailable);
    const starters = [...(pool.length ? pool : opp.players)].sort((a, b) => overall(b) - overall(a)).slice(0, 5);
    autoAssignUniquePositions(starters);
    ensureRoles(opp.players);
    opp.starterIds = starters.map((p) => p.id);
  }
  beginGame(home, away, youSide);
};

// —— Game ——
function beginGame(homeTeam, awayTeam, youSide) {
  if (state.sim) state.sim.stop();
  show("game");
  state.lineupSig = "";
  state.subOutId = null;
  state.subInId = null;
  const feed = $("#play-feed");
  if (feed) feed.innerHTML = "";
  state.court = new CourtView($("#court-root"));
  state.court.ensureDom();

  $("#game-team-a").textContent = homeTeam.name;
  $("#game-team-b").textContent = awayTeam.name;
  $("#you-side").textContent = youSide === "home" ? homeTeam.name : awayTeam.name;

  const isDraftGame = state.mode === "draft" || state.mode === "duel" || state.mode === "custom";
  const injuryMode =
    state.mode === "career" ||
    state.mode === "tournament" ||
    state.career?.kind === "career" ||
    !!state.tournament;
  // Draft/duel: lock to real pace (1x). Other modes: default 1x, player can cycle 1→2→3.
  state.speed = 1;
  const speedBtn = $("#btn-speed");
  if (speedBtn) {
    speedBtn.hidden = isDraftGame;
    speedBtn.textContent = "速度 x1 · 真实";
    speedBtn.title = isDraftGame ? "选秀模式锁定真实比赛节奏" : "切换 1x真实 / 2x / 3x最快";
  }
  const quickBtn = $("#btn-quick-sim");
  if (quickBtn) {
    quickBtn.disabled = false;
    quickBtn.hidden = false;
  }
  // Keep last managed preference across tip-offs in the same session
  if (state.managed == null) state.managed = false;

  const sim = new GameSim({
    home: homeTeam,
    away: awayTeam,
    youSide,
    injuries: injuryMode,
    speed: state.speed,
    onEvent: (e) => handleSimEvent(e),
    onTick: (snap) => {
      try {
        paintScore(snap);
        paintLineups(snap);
        paintMeters(snap);
        fillSubSelects(snap);
        state.court?.render(snap);
        syncPauseUI(snap);
      } catch (err) {
        console.error("[ui] onTick", err);
      }
    },
    onEnd: (snap) => {
      syncInjuriesToTeams(sim, homeTeam, awayTeam);
      const formNotes = syncFormToTeams(sim, homeTeam, awayTeam);
      showResult(snap, { formNotes });
      if (state.career?.kind === "career") autosaveCareer();
      else clearSave();
      refreshSaveHomeBar();
    },
  });
  state.sim = sim;

  const you = youSide === "home" ? sim.home : sim.away;
  fillTacticSelect(you);
  syncLivePhilFromCoach(you.coach);
  initFocusAndPacksUI(homeTeam, awayTeam, youSide);

  // Start clock first so a court/UI paint error cannot leave the sim dead.
  if (state.managed) sim.setManaged(true);
  syncManagedUI();
  syncPauseUI(sim.snapshot());
  sim.start();

  try {
    const snap0 = sim.snapshot();
    paintScore(snap0);
    paintLineups(snap0);
    paintMeters(snap0);
    fillSubSelects(snap0, true);
    state.court.render(snap0);
  } catch (err) {
    console.error("[ui] initial paint", err);
  }
}

function handleSimEvent(e) {
  if (e?.type === "dunk" && e.meta?.player) {
    showDunkFlash(e.meta.player, e.meta.label || e.text);
    return;
  }
  pushFeed(e.type, e.text);
  try {
    paintScore(e);
  } catch (err) {
    console.error(err);
  }
}

function isDunkStarPlayer(p) {
  if (!p) return false;
  const sk = p.skills || [];
  if (
    sk.some((id) =>
      ["poster_slam", "mountain_slam", "lob_finisher", "spring_board", "coast_to_coast", "paint_bully"].includes(
        id
      )
    )
  ) {
    return true;
  }
  const tier = String(p.hiddenTier || "");
  if (/legend|hall|super|all.?nba|mvp/i.test(tier)) return true;
  return (p.scoring || 0) >= 90 || (p.paint || 0) >= 92;
}

let _dunkFlashTimer = null;

/** 扣篮高光：球员照片 + CSS 短动效（无版权灌篮 GIF 时的替代） */
function showDunkFlash(player, label = "暴扣") {
  const box = $("#dunk-flash");
  if (!box || !player) return;
  const star = isDunkStarPlayer(player);
  // 普通扣篮也弹，球星更大更久
  const tag = /空接/.test(label || "") ? "空接" : star ? "暴扣" : "灌篮";
  clearTimeout(_dunkFlashTimer);
  box.hidden = false;
  box.className = `dunk-flash show${star ? " star" : ""}`;
  box.innerHTML = `
    <div class="dunk-flash-card">
      <div class="dunk-flash-rim" aria-hidden="true"></div>
      <div class="dunk-flash-flyer">${photoImg(player, "dunk-flash-photo")}</div>
      <div class="dunk-flash-bang">${tag}</div>
      <div class="dunk-flash-name">${player.name || ""}</div>
      <div class="dunk-flash-sub">${String(label || "").slice(0, 28)}</div>
    </div>`;
  const ms = star ? 2200 : 1600;
  _dunkFlashTimer = setTimeout(() => {
    box.classList.remove("show", "star");
    box.hidden = true;
    box.innerHTML = "";
  }, ms);
}

function pushFeed(type, text) {
  const feed = $("#play-feed");
  if (!feed) return;
  if (type === "dunk") return;
  const div = document.createElement("div");
  div.className = `event ${
    type === "score"
      ? "score"
      : type === "coach"
        ? "coach"
        : type === "miss"
          ? "miss"
          : type === "reb"
            ? "reb"
            : ""
  }`;
  div.textContent = text;
  feed.prepend(div);
  while (feed.children.length > 40) feed.removeChild(feed.lastChild);
}

function paintScore(snap) {
  $("#score-a").textContent = snap.score.home;
  $("#score-b").textContent = snap.score.away;
  $("#quarter").textContent = snap.quarter > 4 ? "OT" : `Q${snap.quarter}`;
  $("#game-clock").textContent = fmtClock(snap.clock);
  $("#poss-label").textContent = snap.possession === "home" ? "主队进攻" : "客队进攻";
}

function hotClass(hot) {
  if (hot <= -2) return "hot-ice";
  if (hot === -1) return "hot-cold";
  if (hot >= 3) return "hot-fire";
  if (hot >= 2) return "hot-hot";
  return "";
}
function moodClass(mood) {
  if (mood >= 65) return "mood-up";
  if (mood <= 40) return "mood-down";
  return "";
}

function liveStatusLine(p, marked = false) {
  const fg = p.fgPct != null ? `${p.fgPct}%` : "—";
  const inj = p.injuredGames > 0 ? ` · <em class="inj">${p.injuryStatus || "伤停"}</em>` : "";
  const grade = p.grade || "C+";
  const gTone = p.gradeTone || "grade-c";
  const gTip = p.gradeLast ? ` title="最近：${escAttr(p.gradeLast)}"` : "";
  return `<li class="roster-line ${marked ? "marked" : ""}" data-id="${p.id}">
    ${photoImg(p)}
    <div class="live-line">
      <div class="main"><span class="live-grade ${gTone}"${gTip}>${grade}</span> ${p.playPos || p.pos} ${p.name} · ${p.stats.pts}分 ${p.stats.reb}板 ${p.stats.ast}助 ${p.stats.stl}断 ${p.stats.blk}帽 · 命中${fg} · 疲劳${p.fatigue}${p.fatigueNote ? `·${p.fatigueNote}` : ""}${p.ironLungs ? "·铁肺" : ""}${
        p.confidenceLabel ? ` · ${p.confidenceLabel}` : ""
      }${inj}</div>
      <div class="status">手感 <span class="${hotClass(p.hot)}">${p.hotLabel || "平稳"}</span> · 心情 <span class="${moodClass(p.mood)}">${p.moodLabel || "平静"}</span>${
        marked ? " · <strong>对位中</strong>" : ""
      }</div>
    </div>
  </li>`;
}

function paintLineups(snap) {
  const plan = snap.defensePlan || {};
  const markId = plan.targetId || null;
  const lineHome = (p) => liveStatusLine(p, snap.youSide === "away" && p.id === markId);
  const lineAway = (p) => liveStatusLine(p, snap.youSide === "home" && p.id === markId);
  // Always refresh live feel/mood (cheap: 10 rows)
  $("#oncourt-a").innerHTML = snap.home.onCourt.map(lineHome).join("");
  $("#oncourt-b").innerHTML = snap.away.onCourt.map(lineAway).join("");
  const aTitle = $("#lineup-a-title");
  const bTitle = $("#lineup-b-title");
  if (aTitle) aTitle.textContent = `${snap.home.name} 场上`;
  if (bTitle) bTitle.textContent = `${snap.away.name} 场上`;
  const aChem = $("#lineup-a-chem");
  const bChem = $("#lineup-b-chem");
  const youPrimary = snap.offenseFocusId || null;
  const aPrimary = snap.youSide === "home" ? youPrimary : null;
  const bPrimary = snap.youSide === "away" ? youPrimary : null;
  const aBall = lineupBallNote(snap.home.onCourt, { primaryId: aPrimary });
  const bBall = lineupBallNote(snap.away.onCourt, { primaryId: bPrimary });
  if (aChem) {
    aChem.textContent = `化学反应 ${snap.home.chem} · 士气 ${snap.home.morale} · 适配 ${snap.home.fit}${
      aBall ? ` · ${aBall}` : ""
    }`;
  }
  if (bChem) {
    bChem.textContent = `化学反应 ${snap.away.chem} · 士气 ${snap.away.morale} · 适配 ${snap.away.fit}${
      bBall ? ` · ${bBall}` : ""
    }`;
  }
  paintDefendTargets(snap);
  paintLiveMatchupBoard(snap);
  // Click opponent row to select as defend target
  const oppUl = snap.youSide === "home" ? $("#oncourt-b") : $("#oncourt-a");
  oppUl?.querySelectorAll("li[data-id]").forEach((li) => {
    li.style.cursor = "pointer";
    li.title = "点选设为对位策略目标";
    li.onclick = () => {
      const sel = $("#defend-target");
      if (sel) sel.value = li.dataset.id;
      const assigned = snap.defensePlan?.assignments?.[li.dataset.id];
      const defSel = $("#defend-defender");
      if (defSel && assigned) defSel.value = assigned;
      syncDefendHint({
        ...snap,
        defensePlan: {
          ...(snap.defensePlan || {}),
          targetId: li.dataset.id,
          defenderId: assigned || snap.defensePlan?.defenderId,
        },
      });
    };
  });
}

function paintMeters(snap) {
  const you = snap.youSide === "home" ? snap.home : snap.away;
  const opp = snap.youSide === "home" ? snap.away : snap.home;
  $("#morale").textContent = you.morale;
  $("#chem").textContent = you.chem;
  $("#fit").textContent = you.fit;
  $("#morale-bar").style.width = `${you.morale}%`;
  $("#chem-bar").style.width = `${you.chem}%`;
  $("#fit-bar").style.width = `${you.fit}%`;
  // Hover explanations on meters
  const moraleRow = $("#morale")?.parentElement;
  const chemRow = $("#chem")?.parentElement;
  const fitRow = $("#fit")?.parentElement;
  if (moraleRow) moraleRow.title = "士气：影响出手胆量与抗压；大喊/沟通/暂停可抬升";
  if (chemRow) chemRow.title = "化学反应：球星自负冲突会降；两人仍抢球才会因持球冲突拖累（设无球可化解）";
  if (fitRow) fitRow.title = "适配度：战术需求、站位、持球/无球搭配；无球能力差时火力会被间接削弱";
  const oc = $("#opp-chem");
  const om = $("#opp-morale");
  if (oc) oc.textContent = opp.chem;
  if (om) om.textContent = opp.morale;
  const ocb = $("#opp-chem-bar");
  const omb = $("#opp-morale-bar");
  if (ocb) ocb.style.width = `${opp.chem}%`;
  if (omb) omb.style.width = `${opp.morale}%`;
  const ballNote = $("#ball-fit-note");
  if (ballNote) {
    const youOn = you.onCourt || [];
    const note = lineupBallNote(youOn, { primaryId: snap.offenseFocusId || null });
    ballNote.textContent = note || "";
    ballNote.title = "可指定持球人与打法；两人仍抢球才会冲突，无球偏弱则火力略削";
  }
  syncDefendHint(snap);
  paintLivePositions(snap);
  paintMomentum(snap);
  paintPlayerOrders(snap);
}

function paintMomentum(snap) {
  const bar = $("#momentum-bar");
  const label = $("#momentum-label");
  const wrap = $("#momentum-meter");
  if (!bar || !label) return;
  const m = snap.momentum || {};
  const pts = m.points || 0;
  const pct = Math.min(100, pts * 8);
  bar.style.width = `${pct}%`;
  wrap?.classList.toggle("hot", pts >= 8);
  if (!m.side || pts < 4) {
    label.textContent = "平静";
    return;
  }
  const name = m.side === "home" ? snap.home.name : snap.away.name;
  label.textContent = `${name} 连得 ${pts}`;
}

function paintPlayerOrders(snap, { force = false } = {}) {
  const box = $("#player-orders-list");
  const focusSel = $("#offense-focus-select");
  const actionSel = $("#offense-ball-action");
  if (!box || !state.sim) return;
  const you = snap.youSide === "home" ? snap.home : snap.away;
  const on = you.onCourt || [];
  const sig =
    on.map((p) => `${p.id}:${JSON.stringify(p.orders || {})}`).join("|") +
    `|f:${snap.offenseFocusId || ""}|a:${actionSel?.value || ""}`;
  if (!force && box.dataset.sig === sig && document.activeElement?.closest?.("#player-orders-panel")) return;
  box.dataset.sig = sig;
  if (focusSel) {
    const focusId = snap.offenseFocusId;
    const stillOn = focusId && on.some((p) => p.id === focusId);
    focusSel.innerHTML =
      `<option value="">（不指定 · 按本能）</option>` +
      on.map((p) => `<option value="${p.id}">${p.playPos || p.pos} ${p.name}</option>`).join("");
    if (stillOn) {
      focusSel.value = focusId;
    } else {
      focusSel.value = "";
      // Stale focus (subbed out) — clear sim so UI matches floor
      if (focusId && state.sim?.offenseFocusId === focusId) state.sim.offenseFocusId = null;
    }
  }
  if (actionSel) {
    const focusId = focusSel?.value || "";
    const p = focusId ? on.find((x) => x.id === focusId) : null;
    fillBallActionSelect(actionSel, p ? suggestedBallHandlerAction(p) : "pnr");
    actionSel.disabled = !focusId || !state.sim.paused;
    if (!actionSel._ballBound) {
      actionSel._ballBound = true;
      actionSel.onchange = () => {
        /* applied on confirm */
      };
    }
  }
  box.innerHTML = on
    .map((p) => {
      const o = p.orders || {};
      return `<div class="order-row compact" data-id="${p.id}">
        <div class="order-name">${p.playPos || p.pos} ${p.name}
          <span class="tiny order-summary">${escAttr(ordersLabel(o) || "自由发挥")}</span>
        </div>
        <div class="order-group">
          <span class="order-group-label">进攻</span>
          <div class="order-controls">
            ${orderSelectHtml(ORDER_USAGE, o.usage || "auto", "ord-usage", "组织 / 得分 / 偏防守 / 蓝领冲抢")}
            ${orderSelectHtml(ORDER_AGGRESSION, o.aggression || "auto", "ord-agg", "攻击欲望 / 专注防守")}
            ${orderSelectHtml(ORDER_ACTION, o.action || "auto", "ord-action", "挡拆 / 无球 / 冲抢二次")}
            ${orderSelectHtml(ORDER_ATTACK, o.attack || "auto", "ord-attack", "终结 / 二次进攻")}
            ${orderSelectHtml(ORDER_HUNT, o.hunt || "auto", "ord-hunt", "抓机会")}
          </div>
        </div>
        <div class="order-group">
          <span class="order-group-label">防守</span>
          <div class="order-controls">
            ${orderSelectHtml(ORDER_DEF, o.defFocus || "auto", "ord-def", "领防 / 全力防守等")}
          </div>
        </div>
      </div>`;
    })
    .join("");
  const dead = !!state.sim.paused;
  box.querySelectorAll(".order-row").forEach((row) => {
    const id = row.dataset.id;
    row.querySelectorAll("select").forEach((sel) => {
      sel.disabled = !dead;
      sel.onchange = () => {
        if (!state.sim?.paused) {
          pushFeed("coach", "活球中不能改球员指令——请先暂停");
          return;
        }
        const key = sel.classList.contains("ord-usage")
          ? "usage"
          : sel.classList.contains("ord-agg")
            ? "aggression"
            : sel.classList.contains("ord-action")
              ? "action"
              : sel.classList.contains("ord-attack")
                ? "attack"
                : sel.classList.contains("ord-hunt")
                  ? "hunt"
                  : "defFocus";
        state.sim.setPlayerOrders(id, { [key]: sel.value });
        paintPlayerOrders(state.sim.snapshot(), { force: true });
        paintMeters(state.sim.snapshot());
      };
    });
  });
}

/** 沟通 → 展开个人进攻/防守指令 + 对位策略区 */
function openTalkStrategyPanel() {
  const panel = $("#player-orders-panel");
  if (panel) {
    panel.open = true;
    panel.classList.add("talk-focus");
  }
  const def = $("#defense-panel");
  if (def) def.classList.add("talk-focus");
  const hint = $("#talk-orders-hint");
  if (hint) {
    hint.textContent =
      "沟通中：先选持球发起人与打法并确认；再为其他人设无球定点/防守；下方可设对位盯防/包夹。";
  }
  if (state.sim) paintPlayerOrders(state.sim.snapshot(), { force: true });
  requestAnimationFrame(() => {
    panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  setTimeout(() => {
    panel?.classList.remove("talk-focus");
    def?.classList.remove("talk-focus");
  }, 2600);
}

function syncTacticHelp() {
  const sel = $("#tactic-select");
  const help = $("#tactic-help");
  if (!sel || !help) return;
  const t = TACTICS[sel.value];
  help.textContent = t?.desc || "选择战术后点「布置」立即生效。";
  help.title = t?.desc || "";
}

function initFocusAndPacksUI(homeTeam, awayTeam, youSide) {
  const src = youSide === "home" ? homeTeam : awayTeam;
  const you = state.sim?.you?.() || src;
  const packs = you.lineupPacks || src.lineupPacks || autoBuildAllPacks(src.players || []);
  if (state.sim?.you) state.sim.you().lineupPacks = packs;
  src.lineupPacks = packs;
  you.gameplan = you.gameplan || {};
  if (!you.gameplan.tempo) you.gameplan.tempo = "normal";
  const tempoSel = $("#tempo-select");
  fillTempoSelect(tempoSel, you.gameplan.tempo);
  syncTempoHelp($("#tempo-help"), you.gameplan.tempo);
  if (tempoSel) {
    tempoSel.onchange = () => syncTempoHelp($("#tempo-help"), tempoSel.value);
  }
  const focusSel = $("#focus-play-select");
  if (focusSel) {
    focusSel.innerHTML =
      `<option value="">（无重点）</option>` +
      FOCUS_PLAYS.map((f) => `<option value="${f.id}" title="${escAttr(f.desc)}">${f.name}</option>`).join("");
  }
  const packBox = $("#live-packs");
  if (packBox) {
    packBox.innerHTML = LINEUP_PACK_DEFS.map(
      (d) =>
        `<button type="button" class="btn small" data-live-pack="${d.id}" title="${escAttr(d.hint)}">${d.name}</button>`
    ).join("");
    packBox.querySelectorAll("[data-live-pack]").forEach((btn) => {
      btn.onclick = () => {
        if (!state.sim?.paused) {
          pushFeed("coach", "活球中不能切阵容包——请先暂停或等到节间");
          return;
        }
        const ids = state.sim.you().lineupPacks?.[btn.dataset.livePack];
        if (!ids) return;
        state.sim.applyLineupPack(ids);
        const snap = state.sim.snapshot();
        paintLineups(snap);
        fillSubSelects(snap, true);
        paintMeters(snap);
      };
    });
  }
}

function syncLivePhilFromCoach(coach) {
  const b = coach?.buffs || {};
  const map = [
    ["live-phil-off", "live-phil-off-v", b.offense ?? 8],
    ["live-phil-def", "live-phil-def-v", b.defense ?? 8],
    ["live-phil-morale", "live-phil-morale-v", b.morale ?? 8],
    ["live-phil-stam", "live-phil-stam-v", b.stamina ?? 2],
  ];
  for (const [id, vid, val] of map) {
    const el = $(`#${id}`);
    const v = $(`#${vid}`);
    if (el) el.value = val;
    if (v) v.textContent = String(val);
  }
}

function paintLivePositions(snap) {
  const box = $("#pos-live-list");
  if (!box || !state.sim) return;
  const you = snap.youSide === "home" ? snap.home : snap.away;
  const order = ["PG", "SG", "SF", "PF", "C"];
  const onCourt = [...(you.onCourt || [])].sort((a, b) => {
    const da = order.indexOf(normalizePos(a.playPos || a.pos));
    const db = order.indexOf(normalizePos(b.playPos || b.pos));
    return da - db || byOverallDesc(a, b);
  });
  const sig = onCourt.map((p) => `${p.id}:${p.playPos || p.pos}`).join("|");
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const dead = !!state.sim?.paused;
  box.innerHTML = onCourt
    .map((p) => {
      const nat = p.pos || "?";
      const cur = normalizePos(p.playPos || p.pos);
      return `<div class="pos-live-row">
        <span class="pos-live-name">
          <span class="slot-badge live">${cur}</span>
          ${photoImg(p, "headshot sm")}
          <span>${p.name}<em class="tiny">本职 ${nat}</em></span>
        </span>
        ${posChipsHtml(p, { dataKey: "data-live-pos" })}
      </div>`;
    })
    .join("");
  box.querySelectorAll(".pos-chip").forEach((chip) => {
    chip.disabled = !dead;
    chip.onclick = () => {
      if (!state.sim?.paused) {
        pushFeed("coach", "活球中不能调站位——请先叫暂停或等到节间");
        return;
      }
      const wrap = chip.closest(".pos-chips");
      const id = wrap?.getAttribute("data-live-pos");
      if (!id) return;
      state.sim.setPlayPos(id, chip.dataset.pos);
      box.dataset.sig = "";
      const s = state.sim.snapshot();
      paintMeters(s);
      paintLineups(s);
      fillSubSelects(s, true);
    };
  });
}

function paintDefendTargets(snap) {
  const sel = $("#defend-target");
  if (!sel) return;
  const opp = snap.youSide === "home" ? snap.away : snap.home;
  const prev = sel.value;
  const planId = snap.defensePlan?.targetId || "";
  sel.innerHTML = opp.onCourt
    .map((p) => {
      const tip = `${p.hotLabel}/${p.moodLabel}${p.strength >= 70 ? "·壮" : p.strength <= 55 ? "·瘦" : ""}`;
      return `<option value="${p.id}">${p.playPos || p.pos} ${p.name}（${p.stats.pts}分 · ${tip}）</option>`;
    })
    .join("");
  if (planId && [...sel.options].some((o) => o.value === planId)) sel.value = planId;
  else if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function syncDefendHint(snap) {
  const hint = $("#defend-hint");
  if (!hint) return;
  const plan = snap.defensePlan || {};
  const you = snap.youSide === "home" ? snap.home : snap.away;
  const opp = snap.youSide === "home" ? snap.away : snap.home;
  const assignN = Object.keys(plan.assignments || {}).length;
  const assignBit = assignN ? `对位表 ${assignN} 人` : "对位表未设";
  if (!plan.scheme || !plan.targetId) {
    hint.textContent = `${assignBit} · 未布置重点策略`;
    return;
  }
  const t = opp.onCourt.find((p) => p.id === plan.targetId) || opp.roster?.find((p) => p.id === plan.targetId);
  const d =
    (plan.defenderId && you.onCourt.find((p) => p.id === plan.defenderId)) ||
    (plan.defenderId && you.roster?.find((p) => p.id === plan.defenderId));
  const names = { focus: "重点盯防", double: "包夹", bump: "下盘顶防" };
  hint.textContent = t
    ? `${assignBit} · ${d ? d.name + " " : ""}对 ${t.name}「${names[plan.scheme] || plan.scheme}」· 手感${t.hotLabel}`
    : `${assignBit} · ${names[plan.scheme] || plan.scheme}`;
}

function playerSubCard(p, selected, { onCourt = false } = {}) {
  const slot = normalizePos(p.playPos || p.pos);
  const tips = topIntangibles(p, 2)
    .map((t) => `${t.name}${t.value}`)
    .join(" ");
  const hurt = p.injuredGames > 0;
  // On-court injured MUST stay clickable so you can sub them out;
  // bench injured cannot check back in.
  const lockedOut = hurt && !onCourt;
  const fg = p.fgPct != null ? `${p.fgPct}%` : "—";
  const status = onCourt
    ? hurt
      ? `场上伤 · ${slot}`
      : `场上 ${slot}`
    : hurt
      ? `伤停 · 本职 ${p.pos}`
      : `场下 · 本职 ${p.pos}`;
  // div 而非 button：卡内要嵌 PG–C 芯片
  return `<div class="sub-card ${selected ? "selected" : ""} ${hurt ? "injured" : ""} ${
    onCourt ? "on-court" : "bench"
  } ${hurt && onCourt ? "must-sub" : ""}" data-id="${p.id}" data-hurt="${hurt ? "1" : "0"}" role="button" tabindex="${
    lockedOut ? -1 : 0
  }" ${lockedOut ? 'aria-disabled="true"' : ""}>
    <span class="setup-status-tag ${onCourt ? "up" : "down"} ${hurt ? "inj" : ""}">${status}</span>
    ${photoImg(p, "headshot sm")}
    <div class="sub-card-body">
      <strong><span class="live-grade ${p.gradeTone || "grade-c"}">${p.grade || "C+"}</span> ${p.name}</strong>
      <div class="tiny">OVR ${p.overall ?? overall(p)} · ${p.season} · 疲劳${p.fatigue ?? 0}${
        p.fatigueNote ? `·${p.fatigueNote}` : ""
      }${p.ironLungs ? " · 铁肺" : ""}${hurt ? ` · <em class="inj">${p.injuryStatus || "伤停"}</em>` : ""}</div>
      <div class="tiny">手感 ${p.hotLabel || "平稳"} · 心情 ${p.moodLabel || "平静"} · 命中${fg}${
        p.gradeLast ? ` · ${p.gradeLast}` : ""
      }</div>
      <div class="tiny">攻${p.scoring} 防${p.defense} 传${p.pass} 板${p.rebound} · ${tips}</div>
      <div class="tiny">${p.stats ? `${p.stats.pts}分 ${p.stats.reb}板 ${p.stats.ast}助` : ""}</div>
      ${
        hurt && onCourt
          ? `<div class="tiny inj">需换下——点选后选健康板凳确认换人</div>`
          : ""
      }
      ${
        onCourt && !hurt
          ? `<div class="sub-pos-row">
              <span class="tiny">改打</span>
              ${posChipsHtml(p, { dataKey: "data-sub-pos" })}
            </div>`
          : ""
      }
    </div>
  </div>`;
}

function fillSubSelects(snap, force = false) {
  const outBox = $("#sub-out-list");
  const inBox = $("#sub-in-list");
  if (!outBox || !inBox) return;
  const you = snap.youSide === "home" ? snap.home : snap.away;
  const order = ["PG", "SG", "SF", "PF", "C"];
  const onCourt = [...(you.onCourt || [])].sort((a, b) => {
    const da = order.indexOf(normalizePos(a.playPos || a.pos));
    const db = order.indexOf(normalizePos(b.playPos || b.pos));
    return da - db || byOverallDesc(a, b);
  });
  const bench = [...(you.bench || [])].sort(byOverallDesc);
  const feelSig = onCourt
    .map((p) => `${p.id}:${p.playPos || p.pos}:${p.hot}:${p.mood}:${p.fatigue}`)
    .join(",");
  const dead = !!state.sim?.paused;
  const sig = [
    ...onCourt.map((p) => `${p.id}:${p.playPos || p.pos}`),
    "|",
    ...bench.map((p) => p.id),
    "|",
    feelSig,
    "|",
    dead ? "1" : "0",
  ].join(",");
  if (!force && outBox.dataset.sig === sig) {
    return;
  }
  outBox.dataset.sig = sig;
  // keep selection if still valid
  if (!onCourt.some((p) => p.id === state.subOutId)) state.subOutId = null;
  if (!bench.some((p) => p.id === state.subInId && !(p.injuredGames > 0))) state.subInId = null;
  // Auto-highlight injured on-court player so they're ready to be swapped out
  const mustSit = onCourt.find((p) => p.injuredGames > 0);
  if (mustSit && !state.subOutId) state.subOutId = mustSit.id;

  outBox.innerHTML = onCourt
    .map((p) => playerSubCard(p, p.id === state.subOutId, { onCourt: true }))
    .join("");
  inBox.innerHTML = bench.length
    ? bench.map((p) => playerSubCard(p, p.id === state.subInId, { onCourt: false })).join("")
    : `<p class="tiny">板凳无人</p>`;

  const bindSubPick = (box, which) => {
    box.querySelectorAll(".sub-card").forEach((card) => {
      const hurt = card.dataset.hurt === "1";
      const onFloor = card.classList.contains("on-court");
      // Bench injured: never selectable. On-court injured: must be selectable.
      if (hurt && !onFloor) return;
      card.classList.toggle("sub-card-locked", !dead);
      card.onclick = (e) => {
        if (e.target.closest(".pos-chip")) return;
        if (!state.sim?.paused) {
          pushFeed("coach", "活球中不能换人——请先叫暂停或等到节间");
          return;
        }
        if (which === "out") state.subOutId = card.dataset.id;
        else state.subInId = card.dataset.id;
        fillSubSelects(state.sim.snapshot(), true);
      };
    });
  };
  bindSubPick(outBox, "out");
  bindSubPick(inBox, "in");

  outBox.querySelectorAll(".pos-chip").forEach((chip) => {
    chip.disabled = !dead;
    chip.onclick = (e) => {
      e.stopPropagation();
      if (!state.sim?.paused) {
        pushFeed("coach", "活球中不能调站位——请先叫暂停或等到节间");
        return;
      }
      const wrap = chip.closest(".pos-chips");
      const id = wrap?.getAttribute("data-sub-pos");
      if (!id) return;
      state.sim.setPlayPos(id, chip.dataset.pos);
      const liveBox = $("#pos-live-list");
      if (liveBox) liveBox.dataset.sig = "";
      outBox.dataset.sig = "";
      const s = state.sim.snapshot();
      paintMeters(s);
      paintLineups(s);
      paintLivePositions(s);
      fillSubSelects(s, true);
    };
  });

  const ready = !!(state.subOutId && state.subInId);
  $("#btn-sub").disabled = !dead || !ready;
  const injuredOn = onCourt.filter((p) => p.injuredGames > 0).length;
  const injuredBench = you.bench.filter((p) => p.injuredGames > 0).length;
  const healthyBench = you.bench.filter((p) => !(p.injuredGames > 0)).length;
  $("#sub-pick-hint").textContent = !dead
    ? injuredOn
      ? `场上有 ${injuredOn} 人伤病——先暂停/等到节间，把他换下来`
      : "活球中不可换人/改位——叫暂停或等到节间"
    : injuredOn && healthyBench
      ? `⚠ ${mustSit?.name || "伤员"}不能继续——已选中下场，再点一名健康板凳后确认换人`
      : injuredOn && !healthyBench
        ? "⚠ 场上有伤员，但板凳没有健康球员可换"
        : ready
          ? "已选好，可确认换人"
          : injuredBench
            ? `点选场上 + 健康板凳换人（伤停 ${injuredBench} 人不能上场）`
            : "点选场上 + 板凳换人；场上球员卡可点 PG–C 改打位置";
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function syncPauseUI(snap) {
  const paused = !!(snap?.paused ?? state.sim?.paused);
  const reason = snap?.breakReason ?? state.sim?.breakReason;
  const resumeBtn = $("#btn-resume");
  const hint = $("#pause-hint");
  const liveHint = $("#live-action-hint");
  const panel = $("#deadball-panel");
  if (resumeBtn) {
    resumeBtn.hidden = !paused;
    resumeBtn.classList.toggle("pulse", paused);
  }
  if (hint) {
    hint.hidden = !paused;
    if (paused) {
      const labels = {
        timeout: "暂停窗口——双方都可以调整。改完点「继续比赛」。",
        quarter: "节间休息——恢复 25 点疲劳。可调整战术、沟通、换人与站位。",
        half: "中场休息——恢复 50 点疲劳。可调整战术与阵容。",
        manual: "模拟已暂停——可调整后点「继续比赛」。",
        injury: "有人受伤——请立刻把伤员换下，再点「继续比赛」。",
      };
      hint.textContent = labels[reason] || "死球窗口——可调整后点「继续比赛」。";
    }
  }
  if (liveHint) liveHint.hidden = !!paused;
  if (panel) {
    panel.classList.toggle("locked", !paused);
    panel.classList.toggle("open-window", !!paused);
  }
  const liveSkills = $("#live-skill-panel");
  if (liveSkills) {
    const showSkills = state.career?.kind === "career";
    liveSkills.hidden = !showSkills;
    if (showSkills && paused) renderCareerSkillShop(state.career);
  }
  syncCoachActionLocks(paused);
  const pauseSim = $("#btn-pause-sim");
  if (pauseSim) pauseSim.textContent = paused ? "继续模拟" : "暂停模拟";
}

/** Live ball: only shout + call timeout. Dead ball: tactics / talk / subs / scheme. */
function syncCoachActionLocks(paused) {
  const live = !!state.sim && !paused;
  const dead = !!state.sim && !!paused;
  const setDis = (sel, on) => {
    const el = $(sel);
    if (el) el.disabled = !!on;
  };
  setDis("#btn-shout", !live); // 活球专用
  setDis("#btn-timeout", !live);
  setDis("#btn-talk", !dead);
  setDis("#btn-set-tactic", !dead);
  setDis("#tactic-select", !dead);
  setDis("#btn-set-focus", !dead);
  setDis("#focus-play-select", !dead);
  setDis("#btn-set-tempo", !dead);
  setDis("#tempo-select", !dead);
  setDis("#btn-set-offense-focus", !dead);
  setDis("#offense-focus-select", !dead);
  setDis("#btn-live-phil", !dead);
  $("#player-orders-list")?.querySelectorAll("select").forEach((s) => {
    s.disabled = !dead;
  });
  $("#live-packs")?.querySelectorAll("button").forEach((b) => {
    b.disabled = !dead;
  });
  $("#live-skill-panel")?.querySelectorAll("button, select").forEach((el) => {
    el.disabled = !dead;
  });
  setDis("#live-phil-off", !dead);
  setDis("#live-phil-def", !dead);
  setDis("#live-phil-morale", !dead);
  setDis("#live-phil-stam", !dead);
  setDis("#defend-target", !dead);
  setDis("#btn-defend-focus", !dead);
  setDis("#btn-defend-double", !dead);
  setDis("#btn-defend-bump", !dead);
  setDis("#btn-defend-clear", !dead);
  // Sub confirm still needs picks; base lock when live
  const subBtn = $("#btn-sub");
  if (subBtn && !dead) subBtn.disabled = true;
  $("#pos-live-list")?.querySelectorAll("select").forEach((s) => {
    s.disabled = !dead;
  });
  $("#sub-out-list")?.querySelectorAll("button").forEach((b) => {
    if (!b.classList.contains("injured")) b.disabled = !dead;
  });
  $("#sub-in-list")?.querySelectorAll("button").forEach((b) => {
    if (!b.classList.contains("injured")) b.disabled = !dead;
  });
}

function resumeGame() {
  if (!state.sim) return;
  state.sim.setPaused(false);
  syncPauseUI(state.sim.snapshot());
  pushFeed("coach", "继续比赛！");
  // Kick a paint so court/clock refresh immediately after resume
  try {
    const snap = state.sim.snapshot();
    paintScore(snap);
    state.court?.render(snap);
  } catch (_) {
    /* ignore */
  }
}

$("#btn-timeout").onclick = () => {
  if (!state.sim || state.sim.paused) return;
  // 托管开着时也允许你亲自叫停；暂停会停住（助手不再自动续上）
  if (state.sim.managed) {
    pushFeed("coach", "你叫了暂停——本回合由你指挥；托管仍开着，节间还会自动处理");
  }
  state.sim.callTimeout();
  syncPauseUI(state.sim.snapshot());
  const resumeBtn = $("#btn-resume");
  if (resumeBtn) {
    resumeBtn.hidden = false;
    resumeBtn.focus();
  }
};
$("#btn-resume").onclick = () => resumeGame();
$("#btn-shout").onclick = () => {
  if (!state.sim || state.sim.paused) {
    pushFeed("coach", "大喊是活球手段——停表时请用「沟通」或改战术");
    return;
  }
  state.sim.shout();
};
$("#btn-talk").onclick = () => {
  if (!state.sim?.paused) {
    pushFeed("coach", "活球中不能沟通——请先叫暂停或等到节间");
    return;
  }
  state.sim.talk();
  openTalkStrategyPanel();
  paintMeters(state.sim.snapshot());
};
$("#btn-set-tactic").onclick = () => {
  if (!state.sim?.paused) {
    pushFeed("coach", "活球中不能改战术——请先叫暂停或等到节间");
    return;
  }
  state.sim.setTactic($("#tactic-select").value);
  syncTacticHelp();
  fillSubSelects(state.sim.snapshot(), true);
};
$("#btn-set-tempo")?.addEventListener("click", () => {
  if (!state.sim?.paused) {
    pushFeed("coach", "活球中不能改节奏——请先叫暂停或等到节间");
    return;
  }
  const id = normalizeTempo($("#tempo-select")?.value);
  state.sim.setTempo(id);
  syncTempoHelp($("#tempo-help"), id);
});
$("#btn-set-focus")?.addEventListener("click", () => {
  if (!state.sim?.paused) {
    pushFeed("coach", "活球中不能设回合重点——请先叫暂停或等到节间");
    return;
  }
  const id = $("#focus-play-select")?.value;
  if (!id) {
    state.sim.focusPlay = null;
    pushFeed("coach", "已取消回合重点");
    return;
  }
  state.sim.setFocusPlay(id);
  const f = FOCUS_PLAYS.find((x) => x.id === id);
  const help = $("#focus-help");
  if (help && f) help.textContent = f.desc;
});
$("#btn-set-offense-focus")?.addEventListener("click", () => {
  if (!state.sim?.paused) {
    pushFeed("coach", "活球中不能改持球布置——请先叫暂停或等到节间");
    return;
  }
  const id = $("#offense-focus-select")?.value || null;
  const action = $("#offense-ball-action")?.value || null;
  state.sim.setOffenseFocus(id || null, id ? { action, forceUsage: true } : {});
  paintPlayerOrders(state.sim.snapshot(), { force: true });
  paintMeters(state.sim.snapshot());
});

$("#offense-focus-select")?.addEventListener("change", () => {
  const id = $("#offense-focus-select")?.value;
  const actionSel = $("#offense-ball-action");
  if (!actionSel) return;
  if (!id) {
    actionSel.disabled = true;
    return;
  }
  const snap = state.sim?.snapshot();
  const you = snap?.youSide === "home" ? snap.home : snap?.away;
  const p = you?.onCourt?.find((x) => x.id === id);
  fillBallActionSelect(actionSel, p ? suggestedBallHandlerAction(p) : "pnr");
  actionSel.disabled = !state.sim?.paused;
});
$("#tactic-select")?.addEventListener("change", syncTacticHelp);

["live-phil-off", "live-phil-def", "live-phil-morale", "live-phil-stam"].forEach((id) => {
  $(`#${id}`)?.addEventListener("input", () => {
    const v = $(`#${id}-v`);
    if (v) v.textContent = $(`#${id}`).value;
  });
});

$("#btn-live-phil")?.addEventListener("click", () => {
  if (!state.sim?.paused) {
    pushFeed("coach", "活球中不能改方针——请先叫暂停或等到节间");
    return;
  }
  state.sim.applyPhilosophy({
    styleName: "临场调整",
    offense: Number($("#live-phil-off").value),
    defense: Number($("#live-phil-def").value),
    morale: Number($("#live-phil-morale").value),
    stamina: Number($("#live-phil-stam").value),
  });
  const snap = state.sim.snapshot();
  paintMeters(snap);
  paintLineups(snap);
});

function applyDefenseScheme(scheme) {
  if (!state.sim?.paused) {
    pushFeed("coach", "活球中不能改对位——请先叫暂停或等到节间");
    return;
  }
  const targetId = $("#defend-target")?.value;
  const defenderId = $("#defend-defender")?.value || null;
  if (!scheme) {
    state.sim.clearDefenseScheme();
  } else if (targetId) {
    state.sim.setDefenseScheme(scheme, targetId, defenderId || undefined);
  }
  const snap = state.sim.snapshot();
  paintLiveMatchupBoard(snap);
  paintLineups(snap);
  paintMeters(snap);
}
$("#btn-defend-focus")?.addEventListener("click", () => applyDefenseScheme("focus"));
$("#btn-defend-double")?.addEventListener("click", () => applyDefenseScheme("double"));
$("#btn-defend-bump")?.addEventListener("click", () => applyDefenseScheme("bump"));
$("#btn-defend-clear")?.addEventListener("click", () => applyDefenseScheme(null));
$("#btn-sub").onclick = () => {
  if (!state.sim?.paused) {
    pushFeed("coach", "活球中不能换人——请先叫暂停或等到节间");
    return;
  }
  if (!state.subOutId || !state.subInId) return;
  state.sim.substitute(state.subOutId, state.subInId);
  state.subOutId = null;
  state.subInId = null;
  state.lineupSig = "";
  const snap = state.sim.snapshot();
  fillTacticSelect(state.sim.you(), { preferId: state.sim.you()?.tactic?.id });
  fillSubSelects(snap, true);
  paintPlayerOrders(snap, { force: true });
  paintLivePositions(snap);
  paintDefendTargets(snap);
  paintLineups(snap);
  paintMeters(snap);
};
$("#btn-pause-sim").onclick = () => {
  if (!state.sim) return;
  if (state.sim.paused) resumeGame();
  else {
    state.sim.setPaused(true, "manual");
    state.sim.forceOutInjured(state.sim.you());
    state.sim.forceOutInjured(state.sim.opp());
    const snap = state.sim.snapshot();
    syncPauseUI(snap);
    fillSubSelects(snap, true);
    paintLineups(snap);
    pushFeed("coach", "模拟已暂停——可调整后点「继续比赛」恢复");
  }
};
$("#btn-save-game")?.addEventListener("click", () => saveProgress());
$("#btn-save-leave")?.addEventListener("click", () => {
  if (!state.sim) return;
  if (confirm("保存当前比赛并返回首页？回来可在「继续进度」接着打。")) {
    saveProgress({ andGoHome: true });
  }
});
$("#btn-save-draft")?.addEventListener("click", () => saveProgress());
$("#btn-save-setup")?.addEventListener("click", () => saveProgress());
$("#btn-save-legend")?.addEventListener("click", () => saveProgress());
$("#btn-save-market")?.addEventListener("click", () => saveProgress());
$("#btn-continue-save")?.addEventListener("click", () => continueFromSave());
$("#btn-clear-save")?.addEventListener("click", () => {
  if (!hasSave()) return;
  if (confirm("确定丢弃已保存的进度？此操作无法撤销。")) {
    clearSave();
    refreshSaveHomeBar();
  }
});
window.addEventListener("beforeunload", (e) => {
  try {
    if (state.career?.kind === "career") autosaveCareer();
    else if (state.sim?.paused) saveProgress({ silent: true });
  } catch (_) {
    /* ignore */
  }
  if (!state.sim || !state.sim.running) return;
  e.preventDefault();
  e.returnValue = "";
});
$("#btn-speed").onclick = () => {
  if (!state.sim) return;
  if (state.mode === "draft" || state.mode === "duel" || state.mode === "custom") return;
  state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
  state.sim.setSpeed(state.speed);
  const label = state.speed === 1 ? "真实" : state.speed === 2 ? "加速" : "最快";
  $("#btn-speed").textContent = `速度 x${state.speed} · ${label}`;
};

function syncManagedUI() {
  const on = state.sim ? !!state.sim.managed : !!state.managed;
  state.managed = on;
  const btn = $("#btn-managed");
  const hint = $("#managed-hint");
  if (btn) {
    btn.disabled = !state.sim;
    btn.textContent = on ? "智能托管：开" : "智能托管：关";
    btn.classList.toggle("primary", on);
    btn.classList.toggle("ghost", !on);
    btn.title = on
      ? "点击关闭托管，重新由你指挥（叫暂停不会被助手立刻续上）"
      : "FIFA 式智能托管：累了换人，节间自动处理；你仍可叫暂停接手";
  }
  if (hint) {
    hint.textContent = on
      ? "托管中：自动轮换/盯防 · 节间中场自动继续 · 你点「叫暂停」会停住并由你指挥"
      : "托管关闭时由你亲自指挥。可随时开启，类似 FIFA 助理教练。";
  }
}

// 用 onclick 覆盖，避免脚本重复加载时叠多个 listener 导致「点关又弹开」
$("#btn-managed").onclick = () => {
  if (!state.sim) {
    pushFeed("coach", "比赛开始后才能开关智能托管");
    return;
  }
  const next = !state.sim.managed;
  state.sim.setManaged(next);
  state.managed = next;
  syncManagedUI();
  if (!next && state.sim.paused) {
    syncPauseUI(state.sim.snapshot());
    pushFeed("coach", "托管已关——可继续调整，或点「继续比赛」");
  }
};

/** Instant-sim the rest of the live game with auto rotation on both sides. */
$("#btn-quick-sim").onclick = () => {
  const sim = state.sim;
  if (!sim || !sim.running) return;
  const ok = window.confirm(
    "将用当前阵容、战术与指令立刻打完剩余比赛。\n" +
      (sim.managed
        ? "智能托管会继续自动轮换并调整基本攻防。\n"
        : "将自动轮换疲劳球员（建议先开智能托管以获得更完整的临场调整）。\n") +
      "期间无法再手动干预。确定？"
  );
  if (!ok) return;
  const btn = $("#btn-quick-sim");
  if (btn) btn.disabled = true;
  // Quiet sim still benefits from manager logic if enabled
  if (!sim.managed) {
    sim.setManaged(true);
    state.managed = true;
    syncManagedUI();
    pushFeed("coach", "快速模拟已临时开启智能托管");
  }
  pushFeed("coach", "快速模拟整场——托管助手接管剩余比赛…");
  try {
    const snap = sim.runFast();
    // finish() already fires onEnd → showResult; refresh once if still on live
    if (sim.running === false && snap) {
      try {
        paintScore(snap);
        paintLineups(snap);
        paintMeters(snap);
      } catch (_) {
        /* result screen may already own the DOM */
      }
    }
  } catch (err) {
    console.error("[quick-sim]", err);
    pushFeed("coach", "快速模拟失败，请继续手动/加速观赛");
    if (btn) btn.disabled = false;
  }
};

/** Write in-game injury flags back onto the persistent team cards. */
function syncInjuriesToTeams(sim, homeTeam, awayTeam) {
  if (!sim) return;
  const syncSide = (simTeam, srcTeam) => {
    if (!simTeam || !srcTeam?.players) return;
    for (const p of simTeam.roster) {
      if (!(p.injuredGames > 0)) continue;
      const src = srcTeam.players.find((x) => x.id === p.id);
      if (src) {
        src.injuredGames = p.injuredGames;
        src.injuryStatus = p.injuryStatus || "伤停";
      }
    }
  };
  syncSide(sim.home, homeTeam);
  syncSide(sim.away, awayTeam);
}

/** Result CTAs: keep「再来一局」; on win also show「备战下一轮」as primary. */
function setResultActionMode(mode, { showContinue = false, continuePrimary = false } = {}) {
  const again = $("#btn-again");
  const cont = $("#btn-result-continue");
  again.hidden = false;
  again.textContent = "再来一局";
  cont.hidden = !showContinue;
  const useContinuePrimary = showContinue && continuePrimary;
  cont.classList.toggle("primary", useContinuePrimary);
  again.classList.toggle("primary", !useContinuePrimary);
}

function renderResultExplain(snap) {
  const box = $("#result-explain");
  if (!box) return;
  let summary;
  try {
    summary = summarizeMatchResult(snap);
  } catch {
    box.hidden = true;
    return;
  }
  const pctText = (value) => `${(value * 100).toFixed(0)}%`;
  const sideLabel = (side) => (side === "home" ? snap.home.name : snap.away.name);
  const rows = ["home", "away"].map((side) => {
    const totals = summary.teamTotals[side];
    const shoot = summary.shooting[side];
    const top = summary.topPerformers[side];
    const pm = summary.plusMinus[side];
    return `<div class="result-explain-team">
      <strong>${sideLabel(side)}</strong>
      <span>命中率 ${pctText(shoot.fg)} · 三分 ${pctText(shoot.tp)} · 罚球 ${pctText(shoot.ft)}</span>
      <span>失误 ${totals.tov} · 前场篮板 ${totals.oreb}</span>
      ${top ? `<span>最佳表现：${top.name}（${top.pts}分 ${top.reb}板 ${top.ast}助攻）</span>` : ""}
      ${pm.best ? `<span>+/- 最高：${pm.best.name} ${pm.best.pm >= 0 ? "+" : ""}${pm.best.pm}</span>` : ""}
    </div>`;
  }).join("");
  const factors = summary.factors.length
    ? `<ul>${summary.factors.map((line) => `<li>${line}</li>`).join("")}</ul>`
    : `<p class="tiny">比赛各项数据较为接近，胜负更多取决于关键回合的质量。</p>`;
  box.innerHTML = `<h3>赛后解析</h3><div class="result-explain-grid">${rows}</div>${factors}`;
  box.hidden = false;
}

function showResult(snap, { formNotes = [] } = {}) {
  show("result");
  const hs = snap.score.home;
  const as = snap.score.away;
  $("#result-score").textContent = `${hs} - ${as}`;
  const youSide = snap.youSide;
  const youScore = youSide === "home" ? hs : as;
  const oppScore = youSide === "home" ? as : hs;
  const youWin = youScore > oppScore;
  const winner = hs === as ? "平局" : hs > as ? snap.home.name : snap.away.name;
  $("#result-title").textContent = hs === as ? "加时仍平——以模拟终局计" : `${winner} 获胜`;
  const formBit = formNotes?.length
    ? `本场表现已写入自信/战术地位：${formNotes.slice(0, 3).join("；")}${
        formNotes.length > 3 ? "…" : ""
      }`
    : "本场表现会带入下一场：打得好更敢投、队友更愿意喂球。";
  $("#result-summary").textContent = `化学反应 / 适配度 / 暗属性影响了回合效率。${formBit}`;
  renderResultExplain(snap);
  renderResultAllTeam(null);
  $("#box-score").innerHTML = `${boxTable(snap.home)}${boxTable(snap.away)}`;

  const cont = $("#btn-result-continue");
  cont.hidden = true;
  setResultActionMode("quick");

  if (isSeasonProgressMode(state.mode) && state.season && state.seasonPendingGame) {
    handleSeasonResult(snap);
    return;
  }
  if (state.tournament) {
    setResultActionMode("tournament", { showContinue: true, continuePrimary: true });
    applyTournamentResult(snap);
    return;
  }
  if (state.career?.kind === "ranked") {
    handleRankedResult(youWin);
    return;
  }
  if (state.career?.kind === "career") {
    handleCareerResult(youWin, snap);
    return;
  }
  if (state.career?.kind === "duel") {
    setResultActionMode("duel", { showContinue: true, continuePrimary: true });
    cont.hidden = false;
    cont.textContent = "备战再战";
    cont.onclick = () => {
      // reward both lightly; winner more
      state.career.goldA += youSide === "home" ? (youWin ? 350 : 120) : youWin ? 120 : 350;
      state.career.goldB += youSide === "away" ? (youWin ? 350 : 120) : youWin ? 120 : 350;
      openMarket({ duel: true, afterWin: true });
    };
  }
}

// —— Season mode (82 + playoffs + awards) ——
/** @type {'modern'|'historical'} */
let seasonSetupMode = "modern";
let seasonSetupYear = 1991;
let seasonSetupKind = "season";

function syncSeasonModeUi() {
  const yearRow = $("#season-year-row");
  const intro = $("#season-setup-intro");
  const modernBtn = $("#btn-season-mode-modern");
  const histBtn = $("#btn-season-mode-hist");
  if (modernBtn) modernBtn.classList.toggle("primary", seasonSetupMode === "modern");
  if (histBtn) histBtn.classList.toggle("primary", seasonSetupMode === "historical");
  if (yearRow) yearRow.hidden = seasonSetupMode !== "historical";
  if (intro) {
    intro.innerHTML =
      seasonSetupMode === "historical"
        ? `回到选定年份：联盟是<strong>当年全部球队与真实阵容</strong>（如 1990-91 共 27 队，公牛是乔丹班底）。你执教拉斯维加斯插入东区，先打满 <strong>82 场常规赛</strong>，再进季后赛；只有公牛杀进总决赛，才有机会在总决赛碰到乔丹夺冠。`
        : `联盟扩军至 32 队：你执教可命名的<strong>拉斯维加斯</strong>扩军队，西雅图<strong>超音速</strong>回归西部。打满 82 场后评奖，再进季后赛。也可切「历史赛季」穿越回过去整年征程。`;
  }
  refreshSeasonYearBlurb();
}

function ensureSeasonYearSelect() {
  const sel = $("#season-year-select");
  if (!sel || sel.options.length) return;
  const years = listHistoricalYears().slice().reverse();
  for (const y of years) {
    const h = historicalSeason(y);
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = h ? `${h.label}（${y}）· ${h.teamCount} 队` : String(y);
    sel.appendChild(opt);
  }
  if (!HISTORICAL_YEARS.includes(seasonSetupYear)) {
    seasonSetupYear = years[0] || 1991;
  }
  sel.value = String(seasonSetupYear);
  sel.onchange = () => {
    seasonSetupYear = Number(sel.value) || 1991;
    refreshSeasonYearBlurb();
    syncSeasonStartButtonLabel();
  };
}

function refreshSeasonYearBlurb() {
  const el = $("#season-year-blurb");
  if (!el) return;
  if (seasonSetupMode !== "historical") {
    el.textContent = "";
    return;
  }
  const h = historicalSeason(seasonSetupYear);
  if (!h) {
    el.textContent = "无该年数据";
    return;
  }
  el.textContent = `${h.label} · 当年 ${h.teamCount} 支球队真实阵容 · 打满 82 场常规赛后再进季后赛；总决赛对手由本存档战绩决定，不剧透史实冠军。`;
}

function openSeasonScreen() {
  show("season");
  ensureSeasonYearSelect();
  syncSeasonModeUi();
  syncSeasonStartButtonLabel();
  const existing = state.season || loadSeason();
  const resumeBtn = $("#btn-season-resume");
  if (existing && existing.phase !== "done") {
    state.season = existing;
    if (resumeBtn) {
      resumeBtn.hidden = false;
      resumeBtn.textContent = `继续：${seasonProgressLabel(existing)}`;
    }
  } else if (resumeBtn) {
    resumeBtn.hidden = true;
  }
  $("#season-setup-panel").hidden = false;
  $("#season-hub-panel").hidden = true;
  if (!state.seasonRosterDraft) {
    $("#season-roster-hint").textContent = "请选择阵容来源（至少 8 人）。";
    $("#season-roster-preview").innerHTML = "";
    $("#btn-season-start").disabled = true;
  } else {
    previewSeasonRoster(state.seasonRosterDraft);
  }
}

function previewSeasonRoster(team) {
  state.seasonRosterDraft = team;
  const box = $("#season-roster-preview");
  const hint = $("#season-roster-hint");
  if (!team?.players?.length) {
    box.innerHTML = "";
    hint.textContent = "阵容无效，请重选。";
    $("#btn-season-start").disabled = true;
    return;
  }
  const sorted = [...team.players].sort((a, b) => overall(b) - overall(a));
  box.innerHTML = sorted
    .slice(0, 12)
    .map(
      (p) =>
        `<div class="chip">${p.pos || ""} ${p.name}<div class="tiny">OVR ${overall(p)} · ${p.season}</div></div>`
    )
    .join("");
  hint.textContent = `已选 ${team.players.length} 人 · 教练 ${team.coach?.name || "—"}`;
  $("#btn-season-start").disabled = team.players.length < 8;
}

function renderSeasonHub({ persist = true } = {}) {
  const st = prepareSeasonState(state.season);
  if (!st) return;
  state.season = st;
  $("#season-setup-panel").hidden = true;
  $("#season-hub-panel").hidden = false;
  const you = st.teams[st.userTeamId];
  const pay = payrollSummary(you);
  const eraTitle =
    st.mode === "historical" && st.league?.yearLabel
      ? `${st.league.yearLabel} 历史赛季`
      : `${st.year} 赛季`;
  $("#season-hub-title").textContent = `${you?.name || "我方"} · ${eraTitle}`;
  const histNote =
    st.mode === "historical" ? ` · ${seasonTeamIds(st).length} 队当年阵容` : "";
  $("#season-hub-meta").textContent = `${seasonProgressLabel(st)}${histNote} · 薪资 ${formatSalary(pay.payroll)}/${SEASON_SALARY_CAP}${
    pay.overCap ? "（超软帽）" : ""
  } · 空间 ${formatSalary(pay.space)}`;

  const nextCard = $("#season-next-card");
  const nextEl = $("#season-next-match");
  if (st.phase === "regular") {
    advanceToUserGame(st, { stopBeforeUser: true });
    const info = nextUserGame(st);
    nextCard.hidden = false;
    if (info) {
      const g = info.game;
      const home = st.teams[g.homeId]?.name;
      const away = st.teams[g.awayId]?.name;
      const played = userGamesPlayed(st);
      nextEl.textContent = `第 ${played + 1}/82 场 · ${home} vs ${away}（日程日 ${info.day + 1}）`;
      $("#btn-season-play").disabled = false;
      $("#btn-season-sim-one").disabled = false;
      $("#btn-season-sim-week").disabled = false;
    } else {
      nextEl.textContent = "常规赛已打完——查看评奖后进入季后赛";
      $("#btn-season-play").disabled = true;
      $("#btn-season-sim-one").disabled = true;
      $("#btn-season-sim-week").disabled = true;
      if (!st.awards && st.phase === "regular") {
        /* advanceToUserGame may set awards */
      }
    }
  } else if (st.phase === "awards") {
    nextCard.hidden = false;
    nextEl.textContent = "常规赛结束。已生成赛季评奖，可进入季后赛。";
    $("#btn-season-play").disabled = true;
    $("#btn-season-sim-one").disabled = true;
    $("#btn-season-sim-week").disabled = true;
  } else if (st.phase === "playoffs" || st.phase === "done") {
    nextCard.hidden = false;
    const champ = st.playoffs?.championId
      ? st.teams[st.playoffs.championId]?.name
      : null;
    if (st.phase === "done") {
      nextEl.textContent = champ
        ? isManagedCareer(state.leagueCareer)
          ? `总冠军：${champ}。可进入休赛期选秀，完成选择后开启 ${Number(st.year) + 1} 赛季。`
          : `总冠军：${champ}。可进入休赛期：球员按史实生涯成长/衰老，并开启 ${Number(st.year) + 1} 赛季。`
        : isManagedCareer(state.leagueCareer)
          ? "赛季结束。可进入休赛期选秀。"
          : "赛季结束。可进入休赛期让球员按史实潜力成长。";
    } else {
      nextEl.textContent = champ ? `总冠军：${champ}` : "季后赛进行中——可一键模拟剩余轮次";
    }
    $("#btn-season-play").disabled = true;
    $("#btn-season-sim-one").disabled = true;
    $("#btn-season-sim-week").disabled = true;
  }

  renderSeasonStandings();
  renderSeasonRotation();
  renderSeasonMarket();
  renderSeasonSchedule();
  renderSeasonAwards();
  renderSeasonPlayoffs();
  renderLeagueManagement();
  const managed = isManagedCareer(state.leagueCareer);
  document.querySelectorAll(
    '[data-season-tab="draftBoard"], [data-season-tab="development"], [data-season-tab="history"]',
  ).forEach((button) => {
    button.hidden = !managed;
  });
  if (persist && !saveSeasonAndCareer(st)) return;
}

function renderLeagueManagement() {
  const career = state.leagueCareer;
  const teamNames = Object.fromEntries(
    Object.entries(state.season?.teams || {}).map(([id, team]) => [id, team.name || id]),
  );
  renderDraftBoard(
    $("#season-draft-board"),
    { career, teamNames },
    {
      prepareDraft() {
        if (!isManagedCareer(state.leagueCareer) || !confirm("确认结束本赛季并进入休赛期选秀？")) return;
        try {
          const next = runCareerTransition(
            state.leagueCareer,
            prepareCareerOffseason,
          );
          commitManagedCareer(next, "draftBoard");
        } catch (error) {
          alert(error?.message || "无法进入休赛期选秀");
        }
      },
      pickProspect(prospectId, options) {
        try {
          const next = runCareerTransition(
            state.leagueCareer,
            (working) =>
              reconcileDevelopmentPlans(
                makeCareerDraftPick(working, prospectId, options),
              ),
          );
          commitManagedCareer(next, "draftBoard");
        } catch (error) {
          alert(error?.message || "无法完成这次选秀");
        }
      },
      completeOffseason() {
        try {
          const completed = completeCareerOffseason(state.leagueCareer);
          if (!commitManagedCareer(completed.career, "standings")) return;
          queueNextTimeTravelEvent();
          const highlights = (completed.result?.log || [])
            .filter((entry) => entry.delta > 0 || (entry.salaryAfter || 0) > (entry.salaryBefore || 0) + 10)
            .slice(0, 8);
          const retirements = (completed.result?.log || [])
            .filter((entry) => entry.retired)
            .map((entry) => `${entry.name} 退役`);
          const summary = highlights.length
            ? highlights
                .map((entry) => `${entry.name} OVR ${entry.before}→${entry.after}`)
                .join("\n")
            : "本队本轮成长与续约变化较小。";
          const retiredSummary = retirements.length
            ? `\n\n本队退役：\n${retirements.join("\n")}`
            : "";
          alert(`已进入 ${completed.result?.year || state.season?.year} 赛季。\n\n休赛期亮点：\n${summary}${retiredSummary}`);
        } catch (error) {
          alert(error?.message || "无法开始新赛季");
        }
      },
    },
  );
  renderDevelopmentPlans(
    $("#season-development"),
    { career },
    {
      savePlan(bref, plan) {
        try {
          const next = setDevelopmentPlan(state.leagueCareer, bref, {
            ...plan,
            source: "manual",
          });
          commitManagedCareer(next, "development");
        } catch (error) {
          alert(error?.message || "无法保存发展方案");
        }
      },
      recommendPlans() {
        try {
          commitManagedCareer(
            recommendDevelopmentPlans(state.leagueCareer),
            "development",
          );
        } catch (error) {
          alert(error?.message || "无法生成发展建议");
        }
      },
    },
  );
  renderCareerHistory($("#season-history"), { career });
}

function renderSeasonRotation() {
  const st = state.season;
  const box = $("#season-rotation");
  if (!st || !box) return;
  const you = st.teams[st.userTeamId];
  if (!you?.players?.length) {
    box.innerHTML = `<p class="tiny">暂无阵容</p>`;
    return;
  }
  ensureRoles(you.players);
  ensurePlayerOrders(you.players);
  if (!you.rotation) you.rotation = captureRotationPlan(you, you.starterIds);
  const starters = new Set(you.starterIds || you.rotation?.starterIds || []);
  const tactics = coachTactics(you.coach || { specialTactics: ["balanced"] });
  const focusId = you.gameplan?.offenseFocusId || you.rotation?.offenseFocusId || "";
  const tacticId = you.coach?.specialTactics?.[0] || tactics[0]?.id || "balanced";
  const sorted = [...you.players].sort(
    (a, b) => (b.targetMinutes || 0) - (a.targetMinutes || 0) || overall(b) - overall(a)
  );
  const totalMin = sorted.reduce((s, p) => s + (Number(p.targetMinutes) || 0), 0);
  const chem = teamChemistry(sorted.slice(0, 8));
  const fit = lineupFit(
    sorted.filter((p) => starters.has(p.id)).slice(0, 5),
    you.coach,
    TACTICS[tacticId]
  );

  const rows = sorted
    .map((p) => {
      const role = p.roleExpectation || inferPlayerRole(p);
      const roleOpts = Object.values(PLAYER_ROLES)
        .map((r) => `<option value="${r.id}" ${r.id === role ? "selected" : ""}>${r.name}</option>`)
        .join("");
      const recPos = recommendPlayPos(p);
      const posOpts = POS_SLOTS.map(
        (s) =>
          `<option value="${s.id}" ${normalizePos(p.playPos || p.pos) === s.id ? "selected" : ""}>${s.id}${
            s.id === recPos ? "（推荐）" : ""
          }</option>`
      ).join("");
      const cap = staminaMinuteCap(p);
      const over = (p.targetMinutes || 0) > cap;
      const starter = starters.has(p.id);
      return `<div class="rot-row ${starter ? "starter" : ""} ${over ? "over-min" : ""}" data-id="${p.id}">
        <label class="rot-starter" title="默认首发"><input type="checkbox" class="rot-start-cb" ${
          starter ? "checked" : ""
        } />首发</label>
        <div class="rot-name">
          <strong>${p.pos} ${p.name}</strong>
          <div class="tiny">OVR ${overall(p)} · ${p.season} · ${staminaMinuteHint(p)}</div>
        </div>
        <select class="rot-pos" title="上场位置">${posOpts}</select>
        <select class="rot-role" title="角色">${roleOpts}</select>
        <input class="rot-min" type="number" min="8" max="48" value="${p.targetMinutes ?? 24}" title="目标分钟" />
      </div>`;
    })
    .join("");

  box.innerHTML = `
    <div class="sm-cap-card">
      <h4>默认轮换 · 实验板</h4>
      <p class="tiny">设定首发、位置、角色、目标分钟与持球人；会在每场「亲自指挥」时自动套用。可反复改了再打，用来磨合。体能差的人不宜长期 35+ 分钟。</p>
      <p>目标分钟合计 <strong>${totalMin}</strong> · 首发适配 ${fit ?? "—"} · 化学反应 ${chem ?? "—"}</p>
      <div class="form-row wrap" style="margin-top:8px">
        <label class="tiny">默认战术
          <select id="rot-tactic">${tactics
            .map((t) => `<option value="${t.id}" ${t.id === tacticId ? "selected" : ""}>${esc(t.name)}</option>`)
            .join("")}</select>
        </label>
        <label class="tiny">默认持球人
          <select id="rot-focus">
            <option value="">（不指定）</option>
            ${sorted
              .map(
                (p) =>
                  `<option value="${p.id}" ${p.id === focusId ? "selected" : ""}>${esc(p.name)}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button type="button" class="btn small" id="btn-rot-suggest">按体能建议分钟</button>
        <button type="button" class="btn small" id="btn-rot-top5">OVR 前五当首发</button>
        <button type="button" class="btn primary small" id="btn-rot-save">保存默认轮换</button>
      </div>
    </div>
    <div class="rot-list">${rows}</div>
  `;

  box.querySelectorAll(".rot-row").forEach((row) => {
    const p = you.players.find((x) => x.id === row.dataset.id);
    if (!p) return;
    row.querySelector(".rot-start-cb").onchange = () => {
      const on = row.querySelector(".rot-start-cb").checked;
      let ids = [...(you.starterIds || [])];
      if (on) {
        if (ids.length >= 5 && !ids.includes(p.id)) {
          row.querySelector(".rot-start-cb").checked = false;
          alert("默认首发最多 5 人");
          return;
        }
        if (!ids.includes(p.id)) ids.push(p.id);
      } else {
        ids = ids.filter((id) => id !== p.id);
      }
      you.starterIds = ids.slice(0, 5);
      renderSeasonRotation();
    };
    row.querySelector(".rot-pos").onchange = (e) => {
      markPlayPosManual(p, e.target.value);
    };
    row.querySelector(".rot-role").onchange = (e) => {
      p.roleExpectation = e.target.value;
      p._roleManual = true;
      p.targetMinutes = suggestTargetMinutes(p);
      renderSeasonRotation();
    };
    row.querySelector(".rot-min").onchange = (e) => {
      p.targetMinutes = clamp(Number(e.target.value) || 20, 8, 48);
      renderSeasonRotation();
    };
  });
  $("#rot-tactic")?.addEventListener("change", (e) => {
    if (!you.coach) return;
    you.coach.specialTactics = [e.target.value];
  });
  $("#rot-focus")?.addEventListener("change", (e) => {
    you.gameplan = you.gameplan || {};
    you.gameplan.offenseFocusId = e.target.value || null;
  });
  $("#btn-rot-suggest")?.addEventListener("click", () => {
    for (const p of you.players) p.targetMinutes = suggestTargetMinutes(p);
    renderSeasonRotation();
  });
  $("#btn-rot-top5")?.addEventListener("click", () => {
    const top = [...you.players].sort((a, b) => overall(b) - overall(a)).slice(0, 5);
    autoAssignUniquePositions(top);
    you.starterIds = top.map((p) => p.id);
    renderSeasonRotation();
  });
  $("#btn-rot-save")?.addEventListener("click", () => {
    if ((you.starterIds || []).length && you.starterIds.length !== 5) {
      if (!confirm(`当前标记了 ${you.starterIds.length} 名首发（建议 5 人）。仍保存？`)) return;
    }
    you.rotation = captureRotationPlan(you, you.starterIds);
    if (!saveSeasonAndCareer(st)) return;
    alert("默认轮换已保存。下场「亲自指挥」会自动套用首发/分钟/位置/核心。");
    renderSeasonRotation();
  });
}

function renderSeasonMarket() {
  const st = state.season;
  const box = $("#season-market");
  if (!st || !box) return;
  prepareSeasonState(st);
  const you = st.teams[st.userTeamId];
  const pay = payrollSummary(you);
  const locked = st.phase !== "regular";

  if (locked) {
    box.innerHTML = `<p class="tiny">自由市场 / 裁人 / 交易仅在<strong>常规赛</strong>期间开放。当前阶段：${st.phase}</p>`;
    return;
  }

  const rosterRows = [...(you.players || [])]
    .sort((a, b) => overall(b) - overall(a))
    .map((p) => {
      const sal = playerSalary(p);
      return `<div class="sm-row">
        <div>
          <strong>${p.playPos || p.pos} ${p.name}</strong>
          <div class="tiny">OVR ${overall(p)} · ${p.season} · ${salaryLine(p)}</div>
        </div>
        <button type="button" class="btn small ghost sm-cut" data-cut="${p.id}">裁掉</button>
      </div>`;
    })
    .join("");

  const fa = [...(st.freeAgents || [])].sort((a, b) => overall(b) - overall(a));
  const faRows = fa
    .slice(0, 48)
    .map((p) => {
      const sal = playerSalary(p);
      const can =
        you.players.length < SEASON_MAX_ROSTER &&
        pay.payroll + sal <= SEASON_APRON &&
        !(pay.payroll >= SEASON_SALARY_CAP && sal > 90);
      const upside = historicalUpsideHint(p);
      return `<div class="sm-row">
        <div>
          <strong>${p.pos} ${p.name}</strong>
          <div class="tiny">OVR ${overall(p)} · ${p.season} · 要价 ${formatSalary(sal)}</div>
          <div class="tiny">${marketMeta(p)}</div>
          ${upside ? `<div class="tiny season-pick-upside">${upside}</div>` : ""}
        </div>
        <button type="button" class="btn small primary sm-sign" data-sign="${p.id}" ${
        can ? "" : "disabled"
      }>签约</button>
      </div>`;
    })
    .join("");

  const cpuOpts = Object.keys(st.teams)
    .filter((id) => id !== st.userTeamId)
    .map((id) => ({ id, name: st.teams[id].name || id }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh"))
    .map((t) => `<option value="${t.id}">${t.name}</option>`)
    .join("");

  const myOpts = [...(you.players || [])]
    .sort((a, b) => overall(b) - overall(a))
    .map(
      (p) =>
        `<option value="${p.id}">${p.name} · OVR ${overall(p)} · ${formatSalary(playerSalary(p))}</option>`
    )
    .join("");

  refreshStaffMarket(st);
  const hc = you.coach;
  const asst = you.assistant;
  const staffCoaches = st.staffMarket?.coaches || [];
  const staffAssts = st.staffMarket?.assistants || [];
  const staffNow = `
    <div class="sm-row">
      <div>
        <strong>主教练 · ${hc ? esc(hc.name) : "空缺"}</strong>
        <div class="tiny">${
          hc
            ? `${esc(coachRecordLabel(hc))} · ${esc(staffMarketLabel(hc))} · 年薪 ${formatSalary(staffSalary(hc))}`
            : "可从下方应聘名单签约"
        }</div>
      </div>
      ${hc ? `<button type="button" class="btn small ghost" id="btn-sm-fire-coach">解聘</button>` : ""}
    </div>
    <div class="sm-row">
      <div>
        <strong>助教 · ${asst ? esc(asst.name) : "空缺"}</strong>
        <div class="tiny">${
          asst
            ? `${esc(staffMarketLabel(asst))} · 年薪 ${formatSalary(staffSalary(asst))}`
            : "可从下方应聘名单签约"
        }</div>
      </div>
      ${asst ? `<button type="button" class="btn small ghost" id="btn-sm-fire-asst">解聘</button>` : ""}
    </div>`;
  const coachFaRows = staffCoaches
    .map((c) => {
      const sal = staffSalary(c);
      const delta = sal - staffSalary(hc);
      const can = pay.payroll + delta <= SEASON_APRON;
      return `<div class="sm-row">
        <div>
          <strong>${esc(c.name)}</strong>
          <span class="chip tiny">${esc(c.style || "主帅")}</span>
          <div class="tiny">${c.season || ""} · ${esc(coachRecordLabel(c))} · 要价 ${formatSalary(sal)}</div>
          <div class="tiny">${esc(staffMarketLabel(c))}</div>
          <div class="tiny">${esc(c.note || "")}</div>
        </div>
        <button type="button" class="btn small primary sm-hire-coach" data-hire-coach="${c.id}" ${
        can ? "" : "disabled"
      }>${hc ? "换帅" : "聘用"}${can ? "" : "·超帽"}</button>
      </div>`;
    })
    .join("");
  const asstFaRows = staffAssts
    .map((a) => {
      const sal = staffSalary(a);
      const delta = sal - staffSalary(asst);
      const can = pay.payroll + delta <= SEASON_APRON;
      return `<div class="sm-row">
        <div>
          <strong>${esc(a.name)}</strong>
          <span class="chip tiny">${esc(a.role || "助教")}</span>
          <div class="tiny">${a.season || ""} · 要价 ${formatSalary(sal)}</div>
          <div class="tiny">${esc(staffMarketLabel(a))}</div>
          <div class="tiny">${esc(a.note || "")}</div>
        </div>
        <button type="button" class="btn small primary sm-hire-asst" data-hire-asst="${a.id}" ${
        can ? "" : "disabled"
      }>${asst ? "更换" : "聘用"}${can ? "" : "·超帽"}</button>
      </div>`;
    })
    .join("");

  box.innerHTML = `
    <div class="sm-cap-card">
      <h4>工资帽</h4>
      <p>名单 <strong>${pay.n}</strong>/${SEASON_MAX_ROSTER}（最少 ${SEASON_MIN_ROSTER}）·
        薪资 <strong>${formatSalary(pay.payroll)}</strong> /
        软帽 ${SEASON_SALARY_CAP} /
        硬帽 ${SEASON_APRON}</p>
      <p class="tiny">球员 ${formatSalary(pay.playersPay || 0)} · 主帅 ${formatSalary(pay.coachPay || 0)} · 助教 ${formatSalary(
        pay.asstPay || 0
      )} · 剩余空间 ${formatSalary(pay.space)} · 硬帽余量 ${formatSalary(pay.apronRoom)}${
        pay.overCap ? " · 已超软帽：只能签迷你合同或先腾空间" : ""
      }</p>
    </div>
    <section class="sm-staff">
      <header class="sm-fa-head">
        <h4>教练组 · 应聘 / 自由市场</h4>
        <button type="button" class="btn small" id="btn-sm-refresh-staff">刷新教练市场</button>
      </header>
      <p class="tiny">主教练与助教年薪计入工资帽。解聘后对方回到应聘池；换帅/换助教会顶替现任。主教练或助教空缺时出战会自动随机 roll 补齐教练组。</p>
      <div class="sm-list">${staffNow}</div>
      <div class="sm-cols" style="margin-top:10px">
        <section>
          <h4 class="tiny">主帅应聘</h4>
          <div class="sm-list sm-fa-list">${coachFaRows || "<p class='tiny'>暂无</p>"}</div>
        </section>
        <section>
          <h4 class="tiny">助教应聘</h4>
          <div class="sm-list sm-fa-list">${asstFaRows || "<p class='tiny'>暂无</p>"}</div>
        </section>
      </div>
    </section>
    <div class="sm-cols">
      <section>
        <h4>我的阵容 · 裁人</h4>
        <div class="sm-list">${rosterRows || "<p class='tiny'>空</p>"}</div>
      </section>
      <section>
        <header class="sm-fa-head">
          <h4>球员自由市场 · 签约</h4>
          <button type="button" class="btn small" id="btn-sm-refresh-fa">刷新自由市场</button>
        </header>
        <p class="tiny">受薪资空间与硬帽限制。可一边打常规赛赛程一边补强。</p>
        <div class="sm-list sm-fa-list">${faRows || "<p class='tiny'>暂无</p>"}</div>
      </section>
    </div>
    <section class="sm-trade">
      <h4>交易（1 换 1）</h4>
      <p class="tiny">薪资大致匹配；对方会评估战力。交易后继续打当赛季赛程。</p>
      <div class="form-row">
        <label>我方送出
          <select id="sm-trade-give">${myOpts}</select>
        </label>
        <label>对手球队
          <select id="sm-trade-cpu">${cpuOpts}</select>
        </label>
        <label>对方球员
          <select id="sm-trade-want"></select>
        </label>
        <button type="button" class="btn primary" id="btn-sm-trade">提出交易</button>
      </div>
      <p class="tiny" id="sm-trade-hint"></p>
    </section>
  `;

  const fillCpuPlayers = () => {
    const tid = $("#sm-trade-cpu")?.value;
    const sel = $("#sm-trade-want");
    if (!sel || !tid) return;
    const cpu = st.teams[tid];
    sel.innerHTML = [...(cpu?.players || [])]
      .sort((a, b) => overall(b) - overall(a))
      .map(
        (p) =>
          `<option value="${p.id}">${p.name} · OVR ${overall(p)} · ${formatSalary(playerSalary(p))}</option>`
      )
      .join("");
  };
  fillCpuPlayers();
  $("#sm-trade-cpu")?.addEventListener("change", fillCpuPlayers);

  box.querySelectorAll(".sm-cut").forEach((btn) => {
    btn.onclick = () => {
      const p = you.players.find((x) => x.id === btn.dataset.cut);
      if (!p || !confirm(`确定裁掉 ${p.name}（${formatSalary(playerSalary(p))}）？他将进入自由市场。`)) return;
      const res = cutPlayer(st, p.id);
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      if (isManagedCareer(state.leagueCareer)) {
        state.leagueCareer = reconcileDevelopmentPlans(state.leagueCareer);
        state.season = state.leagueCareer.season;
      }
      if (!saveSeasonAndCareer(st)) return;
      renderSeasonHub();
      showSeasonTab("market");
    };
  });
  box.querySelectorAll(".sm-sign").forEach((btn) => {
    btn.onclick = () => {
      const res = signFreeAgent(st, btn.dataset.sign);
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      if (!saveSeasonAndCareer(st)) return;
      renderSeasonHub();
      showSeasonTab("market");
    };
  });
  $("#btn-sm-refresh-fa")?.addEventListener("click", () => {
    refreshFreeAgency(st, { force: true });
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonMarket();
    showSeasonTab("market");
  });
  $("#btn-sm-refresh-staff")?.addEventListener("click", () => {
    refreshStaffMarket(st, { force: true });
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonMarket();
    showSeasonTab("market");
  });
  $("#btn-sm-fire-coach")?.addEventListener("click", () => {
    if (!confirm(`解聘主教练 ${hc?.name || ""}？他将回到应聘池。`)) return;
    const res = fireCoach(st);
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonHub();
    showSeasonTab("market");
  });
  $("#btn-sm-fire-asst")?.addEventListener("click", () => {
    if (!confirm(`解聘助教 ${asst?.name || ""}？`)) return;
    const res = fireAssistant(st);
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonHub();
    showSeasonTab("market");
  });
  box.querySelectorAll(".sm-hire-coach").forEach((btn) => {
    btn.onclick = () => {
      const res = hireCoach(st, btn.dataset.hireCoach);
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      if (!saveSeasonAndCareer(st)) return;
      renderSeasonHub();
      showSeasonTab("market");
    };
  });
  box.querySelectorAll(".sm-hire-asst").forEach((btn) => {
    btn.onclick = () => {
      const res = hireAssistant(st, btn.dataset.hireAsst);
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      if (!saveSeasonAndCareer(st)) return;
      renderSeasonHub();
      showSeasonTab("market");
    };
  });
  $("#btn-sm-trade")?.addEventListener("click", () => {
    const giveId = $("#sm-trade-give")?.value;
    const wantId = $("#sm-trade-want")?.value;
    const cpuId = $("#sm-trade-cpu")?.value;
    const res = executeTrade(st, { giveIds: [giveId], wantIds: [wantId], cpuTeamId: cpuId });
    const hint = $("#sm-trade-hint");
    if (!res.ok) {
      if (hint) hint.textContent = res.reason;
      alert(res.reason);
      return;
    }
    if (hint) hint.textContent = res.message;
    if (isManagedCareer(state.leagueCareer)) {
      state.leagueCareer = reconcileDevelopmentPlans(state.leagueCareer);
      state.season = state.leagueCareer.season;
    }
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonHub();
    showSeasonTab("market");
  });
}

function renderSeasonSchedule() {
  const st = state.season;
  const box = $("#season-schedule");
  if (!st || !box) return;
  const upcoming = upcomingUserGames(st, 20);
  const recent = (st.resultsLog || [])
    .filter((r) => r.homeId === st.userTeamId || r.awayId === st.userTeamId)
    .slice(-12)
    .reverse();

  const upHtml = upcoming.length
    ? `<table class="season-table"><thead><tr><th>日</th><th>对阵</th><th></th></tr></thead><tbody>${upcoming
        .map(
          (g) =>
            `<tr><td>${g.day + 1}</td><td>${g.home} vs ${g.away}</td><td>${
              g.homeGame ? "主场" : "客场"
            }</td></tr>`
        )
        .join("")}</tbody></table>`
    : `<p class="tiny">暂无未打赛程（常规赛可能已结束）</p>`;

  const recentHtml = recent.length
    ? `<table class="season-table"><thead><tr><th>日</th><th>结果</th><th></th></tr></thead><tbody>${recent
        .map((r, i) => {
          const home = st.teams[r.homeId]?.name || r.homeId;
          const away = st.teams[r.awayId]?.name || r.awayId;
          const youHome = r.homeId === st.userTeamId;
          const youScore = youHome ? r.homeScore : r.awayScore;
          const oppScore = youHome ? r.awayScore : r.homeScore;
          const w = youScore > oppScore ? "胜" : "负";
          const canView = !!r.box;
          return `<tr data-result-idx="${i}">
            <td>${(r.day ?? 0) + 1}</td>
            <td>${w} ${home} ${r.homeScore}-${r.awayScore} ${away}</td>
            <td>${
              canView
                ? `<button type="button" class="btn small ghost btn-view-box">球员数据</button>`
                : `<span class="tiny">—</span>`
            }</td>
          </tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="tiny">尚无已赛记录</p>`;

  box.innerHTML = `
    <div class="sm-cols">
      <section>
        <h4>即将进行（我方）</h4>
        <p class="tiny">打完/模拟一场后自动推进。自由市场操作不影响赛程顺序。</p>
        ${upHtml}
      </section>
      <section>
        <h4>近期战果</h4>
        <p class="tiny">点「球员数据」可查看该场双方得分与技术统计。</p>
        ${recentHtml}
      </section>
    </div>
  `;

  box.querySelectorAll(".btn-view-box").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const idx = Number(tr?.dataset.resultIdx);
      const entry = recent[idx];
      const snap = snapFromResultLog(st, entry);
      if (!snap) {
        alert("该场没有保存详细数据（可能是旧存档）。新模拟的比赛会保留球员数据。");
        return;
      }
      showSeasonSimResult(snap, {
        summaryExtra: `回顾第 ${(entry.day ?? 0) + 1} 比赛日。`,
        viewingHistory: true,
      });
    });
  });
}

function renderSeasonStandings() {
  const st = state.season;
  const box = $("#season-standings");
  if (!st || !box) return;
  const table = (conf, title) => {
    const rows = standingsList(st, conf);
    return `<div>
      <h4>${title}</h4>
      <table class="season-table">
        <thead><tr><th>#</th><th>球队</th><th>胜</th><th>负</th><th>胜率</th><th>净胜</th></tr></thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const you = r.id === st.userTeamId ? " you" : "";
              return `<tr class="${you}"><td>${i + 1}</td><td>${r.name}</td><td>${r.w}</td><td>${r.l}</td><td>${(
                r.pct * 100
              ).toFixed(1)}%</td><td>${r.diff > 0 ? "+" : ""}${r.diff}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  };
  box.innerHTML = table("East", "东部") + table("West", "西部");
}

function awardLine(a) {
  if (!a) return "—";
  return `${a.name}（${a.teamName}）· ${a.ppg}分 ${a.rpg}板 ${a.apg}助 · ${a.gp}场`;
}

function renderAwardSkillRewards(st) {
  const rewards = st.awardSkillRewards || [];
  if (!rewards.length) {
    return `<div class="season-award-card"><h4>我方评奖技能奖励</h4><p class="tiny">本赛季暂无我方球员获奖。MVP / DPOY / 一阵 / 最佳防守一阵等均可各领一次任意技能包。</p></div>`;
  }
  const team = st.teams[st.userTeamId];
  const rows = rewards
    .map((r) => {
      const p = team?.players?.find((x) => x.id === r.playerId);
      if (r.claimed) {
        return `<div class="award-skill-row claimed">
          <div><strong>${r.playerName}</strong> · ${r.awardName}
            <div class="tiny">已领取：${r.skillName || SKILL_PACKS[r.skillId]?.name || r.skillId}</div>
            ${p?.skills?.length ? `<div class="skill-row compact">${skillChipsHtml(p)}</div>` : ""}
          </div>
          <span class="tiny">✓</span>
        </div>`;
      }
      const catalog = listAwardSkillCatalog(p?.skills || []);
      const avail = catalog.available;
      const owned = catalog.owned;
      const ownedOpts = owned.length
        ? `<optgroup label="已拥有（${owned.length}）不可再领">
            ${owned
              .map(
                (s) =>
                  `<option value="${s.id}" disabled>✓ ${esc(s.name)} — ${esc(s.desc)}</option>`
              )
              .join("")}
          </optgroup>`
        : "";
      const availOpts = avail.length
        ? `<optgroup label="可学习（${avail.length}）">
            ${avail
              .map(
                (s) =>
                  `<option value="${s.id}">○ ${esc(s.name)} — ${esc(s.desc)}</option>`
              )
              .join("")}
          </optgroup>`
        : `<option value="">（已学会全部可选技能）</option>`;
      const haveHtml = p?.skills?.length
        ? `<div class="tiny">当前技能</div><div class="skill-row compact">${skillChipsHtml(p)}</div>`
        : `<div class="tiny muted">当前无技能</div>`;
      const ownedNames = owned.map((s) => s.name).join("、") || "无";
      return `<div class="award-skill-row" data-reward-id="${r.id}">
        <div><strong>${esc(r.playerName)}</strong> · ${esc(r.awardName)}
          <div class="tiny">获奖奖励：自选一个尚未拥有的技能包</div>
          ${haveHtml}
          <div class="tiny award-skill-owned-hint">已有：${esc(ownedNames)} · 还可学 ${avail.length} 个</div>
        </div>
        <div class="award-skill-pick">
          <select class="award-skill-select" ${avail.length ? "" : "disabled"}>
            ${availOpts}${ownedOpts}
          </select>
          <button type="button" class="btn small primary award-skill-claim" ${
            avail.length ? "" : "disabled"
          }>领取</button>
        </div>
      </div>`;
    })
    .join("");
  const pending = rewards.filter((r) => !r.claimed).length;
  return `<div class="season-award-card award-skill-panel">
    <h4>我方评奖技能奖励${pending ? ` · 待领 ${pending}` : " · 已领完"}</h4>
    <p class="tiny">我方球员每获一项个人/阵容奖（如最佳防守），可自选安装一个技能包。下拉列表里「○」为未学会，「✓」为已有（不可重复领取）。</p>
    ${rows}
  </div>`;
}

function renderSeasonAwards() {
  const st = state.season;
  const box = $("#season-awards");
  if (!st || !box) return;
  const a = st.awards;
  if (!a) {
    box.innerHTML = `<p class="tiny">打完 82 场后自动评奖（MVP、DPOY、一阵二阵三阵、最佳第六人、最快进步、最佳新秀、最佳教练、得分王等）。我方获奖可领任意技能包。</p>`;
    return;
  }
  const teamList = (list, label) =>
    `<div class="season-award-card"><h4>${label}</h4><div class="all-nba-row">${(list || [])
      .map((p) => `<span>${p.pos || ""} ${p.name} <em class="tiny">${p.teamName}</em></span>`)
      .join("") || "—"}</div></div>`;
  box.innerHTML = `
    ${renderAwardSkillRewards(st)}
    <div class="season-award-card"><h4>常规赛 MVP</h4><p>${awardLine(a.mvp)}</p></div>
    <div class="season-award-card"><h4>最佳防守球员 DPOY</h4><p>${awardLine(a.dpoy)}</p></div>
    <div class="season-award-card"><h4>最佳第六人</h4><p>${awardLine(a.sixthMan)}</p></div>
    <div class="season-award-card"><h4>最快进步 MIP</h4><p>${awardLine(a.mip)}</p></div>
    <div class="season-award-card"><h4>最佳新秀 ROY</h4><p>${awardLine(a.roy)}</p></div>
    <div class="season-award-card"><h4>最佳教练</h4><p>${
      a.coty ? `${a.coty.name}（${a.coty.teamName} ${a.coty.w}胜${a.coty.l}负）` : "—"
    }</p></div>
    ${teamList(a.allNba?.first, "一阵 All-NBA 1st")}
    ${teamList(a.allNba?.second, "二阵 All-NBA 2nd")}
    ${teamList(a.allNba?.third, "三阵 All-NBA 3rd")}
    ${teamList(a.allDefense?.first, "最佳防守一阵")}
    ${teamList(a.allDefense?.second, "最佳防守二阵")}
    <div class="season-award-card"><h4>得分王</h4><p>${awardLine(a.scoringChamp)}</p></div>
    <div class="season-award-card"><h4>篮板王</h4><p>${awardLine(a.rebChamp)}</p></div>
    <div class="season-award-card"><h4>助攻王</h4><p>${awardLine(a.astChamp)}</p></div>
    <div class="btn-row" style="margin-top:8px">
      <button type="button" class="btn primary" id="btn-season-to-playoffs">${
        st.phase === "playoffs" || st.phase === "done" ? "查看季后赛" : "进入季后赛"
      }</button>
    </div>
  `;
  box.querySelectorAll(".award-skill-claim").forEach((btn) => {
    btn.onclick = () => {
      const row = btn.closest("[data-reward-id]");
      const rewardId = row?.dataset.rewardId;
      const sel = row?.querySelector(".award-skill-select");
      const skillId = sel?.value;
      if (!rewardId || !skillId) return;
      const res = claimAwardSkill(st, rewardId, skillId);
      if (!res.ok) {
        alert(res.reason || "领取失败");
        return;
      }
      if (!saveSeasonAndCareer(st)) return;
      alert(`${res.player.name} 学会了「${res.skillName}」！`);
      renderSeasonAwards();
    };
  });
  $("#btn-season-to-playoffs")?.addEventListener("click", () => {
    const pending = (st.awardSkillRewards || []).filter((r) => !r.claimed);
    if (pending.length && !confirm(`还有 ${pending.length} 个评奖技能未领取，确定先去季后赛？`)) {
      return;
    }
    if (st.phase === "awards" || st.phase === "regular") {
      startPlayoffs(st);
      st.phase = "playoffs";
    }
    showSeasonTab("playoffs");
    renderSeasonHub();
  });
}

function renderSeasonPlayoffs() {
  const st = state.season;
  const box = $("#season-playoffs");
  if (!st || !box) return;
  const currentCareerDraft =
    state.leagueCareer?.management?.draft?.year === st.year
      ? state.leagueCareer.management.draft
      : null;
  if (!st.playoffs) {
    box.innerHTML = `<p class="tiny">常规赛结束后从评奖页进入季后赛（东西部各八强，七场四胜）。</p>
      <button type="button" class="btn" id="btn-season-sim-playoffs" ${
        st.phase === "awards" || st.phase === "regular" ? "" : "disabled"
      }>一键模拟整个季后赛</button>`;
    $("#btn-season-sim-playoffs")?.addEventListener("click", () => {
      if (!st.awards) {
        advanceToUserGame(st, { stopBeforeUser: false });
      }
      simAllPlayoffs(st);
      renderSeasonHub();
      showSeasonTab("playoffs");
    });
    return;
  }
  const po = st.playoffs;
  const seriesHtml = (s) =>
    `<div class="season-series-row"><span>${s.high?.name || s.high?.id} vs ${
      s.low?.name || s.low?.id
    }</span><strong>${s.winsHigh}-${s.winsLow}${s.done ? ` · ${s.winnerName || s.winnerId}` : ""}</strong></div>`;
  const confBlock = (key, title) => {
    const b = po[key];
    return `<div class="season-award-card"><h4>${title} · R${b.round}</h4>${(b.series || [])
      .map(seriesHtml)
      .join("")}${b.finalist ? `<p class="tiny">分区冠军：${st.teams[b.finalist]?.name}</p>` : ""}</div>`;
  };
  if (st.phase === "done" && !st.finalsAllTeam?.length) {
    computeFinalsAllTeam(st);
  }
  const finalsTeamHtml = (st.finalsAllTeam || []).length
    ? `<div class="season-award-card"><h4>总决赛最佳阵容 · PG → C</h4>
        <div class="all-team-row season">
          ${st.finalsAllTeam
            .map(
              (p) => `<div class="all-team-slot">
                <span class="all-team-pos">${p.slot || p.pos}</span>
                <strong>${p.name}</strong>
                <em class="tiny">${p.teamName || ""}</em>
                <span class="tiny">${p.gp ? `${p.ppg}分 ${p.rpg}板 ${p.apg}助` : `OVR ${p.ovr}`}</span>
              </div>`
            )
            .join("")}
        </div></div>`
    : "";
  box.innerHTML = `
    ${confBlock("east", "东部")}
    ${confBlock("west", "西部")}
    ${
      po.finals
        ? `<div class="season-award-card"><h4>总决赛</h4>${seriesHtml(po.finals)}${
            po.championId
              ? `<p><strong>总冠军 ${st.teams[po.championId]?.name}</strong></p>`
              : ""
          }</div>`
        : ""
    }
    ${finalsTeamHtml}
    <div class="btn-row">
      <button type="button" class="btn primary" id="btn-season-advance-po" ${
        st.phase === "done" ? "disabled" : ""
      }>模拟下一轮</button>
      <button type="button" class="btn" id="btn-season-sim-all-po" ${
        st.phase === "done" ? "disabled" : ""
      }>一键打完季后赛</button>
      ${
        st.phase === "done"
          ? `<button type="button" class="btn primary" id="btn-season-offseason">${
              currentCareerDraft
                ? "继续选秀"
                : isManagedCareer(state.leagueCareer)
                  ? "进入休赛期选秀"
                  : `休赛期成长 · 开启 ${Number(st.year) + 1} 赛季`
            }</button>`
          : ""
      }
    </div>
    ${
      st.offseasonLog?.length
        ? `<div class="season-award-card"><h4>上次休赛期成长 / 续约（我方）</h4><div class="tiny">${st.offseasonLog
            .slice(0, 16)
            .map((r) => {
              const sal =
                r.salaryBefore != null
                  ? ` · 薪 ¤${r.salaryBefore}→¤${r.salaryAfter || 0}${
                      r.renewal ? `（${r.renewal}）` : ""
                    }`
                  : "";
              return `${r.name}：${r.fromSeason}→${r.toSeason} · OVR ${r.before}${
                r.delta >= 0 ? "+" : ""
              }${r.delta}→${r.after}${sal}`;
            })
            .join("<br/>")}</div></div>`
        : ""
    }
  `;
  $("#btn-season-advance-po")?.addEventListener("click", () => {
    advancePlayoffs(st);
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonHub();
    showSeasonTab("playoffs");
  });
  $("#btn-season-sim-all-po")?.addEventListener("click", () => {
    simAllPlayoffs(st);
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonHub();
    showSeasonTab("playoffs");
  });
  $("#btn-season-offseason")?.addEventListener("click", () => {
    if (currentCareerDraft) {
      showSeasonTab("draftBoard");
      return;
    }
    if (
      !confirm(
        isManagedCareer(state.leagueCareer)
          ? "确认结束本赛季并进入休赛期选秀？"
          : `确认进入休赛期？\n全联盟球员按史实生涯成长/衰退，并按本季表现续约（打出来会更贵）。然后开启 ${
              Number(st.year) + 1
            } 赛季。`
      )
    ) {
      return;
    }
    if (isManagedCareer(state.leagueCareer)) {
      try {
        const next = runCareerTransition(
          state.leagueCareer,
          prepareCareerOffseason,
        );
        commitManagedCareer(next, "draftBoard");
      } catch (error) {
        alert(error?.message || "无法进入休赛期选秀");
      }
      return;
    }
    let res;
    if (state.leagueCareer) {
      const advanced = advanceCareerOffseason(state.leagueCareer);
      state.leagueCareer = advanced.career;
      state.season = advanced.career.season;
      res = advanced.result;
    } else {
      res = advanceLeagueOffseason(st);
    }
    if (!res.ok) {
      alert(res.reason || "无法进入休赛期");
      return;
    }
    const highlights = (res.log || [])
      .filter((r) => r.delta > 0 || (r.salaryAfter || 0) > (r.salaryBefore || 0) + 10)
      .slice(0, 8);
    const tip = highlights.length
      ? highlights
          .map(
            (r) =>
              `${r.name} OVR ${r.before}→${r.after} · ¤${r.salaryBefore || 0}→¤${r.salaryAfter || 0}${
                r.renewal ? `（${r.renewal}）` : ""
              }`
          )
          .join("\n")
      : "本队本轮成长/涨薪幅度不大。";
    if (!saveSeasonAndCareer(state.season)) return;
    alert(`已进入 ${res.year} 赛季。\n\n我方续约亮点：\n${tip}`);
    renderSeasonHub();
    showSeasonTab("standings");
  });
}

function showSeasonTab(tab) {
  if (
    !isManagedCareer(state.leagueCareer) &&
    ["draftBoard", "development", "history"].includes(tab)
  ) {
    tab = "standings";
  }
  const map = {
    standings: $("#season-standings"),
    rotation: $("#season-rotation"),
    market: $("#season-market"),
    schedule: $("#season-schedule"),
    awards: $("#season-awards"),
    playoffs: $("#season-playoffs"),
    draftBoard: $("#season-draft-board"),
    development: $("#season-development"),
    history: $("#season-history"),
  };
  for (const [k, el] of Object.entries(map)) {
    if (el) el.hidden = k !== tab;
  }
  document.querySelectorAll("[data-season-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.seasonTab === tab);
  });
}

function playSeasonUserGame() {
  const st = state.season;
  if (!st || st.phase !== "regular") return;
  advanceToUserGame(st, { stopBeforeUser: true });
  const info = nextUserGame(st);
  if (!info) {
    renderSeasonHub();
    showSeasonTab("awards");
    return;
  }
  st.dayIndex = info.day;
  for (const g of st.schedule[info.day]) {
    if (g.played || g === info.game) continue;
    simScheduledGame(st, g);
  }
  state.seasonPendingGame = info.game;
  const youHome = info.game.homeId === st.userTeamId;
  const home = st.teams[info.game.homeId];
  const away = st.teams[info.game.awayId];
  // 赛季存档侧也写上随机教练组，避免每场重抽
  ensureTeamStaff(home, {
    preferStarter: true,
    excludeIds: [away?.coach?.id, away?.assistant?.id],
  });
  ensureTeamStaff(away, {
    preferStarter: true,
    excludeIds: [home?.coach?.id, home?.assistant?.id],
  });
  if (!saveSeasonAndCareer(st)) return;
  const cloneSide = (t) => ({
    name: t.name,
    players: t.players.map((p) => clonePlayer(p)),
    coach: t.coach ? structuredClone(t.coach) : null,
    assistant: t.assistant ? structuredClone(t.assistant) : null,
    gold: 0,
    isCpu: t.isCpu,
    gameplan: t.gameplan ? structuredClone(t.gameplan) : { matchup: null },
    starterIds: t.starterIds ? [...t.starterIds] : null,
    lineupPacks: t.lineupPacks ? structuredClone(t.lineupPacks) : null,
    rotation: t.rotation ? structuredClone(t.rotation) : null,
  });
  openSetup(cloneSide(home), cloneSide(away), youHome ? "home" : "away");
}

function handleSeasonResult(snap) {
  const st = state.season;
  const game = state.seasonPendingGame;
  if (st && game && !game.played) {
    recordUserLiveResult(st, game, snap);
  }
  state.seasonPendingGame = null;
  // Persist updated roster form/fatigue lightly from snap onto season team
  if (st && snap) {
    const youSide = snap.youSide;
    const youSnap = youSide === "home" ? snap.home : snap.away;
    const team = st.teams[st.userTeamId];
    if (team && youSnap?.roster) {
      for (const p of youSnap.roster) {
        const live = team.players.find((x) => x.id === p.id);
        if (live) {
          live.form = p.form;
          live.fatigue = Math.min(40, p.fatigue || 0);
        }
      }
    }
    if (!saveSeasonAndCareer(st, { liveGame: "clear" })) {
      wireSeasonResultContinue(state.season, snap);
      return;
    }
  }
  wireSeasonResultContinue(st, snap);
}

/** Paint score + both-team box scores (instant sim or re-open from schedule). */
function showSeasonSimResult(snap, { summaryExtra = "", viewingHistory = false } = {}) {
  if (!snap?.home || !snap?.away) return;
  const st = state.season;
  show("result");
  const hs = snap.score?.home ?? 0;
  const as = snap.score?.away ?? 0;
  $("#result-score").textContent = `${hs} - ${as}`;
  const youSide = snap.youSide === "away" ? "away" : "home";
  const youScore = youSide === "home" ? hs : as;
  const oppScore = youSide === "home" ? as : hs;
  const winner = hs === as ? "平局" : hs > as ? snap.home.name : snap.away.name;
  const youWin = youScore > oppScore;
  $("#result-title").textContent =
    hs === as
      ? "加时仍平——以模拟终局计"
      : viewingHistory
        ? `${winner} 获胜`
        : `${winner} 获胜 · ${youWin ? "我方胜" : "我方负"}`;
  $("#box-score").innerHTML = `${boxTable(snap.home)}${boxTable(snap.away)}`;
  wireSeasonResultContinue(st, snap, { summaryExtra, viewingHistory });
}

function wireSeasonResultContinue(st, snap, { summaryExtra = "", viewingHistory = false } = {}) {
  const cont = $("#btn-result-continue");
  const rec = st?.standings?.[st.userTeamId];
  const played = userGamesPlayed(st);
  const base = `常规赛战绩 ${rec?.w || 0}胜${rec?.l || 0}负 · 已打 ${played}/82。${
    st?.phase === "awards" ? " 常规赛结束，可查看评奖。" : ""
  }`;
  $("#result-summary").textContent = summaryExtra ? `${summaryExtra} ${base}` : base;
  cont.textContent = viewingHistory ? "返回赛程" : "回到赛季主页";
  cont.onclick = () => {
    state.mode = state.leagueCareer?.kind === "timeTravel" ? "timeTravel" : "season";
    renderSeasonHub();
    show("season");
    if (viewingHistory) showSeasonTab("schedule");
    else if (st?.phase === "awards") showSeasonTab("awards");
  };
  setResultActionMode("season", { showContinue: true, continuePrimary: true });
  const again = $("#btn-again");
  if (again) again.hidden = true;
  const homeBtn = $("#btn-home");
  if (homeBtn) homeBtn.hidden = false;
}

function simSeasonGames(count = 1) {
  const st = state.season;
  if (!st || st.phase !== "regular") return;
  let last = null;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const r = simUserNextGame(st);
    if (!r) break;
    last = r;
    n += 1;
  }
  if (!saveSeasonAndCareer(st)) return;
  if (last?.snap) {
    const extra =
      n > 1
        ? `已连续模拟 ${n} 场；下方为最近一场（${last.snap.home?.name} ${last.snap.score.home}-${last.snap.score.away} ${last.snap.away?.name}）的完整数据。`
        : "快速模拟完成。下方为双方球员数据。";
    // Ensure youSide is correct for this game
    const youSide =
      last.game?.homeId === st.userTeamId
        ? "home"
        : last.game?.awayId === st.userTeamId
          ? "away"
          : last.snap.youSide;
    showSeasonSimResult({ ...last.snap, youSide }, { summaryExtra: extra });
    return;
  }
  renderSeasonHub();
  if (st.phase === "awards") showSeasonTab("awards");
}

$("#btn-season-back")?.addEventListener("click", () => show("home"));
$("#btn-season-resume")?.addEventListener("click", () => {
  const st = prepareSeasonState(state.season || loadSeason());
  if (!st) return;
  state.season = st;
  state.mode = state.leagueCareer?.kind === "timeTravel" ? "timeTravel" : "season";
  renderSeasonHub();
  showSeasonTab("standings");
});
$("#btn-season-roster-account")?.addEventListener("click", () => {
  const acc = requireAccountReady();
  if (!acc) return;
  const name = ($("#season-team-name")?.value || "").trim() || "拉斯维加斯 ***";
  const team = accountToTeam(acc, name);
  if (!team || team.players.length < 8) {
    alert("账号班底不足 8 人，请先去抽卡/开局集齐球员。");
    return;
  }
  // 账号班底也要过工资帽
  let pay = 0;
  const kept = [];
  for (const p of [...team.players].sort((a, b) => overall(b) - overall(a))) {
    const sal = playerSalary(p);
    if (pay + sal > SEASON_SALARY_CAP) continue;
    kept.push(p);
    pay += sal;
    if (kept.length >= SEASON_MAX_ROSTER) break;
  }
  if (kept.length < 8) {
    alert("账号班底在工资帽下凑不满 8 人，请改用「自选历史球员」。");
    return;
  }
  team.players = kept;
  const panel = $("#season-pick-panel");
  if (panel) panel.hidden = true;
  previewSeasonRoster(team);
});

/** 赛季开局：随机球队 10 人 → 选 1 人 → 立刻再随机一支球队（可重复）；没钱则自动补至 12 */
let seasonPickList = [];
let seasonOfferPack = [];
let seasonOfferFranchise = null;
let seasonPickAutoDone = false;

function seasonPickPayroll() {
  return seasonPickList.reduce((s, p) => s + playerSalary(p), 0);
}

function stripSeasonAutoFills() {
  seasonPickList = seasonPickList.filter((p) => !p._seasonAuto);
  seasonPickAutoDone = false;
}

function applySeasonAutoFill() {
  if (seasonPickList.length >= SEASON_DRAFT_TARGET) {
    seasonPickAutoDone = true;
    seasonOfferPack = [];
    return;
  }
  const { roster, added } = autoFillSeasonDraft(seasonPickList, {
    target: SEASON_DRAFT_TARGET,
    cap: SEASON_SALARY_CAP,
  });
  seasonPickList = roster;
  seasonPickAutoDone = true;
  seasonOfferPack = [];
  if (added.length) {
    // keep franchise label for context
  }
}

function maybeAutoFillSeasonDraft() {
  if (seasonPickAutoDone) return false;
  if (seasonPickList.length >= SEASON_DRAFT_TARGET) {
    seasonPickAutoDone = true;
    seasonOfferPack = [];
    return true;
  }
  if (!seasonDraftOutOfMoney(seasonPickList, seasonOfferPack, SEASON_SALARY_CAP)) return false;
  applySeasonAutoFill();
  return true;
}

function syncSeasonPickCap() {
  const pay = seasonPickPayroll();
  const el = $("#season-pick-cap");
  if (el) {
    const autoN = seasonPickList.filter((p) => p._seasonAuto).length;
    el.textContent = seasonPickAutoDone
      ? `已选 ${seasonPickList.length}/${SEASON_DRAFT_TARGET} 人 · 薪资 ${formatSalary(pay)} / ${formatSalary(
          SEASON_SALARY_CAP
        )} · 薪资不足，系统已按位置自动补了 ${autoN} 人`
      : `已选 ${seasonPickList.length}/${SEASON_DRAFT_TARGET} 人 · 薪资 ${formatSalary(pay)} / ${formatSalary(
          SEASON_SALARY_CAP
        )} · 空间 ${formatSalary(SEASON_SALARY_CAP - pay)}（本批选 1 人；没钱则自动补齐）`;
    el.classList.toggle("over", pay > SEASON_SALARY_CAP);
  }
  const conf = $("#btn-season-pick-confirm");
  if (conf) {
    conf.disabled = !(
      seasonPickList.length >= SEASON_MIN_ROSTER &&
      seasonPickList.length <= SEASON_MAX_ROSTER &&
      pay <= SEASON_SALARY_CAP
    );
  }
  const box = $("#season-pick-selected");
  if (box) {
    box.innerHTML = seasonPickList
      .map((p) => {
        const tag = p._seasonAuto ? " · 系统" : p._seasonFree ? " · 免费" : "";
        const locked = !!p._seasonAuto;
        return `<button type="button" class="chip season-pick-chip ${p._seasonAuto ? "auto" : ""} ${
          p._seasonFree ? "free" : ""
        }" data-remove="${p.id}" ${
          locked ? "disabled title=\"系统补人，移出自选球员后会重算\"" : ""
        }>${p.pos} ${p.name} · ${p.season} · ${
          p._seasonFree ? "免费" : formatSalary(playerSalary(p))
        } · OVR ${overall(p)}${tag}${locked ? "" : " ×"}</button>`;
      })
      .join("") ||
      `<span class="tiny">还没选人 — 点「选入」或「跳过」（跳过=本批随机一人免费入队）</span>`;
    box.querySelectorAll("[data-remove]:not([disabled])").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.remove;
        stripSeasonAutoFills();
        seasonPickList = seasonPickList.filter((p) => p.id !== id);
        syncSeasonPickCap();
        rollSeasonFranchisePack();
      };
    });
  }
}

function renderSeasonOfferPack() {
  const nameEl = $("#season-pick-franchise-name");
  const box = $("#season-pick-results");
  if (!box) return;

  const skipBtn = $("#btn-season-pick-skip");
  if (skipBtn) {
    skipBtn.hidden = seasonPickAutoDone || seasonPickList.length >= SEASON_DRAFT_TARGET;
    skipBtn.disabled = !seasonOfferPack.length || seasonPickList.length >= SEASON_DRAFT_TARGET;
  }

  if (seasonPickAutoDone || seasonPickList.length >= SEASON_DRAFT_TARGET) {
    if (nameEl) {
      nameEl.textContent = seasonPickAutoDone
        ? `选人结束：系统已按已选阵容与位置补齐至 ${seasonPickList.length} 人`
        : `名单已满 ${SEASON_DRAFT_TARGET} 人，可确认阵容`;
    }
    box.innerHTML = `<p class="tiny">${
      seasonPickAutoDone
        ? "没有选择权的系统补人已完成。可确认阵容；若移出自选球员，会清空系统补人并继续手选。"
        : "可确认这份阵容，或移出后继续选。"
    }</p>`;
    syncSeasonPickCap();
    return;
  }

  if (nameEl) {
    nameEl.textContent = seasonOfferFranchise
      ? `本批球队：${seasonOfferFranchise.name}（${seasonOfferFranchise.id}）· 选 1 人或跳过免费随机一人`
      : "—";
  }
  const have = new Set(seasonPickList.map((p) => p.id));
  const pay = seasonPickPayroll();
  if (!seasonOfferPack.length) {
    box.innerHTML = `<p class="tiny">本批暂无人可选</p>`;
    return;
  }
  box.innerHTML = seasonOfferPack
    .map((p) => {
      const meta = offerLabel(p);
      const sal = meta.salary;
      const already = have.has(p.id);
      const over = pay + sal > SEASON_SALARY_CAP;
      return `<div class="sm-row season-pick-row ${already ? "picked" : ""}">
        ${photoImg(p, "headshot")}
        <div class="season-pick-meta">
          <strong>${p.pos} ${p.name}</strong>
          <span class="chip tiny">${meta.role}</span>
          <div class="tiny">${p.season} 赛季 · OVR ${meta.ovr} · 当季工资 <strong>${formatSalary(sal)}</strong></div>
          <div class="tiny season-pick-attrs">攻${p.scoring ?? "—"} 三分${p.three ?? "—"} 中投${p.mid ?? "—"} 内线${p.paint ?? "—"} 传${p.pass ?? "—"} 防${p.defense ?? "—"} 板${p.rebound ?? "—"} 断${p.steal ?? "—"} 帽${p.block ?? "—"} 速${p.speed ?? "—"} 力${p.strength ?? "—"} 智商${p.iq ?? "—"} 关键${p.clutch ?? "—"}</div>
          <div class="tiny">${marketMeta(p)}</div>
          ${
            historicalUpsideHint(p)
              ? `<div class="tiny season-pick-upside">${historicalUpsideHint(p)} · 打完赛季可按史实成长</div>`
              : ""
          }
        </div>
        <button type="button" class="btn small primary" data-pick="${p.id}" ${
        already || over ? "disabled" : ""
      }>${already ? "已选" : over ? "超帽" : "选入"}</button>
      </div>`;
    })
    .join("");
  box.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.pick;
      const p = seasonOfferPack.find((x) => x.id === id);
      if (!p || have.has(id)) return;
      const sal = playerSalary(p);
      if (seasonPickList.length >= SEASON_DRAFT_TARGET) return;
      if (pay + sal > SEASON_SALARY_CAP) {
        applySeasonAutoFill();
        renderSeasonOfferPack();
        syncSeasonPickCap();
        return;
      }
      seasonPickList.push(clonePlayer(p));
      rollSeasonFranchisePack();
    };
  });
}

function rollSeasonFranchisePack() {
  if (seasonPickList.length >= SEASON_DRAFT_TARGET) {
    seasonOfferPack = [];
    renderSeasonOfferPack();
    syncSeasonPickCap();
    return;
  }
  seasonOfferFranchise = rollRandomFranchise(seasonOfferFranchise?.id);
  const excludeIds = new Set(seasonPickList.map((p) => p.id));
  const excludeBrefs = new Set(seasonPickList.map((p) => p.bref).filter(Boolean));
  seasonOfferPack = drawFranchiseOffers(seasonOfferFranchise, excludeIds, excludeBrefs);
  if (maybeAutoFillSeasonDraft()) {
    renderSeasonOfferPack();
    syncSeasonPickCap();
    return;
  }
  renderSeasonOfferPack();
  syncSeasonPickCap();
}

/** 本批无人看中：从当前 10 人里随机一人免费入队，再换下一队 */
function skipSeasonOfferPack() {
  if (seasonPickAutoDone || seasonPickList.length >= SEASON_DRAFT_TARGET) return;
  const have = new Set(seasonPickList.map((p) => p.id));
  const cands = seasonOfferPack.filter((p) => !have.has(p.id));
  if (!cands.length) {
    rollSeasonFranchisePack();
    return;
  }
  const pick = clonePlayer(cands[Math.floor(Math.random() * cands.length)]);
  pick._seasonFree = true;
  pick._seasonSkip = true;
  pick.salary = 0;
  seasonPickList.push(pick);
  rollSeasonFranchisePack();
}

$("#btn-season-roster-franchise")?.addEventListener("click", (ev) => {
  const panel = $("#season-pick-panel");
  if (!panel) return;
  // 若已在选人，再次点「随机球队选人」会整批重开；避免回车误触已聚焦的该按钮
  if (!panel.hidden && seasonPickList.length > 0) {
    if (!confirm("将清空已选球员并重新随机一支球队，确定？")) return;
  }
  panel.hidden = false;
  seasonPickList = [];
  seasonPickAutoDone = false;
  resetFranchiseBag();
  rollSeasonFranchisePack();
  ev.currentTarget?.blur();
});
$("#btn-season-pick-skip")?.addEventListener("click", (ev) => {
  skipSeasonOfferPack();
  ev.currentTarget?.blur();
});
/** 球队名输入框按回车不要触发任何按钮（否则会误点「随机球队选人」换一批） */
$("#season-team-name")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
  }
});
$("#btn-season-pick-confirm")?.addEventListener("click", () => {
  const name = ($("#season-team-name")?.value || "").trim() || "拉斯维加斯 ***";
  const pay = seasonPickList.reduce((s, p) => s + playerSalary(p), 0);
  if (seasonPickList.length < SEASON_MIN_ROSTER || pay > SEASON_SALARY_CAP) return;
  const staff = autoFillTeam(name, 8);
  const team = {
    name,
    players: seasonPickList.map((p) => clonePlayer(p)),
    coach: staff.coach ? structuredClone(staff.coach) : null,
    assistant: staff.assistant ? structuredClone(staff.assistant) : null,
    gold: 0,
    isCpu: false,
  };
  ensureTeamStaff(team, { preferStarter: true });
  const panel = $("#season-pick-panel");
  if (panel) panel.hidden = true;
  previewSeasonRoster(team);
});
function syncSeasonStartButtonLabel() {
  const btn = $("#btn-season-start");
  if (!btn) return;
  btn.textContent =
    seasonSetupMode === "historical"
      ? `开启 ${seasonSetupYear} 完整赛季（常规赛+季后赛）`
      : "开启完整赛季征程（32 队）";
}

$("#btn-season-mode-modern")?.addEventListener("click", () => {
  seasonSetupMode = "modern";
  syncSeasonModeUi();
  syncSeasonStartButtonLabel();
});
$("#btn-season-mode-hist")?.addEventListener("click", () => {
  seasonSetupMode = "historical";
  ensureSeasonYearSelect();
  syncSeasonModeUi();
  syncSeasonStartButtonLabel();
});
$("#btn-season-start")?.addEventListener("click", async () => {
  const draft = state.seasonRosterDraft;
  if (!draft || draft.players.length < 8) return;
  const name = ($("#season-team-name")?.value || "").trim() || "拉斯维加斯 ***";
  if (
    seasonSetupKind === "franchise"
    && hasExistingCareerRoot(state.longCareerRoot || readRootSave())
    && !(await confirmAction("开始新联盟经理生涯将替换当前长期生涯存档，确定继续？", {
      title: "覆盖联盟经理存档？",
      acceptLabel: "覆盖并开始",
    }))
  ) return;
  draft.name = name;
  if (state.season && !(await confirmAction("将覆盖当前赛季进度，确定开新赛季？", {
    title: "覆盖当前赛季？",
    acceptLabel: "覆盖并开始",
  }))) return;
  clearSeasonSave();
  const yearSel = Number($("#season-year-select")?.value) || seasonSetupYear;
  try {
    state.season = createSeason({
      userTeamId: "LAS",
      userTeamName: name,
      userTeam: draft,
      mode: seasonSetupMode,
      year: seasonSetupMode === "historical" ? yearSel : new Date().getFullYear(),
    });
    if (seasonSetupKind === "franchise") {
      state.leagueCareer = createLeagueCareer({
        kind: "franchise",
        season: state.season,
      });
      state.mode = "franchise";
    } else {
      state.leagueCareer = null;
      state.mode = "season";
    }
  } catch (err) {
    alert(err?.message || "无法创建赛季");
    return;
  }
  if (!saveSeasonAndCareer(state.season)) return;
  renderSeasonHub();
  showSeasonTab("standings");
});
$("#btn-season-play")?.addEventListener("click", () => playSeasonUserGame());
$("#btn-season-sim-one")?.addEventListener("click", () => simSeasonGames(1));
$("#btn-season-sim-week")?.addEventListener("click", () => simSeasonGames(5));
$("#btn-season-save")?.addEventListener("click", () => {
  if (state.season) {
    if (saveSeasonAndCareer(state.season)) {
      alert("赛季进度已保存到本机。");
    }
  }
});
$("#btn-season-abandon")?.addEventListener("click", async () => {
  if (!(await confirmAction("确定放弃当前赛季？进度将清空。", {
    title: "放弃当前赛季？",
    acceptLabel: "放弃并清空",
  }))) return;
  const abandoningTimeTravel = state.leagueCareer?.kind === "timeTravel";
  clearSeasonSave();
  if (abandoningTimeTravel) {
    clearRootSave();
    state.leagueCareer = null;
    state.story = null;
    state.longCareerRoot = null;
    state.mode = "season";
  }
  state.season = null;
  state.seasonPendingGame = null;
  state.seasonRosterDraft = null;
  openSeasonScreen();
});
document.querySelectorAll("[data-season-tab]").forEach((btn) => {
  btn.addEventListener("click", () => showSeasonTab(btn.dataset.seasonTab));
});

function handleRankedResult(youWin) {
  const acc = getAccount(state.career?.accountId) || activeAccount();
  if (acc) recordRankedResult(acc, youWin);
  const cont = $("#btn-result-continue");
  $("#result-summary").textContent = youWin
    ? `排位胜利。班底与教练已保存，战绩 ${acc?.rankedWins || 0}胜${acc?.rankedLosses || 0}负。`
    : `排位失利。班底仍在，可回收藏调整战术后再战。战绩 ${acc?.rankedWins || 0}胜${acc?.rankedLosses || 0}负。`;
  cont.textContent = "回到球员卡";
  cont.onclick = () => {
    state.career = null;
    openCollection();
  };
  setResultActionMode("ranked", { showContinue: true, continuePrimary: true });
  refreshAccountHomeBar();
}

function handleCareerResult(youWin, snap) {
  const c = state.career;
  const cont = $("#btn-result-continue");

  const injuryNotes = applyCareerInjuryWave(c, {
    round: c.round,
    intensity: c.stageSize <= 4 ? 1.35 : 1,
  });

  const match = findYourOpenMatch(c.pods) || yourCareerMatch();
  const opp = match ? (match.a.bracketId === "you" ? match.b : match.a) : null;
  if (match && snap) {
    if (match.a.bracketId === "you") {
      match.score = { home: snap.score.home, away: snap.score.away };
      match.startersA = snap.home?.onCourt?.slice(0, 5) || match.startersA;
      match.startersB = snap.away?.onCourt?.slice(0, 5) || match.startersB;
      noteCareerAllTeamGame(c, snap, match.a, match.b);
    } else {
      match.score = { home: snap.score.away, away: snap.score.home };
      match.startersA = snap.away?.onCourt?.slice(0, 5) || match.startersA;
      match.startersB = snap.home?.onCourt?.slice(0, 5) || match.startersB;
      noteCareerAllTeamGame(c, snap, match.b, match.a);
    }
  }

  const kind = match?.kind ? kindLabel(match.kind) : "对决";
  const wasFinals = !!(c.finals || c.stageSize === 2);
  const result = resolveCareerYourResult(youWin, opp);
  const injLine = injuryNotes.length ? `伤病快报：${injuryNotes.slice(0, 3).join("；")}` : "全员健康。";
  const losses = c.losses?.you || 0;

  if (result.champion) {
    const reward = 400 + (c.round || 1) * 100;
    c.gold += reward;
    const tierId = c.challengeTier || (c.fromCustom ? "custom" : "gold");
    const tier = challengeTierMeta(tierId === "custom" ? "gold" : tierId);
    const canLadder =
      !c.fromCustom && (tierId === "gold" || tierId === "playoff15" || tierId === "champ7");
    const nextTier = canLadder ? tier.next : null;
    $("#result-title").textContent =
      tierId === "champ7" ? "历史总冠军挑战 · 通关！" : tierId === "playoff15" ? "季后赛挑战冠军！" : "总冠军！";
    $("#result-summary").textContent = nextTier
      ? `捧杯！获得 ¤${reward}。当前 ¤${c.gold}。可继续${tier.nextLabel}（保留阵容与金币）。${injLine}`
      : tierId === "champ7"
        ? `你已击败 7 支历史总冠军！获得 ¤${reward}。当前 ¤${c.gold}。${injLine}`
        : `捧杯！获得 ¤${reward}。当前 ¤${c.gold}。${injLine}`;
    const allTeam = computeCareerAllTeam(c);
    renderResultAllTeam(allTeam, "本届最佳阵容 · PG → C");
    if (nextTier === "playoff15" || nextTier === "champ7") {
      c.pendingChallenge = nextTier;
      cont.textContent = tier.nextLabel;
      cont.onclick = () => {
        c.pendingChallenge = null;
        beginCareerChallengeTier(nextTier);
      };
      setResultActionMode("career", { showContinue: true, continuePrimary: true });
      const homeBtn = $("#btn-home");
      if (homeBtn) {
        homeBtn.onclick = () => {
          autosaveCareer();
          show("home");
        };
      }
    } else {
      c.pendingChallenge = null;
      cont.textContent = "捧杯回主页";
      cont.onclick = () => {
        clearSave();
        refreshSaveHomeBar();
        show("home");
      };
      setResultActionMode("career", { showContinue: true, continuePrimary: true });
    }
    autosaveCareer();
    return;
  }

  if (result.eliminated) {
    $("#result-title").textContent = losses >= 2 ? "两败出局" : "淘汰出局";
    $("#result-summary").textContent = `${careerRoundLabel(c.round)} · ${kind}失利后出局（负场 ${losses}）。可回看其他对决。${injLine}`;
    if (wasFinals) {
      const allTeam = computeCareerAllTeam(c);
      renderResultAllTeam(allTeam, "总决赛最佳阵容 · PG → C");
    }
    cont.textContent = "回主页";
    cont.onclick = () => {
      clearSave();
      refreshSaveHomeBar();
      show("home");
    };
    setResultActionMode("career", { showContinue: true, continuePrimary: false });
    autosaveCareer();
    return;
  }

  const reward = youWin ? 120 + (c.round || 1) * 40 : 40;
  c.gold += reward;

  if (result.needAnotherGame) {
    const next = findYourOpenMatch(c.pods);
    const nextKind = next?.kind ? kindLabel(next.kind) : "下一场";
    $("#result-title").textContent = youWin ? `${kind}过关` : `${kind}失利 · 还有机会`;
    $("#result-summary").textContent = youWin
      ? `${kind}获胜（¤${reward}）。组内下一场：${nextKind}（对阵 ${
          next ? (next.a.bracketId === "you" ? next.b.name : next.a.name) : "？"
        }）。负场 ${losses}/2。${injLine}`
      : `${kind}失利（¤${reward}）。进入 ${nextKind} 争取晋级。负场 ${losses}/2 —— 再输就出局。${injLine}`;
    cont.textContent = `备战${nextKind}`;
    cont.onclick = () => {
      c.shop = null;
      openMarket({ career: true, afterWin: youWin, refillShop: true });
      autosaveCareer();
    };
    setResultActionMode("career", { showContinue: true, continuePrimary: true });
    autosaveCareer();
    return;
  }

  // Finished this stage path — next stage seeded (or waiting)
  const nextLabel = careerRoundLabel(c.round, c.finals);
  $("#result-title").textContent = youWin ? "晋级成功" : "惊险晋级";
  $("#result-summary").textContent = `${kind}赛果已计入。获得 ¤${reward}，当前 ¤${c.gold}。下一轮：${nextLabel}。负场 ${losses}/2。${injLine}`;
  cont.textContent = c.stageSize === 2 ? "备战总决赛" : "备战下一轮";
  cont.onclick = () => {
    c.shop = null;
    openMarket({ career: true, afterWin: true, refillShop: true });
    autosaveCareer();
  };
  setResultActionMode("career", { showContinue: true, continuePrimary: true });
  autosaveCareer();
}

/** Tick recovery + new injury rolls between晋级 games. */
function applyCareerInjuryWave(c, opts) {
  if (!c?.team?.players) return [];
  const reports = rollAdvancementInjuries(c.team.players, opts);
  if (c.series?.opp?.players) {
    reports.push(...rollAdvancementInjuries(c.series.opp.players, { ...opts, intensity: (opts.intensity || 1) * 0.9 }));
  }
  for (const t of c.alive || []) {
    if (t.bracketId === "you" || !t.players) continue;
    reports.push(...rollAdvancementInjuries(t.players, { ...opts, intensity: (opts.intensity || 1) * 0.85 }));
  }
  return reports.filter((r) => r.type === "injury" || r.type === "recover").map((r) => r.text);
}

function boxTable(team) {
  const rows = [...team.roster]
    .sort((a, b) => (b.gradeScore || 0) - (a.gradeScore || 0) || b.stats.pts - a.stats.pts)
    .map((p) => {
      const s = p.stats;
      const grade = p.grade || "—";
      const gTone = p.gradeTone || "grade-c";
      return `<tr>
        <td class="player-cell">${photoImg(p, "headshot sm")} ${p.name}<div class="tiny">${p.season}</div></td>
        <td><span class="live-grade ${gTone}">${grade}</span></td>
        <td>${s.min}</td><td>${s.pts}</td><td>${s.reb}</td><td>${s.oreb}</td><td>${s.dreb}</td>
        <td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.tov}</td><td>${s.pf}</td>
        <td>${s.fgm}/${s.fga}</td><td>${s.tpm}/${s.tpa}</td><td>${s.ftm}/${s.fta}</td>
        <td>${s.pm >= 0 ? "+" : ""}${s.pm}</td>
      </tr>`;
    })
    .join("");
  return `<div class="box-wrap"><strong>${team.name}</strong>
    <div class="table-scroll"><table>
      <thead><tr>
        <th>球员</th><th>评级</th><th>MIN</th><th>PTS</th><th>REB</th><th>OREB</th><th>DREB</th>
        <th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>PF</th>
        <th>FGM-A</th><th>3PM-A</th><th>FTM-A</th><th>+/-</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
}

// —— Legacy tournament (kept) ——
$("#btn-tour-setup").onclick = () => {
  const n = clamp(Number($("#player-count").value) || 4, 2, 8);
  const size = 1 << Math.ceil(Math.log2(n));
  const players = [];
  for (let i = 0; i < size; i++) {
    players.push({
      id: `P${i + 1}`,
      name: i < n ? `玩家 ${i + 1}` : `轮空 AI ${i + 1}`,
      human: i < n,
      picksAllowed: 4,
      team: { name: i < n ? `玩家 ${i + 1}` : `AI ${i + 1}`, players: [], coach: null },
      eliminated: false,
    });
  }
  state.tournament = { players, round: 1, bracket: [], phase: "draft", currentMatch: 0 };
  renderTournamentSlots();
  $("#btn-tour-next").disabled = false;
  $("#btn-tour-next").textContent = "开始第 1 轮选人";
};

function renderTournamentSlots() {
  const t = state.tournament;
  if (!t) return;
  $("#tour-slots").innerHTML = t.players
    .map(
      (p) =>
        `<div class="slot"><strong>${p.name}</strong><br/>可选 ${p.picksAllowed} 人<br/>已选 ${p.team.players.length} · ${
          p.team.coach ? "有教练" : "无教练"
        }${p.eliminated ? "<br/>已淘汰" : ""}</div>`
    )
    .join("");
}

$("#btn-tour-next").onclick = () => {
  const t = state.tournament;
  if (!t) return;
  if (t.phase === "draft") {
    for (const p of t.players) {
      if (p.eliminated) continue;
      while (p.team.players.length < p.picksAllowed) {
        const pack = drawPack(5, {
          excludeIds: new Set(t.players.flatMap((x) => x.team.players.map((pl) => pl.id))),
        });
        const best = pack.filter((c) => c.kind === "player").sort((a, b) => overall(b.data) - overall(a.data))[0];
        if (!best) break;
        p.team.players.push(best.data);
      }
      if (!p.team.coach) {
        const pack = drawPack(5, { includeCoach: true, excludeIds: new Set() });
        const c = pack.find((x) => x.kind === "coach");
        if (c) p.team.coach = c.data;
      }
      p.team.name = p.name;
    }
    const alive = t.players.filter((p) => !p.eliminated);
    t.bracket = [];
    for (let i = 0; i < alive.length; i += 2) t.bracket.push({ a: alive[i], b: alive[i + 1], done: false });
    t.phase = "match";
    t.currentMatch = 0;
    renderTournamentSlots();
    renderBracket();
    playNextTournamentMatch();
    return;
  }
  playNextTournamentMatch();
};

function renderBracket() {
  const t = state.tournament;
  $("#bracket").innerHTML = t.bracket
    .map((m, i) => {
      const score = m.score ? ` → ${m.score}` : m.done ? " 结束" : i === t.currentMatch ? " ← 当前" : "";
      return `<div class="match-chip">R${t.round} 比赛${i + 1}: ${m.a.name} vs ${m.b.name}${score}</div>`;
    })
    .join("");
}

function playNextTournamentMatch() {
  const t = state.tournament;
  while (t.currentMatch < t.bracket.length && t.bracket[t.currentMatch].done) t.currentMatch++;
  if (t.currentMatch >= t.bracket.length) {
    const winners = t.bracket.map((m) => m.winner).filter(Boolean);
    if (winners.length === 1) {
      $("#bracket").innerHTML += `<div class="match-chip"><strong>总冠军：${winners[0].name}</strong></div>`;
      $("#btn-tour-next").disabled = true;
      return;
    }
    t.round += 1;
    for (const p of winners) p.picksAllowed += 1;
    for (const p of t.players) if (!winners.includes(p)) p.eliminated = true;
    t.phase = "draft";
    t.bracket = [];
    renderTournamentSlots();
    $("#btn-tour-next").disabled = false;
    $("#btn-tour-next").textContent = `第 ${t.round} 轮：每人多 1 次选人，继续`;
    return;
  }
  const m = t.bracket[t.currentMatch];
  const youSide = m.a.human ? "home" : m.b.human ? "away" : "home";
  openSetup(m.a.team, m.b.team, youSide);
}

function applyTournamentResult(snap) {
  const t = state.tournament;
  if (!t || t.phase !== "match") return;
  const m = t.bracket[t.currentMatch];
  if (!m || m.done) return;
  m.done = true;
  m.score = `${snap.score.home}-${snap.score.away}`;
  m.winner = snap.score.home >= snap.score.away ? m.a : m.b;
  const loser = m.winner === m.a ? m.b : m.a;
  loser.eliminated = true;
  // Advancement injuries for winner's roster (loser is out)
  const inj = rollAdvancementInjuries(m.winner.team.players || [], {
    round: t.round,
    intensity: 1.1,
  });
  const injText = inj
    .filter((r) => r.type === "injury")
    .map((r) => r.text)
    .slice(0, 2)
    .join("；");
  t.currentMatch += 1;
  renderBracket();
  renderTournamentSlots();
  $("#btn-tour-next").disabled = false;
  $("#btn-tour-next").textContent = "继续淘汰赛";
  const cont = $("#btn-result-continue");
  cont.hidden = false;
  cont.textContent = "继续淘汰赛";
  if (injText) {
    $("#result-summary").textContent = `晋级成功。伤病：${injText}`;
  }
  cont.onclick = () => {
    show("tournament");
  };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

async function boot() {
  try {
    initBgm();
    $("#load-status").textContent = "正在加载名册（优先本地缓存）…";
    $("#load-bar").style.width = "6%";
    // Paint status before heavy work begins
    await new Promise((r) => requestAnimationFrame(() => r()));
    let sawBuild = false;
    let sawCache = false;
    await loadPlayers((p, phase) => {
      const pct = Math.max(6, Math.round(p * 100));
      $("#load-bar").style.width = `${pct}%`;
      if (phase === "cache") {
        sawCache = true;
        $("#load-status").textContent = `读取本地缓存 ${pct}%…`;
      } else if (phase === "download") {
        $("#load-status").textContent = "下载 / 解析 JSON…";
      } else if (phase === "build") {
        sawBuild = true;
        $("#load-status").textContent = `构建赛季卡与暗属性 ${pct}%（首次较慢，完成后会分块写入缓存）…`;
      } else {
        $("#load-status").textContent = "即将进入主界面…";
      }
    });
    clearPeakPoolCache();
    window.__rosterBootOk = true;
    $("#load-bar").style.width = "100%";
    $("#load-status").textContent =
      sawCache && !sawBuild
        ? `已从本地缓存加载 ${PLAYERS.length} 张赛季卡`
        : `已加载 ${PLAYERS.length} 张赛季卡（已写入本地缓存，下次秒开）`;
    const wd = $("#load-watchdog");
    if (wd) wd.hidden = true;
    const poolNote = document.querySelector(".hint-panel ul");
    if (poolNote) {
      const li = document.createElement("li");
      li.textContent = `卡池 ${PLAYERS.length} 张；换人面板显示板凳头像与属性；传奇模式可从八队历史球员自选位置组队。`;
      poolNote.appendChild(li);
    }
    const discovered = readRootSave() || migrateLegacySaves()?.root || null;
    state.longCareerRoot = discovered;
    refreshAccountHomeBar();
    setTimeout(() => show("home"), 200);
  } catch (e) {
    console.error(e);
    const quotaError = /quota|storage quota|存储空间/i.test(e?.message || "");
    $("#load-status").textContent = quotaError
      ? `本地存档写入失败：${e.message}。名册本身未必损坏。`
      : `名册加载失败：${e.message}。请确认用本地服务器打开（当前应为 http://127.0.0.1:5173）。`;
    const tip = $("#load-watchdog");
    if (tip) {
      tip.hidden = false;
      if (quotaError) {
        tip.innerHTML = "请清理名册缓存后重启：<button type=\"button\" class=\"btn small\" id=\"btn-recover-storage\">清理缓存并重启</button>";
        $("#btn-recover-storage")?.addEventListener("click", async () => {
          await clearRosterCache();
          try { localStorage.removeItem("cls_root_v3_tmp"); } catch (_) { /* best effort */ }
          location.reload();
        });
      } else {
        tip.textContent = "可尝试强制刷新（Cmd+Shift+R），或点主页「清除名册本地缓存」后再开。";
      }
    }
  }
}

$("#btn-clear-roster-cache")?.addEventListener("click", async () => {
  const btn = $("#btn-clear-roster-cache");
  if (btn) btn.disabled = true;
  try {
    await clearRosterCache();
    alert("名册缓存已清除。刷新页面将重新下载并构建赛季卡。");
  } catch (e) {
    alert(`清除失败：${e.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
});

boot();
