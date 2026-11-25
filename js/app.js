import { matchupPlanFor, resolveEffectiveGameplan } from "./engine/effectiveGameplan.js";
import { TIMEOUT_TIER_LABELS, TIMEOUT_TIERS, normalizeTimeoutTier } from "./engine/timeoutTiers.js";
import {
  accountToTeam,
  coachRecordLabel,
  createAccount,
  deleteAccount,
  discardCorruptAccountStore,
  finalizeOnboarding,
  getAccount,
  getActiveAccountId,
  getCorruptAccountsBackup,
  isAccountStoreCorrupt,
  listAccounts,
  recordRankedResult,
  resolveCoach,
  rememberPlayerPrefs,
  resolvePlayers,
  ownedCoaches,
  rollCoachOffers,
  saveAccount,
  setActiveAccountId,
  setAccountCoach,
  setAccountTactic,
} from "./data/account.js";
import {
  craftWishCard,
  drawStarterFive,
  pendingRollChoice,
  resolvePendingRoll,
  setWishlist,
  starUpWithSouls,
} from "./data/accountGacha.js";
import { bannerStats, currentBanners, daysUntilRotation } from "./data/gacha.js";
import { readIdentity } from "./data/profile.js";
import { searchPeople } from "./data/cardSearch.js";
import { playerLegacyBadge } from "./data/playerLegacy.js";
import { careerPhaseLabelL, playerCardHtml } from "./ui/playerCard.js";
import { applyRankedGame, progressNoteText, setFavorite } from "./data/accountProgress.js";
import { mountSandbox } from "./ui/sandboxView.js";
import { createHalfCourtScreen } from "./ui/halfCourtView.js";
import { createTrainingScreen } from "./ui/trainingView.js";
import { ensureDuelScreen, handleDuelBack, initDuelView, openDuelAvatarChallenge, openDuelChallenge, openDuelSelect, paintDuelRecordsIntoMyWorld } from "./ui/duelView.js";
import { buySkillOffer } from "./engine/skillShopPurchase.js";
import { createRebornView } from "./ui/reborn/rebornView.js";
import { createRelationshipsView } from "./ui/relationshipsView.js";
import { createLegacyMuseumView } from "./ui/legacyMuseumView.js";
import { relocalizeShellScreens, scrollScreenToTop, focusScreenHeading } from "./ui/screenShell.js";
import { createMyHome } from "./ui/myHome/myHomeScreen.js";
import { createCareerInboxView } from "./ui/careerInboxView.js";
import { createCoachingMomentView } from "./ui/coachingMomentView.js";
import { createDraftGambleView } from "./ui/scoutingView.js";
import { createGmBusinessView } from "./ui/gmBusinessView.js";
import { createNetworkView } from "./ui/networkViews.js";
import { livePlayerIntent, livePlayerSuggestions, liveTeamSuggestion } from "./ui/liveLineupSuggestions.js";
import { getLang, setLang, applyStaticLang, L, skillNameL, teamNameL } from "./i18n.js";
import { gradeReasonLabel } from "./engine/grade.js";
import { navPush, navPop, resolveDrawBack, resolveResultBack } from "./ui/navBack.js";
import { freezeDiag, startFreezeDiag } from "./core/freezeDiag.js";
import { canClaimDailyDraw, claimDailyDraw, dailyDrawState, grantNote, grantWelcomeTickets, recordCareerTasks, recordChallengeProgress, recordRankedTasks, taskBoard } from "./data/dailyTasks.js";
import { MIN_COMPETITIVE_ROSTER, competitivePlayersNeeded, competitiveUnlocked } from "./data/competitiveGate.js";
import { XP_TABLE, awardAccountXp, levelSnapshot, levelTitle, madePlayoffs, recordDailyLogin, xpGainNote } from "./data/accountLevel.js";
import {
  codexProgress,
  cardRoom,
  junkIds,
  recycleCards,
  recycleValue,
} from "./data/accountRecycle.js";
import { manageBarHtml, recycleButtonHtml } from "./ui/collectionManageView.js";
import { applyCollectionView, cachedOvrOf, decadesOf, filterBarHtml, freshFilter, redundantIds } from "./ui/collectionFilter.js";
import {
  bannerExplainHtml,
  bannerPickerHtml,
  drawRevealHtml,
  drawRulesHtml,
  drawStatusHtml,
  favoriteControlHtml,
  tasksHtml,
  hiddenBadgesHtml,
  rollChoiceHtml,
  soulButtonHtml,
  soulStarNotice,
  wishlistHtml,
} from "./ui/gachaView.js";
import {
  feedActorId,
  feedRowHtml,
  resolveMatchColors,
  teamCodeOf,
} from "./ui/feedView.js";
import { createRunTracker } from "./ui/feedRuns.js";
import {
  COACHES,
  TACTICS,
  TACTIC_GROUPS,
  applyCoachPhilosophy,
  availableTactics,
  coachSpecialtyLabel,
  coachName,
  coachStyle,
  coachNote,
  tacticName,
  tacticDesc,
  tacticGroupName,
  asstName,
  coachTactics,
  ensureTeamStaff,
  isLegendCoach,
  isObscureStaff,
  tacticUnlockHint,
} from "./data/coaches.js";
import { FRANCHISES, POS_SLOTS, franchiseName, playersForFranchise } from "./data/franchises.js";
import { makeFranchiseCareerTeam, makeRandomCareerTeam, makeYearChallengeTeam } from "./career/careerTeams.js";
import { esc } from "./core/html.js";
import { installImgErrorFallback } from "./core/imgErrorFallback.js";
import { careerCoachPrice, rollCareerCoachShop } from "./career/coachMarket.js";
import { coachMarketCardHtml, skillOfferCardHtml } from "./ui/careerMarketCards.js";
import {
  applyLineupPositionEffects,
  isPlayerAvailable,
  marketMeta,
  playerPrice,
  rollAdvancementInjuries,
  topIntangibles,
} from "./data/intangibles.js";
import {
  CUSTOM_BUDGET,
  CUSTOM_ROSTER_SIZE,
  clearPeakPoolCache,
  customPriceOf,
  drawZeroCostPack,
  listPaidPeaks,
  readDuelFillerMode,
  recommendRolePick,
  writeDuelFillerMode,
} from "./data/customPool.js";
import { photoImg } from "./data/photo.js";
import { seasonAwardsHtml } from "./ui/seasonAwardsView.js";
import { teamColors } from "./data/teamColors.js";
import { subAttrChipsHtml } from "./ui/rotationBoard.js";
import { learnedSkillIds } from "./ui/learnedBadge.js";
import { LOCAL_AVATARS } from "./data/avatars.local.js";
import { creditRows, creditsHtml } from "./ui/creditsView.js";
import { setupBoardHtml, setupRosterModel, setupRosterStatus } from "./ui/setupRosterView.js";
import { playoffsHtml, playoffsPromptHtml } from "./ui/seasonPlayoffsView.js";
import { draftMoneyLabelHtml, draftTitle } from "./ui/draftChrome.js";
import { legendChipsHtml, legendPosHtml, resumeRoute, resumeSettings } from "./ui/saveResume.js";
import { advanceCopy, anotherGameCopy, championCopy, eliminatedCopy, seriesGameCopy } from "./ui/careerResultCopy.js";
import { hubHeading, nextCardView } from "./ui/seasonHubView.js";
import { marketHtml } from "./ui/seasonMarketView.js";
import { DEV_ENTRY_DELAY_MS, devEntriesFromSearch } from "./ui/devEntries.js";
import { tradeColumnsHtml, tradeSummaryText } from "./ui/tradeBoardView.js";
import { rotationBoardHtml } from "./ui/seasonRotationView.js";
import { offseasonRecap } from "./ui/offseasonRecap.js";
import { valueBadge, valueBadgeHtml } from "./ui/valueBadge.js";
import {
  loadPlayers,
  overall,
  physiqueLabel,
  PLAYERS,
  clonePlayer,
  deriveSubAttributes,
  playersReady,
  assertPlayersReady,
  isPlayersReady,
} from "./data/players.js";
import { audio } from "./audio/index.js";
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
  deleteCareerSave,
  createRootState,
  exportRootSave,
  importRootSave,
  migrateLegacySaves,
  readRootSave,
  ROOT_SAVE_KEY,
  writeRootSave,
  writeRootSaveFreeingOrphans,
} from "./data/saveRoot.js";
import {
  grantSkillToPlayer,
  markPurchasedSkill,
  meetsHardGates,
  skillSlotsFull,
  purchasedSkillsRefund,
  removableSkills,
  removeSkillFromPlayer,
  rollSkillShopOffers,
  skillChipsHtml,
  poolRoleLine,
  skillDesc,
  SKILL_PACKS,
  SKILL_SELL_RATE,
  syncTeamDuoSkills,
} from "./data/skills.js";
import { lineupBallNote, lineupFit, teamChemistry } from "./engine/chemistry.js";
import { clamp, shuffle } from "./core/seededRandom.js";
import { fmtClock } from "./core/format.js";
import { meterText } from "./ui/teamStats.js";
import {
  acceptTradeProposal,
  counterTradeProposal,
  declineTradeProposal,
  ensureTradeProposals,
  listPlayerForTrade,
  listedPlayerIds,
  refreshTradeProposals,
  unlistPlayerForTrade,
} from "./engine/tradeProposals.js";
import { setListingPref } from "./engine/tradeListing.js";
import {
  DRAFT_FREE_REFRESHES,
  advanceTurn,
  autoFillTeam,
  exhibitionTeams,
  customSideCanSpend,
  customSpendPhaseDone,
  draftRefreshCost,
  drawPack,
  isDraftDone,
  pickCost,
  teamPowerLabel,
} from "./engine/draft.js";
import { selectFinalsMvp } from "./engine/allTeam.js";
import {
  allPodsDone,
  applyCareerInjuryWave,
  applyMatchResult,
  buildStagePods,
  careerStageLabel,
  collectAdvancers,
  computeCareerAllTeam,
  findYourOpenMatch,
  finalizePod,
  finalsSeriesLabel,
  kindLabel,
  listPodMatches,
  nextCareerMatch,
  nextStageSize,
  noteCareerAllTeamGame,
  noteCareerFinalsGame,
  noteCareerLoss,
  recordFinalsGame,
  runCpuMatchInto,
  startFinalsSeries,
  upgradeCpuAdvancers,
  yourCareerMatch,
  progressPodAfterMid,
  progressPodAfterOpeners,
} from "./engine/careerBracket.js";
import {
  buildAffordableShop,
  careerRefreshCost,
  rollScoutPackOffer,
  chargeScoutPack,
  scoutPacksOn,
  analystFitVisible,
  teamStarters,
  careerResultReward,
} from "./engine/careerEconomy.js";
import {
  advanceLeagueOffseason,
  seasonGames,
  advancePlayoffs,
  openSeries,
  simPlayoffDay,
  advanceToUserGame,
  clearSeasonSave,
  computeFinalsAllTeam,
  computeFinalsMvp,
  createSeason,
  hasSeasonSave,
  loadSeason,
  nextUserGame,
  nextUserPlayoffGame,
  prepareSeasonState,
  recordUserLivePlayoffResult,
  recordUserLiveResult,
  saveSeason,
  seasonProgressLabel,
  seasonStaffBonus,
  simAllPlayoffs,
  simScheduledGame,
  simUserNextGame,
  simUserNextPlayoffGame,
  snapFromResultLog,
  standingsList,
  startPlayoffs,
  userGamesPlayed,
} from "./engine/season.js";
import {
  HISTORICAL_CHAMPION_CHALLENGERS,
  HISTORICAL_PLAYOFF_CHALLENGERS,
  challengeTierMeta,
  nextChallengeTier,
  challengeTierName,
} from "./data/careerChallenges.js";
import { challengeArchiveEntry, duelArchiveEntry, makeRunId, readChallengeArchive, recordChallengeArchive } from "./data/challengeArchive.js";
import { historicalLadder, historicalUpsideHint } from "./engine/develop.js";
import {
  HISTORICAL_YEARS,
  historicalSeason,
  listHistoricalYears,
} from "./data/historicalSeasons.js";
import { summarizeMatchResult } from "./engine/matchExplain.js";
import { foldBatch, settleGame } from "./career/gameRewards.js";
import { goalsForNextGame, liveGoalProgress, settleGameGoals } from "./career/gameGoals.js";
import { awardGrowth } from "./career/playerGrowth.js";
import { awardEpiphany, gameFingerprint } from "./career/seasonEpiphany.js";
import { settleBuzz } from "./data/buzz.js";
import { awardCoachXp, developmentXpMultiplier, tacticsShotBonus } from "./career/coachPerks.js";
import { ensureCoachProfile } from "./career/coachProfile.js";
import { teamRosterStrength } from "./career/seasonGoals.js";
import { batchHtml, postGameHtml } from "./ui/careerPostGameView.js";
import { liveGoalsHtml } from "./ui/liveGoals.js";
import { pregameCardHtml } from "./ui/pregameCard.js";
import { createMatchupController } from "./ui/matchupController.js";
import { createBestCardIndex } from "./data/bestCardIndex.js";
import {
  advanceCareerOffseason,
  completeCareerOffseason,
  createLeagueCareer,
  forfeitCareerDraftPick,
  hasExistingCareerRoot,
  isSeasonProgressMode,
  makeCareerDraftPick,
  prepareCareerOffseason,
  recoverCareerPhase,
  resolveRootLiveGame,
  suggestCareerDraftPick,
  upgradeLeagueCareerManagement,
} from "./modes/leagueCareer.js";
import { canDo, careerRole, denyMessage } from "./career/careerGuards.js";
import { setPrologueRole } from "./modes/timeTravelCareer.js";
import { swapDraftPicks } from "./engine/leagueDraft.js";
import {
  careerForPersistence,
  isManagedCareer,
  runCareerTransition,
  seasonPhaseLabel,
} from "./modes/leagueCareerPhase.js";
import {
  recommendDevelopmentPlans,
  reconcileDevelopmentPlans,
  setDevelopmentPlan,
} from "./modes/playerDevelopment.js";
import { careerIsOver, createTimeTravelScreen } from "./ui/timeTravel/screen.js";
import {
  renderCareerHistory,
  renderDevelopmentPlans,
  renderDraftBoard,
} from "./ui/leagueManagementView.js";
import {
  buildRosterEvaluation,
  renderRosterEvaluation,
} from "./ui/rosterEvaluationView.js";
import { buildTradeComparison, renderTradeComparisonHtml } from "./engine/tradeComparison.js";
import { decorateHome } from "./ui/homeShowcase.js";
import { initCareerEntry, refreshCareerEntry } from "./ui/careerEntry.js";
import {
  architectUnlocked,
  completionFromRoot,
  recordCareerCompletion,
} from "./career/careerAchievements.js";
import { wireHomeTabs } from "./ui/homeTabs.js";
import { syncTabbar } from "./ui/bottomNav.js";
import { createMyWorld } from "./ui/myWorldScreen.js";
import { chooseAvatarMount } from "./ui/avatarMount.js";
import { createGate, deferUntil } from "./ui/bootGate.js";
import { createCoachDrawer } from "./ui/coachDrawer.js";
import { createCoachMode, simpleTactics } from "./ui/coachMode.js";
import { archiveSummaryLine } from "./ui/myWorldView.js";
import { createPlayerVoice } from "./ui/playerVoice.js";
import { createShop } from "./ui/shopView.js";
import { ticketBalance, autoXpRemaining, consumeAutoTickets, awardAutoGameXp } from "./data/shop.js";
import { LEGEND_LOCATIONS } from "./data/hometown/legendLocations.js";
import { readHometownState, recordChallengeResult } from "./data/hometown/hometownState.js";
import { buildChallengeTeam, pickOpponentTeam } from "./data/hometown/hometownChallenge.js";
import { portraitFor } from "./ui/portraitFor.js";
import { createMyTeamLineup } from "./ui/myTeamLineupScreen.js";
import { createMyTeamClubhouse } from "./ui/myTeamClubhouseScreen.js";
import { clearMyTeamLineup, saveMyTeamLineup } from "./myteam/lineupStore.js";
/** My World controller (ADR-008 N-1); created in boot(). `?.` everywhere so early callers are safe. */
let myWorld = null;
// Opens when boot finishes (roster loaded). The 2D avatar layers (~700 KB) wait for it so they do not compete with the roster download.
const bootGate = createGate();
let myTeamLineup = null;
let myTeamClubhouse = null;
let activateHomeTab = null; // set once the home tabs are wired (wireHomeTabs returns it)
import {
  FAMILY_DUEL_THEMES,
  autoFillFamilySide,
  buyIntoFamilySide,
  familyDuelPool,
  familyDuelReadyToStart,
  familyDuelShop,
  freshFamilySide,
} from "./modes/familyDuel.js";
import { confirmAction } from "./ui/confirmModal.js";
import { myTeamSig, careerSig, foreignOwnerOf, ForeignSaveError, GUEST, hiddenFromMe, keyHasData, markSessionResumed, markSlotResumed, saveVisibility, seasonSig, sessionSig, slotLockReason, stampLegacySaves } from "./data/saveOwnership.js";
import { buildMyTeamSeason } from "./myteam/mySeason.js";
import { myTeamResult, recordMyTeamResult, seasonRecordSummary } from "./myteam/seasonRecord.js";
import { grantSeasonGold } from "./myteam/seasonRewards.js";
import { seasonObjectives, seasonReport } from "./myteam/seasonReport.js";
import { objectivesHtml, reportHtml } from "./ui/myTeamReportView.js";
import { clearMyTeamSeason, hasMyTeamSeason, loadMyTeamSeason, readMyTeamSeason, saveMyTeamSeason } from "./myteam/seasonStore.js";
import { speedLocked } from "./ui/playbackSpeed.js";
import { normalizePos } from "./data/positions.js";
import { composeGameplan } from "./ui/tactics/tacticalDraft.js";
import { mountTacticsBoard } from "./ui/tactics/tacticsBoardView.js";
import { createMatch3dController } from "./ui/match3dController.js";
import { createArenaCues } from "./match/presentation/arenaCues.js";
import { PLAY_NOW_TIP_KEY, markTipSeen, shouldShowTip } from "./ui/firstRunTip.js";
import {
  SEASON_MAX_ROSTER,
  SEASON_MIN_ROSTER,
  SEASON_SALARY_CAP,
  cutPlayer,
  executeTrade,
  executeThreeTeamTrade,
  fireAssistant,
  fireCoach,
  formatSalary,
  hireAssistant,
  hireCoach,
  payrollSummary,
  playerSalary,
  refreshFreeAgency,
  refreshStaffMarket,
  signFreeAgent,
  upcomingUserGames,
} from "./engine/seasonMarket.js";
import { recommendTradePackage } from "./engine/tradeBuilder.js";
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
  TEMPO_OPTIONS,
  applyRotationPlan,
  captureRotationPlan,
  setupPlayerList,
  autoBuildAllPacks,
  applyRecommendedDefaults,
  ensurePlayerDefaults,
  ensurePlayerOrders,
  ensureRoles,
  getTempoDef,
  groupByPosition,
  liveStarterIds,
  markOrdersManual,
  markPlayPosManual,
  nextEmptyPlayPos,
  normalizeTempo,
  ordersLabel,
  planLabel,
  recommendPlayPos,
  resolveStarterPositionCollisions,
  suggestedBallHandlerAction,
  toggleStarter,
  usageForBallAction,
} from "./engine/gameplan.js";
import { screenFiveFromPlan, seatPlayers, setupStarters } from "./engine/lineupSlots.js";
import { orderSelectHtml, setupCardOrdersHtml } from "./ui/setupCardOrders.js";
import { setupCardRoleHtml } from "./ui/setupCardRoles.js";
import { setupCardMoreHtml, setupKeyStatsHtml } from "./ui/setupCardView.js";
import {
  suggestTargetMinutes,
} from "./data/playerMinutes.js";
import { MATCHUP_NEAR_POS, buildSamePosMatchups, matchupPosOf, sortByMatchupPos } from "./engine/matchups.js";
import { CourtView } from "./engine/court.js";
import { CourtView3D, captureClutchReplaySnapshot, buildReplayShot } from "./engine/court3d.js";
import { GameSim, suggestDefenseScheme } from "./engine/sim.js";
import {
  createClutchController,
  explainClutchOutcome,
  initializeScenario,
  startClutchSim,
} from "./engine/clutchController.js";
import { classifyClutchRole } from "./engine/clutchRole.js";
import { createDomainEventAdapter } from "./engine/domainEvents.js";
import { createMatchEventsSession } from "./ui/matchEventsController.js";
import { createTacticalTakeover } from "./engine/tacticalTakeover.js";
import {
  syncFormToTeams,
} from "./engine/form.js";
import { marketOwnedCard, playerMarketCardHtml } from "./ui/marketCards.js";

/** @deprecated prefer careerStageLabel(stageSize) */
const CAREER_ROUND_LABELS = {
  1: "三十二强 · 32进16",
  2: "十六强 · 16进8",
  3: "八强 · 8进4",
  4: "四强 · 4进2",
  5: "总决赛 · 2进1",
};

const $ = (sel) => document.querySelector(sel);
const screens = {
  loading: $("#screen-loading"),
  home: $("#screen-home"),
  account: $("#screen-account"),
  onboard: $("#screen-onboard"),
  myTeamLineup: $("#screen-my-team-lineup"),
  collection: $("#screen-collection"),
  credits: $("#screen-credits"),
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
  sandbox: $("#screen-sandbox"),
  familyDuel: $("#screen-family-duel"),
  clutch: $("#screen-clutch"),
  clutchPlay: $("#screen-clutch-play"),
  clutchResult: $("#screen-clutch-result"),
  clutch3d: $("#screen-clutch-3d"),
  halfCourt: $("#screen-halfcourt"),
  training: $("#screen-training"),
};

/**
 * Legend Duel entry for the Gallery (owned by the Gallery agent in parallel):
 * its "挑战" button calls window.CourtsideDuel?.challenge(legendId). False when
 * the duel screen isn't ready yet or the legend is unknown — the Gallery then
 * falls back to the player profile. The screen itself is created in boot().
 */
window.CourtsideDuel = {
  challenge: (legendId) => openDuelChallenge(legendId),
  challengeAvatar: (legendId) => openDuelAvatarChallenge(legendId),
};

let state = {
  mode: null,
  draft: null,
  setup: null,
  pendingMatch: null,
  career: null,
  familyDuel: null,
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
  clutch: null,
  clutch3d: null,
  duel: null,
  lineupSig: "",
  court: null,
  subOutId: null,
  subInId: null,
  onboard: null,
  autoOffense: false,
  autoDefense: false,
  autoRotation: false,
  timeoutTier: "balanced",
};

/**
 * Back-button standard (docs/implementation/back-button-layering-design.md):
 * a minimal nav stack makes "back" mean "previous screen" by construction.
 * - entering home (root), result (terminal) or market (L1 career hub) clears
 *   the trail — market must clear, or back from it would pop to setup and
 *   ping-pong market <-> setup through the career loop;
 * - result/game are transient and are never pushed as back targets;
 * - re-entering a screen already on the trail truncates it there (no
 *   market <-> setup ping-pong through a stale entry);
 * - a few screens keep an explicit back mechanism (account return-tracking,
 *   onboarding wizard, setup's state-dependent parent, result's origin-aware
 *   #btn-home, game's pause overlay) — see js/ui/navBack.js.
 */
const navStack = [];
let navPopping = false;

/** B116 bottom tab bar: shown on the hub screens only, lit for where the player is (js/ui/bottomNav.js). */
function syncAppTabbar(name = activeScreenName()) {
  syncTabbar(document, name, screens.home?.dataset.homeTab);
}

function show(name) {
  if (!screens[name]) {
    // U-P2-8: an unknown name used to clear every screen's .active and then
    // throw on screens[name].classList — a blank page only a refresh could
    // fix. Log and stay on the current screen instead (no stack push, no
    // .active changes).
    console.error(`show(): unknown screen "${name}"`);
    return;
  }
  const from = activeScreenName();
  freezeDiag()?.noteScreen(name); // freeze diagnostic: last screen before a stall
  refreshGoldChip(); // the top-bar gold balance is visible on every screen
  audio.screen(name, { year: state.season?.year });
  if (from === name) {
    // Same-screen re-show (re-render flows): no stack change.
    Object.values(screens).forEach((el) => el && el.classList.remove("active"));
    screens[name].classList.add("active");
    syncAppTabbar(name);
    if (name === "home") {
      refreshAccountHomeBar();
      refreshSaveHomeBar();
      refreshLongCareerHomeBar();
    }
    return;
  }
  if (!navPopping) navPush(navStack, from, name);
  Object.values(screens).forEach((el) => el && el.classList.remove("active"));
  screens[name].classList.add("active");
  syncAppTabbar(name);
  // Static screens have no Shell observer: reuse the Shell's scroll-to-top
  // + focus-to-heading on navigation (A-P2-11). Shell screens already do
  // this via their MutationObserver (el.__shell), so skip them. Same-screen
  // re-show intentionally does not scroll/focus (re-render flows must not
  // steal focus mid-interaction).
  const target = screens[name];
  if (target && !target.__shell) {
    scrollScreenToTop(target);
    // Focus on the next frame: focusing now forced a full synchronous layout (~230 ms on the home screen at boot)
    // before the home bars below had even been written, so layout ran twice. Skip it if the screen changed or the
    // player already moved focus somewhere real in the meantime.
    const focusLater = () => {
      if (!target.classList.contains("active")) return;
      const cur = document.activeElement;
      if (cur && cur !== document.body && target.contains(cur)) return;
      focusScreenHeading(target);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focusLater);
    else focusLater();
  }
  if (name === "home") {
    refreshAccountHomeBar();
    refreshSaveHomeBar();
    refreshLongCareerHomeBar();
  }
}

/** Pop one layer; empty trail -> home. Never pushes (the pop itself is the move). */
function goBack() {
  const prev = navPop(navStack);
  if (prev && screens[prev]) {
    navPopping = true;
    try {
      show(prev);
    } finally {
      navPopping = false;
    }
  } else {
    show("home");
  }
}

/**
 * One back action for every entry point (top-left back control, Escape).
 * Screens with their own back semantics keep them; everything else pops the
 * nav stack. Never browser history (no pushState/popstate anywhere).
 */
function handleBack() {
  const current = activeScreenName();
  if (current === "game") {
    // Back from a live game = pause (same action as the 暂停模拟 button);
    // paused already -> resume. Leaving is the pause overlay's 保存并离开.
    $("#btn-pause-sim")?.click();
    return;
  }
  if (current === "onboard") {
    // Wizard step-back; at step 1 the cancel path (with its confirm) applies.
    const prev = $("#btn-onboard-prev");
    if (prev && !prev.hidden) {
      prev.click();
      return;
    }
    $("#btn-onboard-cancel")?.click();
    return;
  }
  if (current === "clutch3d") {
    // Back from the 3D replay = the 2D result page (dispose the view).
    closeClutch3dReplay();
    return;
  }
  if (current === "duel") {
    // Back from a duel (select / live match / result) = the screen's own
    // back action: destroy the live court controller first (its document
    // keydown + pointer listeners and timers), then go back. Esc used to
    // fall through to goBack() and leak the controller onto the next
    // screen, where arrow/number keys still drove the hidden duel (U-P1-2).
    handleDuelBack();
    return;
  }
  if (current === "clutchResult") {
    // Back from a finished challenge = the challenge entry (never the dead play screen).
    show("clutch");
    return;
  }
  if (current === "clutchPlay") {
    // Back from the decision window abandons the attempt (invalidates the open id).
    cancelClutchChallenge();
    goBack();
    return;
  }
  if (current === "result") {
    // Result's back is origin-aware (#btn-home); when it is hidden (eliminated
    // / champion-final) the primary action is the only exit — use it.
    const homeBtn = $("#btn-home");
    if (homeBtn && !homeBtn.hidden) {
      homeBtn.click();
      return;
    }
    $("#btn-result-continue")?.click();
    return;
  }
  if (current === "timeTravel") {
    // Inside the create flow, step back from the offers list to the wizard.
    const zone = $("#tt-offers-zone");
    if (zone && !zone.hidden) {
      zone.hidden = true;
      $("#time-travel-create")?.scrollIntoView({ block: "start" });
      return;
    }
    goBack();
    return;
  }
  goBack();
}

// Escape goes back one layer, same as the top-left back control. Any open native
// <dialog> (confirm, shop, ...) handles its own Escape: we must not preventDefault it
// (that blocks the close) nor navigate the screen underneath. While typing in a field,
// Escape first blurs the field instead of navigating away.
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  if (document.querySelector("dialog[open]")) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    document.activeElement.blur();
    return;
  }
  handleBack();
  e.preventDefault();
});

function activeScreenName() {
  for (const [k, el] of Object.entries(screens)) {
    if (el?.classList.contains("active")) return k;
  }
  return "home";
}

function buildSaveLabel() {
  const lang = getLang();
  if (state.sim) {
    const s = state.sim.snapshot();
    const q = s.quarter > 4 ? "OT" : `Q${s.quarter}`;
    return lang === "en" ? `Game ${q} ${s.score.home}-${s.score.away}` : `比赛 ${q} ${s.score.home}-${s.score.away}`;
  }
  if (state.draft) {
    const a = state.draft.teams?.A?.players?.length ?? 0;
    const b = state.draft.teams?.B?.players?.length ?? 0;
    return lang === "en" ? `Draft ${state.draft.mode || state.mode || ""} · ${a}/${b} players` : `选秀 ${state.draft.mode || state.mode || ""} · ${a}/${b}人`;
  }
  if (state.setup) return lang === "en" ? `Pre-game starters ${state.setup.selected?.size ?? 0}/5` : `赛前选首发 ${state.setup.selected?.size ?? 0}/5`;
  if (state.legend) return lang === "en" ? `Legendary team build · picked ${state.legend.roster?.length ?? 0}` : `传奇组队 · 已选 ${state.legend.roster?.length ?? 0}`;
  if (state.career?.kind === "career") {
    const tier = challengeTierName(state.career.challengeTier || "gold", lang);
    const stage = careerStageLabel(state.career.stageSize, {
      finals: !!state.career.finals,
      lang,
    });
    return `${tier} · ${stage}`;
  }
  if (state.career?.kind === "duel") return lang === "en" ? "Duel progress" : `双人模式进度`;
  if (state.tournament) return lang === "en" ? "Knockout progress" : `淘汰赛进度`;
  return lang === "en" ? `Progress · ${state.mode || activeScreenName()}` : `进度 · ${state.mode || activeScreenName()}`;
}

/** 金币晋级赛自动存档（静默），防止误退丢进度 */
/** The sim of a game still in progress (null once its final buzzer went: onEnd marks it in state.finishedSim). */
function liveGameSim() {
  return state.sim && state.sim !== state.finishedSim ? state.sim : null;
}

function autosaveCareer() {
  if (!state.career || state.career.kind !== "career") return false;
  const screen = activeScreenName();
  let forceScreen = "market";
  if (liveGameSim()) forceScreen = "game";
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
        matchEvents: state.matchEvents?.exportState() || null,
      }
    : null;
  return createRootState({
    activeMode: state.mode === "timeTravel" ? "timeTravel" : "franchise",
    profile: {
      accountId: getActiveAccountId() || null,
      settings: {},
      accessibility: {},
    },
    // Like liveGame below: `state` has no top-level mirror of root.coach (only finance.js's
    // handlers and resumeLongCareer() ever touch it), so without this fallback every snapshot
    // here would silently reset the coach's cash/housing/investments back to
    // createRootState()'s brand-new default -- E3's whole point is that salary/purchases
    // persist, so this must read whatever was last written to state.longCareerRoot.
    coach: state.longCareerRoot?.coach,
    // Prestige (The Architect, 3+1): the identity marker (incl. the
    // prestige stamp) is carried forward the same way, so a career
    // stamped on its first save keeps its role on every later save.
    identity: state.longCareerRoot?.identity,
    leagueCareer,
    story: state.story,
    liveGame: resolveRootLiveGame(
      liveGame,
      includedLiveGame,
      state.longCareerRoot?.liveGame,
    ),
  });
}

function downloadLongCareerExport(root) {
  const blob = new Blob([exportRootSave(root)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "courtside-legends-save.json";
  link.click();
  URL.revokeObjectURL(url);
}

/** D-P1-2: download the quarantined raw bytes of a corrupt account store, so the player keeps a copy. */
function downloadCorruptAccountsBackup() {
  const backup = getCorruptAccountsBackup();
  if (!backup) return;
  const blob = new Blob([backup], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "courtside-legends-accounts-corrupt-backup.json";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * A failed long-career save almost never means "the save itself is too big" -- a full 30-team
 * historical season plus years of career history compacts down to roughly 1MB, well under any
 * normal browser quota. In practice this fires because something ELSE on the origin ate the
 * quota first: private/incognito mode (some browsers give that ~0 bytes), a nearly-full device
 * (mobile Safari shrinks site quotas hard when disk space is low), or -- before this fix --
 * orphaned legacy save keys nobody ever deleted. saveLongCareer() already retries once after
 * clearing those orphans, so if we're here it likely needs a human to free up real space. Don't
 * just dead-end on an alert: offer an immediate export of the attempt that didn't make it in,
 * so the player doesn't lose progress while they sort out storage.
 */
async function offerLongCareerExportAfterSaveFailure(unsavedAttempt) {
  if (lastLongCareerSaveError instanceof ForeignSaveError) {
    // not a storage problem: the slot is protected (another player's, or an unlinked save) -- no export prompt
    void foreignSaveNotice("career", lockReasonFor("career", { sig: careerSig(unsavedAttempt) }) || lastLongCareerSaveError.reason);
    return;
  }
  // "invalid root save" (and the two version-mismatch messages) are thrown by validateRoot()
  // *before* writeRootSave() ever touches localStorage -- that is a bug in this build's save
  // data, not the browser or the device. Blaming storage for it sends the player off clearing a
  // cache that was never the problem (and risks them nuking real saves chasing a ghost).
  const schemaBug = /invalid root save|unsupported older game version|newer game version/.test(
    lastLongCareerSaveError?.message || "",
  );
  const reason = schemaBug
    ? "这是游戏本身的存档格式 bug，不是你的设备或浏览器问题——清缓存、换设备都没用，请把这条报错告诉开发者。"
    : "常见原因：隐私/无痕浏览模式、设备存储空间快满了、或浏览器这个网站的存储配额被其他数据占满。";
  const reasonEn = schemaBug
    ? "This is a save-format bug in the game itself, not a problem with your device or browser — clearing cache or switching devices won't help. Please report this error to the developer."
    : "Common causes: private/incognito mode, nearly full device storage, or this site's storage quota being used up by other data.";
  const wantsExport = await confirmAction(
    L(
      "长期生涯保存失败，刚才的改动已撤销。\n\n" +
        `${reason}\n\n` +
        "要现在将这次未能保存的进度导出为文件吗？之后可用“导入长期生涯”恢复。",
      "Long career save failed; the recent changes were rolled back.\n\n" +
        `${reasonEn}\n\n` +
        "Export this unsaved progress to a file now? You can restore it later with “Import long career”.",
    ),
  );
  if (!wantsExport) return;
  try {
    downloadLongCareerExport(unsavedAttempt);
  } catch (error) {
    console.error("[long-career-save] export-after-failure also failed", error);
    alert(
      L("导出也失败了：", "The export failed too: ") +
        (error?.message || L("未知错误", "unknown error")) +
        (schemaBug
          ? L(
              "\n\n这就是上面说的存档格式 bug，请把这条报错截图发给开发者，不要清空浏览器数据。",
              "\n\nThis is the save-format bug from above. Screenshot this error for the developer, and don't clear the browser data.",
            )
          : ""),
    );
  }
}

// Prestige (The Architect, 3+1): a career started from the GM card or
// the unlocked Architect card is stamped on its first save, so the
// completion record can derive its role. The stamp is armed by the
// Career entry's onPlay (pendingCareerStart) and consumed in
// saveLongCareer: it applies only when the saved careerId differs from
// the one that was loaded when the card was clicked — resuming and
// saving the old career instead clears the flag without stamping. A
// Classic GM + Coach career (no stamp) never qualifies for the unlock;
// a Coach career's identity is stamped by the Coach creation flow
// (workstream B) at offer acceptance, not here.
let pendingCareerStart = null;

function recordCareerCompletionIfEnded(rootState) {
  try {
    const account = activeAccount();
    if (!account) return; // guests have no account to record on
    const wasUnlocked = architectUnlocked(account);
    const completion = completionFromRoot(rootState, {
      prestige: rootState?.identity?.prestige === "architect",
    });
    if (!completion) return;
    recordCareerCompletion(account, completion);
    saveAccount(account);
    // A completion that flips the unlock arms a one-time reveal on the
    // Career entry (consumed by refreshCareerEntry).
    if (!wasUnlocked && architectUnlocked(account)) {
      try {
        sessionStorage.setItem("architect-just-unlocked", "1");
      } catch {
        // Storage may be unavailable — the card still shows unlocked.
      }
    }
  } catch (error) {
    // A recording bug must never break a career save.
    console.warn("[career-achievements]", error);
  }
}

// Set by saveLongCareer() so the failure dialog that follows it can tell a schema bug in THIS
// build's save data apart from a real browser-storage problem, instead of always blaming storage.
let lastLongCareerSaveError = null;

function saveLongCareer({ liveGame = "preserve" } = {}) {
  if (!state.leagueCareer) return false;
  const rootState = currentRootState({ liveGame });
  if (pendingCareerStart) {
    const newCareerId = rootState.leagueCareer?.careerId;
    if (newCareerId && newCareerId !== pendingCareerStart.previousCareerId) {
      rootState.identity = { ...pendingCareerStart.identity };
    }
    pendingCareerStart = null;
  }
  try {
    // If the browser refuses, this frees orphaned legacy saves once and retries (saveRoot.js).
    const persisted = writeRootSaveFreeingOrphans(rootState);
    state.longCareerRoot = clonePersistedState(persisted);
    refreshLongCareerHomeBar();
    lastLongCareerSaveError = null;
    recordCareerCompletionIfEnded(rootState);
    return true;
  } catch (error) {
    console.error("[long-career-save]", error);
    lastLongCareerSaveError = error;
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
      alert(L("旧存档已在内存中升级，但暂时无法写回浏览器存储；你仍可继续游玩，请稍后手动保存。", "The old save was upgraded in memory, but it couldn't be written back to browser storage yet. You can keep playing — save again in a moment."));
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
        matchEvents: active.liveGame.matchEvents,
        homeTeam,
        awayTeam,
      });
      return true;
    } catch (error) {
      console.error("[long-career-resume]", error);
      alert(L(`长期生涯比赛恢复失败：${error?.message || error}`, `Couldn't resume the long-career game: ${error?.message || error}`));
      show("home");
      return false;
    }
  }
  // A decision waiting, or a career that is over (fired / departed / retired): the time-travel screen
  // holds the verdict and the job board. The season hub would let him keep coaching a team that isn't his.
  if ((state.story?.pendingDecision || careerIsOver(state.story)) && screens.timeTravel) {
    timeTravelScreen.resume();
    show("timeTravel");
  } else {
    show("season");
    renderSeasonHub();
    showSeasonTab(state.leagueCareer?.phase === "draft" ? "draftBoard" : "standings");
  }
  return true;
}

/** The career save in play: the one already in memory, else whatever is on disk. Read each call, never cached. */
function currentCareerRoot() {
  return state.longCareerRoot || readRootSave();
}

/** ADR-008a Q1: another account's save (or the guest's, until claimed) is never offered to the current player. */
function careerHidden(root = currentCareerRoot()) {
  return hiddenFromMe(saveVisibility("career", careerSig(root)));
}
function sessionHidden(peek = peekSave()) {
  return hiddenFromMe(saveVisibility("session", sessionSig(peek)));
}
function seasonHidden() {
  return hasSeasonSave() && hiddenFromMe(saveVisibility("season", seasonSig(true)));
}

/**
 * P0 data integrity: a protected device slot is read-only here (the storage writers refuse it too). Hiding it isn't
 * enough -- this tells the player why they can't start/import/save over it, and where to go instead.
 *   other: another account's save; guest: the guest's save (claimable in My Games); unassociated: a local save
 *   nobody owns (continue, claim, export or delete it first).
 */
const FOREIGN_SLOT_NAME = { career: ["长期生涯", "long-career"], season: ["单赛季", "single-season"], session: ["未完成的比赛", "unfinished-game"], myteam: ["我的赛季", "My Team season"] };
const FOREIGN_NOTICE = {
  other: [
    (zh) => `这台设备上的${zh}存档属于另一个账号。为了不覆盖它，这里不能新建、导入或保存到这个位置。请切换到那个账号去导出、完成或删除它，或者换一个浏览器 / 设备开始。`,
    (en) => `This device's ${en} save belongs to another account. To keep it safe, you can't start, import or save over it here. Switch to that account to export, finish or delete it — or start on another browser or device.`,
    ["存档属于另一个账号", "This save belongs to another account"],
  ],
  guest: [
    (zh) => `这台设备上的${zh}存档属于访客（未登录）身份。为了不覆盖它，这里不能新建、导入或保存到这个位置。你可以在「我的篮球人生 → 我的游戏」把它认领到当前账号，或者退出登录、以访客身份继续玩。`,
    (en) => `This device's ${en} save belongs to the guest (signed-out) player. To keep it safe, you can't start, import or save over it here. Claim it for this account in My World → My Games, or sign out and keep playing as the guest.`,
    ["存档属于访客", "This save belongs to the guest"],
  ],
  unassociated: [
    (zh) => `这台设备上有一份没有关联任何账号的${zh}旧存档。为了不覆盖它，这里不能新建或导入到这个位置。请先继续它，或者在「我的篮球人生 → 我的游戏」认领或删除它（删除前建议先导出备份）。`,
    (en) => `This device has an older ${en} save that isn't linked to any account. To keep it safe, you can't start or import over it here. Continue it first, or claim or delete it in My World → My Games (export a backup before deleting).`,
    ["有一份未关联账号的旧存档", "An unlinked older save is here"],
  ],
};
function foreignSaveNotice(slot, reason = "other") {
  const [zh, en] = FOREIGN_SLOT_NAME[slot];
  const [zhText, enText, [zhTitle, enTitle]] = FOREIGN_NOTICE[reason] ?? FOREIGN_NOTICE.other;
  return confirmAction(L(zhText(zh), enText(en)), { title: L(zhTitle, enTitle), acceptLabel: L("知道了", "Got it"), notice: true });
}
const SLOT_PRESENT = { career: () => keyHasData(ROOT_SAVE_KEY), season: () => hasSeasonSave(), session: () => hasSave(), myteam: () => hasMyTeamSeason() };
/** Why this slot refuses the player right now (null = it doesn't). opts: { sig, release } as in slotLockReason. */
function lockReasonFor(slot, opts) {
  const reason = slotLockReason(slot, SLOT_PRESENT[slot](), opts);
  return reason === "other" && foreignOwnerOf(slot) === GUEST ? "guest" : reason;
}
/** true = blocked (and the player has been told). */
async function blockedByForeignSave(slot, opts) {
  const reason = lockReasonFor(slot, opts);
  if (!reason) return false;
  await foreignSaveNotice(slot, reason);
  return true;
}

/** The quick-season slot's raw JSON (no state preparation): enough to sign it and tell whether it mirrors the career. */
function rawSeasonSave() {
  try { return JSON.parse(localStorage.getItem("cls_season_v1")) || true; } catch { return true; }
}

/**
 * Explicit, confirmed delete of an UNLINKED local save (My World → My Games). This is the only "release" a player
 * can give for a save nobody owns; another player's save is never offered here (and the writers refuse it anyway).
 */
async function deleteUnlinkedSave(slot) {
  const [zh, en] = FOREIGN_SLOT_NAME[slot];
  const ok = await confirmAction(L(
    `永久删除这份没有关联任何账号的${zh}本机存档？此操作无法撤销。${slot === "career" ? "如需保留，先在首页存档条点「导出存档」备份。" : ""}`,
    `Permanently delete this unlinked ${en} local save? This can't be undone.${slot === "career" ? " To keep a copy, use Export on the home save bar first." : ""}`,
  ), { title: L("删除本机存档？", "Delete this local save?"), acceptLabel: L("删除", "Delete") });
  if (!ok) return false;
  try {
    if (slot === "career") {
      deleteCareerSave(undefined, { release: true });
      Object.assign(state, { leagueCareer: null, story: null, longCareerRoot: null, season: null, seasonPendingGame: null });
    } else if (slot === "session") {
      clearSave({ release: true });
    } else if (slot === "myteam") {
      clearMyTeamSeason({ release: true });
      if (state.season?.myTeam) Object.assign(state, { season: null, seasonPendingGame: null });
    } else {
      clearSeasonSave({ release: true });
      if (!state.leagueCareer) Object.assign(state, { season: null, seasonPendingGame: null });
    }
  } catch (error) {
    if (!(error instanceof ForeignSaveError)) throw error;
    await foreignSaveNotice(slot, error.reason);
    return false;
  }
  refreshLongCareerHomeBar();
  refreshSaveHomeBar();
  return true;
}

/** After an account change: progress of the previous account still in memory must not be played (or saved) on. */
function forgetOtherAccountsProgress() {
  if (state.longCareerRoot && careerHidden(state.longCareerRoot)) {
    Object.assign(state, { leagueCareer: null, story: null, longCareerRoot: null, season: null, seasonPendingGame: null });
  }
  if (!state.leagueCareer && state.season && seasonHidden()) Object.assign(state, { season: null, seasonPendingGame: null });
}


function refreshLongCareerHomeBar() {
  const bar = $("#long-career-home-bar");
  const meta = $("#long-career-home-meta");
  if (!bar || !meta) return;
  const root = currentCareerRoot();
  const career = root?.leagueCareer;
  if (!career || careerHidden(root)) {
    bar.hidden = true;
    return;
  }
  const season = career.season;
  const team = season?.teams?.[season.userTeamId];
  const story = root.story;
  const lang = getLang();
  const details = [
    teamNameL(team?.name || (lang === "en" ? "Unnamed team" : "未命名球队"), lang),
    `${story?.startYear ?? season?.year ?? "—"} → ${season?.year ?? "—"}`,
    lang === "en"
      ? `Phase: ${seasonPhaseLabel(career.phase || season?.phase, "en")}`
      : `阶段：${seasonPhaseLabel(career.phase || season?.phase, "zh")}`,
  ];
  if (story && Number.isFinite(story.futureKnowledge)) {
    details.push(lang === "en" ? `Future Knowledge ${story.futureKnowledge}` : `未来知识 ${story.futureKnowledge}`);
  }
  if (story && Number.isFinite(story.frontOfficeTrust)) {
    details.push(lang === "en" ? `Front-Office Trust ${story.frontOfficeTrust}` : `管理层信任 ${story.frontOfficeTrust}`);
  }
  meta.textContent = details.join(" · ");
  bar.hidden = false;
}

// The time-travel career screen lives in js/ui/timeTravel/ (controller + painters); app.js only
// injects the global state/behaviour it owns.
const timeTravelScreen = createTimeTravelScreen({
  state,
  show,
  saveLongCareer,
  currentRootState,
  renderSeasonHub,
  showSeasonTab,
  blockedByForeignSave,
  // M4-C: the screen snapshots the account's identity places when a
  // career is created (acceptInterviewOffer); injected like the other
  // views' getAccount callback.
  getAccount: activeAccount,
  // Account Level: a resolved Reborn story event pays +30 XP (win or lose —
  // every choice counts). Keyed per event+year so a replayed event pays once.
  onStoryEventResolved: ({ eventId, year } = {}) => {
    const root = currentCareerRoot();
    const acc = getAccount(root?.profile?.accountId) || activeAccount();
    const axp = awardAccountXp(acc, XP_TABLE.careerEvent, { source: "rebornEvent", key: `storyEvent:${eventId || "unknown"}@${year ?? "?"}` });
    celebrateAccountLevelUp(axp.levelBefore, axp.levelAfter);
  },
});
const openTimeTravelScreen = () => timeTravelScreen.open();
const queueNextTimeTravelEvent = () => timeTravelScreen.queueNextTimeTravelEvent();

$("#btn-long-career-resume")?.addEventListener("click", () => {
  if (careerHidden()) return refreshLongCareerHomeBar();
  resumeLongCareer(currentCareerRoot());
});
$("#btn-long-career-export")?.addEventListener("click", () => {
  const root = currentCareerRoot();
  if (!root?.leagueCareer) return;
  try {
    downloadLongCareerExport(root);
  } catch (error) {
    alert(error?.message || L("导出存档失败", "Couldn't export the save."));
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
    // checked with the file's career: restoring a backup of the same career is not an overwrite
    if (await blockedByForeignSave("career", { sig: careerSig(imported) })) return;
    if (!(await confirmAction(L(
      "导入将替换当前长期生涯存档，确定继续？",
      "Importing replaces your current long career save. Continue?",
    ), {
      title: L("导入长期生涯？", "Import a long career?"),
      acceptLabel: L("导入并覆盖", "Import and replace"),
    }))) return;
    const persisted = writeRootSave(imported);
    state.longCareerRoot = persisted;
    refreshLongCareerHomeBar();
    resumeLongCareer(persisted);
  } catch (error) {
    alert(error?.message || L("导入存档失败", "Couldn't import the save."));
  } finally {
    input.value = "";
  }
});

function saveSeasonAndCareer(st = state.season, { liveGame = "preserve" } = {}) {
  // A My Team season routes itself (the object carries `myTeam`): it must NEVER fall through to the quick-season slot.
  if (st?.myTeam) {
    settleMyTeamResult(st); // the last playoff game may be simulated without ever re-opening the hub
    grantMyTeamGold(st); // derived from the record + a paid-ledger: every save path pays exactly the difference
    const res = saveMyTeamSeason(st);
    if (!res.ok) alert(res.reason === "storage" ? L("赛季保存失败：浏览器存储空间不足。", "Couldn't save the season: the browser is out of storage.") : L("赛季保存失败：存档位被其他存档占用。", "Couldn't save the season: that slot belongs to another save."));
    return res.ok;
  }
  if (state.leagueCareer && st === state.season) {
    const checkpoint = clonePersistedState(state.longCareerRoot);
    const unsavedAttempt = currentRootState({ liveGame });
    state.leagueCareer = careerForPersistence(state.leagueCareer, st);
    if (!saveLongCareer({ liveGame })) {
      restoreLongCareerCheckpoint(checkpoint);
      offerLongCareerExportAfterSaveFailure(unsavedAttempt);
      return false;
    }
    if (!saveSeason(st, { mirror: true })) {
      console.warn("[season-compat-save] 根存档已保存，但兼容赛季存档写入失败");
    }
    return true;
  }
  const seasonSaved = saveSeason(st);
  if (!seasonSaved) {
    alert(L("赛季保存失败：可能是存档太大或浏览器存储空间不足。", "Couldn't save the season. The save may be too large, or the browser is out of storage."));
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
    if (!silent) alert(L("当前没有可保存的进度（请在比赛、选秀、赛前或晋级赛中保存）", "Nothing to save right now. Save during a game, the draft, pre-game setup, or a tournament."));
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
        if (!silent) alert(L("长期生涯进度保存失败，请重试。", "Couldn't save the long career. Try again."));
        return false;
      }
      if (!silent) {
        const tip = andGoHome
          ? L("长期生涯进度已保存。可随时在首页继续。", "Long career saved. You can continue from the home screen.")
          : L("长期生涯进度已保存到本机。", "Long career saved on this device.");
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
    // A game that already hit the final buzzer is never saved as a live game: "Continue" would replay its last
    // possessions and settle (pay) it a second time.
    const liveSim = liveGameSim();
    const payload = {
      screen: liveSim ? "game" : screen === "home" ? "game" : screen,
      label: buildSaveLabel(),
      app: serializeAppSlice(state),
      sim: liveSim ? liveSim.exportState() : null,
      feed: collectFeedLines(),
      matchEvents: liveSim ? state.matchEvents?.exportState() || null : null,
      flowId: state.flowId || null,
    };
    // Prefer game screen if sim exists
    if (forceScreen === "game" && !liveSim) payload.screen = state.career ? "market" : "home";
    else if (forceScreen) payload.screen = forceScreen;
    else if (liveSim) payload.screen = "game";
    else if (state.draft) payload.screen = "draft";
    else if (state.setup) payload.screen = "setup";
    else if (state.legend) payload.screen = "legend";
    else if (state.career) payload.screen = "market";
    else if (state.tournament) payload.screen = "tournament";

    const written = writeSave(payload);
    if (written?.blocked) {
      if (!silent) void foreignSaveNotice("session", lockReasonFor("session") || "other");
      else if (state.sim && !state.foreignSessionWarned) {
        state.foreignSessionWarned = true;
        pushFeed("coach", L("本局不会自动保存：这台设备上已有一份不能覆盖的未完成比赛存档（别的玩家的，或未关联账号的）。", "This game won't autosave: this device already holds an unfinished-game save that can't be overwritten (another player's, or an unlinked one)."));
      }
      return false;
    }
    if (written?.saveFailed) {
      if (!silent) alert(L("保存失败：可能是存档太大或浏览器限制。请再试一次。", "Save failed. The save may be too large, or the browser blocked it. Try again."));
      return false;
    }
    if (!silent) {
      const tip = andGoHome
        ? L("进度已保存。可随时在首页点「继续进度」。", "Progress saved. Continue it from the home screen.")
        : L("进度已保存到本机。", "Progress saved on this device.");
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
    if (!silent) alert(L("保存失败：可能是存档太大或浏览器限制。请再试一次。", "Save failed. The save may be too large, or the browser blocked it. Try again."));
    return false;
  }
}

/**
 * B50 leftovers: the home save bar is a single-slot Continue strip and cannot hold a list, so the newest
 * finished record gets one line under it. Independent of the bar itself -- it shows whenever any record
 * exists, even with no save in progress (which is exactly when a finished duel/gold run has just cleared
 * its slot). The line is plain text (textContent, never innerHTML). The button jumps to My World, where
 * the full History list lives with View result + Delete.
 */
function refreshLatestArchiveLine() {
  const line = $("#save-home-latest");
  const meta = $("#save-home-latest-meta");
  if (!line || !meta) return;
  const latest = readChallengeArchive(activeAccount()?.id ?? null)[0];
  if (!latest) {
    line.hidden = true;
    return;
  }
  line.hidden = false;
  meta.textContent = archiveSummaryLine(latest, getLang());
}

function refreshSaveHomeBar() {
  refreshLatestArchiveLine();
  const bar = $("#save-home-bar");
  const meta = $("#save-home-meta");
  const btnCont = $("#btn-continue-save");
  const btnClear = $("#btn-clear-save");
  if (!bar) return;
  const peek = peekSave();
  if (!peek || sessionHidden(peek)) {
    bar.hidden = true;
    return;
  }
  // M1: root v3 is the Continue source of truth — never show two Continue
  // panels at once. When a long career exists, its bar owns "continue" and
  // this legacy bar stays hidden. Legacy-only saves still show this bar:
  // it is their only continue path (legacy→root auto-migration runs on the
  // discovery flow, a dedicated migration button is a separate decision).
  if (readRootSave()?.leagueCareer) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  if (meta) meta.textContent = formatSaveLabel(peek, getLang());
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

/** CourtView with bilingual labels (the court module itself only knows Chinese defaults). */
function newCourtView() {
  return new CourtView($("#court-root"), {
    getLang,
    labels: {
      simple: L("人物：简易", "Players: Simple"),
      photo: L("人物：照片", "Players: Photos"),
      fxOn: L("动效：开", "Effects: On"),
      fxOff: L("动效：关", "Effects: Off"),
      modeTip: L("点击切换球员显示：简易小人 / 球员照片", "Click to switch how players look: simple figures / photos"),
      fxTip: L("点击开关球场动画（移动、传球弧线、扣篮）；不影响比赛结果", "Click to turn court animation (movement, pass arcs, dunks) on/off; it never changes the score"),
      zoneAway: L("客队篮筐", "Away basket"),
      zoneHome: L("主队篮筐", "Home basket"),
      advancing: L("推进中", "Advancing"),
      phaseInbound: L("发球推进", "Inbounding"),
      phaseCrossHalf: L("过半场", "Crossing half court"),
      phaseSet: L("落位进攻", "Setting up offense"),
      phaseFinish: L("终结回合", "Finishing possession"),
      attackHome: L("主队攻向客队篮", "Home attacking the away basket"),
      attackAway: L("客队攻向主队篮", "Away attacking the home basket"),
      balanced: L("均衡", "Balanced"),
      roleOff: L("攻", "O"),
      roleDef: L("防", "D"),
    },
    teamName: (name) => teamNameL(name),
  });
}

/** M3 domain-event adapter for the live game: derived events drive court visuals (trails reset on a new possession, sub flash on a substitution). Raw events keep flowing through handleSimEvent unchanged. */
function wireDomainEvents() {
  state.domainEvents = createDomainEventAdapter({ onDomainEvent: (evt) => handleDomainEvent(evt) });
  // In-Match Events MVP: one session per live game; a restored game continues its saved one. Off when two humans share the game.
  state.matchEvents?.dispose();
  const savedEvents = state.restoredMatchEvents || null;
  state.restoredMatchEvents = null;
  state.matchEvents = state.sim && !speedLocked(state.mode, currentTournamentMatch())
    ? createMatchEventsSession({ sim: state.sim, saved: savedEvents, getLang })
    : null;
  state.matchEvents?.reshowPending();
}

// 3D-S1B: optional 3D court on the Gold game screen. 2D keeps rendering underneath and is the permanent fallback.
const match3d = createMatch3dController({
  host: $("#court-3d-root"),
  twoD: $("#court-root"),
  button: $("#btn-court-3d"),
  arenaSelect: $("#sel-arena"),
  note: $("#court-3d-note"),
  getSim: () => state.sim,
  getSpeed: () => state.speed,
  cues: createArenaCues({ sfx: audio.sfx }),
  L,
});

function handleDomainEvent(evt) {
  if (!evt) return;
  match3d.feedDerived(evt);
  try {
    if (evt.type === "POSSESSION_START" || evt.type === "PERIOD_END") {
      state.court?.clearTrails();
    } else if (evt.type === "SUBSTITUTION" && evt.meta?.sub?.inId) {
      state.court?.flashToken(evt.meta.sub.inId);
    }
    state.matchEvents?.onDomainEvent(evt);
  } catch (err) {
    console.error(err);
  }
}

/**
 * The bracket match currently being played, for the speed-lock rule (B39③).
 * A tournament round only locks the speed button when BOTH sides of this match are human; during the
 * draft phase, between rounds, or outside a tournament there is no match, so null (unlocked).
 * `currentMatch` only advances in applyTournamentResult after a match ends, so it points at the live
 * match while one is being played or resumed.
 */
function currentTournamentMatch() {
  const t = state.tournament;
  if (!t || t.phase !== "match") return null;
  return t.bracket?.[t.currentMatch] || null;
}

function wireRestoredSim(sim, homeTeam, awayTeam, youSide) {
  if (state.sim) state.sim.stop();
  state.sim = sim;
  // A quick-sim disables its button for the rest of THAT game; only beginGame re-enabled it, so a game resumed
  // after a quick-simmed one could never be quick-simmed.
  const quickBtn = $("#btn-quick-sim");
  if (quickBtn) {
    quickBtn.disabled = false;
    quickBtn.hidden = false;
  }
  wireDomainEvents();
  match3d.startMatch({ offer: state.career?.kind === "career" });
  state.lineupSig = "";
  state.subOutId = null;
  state.subInId = null;
  state.court?.destroy?.();
  state.court = newCourtView();
  state.court.ensureDom();
  $("#game-team-a").textContent = teamNameL(homeTeam?.name || sim.home.name, getLang());
  $("#game-team-b").textContent = teamNameL(awayTeam?.name || sim.away.name, getLang());
  paintFeedIdentity(homeTeam || sim.home, awayTeam || sim.away);
  $("#you-side").textContent =
    youSide === "home" ? $("#game-team-a").textContent : $("#game-team-b").textContent;

  state.speed = sim.speed || 1;
  const speedBtn = $("#btn-speed");
  if (speedBtn) {
    speedBtn.hidden = speedLocked(state.mode, currentTournamentMatch());
    speedBtn.textContent = speedButtonText(state.speed);
  }
  state.autoOffense = !!sim.autoOffense;
  state.autoDefense = !!sim.autoDefense;
  state.autoRotation = !!sim.autoRotation;
  state.timeoutTier = sim.timeoutTier || "balanced";
  syncManagedUI();
  syncTimeoutTierUI();

  const you = youSide === "home" ? sim.home : sim.away;
  // 开场下拉框显示本场实际开场战术（默认优先），不沿用上一场页面里剩的值。
  fillTacticSelect(you, { preferId: you.tactic?.id });
  syncLivePhilFromCoach(you.coach);
  initFocusAndPacksUI(homeTeam || sim.home, awayTeam || sim.away, youSide);

  show("game");
  const snap0 = sim.snapshot();
  paintScore(snap0);
  paintLineups(snap0);
  paintMeters(snap0);
  state.court.render(snap0);
  syncPauseUI(snap0);
  pushFeed("coach", "已读取存档——点「继续比赛」接着打");
}

function restoreSavedGame({ simSave, context = {}, feed = [], homeTeam, awayTeam, onFinished, matchEvents = null }) {
  const youSide = simSave.youSide || context.youSide || "home";
  const sim = GameSim.fromSave(simSave, {
    onEvent: (event) => handleSimEvent(event),
    onTick: (snap) => {
      try {
        paintScoreWithCursor(snap);
        paintLineups(snap);
        // The coach-panel body (meters, orders, positions) is display:none while the drawer is closed in live
        // play; rebuilding it every possession was pure layout cost. It is repainted once when the drawer opens.
        if (coachDrawer.isOpen()) {
          paintMeters(snap);
        } else {
          paintMomentum(snap);
        }
        state.court?.render(snap);
        state.domainEvents?.observeTick(snap);
        syncPauseUI(snap);
      } catch (error) {
        console.error("[ui] onTick", error);
      }
    },
    onEnd: (snap) => {
      state.finishedSim = sim; // from here on this game is a result, not a resumable live game
      syncInjuriesToTeams(sim, homeTeam, awayTeam);
      state.domainEvents?.observeEnd(snap);
      const formNotes = syncFormToTeams(sim, homeTeam, awayTeam);
      showResult(snap, { formNotes });
      onFinished?.();
    },
  });
  const feedElement = $("#play-feed");
  if (feedElement) feedElement.innerHTML = "";
  state.restoredMatchEvents = matchEvents;
  wireRestoredSim(sim, homeTeam, awayTeam, youSide);
  restoreFeed(feed);
  return sim;
}

/** 从本机存档恢复。 */
async function continueFromSave() {
  const data = readSave();
  if (!data?.app || sessionHidden(data)) {
    alert(L("没有找到存档", "No save found."));
    refreshSaveHomeBar();
    return;
  }
  markSessionResumed(); // continuing this save keeps its owner (unassociated stays unassociated)
  state.flowId = data.flowId || null; // resuming continues that save's flow
  try {
    const app = data.app;
    // (a legacy single-toggle save carries its old on/off forward as all three switches)
    Object.assign(state, resumeSettings(app));
    state.timeoutTier = normalizeTimeoutTier(app.timeoutTier);
    state.career = reviveCareer(app.career);
    state.tournament = app.tournament || null;
    state.legend = reviveLegend(app.legend);
    state.draft = reviveDraft(app.draft);
    state.pendingMatch = app.pendingMatch || null;
    state.setup = null;

    const route = resumeRoute(data, state);
    if (route === "game") {
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
        matchEvents: data.matchEvents,
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

    if (route === "draft") {
      show("draft");
      paintDraftHeader(state.draft);
      $("#roster-a-title").textContent = state.draft.teams.A.name;
      $("#roster-b-title").textContent = state.draft.teams.B.name;
      if (typeof updateCustomDraftChrome === "function") updateCustomDraftChrome();
      refreshDraftUI();
      renderPack();
      updateRefreshBtn();
      $("#btn-start-game").disabled = !isDraftDone(state.draft);
      return;
    }

    if (route === "setup") {
      const { home, away, youSide } = state.pendingMatch;
      const savedIds = app.setup?.selected || [];
      openSetup(home, away, youSide);
      if (savedIds.length && state.setup) {
        state.setup.selected = new Set(savedIds);
        renderSetupRoster();
        renderSetupRoles();
        renderSetupGameplan();
      }
      return;
    }

    if (route === "legend") {
      show("legend");
      const L = state.legend;
      const chipBox = $("#legend-franchises");
      if (chipBox && L.franchises?.length) {
        chipBox.innerHTML = legendChipsHtml(L.franchises, getLang());
      }
      $("#legend-pos").innerHTML = legendPosHtml(L.pickPos || "SF");
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
      // B106: resume path re-rolls the legend candidate pool from PLAYERS without ever
      // passing through startLegendMode, so the B105 gate does not cover it — wait for the
      // perf-r3 backfill here too (the home Continue button is clickable before it finishes).
      await playersReady();
      rollLegendTeam();
      return;
    }

    if (route === "market") {
      openMarket({
        career: state.career.kind === "career",
        duel: state.career.kind === "duel",
      });
      return;
    }

    if (route === "tournament") {
      show("tournament");
      return;
    }

    alert(L("存档内容不完整，无法继续。已留在首页。", "The save is incomplete, so it can't be continued. You're still on the home screen."));
    show("home");
  } catch (err) {
    console.error("[load]", err);
    alert(L("读取存档失败：", "Couldn't read the save: ") + (err?.message || err));
  }
}

// Generic mode-card wiring skips the Career entry cards: they carry
// data-mode for the catalog/homeTabs tests, but their clicks belong to
// the Career entry module (era step for GM + Coach, honest dev notes
// for Player/Coach) — the generic handler would double-dispatch.
document.querySelectorAll(".mode-card[data-mode]:not([data-career-identity])").forEach((btn) => {
  btn.addEventListener("click", () => startMode(btn.dataset.mode));
});

/**
 * M1 Play Now: the hero CTA. Same preset exhibition as the `quick` card
 * (autoFillTeam ×2), but it skips the setup confirmation screen and goes
 * straight into the game. The setup path stays reachable from the custom
 * and sandbox cards. Defaults mirror what the setup-confirm handler would
 * produce with no user input: top-5-available starters with unique
 * positions, default orders/packs, and a neutral gameplan.
 */
async function startPlayNow() {
  beginFlow(); // a fresh run: its saves belong to it, an older unfinished one is left alone
  await playersReady(); // perf-r3: exhibitionTeams() reads PLAYERS synchronously
  const { home, away } = exhibitionTeams(10);
  if (home?.players) syncTeamDuoSkills(home.players);
  if (away?.players) syncTeamDuoSkills(away.players);
  ensureTeamStaff(home, {
    preferStarter: true,
    excludeIds: [away?.coach?.id, away?.assistant?.id],
  });
  ensureTeamStaff(away, {
    preferStarter: true,
    excludeIds: [home?.coach?.id, home?.assistant?.id],
  });
  for (const team of [home, away]) {
    const pool = team.players.filter(isPlayerAvailable);
    const starters = [...(pool.length ? pool : team.players)]
      .sort((a, b) => overall(b) - overall(a))
      .slice(0, 5);
    autoAssignUniquePositions(starters);
    ensureRoles(team.players);
    team.starterIds = starters.map((p) => p.id);
    for (const p of starters) p.playPos = normalizePos(p.playPos || p.pos);
    ensurePlayerOrders(team.players);
    team.lineupPacks = team.lineupPacks || autoBuildAllPacks(team.players);
    team.gameplan = team.gameplan || {
      matchup: null,
      matchupAssignments: {},
      offenseFocusId: null,
      tempo: "normal",
    };
  }
  state.mode = "quick";
  // M2a: "playNow" (not "quick") so 再来一局 / continue-from-save come straight back here,
  // instead of detouring through the quick card's setup screen.
  state.lastMode = "playNow";
  state.career = null;
  state.tournament = null;
  state.legend = null;
  state.seasonPendingGame = null;
  state.pendingMatch = { home, away, youSide: "home" };
  beginGame(home, away, "home");
  const tip = $("#play-now-tip");
  if (tip) tip.hidden = !shouldShowTip(globalThis.localStorage, PLAY_NOW_TIP_KEY);
}

$("#btn-play-now")?.addEventListener("click", startPlayNow);
$("#btn-play-now-tip-ok")?.addEventListener("click", () => {
  markTipSeen(globalThis.localStorage, PLAY_NOW_TIP_KEY);
  const tip = $("#play-now-tip");
  if (tip) tip.hidden = true;
});

/** A new play flow (mode start): its saves are stamped with this id, see sessionSaveIsCurrentFlow. */
let flowSeq = 0;
function beginFlow() {
  flowSeq += 1;
  state.flowId = `f${Date.now().toString(36)}${flowSeq.toString(36)}`;
}
/** True when the unfinished-game slot holds this flow's own save (or the legacy unstamped case on both sides). */
function sessionSaveIsCurrentFlow() {
  const saved = readSave();
  if (!saved) return false;
  return (saved.flowId ?? null) === (state.flowId ?? null);
}

async function startMode(mode) {
  if (!mode) return;
  await playersReady(); // perf-r3: every branch below either draws from PLAYERS or dispatches to a function that does
  if (mode === "playNow") {
    startPlayNow();
    return;
  }
  if (mode === "timeTravel") {
    state.mode = mode;
    state.lastMode = mode;
    openTimeTravelScreen();
    return;
  }
  // Ask the account gate BEFORE clearing anything: a guest who taps Ranked must keep whatever they were doing.
  if (mode === "ranked" && !requireAccountReady({ zh: "排位赛", en: "Ranked" })) return;
  if (mode === "clutch") {
    // Clutch Challenge is a standalone single-possession challenge, NOT a
    // catalog mode (modeCatalog stays 13) and NOT a resumable game: leave
    // lastMode alone (the result screen's 再来一局 replays lastMode) and don't
    // clear career / tournament state. Guests can play — no account gate.
    state.mode = "clutch";
    openClutchChallenge();
    return;
  }
  if (mode === "halfcourt") {
    // Custom 3v3 half-court: standalone like clutch — not a catalog mode, not resumable, no save,
    // no rewards; lastMode / career / tournament state are left alone.
    state.mode = "halfcourt";
    openHalfCourt();
    return;
  }
  beginFlow();
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
    const { home, away } = exhibitionTeams(10);
    openSetup(home, away, "home");
    return;
  }
  if (mode === "legend") {
    await startLegendMode();
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
  if (mode === "sandbox") {
    openSandbox();
    return;
  }
  await initDraft(mode);
  show("draft");
}

function openSandbox() {
  mountSandbox({
    root: screens.sandbox,
    pool: () => PLAYERS,
    ovrOf: overall,
    esc,
    lang: getLang(),
    onStart: (teamA, teamB) => {
      state.mode = "sandbox";
      state.lastMode = "sandbox";
      state.career = null;
      openSetup(teamA, teamB, "home");
    },
  });
  show("sandbox");
}
$("#btn-sandbox-back")?.addEventListener("click", () => goBack());

// —— Custom 3v3 Half-Court (js/ui/halfCourtView.js; engine js/modes/halfCourt3v3.js) ——
const halfCourtScreen = screens.halfCourt
  ? createHalfCourtScreen({
    root: screens.halfCourt,
    pool: () => PLAYERS,
    ovrOf: overall,
    esc,
    getLang,
    onBack: () => goBack(),
  })
  : null;
function openHalfCourt() {
  halfCourtScreen?.open();
  show("halfCourt");
}
$("#btn-halfcourt-entry")?.addEventListener("click", () => startMode("halfcourt"));
$("#btn-halfcourt-back")?.addEventListener("click", () => {
  halfCourtScreen?.dispose();
  goBack();
});

// —— Training Center (offline My Team progression; js/data/trainingCamp.js, js/ui/trainingView.js) ——
const trainingScreen = screens.training
  ? createTrainingScreen({ root: screens.training, getAccount: () => activeAccount(), pool: () => PLAYERS, getLang })
  : null;
async function openTraining() {
  await playersReady(); // onboarding (inside requireAccountReady) and the card list both read PLAYERS
  const acc = requireAccountReady({ zh: "训练中心", en: "Training Center" });
  if (!acc) return;
  trainingScreen?.open();
  show("training");
}
$("#btn-training-entry")?.addEventListener("click", () => openTraining());
$("#btn-training-back")?.addEventListener("click", () => {
  trainingScreen?.dispose();
  goBack();
});

// —— M4-B Hometown Challenge (ADR-009 H4) ——
// Your represented city's legends (sourced relation table only, fallback
// levels fill the lineup; fewer than 5 people = no game, never fabricated)
// vs a random historic strong team, on the existing GameSim via openSetup.
// The result is recorded in showResult() against the city represented in
// THIS game; changing the represented city later does not rewrite it.
const bestCardByBref = createBestCardIndex(() => PLAYERS, overall);
function hometownChallengeFor(account) {
  const place = readIdentity(account).identityPlaces?.representedCity;
  if (!place) return null;
  const built = buildChallengeTeam({
    placeText: place,
    cardFor: (bref) => bestCardByBref(bref),
    teamName: getLang() === "en" ? `${place} Legends` : `${place}传奇阵`,
  });
  return built.available ? { place, built } : null;
}
async function startHometownChallenge() {
  beginFlow(); // a fresh run: its saves belong to it, an older unfinished one is left alone
  const found = hometownChallengeFor(activeAccount());
  if (!found) return;
  await playersReady(); // perf-r3
  assertPlayersReady("startHometownChallenge");
  const opp = pickOpponentTeam(PLAYERS, {});
  if (!opp) return;
  state.mode = "sandbox";
  state.lastMode = "sandbox";
  state.career = null;
  state.hometownChallenge = { representedCity: found.place };
  openSetup(
    { name: found.built.team.name, players: found.built.players.map((p) => clonePlayer(p)) },
    { name: opp.name, players: opp.players.map((p) => clonePlayer(p)) },
    "home",
  );
}

// —— M2b-2 Clutch Challenge ——
// Guest-accessible: no account gate anywhere in this flow. One scenario only
// (the M2b-1 measured preset: 2016 Warriors vs Cavaliers, down 3, 12s left).
// The result page renders the engine's structured outcome (clutchLog[0] — the
// same object the coach event's meta.clutchOutcome carries, pinned by
// tests/clutchDecision.test.js + tests/clutchController.test.js), never a
// guess from the score. Retry always builds a FRESH GameSim.

const CLUTCH_ROLE_LABELS = {
  creator: ["创造型", "Creator"],
  playmaker: ["组织型", "Playmaker"],
  catch_shoot: ["接球射手", "Catch & Shoot"],
  post: ["低位", "Post"],
  role_player: ["角色球员", "Role Player"],
};
const clutchRoleLabel = (role) => {
  const [zh, en] = CLUTCH_ROLE_LABELS[role] || CLUTCH_ROLE_LABELS.role_player;
  return L(zh, en);
};
const clutchTeamName = (code) => (code === "GSW" ? L("勇士", "Warriors") : L("骑士", "Cavaliers"));
const clutchPlayerName = (sim, id) => {
  for (const side of [sim.home, sim.away]) {
    const p = side.roster?.find((x) => x.id === id);
    if (p) return p.cardName || p.name;
  }
  return "";
};

function clutchRejectLabel(reason) {
  switch (reason) {
    case "not_on_court": return L("他不在场上。", "He is not on the court.");
    case "already_armed": return L("已经提交了一个决策。", "A call is already armed.");
    case "stale_attempt": return L("这个决策已过期，请重新选择。", "That call expired — please pick again.");
    case "game_over": return L("比赛已经结束了。", "The game is over.");
    case "invalid": return L("选择无效。", "Invalid selection.");
    case "locked": return L("已提交，锁定了。", "Submitted — locked.");
    case "already_replaced": return L("只能换一次，提交后锁定。", "One change only — locked once submitted.");
    case "no_selection": return L("请先选关键出手人。", "Pick the clutch shooter first.");
    default: return L("提交失败，请再试一次。", "Submit failed — please try again.");
  }
}

function clutchReasonText(reason, shooterName) {
  switch (reason) {
    case "turnover": return L("这次进攻失误了，没能形成出手", "The possession ended in a turnover — no shot");
    case "foul": return L("被犯规，进攻中断，没能形成出手", "A foul stopped the play — no shot");
    case "kicked_out": return L(`${shooterName} 拿到球后把球分了出去，之后没能形成出手`, `${shooterName} got the ball and kicked it out, but no shot came of it`);
    case "doubled": return L(`${shooterName} 被包夹，只能把球分出去`, `${shooterName} was doubled and had to give it up`);
    case "not_handed_off": return L("球没能传到他手里", "The ball never reached him");
    case "not_on_court": return L("他当时不在场上", "He was not on the court");
    case "no_possession": return L("这一回合没有球权，时间走完了", "No possession left — time ran out");
    default: return L("没能形成出手", "No shot");
  }
}

function openClutchChallenge() {
  const root = $("#clutch-scenario-card");
  if (root) {
    root.innerHTML = `
      <div class="clutch-teams">${esc(clutchTeamName("GSW"))} vs ${esc(clutchTeamName("CLE"))}</div>
      <div class="clutch-meta">${esc(L("2016 赛季 · 落后 3 分 · 剩 12 秒 · 你控制勇士", "2016 season · down 3 · 12 seconds left · you control the Warriors"))}</div>
      <div class="clutch-meta">${esc(L("选关键出手人及进攻方式，结果由真实模拟决定", "Pick the clutch shooter and the action — the real sim decides the outcome"))}</div>`;
  }
  show("clutch");
}

async function startClutchChallenge() {
  await playersReady(); // perf-r3
  assertPlayersReady("startClutchChallenge");
  let scenario;
  try {
    scenario = initializeScenario({ pool: PLAYERS });
  } catch (err) {
    console.error("[clutch]", err);
    alert(L("名册还没准备好，请稍候再试。", "The roster is not ready yet, please try again in a moment."));
    return;
  }
  const eventOutcome = { current: null };
  // A dunk is a separate sim event, fired before the outcome settles;
  // capture it so the 3D replay knows to play a dunk, not a jump shot.
  const replayCapture = { dunkShooterId: null };
  const sim = startClutchSim(scenario, {
    onEvent: (e) => {
      if (e.meta?.clutchOutcome) eventOutcome.current = e.meta.clutchOutcome;
      if (e.type === "dunk" && e.meta?.player?.id && !eventOutcome.current) {
        replayCapture.dunkShooterId = e.meta.player.id;
      }
    },
    onTick: () => {},
    onEnd: () => {},
  });
  const controller = createClutchController({ sim });
  state.clutch = { sim, controller, scenario, eventOutcome, replayCapture, pickedShooterId: null, actionHint: "three" };
  controller.openDecision();
  renderClutchPlay();
  show("clutchPlay");
}

function renderClutchPlay() {
  const c = state.clutch;
  if (!c) return;
  const { sim } = c;
  const scoreEl = $("#clutch-play-score");
  if (scoreEl) {
    scoreEl.textContent = L(
      `${clutchTeamName("GSW")} ${sim.score.home} — ${sim.score.away} ${clutchTeamName("CLE")} · 第 ${sim.quarter} 节 · 剩 ${sim.clock} 秒`,
      `${clutchTeamName("GSW")} ${sim.score.home} — ${sim.score.away} ${clutchTeamName("CLE")} · Q${sim.quarter} · ${sim.clock}s left`,
    );
  }
  const list = $("#clutch-shooter-list");
  if (list) {
    list.innerHTML = sim.you().onCourt.map((p) => {
      const role = classifyClutchRole(p);
      return `<button type="button" class="clutch-shooter${c.pickedShooterId === p.id ? " selected" : ""}" data-shooter-id="${esc(p.id)}">
        <span class="clutch-name">${esc(p.cardName || p.name)}</span>
        <span class="clutch-role">${esc(clutchRoleLabel(role))} · ${esc(p.pos || "")} · OVR ${overall(p)}</span>
      </button>`;
    }).join("");
    list.querySelectorAll("[data-shooter-id]").forEach((btn) => {
      btn.addEventListener("click", () => clutchPick(btn.dataset.shooterId, null));
    });
  }
  document.querySelectorAll("#clutch-action-row [data-clutch-action]").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.clutchAction === c.actionHint);
    btn.onclick = () => clutchPick(null, btn.dataset.clutchAction);
  });
  const submitBtn = $("#btn-clutch-submit");
  if (submitBtn) submitBtn.disabled = !c.pickedShooterId;
}

/**
 * One pick = one controller call. First pick -> select(); a change of shooter
 * or action -> replaceDecision() (once per window; the old attemptId is
 * voided). An action picked before any shooter is pending only.
 */
function clutchPick(shooterId, actionHint) {
  const c = state.clutch;
  if (!c || c.controller.state !== "AWAITING_DECISION") return;
  const nextShooter = shooterId || c.pickedShooterId;
  const nextAction = actionHint || c.actionHint;
  if (actionHint && !shooterId && !c.pickedShooterId) {
    c.actionHint = nextAction;
    renderClutchPlay();
    return;
  }
  if (!nextShooter) return;
  if (!c.pickedShooterId) {
    const res = c.controller.select(nextShooter, nextAction);
    if (!res.ok) {
      alert(clutchRejectLabel(res.reason));
      return;
    }
    c.pickedShooterId = nextShooter;
    c.actionHint = nextAction;
  } else if (nextShooter !== c.pickedShooterId || nextAction !== c.actionHint) {
    const res = c.controller.replaceDecision(nextShooter, nextAction);
    if (!res.ok) {
      alert(clutchRejectLabel(res.reason));
      return;
    }
    c.pickedShooterId = nextShooter;
    c.actionHint = nextAction;
  }
  renderClutchPlay();
}

function submitClutchDecision() {
  const c = state.clutch;
  if (!c) return;
  const res = c.controller.submit();
  if (!res.ok) {
    alert(clutchRejectLabel(res.reason));
    return;
  }
  // Retain the minimal pre-possession snapshot for the 3D replay: after
  // resolve() + runFast() the sim is at game-end state, so the possession
  // snapshot must be captured here, before the sim steps.
  c.replaySnapshot = captureClutchReplaySnapshot(c.sim.snapshot());
  const done = c.controller.resolve();
  if (!done.ok) {
    alert(L("这一回合没能完成，请再试一次。", "The possession did not finish — please retry."));
    return;
  }
  showClutchResult();
}

function clutchResultHtml(outcome, ex, final, sim) {
  const oppSide = sim.youSide === "home" ? "away" : "home";
  const youWon = final.score[sim.youSide] > final.score[oppSide];
  const verdict = youWon ? L("赢下了比赛", "Won the game") : L("没能赢下比赛", "Did not win the game");
  const lines = [];
  lines.push(ex.receivedBall
    ? L(`球传到了 ${ex.shooterName} 手里`, `The ball reached ${ex.shooterName}`)
    : L(`球没能传到 ${ex.shooterName} 手里`, `The ball never reached ${ex.shooterName}`));
  if (ex.attempted) {
    if (ex.shotByPick) {
      lines.push(ex.shotAsHinted
        ? L(`${ex.shooterName} 按你的选择出手了`, `${ex.shooterName} shot the way you called it`)
        : L(`${ex.shooterName} 出手了，但投的是两分（引擎仍按球员倾向选区）`, `${ex.shooterName} shot, but took a two — the engine still picks the zone by his tendencies`));
    } else {
      lines.push(L(`他拿到球后把球分了出去，最终由 ${ex.actualShooterName} 出手`, `He got the ball and kicked it out — ${ex.actualShooterName} ended up taking the shot`));
    }
    lines.push(ex.made
      ? L(`投篮命中，拿下 ${ex.points} 分`, `Made it — ${ex.points} points`)
      : L("投篮没进", "The shot missed"));
  } else {
    lines.push(clutchReasonText(ex.reason, ex.shooterName));
  }
  lines.push(L(
    `本回合球队得分变化 ${ex.teamPoints} 分；你的选择是${ex.actionHint === "three" ? "三分" : "突破"}`,
    `Team points this possession: ${ex.teamPoints}; your call was ${ex.actionHint === "three" ? "three" : "attack"}`,
  ));
  return `
    <div class="clutch-verdict">${esc(verdict)}</div>
    <div class="clutch-final-score">${esc(clutchTeamName("GSW"))} ${final.score.home} — ${final.score.away} ${esc(clutchTeamName("CLE"))}</div>
    <ul class="clutch-explain">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

function showClutchResult() {
  const c = state.clutch;
  if (!c) return;
  // The coach event's meta.clutchOutcome is the primary render source; the
  // controller's outcome (clutchLog[0]) is the same object — fallback if the
  // event was somehow missed.
  const outcome = c.eventOutcome.current || c.controller.outcome;
  const final = c.controller.finalSnapshot;
  const body = $("#clutch-result-body");
  if (body && outcome && final) {
    const ex = explainClutchOutcome(outcome, {
      shooterName: clutchPlayerName(c.sim, outcome.shooterId),
      actualShooterName: outcome.actualShooterId ? clutchPlayerName(c.sim, outcome.actualShooterId) : "",
    });
    body.innerHTML = clutchResultHtml(outcome, ex, final, c.sim);
  }
  if (outcome) audio.clutch((outcome.teamPoints || 0) > 0);
  // The 3D replay button only shows when there is a settled possession to replay.
  const replayBtn = $("#btn-clutch-3d-replay");
  if (replayBtn) replayBtn.hidden = !(outcome && c.replaySnapshot);
  const replayNote = $("#clutch-3d-note");
  if (replayNote) replayNote.hidden = true;
  show("clutchResult");
}

function cancelClutchChallenge() {
  const c = state.clutch;
  if (!c) return;
  disposeClutch3dReplay();
  c.controller.cancel();
  state.clutch = null;
}

/**
 * 3D replay (clutch 3D prototype, Stages 0–3): replays the JUST-RESOLVED
 * clutch possession in 3D. Reads the settled result (meta.clutchOutcome +
 * the retained pre-possession snapshot) — never re-simulates. Default is
 * 2D; the replay is an explicit opt-in. WebGL unavailable → stay on the
 * 2D result page with a note, no errors, no blank screen.
 */
async function openClutch3dReplay() {
  const c = state.clutch;
  if (!c || !c.replaySnapshot || !(c.eventOutcome.current || c.controller.outcome)) return;
  const note = $("#clutch-3d-note");
  if (note) note.hidden = true;
  disposeClutch3dReplay();
  let view;
  try {
    view = await CourtView3D.create($("#clutch-3d-root"));
  } catch (err) {
    console.warn("[clutch-3d] replay unavailable:", err);
    if (note) {
      note.hidden = false;
      note.textContent = L("当前设备不支持 3D 回放，已保留 2D 结果。", "3D replay is not available on this device — the 2D result is kept.");
    }
    return;
  }
  state.clutch3d = { view };
  setClutch3dStatus(L("正在加载 3D 回放…", "Loading the 3D replay…"));
  show("clutch3d");
  const shot = buildReplayShot(c.eventOutcome.current || c.controller.outcome, c.replayCapture?.dunkShooterId);
  try {
    view.resize();
    await view.playReplay(c.replaySnapshot, shot);
  } catch (err) {
    // Any failure after navigating to the 3D screen must fall back to the
    // 2D result page with a note — never strand the user on "正在加载…".
    console.warn("[clutch-3d] replay failed:", err);
    disposeClutch3dReplay();
    if (note) {
      note.hidden = false;
      note.textContent = L("3D 回放没能播出来，已保留 2D 结果。", "The 3D replay could not play — the 2D result is kept.");
    }
    show("clutchResult");
    return;
  }
  if (!state.clutch3d || state.clutch3d.view !== view) return; // left mid-load
  setClutch3dStatus(
    shot?.kind === "dunk"
      ? L("扣篮回放", "Dunk replay")
      : shot
        ? L("绝杀投篮回放", "Clutch shot replay")
        : L("本回合没有形成出手", "No shot on this possession"),
  );
}

function setClutch3dStatus(text) {
  const el = $("#clutch-3d-status");
  if (el) el.textContent = text;
}

function replayClutch3dAgain() {
  const c = state.clutch;
  const v = state.clutch3d?.view;
  if (!c || !v || !c.replaySnapshot) return;
  const shot = buildReplayShot(c.eventOutcome.current || c.controller.outcome, c.replayCapture?.dunkShooterId);
  v.playReplay(c.replaySnapshot, shot);
}

function closeClutch3dReplay() {
  disposeClutch3dReplay();
  show("clutchResult");
}

function disposeClutch3dReplay() {
  const v = state.clutch3d?.view;
  if (v) v.dispose();
  state.clutch3d = null;
}

$("#btn-clutch-3d-replay")?.addEventListener("click", () => openClutch3dReplay());
$("#btn-clutch-3d-back")?.addEventListener("click", () => closeClutch3dReplay());
$("#btn-clutch-3d-again")?.addEventListener("click", () => replayClutch3dAgain());

$("#btn-clutch-back")?.addEventListener("click", () => goBack());
$("#btn-clutch-entry")?.addEventListener("click", () => startMode("clutch"));
$("#btn-clutch-start")?.addEventListener("click", () => startClutchChallenge());
$("#btn-clutch-play-back")?.addEventListener("click", () => { cancelClutchChallenge(); goBack(); });
$("#btn-clutch-submit")?.addEventListener("click", () => submitClutchDecision());
$("#btn-clutch-retry")?.addEventListener("click", () => startClutchChallenge());
$("#btn-clutch-other")?.addEventListener("click", () => { cancelClutchChallenge(); show("clutch"); });
$("#btn-clutch-home")?.addEventListener("click", () => { cancelClutchChallenge(); show("home"); });
$("#btn-clutch-result-back")?.addEventListener("click", () => { cancelClutchChallenge(); show("clutch"); });

$("#btn-custom-hub-back")?.addEventListener("click", () => goBack());
$("#btn-custom-budget")?.addEventListener("click", async () => {
  state.mode = "custom";
  state.lastMode = "custom";
  await initDraft("custom");
  show("draft");
});
$("#btn-custom-duel")?.addEventListener("click", async () => {
  state.mode = "duel";
  state.lastMode = "duel";
  await initDraft("duel");
  show("draft");
});

// Legend Duel entry (D1): the Custom hub grid is static HTML, so the entry is
// injected here instead of editing index.html. 1v1 vs a legend, first to 11.
const legendDuelEntry = document.createElement("button");
legendDuelEntry.className = "mode-card";
legendDuelEntry.id = "btn-custom-legend-duel";
legendDuelEntry.type = "button";
legendDuelEntry.innerHTML = `<strong>${L("传奇单挑 · Legend Duel", "Legend Duel")}</strong><span>${L("1v1 挑战历史传奇，11 分制", "1v1 vs a legend, first to 11")}</span>`;
legendDuelEntry.addEventListener("click", () => openDuelSelect({}));
document.querySelector(".custom-hub-grid")?.appendChild(legendDuelEntry);

// Custom Duel filler dealing (hub setup): Balanced Roles (default) vs Fully Random. Persisted.
function syncDuelFillerButtons() {
  const mode = readDuelFillerMode(typeof localStorage !== "undefined" ? localStorage : undefined);
  document.querySelectorAll("[data-duel-filler]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-duel-filler") === mode);
  });
}
document.querySelectorAll("[data-duel-filler]").forEach((btn) => {
  btn.onclick = () => {
    writeDuelFillerMode(
      typeof localStorage !== "undefined" ? localStorage : undefined,
      btn.getAttribute("data-duel-filler")
    );
    syncDuelFillerButtons();
  };
});
syncDuelFillerButtons();
$("#btn-custom-legend")?.addEventListener("click", async () => {
  state.mode = "legend";
  state.lastMode = "legend";
  await startLegendMode();
});
$("#btn-custom-father-son")?.addEventListener("click", () => startFamilyDuel("fatherSon"));
$("#btn-custom-brothers")?.addEventListener("click", () => startFamilyDuel("brothers"));

/**
 * T2: 父子局 / 兄弟局 —— 两个完全自成一体的小模式，不走 state.career 那套 c.kind 状态机
 * （那套 39+ 处判断都假设两队共享同一个候选池，象家局/兄弟局恰恰相反：甲队只能买爸爸、
 * 乙队只能买儿子）。两边都由玩家自己花金币挑（跟「预算轮抽挑战」让玩家自己搭建两队是同一种
 * 思路），选完点「开打」直接 openSetup(teamA, teamB, "home")——跟 quick/sandbox 模式一样的最简
 * 入口，不进任何 bracket/duel 进程机制。
 */
function startFamilyDuel(theme) {
  const meta = FAMILY_DUEL_THEMES[theme];
  if (!meta) return;
  beginFlow(); // a fresh run: its saves belong to it, an older unfinished one is left alone
  const poolA = familyDuelPool(theme, "A");
  const poolB = familyDuelPool(theme, "B");
  state.familyDuel = {
    theme,
    poolA,
    poolB,
    sideA: freshFamilySide(meta.teamA),
    sideB: freshFamilySide(meta.teamB),
    shopA: familyDuelShop(poolA, new Set(), freshFamilySide(meta.teamA).gold),
    shopB: familyDuelShop(poolB, new Set(), freshFamilySide(meta.teamB).gold),
  };
  $("#family-duel-title").textContent = meta.label;
  $("#family-duel-name-a").textContent = meta.teamA;
  $("#family-duel-name-b").textContent = meta.teamB;
  renderFamilyDuel();
  show("familyDuel");
}

function familyDuelCardRow(p, { onBuy } = {}) {
  const price = playerPrice(p);
  return `<div class="market-row">
    ${photoImg(p)}
    <div style="flex:1">
      <strong>${esc(p.name)}</strong>
      <div class="tiny">${p.season} ${p.pos} · OVR ${overall(p)} · <strong>¤${price}</strong></div>
    </div>
    ${onBuy ? `<button class="btn small" data-family-buy="${p.id}">买入</button>` : ""}
  </div>`;
}

function renderFamilyDuel() {
  const f = state.familyDuel;
  if (!f) return;
  for (const side of ["A", "B"]) {
    const sideState = side === "A" ? f.sideA : f.sideB;
    const pool = side === "A" ? f.poolA : f.poolB;
    const shop = side === "A" ? f.shopA : f.shopB;
    $(`#family-duel-gold-${side.toLowerCase()}`).textContent =
      `金币 ¤${sideState.gold} · 已选 ${sideState.players.length}/12 · 候选池共 ${pool.length} 人`;
    const rosterBox = $(`#family-duel-roster-${side.toLowerCase()}`);
    rosterBox.innerHTML = sideState.players.length
      ? sideState.players.map((p) => familyDuelCardRow(p)).join("")
      : `<p class="tiny">还没选人——从下面的候选里买，或点「自动补满」。</p>`;
    const shopBox = $(`#family-duel-shop-${side.toLowerCase()}`);
    const owned = new Set(sideState.players.map((p) => p.id));
    const buyable = shop.filter((p) => !owned.has(p.id));
    shopBox.innerHTML = buyable.length
      ? buyable.map((p) => familyDuelCardRow(p, { onBuy: true })).join("")
      : `<p class="tiny">候选都买完了，点「刷新候选」换一批。</p>`;
    shopBox.querySelectorAll("[data-family-buy]").forEach((btn) => {
      btn.onclick = () => {
        const player = shop.find((p) => p.id === btn.dataset.familyBuy);
        const result = buyIntoFamilySide(sideState, player, pool);
        if (!result.ok) {
          alert(result.reason || L("无法买入", "Couldn't buy that."));
          return;
        }
        renderFamilyDuel();
      };
    });
  }
  $("#btn-family-duel-start").disabled = !familyDuelReadyToStart(f.sideA, f.sideB);
}

$("#btn-family-duel-back")?.addEventListener("click", () => goBack());
$("#btn-family-duel-refresh-a")?.addEventListener("click", () => {
  const f = state.familyDuel;
  if (!f) return;
  const owned = new Set(f.sideA.players.map((p) => p.id));
  f.shopA = familyDuelShop(f.poolA, owned, f.sideA.gold);
  renderFamilyDuel();
});
$("#btn-family-duel-refresh-b")?.addEventListener("click", () => {
  const f = state.familyDuel;
  if (!f) return;
  const owned = new Set(f.sideB.players.map((p) => p.id));
  f.shopB = familyDuelShop(f.poolB, owned, f.sideB.gold);
  renderFamilyDuel();
});
$("#btn-family-duel-autofill-a")?.addEventListener("click", () => {
  const f = state.familyDuel;
  if (!f) return;
  autoFillFamilySide(f.sideA, f.poolA);
  renderFamilyDuel();
});
$("#btn-family-duel-autofill-b")?.addEventListener("click", () => {
  const f = state.familyDuel;
  if (!f) return;
  autoFillFamilySide(f.sideB, f.poolB);
  renderFamilyDuel();
});
$("#btn-family-duel-start")?.addEventListener("click", () => {
  const f = state.familyDuel;
  if (!f || !familyDuelReadyToStart(f.sideA, f.sideB)) return;
  const teamA = { name: f.sideA.name, players: f.sideA.players, gold: 0 };
  const teamB = { name: f.sideB.name, players: f.sideB.players, gold: 0 };
  state.mode = "familyDuel";
  state.lastMode = "familyDuel";
  state.career = null;
  state.familyDuel = null;
  openSetup(teamA, teamB, "home");
});

// Back-button standard: draft / tournament / legend pop the nav stack
// (draft -> customHub when entered from there, else home; legend -> customHub —
// the old show("home") was the wrong parent). Setup keeps its explicit handler:
// its parent is state-dependent (career/duel -> market, sandbox -> sandbox).
$("#btn-draft-back").onclick = () => goBack();
$("#btn-tour-back").onclick = () => goBack();
$("#btn-legend-back").onclick = () => goBack();
// Market had no exit at all (soft-trapped): standard top-left back -> home.
$("#btn-market-back")?.addEventListener("click", () => goBack());
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
  if (state.mode === "sandbox") {
    show("sandbox");
    return;
  }
  show("home");
};
$("#btn-home").onclick = () => show("home");
$("#btn-again").onclick = async () => {
  // Rematch / new run — warn if abandoning an active career roster
  const abandoning =
    state.career?.kind === "career" ||
    state.career?.kind === "duel" ||
    state.tournament;
  if (
    abandoning &&
    !(await confirmAction(
      L(
        "再来一局会清空当前阵容与进度，重新开局。若要保留阵容请点「备战下一轮」。确定重开？",
        "Starting a new game clears the current roster and progress. To keep your roster, choose “Prepare for next round”. Start over?",
      ),
    ))
  ) {
    return;
  }
  startMode(state.lastMode || "quick");
};

// —— Account binder (persistent collection) ——
function activeAccount() {
  return getAccount(getActiveAccountId());
}

// Where the account screen's Back goes: the page the player came from, so backing out of account creation
// never drops them on home mid-game (show() only toggles screens, so that page's state is untouched).
let accountReturnScreen = "home";
function openAccountScreen() {
  const from = activeScreenName();
  if (from !== "account" && from !== "onboard") accountReturnScreen = from;
  hideAccountGate();
  show("account");
  renderAccountList();
}

function hideAccountGate() {
  const gate = $("#account-gate");
  if (gate) gate.hidden = true;
}

/** Non-blocking guidance for a guest who picked an account feature: say why, offer the existing flow. */
function showAccountGate(feature) {
  const gate = $("#account-gate");
  const text = $("#account-gate-text");
  if (!gate || !text) return;
  const what = feature ? L(feature.zh, feature.en) : L("这个功能", "This feature");
  text.textContent = L(
    `「${what}」需要本地账号：球员卡和班底存在账号里。快速开打和其他模式不需要账号。`,
    `${what} needs a local account: your cards and roster live in it. Quick Play and the other modes don't need one.`
  );
  gate.hidden = false;
}

function requireAccountReady(feature = null) {
  const acc = activeAccount();
  if (!acc) {
    showAccountGate(feature);
    return null;
  }
  if (!acc.onboardingDone || (acc.playerIds || []).length < 5 || !acc.coachId) {
    startOnboarding(acc);
    return null;
  }
  grantWelcomeTickets(acc);
  return acc;
}

/** The home bar shows the same profile picture as My World; updating it never re-renders My World (that would close the 3D viewer). */
function refreshAccountAvatar(acc = activeAccount()) {
  const img = $("#account-home-avatar");
  if (img) img.src = portraitFor(acc).src;
}

/** 8-player unlock gate (user decision 2026-11-08): the Ranked mode card shows a locked state with the remaining count until the account holds 8 players. The card stays clickable — tapping it explains the gate (startRankedMatch). */
function refreshRankedCardLock() {
  const card = document.querySelector('.mode-card[data-mode="ranked"]');
  const note = $("ranked-lock-note");
  if (!card || !note) return;
  const acc = activeAccount();
  const locked = !competitiveUnlocked(acc);
  card.classList.toggle("is-locked", locked);
  if (!locked) { note.hidden = true; note.textContent = ""; return; }
  note.hidden = false;
  note.textContent = !acc
    ? L("🔒 需账号 · 抽满 8 张球员解锁", "🔒 Needs an account · unlocks at 8 players")
    : L(`🔒 再抽 ${competitivePlayersNeeded(acc)} 张球员即可解锁`, `🔒 Draw ${competitivePlayersNeeded(acc)} more players to unlock`);
}

/**
 * Account Level celebration: one modal when a grant crosses a level boundary.
 * Fire-and-forget (never awaited): the result screen underneath stays usable.
 * Only game-result handlers call this — login / task / season-completion
 * grants surface through the My World badge and the result text instead, so
 * a modal never pops from a render path or on boot.
 */
function celebrateAccountLevelUp(before, after) {
  if (!after || after <= before) return;
  const lang = getLang();
  const title = levelTitle(after, lang);
  void confirmAction(
    L(`账号升到 Lv.${after}！新称号：${title}。奖励已放进 My World 的等级轨道，记得去领。`, `Account reached Lv.${after}! New title: ${title}. Rewards are waiting on the My World level track.`),
    { title: L("升级！", "Level up!"), acceptLabel: L("太棒了", "Nice!"), notice: true },
  );
}

/** My World refresh + the Legend Duel record block (duelView owns the block). */
function refreshMyWorld() {
  myWorld?.refresh();
  paintDuelRecordsIntoMyWorld();
}

/** Top-bar gold balance (clickable → opens the shop). Kept in sync on every navigation + account change. */
function refreshGoldChip() {
  const amt = $("#gold-chip-amt");
  const chip = $("#btn-gold-chip");
  const acc = activeAccount();
  if (amt) amt.textContent = String(acc?.gold || 0);
  if (chip) chip.title = L("商城", "Shop");
}

// Daily strip on the home screen: tasks progress + draw state, kept in sync
// with the account bar (same sources: taskBoard + canClaimDailyDraw).
function refreshDailyStrip(acc) {
  const tasksBtn = $("#btn-home-daily-tasks");
  const drawBtn = $("#btn-home-daily-draw");
  const tasksMeta = $("#home-daily-tasks-meta");
  const drawMeta = $("#home-daily-draw-meta");
  if (!tasksBtn || !drawBtn) return;
  if (!acc) {
    if (tasksMeta) tasksMeta.textContent = L("需账号", "Needs an account");
    if (drawMeta) drawMeta.textContent = L("需账号", "Needs an account");
    drawBtn.classList.remove("has-daily");
    return;
  }
  const board = taskBoard(acc, undefined, getLang());
  const done = board.tasks.filter((t) => t.claimed).length;
  const total = board.tasks.length;
  if (tasksMeta) tasksMeta.textContent = L(`已完成 ${done}/${total}`, `Done ${done}/${total}`);
  const state = dailyDrawState(acc);
  if (drawMeta) {
    drawMeta.textContent = state.claimed
      ? L("今日已领取", "Claimed today")
      : state.canClaim
        ? L("今日卡可领取", "Today's card ready")
        : L(`还差 ${Math.max(0, state.needed - state.tasksDone)} 项任务`, `${Math.max(0, state.needed - state.tasksDone)} more task(s) to go`);
  }
  drawBtn.classList.toggle("has-daily", !!acc.onboardingDone && canClaimDailyDraw(acc));
}

function refreshAccountHomeBar() {
  // Daily first login (+10, once per account per day; guests level up locally too).
  recordDailyLogin(activeAccount());
  refreshGoldChip();
  refreshRankedCardLock();
  refreshMyWorld();
  myTeamClubhouse?.refresh(); // cards, lineup and season records may have changed since the tab was last drawn
  refreshAccountAvatar(); // name/cards may have changed (switch account, onboarding, profile edit)
  refreshLongCareerHomeBar(); // a switch of account changes which saves may be offered
  refreshSaveHomeBar();
  const nameEl = $("#account-home-name");
  const lvEl = $("#account-home-lv");
  const metaEl = $("#account-home-meta");
  const hintEl = $("#account-home-hint");
  const drawBtn = $("#btn-daily-draw");
  const switchBtn = $("#btn-switch-account");
  const acc = activeAccount();
  const bar = $("#account-home-bar");
  bar?.classList.toggle("is-guest", !acc);
  // Compact identity only: name + level. Cards, ranked record and titles live in My World, not up here.
  if (lvEl) lvEl.textContent = ` · Lv.${levelSnapshot(acc).level}`;
  const setHint = (text) => {
    if (!hintEl) return;
    hintEl.textContent = text || "";
    hintEl.hidden = !text;
  };
  if (!acc) {
    bar?.classList.remove("has-daily");
    if (nameEl) nameEl.textContent = L("访客", "Guest");
    if (metaEl) metaEl.textContent = L("未登录", "Not signed in");
    setHint(L("无需注册即可开打；球员卡、抽卡、排位需账号。", "Play with no sign-up; cards, draws and ranked need an account."));
    // Enabled on purpose: tapping it explains what an account is for instead of doing nothing.
    if (drawBtn) drawBtn.disabled = false;
    if (switchBtn) switchBtn.textContent = L("创建 / 切换账号", "Create / Switch Account");
    refreshDailyStrip(null);
    return;
  }
  hideAccountGate();
  if (switchBtn) switchBtn.textContent = L("切换账号", "Switch Account");
  const dailyOk = canClaimDailyDraw(acc);
  if (nameEl) nameEl.textContent = acc.name;
  if (metaEl) metaEl.textContent = L("当前账号", "Current account");
  setHint(acc.onboardingDone ? "" : L("请先完成开局：抽 5 张开局卡 → 选教练 + 战术", "Finish setup first: draw your opening 5 → pick a coach + tactics"));
  bar?.classList.toggle("has-daily", !!acc.onboardingDone && dailyOk); // a gold dot: today's card is waiting
  if (drawBtn) {
    drawBtn.disabled = !acc.onboardingDone;
    drawBtn.textContent = dailyOk ? L("领取今日球员卡", "Claim today's card") : L("抽卡 · 心愿单", "Draw · Wishlist");
  }
  refreshDailyStrip(acc);
}

function renderAccountList() {
  const box = $("#account-list");
  if (!box) return;
  const list = listAccounts();
  const activeId = getActiveAccountId();
  if (isAccountStoreCorrupt()) {
    // D-P1-2: the store is damaged, so listAccounts() is empty — but that is not "no
    // accounts yet". Offer the export + fresh-start path instead of the create prompt
    // (creating an account right now could not persist anyway: saveAccount refuses).
    box.innerHTML = `<p class="tiny">${L(
      "账号数据已损坏，原始数据已自动备份，未被覆盖。建议先下载备份，再删除损坏的账号库重新开始。",
      "Your account data is damaged; the original bytes were automatically backed up and not overwritten. Download the backup first, then discard the damaged store to start fresh.",
    )}</p>
      <div class="btn-row">
        <button type="button" class="btn small" id="btn-corrupt-accounts-download">${L("下载备份", "Download backup")}</button>
        <button type="button" class="btn small ghost" id="btn-corrupt-accounts-discard">${L("删除损坏的账号库", "Discard damaged store")}</button>
      </div>`;
    box.querySelector("#btn-corrupt-accounts-download").onclick = downloadCorruptAccountsBackup;
    box.querySelector("#btn-corrupt-accounts-discard").onclick = async () => {
      if (!(await confirmAction(L("删除损坏的账号库并重新开始？备份仍保留在浏览器中，不会被删除。", "Discard the damaged account store and start fresh? The backup stays in the browser and is not deleted.")))) return;
      if (discardCorruptAccountStore()) {
        renderAccountList();
        refreshAccountHomeBar();
      }
    };
    return;
  }
  if (!list.length) {
    box.innerHTML = `<p class="tiny">${L("还没有账号。上方输入昵称创建，开局抽 5 张卡再选教练。", "No account yet. Enter a nickname above to create one — you'll draw 5 opening cards, then pick a coach.")}</p>`;
    return;
  }
  box.innerHTML = list
    .map((a) => {
      const active = a.id === activeId ? " active" : "";
      return `<div class="account-row${active}">
        <div>
          <strong>${esc(a.name)}</strong>
          <div class="tiny">${a.cardCount} 张卡 · ${a.ready ? (a.cardCount >= MIN_COMPETITIVE_ROSTER ? L("可排位", "Ranked ready") : L(`再抽 ${MIN_COMPETITIVE_ROSTER - a.cardCount} 张可排位`, `Draw ${MIN_COMPETITIVE_ROSTER - a.cardCount} more to unlock Ranked`)) : L("未完成开局", "Setup incomplete")}</div>
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
      forgetOtherAccountsProgress();
      const acc = activeAccount();
      if (acc && !acc.onboardingDone) startOnboarding(acc);
      else {
        refreshAccountHomeBar();
        show("home");
      }
    };
  });
  box.querySelectorAll("[data-acc-del]").forEach((btn) => {
    btn.onclick = async () => {
      if (
        !(await confirmAction(
          L("删除该账号及其全部球员卡？不可恢复。", "Delete this account and all its player cards? This can't be undone."),
        ))
      )
        return;
      deleteAccount(btn.dataset.accDel);
      renderAccountList();
      forgetOtherAccountsProgress();
      refreshAccountHomeBar();
    };
  });
}

$("#btn-switch-account")?.addEventListener("click", openAccountScreen);
$("#btn-account-gate-create")?.addEventListener("click", openAccountScreen);
$("#btn-account-gate-dismiss")?.addEventListener("click", hideAccountGate);
/**
 * Compact account menu: the button toggles the panel; Esc and a click/tap outside close it (Esc hands focus back to
 * the button), Arrow keys move between the items, and picking an item closes it. Keyboard + touch reachable.
 */
function setAccountMenu(open, { focusButton = false } = {}) {
  const btn = $("#btn-profile-toggle");
  const panel = $("#profile-panel");
  if (!btn || !panel) return;
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  if (!open && focusButton) btn.focus();
}
const accountMenuItems = () => [...document.querySelectorAll("#profile-panel [role='menuitem']:not([disabled])")];
$("#btn-profile-toggle")?.addEventListener("click", () => setAccountMenu($("#profile-panel")?.hidden !== false));
$("#btn-profile-toggle")?.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowDown") return;
  e.preventDefault();
  setAccountMenu(true);
  accountMenuItems()[0]?.focus();
});
$("#profile-panel")?.addEventListener("click", (e) => {
  if (e.target.closest("[role='menuitem']")) setAccountMenu(false);
});
$("#profile-panel")?.addEventListener("keydown", (e) => {
  const items = accountMenuItems();
  const at = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#profile-panel")?.hidden === false) setAccountMenu(false, { focusButton: true });
});
document.addEventListener("click", (e) => {
  if ($("#profile-panel")?.hidden === false && !e.target.closest("#account-home-bar")) setAccountMenu(false);
});
$("#btn-account-back")?.addEventListener("click", () => show(accountReturnScreen || "home"));
$("#btn-open-collection")?.addEventListener("click", () => {
  if (!requireAccountReady({ zh: "我的球员卡", en: "My Player Cards" })) return;
  openCollection();
});
$("#btn-daily-draw")?.addEventListener("click", () => {
  if (!requireAccountReady({ zh: "每日抽卡", en: "Daily Draw" })) return;
  openDailyDraw();
});
$("#btn-collection-back")?.addEventListener("click", () => goBack());
$("#btn-open-credits")?.addEventListener("click", openCredits);
$("#btn-credits-back")?.addEventListener("click", () => goBack());
$("#btn-draw-back")?.addEventListener("click", () => {
  // Explicit, not goBack(): the collection must re-render after a draw
  // (a pulled card joins it). But it must still behave like a pop: a
  // plain show("collection") records a forward navigation and pushes
  // "draw" onto the trail, so the collection's goBack() returns straight
  // to the draw — a draw <-> collection ping-pong when the draw was
  // entered from home (or anywhere but the collection). resolveDrawBack
  // consumes the return entry when there is one; navPopping keeps the
  // jump itself from pushing a new one.
  refreshAccountHomeBar();
  resolveDrawBack(navStack);
  navPopping = true;
  try {
    show("collection");
  } finally {
    navPopping = false;
  }
  openCollection();
});
$("#btn-collection-draw")?.addEventListener("click", () => openDailyDraw());
$("#btn-home-daily-draw")?.addEventListener("click", () => openDailyDraw());
$("#btn-home-daily-tasks")?.addEventListener("click", () => {
  openDailyDraw();
  // The task list sits at the bottom of the draw screen: jump straight to it.
  if (activeScreenName() === "draw") $("#draw-tasks")?.scrollIntoView({ block: "start" });
});
$("#btn-collection-ranked")?.addEventListener("click", () => startRankedMatch());

$("#btn-account-create")?.addEventListener("click", () => {
  // D-P1-2: an account created over a corrupt store could not persist (saveAccount
  // refuses), so stop here with an explanation instead of a silently lost account.
  if (isAccountStoreCorrupt()) {
    alert(L("账号数据已损坏，暂时无法创建新账号。请先在账号列表处下载备份并删除损坏的账号库。", "Account data is damaged, so no new account can be created right now. Download the backup from the account list and discard the damaged store first."));
    return;
  }
  const name = $("#account-new-name")?.value || "";
  const acc = createAccount(name);
  forgetOtherAccountsProgress();
  if ($("#account-new-name")) $("#account-new-name").value = "";
  startOnboarding(acc);
});

function onboardCardHtml(p, { selectable = false, selected = false } = {}) {
  const ovr = overall(p);
  const tag = selectable ? "button" : "div";
  const attrs = selectable ? `type="button" data-pick="${esc(p.id)}"` : "";
  return playerCardHtml(p, { ovr, lang: getLang(), tag, attrs, selected, viewOnly: !selectable });
}

// Where Cancel goes: the page onboarding was started from (the account page hands over to wherever
// that was opened from). show() only toggles screens, so that page's state is exactly as it was left.
let onboardReturnScreen = "home";

function cancelOnboarding() {
  state.onboard = null; // the dealt cards are random and re-rolled next time; nothing is saved until the last step
  refreshAccountHomeBar();
  show(onboardReturnScreen);
}

function startOnboarding(acc) {
  const from = activeScreenName();
  if (from !== "onboard") onboardReturnScreen = from === "account" ? accountReturnScreen : from;
  // Opening draws: 5 cards, one per position, pure random, no pity. Drawn
  // now (in memory only); nothing is saved until the last step.
  const { players, gacha } = drawStarterFive();
  state.onboard = {
    accountId: acc.id,
    step: 1,
    starterDraws: players,
    starterGacha: gacha,
    coachOffers: rollCoachOffers(5),
    coachId: null,
    tacticId: null,
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
  // Back-button standard: wizard step-back (hidden on step 1 — cancel is the
  // exit there). Stepping back keeps every pick so far.
  const prev = $("#btn-onboard-prev");
  if (prev) prev.hidden = ob.step === 1;
  if (ob.step === 1) {
    const drawn = ob.starterDraws || [];
    if (label) label.textContent = L("1/3 开局抽卡", "1/3 Opening draws");
    if (hint) {
      hint.textContent = L(
        "开局抽 5 张卡，每位置一张（控卫/分卫/小前/大前/中锋），纯随机、无保底。这 5 张就是你的首发五虎。",
        "Your opening 5 cards, one per position (PG/SG/SF/PF/C), pure random with no pity. These 5 are your starting five.",
      );
    }
    pool.innerHTML = drawn.map((p) => onboardCardHtml(p)).join("");
    if (next) {
      next.disabled = drawn.length < 5;
      next.textContent = L("去选教练", "Pick a coach");
    }
  } else if (ob.step === 2) {
    if (label) label.textContent = L("2/3 选教练", "2/3 Pick a coach");
    if (hint) {
      hint.textContent = L(
        "首发 5 人已定。开局只能选菜鸟/边缘主帅——菲尔、波波维奇等名帅需每日抽卡获得。",
        "Your starting five is set. You can only pick a rookie/fringe head coach to start — Phil, Popovich and other greats come from daily draws.",
      );
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
      next.textContent = L("下一步：选战术", "Next: pick a system");
    }
  } else {
    const coach = ob.coachOffers.find((c) => c.id === ob.coachId) || resolveCoach(ob.coachId);
    const tactics = coachTactics(coach);
    if (label) label.textContent = L("3/3 选战术", "3/3 Pick a system");
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
      next.textContent = L("完成开局", "Finish setup");
    }
  }
}

/** Real-basketball status badge for a player card -- see data/playerLegacy.js for the full
 * priority rules (curated iconic season > NBA50 fallback > curated superstar > generic bucket
 * off hiddenTier > plain OVR bands). Returns the `<span>` markup plus an optional inline style
 * for the card wrapper (only set for hand-picked iconic seasons, e.g. 96 Jordan in Bulls red). */
function legacyBadgeHtml(p, ovr) {
  const badge = playerLegacyBadge(p, ovr);
  if (!badge.label) return { tagHtml: "", cardStyle: "", cardClass: "" };
  const tagHtml = ` <span class="rarity-tag ${badge.cls}">${esc(badge.label)}</span>`;
  return { tagHtml, cardStyle: badge.cardStyle || "", cardClass: badge.cardStyle ? " legend-season" : "" };
}

$("#btn-onboard-cancel")?.addEventListener("click", async () => {
  if ((state.onboard?.step ?? 1) > 1 && !(await confirmAction(L("退出开局建队？已抽的 5 张卡会清空，下次重新抽。", "Leave team setup? The 5 drawn cards will be cleared and you'll draw again next time."), {
    title: L("取消开局建队？", "Cancel team setup?"),
    acceptLabel: L("退出", "Leave"),
  }))) return;
  cancelOnboarding();
});
$("#btn-onboard-prev")?.addEventListener("click", () => {
  const ob = state.onboard;
  if (!ob || ob.step <= 1) return;
  ob.step -= 1;
  renderOnboard();
});
$("#btn-onboard-next")?.addEventListener("click", () => {
  const ob = state.onboard;
  if (!ob) return;
  if (ob.step === 1) {
    if ((ob.starterDraws || []).length < 5) return;
    ob.step = 2;
    renderOnboard();
    return;
  }
  if (ob.step === 2) {
    if (!ob.coachId) return;
    ob.step = 3;
    const coach = ob.coachOffers.find((c) => c.id === ob.coachId);
    const first = coachTactics(coach)[0];
    ob.tacticId = first?.id || "balanced";
    renderOnboard();
    return;
  }
  const acc = getAccount(ob.accountId);
  finalizeOnboarding(acc, {
    playerIds: (ob.starterDraws || []).map((p) => p.id),
    coachId: ob.coachId,
    tacticId: ob.tacticId,
    gacha: ob.starterGacha,
  });
  state.onboard = null;
  refreshAccountHomeBar();
  openCollection();
});

let collectionFilter = freshFilter();
let collectionCache = null;
/** Collection grid paging (S-P1-2): one page per render, "load more" adds a page. */
const COLLECTION_PAGE_SIZE = 50;
let collectionShown = COLLECTION_PAGE_SIZE;
let collectionQueryTimer = null;
/** Last (acc, players) pair and the context built for it — rebuilt only when
 * the binder changes; openCollection() rebuilds the pair on every state
 * change, so a stale redundant/order scan cannot survive a mutation. */
let collectionContextMemo = null;

/** Cards the filter bar / grid work on, with the lookups the filter needs. */
function collectionContext(acc, players, ovrOf = overall) {
  const junk = new Set(junkIds(acc));
  return {
    ovrOf,
    hiddenOf: (card) => card.hiddenRoll?.rating,
    redundant: redundantIds(players, ovrOf),
    junk,
    order: new Map((acc.playerIds || []).map((id, index) => [id, index])),
  };
}

function paintCollectionGrid(acc, players) {
  const grid = $("#collection-grid");
  if (!grid) return;
  // S-P2-4: overall() once per card per binder session — the same cached
  // function feeds the filter/sort, the redundant scan and the card footers.
  const ovrOf = cachedOvrOf(overall);
  if (!collectionContextMemo || collectionContextMemo.acc !== acc || collectionContextMemo.players !== players) {
    collectionContextMemo = { acc, players, ctx: collectionContext(acc, players, ovrOf), ovrOf };
  }
  const view = applyCollectionView(players, collectionFilter, collectionContextMemo.ctx);
  const souls = acc.gacha?.souls || {};
  const lang = getLang();
  const page = view.slice(0, collectionShown);
  grid.innerHTML = page.length
    ? page
        .map((p) => {
          const ovr = collectionContextMemo.ovrOf(p);
          const footMeta = [
            p.age ? L(`${p.age}岁`, `${p.age} yrs`) : "",
            p.careerPhaseLabel ? esc(careerPhaseLabelL(p.careerPhaseLabel, lang)) : "",
            p.twilight ? L("头像为生涯照", "Career photo") : "",
          ].filter(Boolean).join(" · ");
          return playerCardHtml(p, {
            ovr, lang,
            extra: `${footMeta ? `<div class="meta">${footMeta}</div>` : ""}
          <div class="rot-attrs sub-attrs">${subAttrChipsHtml(p, lang)}</div>
          <div class="meta">${hiddenBadgesHtml(p, esc)}</div>
          ${skillChipsHtml(p, lang)}
          <div class="card-actions">${soulButtonHtml(p, souls[p.bref] || 0)}${favoriteControlHtml(p, acc.cardMods?.[p.id]?.growth, acc.favoriteId === p.id)}${recycleButtonHtml(p, { isFavorite: acc.favoriteId === p.id })}</div>`,
          });
        })
        .join("")
    : `<p class="tiny">${L("没有符合条件的卡——放宽筛选试试。", "No matching cards — try widening the filter.")}</p>`;
  const count = $("[data-cf-count]");
  if (count) count.textContent = L(`显示 ${view.length}/${players.length} 张`, `Showing ${view.length}/${players.length}`);
  const more = $("#collection-more");
  if (more) {
    const rest = view.length - collectionShown;
    more.innerHTML = rest > 0
      ? `<button type="button" class="btn" data-cf-more>${L(`加载更多（还剩 ${rest} 张）`, `Load more (${rest} remaining)`)}</button>`
      : "";
  }
}

function paintCollectionFilter(players) {
  const box = $("#collection-filter");
  if (box) box.innerHTML = filterBarHtml(collectionFilter, { shown: players.length, total: players.length, decades: decadesOf(players) }, esc, getLang());
}

$("#collection-filter")?.addEventListener("input", (event) => {
  if (event.target.dataset.cf !== "query" || !collectionCache) return;
  collectionFilter = { ...collectionFilter, query: event.target.value };
  const clearBtn = event.target.closest(".search-wrap")?.querySelector("[data-cf-clear]");
  if (clearBtn) clearBtn.hidden = !event.target.value;
  collectionShown = COLLECTION_PAGE_SIZE;
  // S-P1-2: debounce the search repaint — one keystroke used to rebuild the
  // whole grid (filter + redundant scan + every card's HTML).
  clearTimeout(collectionQueryTimer);
  collectionQueryTimer = setTimeout(() => paintCollectionGrid(collectionCache.acc, collectionCache.players), 150);
});
$("#collection-more")?.addEventListener("click", (event) => {
  if (!event.target.closest("[data-cf-more]") || !collectionCache) return;
  collectionShown += COLLECTION_PAGE_SIZE;
  paintCollectionGrid(collectionCache.acc, collectionCache.players);
});
$("#collection-filter")?.addEventListener("click", (event) => {
  const clearBtn = event.target.closest("[data-cf-clear]");
  if (!clearBtn || !collectionCache) return;
  collectionFilter = { ...collectionFilter, query: "" };
  const input = $("#collection-filter")?.querySelector('[data-cf="query"]');
  if (input) input.value = "";
  clearBtn.hidden = true;
  collectionShown = COLLECTION_PAGE_SIZE;
  paintCollectionGrid(collectionCache.acc, collectionCache.players);
  input?.focus();
});
$("#collection-filter")?.addEventListener("change", (event) => {
  const key = event.target.dataset.cf;
  if (!key || key === "query" || !collectionCache) return;
  const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  collectionFilter = { ...collectionFilter, [key]: value };
  collectionShown = COLLECTION_PAGE_SIZE;
  paintCollectionGrid(collectionCache.acc, collectionCache.players);
});

/** Who took each photo we show, and under which licence (photoCredits.js).
 * S-P2-2: the credits list is paged (100/page + "load more") instead of one
 * 2640-row innerHTML, and the sorted rows are cached — the bref→name map and
 * the nameOf closure are built once so repeat opens hit creditRows' cache. */
const CREDITS_PAGE_SIZE = 100;
let creditsRows = null;
let creditsShown = CREDITS_PAGE_SIZE;
let creditsNames = null;
const creditNameOf = (bref) => creditsNames?.get(bref) || bref;

function paintCredits() {
  const body = $("#credits-body");
  if (!body || !creditsRows) return;
  body.innerHTML = creditsHtml(
    { rows: creditsRows, localCount: Object.keys(LOCAL_AVATARS).length, shown: creditsShown },
    esc,
  );
}

async function openCredits() {
  // ~900 KB of credit text, only for this page: loaded on first open, never at boot (see scripts/measure/mobile-first-load.mjs).
  const { PHOTO_CREDITS } = await import("./data/photoCredits.js");
  if (!creditsNames) {
    creditsNames = new Map();
    for (const player of PLAYERS) if (!creditsNames.has(player.bref)) creditsNames.set(player.bref, player.name);
  }
  creditsRows = creditRows(PHOTO_CREDITS, creditNameOf);
  creditsShown = CREDITS_PAGE_SIZE;
  paintCredits();
  show("credits");
  window.scrollTo(0, 0);
}

$("#credits-body")?.addEventListener("click", (event) => {
  if (!event.target.closest("[data-credits-more]") || !creditsRows) return;
  creditsShown += CREDITS_PAGE_SIZE;
  paintCredits();
});

async function openCollection() {
  const acc = requireAccountReady();
  if (!acc) return;
  await playersReady(); // perf-r3: boot resolves before the full 23k-card pool is built; wait for it here
  assertPlayersReady("openCollection");
  // S-P2-4: sort on one cached overall() per card, not two calls per comparison.
  const ovrOf = cachedOvrOf(overall);
  const players = resolvePlayers(acc.playerIds, acc).sort((a, b) => ovrOf(b) - ovrOf(a));
  const coach = resolveCoach(acc.coachId);
  const tactic = TACTICS[acc.tacticId] || TACTICS.balanced;
  const sum = $("#collection-summary");
  if (sum) {
    sum.innerHTML = `
      <span><strong>${esc(acc.name)}</strong></span>
      <span>收藏 ${players.length} 张</span>
      <span>排位 ${acc.rankedWins || 0}-${acc.rankedLosses || 0}</span>
      <span>金币 ¤${acc.gold || 0}</span>
      <span>${canClaimDailyDraw(acc) ? "今日球员卡可领" : "今日已领"}</span>`;
  }
  const staff = $("#collection-staff");
  if (staff) {
    const owned = ownedCoaches(acc);
    const coachOpts = (owned.length ? owned : COACHES.filter((c) => c.id === acc.coachId))
      .map((c) => {
        const lang = getLang();
        const tag = isLegendCoach(c) ? (lang === "en" ? " · Legend" : " · 名帅") : "";
        return `<option value="${c.id}" ${c.id === acc.coachId ? "selected" : ""}>${esc(coachName(c, lang))}（${c.season} ${c.team}${tag}）</option>`;
      })
      .join("");
    staff.innerHTML = coach
      ? `<strong>${getLang() === "en" ? "Head Coach" : "主教练"}</strong> ${esc(coachName(coach, getLang()))} · ${esc(coachRecordLabel(coach, getLang()))}${
          isLegendCoach(coach) ? ` <span class="rarity-tag myth">${getLang() === "en" ? "Legend" : "名帅"}</span>` : ""
        }<br/>
         <span class="tiny">${esc(coachStyle(coach, getLang()))} · ${getLang() === "en" ? "Specialty" : "擅长"} ${esc(coachSpecialtyLabel(coach, getLang()))} · ${getLang() === "en" ? `Default “${esc(tacticName(tactic, getLang()))}”` : `默认「${esc(tactic.name)}」`}</span>
         <p class="tiny">${esc(coachNote(coach, getLang()) || "")} · ${getLang() === "en" ? `Own ${owned.length} coaches (legends come from pulls).` : `已拥有教练 ${owned.length} 名（名帅靠抽卡）。`}</p>
         <div class="btn-row" style="margin-top:8px">
           <label class="tiny">更换战术（仅本教头战术板）
             <select id="collection-tactic">${coachTactics(coach)
               .map(
                 (t) =>
                   `<option value="${t.id}" ${t.id === acc.tacticId ? "selected" : ""}>${esc(tacticName(t, getLang()))}</option>`
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
    collectionCache = { acc, players };
    collectionShown = COLLECTION_PAGE_SIZE;
    paintCollectionFilter(players);
    paintCollectionGrid(acc, players);
    grid.onchange = (event) => {
      const select = event.target.closest("[data-favorite]");
      if (!select?.value) return;
      try {
        setFavorite(acc, select.dataset.favorite, select.value);
        openCollection();
      } catch (error) {
        alert(error.message);
      }
    };
    grid.onclick = (event) => {
      const recycle = event.target.closest("[data-recycle]");
      if (recycle) {
        recycleWithConfirm(acc, [recycle.dataset.recycle]);
        return;
      }
      const button = event.target.closest("[data-soul-star]");
      if (!button) return;
      try {
        const notice = soulStarNotice(starUpWithSouls(acc, button.dataset.soulStar));
        if (notice) alert(notice);
        openCollection();
      } catch (error) {
        alert(error.message);
      }
    };
  }
  renderCollectionManage(acc, players);
  const drawBtn = $("#btn-collection-draw");
  if (drawBtn) {
    drawBtn.disabled = false;
    drawBtn.textContent = canClaimDailyDraw(acc) ? "去领今日球员卡" : "抽卡 / 心愿单";
  }
  show("collection");
}

function renderCollectionManage(acc, players) {
  const box = $("#collection-manage");
  if (!box) return;
  const junk = junkIds(acc);
  const byId = new Map(players.map((p) => [p.id, p]));
  const total = junk.reduce(
    (sum, id) => {
      const value = recycleValue(byId.get(id));
      return { gold: sum.gold + value.gold, fragments: sum.fragments + value.fragments };
    },
    { gold: 0, fragments: 0 }
  );
  box.innerHTML = manageBarHtml({ account: acc, codex: codexProgress(acc, PLAYERS), junk: { count: junk.length, ...total } });
}

/** Recycle with a confirm that names the value; risky cards get a second, specific warning. */
async function recycleWithConfirm(acc, ids) {
  try {
    const preview = resolvePlayers(ids, acc);
    const gold = preview.reduce((sum, card) => sum + recycleValue(card).gold, 0);
    const fragments = preview.reduce((sum, card) => sum + recycleValue(card).fragments, 0);
    const joiner = L("、", ", ");
    const shown = preview.slice(0, 3).map((card) => (getLang() === "en" ? card.nameEn || card.name : card.name));
    const names = shown.join(joiner) + (preview.length > 3 ? L(` 等 ${preview.length} 张`, ` and ${preview.length - 3} more`) : "");
    if (!(await confirmAction(
      L(`分解 ${names}？不可撤销，获得 ¤${gold} + ${fragments} 技能碎片。`, `Break down ${names}? This can't be undone. You get ¤${gold} + ${fragments} skill fragments.`),
      { title: L("分解球员卡", "Break down cards"), acceptLabel: L("分解", "Break down") },
    ))) return;
    try {
      recycleCards(acc, ids);
    } catch (error) {
      if (!error.needsConfirm) throw error;
      const why = error.needsConfirm.map((c) => {
        const name = getLang() === "en" ? c.nameEn || c.name : c.name;
        const reasons = c.why.map((reason) => {
          if (getLang() !== "en") return reason;
          if (reason === "主力阵容") return "in the lineup";
          const grade = /^成色 ([A-Z])$/.exec(reason);
          return grade ? `grade ${grade[1]}` : reason;
        });
        return `${name} (${reasons.join(L("、", ", "))})`;
      }).join(L("；", "; "));
      if (!(await confirmAction(
        L(`注意：${why}。仍然分解吗？`, `Note: ${why}. Break them down anyway?`),
        { title: L("这些卡很可能值得留", "These cards are probably worth keeping"), acceptLabel: L("仍然分解", "Break down anyway") },
      ))) return;
      recycleCards(acc, ids, { confirmed: true });
    }
    openCollection();
  } catch (error) {
    alert(error.message);
  }
}

$("#collection-manage")?.addEventListener("click", (event) => {
  const acc = activeAccount();
  if (!acc) return;
  if (event.target.closest("[data-recycle-junk]")) {
    recycleWithConfirm(acc, junkIds(acc));
    return;
  }
});

const drawView = () => ({ esc, photoImg, skillChipsHtml, ovrOf: overall });
let drawBannerId = "standard";

function renderDrawStatus(acc) {
  const state = dailyDrawState(acc);
  const wish = acc.gacha?.wishlist;
  const wishName = wish ? PLAYERS.find((p) => p.bref === wish)?.name : null;
  $("#draw-status").innerHTML = drawStatusHtml(acc, state, wishName, esc, getLang());
  $("#draw-tasks").innerHTML = tasksHtml(taskBoard(acc, undefined, getLang()));
  const pull = $("#btn-draw-pull");
  if (!pull) return;
  const full = cardRoom(acc) <= 0;
  const remaining = Math.max(0, state.needed - state.tasksDone);
  pull.disabled = !state.canClaim || !!acc.pendingRoll || full;
  pull.textContent = acc.pendingRoll
    ? "先选择成色"
    : full
      ? "卡库已满 · 先去分解"
      : state.claimed
        ? "今日球员卡已领取"
        : state.payWith === "tasks"
          ? "领取今日球员卡"
          : state.payWith === "ticket"
            ? `用抽卡券领取（剩 ${state.tickets} 张）`
            : `再完成 ${remaining} 项任务可领取`;
}

function renderWishPanel(acc) {
  const query = $("#wish-search")?.value || "";
  const wish = acc.gacha?.wishlist;
  $("#wish-panel").innerHTML = wishlistHtml(
    {
      people: query.trim() ? searchPeople(PLAYERS, query, { ovrOf: overall }) : [],
      wishBref: wish || null,
      wishName: wish ? PLAYERS.find((p) => p.bref === wish)?.name : null,
      wishCards: wish ? PLAYERS.filter((p) => p.bref === wish).sort((a, b) => b.season - a.season) : [],
      ownedIds: new Set(acc.playerIds || []),
      gold: acc.gold || 0,
    },
    drawView()
  );
}

let bannerStatsCache = { key: "", stats: {} };

/** Banner buttons + the explanation of the selected one (pool facts, wished player). */
function paintDrawBanners(acc) {
  const banners = currentBanners();
  const wish = acc.gacha?.wishlist || null;
  const key = `${banners.map((banner) => banner.id).join("|")}|${wish}|${PLAYERS.length}`;
  if (bannerStatsCache.key !== key) {
    bannerStatsCache = {
      key,
      stats: Object.fromEntries(banners.map((banner) => [banner.id, bannerStats(PLAYERS, banner, overall, wish)])),
    };
  }
  const days = daysUntilRotation();
  const selected = banners.find((banner) => banner.id === drawBannerId) || banners[0];
  const wishName = wish ? PLAYERS.find((p) => p.bref === wish)?.name : null;
  $("#draw-banners").innerHTML = bannerPickerHtml(banners, selected.id, esc, { stats: bannerStatsCache.stats, days }, getLang());
  $("#draw-banner-explain").innerHTML = bannerExplainHtml(selected, bannerStatsCache.stats[selected.id], { days, wishName, lang: getLang() }, esc);
}

async function openDailyDraw() {
  const acc = requireAccountReady();
  if (!acc) return;
  await playersReady(); // perf-r3: banner odds/wishlist search need the full card pool
  assertPlayersReady("openDailyDraw");
  $("#draw-rules").innerHTML = drawRulesHtml(getLang());
  paintDrawBanners(acc);
  const choice = pendingRollChoice(acc);
  $("#draw-stage").innerHTML = choice
    ? `<p class="tiny">上次升星还没选成色：</p>${rollChoiceHtml(choice)}`
    : `<p class="tiny">选好卡池后开包。</p>`;
  renderDrawStatus(acc);
  renderWishPanel(acc);
  show("draw");
}

$("#screen-draw")?.addEventListener("click", (event) => {
  const acc = activeAccount();
  if (!acc) return;
  const target = event.target.closest("[data-banner],[data-roll-keep],[data-wish],[data-craft]");
  if (!target) return;
  try {
    if (target.dataset.banner) {
      drawBannerId = target.dataset.banner;
      paintDrawBanners(acc);
    } else if (target.dataset.rollKeep) {
      const keepNew = target.dataset.rollKeep === "new";
      resolvePendingRoll(acc, keepNew);
      target.closest(".roll-choice").innerHTML = `<p class="tiny">已${keepNew ? "换成新" : "保留原"}成色。</p>`;
    } else if (target.dataset.wish) {
      setWishlist(acc, target.dataset.wish);
      paintDrawBanners(acc);
    } else if (target.dataset.craft) {
      const { player, cost } = craftWishCard(acc, target.dataset.craft);
      $("#draw-stage").innerHTML = `<p class="tiny">花费 ¤${cost} 合成 ${esc(player.name)}（${player.season}）——成色去「我的球员卡」揭晓。</p>`;
    }
    renderDrawStatus(acc);
    renderWishPanel(acc);
  } catch (error) {
    alert(error.message);
  }
});
$("#wish-search")?.addEventListener("input", () => {
  const clearBtn = $("#wish-search-clear");
  if (clearBtn) clearBtn.hidden = !$("#wish-search").value;
  const acc = activeAccount();
  if (acc) renderWishPanel(acc);
});
$("#wish-search-clear")?.addEventListener("click", () => {
  const input = $("#wish-search");
  if (!input) return;
  input.value = "";
  $("#wish-search-clear").hidden = true;
  const acc = activeAccount();
  if (acc) renderWishPanel(acc);
  input.focus();
});

$("#btn-draw-pull")?.addEventListener("click", () => {
  const acc = activeAccount();
  if (!acc || !canClaimDailyDraw(acc) || acc.pendingRoll || cardRoom(acc) <= 0) return;
  try {
    const result = claimDailyDraw(acc, { bannerId: drawBannerId });
    $("#draw-stage").innerHTML = drawRevealHtml(result, drawView());
    audio.reveal(result);
    renderDrawStatus(acc);
    renderWishPanel(acc);
    refreshAccountHomeBar();
  } catch (e) {
    alert(e.message || L("抽卡失败", "The draw failed."));
  }
});

async function startRankedMatch() {
  beginFlow(); // a fresh run: its saves belong to it, an older unfinished one is left alone
  const acc = requireAccountReady({ zh: "排位赛", en: "Ranked" });
  if (!acc) return;
  await playersReady(); // perf-r3: autoFillTeam() below reads PLAYERS synchronously
  // 8-player unlock gate (user decision 2026-11-08): ranked needs 8 players on the account.
  if (!competitiveUnlocked(acc)) {
    alert(L(`再抽 ${competitivePlayersNeeded(acc)} 张球员即可解锁排位赛。`, `Draw ${competitivePlayersNeeded(acc)} more players to unlock Ranked.`));
    return;
  }
  const home = accountToTeam(acc);
  if (!home || home.players.length < 5) {
    alert(L("班底不足 5 人，无法排位。", "You need 5 players on the roster to play Ranked."));
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
async function initDraft(mode) {
  beginFlow(); // a fresh run: its saves belong to it, an older unfinished one is left alone
  const isDuel = mode === "duel";
  const isCustom = mode === "custom";
  const isHumanVsHuman = isDuel || isCustom;
  const picksPerSide = isCustom ? CUSTOM_ROSTER_SIZE : isDuel ? 8 : 10;
  if (state.draft?._cpuTimer) clearTimeout(state.draft._cpuTimer);
  state.draft = {
    mode,
    picksPerSide,
    budgetMode: isCustom, // 15 块买巅峰卡
    // Custom Duel filler dealing: Balanced Roles (default) vs Fully Random (persisted on the hub).
    duelFillerMode: isDuel
      ? readDuelFillerMode(typeof localStorage !== "undefined" ? localStorage : undefined)
      : null,
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
  paintDraftHeader(state.draft);
  updateCustomDraftChrome();
  $("#roster-a-title").textContent = state.draft.teams.A.name;
  $("#roster-b-title").textContent = state.draft.teams.B.name;
  $("#btn-start-game").disabled = true;
  refreshDraftUI();
  await playersReady(); // perf-r3: dealPack() below draws from PLAYERS synchronously
  dealPack();
}

/** Title + money line: shared by a fresh draft and a resumed one (B94). */
function paintDraftHeader(d) {
  $("#draft-title").textContent = draftTitle(d.mode);
  const moneyLabel = $("#draft-money-label");
  if (moneyLabel) moneyLabel.innerHTML = draftMoneyLabelHtml(d);
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
    // B39: JS-set text must go through L() — the static phrase table only
    // runs at boot / on a language switch, so a raw assignment stays Chinese.
    if (title) title.textContent = L("本轮卡包（点选一名）", "This round's pack (tap one)");
    if (hint) {
      // set from JS, so it needs L(): the static phrase table only runs at boot / on a language switch
      hint.textContent =
        d?.mode === "duel"
          ? L(
              "点选球员会扣除其身价金币；钱不够不能买。刷新可花金币或用免费次数。",
              "Picking a player charges its price in gold; you can't buy what you can't afford. Refresh with gold or with the free refreshes.",
            )
          : L(
              "选人不花钱；可抽到球员、主教练或助教。新人/边缘教练放权更高，常激发潜力。刷新列表前几次免费，之后会消耗金币。",
              "Picking is free; packs can hold players, head coaches or assistants. Rookie/fringe coaches delegate more and often unlock potential. The first few refreshes are free, after that they cost gold.",
            );
    }
    return;
  }
  const spend = d.customPhase === "spend";
  packArea?.classList.toggle("custom-spend", spend);
  packArea?.classList.toggle("custom-filler", !spend);
  if (title) {
    title.textContent = spend
      ? L(
          "有价巅峰卡（5→1 块全表 · 轮流点选直到花光 15 块）",
          "Priced legend cards (5→1, full list · take turns picking until all 15 are spent)",
        )
      : L(
          "0 块角色包（随机若干 · 点选补满大名单）",
          "0-cost role pack (a random few · pick to fill the roster)",
        );
  }
  if (hint) {
    hint.textContent = spend
      ? L(
          "先组先发核：列出全部标价 5～1 的巅峰卡。买不起的会灰掉；轮到你时点一人，双方交替，直到预算花光或买不起为止。",
          "Build your starting core first: every legend card priced 5–1 is listed. Cards you can't afford are greyed out; pick one on your turn, alternating sides, until the budget is spent or nothing is affordable.",
        )
      : L(
          "预算阶段结束。现在只出 0 块球员；可刷新换一批，轮流点选直到两边名单满员。",
          "The budget phase is over. Only 0-cost players appear now; refresh for a new batch, and take turns picking until both rosters are full.",
        );
  }
  if (filters) {
    if (!spend) {
      filters.hidden = true;
      filters.innerHTML = "";
    } else {
      filters.hidden = false;
      const cur = d.customPriceFilter || "all";
      const tabs = [
        ["all", L("全部", "All")],
        ["5", "5"],
        ["4", "4"],
        ["3", "3"],
        ["2", "2"],
        ["1", "1"],
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
    // Custom Duel only: Balanced Roles deals one card per role family, Fully Random keeps the old deal.
    roleDiverse: d.mode === "duel" && d.duelFillerMode === "balanced",
  });
  renderPack();
  updateRefreshBtn();
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
  // B: 推荐标记——金挑战里，挑一张最能补当前阵容缺的角色（只在预算模式）。
  let rec = null;
  if (d.budgetMode) {
    const gold = d.teams[d.turn].gold ?? 0;
    const affordable = cards.filter((c) => c.kind === "player" && (!d.buyPlayers || pickCost(d, c.data) <= gold));
    rec = recommendRolePick(affordable, d.teams[d.turn].players, getLang());
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
        .map((t) => `<span class="chip growth">${esc(t.name)} ${t.value}</span>`)
        .join("");
      // A price only where picking really costs something (Budget Draft: blocks, Duel: gold). Draft Team picks
      // are free, and a "¤123" on a free pick made players think they were spending money.
      const priceTxt = d.budgetMode
        ? `${cost} 块${p.peakLabel ? " · 巅峰" : ""}`
        : d.buyPlayers
          ? `¤${playerPrice(p)}`
          : "";
      const compact = d.budgetMode && d.customPhase === "spend";
      const valueTag = valueBadgeHtml(valueBadge(p)); // nothing while this card can still be picked
      const legacy = legacyBadgeHtml(p, overall(p));
      const role = poolRoleLine(p, getLang());
      if (legacy.cardClass) el.className += legacy.cardClass;
      if (legacy.cardStyle) el.style.cssText += legacy.cardStyle;
      el.innerHTML = `
        <div class="card-head">
          ${photoImg(p, compact ? "headshot" : "headshot lg")}
          <div>
            <div class="name">${esc(p.name)} <span class="pos-badge">${normalizePos(p.pos)}</span>${legacy.tagHtml}${
              valueTag ? ` ${valueTag}` : ""
            }${cantAfford ? ` <span class="chip warn">买不起</span>` : ""}${rec?.playerId === p.id ? ` <span class="chip growth">${L("推荐", "Recommended")}</span>` : ""}</div>
            <div class="meta">${[p.season, esc(p.team), esc(p.pos), `OVR ${overall(p)}`, priceTxt].filter(Boolean).join(" · ")}</div>
            ${
              // Draft Team has no salaries and no money on the pick, so an "est. salary" line is just noise there.
              d.budgetMode || d.buyPlayers
                ? `<div class="meta tiny">${d.budgetMode ? `当前方剩余 ${gold} 块` : marketMeta(p)}</div>`
                : ""
            }
            ${role.label ? `<div class="meta tiny role-line">${role.label}${role.fit ? ` · ${role.fit}` : ""}</div>` : ""}
            ${rec?.playerId === p.id ? `<div class="tiny role-rec">★ ${rec.reason}</div>` : ""}
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
        <div class="name">助教 · ${esc(a.name)}</div>
        <div class="meta">${a.season} · ${a.role || "助教"} · 名气 ${a.fame ?? "-"}</div>
        <div class="stat-chips">
          <span class="chip">攻 +${a.buffs?.offense || 0}</span>
          <span class="chip">防 +${a.buffs?.defense || 0}</span>
          <span class="chip">自主 +${a.playerAutonomy || 0}</span>
          <span class="chip growth">激发 ${a.sparkPotential || 0}</span>
        </div>
        <p class="tiny" style="margin:8px 0 0">${esc(a.note || "")}</p>`;
    } else {
      const c = card.data;
      const auto = c.playerAutonomy ?? "-";
      const obscure = isObscureStaff(c);
      el.innerHTML = `
        <div class="name">教练 · ${esc(c.name)}</div>
        <div class="meta">${c.season} · ${esc(c.team)} · ${esc(c.style)}${obscure ? " · 放权型" : ""}</div>
        <div class="stat-chips">
          <span class="chip">攻 +${c.buffs?.offense || 0}</span>
          <span class="chip">防 +${c.buffs?.defense || 0}</span>
          <span class="chip">士气 +${c.buffs?.morale || 0}</span>
          <span class="chip growth">自主 ${auto}</span>
        </div>
        <p class="tiny" style="margin:8px 0 0">${esc(c.note || "")}</p>`;
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
      alert(L("补员阶段只能选免费球员（0 块）。", "Filler picks have to be free (¤0)."));
      return;
    }
    if ((team.gold ?? 0) < cost) {
      alert(d.budgetMode
        ? L(`预算不足（需要 ${cost} 块，剩余 ${team.gold}）`, `Not enough budget (need ${cost}, ${team.gold} left).`)
        : L(`金币不足（身价 ¤${cost}）`, `Not enough gold (price ¤${cost}).`));
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
    advanceTurn(d);
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
      advanceTurn(d);
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
    advanceTurn(d);
    refreshDraftUI();
    dealPack();
  }
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
              ? `${esc(p.name)} <span class="tiny">(${p.season} ${natural}${p.franchiseId || p.team || ""})</span>`
              : `${esc(p.name)} <span class="tiny">(${p.season}${p.pos && p.pos !== s.id ? ` · 原${p.pos}` : ""})</span>`;
            // (d) 签下后角色不丢：阵容行保留同一套角色标签（角色球员/原型）。
            const role = poolRoleLine(p, getLang());
            const roleTag = role.label ? ` <span class="tiny role-tag">${role.label}</span>` : "";
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
              <span class="roster-line-main">${label}${roleTag}${boost}</span>
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
        .map((p) => `${esc(p.name)}↑ ${escAttr(p._posBoostNote)}`)
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
  const lang = getLang();
  $(`#coach-${key}`).textContent = team.coach
    ? lang === "en"
      ? `Coach: ${coachName(team.coach, "en")} (${team.coach.season}) · ${coachStyle(team.coach, "en")}${autoHint}`
      : `教练：${team.coach.name}（${team.coach.season}）· ${team.coach.style}${autoHint}`
    : lang === "en"
      ? `No coach${budgetBit}`
      : `未选教练${budgetBit}`;
  if (!team.coach && budgetBit) {
    $(`#coach-${key}`).textContent = lang === "en" ? `Budget${budgetBit}` : `预算${budgetBit}`;
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
/** Same person across seasons — Mourning 1994 and 1995 share one key. */
function legendPlayerKey(p) {
  return String(p.bref || p.nameEn || p.name || p.id)
    .toLowerCase()
    .trim();
}

async function startLegendMode() {
  beginFlow(); // a fresh run: its saves belong to it, an older unfinished one is left alone
  await playersReady(); // perf-r3: rollLegendTeam() below reads PLAYERS synchronously
  const eight = shuffle(FRANCHISES).slice(0, 8);
  state.legend = {
    franchises: eight,
    /** Shuffle once; consume without replacement until empty, then reshuffle. */
    franchiseQueue: shuffle(eight),
    lastFranchiseId: null,
    roster: [],
    usedIds: new Set(),
    usedPlayerKeys: new Set(),
    current: null,
    pickId: null,
    pickPos: "SF",
    targetSize: 10,
  };
  $("#legend-franchises").innerHTML = legendChipsHtml(eight, getLang());
  $("#legend-pos").innerHTML = legendPosHtml("SF");
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
    let next = shuffle(L.franchises);
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
  $("#legend-round-team").textContent = getLang() === "en" ? `${franchiseName(f, "en")} (${f.id})` : `${f.name}（${f.id}）`;
  markLegendFranchiseChips(L);

  const top = list.slice(0, 16);
  const rest = shuffle(list.slice(16)).slice(0, 10);
  list = shuffle([...top, ...rest]).slice(0, 18);

  const box = $("#legend-pool");
  if (!list.length) {
    box.innerHTML = `<p class="tiny">可用历史球员已抽空，请点「换下一队」。</p>`;
  } else {
    box.innerHTML = list
      .map((p) => {
        const tips = topIntangibles(p, 2)
          .map((t) => `${esc(t.name)}${t.value}`)
          .join(" · ");
        return `<button class="setup-player" data-id="${p.id}">
          ${photoImg(p)}
          <div>
            <strong>${esc(p.name)}</strong>
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
  const away = autoFillTeam("挑战者", 10, { excludeIds: home.players.map((p) => p.id) }); // nobody plays against himself
  openSetup(home, away, "home");
};

const MARKET_REFRESH_COST = 50;
const COACH_REFRESH_COST = 30;
const SKILL_REFRESH_COST = 25;
// 金币晋级赛合并列表固定 10 行：1 教练 + 1 技能包 + 8 球员（教练/技能包固定在第 1、2 行，
// 球员在后按排序下拉框排好），不再随机穿插。
const CAREER_SHOP_SIZE = 8;
const SKILL_SHOP_SIZE = 1;

/** 刷新教练货架 + 技能包货架（可只刷其一） */
function rollCareerStaffShops(c, { coaches = true, skills = true } = {}) {
  if (!c || c.kind !== "career") return;
  if (coaches) rollCareerCoachShop(c);
  if (skills) {
    const prev = (c.skillShop || []).map((x) => x.id);
    // 连续刷新避开上一柜，并记住近期出现过的，减少「来回就那几样」
    const recent = [...new Set([...(c.skillShopRecent || []), ...prev])].slice(-18);
    // 绑定刷新：阵容里已有 2 人以上拥有的技能降权，少推重复货
    const ownedCounts = {};
    for (const pl of c.team?.players || []) {
      for (const s of pl.skills || []) ownedCounts[s] = (ownedCounts[s] || 0) + 1;
    }
    const avoid = new Set(Object.keys(ownedCounts).filter((id) => ownedCounts[id] >= 2));
    c.skillShop = rollSkillShopOffers(SKILL_SHOP_SIZE, recent, avoid, getLang());
    c.skillShopRecent = [...new Set([...recent, ...c.skillShop.map((x) => x.id)])].slice(-24);
  }
}
function hireCareerCoach(coachId) {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  const offer = (c.coachShop || []).find((x) => x.id === coachId);
  if (!offer) {
    alert(L("该教练已不在市场上", "That coach is no longer on the market."));
    return;
  }
  const cost = offer.hireCost ?? careerCoachPrice(offer);
  if ((c.gold || 0) < cost) {
    alert(L(`聘请「${offer.name}」需要 ¤${cost}，当前 ¤${c.gold || 0}`, `Hiring ${offer.nameEn || offer.name} costs ¤${cost}. You have ¤${c.gold || 0}.`));
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
    ? L(`已聘请「${offer.name}」（花 ¤${cost}，旧帅折现 ¤${refund}）`, `Hired ${offer.nameEn || offer.name} (¤${cost}, previous coach sold back for ¤${refund}).`)
    : L(`已聘请「${offer.name}」（¤${cost}）`, `Hired ${offer.nameEn || offer.name} (¤${cost}).`);
  openMarket({ career: true });
  alert(tip);
}

function renderCareerCoachPanel(c) {
  const panel = $("#career-coach-panel");
  const shopBox = $("#career-coach-shop");
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
      ? `当前：<strong>${esc(coachName(coach, getLang()))}</strong> · ${esc(coachRecordLabel(coach, getLang()))} · ${getLang() === "en" ? "Specialty" : "擅长"} ${esc(
          coachSpecialtyLabel(coach, getLang())
        )} · ${getLang() === "en" ? "Tactics" : "战术"} ${tactics
          .slice(0, 3)
          .map((t) => esc(tacticName(t, getLang())))
          .join(" / ")}${isLegendCoach(coach) ? ` <span class="rarity-tag myth">${getLang() === "en" ? "Legend" : "名帅"}</span>` : ""} · ${getLang() === "en" ? "valued at" : "身价约"} ¤${careerCoachPrice(
          coach
        )}`
      : `<em class="inj">尚未聘请主教练——可从下方市场选，或不请直接出战（系统随机 roll 主教练+助教）</em>`;
  }
  const gold = c.gold || 0;
  // 教练卡现在主要在金币晋级赛的合并列表里显示(paintCareerMarketList)，这里的 shopBox 被 CSS 隐藏了，
  // 但仍然正常写入内容——两处共用同一个模板(coachMarketCardHtml)，不会漂。
  shopBox.innerHTML = (c.coachShop || [])
    .map((offer) => coachMarketCardHtml(offer, gold, coach))
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
    hint.textContent = `货架 ${SKILL_SHOP_SIZE} 格，刷新会避开近期出现过的包；铁肺/永动机/铁人会提高曝光。满员可卸或替换。已购卸下退回库；卖掉按约 ${Math.round(SKILL_SELL_RATE * 100)}% 变现。组合技不可买/卸。刷新 ¤${SKILL_REFRESH_COST}。`;
  }
  skillBox.innerHTML = (c.skillShop || [])
    .map((offer) => skillOfferCardHtml(offer, gold))
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
            const full = skillSlotsFull(p);
            const eligible = meetsHardGates(p, owned.id);
            const disabled = have || !eligible || !roster.length;
            const tag = have ? " · 已有" : !eligible ? " · 不适用" : full ? " · 已满可替换" : "";
            const seasonBit = p.season ? ` ${p.season}` : "";
            return `<option value="${p.id}" ${disabled ? "disabled" : ""}>${esc(p.name)}${seasonBit}${tag}</option>`;
          })
          .join("");
        const anyTarget = roster.some((p) => !(p.skills || []).includes(owned.id) && meetsHardGates(p, owned.id));
        const dropOpts = roster
          .flatMap((p) =>
            removableSkills(p).map((sid) => {
              const sn = SKILL_PACKS[sid]?.name || sid;
              return `<option value="${p.id}::${sid}">卸 ${esc(p.name)} · ${esc(sn)}</option>`;
            })
          )
          .join("");
        return `<div class="career-skill-card rarity-${escAttr(owned.rarity || "common")}">
        <strong>${esc(skillNameL(pack.name || owned.name, getLang()))}</strong>
        <div class="tiny">${esc(skillDesc(pack, getLang()) || owned.desc || "")}</div>
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
          return `<span class="skill-chip removable ${s.tone}${bought ? " bought" : ""}" data-forget-player="${p.id}" data-forget-skill="${id}" title="点击卸下「${escAttr(s.name)}」${bought ? "（退回技能库）" : ""}">${esc(s.name)}</span>`;
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
    if ($("#free-agent-list")) paintCareerMarketList(c);
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
  const res = buySkillOffer(c, skillId);
  if (!res.ok) {
    if (res.reason === "not-on-shelf") alert(L("该技能包已不在货架上", "That skill pack is no longer on the shelf."));
    else if (res.reason === "not-purchasable") alert(L("组合技 / 专属技不可购买学习", "Combo and signature skills can't be bought."));
    else if (res.reason === "short") alert(L(`「${res.offer.name}」需要 ¤${res.cost}，当前 ¤${res.gold}`, `${skillNameL(res.offer.name, "en")} costs ¤${res.cost}. You have ¤${res.gold}.`));
    return;
  }
  afterSkillChange(L(`已将「${res.offer.name}」放入技能库（¤${res.cost}）——可随时安装`, `${skillNameL(res.offer.name, "en")} is in the skill library (¤${res.cost}). Install it whenever you like.`));
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
async function forgetPlayerSkill(playerId, skillId) {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  const targets = skillInstallTargets(playerId);
  const player = targets[0];
  if (!player) {
    alert(L("找不到该球员", "That player can't be found."));
    return;
  }
  const pack = SKILL_PACKS[skillId];
  if (!pack) return;
  if (pack.duo) {
    alert(L("组合技不可手动卸下", "Combo skills can't be removed by hand."));
    return;
  }
  if (!(player.purchasedSkills || []).includes(skillId)) {
    alert(L(`「${pack.name}」是 ${player.name} 自带的技能（非购买获得），不能卸下`, `${skillNameL(pack.name, "en")} came with ${player.nameEn || player.name} and wasn't bought, so it can't be removed.`));
    return;
  }
  if (!(await confirmAction(L(`卸下 ${player.name} 的「${pack.name}」？（已购技能退回技能库）`, `Remove ${skillNameL(pack.name, "en")} from ${player.nameEn || player.name}? Bought skills go back to the library.`)))) {
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
      ? L(`已卸下「${pack.name}」，退回技能库`, `Removed ${skillNameL(pack.name, "en")}. It's back in the library.`)
      : L(`已卸下 ${player.name} 的「${pack.name}」`, `Removed ${skillNameL(pack.name, "en")} from ${player.nameEn || player.name}.`),
  );
}

/** 从技能库安装到指定球员（市场 / 选首发 / 暂停皆可）；满员时可指定 dropSkillId 替换 */
function installInventorySkill(invIndex, playerId, dropSkillId = null) {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  const inv = ensureSkillInventory(c);
  const owned = inv[invIndex];
  if (!owned) {
    alert(L("技能库里找不到这项", "That skill isn't in the library."));
    return;
  }
  const targets = skillInstallTargets(playerId);
  const player = targets[0];
  if (!player) {
    alert(L("请选择要安装的球员", "Choose a player to install it on."));
    return;
  }
  if ((player.skills || []).includes(owned.id)) {
    alert(L(`${player.name} 已有「${owned.name}」`, `${player.nameEn || player.name} already has ${skillNameL(owned.name, "en")}.`));
    return;
  }
  if (!meetsHardGates(player, owned.id)) {
    alert(L(`「${owned.name}」不适用于 ${player.name}（球队 / 名单 / 身高限制）`, `${skillNameL(owned.name, "en")} doesn't fit ${player.nameEn || player.name} (team, roster, or height limit).`));
    return;
  }
  let dropId = dropSkillId;
  if (skillSlotsFull(player)) {
    if (!dropId) {
      const list = removableSkills(player)
        .map((id, i) => `${i + 1}. ${SKILL_PACKS[id]?.name || id}`)
        .join("\n");
      const pick = prompt(
        `${player.name} 技能位已满。输入要卸下的序号（1-${removableSkills(player).length}）：\n${list}`
      );
      const n = Number(pick);
      if (!Number.isFinite(n) || n < 1 || n > removableSkills(player).length) {
        alert(L("已取消。也可在下方「已装技能」点芯片卸下后再装。", "Cancelled. You can also tap a chip under Equipped skills to remove one, then install."));
        return;
      }
      dropId = removableSkills(player)[n - 1];
    }
    if (dropId === owned.id) {
      alert(L("不能卸下与要安装的同一技能", "You can't remove the same skill you're installing."));
      return;
    }
    let returned = null;
    for (const t of targets) {
      const res = removeSkillFromPlayer(t, dropId);
      if (!res.ok && t === player) {
        alert(res.reason || L("卸下失败", "Couldn't remove it."));
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
    alert(L("安装失败（组合技等专属技能不可学习）", "Install failed. Combo and signature skills can't be learned."));
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
      ? L(`已卸下「${dropName}」，并将「${owned.name}」装到 ${player.name}`, `Removed ${skillNameL(dropName, "en")} and installed ${skillNameL(owned.name, "en")} on ${player.nameEn || player.name}.`)
      : L(`已将「${owned.name}」装到 ${player.name}（卖掉时可按约 ${Math.round(SKILL_SELL_RATE * 100)}% 变现）`, `Installed ${skillNameL(owned.name, "en")} on ${player.nameEn || player.name}. Selling the player returns about ${Math.round(SKILL_SELL_RATE * 100)}%.`),
  );
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
    runId: makeRunId(), // B50: the archive dedup key; a new bracket (incl. the next tier) is a new run
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
    alive: shuffle(field),
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

  const franchises = shuffle([...FRANCHISES]);
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

/** B50: a finished gold-challenge run leaves a read-only record before its save slot is cleared. */
function archiveFinishedChallenge(c, outcome) {
  if (c && !c.runId) c.runId = makeRunId(); // runs started before runId existed get one at archive time
  const entry = challengeArchiveEntry(c, outcome);
  if (entry) recordChallengeArchive(activeAccount()?.id ?? null, entry);
}

/**
 * B50 leftovers: a finished Duel game leaves a read-only record in the same store (My World > My Games >
 * History). A duel has no terminal state -- market -> game -> rematch loops until the player walks away -- so
 * each finished game is the archivable unit. The save slot is still cleared right after the result screen
 * (onEnd / onFinished), exactly as before; this only runs before that, in showResult. Never throws: a storage
 * failure must not block the result screen. `c.gameId` is left in place so a second showResult for the same
 * game dedups on the runId instead of writing twice; the next game mints a fresh one at market-done.
 */
function archiveFinishedDuel(c, snap) {
  try {
    const entry = duelArchiveEntry(c, snap);
    if (entry) recordChallengeArchive(activeAccount()?.id ?? null, entry);
  } catch (err) {
    console.error("[duel] archive record failed (the game result is unaffected)", err);
  }
}

function careerRoundLabel(roundOrStage, finals = false) {
  const c = state.career;
  const lang = getLang();
  if (c?.stageSize) return careerStageLabel(c.stageSize, { finals: finals || c.stageSize === 2, lang });
  if (finals) return lang === "en" ? "Finals · 2→1" : CAREER_ROUND_LABELS[5];
  return lang === "en" ? `Round ${roundOrStage}` : CAREER_ROUND_LABELS[roundOrStage] || `第 ${roundOrStage} 轮`;
}

function renderResultAllTeam(team, title = "总决赛最佳阵容", mvp = null) {
  const box = $("#result-all-team");
  if (!box) return;
  if (!team?.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  const mvpLine = mvp
    ? `<p class="tiny">${L(
        `总决赛 MVP：${esc(mvp.name)}${mvp.teamName ? `（${esc(mvp.teamName)}）` : ""} · ${mvp.ppg}分 ${mvp.rpg}板 ${mvp.apg}助 · ${mvp.gp}场`,
        `Finals MVP: ${esc(mvp.name)}${mvp.teamName ? ` (${esc(mvp.teamName)})` : ""} · ${mvp.ppg} PTS ${mvp.rpg} REB ${mvp.apg} AST · ${mvp.gp} G`,
      )}</p>`
    : "";
  box.innerHTML = `
    <h3>${title}</h3>
    ${mvpLine}
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
            <strong>${esc(p.name)}</strong>
            <em class="tiny">${esc(p.teamName || "")}</em>
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
        runCpuMatchInto(c, pod.openerA);
        if (pod.openerA?.done) {
          finalizePod(pod);
          progressed = true;
        }
        continue;
      }
      runCpuMatchInto(c, pod.openerA);
      runCpuMatchInto(c, pod.openerB);
      const mid = progressPodAfterOpeners(pod);
      for (const m of mid) {
        if (!m.startersA) m.startersA = teamStarters(m.a);
        if (!m.startersB) m.startersB = teamStarters(m.b);
      }
      runCpuMatchInto(c, pod.winnersMatch);
      runCpuMatchInto(c, pod.revivalMatch);
      const dec = progressPodAfterMid(pod);
      for (const m of dec) {
        if (!m.startersA) m.startersA = teamStarters(m.a);
        if (!m.startersB) m.startersB = teamStarters(m.b);
      }
      runCpuMatchInto(c, pod.deciderMatch);
      if (pod.deciderMatch?.done) {
        finalizePod(pod);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  c.roundMatches = listPodMatches(c.pods);
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

function formatStarterLine(players) {
  if (!players?.length) return "—";
  return players
    .map((p) => `${p.pos || p.playPos || "?"} ${esc(p.name)}${p.season ? `('${String(p.season).slice(2)})` : ""}`)
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

  // The column shows only our next game (opponent + players); every other
  // game folds away so the next opponent is visible without scrolling.
  const next = nextCareerMatch(c);
  const others = [];
  for (const log of c.bracketLog || []) {
    others.push(`<div class="scout-match"><strong>${log.label}</strong>（已结束）</div>`);
    for (const m of log.matches || []) {
      if (m !== next) others.push(scoutMatchHtml(m, false));
    }
  }
  for (const pod of c.pods || []) {
    const tag = pod.isFinal ? "决赛组" : `第 ${pod.id + 1} 组`;
    const adv = (pod.advancers || []).map((t) => esc(t.name)).join("、") || "—";
    others.push(
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
      if (m && m !== next) others.push(scoutMatchHtml(m, highlightYours && m.yours));
    }
  }
  const head = `<div class="scout-match"><strong>${label}</strong> · 四人一组：开门赛 → 胜者组 / 复活赛 → 晋级决胜（两败出局）</div>`;
  const nextHtml = next ? scoutMatchHtml(next, true) : "";
  const othersHtml = others.join("");
  if (!nextHtml && !othersHtml) {
    el.innerHTML = `<p class="tiny">暂无对阵</p>`;
    return;
  }
  el.innerHTML =
    head +
    (nextHtml || `<p class="tiny">暂无下一战</p>`) +
    (othersHtml
      ? `<details class="scout-others"><summary>其他球队的比赛</summary>${othersHtml}</details>`
      : "");
}

function scoutMatchHtml(m, isYours) {
  const kind = m.kind ? `〔${kindLabel(m.kind)}〕` : "";
  let outcome = "";
  if (m.done && m.winner) {
    if (m.kind === "winners") outcome = ` · ${esc(m.winner.name)} 直接晋级`;
    else if (m.kind === "revival") outcome = ` · ${esc(m.winner.name)} 复活成功`;
    else if (m.kind === "decider" || m.kind === "final") outcome = ` · ${esc(m.winner.name)} 晋级`;
    else outcome = ` · ${esc(m.winner.name)} 胜`;
  }
  const score =
    m.done && m.score
      ? `<div class="score">${m.score.home} - ${m.score.away}${outcome}</div>`
      : `<div class="score">${isYours ? "待你出战" : m.done ? "已赛" : "待赛"}</div>`;
  return `<div class="scout-match ${isYours ? "yours" : ""}">
    <div>${kind} ${esc(m.a?.name || "?")} vs ${esc(m.b?.name || "?")}${isYours ? " · <em>你的比赛</em>" : ""}</div>
    ${score}
    <div class="scout-lineup"><strong>${esc(m.a?.name || "")}</strong>：${formatStarterLine(m.startersA)}</div>
    <div class="scout-lineup"><strong>${esc(m.b?.name || "")}</strong>：${formatStarterLine(m.startersB)}</div>
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

/** Archive finished stage and seed next (16/8/4/2). */
function advanceCareerToNextStage() {
  const c = state.career;
  if (!allPodsDone(c.pods)) return false;
  const finished = listPodMatches(c.pods).filter((m) => m.done);
  c.bracketLog.push({
    label: careerStageLabel(c.stageSize, { finals: c.stageSize === 2, lang: getLang() }),
    matches: finished.map(slimMatchForLog),
  });
  const survivors = collectAdvancers(c.pods).map((t) =>
    t.bracketId === "you" ? c.team : t
  );
  upgradeCpuAdvancers(c, survivors);
  c.alive = shuffle(survivors.filter((t) => t.bracketId === "you" || t.isCpu));
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
  const match = findYourOpenMatch(c.pods) || yourCareerMatch(c);
  if (!match) {
    return { eliminated: !youWon, advancedStage: false, needAnotherGame: false, champion: false, match: null };
  }
  // 总决赛系列赛（三局两胜，T8）：未分胜负的场次只记系列赛比分，不结算 pod 的
  // 总决赛 match——它保持 open，市场调整后下一场还打同一对；分出胜负时不清
  // series（结算页要显示最终比分），最后一场走下面原有的单场结算分出夺冠/淘汰。
  if (c.stageSize === 2 && yourOpp) {
    if (!c.series || c.series.opp?.bracketId !== yourOpp.bracketId) {
      c.series = startFinalsSeries(yourOpp);
    }
    const gameNo = (c.series.wins || 0) + (c.series.losses || 0) + 1;
    const outcome = recordFinalsGame(c.series, youWon);
    if (!outcome.done) {
      return {
        eliminated: false,
        advancedStage: false,
        needAnotherGame: false,
        champion: false,
        match,
        seriesGame: true,
        series: c.series,
        gameNo,
      };
    }
  }
  const winner = youWon ? c.team : yourOpp;
  applyMatchResult(match, winner);
  if (match.loser) noteCareerLoss(c, match.loser);
  // Progress this pod + sim CPU
  syncCareerMatchesFromPods();

  const yourLosses = c.losses?.you || 0;
  // 其他轮次两败出局；总决赛走到这里的是系列赛分出胜负的最后一场，赢=夺冠、输=出局
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
  // Gold Challenge sells no scout packs: only a report this batch already paid for (an old save) is shown.
  if (!scoutPacksOn(c) && !c.scoutActive) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  if (!offer || offer.bought || !scoutPacksOn(c)) {
    if (c.scoutActive) {
      el.hidden = false;
      const by = c.scoutBuyer ? `（${c.scoutBuyer} 方付费，双方可见）` : "";
      el.innerHTML = `<span class="scout-pack-active">球探已启用${by} · 本批名单已标出妖人 / 板凳匪徒</span>`;
    } else {
      // 本批没有球探包：轻提示，避免误以为每轮都能买
      el.hidden = false;
      el.innerHTML = `<span class="scout-pack-miss tiny">本批无球探包（随机出现，约三成换货会刷出）</span>`;
    }
    return;
  }
  const isDuel = c.kind === "duel";
  const buttons = isDuel
    ? ["A", "B"].map((side) => `<button class="btn small" data-scout-buyer="${side}" ${(c[side === "A" ? "goldA" : "goldB"] || 0) >= offer.cost ? "" : "disabled"}>${side} 买入 ¤${offer.cost}</button>`).join("")
    : `<button class="btn small" id="btn-buy-scout-pack" ${(c.gold || 0) >= offer.cost ? "" : "disabled"}>买入 ¤${offer.cost}</button>`;
  el.hidden = false;
  el.innerHTML = `<div class="scout-pack-card">
    <div>
      <strong>球探包</strong>
      <div class="tiny">花 ¤${offer.cost} 买球探报告：标出本批里的性价比妖人与板凳匪徒${isDuel ? "。谁点谁付费，双方都能看到报告" : "（换货随机刷出）"}</div>
    </div>
    <div class="btn-row">${buttons}</div>
  </div>`;
  el.querySelector("#btn-buy-scout-pack")?.addEventListener("click", () => buyScoutPack());
  el.querySelectorAll("[data-scout-buyer]").forEach((b) => b.addEventListener("click", () => buyScoutPack(b.dataset.scoutBuyer)));
}

function buyScoutPack(side = null) {
  const c = state.career;
  const res = chargeScoutPack(c, side);
  if (!res.ok) {
    if (res.reason === "funds") alert(c.kind === "career" ? L(`球探包需要 ¤${res.cost}`, `A scouting pack costs ¤${res.cost}.`) : L(`${side} 方的挑战赛预算不够 ¤${res.cost}`, `Side ${side} doesn't have ¤${res.cost} left in the challenge budget.`));
    return;
  }
  openMarket({ career: c.kind === "career", duel: c.kind === "duel" });
}

async function openMarket({ career = false, duel = false, afterWin = false, refillShop = false } = {}) {
  show("market");
  await playersReady(); // perf-r3: buildAffordableShop below needs the full card pool
  assertPlayersReady("openMarket");
  const c = state.career;
  const isDuel = duel || c?.kind === "duel";
  $("#bid-panel").hidden = !isDuel;
  // 双人市场左栏放 A/B 双方阵容：窄屏下左栏恢复桌面占比（css 480px 断点 .market-grid.duel-market）。
  const marketGrid = $("#screen-market .market-grid");
  if (marketGrid) marketGrid.classList.toggle("duel-market", isDuel);
  const mScoutPre = $("#market-scout");
  if (mScoutPre && isDuel) mScoutPre.hidden = true;
  // 组合技按整队名单显隐（詹韦须两人同队）
  if (c?.kind === "career" && c.team?.players) syncTeamDuoSkills(c.team.players);
  ensureSkillInventory(c);

  if (refillShop || !c.shop || !c.shop.length) {
    c.shop = buildAffordableShop(c, isDuel ? 12 : CAREER_SHOP_SIZE);
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
    const lang = getLang();
    const roundBit = c.roundMatches?.length
      ? lang === "en"
        ? `Now: ${careerRoundLabel(c.round, c.finals)} (groups of four · repechage · double elimination; you have ${losses}/2 losses). See other matchups and rosters below.`
        : `当前 ${careerRoundLabel(c.round, c.finals)}（四人一组 · 复活赛 · 两败出局；你已负 ${losses}/2）。下方可查看其他对决与阵容。`
      : "";
    const tier = challengeTierMeta(c.challengeTier || "gold");
    const fieldBit =
      c.challengeTier === "playoff15"
        ? lang === "en" ? "Historical Playoff Challenge: you + 15 classic playoff teams (from the Round of 16)" : "历史季后赛挑战：你 + 15 支经典季后赛强队（16 强起）"
        : c.challengeTier === "champ7"
          ? lang === "en" ? "Historical Champions Challenge: you + 7 real championship cores (from the Quarterfinals)" : "历史总冠军挑战：你 + 7 支史实冠军班底（8 强起）"
          : c.fieldSource === "historical"
            ? c.fromCustom
              ? lang === "en" ? "Custom 15-gold draft done · challenging 32 historical teams" : "自定义 15 块轮抽完成 · 挑战 32 支历史球队"
              : lang === "en" ? "Historical team challenge" : "历史球队挑战赛"
            : lang === "en" ? "Gold League: 32 random mixed teams (win it to challenge historical playoff teams / champions)" : "金币联赛：32 支随机联队（夺冠后可挑战历史季后赛 / 总冠军）";
    const tierName = challengeTierName(c.challengeTier || "gold", lang);
    $("#market-hint").textContent = afterWin
      ? lang === "en"
        ? `Game bonus banked · ${tierName}. Buy players / coaches / skill packs; refresh ¤${careerRefreshCost(c, MARKET_REFRESH_COST)}. ${roundBit}`
        : `赛果奖金已入账 · ${tier.name}。可买球员/教练/技能包；刷新 ¤${careerRefreshCost(c, MARKET_REFRESH_COST)}。${roundBit}`
      : lang === "en"
        ? `${fieldBit}. Now ¤${c.gold || 600}. ${roundBit}`
        : `${fieldBit}。当前 ¤${c.gold || 600}。${roundBit}`;
    $("#market-right-title").textContent = lang === "en" ? "Free Market (buy in bulk)" : "自由市场（可连买）";
    $("#market-left-title").textContent = lang === "en" ? "My Team (evaluate sells)" : "我的球队（评估是否卖出）";
    $("#gold-amt").textContent = String(c.gold);
    $("#shop-budget-hint").textContent = lang === "en" ? `Affordable up to about ¤${c.gold} · ${c.shop.length} listed` : `当前可负担约 ¤${c.gold} 以内 · 列表 ${c.shop.length} 人`;
    renderCareerCoachPanel(c);
    const mScout = $("#market-scout");
    if (mScout) {
      mScout.hidden = !(c.roundMatches?.length || c.bracketLog?.length);
      if (!mScout.hidden) renderScoutBoard(mScout);
    }
    paintScoutPackOffer(c);
    ensurePlayerDefaults(c.team?.players || []);
    renderMarketRoster([c.team], true);
    paintCareerMarketList(c);
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

/** 单张球员市场卡的 HTML——抽成独立函数，这样永久市场(paintFreeAgentList)和
 * 金币晋级赛的合并列表(paintCareerMarketList)用的是同一份模板，不会漂。 */
function paintFreeAgentList(c, duel = false) {
  const box = $("#free-agent-list");
  if (!box) return;
  const budget =
    c.kind === "duel" ? Math.max(c.goldA || 0, c.goldB || 0) : Number(c.gold) || 0;
  const sortEl = $("#market-sort");
  if (sortEl && state.marketSort) sortEl.value = state.marketSort;
  if (!c.shop?.length) {
    box.innerHTML = `<p class="tiny">${careerRefreshCost(c, MARKET_REFRESH_COST) === 0 ? "市场空了。阵容不满 8 人，本次刷新免费，点「刷新自由市场」换一批。" : `市场空了。点「刷新自由市场」花 ¤${MARKET_REFRESH_COST} 换一批。`}</p>`;
    return;
  }
  const scoutOn = !!c.scoutActive;
  // 数据分析师报告：不是「位置缺人/战术标签命中」这种粗糙标签，而是真正把他换进现有
  // 主力、比较换前换后的化学反应+阵容适配，只有真正会变强才标注。金币挑战免费显示；
  // 双人对决仍要买过侦察包（analystFitVisible）。
  const fitOn = analystFitVisible(c);
  const homeTactic = coachTactics(c.team?.coach)[0] || null;
  box.innerHTML = sortedMarketShop(c.shop)
    .map((p) => playerMarketCardHtml(p, c, { duel, scoutOn, fitOn, homeTactic, budget }))
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

/** 金币晋级赛专用：球员+教练+技能包合并成一个右侧列表，不再把教练/技能包
 * 放在顶部单独的面板里——用户反馈每次还得拉到顶部看金币，很烦。 */
function paintCareerMarketList(c) {
  const box = $("#free-agent-list");
  if (!box) return;
  const budget = Number(c.gold) || 0;
  const sortEl = $("#market-sort");
  if (sortEl && state.marketSort) sortEl.value = state.marketSort;
  const hasPlayers = !!c.shop?.length;
  const hasCoaches = !!c.coachShop?.length;
  const hasSkills = !!c.skillShop?.length;
  if (!hasPlayers && !hasCoaches && !hasSkills) {
    box.innerHTML = `<p class="tiny">${careerRefreshCost(c, MARKET_REFRESH_COST) === 0 ? "市场空了。阵容不满 8 人，本次刷新免费，点「刷新自由市场」换一批。" : `市场空了。点「刷新自由市场」花 ¤${MARKET_REFRESH_COST} 换一批。`}</p>`;
    return;
  }
  const scoutOn = !!c.scoutActive;
  const homeTactic = coachTactics(c.team?.coach)[0] || null;
  const playerCards = sortedMarketShop(c.shop || []).map((p) =>
    playerMarketCardHtml(p, c, { duel: false, scoutOn, fitOn: analystFitVisible(c), homeTactic, budget })
  );
  const coachCards = (c.coachShop || []).map((offer) => coachMarketCardHtml(offer, budget, c.team?.coach));
  const skillCards = (c.skillShop || []).map((offer) => skillOfferCardHtml(offer, budget));
  box.innerHTML = [...coachCards, ...skillCards, ...playerCards].join("");
  box.querySelectorAll("[data-buy]").forEach((btn) => {
    if (btn.disabled) return;
    btn.onclick = () => buyPlayer(btn.dataset.buy);
  });
  box.querySelectorAll("[data-hire-career-coach]").forEach((btn) => {
    if (btn.disabled) return;
    btn.onclick = () => hireCareerCoach(btn.dataset.hireCareerCoach);
  });
  box.querySelectorAll("[data-buy-skill]").forEach((btn) => {
    if (btn.disabled) return;
    btn.onclick = () => buyCareerSkillPack(btn.dataset.buySkill);
  });
}

$("#market-sort")?.addEventListener("change", () => {
  const c = state.career;
  if (!c?.shop) return;
  state.marketSort = $("#market-sort").value || "ovr";
  if (c.kind === "duel") paintFreeAgentList(c, true);
  else paintCareerMarketList(c);
});

$("#btn-refresh-coaches")?.addEventListener("click", () => {
  const c = state.career;
  if (!c || c.kind !== "career") return;
  if ((c.gold || 0) < COACH_REFRESH_COST) {
    alert(L(`刷新教练市场需要 ¤${COACH_REFRESH_COST}，当前 ¤${c.gold || 0}`, `Refreshing the coach market costs ¤${COACH_REFRESH_COST}. You have ¤${c.gold || 0}.`));
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
    alert(L(`刷新技能包货架需要 ¤${SKILL_REFRESH_COST}，当前 ¤${c.gold || 0}`, `Refreshing the skill shelf costs ¤${SKILL_REFRESH_COST}. You have ¤${c.gold || 0}.`));
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
    const refreshCost = careerRefreshCost(c, MARKET_REFRESH_COST);
    if (c.gold < refreshCost) {
      alert(L(`刷新需要 ¤${refreshCost}，当前不够`, `A refresh costs ¤${refreshCost}, and you don't have it.`));
      return;
    }
    c.gold -= refreshCost;
    c.shop = buildAffordableShop(c, CAREER_SHOP_SIZE);
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
    alert(L(`刷新需要至少一方有 ¤${MARKET_REFRESH_COST}`, `A refresh needs at least one side to have ¤${MARKET_REFRESH_COST}.`));
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
  $("#bid-card").innerHTML = `${photoImg(p, "headshot lg")} <strong>${esc(p.name)}</strong> · 估价 ¤${playerPrice(p)}`;
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
      alert(L("至少保留 8 人", "Keep at least 8 players."));
      return;
    }
    const idx = c.team.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [p] = c.team.players.splice(idx, 1);
    const { total, body, skills } = settle(p);
    c.gold += total;
    const skillNote =
      skills.gold > 0
        ? L(
            `（身价 ¤${body} + 已购技能变现 ¤${skills.gold}：${skills.lines
              .map((l) => `${l.name}¤${l.refund}`)
              .join("、")}）`,
            ` (value ¤${body} + bought skills sold back for ¤${skills.gold}: ${skills.lines
              .map((l) => `${skillNameL(l.name, "en")}¤${l.refund}`)
              .join(", ")})`,
          )
        : "";
    openMarket({ career: true });
    if (skillNote) alert(L(`卖出 ${p.name} 入账 ¤${total}${skillNote}`, `Sold ${p.nameEn || p.name} for ¤${total}${skillNote}`));
  } else {
    const team = side === "B" ? c.teamB : c.teamA;
    if (team.players.length <= 8) {
      alert(L("至少保留 8 人", "Keep at least 8 players."));
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
    alert(L("名单已满 12 人", "The roster is full at 12."));
    return;
  }
  if (c.gold < price) {
    alert(L("金币不足", "Not enough gold."));
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
    alert(L("出价相同，请再加价", "The bids match. Raise one."));
    return;
  }
  const winnerIsA = a > b;
  const bid = winnerIsA ? a : b;
  const team = winnerIsA ? c.teamA : c.teamB;
  const goldKey = winnerIsA ? "goldA" : "goldB";
  if (c[goldKey] < bid) {
    alert(L("胜出方金币不足", "The winning side doesn't have enough gold."));
    return;
  }
  if (team.players.length >= 12) {
    alert(L("胜出方名单已满", "The winning side's roster is full."));
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
      alert(L("至少 8 人才能出战", "You need at least 8 players to play."));
      return;
    }
    {
      const staff = ensureTeamStaff(c.team, { preferStarter: true });
      const bits = [];
      if (staff.rolledCoach && staff.coach) {
        c.hiredCoachIds = [...new Set([...(c.hiredCoachIds || []), staff.coach.id])];
        bits.push(getLang() === "en" ? `Head coach “${coachName(staff.coach, "en")}”` : `主教练「${staff.coach.name}」`);
      }
      if (staff.rolledAsst && staff.assistant) bits.push(getLang() === "en" ? `Assistant “${asstName(staff.assistant, "en")}”` : `助教「${staff.assistant.name}」`);
      if (bits.length) alert(getLang() === "en" ? `Coaching staff vacancy — system randomly assigned ${bits.join(" + ")}` : `教练组空缺——系统随机指派 ${bits.join(" + ")}`);
    }
    c.team.gold = c.gold;
    ensurePlayerDefaults(c.team.players || []);
    if (c.finals && c.series) {
      openSetup(c.team, c.series.opp, "home");
      return;
    }
    const match = yourCareerMatch(c);
    const opp = match ? (match.a.bracketId === "you" ? match.b : match.a) : null;
    if (!opp) {
      alert(L("对阵尚未生成，请重开晋级赛", "The bracket isn't ready. Start the tournament again."));
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
  // B50 leftovers: one game = one archive record; mint its id here so a restored game archives under the
  // same id and a double fire of the result screen dedups (see archiveFinishedDuel).
  c.gameId = makeRunId();
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
  const available = healthy.length ? healthy : you.players;
  // The five the coach started with last time stay the five (and keep the slots he set by hand) while all of them can still play.
  // Only a side with no history gets a first pick, and that is a balanced five, not "the five best ratings" (five centres).
  const { five: fiveNow, fresh } = setupStarters(you.starterIds, available, overall);
  state.setup = { you, selected: new Set(fiveNow.map((p) => p.id)) };
  if (fresh) autoAssignUniquePositions(fiveNow);
  // 未手动改过的位置/倾向按属性推荐填充
  // Season default rotation: restore starters / minutes / orders from the LIVE team's current
  // fields every time, never from the cached live.rotation snapshot. renderSeasonRotation()
  // (默认轮换·实验板) mutates live.players[i].targetMinutes directly as the user drags a slider --
  // it does NOT update live.rotation until the separate "保存默认轮换" button is clicked. If we
  // trusted that stale snapshot here, an unsaved minutes edit would silently get reverted the
  // moment the next game's setup opens, even though cloneSide() already copied the correct,
  // up-to-date value onto `you` a moment earlier. Re-capturing fresh from `live` every time means
  // there is nothing to go stale.
  if (state.season) {
    const live = state.season.teams[state.season.userTeamId];
    if (live) {
      // Same resolver every simulated game uses: this opponent's matchup plan, else the saved default.
      const oppSide = youSide === "home" ? away : home;
      const plan = resolveEffectiveGameplan(live, { opponentId: oppSide?.teamId }).plan || captureRotationPlan(live, live.starterIds);
      applyRotationPlan(you, structuredClone(plan));
      if (plan.starterIds?.length === 5) {
        const screen = screenFiveFromPlan(plan.starterIds, available, overall);
        state.setup.selected = new Set(screen.five.map((p) => p.id));
        if (screen.fresh) autoAssignUniquePositions(screen.five);
      }
    }
  }
  ensurePlayerDefaults(you.players);
  ensureRoles(you.players);
  you.lineupPacks = you.lineupPacks || autoBuildAllPacks(you.players);
  you.gameplan = you.gameplan || { matchup: null };
  renderSetupRoster();
  renderSetupRoles();
  renderSetupGameplan();
  // The role/orders renders above can re-seat starters (playPos); redraw the roster once so it, and the tactics board
  // mounted next, both show the final positions.
  renderSetupRoster();
  mountSetupTacticsBoard();
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
    // Label lives in the <span> so the mobile chevron-only rule applies; L()
    // (not a Chinese literal) so EN shows English immediately, not after a toggle.
    const labelEl = backBtn.querySelector("span") || backBtn;
    labelEl.textContent = isCareer || isDuel ? L("返回市场", "Back to Market") : L("返回", "Back");
    backBtn.title = isCareer || isDuel ? L("回到转会市场继续买人/装技能", "Back to the market to keep buying players / equipping skills") : L("返回首页", "Back home");
  }
  const setupGoals = $("#setup-goals");
  if (setupGoals) {
    const goals = activeSeasonGoals();
    setupGoals.innerHTML = goals.length ? pregameCardHtml({ goals, lang: getLang() }) : "";
    setupGoals.hidden = !goals.length;
  }
  const scout = $("#scout-board");
  if (scout) {
    if (state.career?.kind === "career") renderScoutBoard(scout);
    else {
      const oppTeam = youSide === "home" ? away : home;
      scout.innerHTML = `<div class="scout-match yours">
        <div>本场对手：${esc(oppTeam.name)}</div>
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
  const lang = getLang();
  sel.innerHTML = TEMPO_OPTIONS.map((t) => {
    const lbl = planLabel(t, lang);
    return `<option value="${t.id}" title="${escAttr(lbl.desc)}" ${t.id === cur ? "selected" : ""}>${esc(lbl.name)}</option>`;
  }).join("");
}

function syncTempoHelp(el, tempoId) {
  if (!el) return;
  const t = getTempoDef(tempoId);
  el.textContent = planLabel(t, getLang()).desc;
}

function fillBallActionSelect(sel, preferred = "pnr") {
  if (!sel) return;
  const cur = sel.value || preferred;
  sel.innerHTML = ORDER_ACTION.filter((a) => a.id !== "auto")
    .map(
      (a) =>
        `<option value="${a.id}" title="${escAttr(a.hint)}" ${a.id === cur ? "selected" : ""}>${esc(a.name)}</option>`
    )
    .join("");
  if ([...sel.options].some((o) => o.value === preferred)) sel.value = preferred;
  syncBallActionDesc(sel);
}

/** 在持球打法下拉旁展示当前选项说明（挡拆等）——仅比赛里那支下拉用，赛前那支随进阶设置栏删了。 */
function syncBallActionDesc(sel) {
  if (!sel) return;
  const id = sel.id || "";
  const descEl = id === "offense-ball-action" ? $("#offense-ball-action-desc") : null;
  if (!descEl) return;
  const act = ORDER_ACTION.find((a) => a.id === sel.value);
  if (act?.hint) {
    descEl.textContent = `${act.name}：${act.hint}`;
  } else {
    descEl.textContent = "";
  }
}

// UI 3.0 Gold pre-game tactics board (js/ui/tactics/). The roster list below owns who starts and the board follows it;
// the old advanced controls are gone (user 2026-11-22), so "start the game" reads the board's applied plan
// plus the coach's own settings and the saved rotation plan.
let tacticsBoard = null;
function refreshSetupFromTeam() {
  const you = state.setup?.you;
  if (!you) return;
  state.setup.selected = new Set(you.starterIds);
  renderSetupRoster();
}
function mountSetupTacticsBoard() {
  tacticsBoard?.destroy();
  tacticsBoard = null;
  const root = $("#setup-tactics-board");
  const you = state.setup?.you;
  if (!root) return;
  const gold = state.career?.kind === "career" && !!you && !!state.pendingMatch;
  root.hidden = !gold;
  root.innerHTML = "";
  if (!gold) return;
  const { home, away, youSide } = state.pendingMatch;
  tacticsBoard = mountTacticsBoard(root, {
    team: you,
    opponent: youSide === "home" ? away : home,
    lang: getLang(),
    save: () => autosaveCareer(),
    onApplied: refreshSetupFromTeam,
  });
  tacticsBoard.syncStarters([...state.setup.selected]);
}

/**
 * Rotation totals bar under the roster. The per-player role + minutes
 * controls used to live in a "角色与分钟" list inside the advanced
 * section; they moved onto each player card (setupCardRoleHtml), so this
 * only keeps the shared bits: the minutes total and the two section
 * actions (suggest minutes by stamina / save as the season default
 * rotation). Suggesting minutes rewrites every card, so it refreshes the
 * whole setup screen, not just this bar.
 */
function renderSetupRoles() {
  const bar = $("#setup-rotation-bar");
  const you = state.setup?.you;
  if (!bar || !you) return;
  ensureRoles(you.players);
  ensurePlayerOrders(you.players);
  // One shared list rule with the orders section (setupPlayerList).
  const list = setupPlayerList(you.players, state.setup.selected, { season: !!state.season });
  const totalMin = list.reduce((s, p) => s + (Number(p.targetMinutes) || 0), 0);
  bar.innerHTML =
    `<span class="tiny">目标分钟合计约 <strong>${totalMin}</strong>（五人同时上场约 240）。体能差的人打 35+ 会崩，铁肺可接近 48。</span>` +
    `<span class="btn-row">
      <button type="button" class="btn small" id="btn-setup-suggest-mins">按体能建议分钟</button>
      ${state.season ? `<button type="button" class="btn small primary" id="btn-setup-save-rotation">保存为默认轮换</button>` : ""}
    </span>`;
  $("#btn-setup-suggest-mins")?.addEventListener("click", () => {
    for (const p of you.players) p.targetMinutes = suggestTargetMinutes(p);
    // Minutes live on the cards now, so the roster must re-render too.
    renderSetupRoster();
    renderSetupRoles();
  });
  $("#btn-setup-save-rotation")?.addEventListener("click", () => {
    persistSeasonRotationFromTeam(you, [...(state.setup?.selected || [])]);
    alert(L("已保存为本赛季默认轮换（位置 / 分钟 / 角色 / 指令 / 首发）。下场比赛会自动套用。", "Saved as this season's default rotation (positions, minutes, roles, orders, starters). The next game will use it."));
  });
}

/** When this game is played under an opponent-bound matchup plan, store the setup's final choices on that plan. */
function persistMatchupRotationFromTeam(youTeam, opponentId) {
  const st = state.season;
  const team = st?.teams[st.userTeamId];
  const m = matchupPlanFor(team, opponentId);
  if (!m || !youTeam) return false;
  m.rotation = captureRotationPlan(youTeam, youTeam.starterIds);
  saveSeasonAndCareer(st);
  return true;
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
  const saved = {
    ...(you.gameplan?.matchup?.assignments || you.gameplan?.matchupAssignments || {}),
    // Preserve board tweaks made in the DOM (setup board selects have no
    // onchange write-back; they are only read at game start), so a
    // refresh after a drag-swap does not wipe them. Stale defenders are
    // still dropped by buildSamePosMatchups.
    ...Object.fromEntries(
      [...($("#setup-matchup-board")?.querySelectorAll("select[data-matchup-opp]") || [])].map((sel) => [
        sel.dataset.matchupOpp,
        sel.value || "",
      ]),
    ),
  };
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
      .map((p) => `<option value="${p.id}">${matchupPosOf(p)} ${esc(p.name)}（防${p.defense}）</option>`)
      .join("");
  tgtSel.innerHTML = boardOpp
    .map((p) => `<option value="${p.id}">${matchupPosOf(p)} ${esc(p.name)}（OVR ${overall(p)}）</option>`)
    .join("");
  if (you.gameplan?.matchup?.defenderId) defSel.value = you.gameplan.matchup.defenderId;
  if (you.gameplan?.matchup?.targetId) tgtSel.value = you.gameplan.matchup.targetId;
  if (you.gameplan?.matchup?.scheme) $("#gp-scheme").value = you.gameplan.matchup.scheme;
  syncGpSchemeHint();
}

/** 赛前重点策略用 + 代价一句话（与引擎数值一致，只做说明）。 */
const GP_SCHEME_HINTS = {
  focus: {
    zh: "用：对方一人爆发时，派专人死盯他。代价：盯防人被钉死在那人身上。",
    en: "Use: when one opponent is exploding — glue a defender to him. Cost: that defender is stuck on him.",
  },
  double: {
    zh: "用：对方持球大核时，逼他出球。代价：弱侧射手会空。",
    en: "Use: against a ball-dominant core — force him to give it up. Cost: weak-side shooters get open.",
  },
  bump: {
    zh: "用：只对瘦高内线，顶他下盘。代价：对壮硕内线几乎没用。",
    en: "Use: only against slim, tall post players — push him off his spot. Cost: nearly useless against bruising bigs.",
  },
};

function syncGpSchemeHint() {
  const hint = $("#gp-scheme-hint");
  const sel = $("#gp-scheme");
  if (!hint || !sel) return;
  const h = GP_SCHEME_HINTS[sel.value];
  hint.textContent = h ? (getLang() === "en" ? h.en : h.zh) : "";
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
            `<option value="${p.id}">${matchupPosOf(p)} ${esc(p.name)}（防${p.defense}）</option>`
        )
        .join("");
    if (cur && [...defSel.options].some((o) => o.value === cur)) defSel.value = cur;
  }
}

let coachMode = null; // B22: created with the coach drawer below; null until then (and in tests)

/** In-game / resume: fill tactic dropdown from coach ∪ on-court unlocks. Simple coach mode shows three of them (js/ui/coachMode.js). */
function fillTacticSelect(team, { preferId = null } = {}) {
  const sel = $("#tactic-select");
  if (!sel || !team) return;
  const court = team.onCourt?.length ? team.onCourt : team.players || [];
  const tactics = availableTactics(team.coach || { specialTactics: ["balanced"] }, court);
  const cur = preferId || sel.value || team.tactic?.id || "";
  const optionFor = (t) => {
    const why = tacticUnlockHint(t.id, court, getLang());
    const desc = tacticDesc(t, getLang());
    const title = why ? `${desc}（${why}）` : desc;
    return `<option value="${t.id}" title="${escAttr(title)}">${esc(tacticName(t, getLang()))}${
      why ? " ★" : ""
    }</option>`;
  };
  if (coachMode?.isSimple()) {
    const few = simpleTactics(tactics, cur, coachTactics(team.coach)[0]?.id);
    sel.innerHTML = few.map(optionFor).join("");
    sel.value = few.some((t) => t.id === cur) ? cur : few[0].id;
    syncTacticHelp();
    return;
  }
  const grouped = new Map();
  for (const t of tactics) {
    if (!grouped.has(t.group)) grouped.set(t.group, []);
    grouped.get(t.group).push(t);
  }
  const optParts = [];
  for (const g of TACTIC_GROUPS) {
    const list = grouped.get(g.id) || [];
    if (!list.length) continue;
    optParts.push(`<optgroup label="${escAttr(tacticGroupName(g.id, getLang()))}">${list.map(optionFor).join("")}</optgroup>`);
    grouped.delete(g.id);
  }
  for (const list of grouped.values()) optParts.push(...list.map(optionFor));
  sel.innerHTML = optParts.join("");
  if (cur && tactics.some((t) => t.id === cur)) sel.value = cur;
  else if (tactics[0]) sel.value = tactics[0].id;
  syncTacticHelp();
}


// One escaper for the whole app (js/core/html.js). `escAttr` stays only as a name so its call sites do not churn.
function escAttr(s) {
  return esc(s);
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

/**
 * Auto-fill playPos for a starting five: every position once, each player where his natural position and his inside/outside
 * game fit best (js/engine/lineupSlots.js). Hand-placed players (playPosManual) keep their slot. Whoever has to play out of
 * position is the one best suited to it, never simply the last one picked.
 */
function autoAssignUniquePositions(players) {
  const five = (players || []).slice(0, 5);
  seatPlayers(five).forEach((slot, i) => {
    five[i].playPos = slot;
  });
}

/** First empty PG–C slot, preferring natural position. */
function setupPosSelectHtml(p) {
  const cur = normalizePos(p.playPos || p.pos);
  const nat = normalizePos(p.pos);
  const rec = recommendPlayPos(p);
  return `<select class="setup-pos-select" data-pos-for="${p.id}" title="${L("改打哪个位置（未手动改过则用属性推荐）", "Which spot he plays (suggested from his ratings until you change it)")}">
    ${POS_SLOTS.map(
      (s) =>
        `<option value="${s.id}" ${s.id === cur ? "selected" : ""}>${s.id}${
          s.id === rec ? L("（推荐）", " (suggested)") : s.id === nat ? L("（本职）", " (natural)") : ""
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
    if (pass >= 70) extra.push(L("擅挡拆", "PnR"));
    else if (pass >= 62) extra.push(L("可掩护", "screens"));
    if (def >= 75 && spd >= 72) extra.push(L("可换防", "switches"));
    return [L(`全能→PG–C`, "Positionless→PG–C"), ...extra].slice(0, 2).join(" · ");
  }
  const tips = [];
  if (pass >= 78 || (pass >= 70 && spd >= 70)) tips.push(L("擅组织→PG", "Playmaker→PG"));
  if (three >= 78 && (spd >= 68 || pass >= 60)) tips.push(L("外线→SG/SF", "Wing→SG/SF"));
  if (three >= 80 && reb < 65) tips.push(L("定点射手", "Spot-up shooter"));
  if (reb >= 78 || blk >= 72 || (paint >= 80 && pass < 65 && spd < 70)) tips.push(L("内线→PF/C", "Big→PF/C"));
  if (def >= 82 && spd >= 72) tips.push(L("锁防守", "Lockdown"));
  if (!tips.length) tips.push(`${L("本职", "Natural")} ${nat}`);
  return tips.slice(0, 2).join(" · ");
}

function setupStatGridHtml(p) {
  const row = (label, v) => {
    const n = Number(v) || 0;
    const tone = n >= 80 ? "hi" : n >= 65 ? "mid" : "lo";
    return `<span class="setup-stat ${tone}" title="${label}"><em>${label}</em>${n || "—"}</span>`;
  };
  // R85 derived these 7 sub-attributes into card data and the sim, but no
  // UI ever rendered them. Show them as a second block; old saves without
  // stored values fall back to deriving them on the fly.
  const sa =
    p.handle != null && p.perimDef != null
      ? p
      : deriveSubAttributes(p);
  return `<div class="setup-stat-grid">
    ${row(L("攻", "ATK"), p.scoring)}
    ${row(L("三分", "3PT"), p.three)}
    ${row(L("中投", "MID"), p.mid)}
    ${row(L("内线", "INS"), p.paint)}
    ${row(L("传", "PAS"), p.pass)}
    ${row(L("防", "DEF"), p.defense)}
    ${row(L("板", "REB"), p.rebound)}
    ${row(L("断", "STL"), p.steal)}
    ${row(L("帽", "BLK"), p.block)}
    ${row(L("速", "SPD"), p.speed)}
    ${row(L("力", "STR"), p.strength)}
    ${row(L("球商", "IQ"), p.iq)}
  </div>
  <div class="setup-stat-grid sub-attrs">
    ${row(L("控球", "HDL"), sa.handle)}
    ${row(L("外防", "PD"), sa.perimDef)}
    ${row(L("内防", "ID"), sa.interiorDef)}
    ${row(L("接球投", "CS"), sa.catchShoot)}
    ${row(L("持球投", "OD"), sa.offDribble)}
    ${row(L("前板", "ORB"), sa.offReb)}
    ${row(L("后板", "DRB"), sa.defReb)}
  </div>`;
}

function setupMiniCardHtml(p, { onCourt = false } = {}) {
  const lang = getLang();
  const out = !isPlayerAvailable(p);
  const ovr = overall(p);
  const phy = physiqueLabel(p);
  const nat = normalizePos(p.pos);
  const pos = onCourt ? normalizePos(p.playPos || p.pos) : nat;
  const actionLabel = out
    ? L("伤停", "Injured")
    : onCourt
      ? L("点下场 / 拖走", "Tap to bench")
      : state.setup.selected.size >= 5
        ? L("拖到格子换人", "Drag onto a slot")
        : L("点上场 / 拖上去", "Tap to start");
  // Headline stats read sub-attributes too; old saves without stored values derive them (same rule as the full sheet).
  const src = p.handle != null && p.perimDef != null ? p : { ...deriveSubAttributes(p), ...p };
  const drawer = `${setupStatGridHtml(p)}${setupCardOrdersHtml(p, lang)}${setupCardRoleHtml(p, lang)}`;
  // 用 div 而不是 button：浏览器对 button 的 HTML5 拖拽经常丢 drop
  return `<div class="setup-mini setup-card ${onCourt ? "on-court" : "bench"} ${out ? "injured" : ""}" data-id="${p.id}" data-action="toggle" draggable="${out ? "false" : "true"}" role="button" tabindex="0" ${
    out ? 'aria-disabled="true"' : ""
  }>
    <div class="setup-card-hero">
      ${photoImg(p, "headshot")}
      <span class="setup-card-pos" data-pos="${pos}">${pos}</span>
      <span class="setup-card-ovr"><em>OVR</em>${ovr}</span>
    </div>
    <div class="setup-mini-body">
      <strong>${esc(p.name)}</strong>
      <div class="tiny setup-card-meta">${esc(p.season)} · ${L("本职", "Natural")} ${nat}${phy ? ` · ${phy}` : ""}</div>
      <div class="tiny setup-fit-hint">${setupPosFitHint(p)}</div>
    </div>
    ${setupKeyStatsHtml(src, pos, lang)}
    ${p.skills?.length ? `<div class="skill-row compact">${skillChipsHtml(p, lang)}</div>` : ""}
    ${onCourt ? `<div class="setup-pos-row"><span class="tiny">${L("打", "Plays")}</span>${setupPosSelectHtml(p)}</div>` : ""}
    <span class="setup-action-label">${actionLabel}</span>
    ${setupCardMoreHtml(p, drawer, { open: !!state.setup.openMore?.has(p.id), lang })}
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
  // 5 人却空一格：通常是两人叠位，渲染前自动拆开
  resolveStarterPositionCollisions(you.players.filter((p) => state.setup.selected.has(p.id)));
  const model = setupRosterModel(you.players, state.setup.selected, byOverallDesc);
  const { picked } = model;
  const status = setupRosterStatus({ selectedCount: state.setup.selected.size, ...model }, getLang());
  // A focused minutes input would fire its change (and a nested re-render) from the blur that innerHTML causes; flush it first.
  if (box.contains(document.activeElement)) document.activeElement.blur();
  box.innerHTML = setupBoardHtml(model, setupMiniCardHtml, getLang());

  $("#starter-count").textContent = String(state.setup.selected.size);
  tacticsBoard?.syncStarters([...state.setup.selected]);
  const confirmBtn = $("#btn-setup-confirm");
  if (confirmBtn) {
    confirmBtn.disabled = status.confirmDisabled;
    confirmBtn.textContent = status.confirmLabel;
  }
  const noteEl = $("#setup-ball-note");
  const posNote = $("#setup-pos-note");
  if (noteEl) {
    if (picked.length < 2) {
      noteEl.hidden = true;
      noteEl.textContent = "";
    } else {
      // Preview with the coach's own tactics (the first is his default);
      // the philosophy sliders went away with the advanced section.
      const tacticId = you.coach?.specialTactics?.[0];
      const tactic = TACTICS[tacticId] || null;
      const previewCoach = applyCoachPhilosophy(you.coach, {
        styleName: you.coach?.style,
        offense: you.coach?.buffs?.offense ?? 8,
        defense: you.coach?.buffs?.defense ?? 8,
        morale: you.coach?.buffs?.morale ?? 8,
        stamina: you.coach?.buffs?.stamina ?? 2,
        tactics: tacticId ? [tacticId] : you.coach?.specialTactics,
      });
      const primaryId = you.gameplan?.offenseFocusId || null;
      const ballOpts = { primaryId: primaryId || null };
      const ball = lineupBallNote(picked, ballOpts);
      const fit = lineupFit(picked, previewCoach, tactic, ballOpts);
      const chem = teamChemistry(picked, ballOpts);
      applyLineupPositionEffects(picked);
      noteEl.hidden = false;
      noteEl.textContent = `${L("搭配参考：适配", "Lineup check: fit")} ${fit} · ${L("化学反应", "chemistry")} ${chem}${ball ? " · " + ball : ""}`;
    }
  }
  if (posNote) posNote.textContent = status.posNote;

  const refreshAfter = () => {
    renderSetupRoster();
    renderSetupRoles();
    // Matchup board + key-defense selects are built from the selected
    // starters: without this they kept showing the lineup from when
    // setup was entered, even after drag-swaps changed the five.
    renderSetupGameplan();
  };

  bindSetupDragDrop(box, you, refreshAfter);

  // Every change re-renders the board: remember which settings drawers are open so a dropdown change does not slam it shut.
  if (!state.setup.openMore) state.setup.openMore = new Set();
  box.querySelectorAll(".setup-card-more").forEach((d) => {
    d.addEventListener("toggle", () => {
      const id = d.dataset.moreFor;
      if (d.open) state.setup.openMore.add(id);
      else state.setup.openMore.delete(id);
    });
  });

  box.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
    btn.onclick = (e) => {
      if (box._setupDidDrag?.()) return;
      if (e.target.closest(".setup-card-more")) return; // the settings drawer (summary + its controls) never toggles the player
      if (e.target.closest(".setup-pos-select, .setup-ord-select, .setup-role-select, .setup-min-input")) return;
      const id = btn.dataset.id;
      const p = you.players.find((x) => x.id === id);
      if (!isPlayerAvailable(p)) return;
      if (state.setup.selected.has(id)) {
        state.setup.selected.delete(id);
      } else if (state.setup.selected.size < 5) {
        const current = you.players.filter((x) => state.setup.selected.has(x.id));
        if (!p.playPosManual) {
          p.playPos = nextEmptyPlayPos(current, p);
        } else {
          p.playPos = nextEmptyPlayPos(current, p, p.playPos || p.pos);
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
  // Tendency dropdowns transplanted onto the cards: same write path as the
  // old tendencies-section rows (markOrdersManual), then a full refresh so
  // the card, roles, and matchup board all see the new instruction.
  box.querySelectorAll(".setup-ord-select").forEach((sel) => {
    sel.onchange = (e) => {
      e.stopPropagation();
      const card = sel.closest(".setup-mini");
      const p = you.players.find((x) => x.id === card?.dataset.id);
      if (!p || !sel.dataset.ordKey) return;
      markOrdersManual(p, { [sel.dataset.ordKey]: sel.value });
      refreshAfter();
    };
    sel.onclick = (e) => e.stopPropagation();
  });
  // Role + minutes transplanted onto the cards: same write path as the old
  // "角色与分钟" list rows (roleExpectation / targetMinutes on the player),
  // then a full refresh so the totals bar and the other cards stay in sync.
  box.querySelectorAll(".setup-role-select").forEach((sel) => {
    sel.onchange = (e) => {
      e.stopPropagation();
      const p = you.players.find((x) => x.id === sel.dataset.roleFor);
      if (!p) return;
      p.roleExpectation = sel.value;
      p._roleManual = true;
      p.targetMinutes = suggestTargetMinutes(p);
      refreshAfter();
    };
    sel.onclick = (e) => e.stopPropagation();
  });
  box.querySelectorAll(".setup-min-input").forEach((inp) => {
    inp.onchange = (e) => {
      e.stopPropagation();
      const p = you.players.find((x) => x.id === inp.dataset.minFor);
      if (!p) return;
      p.targetMinutes = clamp(Number(inp.value) || 20, 8, 48);
      refreshAfter();
    };
    inp.onclick = (e) => e.stopPropagation();
  });
}

$("#btn-setup-confirm").onclick = () => {
  if (state.setup.selected.size !== 5) return;
  // Edits made on the tactics board count even if the player never pressed Apply; a plan the engine cannot run stops here.
  const pending = tacticsBoard?.applyPending();
  if (pending && !pending.ok) return $("#setup-tactics-board")?.scrollIntoView?.({ block: "center" });
  // A valid plan whose autosave failed still starts the game (commitDraft keeps it in memory); say so, so a refused save never looks like a broken start button.
  if (pending?.saveFailed) alert(L("战术已应用并开打，但这次进度没能保存到本机（存档被占用或空间不足）。打完这场后请检查存档。", "The plan is applied and the game will start, but this save could not be written (the save slot is in use or full). Check your saves after the game."));
  tacticsBoard?.destroy();
  tacticsBoard = null;
  const { home, away, youSide } = state.pendingMatch;
  const you = youSide === "home" ? home : away;
  // The advanced section is gone, so there are no pre-game philosophy
  // overrides anymore: the game starts with the coach's own buffs, style,
  // and tactics. A saved rotation plan already wrote its phil onto the
  // coach (applyRotationPlan), and the tactics board — when it applied —
  // already ordered his tactics with the active scheme first.
  you.coach = applyCoachPhilosophy(you.coach, {
    styleName: you.coach?.style || "自定义方针",
    offense: you.coach?.buffs?.offense ?? 8,
    defense: you.coach?.buffs?.defense ?? 8,
    morale: you.coach?.buffs?.morale ?? 8,
    stamina: you.coach?.buffs?.stamina ?? 2,
    tactics: you.coach?.specialTactics?.length ? [...you.coach.specialTactics] : ["balanced"],
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
  // No more ball-handler dropdowns (advanced section deleted): the focus
  // is whatever the saved rotation plan — or the tactics board, which
  // already applied — left on the gameplan; the action is the suggestion
  // for that player (the `if (focusId)` block below).
  const focusId = you.gameplan?.offenseFocusId || null;
  const ballAction = null;
  const tempoId = normalizeTempo(you.gameplan?.tempo);
  you.gameplan = composeGameplan({
    defenderId: defId,
    targetId: tgtId,
    scheme,
    assignments,
    offenseFocusId: focusId,
    tempo: tempoId,
    pnr: you.gameplan?.pnr || null, // roles the tactics board saved: this handler must not wipe them
  });
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
    // Tweaks made while a matchup plan is active refine THAT plan; the saved default stays the default.
    if (!persistMatchupRotationFromTeam(you, (youSide === "home" ? away : home)?.teamId)) persistSeasonRotationFromTeam(you, you.starterIds);
  } else if (state.career?.kind === "ranked") {
    // B2: ranked has no season roster to write back to — the account remembers the hand-set bits
    rememberPlayerPrefs(state.career.accountId, you.players);
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
  // The game screen is shared by every mode; only the Play Now path re-shows its one-time tip.
  const playNowTip = $("#play-now-tip");
  if (playNowTip) playNowTip.hidden = true;
  const goalsBox = $("#live-goals");
  if (goalsBox) {
    goalsBox.hidden = true;
    goalsBox.innerHTML = "";
  }
  liveGoalsShown = "";
  state.lineupSig = "";
  state.subOutId = null;
  state.subInId = null;
  const feed = $("#play-feed");
  if (feed) feed.innerHTML = "";
  state.court?.destroy?.();
  state.court = newCourtView();
  state.court.ensureDom();

  $("#game-team-a").textContent = teamNameL(homeTeam.name, getLang());
  $("#game-team-b").textContent = teamNameL(awayTeam.name, getLang());
  paintFeedIdentity(homeTeam, awayTeam);
  $("#you-side").textContent = teamNameL(youSide === "home" ? homeTeam.name : awayTeam.name, getLang());

  const injuryMode =
    state.mode === "career" ||
    state.mode === "tournament" ||
    state.career?.kind === "career" ||
    !!state.tournament;
  // Every match starts at 1x and the player can cycle 1→2→3, except a two-human Duel (nobody may hurry the
  // other player). See js/ui/playbackSpeed.js.
  state.speed = 1;
  const speedBtn = $("#btn-speed");
  if (speedBtn) {
    speedBtn.hidden = speedLocked(state.mode, currentTournamentMatch());
    speedBtn.textContent = speedButtonText(1);
    speedBtn.title = L("切换 1x真实 / 2x / 3x最快", "Cycle 1x real time / 2x / 3x fastest");
  }
  const quickBtn = $("#btn-quick-sim");
  if (quickBtn) {
    quickBtn.disabled = false;
    quickBtn.hidden = false;
  }
  // Keep last autopilot preference across tip-offs in the same session
  if (state.autoOffense == null) state.autoOffense = false;
  if (state.autoDefense == null) state.autoDefense = false;
  if (state.autoRotation == null) state.autoRotation = false;
  if (state.timeoutTier == null) state.timeoutTier = "balanced";

  const sim = new GameSim({
    home: homeTeam,
    away: awayTeam,
    youSide,
    injuries: injuryMode,
    speed: state.speed,
    onEvent: (e) => handleSimEvent(e),
    onTick: (snap) => {
      try {
        paintScoreWithCursor(snap);
        paintLineups(snap);
        // The coach-panel body (meters, orders, positions) is display:none while the drawer is closed in live
        // play; rebuilding it every possession was pure layout cost. It is repainted once when the drawer opens.
        if (coachDrawer.isOpen()) {
          paintMeters(snap);
        } else {
          paintMomentum(snap);
        }
        state.court?.render(snap);
        state.domainEvents?.observeTick(snap);
        syncPauseUI(snap);
      } catch (err) {
        console.error("[ui] onTick", err);
      }
    },
    onEnd: (snap) => {
      state.finishedSim = sim; // from here on this game is a result, not a resumable live game
      syncInjuriesToTeams(sim, homeTeam, awayTeam);
      state.domainEvents?.observeEnd(snap);
      const formNotes = syncFormToTeams(sim, homeTeam, awayTeam);
      showResult(snap, { formNotes });
      if (state.career?.kind === "career") autosaveCareer();
      // Only the current flow's own save goes. A quick game started while an older run sat in "Continue progress"
      // used to delete that run at the final buzzer without a word.
      else if (sessionSaveIsCurrentFlow()) clearSave();
      refreshSaveHomeBar();
    },
  });
  state.sim = sim;
  wireDomainEvents();
  match3d.startMatch({ offer: state.career?.kind === "career" });

  const you = youSide === "home" ? sim.home : sim.away;
  // 开场下拉框显示本场实际开场战术（默认优先），不沿用上一场页面里剩的值。
  fillTacticSelect(you, { preferId: you.tactic?.id });
  syncLivePhilFromCoach(you.coach);
  initFocusAndPacksUI(homeTeam, awayTeam, youSide);

  // Start clock first so a court/UI paint error cannot leave the sim dead.
  if (state.autoOffense) sim.setAutoOffense(true);
  if (state.autoDefense) sim.setAutoDefense(true);
  if (state.autoRotation) sim.setAutoRotation(true);
  sim.setTimeoutTier(state.timeoutTier || "balanced");
  syncManagedUI();
  syncTimeoutTierUI();
  syncPauseUI(sim.snapshot());
  sim.start();

  try {
    const snap0 = sim.snapshot();
    paintScore(snap0);
    paintLineups(snap0);
    paintMeters(snap0);
    state.court.render(snap0);
  } catch (err) {
    console.error("[ui] initial paint", err);
  }
}

function handleSimEvent(e) {
  match3d.feedRaw(e);
  // Dunk drive: the token runs to the rim on the court. The score event
  // that follows still feeds and paints; only its shot arc is suppressed
  // (the court swallows it for the dunker). A dunk with no token to drive
  // falls back to that plain arc.
  if (e?.type === "dunk" && e.meta?.player) {
    try {
      state.court?.onDunk(e.meta.player.id);
    } catch (err) {
      console.error(err);
    }
    return;
  }
  // Jump-shot arc: score/miss events from the shot-resolution branches
  // carry meta.shot. Foul/turnover "miss" events and free-throw "score"
  // events have no meta.shot, so they never animate.
  if (e?.meta?.shot) {
    try {
      state.court?.onShot(e.meta.shot);
    } catch (err) {
      console.error(err);
    }
  }
  // Pass arc: every ball-change carries meta.pass (M3 kicks, B53 all passes);
  // the ball arcs from passer to receiver.
  if (e?.meta?.pass) {
    try {
      state.court?.onPass(e.meta.pass);
    } catch (err) {
      console.error(err);
    }
  }
  // Signature-skill trigger: pulse the token, then let the event feed and
  // paint exactly as it did before — no early return here.
  if (e?.meta?.skill) {
    try {
      state.court?.skillPop(e.meta.skill.playerId);
    } catch (err) {
      console.error(err);
    }
  }
  // With the 3D court up, the feed line and the scoreboard wait for the presentation cursor to reach this event (they never run
  // ahead of the action). Coach/system lines are not plays: the TEXT shows at once, but never the score they carry (that snapshot
  // can already include plays the court has not shown yet); the scoreboard stays with the cursor. 2D mode is unchanged.
  if (e?.type === "coach" && !e.meta?.pass) {
    pushFeed(e.type, e.text, e);
    if (!match3d.active) paintScoreSafe(e);
    return;
  }
  match3d.defer(() => {
    pushFeed(e.type, e.text, e);
    paintScoreSafe(e);
  }, e?.seq);
}

function paintScoreSafe(snap) {
  try {
    paintScore(snap);
  } catch (err) {
    console.error(err);
  }
}

/** The per-possession scoreboard paint: follows the 3D cursor (lineups, meters and the sub menus are controls and stay live). */
function paintScoreWithCursor(snap) {
  match3d.defer(() => paintScoreSafe(snap));
}

/**
 * 本场颜色身份：两队各一个球队色（历史队真队色 / 联队取首发众数队色），
 * 写进记分牌队名和 state.feedColors。播报按进攻方上色——
 * 看颜色就知道是谁在进攻、谁得分，不用认球员名。
 * （播报图例条已删除——每条实况现在自带球队代码块，跟记分牌颜色同源，不再需要单独解释。）
 */
function paintFeedIdentity(homeTeam, awayTeam) {
  const homeName = homeTeam?.name || "主队";
  const awayName = awayTeam?.name || "客队";
  state.feedColors = resolveMatchColors(
    homeTeam || { name: homeName },
    awayTeam || { name: awayName }
  );
  const { home, away } = state.feedColors;
  const aEl = $("#game-team-a");
  const bEl = $("#game-team-b");
  if (aEl) aEl.style.color = home.text;
  if (bEl) bEl.style.color = away.text;
}

/** The live (full, un-slimmed) player object for a feed avatar — bref and all, same fidelity
 *  the rotation board already shows. Looks in both rosters since an id alone doesn't say side. */
function livePlayerById(id) {
  if (!id || !state.sim) return null;
  return state.sim.home.roster.find((p) => p.id === id) || state.sim.away.roster.find((p) => p.id === id) || null;
}

const feedRuns = createRunTracker(); // consecutive-points highlight needs the event history (B18)

function pushFeed(type, text, ev = null) {
  const feed = $("#play-feed");
  if (!feed) return;
  if (type === "dunk") return;
  // B53: silent structured pass events carry the arc in meta.pass and no feed text.
  if (type === "pass") return;
  const actor = livePlayerById(feedActorId(ev));
  const row = feedRowHtml(ev || { type, text }, {
    run: ev ? feedRuns.observe(ev) : null,
    colors: state.feedColors,
    actorName: actor?.name,
    avatarHtml: actor ? photoImg(actor, "headshot feed-avatar") : null,
    escFn: esc,
    lang: getLang(),
  });
  const div = document.createElement("div");
  div.className = row.className;
  if (row.borderColor) div.style.borderLeftColor = row.borderColor;
  if (row.tint) div.style.setProperty("--tint", row.tint);
  div.innerHTML = row.html;
  feed.prepend(div);
  while (feed.children.length > 40) feed.removeChild(feed.lastChild);
}

function paintScore(snap) {
  audio.game(snap);
  $("#score-a").textContent = snap.score.home;
  $("#score-b").textContent = snap.score.away;
  $("#quarter").textContent = snap.quarter > 4 ? "OT" : `Q${snap.quarter}`;
  $("#game-clock").textContent = fmtClock(snap.clock);
  $("#poss-label").textContent = snap.possession === "home" ? L("主队进攻", "Home on offense") : L("客队进攻", "Away on offense");
  // Every path that shows the score (tick, first paint, restore, after a timeout) also moves the goals.
  paintLiveGoals(snap);
}

/**
 * C6: the goals of the season game being played (regular or playoff), or [] when this game isn't one.
 * They are the ones the hub promised and the result will judge: `goalsForNextGame` keeps them on the season.
 * Both pending slots are cleared when the game is settled, so a stray tick afterwards can't draw the next game's.
 */
function activeSeasonGoals() {
  const st = state.season;
  if (!st || !isManagedCareer(state.leagueCareer)) return [];
  if (!state.seasonPendingGame && !state.seasonPendingPlayoffGame) return [];
  return goalsForNextGame(st, st.teams[st.userTeamId]?.players || []);
}

let liveGoalsShown = "";
/** The "本场目标" strip under the scoreboard. Only touches the DOM when its text actually changed. */
function paintLiveGoals(snap) {
  const box = $("#live-goals");
  if (!box) return;
  const goals = activeSeasonGoals();
  const html = goals.length ? liveGoalsHtml({ progress: liveGoalProgress(snap, goals), lang: getLang() }) : "";
  if (html === liveGoalsShown) return;
  liveGoalsShown = html;
  box.innerHTML = html;
  box.hidden = !html;
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

/**
 * One live roster row. opts: extra = third-line HTML (intent + suggestions,
 * your court only), draggable = HTML5-draggable (your court + healthy bench),
 * side = "you" | "opp" | "bench" (drag identity), staged = tap-to-sub pick,
 * showOvr = bench rows also show OVR.
 */
function liveStatusLine(p, marked = false, opts = {}) {
  const fg = p.fgPct != null ? `${p.fgPct}%` : "—";
  const inj = p.injuredGames > 0 ? ` · <em class="inj">${esc(p.injuryStatus || L("伤停", "Injured"))}</em>` : "";
  const grade = p.grade || "C+";
  const gTone = p.gradeTone || "grade-c";
  const gTip = p.gradeLast ? ` title="${L("最近：", "Last: ")}${escAttr(gradeReasonLabel(p.gradeLast, getLang()))}"` : "";
  const drag = opts.draggable === undefined ? "" : ` draggable="${opts.draggable ? "true" : "false"}"`;
  const side = opts.side ? ` data-side="${opts.side}"` : "";
  return `<li class="roster-line ${marked ? "marked" : ""}${opts.staged ? " staged" : ""}" data-id="${p.id}"${drag}${side}>
    ${photoImg(p)}
    <div class="live-line">
      <div class="main"><span class="live-grade ${gTone}"${gTip}>${esc(grade)}</span> ${esc(p.playPos || p.pos)} ${esc(p.name)}${opts.showOvr ? ` · OVR ${p.overall ?? overall(p)}` : ""} · ${L(
        `${p.stats.pts}分 ${p.stats.reb}板 ${p.stats.ast}助 ${p.stats.stl}断 ${p.stats.blk}帽 · 命中${fg} · 疲劳${p.fatigue}`,
        `${p.stats.pts} pts ${p.stats.reb} reb ${p.stats.ast} ast ${p.stats.stl} stl ${p.stats.blk} blk · FG ${fg} · Fatigue ${p.fatigue}`,
      )}${p.fatigueNote ? `·${esc(p.fatigueNote)}` : ""}${p.ironLungs ? L("·铁肺", " · Iron Lungs") : ""}${
        p.confidenceLabel ? ` · ${p.confidenceLabel}` : ""
      }${inj}</div>
      <div class="status">${L("手感", "Touch")} <span class="${hotClass(p.hot)}">${p.hotLabel || L("平稳", "Steady")}</span> · ${L("心情", "Mood")} <span class="${moodClass(p.mood)}">${p.moodLabel || L("平静", "Calm")}</span>${
        marked ? ` · <strong>${L("对位中", "Matched up")}</strong>` : ""
      }</div>${opts.extra || ""}
    </div>
  </li>`;
}

/** True while an HTML5 drag is in flight: paintLineups must not yank the rows
 * out from under it (a tick repaint mid-drag kills the drop). Cleared on
 * dragend/drop; the lists repaint right after. */
let liveDragActive = false;
let liveLineupsBound = false;

function paintLineups(snap) {
  if (liveDragActive) return;
  const you = snap.youSide === "home" ? snap.home : snap.away;
  const opp = snap.youSide === "home" ? snap.away : snap.home;
  const lang = getLang();
  const plan = snap.defensePlan || {};
  const assignments = plan.assignments || {};
  const markId = plan.targetId || null;
  const youPrimary = snap.offenseFocusId || null;
  // Invert assignments (oppId -> defenderId) so each of our players knows
  // who he guards; the focus defender gets his own label.
  const oppById = new Map(opp.onCourt.map((p) => [p.id, p]));
  const guardOf = {};
  const focusGuardOf = {};
  for (const [oppId, defId] of Object.entries(assignments)) {
    const name = oppById.get(oppId)?.name;
    if (name) guardOf[defId] = name;
  }
  if (plan.targetId && plan.defenderId) {
    const name = oppById.get(plan.targetId)?.name;
    if (name) focusGuardOf[plan.defenderId] = name;
  }
  // Threat for the "盯死 / 建议主防" suggestions: same helper the defend-advice
  // line uses (no random gate, advice only).
  const youScore = snap.score?.[you.side] ?? 0;
  const oppScore = snap.score?.[opp.side] ?? 0;
  const { threat } = suggestDefenseScheme(opp.onCourt, oppScore - youScore);
  const threatGuardId = threat ? assignments[threat.id] || null : null;
  const bestDefenderId = [...you.onCourt].sort((a, b) => (b.defense || 0) - (a.defense || 0))[0]?.id || null;
  // An injured on-court player is pre-staged as the sub-out pick, like the
  // old sub panel did — the row shows staged until he is swapped out.
  const mustSit = you.onCourt.find((p) => p.injuredGames > 0);
  if (mustSit && !state.subOutId) state.subOutId = mustSit.id;
  // Your court: intent + suggestions on a third line, draggable for subs.
  const youRows = you.onCourt.map((p) => {
    const intent = livePlayerIntent(p, {
      isHandler: p.id === youPrimary,
      guardName: guardOf[p.id] || null,
      focusGuardName: focusGuardOf[p.id] || null,
      lang,
    });
    const sug = livePlayerSuggestions(p, { isHandler: p.id === youPrimary, threat, threatGuardId, bestDefenderId, lang });
    const extra = `<div class="intent">${L("意图", "Intent")} ${esc(intent)}${sug.length ? ` · <span class="suggest">${sug.map(esc).join(" · ")}</span>` : ""}</div>`;
    return liveStatusLine(p, false, { extra, draggable: true, side: "you", staged: state.subOutId === p.id });
  });
  // Always refresh live feel/mood (cheap: 10 rows)
  $("#oncourt-you").innerHTML = youRows.join("");
  $("#oncourt-opp").innerHTML = opp.onCourt.map((p) => liveStatusLine(p, p.id === markId, { side: "opp" })).join("");
  const bench = [...(you.bench || [])].sort(byOverallDesc);
  $("#bench-you").innerHTML = bench.length
    ? bench
        .map((p) =>
          liveStatusLine(p, false, {
            draggable: !(p.injuredGames > 0),
            side: "bench",
            staged: state.subInId === p.id,
            showOvr: true,
          }),
        )
        .join("")
    : `<li class="tiny">${L("板凳无人", "Bench is empty")}</li>`;
  const youTitle = $("#lineup-you-title");
  const oppTitle = $("#lineup-opp-title");
  if (youTitle) youTitle.textContent = `${teamNameL(you.name)} · ${L("场上", "On Court")}`;
  if (oppTitle) oppTitle.textContent = `${teamNameL(opp.name)} · ${L("场上", "On Court")}`;
  const youChem = $("#lineup-you-chem");
  const oppChem = $("#lineup-opp-chem");
  const youBall = ballNoteL(lineupBallNote(you.onCourt, { primaryId: youPrimary }));
  const oppBall = ballNoteL(lineupBallNote(opp.onCourt, { primaryId: null }));
  const teamSug = liveTeamSuggestion({ youScore, oppScore, lang });
  if (youChem) {
    youChem.textContent = `${chemLine(you)}${youBall ? ` · ${youBall}` : ""}${
      teamSug ? ` · ${teamSug}` : ""
    }`;
  }
  if (oppChem) {
    oppChem.textContent = `${chemLine(opp)}${oppBall ? ` · ${oppBall}` : ""}`;
  }
  const hint = $("#bench-hint");
  if (hint) {
    const injuredOn = you.onCourt.filter((p) => p.injuredGames > 0).length;
    const injuredBench = bench.filter((p) => p.injuredGames > 0).length;
    const healthyBench = bench.filter((p) => !(p.injuredGames > 0)).length;
    const dead = !!state.sim?.paused;
    hint.textContent = !dead
      ? injuredOn
        ? L(`场上有 ${injuredOn} 人伤病——先暂停/等到节间，把他换下来`, `${injuredOn} injured on court — call a timeout or wait for the break to sit him`)
        : L("活球中不可换人——叫暂停或等到节间", "Can't sub live — call a timeout or wait for the break")
      : injuredOn && healthyBench
        ? L(`⚠ ${mustSit?.name || "伤员"}不能继续——拖板凳球员到他身上换人`, `⚠ ${mustSit?.name || "The injured player"} can't continue — drag a bench player onto him`)
        : injuredOn && !healthyBench
          ? L("⚠ 场上有伤员，但板凳没有健康球员可换", "⚠ Someone is injured on court, but no healthy player is on the bench")
          : injuredBench
            ? L(`拖板凳球员到场上球员身上换人；点选场上 + 板凳也行（伤停 ${injuredBench} 人不能上场）`, `Drag a bench player onto an on-court player to sub; tapping on-court + bench works too (${injuredBench} injured on the bench can't play)`)
            : L("拖板凳球员到场上球员身上换人；点选场上 + 板凳也行", "Drag a bench player onto an on-court player to sub; tapping on-court + bench works too");
  }
  paintDefendTargets(snap);
  paintLiveMatchupBoard(snap);
  bindLiveLineups();
}

/**
 * One delegated binding for the three lineup lists (the <ul>s are stable,
 * the <li>s are repainted every tick). Drag: bench <-> court. Tap: tap a
 * court row then a bench row (either order) to sub at once. Opponent rows
 * keep their old job — click to set the defend target.
 */
function bindLiveLineups() {
  if (liveLineupsBound) return;
  const box = document.querySelector(".lineups");
  if (!box) return;
  liveLineupsBound = true;
  const rowOf = (e) => e.target?.closest?.("li[data-id]") || null;
  box.addEventListener("dragstart", (e) => {
    const li = rowOf(e);
    if (!li || li.getAttribute("draggable") !== "true") return;
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: li.dataset.id, side: li.dataset.side }));
    e.dataTransfer.effectAllowed = "move";
    liveDragActive = true;
    li.classList.add("dragging");
  });
  box.addEventListener("dragover", (e) => {
    const li = rowOf(e);
    if (!li || !liveDragActive) return;
    const valid = (li.dataset.side === "you" || li.dataset.side === "bench") && li.getAttribute("draggable") !== "false";
    if (!valid) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    li.classList.add("drop-ok");
  });
  box.addEventListener("dragleave", (e) => {
    rowOf(e)?.classList.remove("drop-ok");
  });
  box.addEventListener("drop", (e) => {
    const li = rowOf(e);
    if (!li) return;
    e.preventDefault();
    li.classList.remove("drop-ok");
    let drag = null;
    try {
      drag = JSON.parse(e.dataTransfer.getData("text/plain") || "null");
    } catch {
      drag = null;
    }
    if (!drag?.id || !drag.side) return;
    const target = { id: li.dataset.id, side: li.dataset.side };
    if (drag.side === "bench" && target.side === "you") tryLiveSub(target.id, drag.id);
    else if (drag.side === "you" && target.side === "bench") tryLiveSub(drag.id, target.id);
  });
  box.addEventListener("dragend", () => {
    liveDragActive = false;
    box.querySelectorAll(".dragging, .drop-ok").forEach((el) => el.classList.remove("dragging", "drop-ok"));
    if (state.sim) paintLineups(state.sim.snapshot());
  });
  box.addEventListener("click", (e) => {
    const li = rowOf(e);
    if (!li || !state.sim) return;
    const id = li.dataset.id;
    const side = li.dataset.side;
    if (side === "opp") {
      // Click opponent row to select as defend target (unchanged).
      const snap = state.sim.snapshot();
      const sel = $("#defend-target");
      if (sel) sel.value = id;
      const assigned = snap.defensePlan?.assignments?.[id];
      const defSel = $("#defend-defender");
      if (defSel && assigned) defSel.value = assigned;
      syncDefendHint({
        ...snap,
        defensePlan: {
          ...(snap.defensePlan || {}),
          targetId: id,
          defenderId: assigned || snap.defensePlan?.defenderId,
        },
      });
      return;
    }
    if (side === "you") {
      if (state.subInId) tryLiveSub(id, state.subInId);
      else {
        state.subOutId = state.subOutId === id ? null : id;
        paintLineups(state.sim.snapshot());
      }
      return;
    }
    if (side === "bench") {
      if (li.getAttribute("draggable") === "false") return; // injured bench: never selectable
      if (state.subOutId) tryLiveSub(state.subOutId, id);
      else {
        state.subInId = state.subInId === id ? null : id;
        paintLineups(state.sim.snapshot());
      }
    }
  });
}

/**
 * The one sub path for the live screen now (drag or tap-tap both land here).
 * Same gates as the old confirm button: paused only, and the engine still
 * validates (injured / fouled-out inbound is refused with a coach message).
 */
function tryLiveSub(outId, inId) {
  if (!state.sim?.paused) {
    pushFeed("coach", L("活球中不能换人——请先叫暂停或等到节间", "Can't sub live — call a timeout or wait for the break"));
    return false;
  }
  if (!outId || !inId || outId === inId) return false;
  const ok = state.sim.substitute(outId, inId);
  if (!ok) {
    state.subOutId = null;
    state.subInId = null;
    return false;
  }
  state.subOutId = null;
  state.subInId = null;
  state.lineupSig = "";
  const snap = state.sim.snapshot();
  fillTacticSelect(state.sim.you(), { preferId: state.sim.you()?.tactic?.id });
  paintPlayerOrders(snap, { force: true });
  paintLivePositions(snap);
  paintDefendTargets(snap);
  paintLineups(snap);
  paintMeters(snap);
  return true;
}

function paintMeters(snap) {
  const you = snap.youSide === "home" ? snap.home : snap.away;
  const opp = snap.youSide === "home" ? snap.away : snap.home;
  $("#morale").textContent = meterText(you.morale);
  $("#chem").textContent = meterText(you.chem);
  $("#fit").textContent = meterText(you.fit);
  $("#morale-bar").style.width = `${you.morale}%`;
  $("#chem-bar").style.width = `${you.chem}%`;
  $("#fit-bar").style.width = `${you.fit}%`;
  // Hover explanations on meters
  const moraleRow = $("#morale")?.parentElement;
  const chemRow = $("#chem")?.parentElement;
  const fitRow = $("#fit")?.parentElement;
  if (moraleRow) moraleRow.title = "士气：影响出手胆量与抗压；沟通/暂停可抬升";
  if (chemRow) chemRow.title = "化学反应：球星自负冲突会降；两人仍抢球才会因持球冲突拖累（设无球可化解）";
  if (fitRow) fitRow.title = "适配度：战术需求、站位、持球/无球搭配；无球能力差时火力会被间接削弱";
  const oc = $("#opp-chem");
  const om = $("#opp-morale");
  if (oc) oc.textContent = meterText(opp.chem);
  if (om) om.textContent = meterText(opp.morale);
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
  // 大喊表现层：战术执行窗口剩余回合（temp 随 ttl 到期一次性清零，故 hold>0 当且仅当 ttl>0）
  const holdEl = $("#tactic-hold-line");
  if (holdEl) {
    const temp = you.temp || {};
    const ttl = temp.ttl || 0;
    if ((temp.tacticHold || 0) > 0 && ttl > 0) {
      holdEl.hidden = false;
      holdEl.textContent =
        getLang() === "en" ? `System lock-in: ${ttl} possessions left` : `战术执行剩余 ${ttl} 回合`;
    } else {
      holdEl.hidden = true;
      holdEl.textContent = "";
    }
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
    label.textContent = L("平静", "Even");
    return;
  }
  const name = teamNameL(m.side === "home" ? snap.home.name : snap.away.name);
  label.textContent = L(`${name} 连得 ${pts}`, `${name} ${pts}-0 run`);
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
  // Rebuild only when the lineup/orders changed, and never under the user's cursor (an open <select> would be wiped mid-pick).
  if (!force && (box.dataset.sig === sig || document.activeElement?.closest?.("#player-orders-panel"))) return;
  box.dataset.sig = sig;
  if (focusSel) {
    const focusId = snap.offenseFocusId;
    const stillOn = focusId && on.some((p) => p.id === focusId);
    focusSel.innerHTML =
      `<option value="">（不指定 · 按本能）</option>` +
      on.map((p) => `<option value="${p.id}">${p.playPos || p.pos} ${esc(p.name)}</option>`).join("");
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
      // Save immediately on change (like the pre-game panel and the
      // per-player order selects): previously this was a no-op and the
      // pick evaporated on the next repaint, which forced the dropdown
      // back to the suggested action.
      actionSel.onchange = () => {
        const fid = $("#offense-focus-select")?.value || state.sim?.offenseFocusId || "";
        if (!fid || !state.sim?.paused) return;
        state.sim.setPlayerOrders(fid, { action: actionSel.value });
        paintPlayerOrders(state.sim.snapshot(), { force: true });
        paintMeters(state.sim.snapshot());
      };
    }
  }
  box.innerHTML = on
    .map((p) => {
      const o = p.orders || {};
      const lang = getLang();
      return `<div class="order-row compact" data-id="${p.id}">
        <div class="order-name">${p.playPos || p.pos} ${esc(p.name)}
          <span class="tiny order-summary">${escAttr(ordersLabel(o, lang) || L("自由发挥", "Play free"))}</span>
        </div>
        <div class="order-group">
          <span class="order-group-label">${L("进攻", "Offense")}</span>
          <div class="order-controls">
            ${orderSelectHtml(ORDER_USAGE, o.usage || "auto", "ord-usage", L("组织 / 得分 / 偏防守 / 蓝领冲抢", "Playmaker / scorer / defense / hustle"), undefined, lang)}
            ${orderSelectHtml(ORDER_AGGRESSION, o.aggression || "auto", "ord-agg", L("攻击欲望 / 专注防守", "Shot appetite / lock down"), undefined, lang)}
            ${orderSelectHtml(ORDER_ACTION, o.action || "auto", "ord-action", L("挡拆 / 无球 / 冲抢二次", "Screen / off ball / crash"), undefined, lang)}
            ${orderSelectHtml(ORDER_ATTACK, o.attack || "auto", "ord-attack", L("终结 / 二次进攻", "Finish spot / putbacks"), undefined, lang)}
            ${orderSelectHtml(ORDER_HUNT, o.hunt || "auto", "ord-hunt", L("抓机会", "Hunting his own shot"), undefined, lang)}
          </div>
        </div>
        <div class="order-group">
          <span class="order-group-label">${L("防守", "Defense")}</span>
          <div class="order-controls">
            ${orderSelectHtml(ORDER_DEF, o.defFocus || "auto", "ord-def", L("领防 / 全力防守等", "On the ball / all out"), undefined, lang)}
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
  const lang = getLang();
  help.textContent = t ? tacticDesc(t, lang) : lang === "en" ? "Pick a tactic, then hit Deploy to apply it immediately." : "选择战术后点「布置」立即生效。";
  help.title = t ? tacticDesc(t, lang) : "";
}

const TAKEOVER_HIDDEN_KEY = "courtside-takeover-hidden";

/** M3 tactical takeover panel: live-ball setFocusPlay / setTempo via the DecisionAdapter pattern (same engine calls the dead-ball panel makes). Hiding it calls nothing, so the sim is unaffected. */
function wireTakeoverPanel() {
  const panel = $("#takeover-panel");
  const showBtn = $("#btn-takeover-show");
  if (!panel) return;
  let hidden = false;
  try {
    hidden = typeof localStorage !== "undefined" && localStorage.getItem(TAKEOVER_HIDDEN_KEY) === "1";
  } catch {
    hidden = false;
  }
  panel.hidden = hidden;
  if (showBtn) showBtn.hidden = !hidden;
  const setHidden = (v) => {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(TAKEOVER_HIDDEN_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    panel.hidden = v;
    if (showBtn) showBtn.hidden = !v;
  };
  // .onclick (not addEventListener): this runs once per game, and stacking listeners fired N handlers per click by game N.
  const hideBtn = $("#btn-takeover-hide");
  if (hideBtn) hideBtn.onclick = () => setHidden(true);
  if (showBtn) showBtn.onclick = () => setHidden(false);

  const lang = getLang();
  const focusSel = $("#takeover-focus-select");
  if (focusSel) {
    focusSel.innerHTML =
      `<option value="">${L("（无重点）", "(No focus)")}</option>` +
      FOCUS_PLAYS.map((f) => {
        const lbl = planLabel(f, lang);
        return `<option value="${f.id}" title="${escAttr(lbl.desc)}">${esc(lbl.name)}</option>`;
      }).join("");
  }
  const tempoRow = $("#takeover-tempo-row");
  if (tempoRow) {
    tempoRow.innerHTML = TEMPO_OPTIONS.map((t) => {
      const lbl = planLabel(t, lang);
      return `<button type="button" class="btn small takeover-tempo-btn" data-tempo="${t.id}" title="${escAttr(lbl.desc)}">${lbl.short}</button>`;
    }).join("");
    tempoRow.querySelectorAll("[data-tempo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = createTacticalTakeover({ sim: state.sim }).setTempo(btn.dataset.tempo);
        if (!res.ok) {
          pushFeed("coach", L("现在不能改节奏", "Can't change pace right now"));
          return;
        }
        syncTakeoverPanel();
        syncTempoHelp($("#tempo-help"), res.tempoId);
        const sel = $("#tempo-select");
        if (sel) sel.value = res.tempoId;
      });
    });
  }
  const focusBtn = $("#btn-takeover-focus");
  if (focusBtn) focusBtn.onclick = () => {
    const res = createTacticalTakeover({ sim: state.sim }).setFocus(focusSel?.value || "");
    if (!res.ok) {
      pushFeed("coach", L("现在不能设回合重点", "Can't set a possession focus right now"));
      return;
    }
    syncTakeoverPanel();
    const deadSel = $("#focus-play-select");
    if (deadSel) deadSel.value = res.focusId || "";
    const help = $("#focus-help");
    if (help) {
      const f = FOCUS_PLAYS.find((x) => x.id === res.focusId);
      help.textContent = f ? planLabel(f, getLang()).desc : "";
    }
  };
  syncTakeoverPanel();
}

/** Reflect the sim's current focus + tempo in the takeover panel (status line + pressed tempo button). Called after any focus/tempo change and from syncPauseUI (every tick), so an expired focus clears itself. */
function syncTakeoverPanel() {
  const status = $("#takeover-status");
  if (!status && !$("#takeover-tempo-row")) return;
  const cur = createTacticalTakeover({ sim: state.sim }).current();
  const lang = getLang();
  const focus = cur.focusPlay ? FOCUS_PLAYS.find((f) => f.id === cur.focusPlay.id) : null;
  const tempo = getTempoDef(cur.tempo);
  if (status) {
    const text = `${L("当前：", "Now: ")}${focus ? planLabel(focus, lang).name : L("无重点", "No focus")} · ${planLabel(tempo, lang).name}`;
    if (status.textContent !== text) status.textContent = text;
  }
  document.querySelectorAll("#takeover-tempo-row [data-tempo]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.tempo === cur.tempo ? "true" : "false");
  });
  const focusSel = $("#takeover-focus-select");
  if (focusSel && document.activeElement !== focusSel) focusSel.value = cur.focusPlay?.id || "";
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
    const lang = getLang();
    focusSel.innerHTML =
      `<option value="">${L("（无重点）", "(No focus)")}</option>` +
      FOCUS_PLAYS.map((f) => {
        const lbl = planLabel(f, lang);
        return `<option value="${f.id}" title="${escAttr(lbl.desc)}">${esc(lbl.name)}</option>`;
      }).join("");
  }
  wireTakeoverPanel();
  const packBox = $("#live-packs");
  if (packBox) {
    packBox.innerHTML = LINEUP_PACK_DEFS.map(
      (d) =>
        `<button type="button" class="btn small" data-live-pack="${d.id}" title="${escAttr(d.hint)}">${esc(d.name)}</button>`
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
  syncPhilDefBand();
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
          <span>${esc(p.name)}<em class="tiny">本职 ${nat}</em></span>
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
      return `<option value="${p.id}">${p.playPos || p.pos} ${esc(p.name)}（${p.stats.pts}分 · ${tip}）</option>`;
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
  const names = { focus: "钉死他", double: "逼他出球", bump: "顶他下盘" };
  hint.textContent = t
    ? `${assignBit} · ${d ? d.name + " " : ""}对 ${t.name}「${names[plan.scheme] || plan.scheme}」· 手感${t.hotLabel}`
    : `${assignBit} · ${names[plan.scheme] || plan.scheme}`;
  syncDefendAdvice(snap);
}

/** 赛前/赛中建议行：复用 managedDefense 的判断（不含 40% 随机门），只建议不执行。 */
function syncDefendAdvice(snap) {
  const advice = $("#defend-advice");
  if (!advice || !snap) return;
  const you = snap.youSide === "home" ? snap.home : snap.away;
  const opp = snap.youSide === "home" ? snap.away : snap.home;
  const onCourt = opp?.onCourt || [];
  if (!onCourt.length) {
    advice.textContent = "";
    return;
  }
  const deficit = (snap.score?.[opp.side] ?? 0) - (snap.score?.[you.side] ?? 0);
  const { scheme, threat } = suggestDefenseScheme(onCourt, deficit);
  if (!threat) {
    advice.textContent = "";
    return;
  }
  const pts = threat.stats?.pts || 0;
  const en = getLang() === "en";
  if (scheme === "double") {
    advice.textContent = en
      ? `Advice: ${threat.name} has ${pts} pts — double him to force the ball out, but weak-side shooters will get open.`
      : `建议：对面 ${threat.name} 已得 ${pts} 分，逼他出球可打断他，但弱侧射手会空。`;
  } else if (scheme === "bump") {
    advice.textContent = en
      ? `Advice: ${threat.name} is a slim, tall post player — push him off his spot; nearly useless against bruising bigs.`
      : `建议：对面 ${threat.name} 是瘦高内线，顶他下盘可让他接不到舒服球。`;
  } else {
    advice.textContent = en
      ? `Advice: ${threat.name} is their hottest threat (${pts} pts) — locking him down is the safe call.`
      : `建议：对面 ${threat.name} 目前最热（${pts} 分），钉死他最稳。`;
  }
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
  // Back-button standard: the pause overlay's visible exit (save-first) is
  // only offered while paused — leaving a live game goes through pause first.
  const pauseLeaveBtn = $("#btn-pause-leave");
  if (pauseLeaveBtn) pauseLeaveBtn.hidden = !paused;
  if (hint) {
    hint.hidden = !paused;
    if (paused) {
      const labels = {
        timeout: L("暂停窗口——双方都可以调整。改完点「继续比赛」。", "Timeout: both sides can adjust. Press Resume Game when done."),
        quarter: L("节间休息——恢复 15 点疲劳。可调整战术、沟通、换人与站位。", "Quarter break: +15 fatigue recovered. Change tactics, talk, subs and positions."),
        half: L("中场休息——恢复 35 点疲劳。可调整战术与阵容。", "Halftime: +35 fatigue recovered. Change tactics and lineup."),
        manual: L("模拟已暂停——可调整后点「继续比赛」。", "Paused: make your changes, then press Resume Game."),
        injury: L("有人受伤——请立刻把伤员换下，再点「继续比赛」。", "Injury: sub the injured player out, then press Resume Game."),
        event: L("比赛事件——在事件卡里做个决定；直接点「继续比赛」就按默认处理。", "Match event: decide on the event card, or press Resume Game to take the default."),
      };
      hint.textContent = labels[reason] || L("死球窗口——可调整后点「继续比赛」。", "Dead ball: make your changes, then press Resume Game.");
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
  syncTakeoverPanel();
  coachDrawer.setPaused(paused);
  const pauseSim = $("#btn-pause-sim");
  if (pauseSim) {
    pauseSim.textContent = paused ? L("继续模拟", "Resume") : L("暂停模拟", "Pause");
    // Paused: #btn-resume is the one way back in, so the toggle would just be a second "resume" next to it.
    // Keyboard Back still calls .click() on it, which works while hidden.
    pauseSim.hidden = paused;
  }
  const saveLeave = $("#btn-save-leave");
  if (saveLeave) saveLeave.hidden = paused; // the pause row has its own 保存并离开
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
  $("#pos-live-list")?.querySelectorAll("select").forEach((s) => {
    s.disabled = !dead;
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
  if (state.sim.isAutopilotOn()) {
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
};
$("#btn-set-tempo")?.addEventListener("click", () => {
  if (!state.sim?.paused) {
    pushFeed("coach", "活球中不能改节奏——请先叫暂停或等到节间");
    return;
  }
  const id = normalizeTempo($("#tempo-select")?.value);
  state.sim.setTempo(id);
  syncTempoHelp($("#tempo-help"), id);
  syncTakeoverPanel();
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
  if (help && f) help.textContent = planLabel(f, getLang()).desc;
  syncTakeoverPanel();
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
    if (id === "live-phil-def") syncPhilDefBand();
  });
});

/** 全队压迫刻度带（0–5 省体力 / 6–10 常规 / 11–14 紧 / 15–18 高压，各附一行代价）。 */
function philDefBand(v) {
  const n = Number(v);
  if (n <= 5)
    return getLang() === "en"
      ? "Save energy · lightest pressure, least fatigue cost"
      : "省体力 · 压迫最轻，体力消耗最小";
  if (n <= 10)
    return getLang() === "en"
      ? "Normal · regular pressure, regular fatigue cost"
      : "常规 · 常规压迫，体力消耗正常";
  if (n <= 14)
    return getLang() === "en"
      ? "Tight · noticeably more pressure, faster fatigue"
      : "紧 · 压迫明显，体力消耗加快";
  return getLang() === "en"
    ? "Full press · heaviest pressure, fastest fatigue burn"
    : "高压 · 全场紧逼，体力烧得最快";
}

function syncPhilDefBand() {
  const band = $("#live-phil-def-band");
  const input = $("#live-phil-def");
  if (band && input) band.textContent = philDefBand(input.value);
}

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
$("#gp-scheme")?.addEventListener("change", syncGpSchemeHint);
$("#btn-defend-focus")?.addEventListener("click", () => applyDefenseScheme("focus"));
$("#btn-defend-double")?.addEventListener("click", () => applyDefenseScheme("double"));
$("#btn-defend-bump")?.addEventListener("click", () => applyDefenseScheme("bump"));
$("#btn-defend-clear")?.addEventListener("click", () => applyDefenseScheme(null));
// Broadcast layout: the full coach panel opens by itself in dead-ball windows (syncPauseUI) and by hand during live play.
const coachDrawer = createCoachDrawer({
  panel: document.querySelector("#screen-game .coach-panel"),
  button: $("#btn-coach-drawer"),
  getLang,
  onOpenChange: (open) => {
    if (!open || !state.sim) return;
    const snap = state.sim.snapshot();
    paintMeters(snap);
  },
});
// Coach bench: simple / advanced (B22). A device preference; the dropdown is rebuilt because <option hidden> does nothing on iOS Safari.
coachMode = createCoachMode({
  panel: document.querySelector("#screen-game .coach-panel"),
  button: $("#btn-coach-mode"),
  storage: globalThis.localStorage,
  getLang,
  onChange: () => {
    const team = state.sim?.you();
    if (team) fillTacticSelect(team);
  },
});
$("#btn-pause-sim").onclick = () => {
  if (!state.sim) return;
  if (state.sim.paused) resumeGame();
  else {
    state.sim.setPaused(true, "manual");
    state.sim.forceOutInjured(state.sim.you());
    state.sim.forceOutInjured(state.sim.opp());
    const snap = state.sim.snapshot();
    syncPauseUI(snap);
    paintLineups(snap);
    pushFeed("coach", L("模拟已暂停——可调整后点「继续比赛」恢复", "Paused: make your changes, then press Resume Game"));
  }
};
$("#btn-save-game")?.addEventListener("click", () => saveProgress());
/**
 * Back-button standard: the ONE game-exit path (save first, then home).
 * The pause overlay's 保存并离开 calls it directly — pausing is already the
 * deliberate step, and the save preserves the game for 继续进度. The bottom-row
 * #btn-save-leave keeps its confirm (it fires from live play) and then calls
 * the same function, so there are not two divergent exit paths.
 */
function exitGameToHome() {
  if (!state.sim) return;
  // Save FIRST: if the write fails the player stays on the game screen, so the 3D view and court must still be alive.
  if (!saveProgress({ andGoHome: true })) return;
  match3d.stop();
  state.court?.destroy?.();
  state.court = null;
}
$("#btn-pause-leave")?.addEventListener("click", () => exitGameToHome());
$("#btn-save-leave")?.addEventListener("click", async () => {
  if (!state.sim) return;
  if (await confirmAction(L("保存当前比赛并返回首页？回来可在「继续进度」接着打。", "Save the current match and return home? You can resume it from “Continue progress”. "))) {
    exitGameToHome();
  }
});
$("#btn-save-draft")?.addEventListener("click", () => saveProgress());
$("#btn-save-setup")?.addEventListener("click", () => saveProgress());
$("#btn-save-legend")?.addEventListener("click", () => saveProgress());
$("#btn-save-market")?.addEventListener("click", () => saveProgress());
$("#btn-continue-save")?.addEventListener("click", () => continueFromSave());
$("#btn-clear-save")?.addEventListener("click", async () => {
  if (!hasSave()) return;
  if (await blockedByForeignSave("session", { release: true })) return; // never another player's unfinished game
  if (await confirmAction(L("确定丢弃已保存的进度？此操作无法撤销。", "Discard the saved progress? This can't be undone."))) {
    clearSave({ release: true }); // confirmed: an unlinked unfinished game may go
    refreshSaveHomeBar();
  }
});
/** B50 leftovers: the "latest finished" line jumps to My World, where the full History list lives. */
$("#btn-view-latest-archive")?.addEventListener("click", () => {
  activateHomeTab?.("world");
  $("#my-world-root")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  if (speedLocked(state.mode, currentTournamentMatch())) return;
  state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
  state.sim.setSpeed(state.speed);
  $("#btn-speed").textContent = speedButtonText(state.speed);
};

/** "化学反应 68 · 士气 66 · 适配 95" in the current language. */
function chemLine(team) {
  return `${L("化学反应", "Chem")} ${team.chem} · ${L("士气", "Morale")} ${meterText(team.morale)} · ${L("适配", "Fit")} ${team.fit}`;
}

/** lineupBallNote() (data/intangibles.js) only speaks Chinese; translate its two shapes for English. */
function ballNoteL(note) {
  if (!note || getLang() !== "en") return note;
  if (note === "缺少持球发起点") return "No primary ball handler";
  let m = /^持球核 (.+) \+ (\d+) 名无球点$/.exec(note);
  if (m) return `Ball handler ${m[1]} + ${m[2]} off-ball spacers`;
  m = /^指定持球：(.+) · (.+) 无球配合$/.exec(note);
  if (m) return `Set handler: ${m[1]} · ${m[2]} off the ball`;
  m = /^双核分工：(.+) 持球 · (.+) 无球$/.exec(note);
  if (m) return `Two creators: ${m[1]} on the ball · ${m[2]} off it`;
  m = /^持球冲突：(.+)$/.exec(note);
  if (m) return `Ball-handler clash: ${m[1]}`;
  m = /^无球偏弱：(.+)（可共存，火力略削）$/.exec(note);
  if (m) return `Weak off the ball: ${m[1]} (workable, a bit less firepower)`;
  m = /^指定持球：(.+)$/.exec(note);
  return m ? `Set handler: ${m[1]}` : note;
}

function speedButtonText(speed) {
  const label = speed === 1 ? L("真实", "Real time") : speed === 2 ? L("加速", "Fast") : L("最快", "Fastest");
  return `${L("速度", "Speed")} x${speed} · ${label}`;
}

const AUTOPILOT_BUTTONS = [
  { btn: "#btn-auto-offense", stateKey: "autoOffense", setter: "setAutoOffense", label: "进攻托管" },
  { btn: "#btn-auto-defense", stateKey: "autoDefense", setter: "setAutoDefense", label: "防守托管" },
  { btn: "#btn-auto-rotation", stateKey: "autoRotation", setter: "setAutoRotation", label: "自动轮换" },
];

function syncManagedUI() {
  const hint = $("#managed-hint");
  const onLabels = [];
  for (const { btn: sel, stateKey, label } of AUTOPILOT_BUTTONS) {
    const on = state.sim ? !!state.sim[stateKey] : !!state[stateKey];
    state[stateKey] = on;
    if (on) onLabels.push(label);
    const btn = $(sel);
    if (!btn) continue;
    btn.disabled = !state.sim;
    btn.textContent = `${label}：${on ? "开" : "关"}`;
    btn.classList.toggle("primary", on);
    btn.classList.toggle("ghost", !on);
  }
  if (hint) {
    hint.textContent = onLabels.length
      ? `已开：${onLabels.join(" / ")} · 节间中场自动继续 · 你点「叫暂停」会停住并由你指挥`
      : "三个托管均关：进攻、防守、换人均由你亲自指挥。可单独或组合开启，其中「自动轮换」只换人不改战术。";
  }
}

// 用 onclick 覆盖，避免脚本重复加载时叠多个 listener 导致「点关又弹开」
for (const { btn: sel, stateKey, setter } of AUTOPILOT_BUTTONS) {
  const el = $(sel);
  if (!el) continue;
  el.onclick = () => {
    if (!state.sim) {
      pushFeed("coach", "比赛开始后才能开关托管");
      return;
    }
    const next = !state.sim[stateKey];
    state.sim[setter](next);
    state[stateKey] = next;
    syncManagedUI();
    if (!next && state.sim.paused) {
      syncPauseUI(state.sim.snapshot());
      pushFeed("coach", "托管已关——可继续调整，或点「继续比赛」");
    }
  };
}

/** B27: three-tier auto-timeout picker, next to the autopilot switches. */
const TIMEOUT_TIER_BUTTONS = TIMEOUT_TIERS.map((tier) => ({
  btn: `#btn-tier-${tier}`,
  tier,
}));

function syncTimeoutTierUI() {
  const current = state.sim ? state.sim.timeoutTier || "balanced" : state.timeoutTier || "balanced";
  state.timeoutTier = current;
  for (const { btn: sel, tier } of TIMEOUT_TIER_BUTTONS) {
    const el = $(sel);
    if (!el) continue;
    const active = tier === current;
    el.disabled = !state.sim;
    el.textContent = L(TIMEOUT_TIER_LABELS[tier].zh, TIMEOUT_TIER_LABELS[tier].en);
    el.classList.toggle("primary", active);
    el.classList.toggle("ghost", !active);
  }
}

for (const { btn: sel, tier } of TIMEOUT_TIER_BUTTONS) {
  const el = $(sel);
  if (!el) continue;
  el.onclick = () => {
    if (!state.sim) {
      pushFeed("coach", L("比赛开始后才能切换暂停策略", "Timeout strategy can only change once the game starts"));
      return;
    }
    state.sim.setTimeoutTier(tier);
    state.timeoutTier = state.sim.timeoutTier;
    syncTimeoutTierUI();
  };
}

/** Instant-sim the rest of the live game with auto rotation on both sides. */
$("#btn-quick-sim").onclick = async () => {
  const sim = state.sim;
  if (!sim || !sim.running) return;
  const anyOn = sim.isAutopilotOn();
  const ok = await confirmAction(L(
    "将用当前阵容、战术与指令立刻打完剩余比赛。\n" +
      (anyOn
        ? "已开的托管会继续自动处理。\n"
        : "将临时全开托管（进攻/防守/换人）以自动轮换疲劳球员。\n") +
      "期间无法再手动干预。确定？",
    "Finish the rest of this game instantly with the current lineup, tactics and instructions.\n" +
      (anyOn
        ? "Autopilot already on will keep handling things.\n"
        : "Autopilot (offense, defense and rotation) will be temporarily turned on to rotate tired players.\n") +
      "You won't be able to intervene manually. Confirm?",
  ), { title: L("快速模拟整场？", "Quick-sim the rest of the game?") });
  if (!ok) return;
  const btn = $("#btn-quick-sim");
  if (btn) btn.disabled = true;
  // Quiet sim still benefits from manager logic if enabled
  if (!anyOn) {
    sim.setAutoOffense(true);
    sim.setAutoDefense(true);
    sim.setAutoRotation(true);
    state.autoOffense = true;
    state.autoDefense = true;
    state.autoRotation = true;
    syncManagedUI();
    pushFeed("coach", "快速模拟已临时全开托管");
  }
  pushFeed("coach", "快速模拟整场——托管助手接管剩余比赛…");
  try {
    state.matchEvents?.autoResolvePending();
    match3d.syncNow(); // fast simulation: drop the animation backlog, the screen jumps to the latest authoritative state
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
  // Season-only extras: every mode shares this screen, so each call starts from "hidden" and the season flow opts in.
  for (const sel of ["#btn-result-play-next", "#btn-result-sim5", "#btn-result-sim-season"]) {
    const extra = $(sel);
    if (extra) extra.hidden = true;
  }
  again.hidden = false;
  again.textContent = L("再来一局", "Play Again");
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
    summary = summarizeMatchResult(snap, { lang: getLang(), teamName: (n) => teamNameL(n) });
  } catch {
    box.hidden = true;
    return;
  }
  const pctText = (value) => `${(value * 100).toFixed(0)}%`;
  const sideLabel = (side) => esc(teamNameL(side === "home" ? snap.home.name : snap.away.name));
  const rows = ["home", "away"].map((side) => {
    const totals = summary.teamTotals[side];
    const shoot = summary.shooting[side];
    const top = summary.topPerformers[side];
    const pm = summary.plusMinus[side];
    return `<div class="result-explain-team">
      <strong>${sideLabel(side)}</strong>
      <span>${L("命中率", "FG")} ${pctText(shoot.fg)} · ${L("三分", "3PT")} ${pctText(shoot.tp)} · ${L("罚球", "FT")} ${pctText(shoot.ft)}</span>
      <span>${L("失误", "TOV")} ${totals.tov} · ${L("前场篮板", "OREB")} ${totals.oreb}</span>
      ${top ? `<span>${L("最佳表现", "Top performer")}: ${esc(top.name)} ${L(`（${top.pts}分 ${top.reb}板 ${top.ast}助攻）`, `(${top.pts} pts ${top.reb} reb ${top.ast} ast)`)}</span>` : ""}
      ${pm.best ? `<span>${L("+/- 最高", "Best +/-")}: ${esc(pm.best.name)} ${pm.best.pm >= 0 ? "+" : ""}${pm.best.pm}</span>` : ""}
    </div>`;
  }).join("");
  const factors = summary.factors.length
    ? `<ul>${summary.factors.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
    : `<p class="tiny">${L("比赛各项数据较为接近，胜负更多取决于关键回合的质量。", "The numbers were close; the game came down to the big possessions.")}</p>`;
  box.innerHTML = `<h3>${L("赛后解析", "Why it went this way")}</h3><div class="result-explain-grid">${rows}</div>${factors}`;
  box.hidden = false;
}

function showResult(snap, { formNotes = [] } = {}) {
  match3d.stop();
  show("result");
  const hs = snap.score.home;
  const as = snap.score.away;
  $("#result-score").textContent = `${hs} - ${as}`;
  const youSide = snap.youSide;
  const youScore = youSide === "home" ? hs : as;
  const oppScore = youSide === "home" ? as : hs;
  const youWin = youScore > oppScore;
  // M4-B: a finished Hometown Challenge is recorded against the city that
  // was represented in this game (snapshot; later edits do not rewrite it).
  if (state.hometownChallenge) {
    recordChallengeResult(activeAccount(), { won: youWin, representedCity: state.hometownChallenge.representedCity });
    state.hometownChallenge = null;
  }
  audio.outcome(youWin);
  const winner = hs === as ? L("平局", "Tie") : teamNameL(hs > as ? snap.home.name : snap.away.name);
  $("#result-title").textContent = hs === as ? L("加时仍平——以模拟终局计", "Still tied after OT — decided by sim") : L(`${winner} 获胜`, `${winner} wins`);
  // The per-player form notes are engine-built Chinese lines; English shows the count instead of mixing languages.
  const formBit = formNotes?.length
    ? L(
        `本场表现已写入自信/战术地位：${formNotes.slice(0, 3).join("；")}${formNotes.length > 3 ? "…" : ""}`,
        `This game's form carries over: ${formNotes.length} player${formNotes.length > 1 ? "s" : ""} changed confidence / role.`,
      )
    : L("本场表现会带入下一场：打得好更敢投、队友更愿意喂球。", "Form carries into the next game: hot players shoot more and get fed more.");
  $("#result-summary").textContent = `${L("化学反应 / 适配度 / 暗属性影响了回合效率。", "Chemistry, fit and hidden traits shaped every possession. ")}${formBit}`;
  renderResultExplain(snap);
  $("#result-rewards").hidden = true; // season modes repaint it in wireSeasonResultContinue
  renderResultAllTeam(null);
  $("#box-score").innerHTML = `${boxTable(snap.home)}${boxTable(snap.away)}`;

  const cont = $("#btn-result-continue");
  cont.hidden = true;
  // Every entry to the result screen starts from a clean baseline — branches below may hide
  // this again when #btn-result-continue is ALSO doing "go home" (see handleCareerResult),
  // otherwise you'd see two buttons both saying 回主页 at once.
  // Back-button standard: origin-aware back — season center for season games,
  // market for career/duel games, home otherwise. Branches below may still
  // override/hide it (champion/eliminated); see resolveResultBack.
  const resultOrigin = resolveResultBack({
    isSeason: isSeasonProgressMode(state.mode) && !!state.season && !!state.seasonPendingGame,
    isCareer: state.career?.kind === "career" || state.career?.kind === "duel",
  });
  const homeBtnReset = $("#btn-home");
  if (homeBtnReset) {
    homeBtnReset.hidden = false;
    homeBtnReset.textContent =
      resultOrigin === "season"
        ? L("回赛季主页", "Back to Season Hub")
        : resultOrigin === "market"
          ? L("回市场", "Back to Market")
          : L("回主页", "Home");
    homeBtnReset.onclick = () => show(resultOrigin);
  }
  setResultActionMode("quick");

  if (isSeasonProgressMode(state.mode) && state.season && state.seasonPendingGame) {
    handleSeasonResult(snap);
    return;
  }
  if (isSeasonProgressMode(state.mode) && state.season && state.seasonPendingPlayoffGame) {
    handleSeasonPlayoffResult(snap);
    return;
  }
  if (state.tournament) {
    setResultActionMode("tournament", { showContinue: true, continuePrimary: true });
    applyTournamentResult(snap);
    return;
  }
  if (state.career?.kind === "ranked") {
    handleRankedResult(youWin, snap);
    return;
  }
  if (state.career?.kind === "career") {
    handleCareerResult(youWin, snap);
    return;
  }
  if (state.career?.kind === "duel") {
    archiveFinishedDuel(state.career, snap);
    setResultActionMode("duel", { showContinue: true, continuePrimary: true });
    cont.hidden = false;
    cont.textContent = "备战再战";
    cont.onclick = () => {
      // reward both lightly; winner more
      state.career.goldA += youSide === "home" ? (youWin ? 350 : 120) : youWin ? 120 : 350;
      state.career.goldB += youSide === "away" ? (youWin ? 350 : 120) : youWin ? 120 : 350;
      openMarket({ duel: true, afterWin: true });
    };
    return;
  }
  // Safety net for user report #10 ("没有继续按钮，只能回主页"): every known game type above either
  // handles its own continue button or returns early. If we ever reach here while the player is
  // mid leagueCareer (franchise or time-travel) through some game-starting path none of the
  // branches above recognize, falling all the way through used to leave 回主页 as the ONLY option
  // -- silently stranding the player instead of taking them back into their career. Always wire a
  // safe continue back into the career/season hub instead of doing nothing.
  if (state.leagueCareer) {
    setResultActionMode("season", { showContinue: true, continuePrimary: true });
    cont.hidden = false;
    cont.textContent = "继续";
    cont.onclick = () => {
      state.mode = state.leagueCareer?.kind === "timeTravel" ? "timeTravel" : "season";
      renderSeasonHub();
      show("season");
    };
  }

  // Account Level: single games pay on completion, win or lose — Quick Play
  // +25, Playground (sandbox) +15. Season / ranked / career / tournament /
  // duel games returned through their own branches above; a game played
  // mid-leagueCareer is a career game, not a quick game.
  if (!state.leagueCareer && (state.mode === "quick" || state.mode === "sandbox")) {
    const kind = state.mode === "sandbox" ? "playground" : "quick";
    const axp = awardAccountXp(activeAccount(), XP_TABLE[kind], { source: kind });
    if (axp.gained) {
      const summary = $("#result-summary");
      if (summary) summary.textContent += ` ${xpGainNote(axp, getLang())}`;
      celebrateAccountLevelUp(axp.levelBefore, axp.levelAfter);
    }
  }
}

// —— Season mode (82 + playoffs + awards) ——
/** @type {'modern'|'historical'} */
let seasonSetupMode = "modern";
let seasonSetupYear = 1991;
let seasonSetupKind = "season";

function syncSeasonScreenTitle() {
  const title = $("#season-screen-title");
  if (!title) return;
  title.textContent = $("#season-setup-panel")?.hidden
    ? L("常规赛征程", "Regular Season Journey")
    : seasonSetupKind === "franchise"
      ? L("联盟经理 · 王朝生涯", "League Manager · Dynasty Career")
      : L("联盟经理 · 单赛季", "League Manager · Single Season");
}

function syncCareerLengthUi() {
  syncSeasonScreenTitle();
  for (const btn of document.querySelectorAll("[data-career-length]")) {
    const on = btn.dataset.careerLength === seasonSetupKind;
    btn.classList.toggle("primary", on);
    btn.setAttribute("aria-pressed", String(on));
  }
}

function syncSeasonModeUi() {
  syncCareerLengthUi();
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

/**
 * Where a season to continue lives. In this tab's memory or under the legacy key while you are playing; after
 * any reload only in the root save, because the first start migrates the legacy key into it and deletes the key.
 * Looking only at the legacy key made "继续已有赛季" vanish after every reload.
 * @returns {{ live?: object, root?: object }}
 */
function savedSeasonSource() {
  if (careerHidden()) return {};
  const live = state.season || (seasonHidden() ? null : loadSeason());
  if (live) return { live };
  const root = currentCareerRoot();
  return root?.leagueCareer?.season ? { root } : {};
}

function openSeasonScreen() {
  show("season");
  ensureSeasonYearSelect();
  syncSeasonModeUi();
  syncSeasonStartButtonLabel();
  const { live, root } = savedSeasonSource();
  const existing = live || root?.leagueCareer.season;
  const resumeBtn = $("#btn-season-resume");
  // A finished season in memory has nothing to continue. One in the root save may be a career between
  // seasons (draft, offseason), and resumeLongCareer knows how to pick up every phase of that.
  if (existing && (root || existing.phase !== "done")) {
    if (live) state.season = live;
    if (resumeBtn) {
      resumeBtn.hidden = false;
      resumeBtn.textContent = L(`继续：${seasonProgressLabel(existing, getLang())}`, `Resume: ${seasonProgressLabel(existing, getLang())}`);
    }
  } else if (resumeBtn) {
    resumeBtn.hidden = true;
  }
  $("#season-setup-panel").hidden = false;
  $("#season-hub-panel").hidden = true;
  syncSeasonScreenTitle(); // the setup/hub flip above decides which title applies
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
        `<div class="chip">${p.pos || ""} ${esc(p.name)}<div class="tiny">OVR ${overall(p)} · ${p.season}</div></div>`
    )
    .join("");
  hint.textContent = `已选 ${team.players.length} 人 · 教练 ${team.coach?.name || "—"}`;
  $("#btn-season-start").disabled = team.players.length < 8;
}

// Hub dark stage: a club's primary colour for the standings dot and the
// next-match hero accents. Unknown codes (defunct/merged rows) fall back to
// grey; colours come from the data file, never from user input.
function hubTeamHex(team) {
  const code = teamCodeOf(team);
  const c = code ? teamColors(code) : null;
  return c?.primary || "#8a938c";
}

/**
 * C6: the goals for the user's next game, under the matchup line. Only while there really is a game
 * to play in a managed career; drawing them here is what makes the hub's promise the one that gets judged.
 */
function paintNextGoals(st) {
  const box = $("#season-next-goals");
  if (!box) return;
  const hasGame = isManagedCareer(state.leagueCareer)
    && (st.phase === "regular" ? Boolean(nextUserGame(st)) : st.phase === "playoffs" && Boolean(nextUserPlayoffGame(st)));
  box.innerHTML = hasGame
    ? pregameCardHtml({ goals: goalsForNextGame(st, st.teams[st.userTeamId]?.players || []), lang: getLang() })
    : "";
  box.hidden = !hasGame;
}

// v4: opponent scouting + counter-plans under the next-game card. Applying is the only write, via the normal season save.
const matchupScout = createMatchupController({
  box: $("#season-next-scout"),
  getLang,
  allow: () => careerOperationAllowed("setRotation"),
  commit: (st) => saveSeasonAndCareer(st),
});
matchupScout.bind(() => state.season);

function renderSeasonHub({ persist = true } = {}) {
  const st = prepareSeasonState(state.season);
  if (!st) return;
  state.season = st;
  syncCoachPerksToSeason(st);
  $("#season-setup-panel").hidden = true;
  $("#season-hub-panel").hidden = false;
  syncSeasonScreenTitle();
  const you = st.teams[st.userTeamId];
  const pay = payrollSummary(you);
  const heading = hubHeading(st, { you, pay, lang: getLang() });
  $("#season-hub-title").textContent = heading.title;
  // R111：同一串信息拆成 pill（DOM 拼装，不走 innerHTML，队名原样当文本），只改外观。
  const metaEl = $("#season-hub-meta");
  metaEl.replaceChildren();
  for (const part of heading.metaParts) {
    const pill = document.createElement("span");
    pill.className = "hub-meta-pill";
    pill.textContent = part;
    metaEl.appendChild(pill);
  }

  const nextCard = $("#season-next-card");
  const nextEl = $("#season-next-match");
  // advanceToUserGame moves the schedule on to the user's turn (it mutates the season), so the lookup stays here; the view only words it.
  // The card is decided by the phase as it was BEFORE that advance (a finished regular season is moved on to "awards" by it).
  const hubPhase = st.phase;
  let nextInfo = null;
  if (hubPhase === "regular") {
    advanceToUserGame(st, { stopBeforeUser: true });
    nextInfo = nextUserGame(st);
  } else if (hubPhase === "playoffs") {
    nextInfo = nextUserPlayoffGame(st);
  }
  const card = nextCardView(st, { phase: hubPhase, info: nextInfo, managed: isManagedCareer(state.leagueCareer) }, { hubTeamHex, playoffSeriesLabel });
  if (card) {
    nextCard.hidden = false;
    if (card.html != null) nextEl.innerHTML = card.html;
    else nextEl.textContent = card.text;
    $("#btn-season-play").disabled = card.play;
    $("#btn-season-sim-one").disabled = card.simOne;
    $("#btn-season-sim-week").disabled = card.simWeek;
  }

  // B59: once the season is over there is no next game — the three action buttons are
  // dead (they were only disabled); hide them instead. The done text already points at
  // 「再来一季」/ the offseason, and re-rendering with a live phase un-hides them.
  const seasonDone = st.phase === "done";
  for (const id of ["#btn-season-play", "#btn-season-sim-one", "#btn-season-sim-week"]) {
    const b = $(id);
    if (b) b.hidden = seasonDone;
  }

  paintNextGoals(st);
  matchupScout.paintLater(st); // the 800-lineup analysis waits for an idle moment so the hub paints first
  renderSeasonStandings();
  renderSeasonRotation();
  renderSeasonMarket();
  renderSeasonEvaluation();
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
  // A My Team season is frozen at kickoff: the pages that change the roster are not offered.
  document.querySelectorAll(MYTEAM_LOCKED_TABS.map((t) => `[data-season-tab="${t}"]`).join(",")).forEach((button) => {
    if (st.myTeam) button.hidden = true;
    else if (!["draftBoard", "development", "history"].includes(button.dataset.seasonTab)) button.hidden = false;
  });
  const abandon = $("#btn-season-abandon");
  if (abandon) { // same button, honest label: it only ever removes what this season is
    if (st.myTeam) { abandon.dataset.myTeam = "1"; abandon.textContent = L("放弃我的赛季", "Abandon my season"); }
    else if (abandon.dataset.myTeam) { delete abandon.dataset.myTeam; abandon.textContent = L("删除当前生涯", "Delete current career"); }
  }
  paintMyTeamGoals(st);
  paintMyTeamDoneBar(st);
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
      async prepareDraft() {
        if (!isManagedCareer(state.leagueCareer) || !(await confirmAction(L("确认结束本赛季并进入休赛期选秀？", "End this season and enter the offseason draft?")))) return;
        try {
          const next = runCareerTransition(
            state.leagueCareer,
            prepareCareerOffseason,
          );
          commitManagedCareer(next, "draftBoard");
        } catch (error) {
          alert(error?.message || L("无法进入休赛期选秀", "Couldn't enter the offseason draft"));
        }
      },
      pickProspect(prospectId, options) {
        try {
          const next = runCareerTransition(
            state.leagueCareer,
            (working) =>
              reconcileDevelopmentPlans(
                // A coach suggests and the front office executes
                // (ADR-006 R4); the GM picks directly.
                canDo(working, "draft")
                  ? makeCareerDraftPick(working, prospectId, options)
                  : suggestCareerDraftPick(working, prospectId),
              ),
          );
          commitManagedCareer(next, "draftBoard");
        } catch (error) {
          alert(error?.message || L("无法完成这次选秀", "Couldn't finish this draft pick."));
        }
      },
      forfeitPick() {
        try {
          const next = runCareerTransition(
            state.leagueCareer,
            (working) =>
              reconcileDevelopmentPlans(
                // A coach forfeits by letting the front office decide
                // (suggest with no prospect); the GM forfeits directly.
                canDo(working, "draft")
                  ? forfeitCareerDraftPick(working)
                  : suggestCareerDraftPick(working, null),
              ),
          );
          commitManagedCareer(next, "draftBoard");
        } catch (error) {
          alert(error?.message || L("无法放弃此签", "Couldn't pass on this pick."));
        }
      },
      completeOffseason() {
        try {
          const completed = completeCareerOffseason(state.leagueCareer);
          if (!commitManagedCareer(completed.career, "standings")) return;
          const { resolvedGoal, nextGoal, settledReputation, prophecy, poachOffer, retirement: coachRetirement } = queueNextTimeTravelEvent() || {};
          // Account Level: completing a Reborn lifetime pays +800 once.
          // Keyed by career start year + retirement age + tier, so this
          // recap can never pay the same lifetime twice. Announced in the
          // recap alert itself (no second modal stacked on top of it).
          let lifetimeXp = null;
          if (coachRetirement) {
            const root = currentCareerRoot();
            const acc = getAccount(root?.profile?.accountId) || activeAccount();
            lifetimeXp = awardAccountXp(acc, XP_TABLE.rebornLifetime, {
              source: "rebornLifetime",
              key: `retirement:${root?.story?.startYear ?? "?"}:${coachRetirement.age}:${coachRetirement.tier}`,
            });
          }
          const enteredYear = completed.result?.year || state.season?.year;
          alert(offseasonRecap({ completed, resolvedGoal, nextGoal, settledReputation, prophecy, poachOffer, coachRetirement, lifetimeXp, enteredYear, lang: getLang() }));
        } catch (error) {
          alert(error?.message || L("无法开始新赛季", "Couldn't start the new season."));
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
          alert(error?.message || L("无法保存发展方案", "Couldn't save the development plan."));
        }
      },
      recommendPlans() {
        try {
          commitManagedCareer(
            recommendDevelopmentPlans(state.leagueCareer),
            "development",
          );
        } catch (error) {
          alert(error?.message || L("无法生成发展建议", "Couldn't build development suggestions."));
        }
      },
    },
  );
  renderCareerHistory($("#season-history"), { career, lang: getLang() });
}

function renderSeasonRotation() {
  const st = state.season;
  const box = $("#season-rotation");
  if (!st || !box) return;
  const you = st.teams[st.userTeamId];
  if (!you?.players?.length) {
    box.innerHTML = `<p class="tiny">${L("暂无阵容", "No roster yet")}</p>`;
    return;
  }
  ensureRoles(you.players);
  ensurePlayerOrders(you.players);
  if (!you.rotation) you.rotation = captureRotationPlan(you, you.starterIds);
  const lang = getLang();
  box.innerHTML = rotationBoardHtml(you, { lang, learnedOf: epiphanyLearned });

  box.querySelectorAll(".rot-row").forEach((row) => {
    const p = you.players.find((x) => x.id === row.dataset.id);
    if (!p) return;
    row.querySelector(".rot-start-cb").onchange = () => {
      const on = row.querySelector(".rot-start-cb").checked;
      const { ok, ids } = toggleStarter(you, p.id, on);
      if (!ok) {
        row.querySelector(".rot-start-cb").checked = false;
        alert(L("默认首发最多 5 人", "At most 5 default starters"));
        return;
      }
      you.starterIds = ids; // also drops anybody who has left the roster
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
  $("#btn-rot-save")?.addEventListener("click", async () => {
    // Setting the rotation is the coach's job (ADR-006 R4).
    if (!careerOperationAllowed("setRotation")) return;
    const marked = liveStarterIds(you);
    you.starterIds = marked; // only people still on the roster get saved
    if (marked.length && marked.length !== 5) {
      if (!(await confirmAction(L(`当前标记了 ${marked.length} 名首发（建议 5 人）。仍保存？`, `${marked.length} starters marked (5 recommended). Save anyway?`)))) return;
    }
    you.rotation = captureRotationPlan(you, you.starterIds);
    if (!saveSeasonAndCareer(st)) return;
    alert(L("默认轮换已保存。下场「亲自指挥」会自动套用首发/分钟/位置/核心。", "Default rotation saved. Your next called game will use these starters, minutes, positions and core."));
    renderSeasonRotation();
  });
}

/** Skills this player learned from play (C3 ledger of the managed career); [] when there is none. */
const epiphanyLearned = (p) => learnedSkillIds(state.leagueCareer?.management?.epiphany, p.bref);

function renderSeasonEvaluation() {
  const st = state.season;
  const box = $("#season-evaluation");
  if (!st || !box) return;
  const you = st.teams?.[st.userTeamId];
  const rows = buildRosterEvaluation(you?.players || [], st.playerSeason, {
    teamId: st.userTeamId,
    salaryOf: playerSalary,
    overallOf: overall,
    learnedOf: epiphanyLearned,
  });
  renderRosterEvaluation(box, rows);
  box.querySelectorAll('[data-eval-action="market"], [data-eval-action="cut"]').forEach((button) => {
    button.addEventListener("click", () => {
      showSeasonTab("market");
      setTimeout(() => {
        const target = $("#season-market");
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    });
  });
  box.querySelectorAll('[data-eval-action="compare"]').forEach((button) => {
    button.addEventListener("click", () => {
      const playerId = button.dataset.playerId;
      const panel = box.querySelector(`[data-compare-for="${playerId}"]`);
      if (!panel) return;
      if (!panel.hidden) {
        panel.hidden = true;
        return;
      }
      const comparison = buildTradeComparison(st, playerId, { salaryOf: playerSalary, overallOf: overall });
      panel.innerHTML = renderTradeComparisonHtml(comparison);
      panel.hidden = false;
    });
  });
}

/**
 * Career role gate for the season-hub operation buttons (ADR-006 R4).
 * True when the operation may run. When the current managed career's
 * role lacks the capability, it shows the reason and returns false.
 * Plain seasons and My Team have no career role, so they are never
 * gated here. The mode-layer functions enforce the same rule again at
 * the operation itself — this is the UI-side refusal, not the check.
 */
function careerOperationAllowed(capability) {
  if (!isManagedCareer(state.leagueCareer)) return true;
  if (canDo(state.leagueCareer, capability)) return true;
  alert(denyMessage(careerRole(state.leagueCareer, state.longCareerRoot), capability, getLang()));
  return false;
}

function renderSeasonMarket() {
  const st = state.season;
  const box = $("#season-market");
  if (!st || !box) return;
  prepareSeasonState(st);
  const you = st.teams[st.userTeamId];
  const pay = payrollSummary(you);
  const proposals = ensureTradeProposals(st, getLang());
  const locked = st.phase !== "regular";

  if (locked) {
    // B19: never render the raw phase id ("regular" etc.) into UI text.
    const phaseLabel = seasonPhaseLabel(st.phase, getLang());
    box.innerHTML = `<p class="tiny">${L(`自由市场 / 裁人 / 交易仅在<strong>常规赛</strong>期间开放。当前阶段：${phaseLabel}`, `Free agency, cuts and trades are open during the <strong>regular season</strong> only. Current phase: ${phaseLabel}`)}</p>`;
    return;
  }

  refreshStaffMarket(st);
  const hc = you.coach;
  const asst = you.assistant;
  box.innerHTML = marketHtml(st, { you, pay, proposals, managed: isManagedCareer(state.leagueCareer), learnedOf: epiphanyLearned });

  const tradeTid = () => $("#sm-trade-cpu")?.value;
  const tradeTid3 = () => $("#sm-trade-cpu3")?.value;
  const ticked = (sel) => [...box.querySelectorAll(sel)].map((el) => el.value);

  const updateTradeSummary = () => {
    const tid = tradeTid();
    const summary = $("#sm-trade-summary");
    if (!st.teams[tid] || !summary) return;
    summary.textContent = tradeSummaryText(st, you, tid, tradeTid3(), {
      givePlayers: ticked(".sm-give-player:checked"),
      wantPlayers: ticked(".sm-want-player:checked"),
      want3Players: ticked(".sm-want3-player:checked"),
      givePicks: ticked(".sm-give-pick:checked"),
      wantPicks: ticked(".sm-want-pick:checked"),
    });
  };

  const renderTradeCols = () => {
    const tid = tradeTid();
    const cols = $("#sm-trade-cols");
    if (!cols || !tid) return;
    cols.innerHTML = tradeColumnsHtml(st, you, tid, tradeTid3());
    cols.querySelectorAll("input[type=checkbox]").forEach((el) => el.addEventListener("change", updateTradeSummary));
    updateTradeSummary();
  };
  renderTradeCols();
  $("#sm-trade-cpu")?.addEventListener("change", renderTradeCols);
  $("#sm-trade-cpu3")?.addEventListener("change", renderTradeCols);

  box.querySelectorAll(".sm-list-pref").forEach((sel) => {
    sel.onchange = () => {
      const res = setListingPref(st, sel.dataset.listPref, sel.value, getLang());
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      // 换了出售倾向就重新询价，让报价立刻按新倾向来
      refreshTradeProposals(st, getLang());
      if (!saveSeasonAndCareer(st)) return;
      renderSeasonHub();
      showSeasonTab("market");
    };
  });
  box.querySelectorAll(".sm-list-trade").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.listTrade;
      const listed = new Set(listedPlayerIds(st)).has(id);
      const res = listed ? unlistPlayerForTrade(st, id) : listPlayerForTrade(st, id, getLang());
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      // 挂牌后刷新报价，让挂牌球员立刻进入报价池
      refreshTradeProposals(st, getLang());
      if (!saveSeasonAndCareer(st)) return;
      renderSeasonHub();
      showSeasonTab("market");
    };
  });
  box.querySelectorAll(".sm-cut").forEach((btn) => {
    btn.onclick = async () => {
      // Cutting a player is the GM's job (ADR-006 R4) — refuse before
      // the confirm dialog, not after it.
      if (!careerOperationAllowed("release")) return;
      const p = you.players.find((x) => x.id === btn.dataset.cut);
      if (!p || !(await confirmAction(L(`确定裁掉 ${p.name}（${formatSalary(playerSalary(p))}）？他将进入自由市场。`, `Cut ${p.name} (${formatSalary(playerSalary(p))})? He'll enter free agency.`)))) return;
      const res = cutPlayer(st, p.id, getLang(), { career: state.leagueCareer, root: state.longCareerRoot });
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
      // Signing a free agent is the GM's job (ADR-006 R4).
      if (!careerOperationAllowed("signFreeAgent")) return;
      const res = signFreeAgent(st, btn.dataset.sign, getLang(), { career: state.leagueCareer, root: state.longCareerRoot });
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
  $("#btn-sm-fire-coach")?.addEventListener("click", async () => {
    if (!(await confirmAction(L(`解聘主教练 ${hc?.name || ""}？他将回到应聘池。`, `Fire head coach ${hc?.name || ""}? He'll return to the applicant pool.`)))) return;
    const res = fireCoach(st, getLang());
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonHub();
    showSeasonTab("market");
  });
  $("#btn-sm-fire-asst")?.addEventListener("click", async () => {
    if (!(await confirmAction(L(`解聘助教 ${asst?.name || ""}？`, `Fire assistant ${asst?.name || ""}?`)))) return;
    const res = fireAssistant(st, getLang());
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
      const res = hireCoach(st, btn.dataset.hireCoach, getLang());
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
      const res = hireAssistant(st, btn.dataset.hireAsst, getLang());
      if (!res.ok) {
        alert(res.reason);
        return;
      }
      if (!saveSeasonAndCareer(st)) return;
      renderSeasonHub();
      showSeasonTab("market");
    };
  });
  $("#btn-refresh-proposals")?.addEventListener("click", () => {
    refreshTradeProposals(st, getLang());
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonHub();
    showSeasonTab("market");
  });
  box.querySelectorAll("[data-trade-proposal-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const proposalId = button.dataset.proposalId;
      const action = button.dataset.tradeProposalAction;
      const result = action === "accept"
        ? acceptTradeProposal(st, proposalId, getLang(), { career: state.leagueCareer, root: state.longCareerRoot })
        : action === "counter"
          ? counterTradeProposal(st, proposalId, getLang())
          : declineTradeProposal(st, proposalId, getLang());
      if (!result.ok) {
        alert(result.reason);
        return;
      }
      if (!saveSeasonAndCareer(st)) return;
      renderSeasonHub();
      showSeasonTab("market");
    });
  });
  $("#btn-sm-pick-swap")?.addEventListener("click", () => {
    // A pick swap is a trade (ADR-006 R4) — refuse before touching the ledger.
    if (!careerOperationAllowed("trade")) return;
    const cpuId = $("#sm-pick-cpu")?.value;
    const res = swapDraftPicks(st, { year: st.year, cpuTeamId: cpuId, lang: getLang(), career: state.leagueCareer, root: state.longCareerRoot });
    const hint = $("#sm-pick-hint");
    if (!res.ok) {
      if (hint) hint.textContent = res.reason;
      alert(res.reason);
      return;
    }
    if (hint) hint.textContent = res.message;
    if (!saveSeasonAndCareer(st)) return;
    renderSeasonHub();
    showSeasonTab("market");
  });
  $("#btn-sm-trade-recommend")?.addEventListener("click", () => {
    const tid = $("#sm-trade-cpu")?.value;
    const wantChecked = [...box.querySelectorAll(".sm-want-player:checked")];
    const hint = $("#sm-trade-hint");
    if ($("#sm-trade-cpu3")?.value) {
      if (hint) hint.textContent = L("推荐方案只支持双边交易，请先把第三方设为「不选」", "Recommendations only support two-team trades — set the third team to None first");
      return;
    }
    if (!tid || !wantChecked.length) {
      if (hint) hint.textContent = L("先勾选你想要的对方球员，再点「推荐方案」", "Tick an opponent player you want first, then hit Recommend");
      return;
    }
    const rec = recommendTradePackage(st, { cpuTeamId: tid, wantPlayerId: wantChecked[0].value, lang: getLang() });
    if (!rec.ok) {
      if (hint) hint.textContent = rec.reason;
      return;
    }
    box.querySelectorAll(".sm-give-player, .sm-give-pick").forEach((el) => {
      el.checked = rec.giveIds.includes(el.value) || rec.givePickIds.includes(el.value);
    });
    if (hint) hint.textContent = L(`推荐方案：${rec.note}`, `Recommended: ${rec.note}`);
    updateTradeSummary();
  });
  $("#btn-sm-trade")?.addEventListener("click", () => {
    // Executing a trade is the GM's job (ADR-006 R4) — a coach may only
    // use the recommend button to suggest a package.
    if (!careerOperationAllowed("trade")) return;
    const cpuId = $("#sm-trade-cpu")?.value;
    const cpu3Id = $("#sm-trade-cpu3")?.value;
    const checkedVals = (sel) => [...box.querySelectorAll(sel)].map((el) => el.value);
    const giveIds = checkedVals(".sm-give-player:checked");
    const wantIds = checkedVals(".sm-want-player:checked");
    const res = cpu3Id && cpu3Id !== cpuId
      ? executeThreeTeamTrade(st, {
          giveIds,
          team2Id: cpuId,
          team2PlayerIds: wantIds,
          team3Id: cpu3Id,
          team3PlayerIds: checkedVals(".sm-want3-player:checked"),
          lang: getLang(),
          career: state.leagueCareer,
          root: state.longCareerRoot,
        })
      : executeTrade(st, {
          giveIds,
          givePickIds: checkedVals(".sm-give-pick:checked"),
          wantIds,
          wantPickIds: checkedVals(".sm-want-pick:checked"),
          cpuTeamId: cpuId,
          lang: getLang(),
          career: state.leagueCareer,
          root: state.longCareerRoot,
        });
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
    ? `<table class="season-table"><thead><tr><th>${L("日", "Day")}</th><th>${L("对阵", "Matchup")}</th><th></th></tr></thead><tbody>${upcoming
        .map(
          (g) =>
            `<tr><td>${g.day + 1}</td><td>${g.home} vs ${g.away}</td><td>${
              g.homeGame ? L("主场", "Home") : L("客场", "Away")
            }</td></tr>`
        )
        .join("")}</tbody></table>`
    : `<p class="tiny">${L("暂无未打赛程（常规赛可能已结束）", "No games left (the regular season may be over)")}</p>`;

  const recentHtml = recent.length
    ? `<table class="season-table"><thead><tr><th>${L("日", "Day")}</th><th>${L("结果", "Result")}</th><th></th></tr></thead><tbody>${recent
        .map((r, i) => {
          const home = st.teams[r.homeId]?.name || r.homeId;
          const away = st.teams[r.awayId]?.name || r.awayId;
          const youHome = r.homeId === st.userTeamId;
          const youScore = youHome ? r.homeScore : r.awayScore;
          const oppScore = youHome ? r.awayScore : r.homeScore;
          const w = youScore > oppScore ? L("胜", "W") : L("负", "L");
          const canView = !!r.box;
          return `<tr data-result-idx="${i}">
            <td>${(r.day ?? 0) + 1}</td>
            <td>${w} ${home} ${r.homeScore}-${r.awayScore} ${away}</td>
            <td>${
              canView
                ? `<button type="button" class="btn small ghost btn-view-box">${L("球员数据", "Box score")}</button>`
                : `<span class="tiny">—</span>`
            }</td>
          </tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="tiny">${L("尚无已赛记录", "No games played yet")}</p>`;

  box.innerHTML = `
    <div class="sm-cols">
      <section>
        <h4>${L("即将进行（我方）", "Upcoming (yours)")}</h4>
        <p class="tiny">${L("打完/模拟一场后自动推进。自由市场操作不影响赛程顺序。", "Advances as you play or sim. Market moves don't change the order.")}</p>
        ${upHtml}
      </section>
      <section>
        <h4>${L("近期战果", "Recent results")}</h4>
        <p class="tiny">${L("点「球员数据」可查看该场双方得分与技术统计。", "Tap “Box score” for either side's points and stats.")}</p>
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
        alert(L("该场没有保存详细数据（可能是旧存档）。新模拟的比赛会保留球员数据。", "No detailed data saved for this game (maybe an old save). Newly simmed games keep box scores."));
        return;
      }
      showSeasonSimResult(snap, {
        summaryExtra: L(`回顾第 ${(entry.day ?? 0) + 1} 比赛日。`, `Looking back at day ${(entry.day ?? 0) + 1}.`),
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
    return `<div class="season-stand-card">
      <h4>${title}</h4>
      <table class="season-table">
        <thead><tr><th class="num rank">#</th><th>${L("球队", "Team")}</th><th class="num">${L("胜", "W")}</th><th class="num">${L("负", "L")}</th><th class="num">${L("胜率", "PCT")}</th><th class="num">${L("净胜", "Diff")}</th></tr></thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const you = r.id === st.userTeamId ? " you" : "";
              return `<tr class="${you}"><td class="num rank">${i + 1}</td><td class="team"><i class="stand-dot" style="background:${hubTeamHex(st.teams[r.id])}"></i>${esc(r.name)}</td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num">${(
                r.pct * 100
              ).toFixed(1)}%</td><td class="num">${r.diff > 0 ? "+" : ""}${r.diff}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  };
  box.innerHTML = table("East", L("东部", "East")) + table("West", L("西部", "West"));
}

function renderSeasonAwards() {
  const st = state.season;
  const box = $("#season-awards");
  if (!st || !box) return;
  const a = st.awards;
  if (!a) {
    box.innerHTML = `<p class="tiny">${L(`打完 ${seasonGames(st)} 场后自动评奖（MVP、DPOY、一阵二阵三阵、最佳第六人、最快进步、最佳新秀、最佳教练、得分王等）。奖项只是荣誉，不送技能。`, `Awards come automatically after ${seasonGames(st)} games (MVP, DPOY, All-NBA 1st/2nd/3rd, Sixth Man, MIP, ROY, Coach of the Year, scoring champ and more). Awards are honors only — no skills attached.`)}</p>`;
    return;
  }
  box.innerHTML = `
    ${seasonAwardsHtml(st, getLang())}
    <div class="btn-row" style="margin-top:8px">
      <button type="button" class="btn primary" id="btn-season-to-playoffs">${
        st.phase === "playoffs" || st.phase === "done" ? L("查看季后赛", "View playoffs") : L("进入季后赛", "Enter playoffs")
      }</button>
    </div>
  `;
  $("#btn-season-to-playoffs")?.addEventListener("click", () => {
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
    box.innerHTML = playoffsPromptHtml(st);
    $("#btn-season-sim-playoffs")?.addEventListener("click", () => {
      const batch = userGameBatch(st);
      if (!st.awards) {
        // Skipping ahead plays the user's remaining regular-season games too.
        for (const { game, snap } of advanceToUserGame(st, { stopBeforeUser: false }).played) batch.settle(snap, game);
      }
      simAllPlayoffs(st, { onUserGame: batch.settle });
      finishBulkPlayoffSim(st, batch);
    });
    return;
  }
  // The Finals awards are filled in once, here, the first time a finished season is drawn (the view only reads them).
  if (st.phase === "done" && !st.finalsAllTeam?.length) {
    computeFinalsAllTeam(st);
  }
  if (st.phase === "done" && !st.finalsMvp) {
    st.finalsMvp = computeFinalsMvp(st);
  }
  box.innerHTML = playoffsHtml(st, { managed: isManagedCareer(state.leagueCareer), hasDraft: !!currentCareerDraft });
  $("#btn-season-night-po")?.addEventListener("click", () => {
    const batch = userGameBatch(st);
    // One night: every open series plays its next game together. Nothing open (all decided) = roll to the next round.
    if (openSeries(st).length) simPlayoffDay(st, { onUserGame: batch.settle });
    else advancePlayoffs(st, { onUserGame: batch.settle });
    finishBulkPlayoffSim(st, batch);
  });
  $("#btn-season-advance-po")?.addEventListener("click", () => {
    const batch = userGameBatch(st);
    advancePlayoffs(st, { onUserGame: batch.settle });
    finishBulkPlayoffSim(st, batch);
  });
  $("#btn-season-sim-all-po")?.addEventListener("click", () => {
    const batch = userGameBatch(st);
    simAllPlayoffs(st, { onUserGame: batch.settle });
    finishBulkPlayoffSim(st, batch);
  });
  $("#btn-season-offseason")?.addEventListener("click", async () => {
    if (currentCareerDraft) {
      showSeasonTab("draftBoard");
      return;
    }
    if (
      !(await confirmAction(
        isManagedCareer(state.leagueCareer)
          ? L("确认结束本赛季并进入休赛期选秀？", "End this season and enter the offseason draft?")
          : L(`确认进入休赛期？\n全联盟球员按史实生涯成长/衰退，并按本季表现续约（打出来会更贵）。然后开启 ${
              Number(st.year) + 1
            } 赛季。`, `Enter the offseason?\nEvery player grows or declines on their real career curve and re-signs on this season's performance (breakouts cost more). Then the ${
              Number(st.year) + 1
            } season starts.`)
      ))
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
        recordChallengeProgress(activeAccount(), "leagueSeason");
      } catch (error) {
        alert(error?.message || L("无法进入休赛期选秀", "Couldn't enter the offseason draft"));
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
      alert(res.reason || L("无法进入休赛期", "Couldn't enter the offseason"));
      return;
    }
    const challengeGrant = recordChallengeProgress(
      activeAccount(),
      state.leagueCareer?.kind === "timeTravel" ? "timeTravelSeason" : "leagueSeason",
    );
    const highlights = (res.log || [])
      .filter((r) => r.delta > 0 || (r.salaryAfter || 0) > (r.salaryBefore || 0) + 10)
      .slice(0, 8);
    const tip = highlights.length
      ? highlights
          .map(
            (r) =>
              `${r.name} OVR ${r.before}→${r.after} · ¤${r.salaryBefore || 0}→¤${r.salaryAfter || 0}${
                r.renewal ? L(`（${r.renewal}）`, ` (${r.renewal})`) : ""
              }`
          )
          .join("\n")
      : L("本队本轮成长/涨薪幅度不大。", "Your team didn't grow or get much pricier this round.");
    if (!saveSeasonAndCareer(state.season)) return;
    const challengeNote = challengeGrant ? `\n\n${grantNote(challengeGrant, getLang())}` : "";
    alert(L(`已进入 ${res.year} 赛季。\n\n我方续约亮点：\n${tip}${challengeNote}`, `Entered the ${res.year} season.\n\nYour renewal highlights:\n${tip}${challengeNote}`));
    renderSeasonHub();
    showSeasonTab("standings");
  });
}

const MYTEAM_LOCKED_TABS = ["market", "evaluation", "draftBoard", "development", "history"];

function showSeasonTab(tab) {
  state.seasonTab = tab;
  if (state.season?.myTeam && MYTEAM_LOCKED_TABS.includes(tab)) tab = "standings";
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
    evaluation: $("#season-evaluation"),
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
  if (!st) return;
  // Calling a game yourself is the coach's job (ADR-006 R4) — a GM
  // watches or simulates (the season hub's sim buttons stay open).
  if (!careerOperationAllowed("commandGame")) return;
  if (st.phase === "playoffs") return playUserPlayoffGame();
  if (st.phase !== "regular") return;
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
  openSetup(cloneLiveTeamSide(home), cloneLiveTeamSide(away), youHome ? "home" : "away");
}

/** Deep-clones a season team into the plain blob openSetup()/GameSim expect, detached from
 * state.season so mid-game mutations (fatigue, form, etc.) don't leak back until the result is
 * recorded. Shared by playSeasonUserGame() and playUserPlayoffGame() -- same shape either way. */
function cloneLiveTeamSide(t) {
  const st = state.season;
  const teamId = st ? Object.keys(st.teams).find((id) => st.teams[id] === t) : null;
  return {
    teamId,
    staffBonus: teamId ? seasonStaffBonus(st, teamId) : null,
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
  };
}

/**
 * Playoffs used to be sim-only (快速模拟本场 / 一键打完季后赛), with 亲自指挥 unconditionally
 * disabled the moment the regular season ended -- a user could never personally play a single
 * playoff game. This mirrors playSeasonUserGame() one game at a time against the user's CURRENT
 * series (nextUserPlayoffGame() walks the 2-2-1-1-1 home/away pattern); round-to-round reseeding
 * remains advancePlayoffs()'s job once this series is done.
 */
function playUserPlayoffGame() {
  const st = state.season;
  if (!st || st.phase !== "playoffs") return;
  // Same gate as the regular-season entry above (ADR-006 R4).
  if (!careerOperationAllowed("commandGame")) return;
  const info = nextUserPlayoffGame(st);
  if (!info) {
    renderSeasonHub();
    showSeasonTab("playoffs");
    return;
  }
  const { series, homeId, awayId } = info;
  const game = { homeId, awayId, played: false, result: null };
  const youHome = homeId === st.userTeamId;
  const home = st.teams[homeId];
  const away = st.teams[awayId];
  ensureTeamStaff(home, { preferStarter: true, excludeIds: [away?.coach?.id, away?.assistant?.id] });
  ensureTeamStaff(away, { preferStarter: true, excludeIds: [home?.coach?.id, home?.assistant?.id] });
  state.seasonPendingPlayoffGame = { game, series };
  if (!saveSeasonAndCareer(st)) return;
  openSetup(cloneLiveTeamSide(home), cloneLiveTeamSide(away), youHome ? "home" : "away");
}

/**
 * Account Level for one PLAYED My Team Season game (+40, win or lose).
 * Called only inside the `!game.played` guard, so a re-render or a second
 * result pass cannot pay twice; bulk-simmed games never reach these handlers.
 * Classic seasons pay no per-game XP (not in the XP table).
 */
function awardMyTeamGameXp(st) {
  if (!st?.myTeam) return "";
  const acc = getAccount(st.myTeam.ownerAccountId) || activeAccount();
  const axp = awardAccountXp(acc, XP_TABLE.myTeamGame, { source: "myTeamGame" });
  if (!axp.gained) return "";
  celebrateAccountLevelUp(axp.levelBefore, axp.levelAfter);
  return xpGainNote(axp, getLang());
}

function handleSeasonResult(snap) {
  const st = state.season;
  const game = state.seasonPendingGame;
  let report = null;
  let axpNote = "";
  if (st && game && !game.played) {
    recordUserLiveResult(st, game, snap);
    report = settleUserGame(snap, snap?.youSide, { handPlayed: true });
    axpNote = awardMyTeamGameXp(st);
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
      wireSeasonResultContinue(state.season, snap, { reports: report && [report], summaryExtra: axpNote });
      return;
    }
  }
  wireSeasonResultContinue(st, snap, { reports: report && [report], summaryExtra: axpNote });
}

/** Playoff counterpart of handleSeasonResult() -- same fatigue/form bookkeeping, but the
 * win/loss goes onto the pending series (recordUserLivePlayoffResult) instead of st.schedule. */
function handleSeasonPlayoffResult(snap) {
  const st = state.season;
  const pending = state.seasonPendingPlayoffGame;
  let report = null;
  let axpNote = "";
  if (st && pending?.game && !pending.game.played) {
    recordUserLivePlayoffResult(st, pending.game, pending.series, snap);
    report = settleUserGame(snap, snap?.youSide, { handPlayed: true });
    axpNote = awardMyTeamGameXp(st);
  }
  state.seasonPendingPlayoffGame = null;
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
      wireSeasonResultContinue(state.season, snap, { playoffSeries: pending?.series, reports: report && [report], summaryExtra: axpNote });
      return;
    }
  }
  wireSeasonResultContinue(st, snap, { playoffSeries: pending?.series, reports: report && [report], summaryExtra: axpNote });
}

/** Paint score + both-team box scores (instant sim or re-open from schedule). */
function showSeasonSimResult(snap, { summaryExtra = "", viewingHistory = false, playoffSeries = null, reports = null, games = null, selected = null } = {}) {
  if (!snap?.home || !snap?.away) return;
  const st = state.season;
  // A simulated stretch keeps every game's box score so the player can open any of them; anything else clears it.
  state.resultBatch = games?.length > 1 ? { games, reports, selected } : null;
  show("result");
  const hs = snap.score?.home ?? 0;
  const as = snap.score?.away ?? 0;
  $("#result-score").textContent = `${hs} - ${as}`;
  const youSide = snap.youSide === "away" ? "away" : "home";
  const youScore = youSide === "home" ? hs : as;
  const oppScore = youSide === "home" ? as : hs;
  const winner = hs === as ? L("平局", "Tie") : hs > as ? snap.home.name : snap.away.name;
  const youWin = youScore > oppScore;
  $("#result-title").textContent =
    hs === as
      ? L("加时仍平——以模拟终局计", "Still tied after OT — decided by sim")
      : viewingHistory
        ? L(`${winner} 获胜`, `${winner} wins`)
        : L(`${winner} 获胜 · ${youWin ? "我方胜" : "我方负"}`, `${winner} wins · ${youWin ? "You win" : "You lose"}`);
  $("#box-score").innerHTML = `${boxTable(snap.home)}${boxTable(snap.away)}`;
  // The analysis panel belongs to THIS game: without this it kept the last live game's numbers (a different opponent).
  renderResultExplain(snap);
  wireSeasonResultContinue(st, snap, { summaryExtra, viewingHistory, playoffSeries, reports, selected });
}

/** "东部 · R2"/"总决赛" 样式标签，跟 renderSeasonPlayoffs() 的 confBlock 标题保持一致。 */
function playoffSeriesLabel(st, series) {
  const po = st?.playoffs;
  if (series === po?.finals) return L("总决赛", "Finals");
  if (po?.east?.series?.includes(series)) return L(`东部 · R${series.round}`, `East · R${series.round}`);
  if (po?.west?.series?.includes(series)) return L(`西部 · R${series.round}`, `West · R${series.round}`);
  return L("季后赛", "Playoffs");
}

/** Playoff-flavored #result-summary text: series score if still going, outcome if just decided. */
function playoffResultSummaryText(st, series) {
  const label = playoffSeriesLabel(st, series);
  const youAreHigh = series.high?.id === st.userTeamId;
  const myWins = youAreHigh ? series.winsHigh : series.winsLow;
  const theirWins = youAreHigh ? series.winsLow : series.winsHigh;
  const oppName = (youAreHigh ? series.low : series.high)?.name || L("对手", "Opponent");
  if (!series.done) return L(`${label} 战至 ${myWins}-${theirWins}，可继续比赛。`, `${label} tied ${myWins}-${theirWins} — still to play.`);
  if (series.winnerId !== st.userTeamId) {
    return L(`${label} ${theirWins}-${myWins} 不敌 ${oppName}，本届季后赛到此结束。`, `${label} lost ${theirWins}-${myWins} to ${oppName} — this playoff run is over.`);
  }
  return st.phase === "done"
    ? L(`${label} ${myWins}-${theirWins} 淘汰 ${oppName}，夺得总冠军！可进入休赛期。`, `${label} beat ${oppName} ${myWins}-${theirWins} — champions! Head to the offseason.`)
    : L(`${label} ${myWins}-${theirWins} 淘汰 ${oppName}，晋级下一轮！`, `${label} beat ${oppName} ${myWins}-${theirWins} — on to the next round!`);
}

/**
 * C1: the settlement card under the explain box. `reports` are games that were ALREADY settled (and
 * paid) when they finished: one is a game card, several fold into a stretch card. With none (re-opening
 * an old game from the schedule) the card is only re-derived from the box score -- viewing a game must
 * never pay its XP a second time.
 */
function renderPostGame(snap, reports = null, selected = null) {
  const box = $("#result-rewards");
  if (!box) return;
  const lang = getLang();
  const html = reports?.length > 1
    ? batchHtml(foldBatch(reports), lang, { selected })
    : postGameHtml(reports?.[0] || settleGame(snap, snap?.youSide), lang);
  box.innerHTML = html;
  box.hidden = !html;
}

/** Which side the user is on in a scheduled game. */
const userSideOf = (st, game) => (game?.homeId === st.userTeamId ? "home" : "away");

/**
 * C2: pay out one finished game's XP. Levels land on the live roster (the next game plays with them)
 * and the ledger goes on the career, which the save that follows persists. Only managed careers
 * grow -- a quick season has no ledger to keep. Called exactly once per game, at the moment it ends.
 */
function awardGameGrowth(report, xpBoost = 1) {
  const career = state.leagueCareer;
  const st = state.season;
  if (!report || !st || !isManagedCareer(career)) return;
  const players = st.teams[st.userTeamId]?.players || [];
  const result = awardGrowth({
    growth: career.management?.growth,
    plans: career.management?.developmentPlans,
    year: st.year,
    players,
    lines: report.lines,
    ladderOf: historicalLadder,
    xpMultiplier: developmentXpMultiplier(state.longCareerRoot?.coach) * xpBoost,
  });
  for (const [id, attributes] of Object.entries(result.changes)) {
    Object.assign(players.find((player) => player.id === id), attributes);
  }
  state.leagueCareer = { ...career, management: { ...career.management, growth: result.growth } };
  report.rewards.playerXp = result.entries;
}

/**
 * C3: after a game, who has a hot streak going and who just had an epiphany. A learned skill goes
 * straight onto the live player (the next game plays with it); the streak ledger rides on the career.
 * Same rules as `awardGameGrowth`: managed careers only, once per game, at the moment it ends.
 */
function awardGameEpiphany(report) {
  const career = state.leagueCareer;
  const st = state.season;
  if (!report || !st || !isManagedCareer(career)) return;
  const players = st.teams[st.userTeamId]?.players || [];
  const result = awardEpiphany({ ledger: career.management?.epiphany, players, lines: report.lines, plans: career.management?.developmentPlans, gameKey: gameFingerprint(report.lines) });
  state.leagueCareer = { ...career, management: { ...career.management, epiphany: result.ledger } };
  report.rewards.epiphanies = result.learned;
  report.rewards.heat = result.heat;
}

/** Highlight nights warm the trade market; everyone cools a little every game (C4). Lives on the season. */
function awardGameBuzz(report) {
  const st = state.season;
  if (!report || !st || !isManagedCareer(state.leagueCareer)) return;
  const result = settleBuzz({ buzz: st.buzz, players: st.teams[st.userTeamId]?.players || [], lines: report.lines });
  st.buzz = result.buzz;
  report.rewards.highlights = result.highlights;
  report.rewards.hot = result.hot;
}

/**
 * C5: the time-travel coach's own XP for a game. Only while he actually holds the job -- a fired,
 * departed or retired coach coaches nobody. Lives on root.coach, which the save that follows persists.
 */
function awardGameCoachXp(report, xpBoost = 1) {
  const st = state.season;
  const root = state.longCareerRoot;
  const status = state.story?.employment?.status || "active";
  if (!report || !st || !root || state.leagueCareer?.kind !== "timeTravel" || status !== "active") return;
  const you = st.teams[st.userTeamId];
  const opponent = Object.values(st.teams).find((team) => team !== you && team.name === report.opponentName);
  const result = awardCoachXp(ensureCoachProfile(root), {
    won: report.won,
    playoff: st.phase === "playoffs",
    youStrength: teamRosterStrength(you),
    oppStrength: opponent ? teamRosterStrength(opponent) : NaN,
    multiplier: xpBoost,
  });
  state.longCareerRoot = { ...root, coach: result.coach };
  report.rewards.coachXp = result.entry;
}

/** The tactician perk rides on the season so every game the engine builds for the user carries it. */
function syncCoachPerksToSeason(st) {
  if (!st) return;
  const shot = state.leagueCareer?.kind === "timeTravel" ? tacticsShotBonus(state.longCareerRoot?.coach) : 0;
  if (shot) st.coachPerkShot = shot;
  else delete st.coachPerkShot;
}

/**
 * C6: judge the goals this game came with and say how much its XP is multiplied by (x1.5 for coaching
 * it yourself, +25% per goal met). Managed careers only -- a quick season has no XP to multiply.
 */
function awardGameGoals(report, handPlayed) {
  const st = state.season;
  if (!report || !st || !isManagedCareer(state.leagueCareer)) return 1;
  const result = settleGameGoals(st, st.teams[st.userTeamId]?.players || [], report, { handPlayed });
  report.rewards.goal = result;
  return result.multiplier;
}

/**
 * Settle a finished game from the user's side and pay its XP, any epiphany, the market buzz and the
 * coach's XP. `handPlayed` is true only for a game the user coached live: it earns the C6 bonus.
 */
function settleUserGame(snap, side, { handPlayed = false } = {}) {
  const report = settleGame(snap, side);
  const boost = awardGameGoals(report, handPlayed);
  awardGameGrowth(report, boost);
  awardGameEpiphany(report);
  awardGameBuzz(report);
  awardGameCoachXp(report, boost);
  return report;
}

/**
 * The bulk playoff sims (一键模拟整个季后赛 / 模拟下一轮 / 一键打完季后赛) play the user's games inside the
 * engine, out of sight, and used to throw each box score away -- so they paid no XP, epiphany, buzz or coach
 * XP, while hand-playing or 模拟下一场 did. `settle` is the engine's onUserGame hook: it pays every game the
 * user's team played as it is decided (it ignores everyone else's); the batch keeps the last one for the card.
 */
function userGameBatch(st) {
  const reports = [];
  let last = null;
  return {
    reports,
    get last() { return last; },
    settle(snap, game, series = null) {
      if (game?.homeId !== st.userTeamId && game?.awayId !== st.userTeamId) return;
      last = { snap, game, series };
      reports.push(settleUserGame(snap, userSideOf(st, game)));
    },
  };
}

/** After a bulk playoff sim: save, then show the harvest if the user played, else the playoffs tab as before. */
function finishBulkPlayoffSim(st, batch) {
  if (!saveSeasonAndCareer(st)) return;
  const { last, reports } = batch;
  if (!last) {
    renderSeasonHub();
    showSeasonTab("playoffs");
    return;
  }
  const { snap, game, series } = last;
  const extra = `已连续模拟 ${reports.length} 场；下方为最后一场（${snap.home?.name} ${snap.score.home}-${snap.score.away} ${snap.away?.name}）的完整数据。`;
  showSeasonSimResult({ ...snap, youSide: userSideOf(st, game) }, { summaryExtra: extra, playoffSeries: series, reports });
}

function wireSeasonResultContinue(st, snap, { summaryExtra = "", viewingHistory = false, playoffSeries = null, reports = null, selected = null } = {}) {
  renderPostGame(snap, reports, selected);
  const cont = $("#btn-result-continue");
  const base = playoffSeries
    ? playoffResultSummaryText(st, playoffSeries)
    : (() => {
        const rec = st?.standings?.[st.userTeamId];
        const played = userGamesPlayed(st);
        return `常规赛战绩 ${rec?.w || 0}胜${rec?.l || 0}负 · 已打 ${played}/${seasonGames(st)}。${
          st?.phase === "awards" ? " 常规赛结束，可查看评奖。" : ""
        }`;
      })();
  $("#result-summary").textContent = summaryExtra ? `${summaryExtra} ${base}` : base;
  cont.textContent = viewingHistory ? "返回赛程" : "回到赛季主页";
  cont.onclick = () => {
    state.mode = state.leagueCareer?.kind === "timeTravel" ? "timeTravel" : "season";
    renderSeasonHub();
    show("season");
    if (viewingHistory) showSeasonTab("schedule");
    else if (st?.phase === "awards") showSeasonTab("awards");
    else if (playoffSeries || st?.phase === "playoffs" || st?.phase === "done") showSeasonTab("playoffs");
  };

  // #btn-again doubles as "继续模拟" here (user feedback: result screen only offered a trip back
  // to the season hub to trigger the next game -- no way to just keep going from this screen).
  // During playoffs this means "keep playing MY series one game at a time"; 模拟整个赛季 only ever
  // makes sense for the regular season -- bulk-advancing playoff rounds already lives on the
  // playoffs tab (模拟下一轮 / 一键打完季后赛), so it's deliberately NOT duplicated here.
  const hasNextPlayoffGame = !viewingHistory && st?.phase === "playoffs" && !!nextUserPlayoffGame(st);
  const canKeepSimming = (!viewingHistory && st?.phase === "regular") || hasNextPlayoffGame;
  const canSimWholeSeason = !viewingHistory && st?.phase === "regular";
  setResultActionMode("season", { showContinue: true, continuePrimary: !canKeepSimming });
  const again = $("#btn-again");
  if (again) {
    again.hidden = !canKeepSimming;
    again.classList.toggle("primary", false); // 亲自指挥下一场 is the one primary action; simming is the alternative
    if (canKeepSimming) {
      again.textContent = L("模拟下一场", "Sim Next Game");
      again.onclick = () => simSeasonGames(1);
    }
  }
  cont.classList.toggle("primary", !canKeepSimming);
  // Scoped to canSimWholeSeason (regular season only), not canKeepSimming: during the playoffs
  // simSeasonGames() ignores its count and sims exactly one game regardless, so a "5 games" button
  // there would be a lie. The regular season is where the count argument actually does five.
  // 亲自指挥下一场: same entry as the season hub's 亲自指挥 (regular season and your own playoff series), so the
  // live game, its rotation defaults and its settlement are exactly the same -- this just saves a trip back to the hub.
  const playBtn = $("#btn-result-play-next");
  if (playBtn) {
    playBtn.hidden = !canKeepSimming;
    if (canKeepSimming) {
      playBtn.textContent = L("亲自指挥下一场", "Coach Next Game");
      playBtn.onclick = () => playSeasonUserGame();
    }
  }
  const sim5Btn = $("#btn-result-sim5");
  if (sim5Btn) {
    sim5Btn.hidden = !canSimWholeSeason;
    if (canSimWholeSeason) {
      sim5Btn.textContent = L("模拟五场", "Sim 5 Games");
      sim5Btn.onclick = () => simSeasonGames(5);
    }
  }
  const simSeasonBtn = $("#btn-result-sim-season");
  if (simSeasonBtn) {
    simSeasonBtn.hidden = !canSimWholeSeason;
    if (canSimWholeSeason) {
      simSeasonBtn.textContent = L("模拟整个赛季", "Sim Rest of Season");
      simSeasonBtn.onclick = async () => {
        if (
          !(await confirmAction(
            L(
              "一气模拟完剩余常规赛，过程中不能亲自指挥。全联盟每夜比赛都要跟着模拟，整赛季大约十几秒，过程中不能交易/调整轮换。",
              "This sims the rest of the regular season, and you can't coach during it. Every other game that night is simmed too. A full season takes several seconds, and you can't trade or change the rotation while it runs.",
            ),
            { title: L("模拟整个赛季", "Sim the rest of the season"), acceptLabel: L("模拟到底", "Sim it all") },
          ))
        )
          return;
        await simRestOfSeason();
      };
    }
  }
  const homeBtn = $("#btn-home");
  if (homeBtn) homeBtn.hidden = false;
}

/**
 * Simulating the whole rest of a 32-team season takes ~15-20s of real wall-clock time
 * (every call to simUserNextGame() also advances every OTHER game around the league that
 * night, so "82 games" is really more like 1000+ individual games under the hood). Doing
 * that synchronously would freeze the tab for that whole stretch with zero feedback, so this
 * yields to the browser after every simulated night and paints a running progress count.
 */
async function simRestOfSeason() {
  const st = state.season;
  if (!st || st.phase !== "regular") return;
  const buttons = ["#btn-result-sim-season", "#btn-result-sim5", "#btn-result-play-next", "#btn-again", "#btn-result-continue", "#btn-home"]
    .map((sel) => $(sel))
    .filter(Boolean);
  for (const b of buttons) b.disabled = true;
  const summaryEl = $("#result-summary");
  let last = null;
  let n = 0;
  const reports = [];
  const games = [];
  const maxGames = seasonGames(st); // B60: quick My Team seasons are 20 games, not 82 (the loop already stops when simUserNextGame returns null)
  for (let i = 0; i < maxGames; i++) {
    const r = simUserNextGame(st);
    if (!r) break;
    last = r;
    n += 1;
    reports.push(settleUserGame(r.snap, userSideOf(st, r.game)));
    games.push({ ...r.snap, youSide: userSideOf(st, r.game) });
    if (summaryEl) summaryEl.textContent = `正在模拟整个赛季…已完成 ${n} 个比赛日，请稍候`;
    // Intentionally awaited inside the loop: yield one frame so the progress text above
    // actually paints instead of the tab looking frozen for ~15-20s straight.
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  for (const b of buttons) b.disabled = false;
  if (!saveSeasonAndCareer(st)) return;
  if (last?.snap) {
    showSeasonSimResult(games.at(-1), { summaryExtra: batchResultExtra(games, games.length - 1), reports, games, selected: games.length - 1 });
  } else {
    renderSeasonHub();
    if (st.phase === "awards") showSeasonTab("awards");
  }
}

/** The line above a simulated stretch's box score: which of its games is on screen. */
function batchResultExtra(games, index) {
  const g = games[index];
  const where = `${g.home?.name} ${g.score.home}-${g.score.away} ${g.away?.name}`;
  return index === games.length - 1
    ? L(`已连续模拟 ${games.length} 场；下方为最近一场（${where}）的完整数据，点上面的「每场战绩」可看其他场。`, `Simulated ${games.length} games; below is the latest (${where}) — tap a game in the list above for the others.`)
    : L(`已连续模拟 ${games.length} 场；下方为第 ${index + 1} 场（${where}）的完整数据。`, `Simulated ${games.length} games; below is game ${index + 1} (${where}).`);
}

/** Open one game of the stretch just simulated (same result page, that game's score and box score). */
function viewBatchGame(index) {
  const batch = state.resultBatch;
  const snap = batch?.games?.[index];
  if (!snap) return;
  showSeasonSimResult(snap, { summaryExtra: batchResultExtra(batch.games, index), reports: batch.reports, games: batch.games, selected: index });
  $("#result-title")?.scrollIntoView?.({ block: "start" });
}
$("#result-rewards")?.addEventListener("click", (event) => {
  const row = event.target.closest?.("[data-pg-game]");
  if (row) viewBatchGame(Number(row.dataset.pgGame));
});

function simSeasonGames(count = 1) {
  const st = state.season;
  if (!st) return { simmed: 0, last: null, reports: [] };
  if (st.phase === "playoffs") return simUserPlayoffGameFromResult();
  if (st.phase !== "regular") return { simmed: 0, last: null, reports: [] };
  let last = null;
  let n = 0;
  const reports = [];
  const games = [];
  for (let i = 0; i < count; i++) {
    const r = simUserNextGame(st);
    if (!r) break;
    last = r;
    n += 1;
    reports.push(settleUserGame(r.snap, userSideOf(st, r.game)));
    games.push({ ...r.snap, youSide: userSideOf(st, r.game) });
  }
  if (!saveSeasonAndCareer(st)) return { simmed: 0, last: null, reports: [] };
  if (last?.snap) {
    const extra = n > 1 ? batchResultExtra(games, n - 1) : "快速模拟完成。下方为双方球员数据。";
    showSeasonSimResult(games.at(-1), { summaryExtra: extra, reports, games, selected: n - 1 });
    return { simmed: n, last, reports };
  }
  renderSeasonHub();
  if (st.phase === "awards") showSeasonTab("awards");
  return { simmed: n, last, reports };
}

/**
 * Gold Lifestyle Shop — Auto-Play Tickets (user decision 2026-11-09). A ticket simulates
 * one regular-season game through the existing engine (simSeasonGames → simUserNextGame +
 * settleUserGame): the result counts exactly like a quick-simmed game, with no win-rate
 * bonus, no OVR boost and no extra competitive rewards. XP is the existing auto rate:
 * +5 per game, max 20 XP-paying auto games per day (accountLevel XP_TABLE). Games past
 * the cap still simulate (real season progress) but pay no XP.
 */
function shopTicketContext() {
  const acc = activeAccount();
  const st = state.season;
  const season = Boolean(acc && st && st.phase === "regular");
  return {
    season,
    remaining: season ? Math.max(0, seasonGames(st) - userGamesPlayed(st)) : 0,
    credits: ticketBalance(acc),
    xpRemaining: autoXpRemaining(acc),
  };
}

function useAutoPlayTickets(n) {
  const acc = activeAccount();
  if (!acc) {
    showAccountGate({ zh: "商城", en: "Shop" });
    return { ok: false, reason: "guest" };
  }
  const st = state.season;
  if (!st || st.phase !== "regular") return { ok: false, reason: "no-season" };
  const credits = ticketBalance(acc);
  const remaining = Math.max(0, seasonGames(st) - userGamesPlayed(st));
  const games = Math.min(n, credits, remaining);
  if (games <= 0) return { ok: false, reason: credits <= 0 ? "no-tickets" : "season-done", credits, remaining };
  const res = simSeasonGames(games);
  const used = res?.simmed || 0;
  if (used <= 0) return { ok: false, reason: "no-games-simmed" };
  // The simulated games already wrote to the account (My Team season gold is saved per game), so `acc` read before the
  // run is stale. Saving it would overwrite that gold with the old balance: re-read before touching tickets and XP.
  const live = activeAccount() || acc;
  consumeAutoTickets(live, used);
  const xp = awardAutoGameXp(live, used);
  const wins = (res.reports || []).filter((r) => r?.won).length;
  return { ok: true, simmed: used, wins, losses: used - wins, xpGames: xp.xpGames, gained: xp.gained, tickets: ticketBalance(live), xpRemaining: autoXpRemaining(live) };
}

/** 「快速模拟本场」在季后赛阶段的对应物：只模拟我方当前系列赛的下一场，结果页复用和常规赛
 * 完全相同的 showSeasonSimResult 渲染，只是摘要文案换成系列比分（wireSeasonResultContinue 里的
 * playoffSeries 分支处理）。 */
function simUserPlayoffGameFromResult() {
  const st = state.season;
  const result = simUserNextPlayoffGame(st);
  if (!result) {
    renderSeasonHub();
    showSeasonTab("playoffs");
    return;
  }
  const report = settleUserGame(result.snap, userSideOf(st, result.game));
  if (!saveSeasonAndCareer(st)) return;
  showSeasonSimResult(
    { ...result.snap, youSide: userSideOf(st, result.game) },
    { summaryExtra: "快速模拟完成。下方为双方球员数据。", playoffSeries: result.series, reports: [report] },
  );
}

$("#btn-season-back")?.addEventListener("click", () => goBack());
/* ---- My Team Season (ADR-010 T2): start from the saved lineup, continue, lock the roster -------------------- */
function enterMyTeamSeason(st) {
  state.season = st;
  state.leagueCareer = null; // same reset as a fresh quick season: a career in memory must not leak into this one
  state.seasonPendingGame = null;
  state.mode = "season";
  show("season");
  renderSeasonHub({ persist: false });
  showSeasonTab("standings");
}

/** Once a My Team season is done: stamp its result on the save and record it on the account (idempotent). */
/**
 * Account Level for a finished My Team Season: completion +200, made the
 * playoffs +150, championship +500 (each once per season). Called inside
 * settleMyTeamResult's `!st.myTeam.result` guard, so the reward is decided
 * once — and keyed by seasonId as well, so even a re-settle can't pay twice.
 * No celebration modal here: the result screen is re-opened from the hub,
 * and the done-bar text carries the note instead.
 */
function awardMyTeamSeasonXp(st, result) {
  const key = `myTeamSeason:${result.seasonId}`;
  let total = 0;
  const acc = getAccount(st.myTeam.ownerAccountId) || activeAccount();
  total += awardAccountXp(acc, XP_TABLE.season, { source: "season", key: `${key}:completion` }).gained;
  if (madePlayoffs(st)) total += awardAccountXp(acc, XP_TABLE.playoff, { source: "playoff", key: `${key}:playoff` }).gained;
  if (result.champion) total += awardAccountXp(acc, XP_TABLE.championship, { source: "championship", key: `${key}:champion` }).gained;
  return total;
}

/** Pay what the season has earned so far (idempotent: see seasonRewards.js) and remember the running total for the UI. */
function grantMyTeamGold(st) {
  if (!st?.myTeam) return;
  const g = grantSeasonGold(st);
  if (g.total) st.myTeam.goldEarned = g.total;
  if (g.parts) st.myTeam.goldParts = g.parts;
}

function settleMyTeamResult(st) {
  if (!st?.myTeam || st.phase !== "done" || st.myTeam.result) return;
  st.myTeam.result = myTeamResult(st);
  grantMyTeamGold(st); // the completion / playoff / title bonuses land in the same pass that records the season
  st.myTeam.result.gold = st.myTeam.goldEarned || 0;
  const axp = awardMyTeamSeasonXp(st, st.myTeam.result);
  if (axp > 0) st.myTeam.result.axpNote = L(`🎖️ 账号经验 +${axp}`, `🎖️ Account XP +${axp}`);
  recordMyTeamResult(st.myTeam.ownerAccountId, st.myTeam.result);
  if (st.myTeam.result.champion) audio.champion();
}

/** Objectives strip while the season runs (and after, as the scoreboard of what was achieved). */
function paintMyTeamGoals(st) {
  const el = $("#myteam-goals");
  if (!el) return;
  // Once the season is over the same goals are inside the season report: don't show them twice.
  if (!st?.myTeam || st.phase === "done") { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = objectivesHtml(seasonObjectives(st), getLang());
}

/** Season over: show the result and offer "one more season" with the same length. */
function paintMyTeamDoneBar(st) {
  const bar = $("#myteam-done-bar");
  const reportEl = $("#myteam-report");
  if (!bar) return;
  if (!st?.myTeam || st.phase !== "done") { bar.hidden = true; if (reportEl) reportEl.hidden = true; return; }
  settleMyTeamResult(st);
  grantMyTeamGold(st); // a resumed, already-settled season still gets topped up if something was missed (no-op otherwise)
  if (reportEl) {
    reportEl.hidden = false;
    reportEl.innerHTML = reportHtml({ report: seasonReport(st), gold: { total: st.myTeam.goldEarned || 0, parts: st.myTeam.goldParts || null }, lang: getLang() });
  }
  const r = st.myTeam.result;
  const acc = activeAccount();
  const lang = getLang();
  const head = r.champion ? L("🏆 总冠军！", "🏆 Champions!") : L("赛季结束", "Season over");
  bar.hidden = false;
  bar.innerHTML = `<strong>${esc(head)}</strong> <span>${r.w}${L("胜", "W")} ${r.l}${L("负", "L")} · ${esc(seasonRecordSummary(acc?.myTeamSeasons, r.variant, lang))}</span>${r.axpNote ? ` <span>${r.axpNote}</span>` : ""}
    <span class="btn-row"><button type="button" class="btn small primary" data-myteam-again="${esc(r.variant)}">${L("再来一季", "Play another season")}</button>
    <button type="button" class="btn small ghost" data-myteam-lineup="1">${L("调整阵容", "Adjust lineup")}</button></span>`;
}
$("#myteam-done-bar")?.addEventListener("click", (e) => {
  const again = e.target.closest("[data-myteam-again]");
  if (again) return void startMyTeamSeason(again.dataset.myteamAgain, { again: true });
  if (e.target.closest("[data-myteam-lineup]")) openMyTeamHome();
});

/** The My Team clubhouse lives inside the home "My Team" tab (id players): go there and show fresh data. */
function openMyTeamHome() {
  show("home");
  activateHomeTab?.("players");
  myTeamClubhouse?.open();
}

function myTeamResumeLabel() {
  const st = readMyTeamSeason();
  if (!st) return null;
  const vis = saveVisibility("myteam", myTeamSig(st));
  if (vis !== "mine" && vis !== "unassociated") return null; // another account's / the guest's: not playable here
  try { return seasonProgressLabel(st, getLang()); } catch { return L("进行中", "In progress"); }
}

async function startMyTeamSeason(variant, { again = false } = {}) {
  const account = activeAccount();
  if (!account) { alert(L("请先创建 / 登录账号。", "Sign in or create an account first.")); return; }
  await playersReady(); // perf-r3
  assertPlayersReady("startMyTeamSeason");
  // 8-player unlock gate (user decision 2026-11-08): a My Team Season (AI regular season) needs 8 players on the account.
  // The lineup validator (validateMyTeamLineup, minRoster 8) enforces the same floor on the saved draft; this is the
  // account-level check, so the gate also holds for programmatic starts.
  if (!competitiveUnlocked(account)) {
    alert(L(`再抽 ${competitivePlayersNeeded(account)} 张球员即可解锁我的赛季。`, `Draw ${competitivePlayersNeeded(account)} more players to unlock My Team Season.`));
    return;
  }
  let built = buildMyTeamSeason(account, { variant });
  if (!built.ok && built.reason === "repaired") {
    const go = await confirmAction(L(
      "你保存的阵容里有卡已不在收藏中，已按当前收藏修复。用修复后的阵容开赛？（可以先回去看一眼）",
      "Some saved cards are no longer in your collection, so the lineup was repaired. Start with the repaired lineup? (You can go back and look first.)",
    ), { title: L("阵容已被修复", "Lineup repaired"), acceptLabel: L("用修复后的阵容开赛", "Start with it") });
    if (!go) { myTeamLineup.open(); return; }
    built = buildMyTeamSeason(account, { variant, acceptRepaired: true });
  }
  if (!built.ok) {
    alert(built.reason === "invalid" ? L("阵容还不满足开赛条件，请先在阵容页补齐。", "The lineup isn't ready yet; finish it on the lineup page.") : L("无法创建赛季。", "Couldn't create the season."));
    myTeamLineup.open();
    return;
  }
  const st = built.season;
  const names = st.myTeam.start.starterIds.map((id) => {
    const p = st.teams[st.userTeamId].players.find((x) => x.id === id);
    return p ? (getLang() === "en" ? p.nameEn || p.name : p.name) : id;
  });
  const games = st.myTeam.rules.seasonLength;
  if (!again && !(await confirmAction(L(
    `首发：${names.join("、")}\n${st.myTeam.roster.length} 人名单 · ${games} 场常规赛 + 季后赛。\n开赛后阵容锁定：之后抽到或升级的卡不影响这个赛季。`,
    `Starters: ${names.join(", ")}\n${st.myTeam.roster.length}-man roster · ${games}-game regular season + playoffs.\nThe lineup locks once it starts: cards you pull or upgrade later won't affect this season.`,
  ), { title: L("开始我的赛季？", "Start my season?"), acceptLabel: L("开赛", "Start") }))) return;

  // Never silently replace a save: someone else's / unlinked is refused; my own earlier season needs a yes.
  if (await blockedByForeignSave("myteam", { sig: myTeamSig(st) })) return;
  const prev = readMyTeamSeason();
  const prevFinished = !!prev?.myTeam?.result; // a finished season of mine is history, not progress to protect
  if (hasMyTeamSeason() && !prevFinished && !(await confirmAction(L("将放弃你当前进行中的「我的赛季」，确定开新赛季？", "This replaces your My Team season in progress. Start a new one?"), {
    title: L("覆盖当前赛季？", "Replace the current season?"), acceptLabel: L("覆盖并开始", "Replace and start"),
  }))) return;
  if (!saveSeasonAndCareer(st)) return; // alerts on failure; nothing else was touched
  enterMyTeamSeason(st);
}

async function resumeMyTeamSeason() {
  const st = loadMyTeamSeason();
  if (!st) { alert(L("没有可继续的赛季。", "No season to continue.")); return; }
  if (await blockedByForeignSave("myteam", { sig: myTeamSig(st) })) return;
  enterMyTeamSeason(st);
}

$("#btn-season-resume")?.addEventListener("click", () => {
  const { live, root } = savedSeasonSource();
  if (!live && root) {
    // Put the whole career back (not just its season) so later saves go to the root save again.
    resumeLongCareer(root);
    return;
  }
  const st = prepareSeasonState(live);
  if (!st) return;
  if (!state.leagueCareer) markSlotResumed("season"); // continuing it keeps its owner (unassociated stays so)
  state.season = st;
  state.mode = state.leagueCareer?.kind === "timeTravel" ? "timeTravel" : "season";
  renderSeasonHub();
  showSeasonTab(state.seasonTab || "standings");
});
$("#btn-season-roster-account")?.addEventListener("click", () => {
  const acc = requireAccountReady({ zh: "账号班底", en: "Account roster" });
  if (!acc) return;
  const name = ($("#season-team-name")?.value || "").trim() || "拉斯维加斯 ***";
  const team = accountToTeam(acc, name);
  if (!team || team.players.length < 8) {
    alert(L("账号班底不足 8 人，请先去抽卡/开局集齐球员。", "The account roster has fewer than 8 players. Draw cards or start a run until you have a full group."));
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
    alert(L("账号班底在工资帽下凑不满 8 人，请改用「自选历史球员」。", "Eight players won't fit under the cap. Use Choose historical players instead."));
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
        }>${p.pos} ${esc(p.name)} · ${p.season} · ${
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
        ? L(`选人结束：系统已按已选阵容与位置补齐至 ${seasonPickList.length} 人`, `Draft done: the system filled your roster to ${seasonPickList.length} by position`)
        : L(`名单已满 ${SEASON_DRAFT_TARGET} 人，可确认阵容`, `Roster full at ${SEASON_DRAFT_TARGET} — confirm it`);
    }
    box.innerHTML = `<p class="tiny">${
      seasonPickAutoDone
        ? L("没有选择权的系统补人已完成。可确认阵容；若移出自选球员，会清空系统补人并继续手选。", "Auto-fill is done. Confirm the roster; removing a hand-picked player clears the auto-filled ones and resumes manual picking.")
        : L("可确认这份阵容，或移出后继续选。", "Confirm this roster, or remove players and keep picking.")
    }</p>`;
    syncSeasonPickCap();
    return;
  }

  if (nameEl) {
    nameEl.textContent = seasonOfferFranchise
      ? L(`本批球队：${seasonOfferFranchise.name}（${seasonOfferFranchise.id}）· 选 1 人或跳过免费随机一人`, `This batch: ${seasonOfferFranchise.name} (${seasonOfferFranchise.id}) · pick 1, or skip for a free random one`)
      : "—";
  }
  const have = new Set(seasonPickList.map((p) => p.id));
  const pay = seasonPickPayroll();
  if (!seasonOfferPack.length) {
    box.innerHTML = `<p class="tiny">${L("本批暂无人可选", "Nobody available in this batch")}</p>`;
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
          <strong>${p.pos} ${esc(p.name)}</strong>
          <span class="chip tiny">${meta.role}</span>
          <div class="tiny">${L(`${p.season} 赛季`, `${p.season} season`)} · OVR ${meta.ovr} · ${L("当季工资", "This season's salary")} <strong>${formatSalary(sal)}</strong></div>
          <div class="tiny season-pick-attrs">${L("攻", "ATK")}${p.scoring ?? "—"} ${L("三分", "3PT")}${p.three ?? "—"} ${L("中投", "MID")}${p.mid ?? "—"} ${L("内线", "INS")}${p.paint ?? "—"} ${L("传", "PAS")}${p.pass ?? "—"} ${L("防", "DEF")}${p.defense ?? "—"} ${L("板", "REB")}${p.rebound ?? "—"} ${L("断", "STL")}${p.steal ?? "—"} ${L("帽", "BLK")}${p.block ?? "—"} ${L("速", "SPD")}${p.speed ?? "—"} ${L("力", "STR")}${p.strength ?? "—"} ${L("球商", "IQ")}${p.iq ?? "—"} ${L("关键", "CLT")}${p.clutch ?? "—"}</div>
          <div class="tiny">${marketMeta(p, getLang())}</div>
          ${
            historicalUpsideHint(p, getLang())
              ? `<div class="tiny season-pick-upside">${historicalUpsideHint(p, getLang())} · ${L("打完赛季可按史实成长", "grows on their real curve after the season")}</div>`
              : ""
          }
        </div>
        <button type="button" class="btn small primary" data-pick="${p.id}" ${
        already || over ? "disabled" : ""
      }>${already ? L("已选", "Picked") : over ? L("超帽", "Over cap") : L("选入", "Pick")}</button>
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

$("#btn-season-roster-franchise")?.addEventListener("click", async (ev) => {
  const panel = $("#season-pick-panel");
  if (!panel) return;
  // 若已在选人，再次点「随机球队选人」会整批重开；避免回车误触已聚焦的该按钮
  if (!panel.hidden && seasonPickList.length > 0) {
    if (!(await confirmAction(L("将清空已选球员并重新随机一支球队，确定？", "Clear your picks and roll a new random team?")))) return;
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
  const dynasty = seasonSetupKind === "franchise";
  btn.textContent =
    seasonSetupMode === "historical"
      ? dynasty
        ? L(`开启 ${seasonSetupYear} 王朝生涯（长期经营）`, `Start a ${seasonSetupYear} dynasty career (long-term)`)
        : L(`开启 ${seasonSetupYear} 单赛季（常规赛+季后赛）`, `Start the ${seasonSetupYear} single season (regular + playoffs)`)
      : dynasty
        ? L("开启王朝生涯（32 队）", "Start the dynasty career (32 teams)")
        : L("开启单赛季征程（32 队）", "Start the single-season run (32 teams)");
}

for (const btn of document.querySelectorAll("[data-career-length]")) {
  btn.addEventListener("click", () => {
    seasonSetupKind = btn.dataset.careerLength; // only the length choice; the roster/year picks stay as they are
    syncCareerLengthUi();
    syncSeasonStartButtonLabel();
  });
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
  if (await blockedByForeignSave(seasonSetupKind === "franchise" ? "career" : "season")) return;
  if (
    seasonSetupKind === "franchise"
    && hasExistingCareerRoot(currentCareerRoot())
    && !(await confirmAction(L("开始新联盟经理生涯将替换当前长期生涯存档，确定继续？", "Starting a new league-manager career will replace your current long career save. Continue?"), {
      title: L("覆盖联盟经理存档？", "Overwrite the league-manager save?"),
      acceptLabel: L("覆盖并开始", "Overwrite and start"),
    }))
  ) return;
  draft.name = name;
  if (state.season && !state.season.myTeam && !(await confirmAction(L("将覆盖当前赛季进度，确定开新赛季？", "This will overwrite your current season progress. Start a new season?"), {
    title: L("覆盖当前赛季？", "Overwrite the current season?"),
    acceptLabel: L("覆盖并开始", "Overwrite and start"),
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
      // The League Manager setup is the GM route (ADR-006 R4): the
      // career it creates plays as GM, so trades/drafts/signings are
      // open and commanding games / setting the rotation are not.
      state.leagueCareer = createLeagueCareer({
        kind: "franchise",
        season: state.season,
        role: "GM",
        // M4-C: freeze the account's identity places as they are at
        // creation (readIdentity covers guests too); later account edits
        // never rewrite this career's snapshot.
        identityPlaces: readIdentity(activeAccount()).identityPlaces,
      });
      state.mode = "franchise";
    } else {
      state.leagueCareer = null;
      state.mode = "season";
    }
  } catch (err) {
    alert(err?.message || L("无法创建赛季", "Couldn't create the season"));
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
      alert(L("赛季进度已保存到本机。", "Season progress saved locally."));
    }
  }
});
$("#btn-season-abandon")?.addEventListener("click", async () => {
  // A My Team season abandons ONLY its own slot. Falling through would offer to delete the whole career instead.
  if (state.season?.myTeam) {
    if (!(await confirmAction(L(
      "放弃这个「我的赛季」？赛季进度会被删除；球员收藏、阵容、账号和其他存档不受影响。",
      "Abandon this My Team season? Its progress is deleted; your collection, lineup, account and other saves are untouched.",
    ), { title: L("放弃我的赛季？", "Abandon my season?"), acceptLabel: L("放弃赛季", "Abandon") }))) return;
    try {
      clearMyTeamSeason({ release: true });
    } catch (error) {
      if (!(error instanceof ForeignSaveError)) throw error;
      await foreignSaveNotice("myteam", error.reason);
      return;
    }
    Object.assign(state, { season: null, seasonPendingGame: null });
    show("home");
    refreshSaveHomeBar();
    return;
  }
  // B36: this deletes the whole current career (season, history, coach progress), not just "this season".
  // P0: if the slot holds another player's career (we are playing a stale in-memory copy), deleting must not touch it.
  // An unlinked career may be deleted -- this confirmed delete is exactly the explicit release it needs.
  if (await blockedByForeignSave("career", { release: true })) return;
  if (!(await confirmAction(L(
    "将永久删除当前生涯的全部进度：本赛季、历届历史、教练成长和故事进展。球员收藏、账号和设置不受影响。此操作无法撤销。",
    "This permanently deletes the current career: this season, past seasons, coach progress and story. Your collection, account and settings are not affected. This cannot be undone.",
  ), {
    title: L("删除当前生涯？", "Delete the current career?"),
    acceptLabel: L("删除生涯", "Delete career"),
  }))) return;
  clearSeasonSave(); // its mirror goes; an unrelated unlinked quick season stays (it's not this career)
  deleteCareerSave(undefined, { release: true });
  state.leagueCareer = null;
  state.story = null;
  state.longCareerRoot = null;
  state.mode = "season";
  state.season = null;
  state.seasonPendingGame = null;
  state.seasonRosterDraft = null;
  show("home");
  refreshSaveHomeBar();
});
document.querySelectorAll("[data-season-tab]").forEach((btn) => {
  btn.addEventListener("click", () => showSeasonTab(btn.dataset.seasonTab));
});

function handleRankedResult(youWin, snap) {
  const acc = getAccount(state.career?.accountId) || activeAccount();
  if (acc) recordRankedResult(acc, youWin);
  // Ranked always seats the account on the home side (startRankedMatch).
  const notes = acc ? applyRankedGame(acc, snap?.home?.roster, { won: youWin }) : [];
  const tickets = acc ? recordRankedTasks(acc, youWin, undefined, getLang()) : [];
  // Account Level: a finished ranked match pays +50 XP, win or lose.
  const axp = awardAccountXp(acc, XP_TABLE.ranked, { source: "ranked" });
  const progress = [
    ...notes.map(progressNoteText),
    ...tickets.map((g) => grantNote(g, getLang())),
    xpGainNote(axp, getLang()),
  ].filter(Boolean).join(" ");
  celebrateAccountLevelUp(axp.levelBefore, axp.levelAfter);
  const cont = $("#btn-result-continue");
  $("#result-summary").textContent = (youWin
    ? `排位胜利。班底与教练已保存，战绩 ${acc?.rankedWins || 0}胜${acc?.rankedLosses || 0}负。`
    : `排位失利。班底仍在，可回收藏调整战术后再战。战绩 ${acc?.rankedWins || 0}胜${acc?.rankedLosses || 0}负。`) + (progress ? ` ${progress}` : "");
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

  const match = findYourOpenMatch(c.pods) || yourCareerMatch(c);
  const opp = match ? (match.a.bracketId === "you" ? match.b : match.a) : null;
  // R89: Finals games feed a Finals-only board for the Finals MVP (the main board
  // covers the whole bracket run, so it can't judge one). Same condition the result
  // screens use to call a match a Finals match.
  const matchIsFinals = !!(c.finals || c.stageSize === 2);
  if (match && snap) {
    if (match.a.bracketId === "you") {
      match.score = { home: snap.score.home, away: snap.score.away };
      match.startersA = snap.home?.onCourt?.slice(0, 5) || match.startersA;
      match.startersB = snap.away?.onCourt?.slice(0, 5) || match.startersB;
      noteCareerAllTeamGame(c, snap, match.a, match.b);
      if (matchIsFinals) noteCareerFinalsGame(c, snap, match.a, match.b);
    } else {
      match.score = { home: snap.score.away, away: snap.score.home };
      match.startersA = snap.away?.onCourt?.slice(0, 5) || match.startersA;
      match.startersB = snap.home?.onCourt?.slice(0, 5) || match.startersB;
      noteCareerAllTeamGame(c, snap, match.b, match.a);
      if (matchIsFinals) noteCareerFinalsGame(c, snap, match.b, match.a);
    }
  }

  const kind = match?.kind ? kindLabel(match.kind) : "对决";
  const wasFinals = !!(c.finals || c.stageSize === 2);
  const result = resolveCareerYourResult(youWin, opp);
  // 每日任务：任意 2 项完成即解锁今日球员卡（见 DAILY_TASKS）；奖励说明并进 injLine，各分支结算文案都会带上。
  const taskGrants = recordCareerTasks(activeAccount(), youWin, undefined, getLang());
  const taskNote = taskGrants.length
    ? ` ${taskGrants.map((g) => grantNote(g, getLang())).join(" ")}`
    : "";
  const injLine = (injuryNotes.length ? `伤病快报：${injuryNotes.slice(0, 3).join("；")}` : "全员健康。") + taskNote;
  const losses = c.losses?.you || 0;

  if (result.champion) {
    const reward = careerResultReward({ champion: true, round: c.round });
    c.gold += reward;
    const challengeGrant = recordChallengeProgress(activeAccount(), "goldChampion");
    const challengeNote = challengeGrant ? ` ${grantNote(challengeGrant, getLang())}` : "";
    const tierId = c.challengeTier || (c.fromCustom ? "custom" : "gold");
    const tier = challengeTierMeta(tierId === "custom" ? "gold" : tierId);
    const nextTier = nextChallengeTier(tierId, c.fromCustom);
    const copy = championCopy({ tierId, nextTier, tier, reward, gold: c.gold, injLine, challengeNote, wasFinals, series: c.series, lang: getLang() }, { finalsSeriesLabel });
    $("#result-title").textContent = copy.title;
    $("#result-summary").textContent = copy.summary;
    const allTeam = computeCareerAllTeam(c);
    renderResultAllTeam(allTeam, L("本届最佳阵容 · PG → C", "All-Tournament Team · PG → C"), selectFinalsMvp(c.finalsBoard, "you"));
    if (nextTier === "playoff15" || nextTier === "champ7") {
      c.pendingChallenge = nextTier;
      cont.textContent = copy.continueLabel;
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
      cont.textContent = copy.continueLabel;
      cont.onclick = () => {
        archiveFinishedChallenge(c, "champion");
        clearSave();
        refreshSaveHomeBar();
        show("home");
      };
      setResultActionMode("career", { showContinue: true, continuePrimary: true });
      // cont already reads 回主页 here; don't let the always-present #btn-home duplicate it
      { const homeBtn = $("#btn-home"); if (homeBtn) homeBtn.hidden = true; }
    }
    autosaveCareer();
    return;
  }

  if (result.eliminated) {
    const copy = eliminatedCopy({ wasFinals, losses, series: c.series, round: c.round, kind, injLine }, { finalsSeriesLabel, careerRoundLabel });
    $("#result-title").textContent = copy.title;
    $("#result-summary").textContent = copy.summary;
    if (wasFinals) {
      const allTeam = computeCareerAllTeam(c);
      const oppId = c.series?.opp?.bracketId;
      renderResultAllTeam(allTeam, "总决赛最佳阵容 · PG → C", oppId ? selectFinalsMvp(c.finalsBoard, oppId) : null);
    }
    cont.textContent = copy.continueLabel;
    cont.onclick = () => {
      archiveFinishedChallenge(c, "eliminated");
      clearSave();
      refreshSaveHomeBar();
      show("home");
    };
    setResultActionMode("career", { showContinue: true, continuePrimary: false });
    // cont already reads 回主页 here; don't let the always-present #btn-home duplicate it
    { const homeBtn = $("#btn-home"); if (homeBtn) homeBtn.hidden = true; }
    autosaveCareer();
    return;
  }

  const reward = careerResultReward({ youWin, round: c.round });
  c.gold += reward;
  // Every non-final branch continues to the market the same way (same order: clear shop, open, save).
  const continueToMarket = (afterWin) => () => {
    c.shop = null;
    openMarket({ career: true, afterWin, refillShop: true });
    autosaveCareer();
  };

  if (result.seriesGame) {
    const copy = seriesGameCopy({ youWin, series: result.series, gameNo: result.gameNo, reward, gold: c.gold, injLine }, { finalsSeriesLabel });
    $("#result-title").textContent = copy.title;
    $("#result-summary").textContent = copy.summary;
    cont.textContent = copy.continueLabel;
    cont.onclick = continueToMarket(youWin);
    setResultActionMode("career", { showContinue: true, continuePrimary: true });
    autosaveCareer();
    return;
  }

  if (result.needAnotherGame) {
    const next = findYourOpenMatch(c.pods);
    const nextKind = next?.kind ? kindLabel(next.kind) : "下一场";
    const nextOppName = next ? (next.a.bracketId === "you" ? next.b.name : next.a.name) : "？";
    const copy = anotherGameCopy({ youWin, kind, reward, nextKind, nextOppName, losses, injLine });
    $("#result-title").textContent = copy.title;
    $("#result-summary").textContent = copy.summary;
    cont.textContent = copy.continueLabel;
    cont.onclick = continueToMarket(youWin);
    setResultActionMode("career", { showContinue: true, continuePrimary: true });
    autosaveCareer();
    return;
  }

  // Finished this stage path — next stage seeded (or waiting)
  const nextLabel = careerRoundLabel(c.round, c.finals);
  const copy = advanceCopy({ youWin, kind, reward, gold: c.gold, nextLabel, losses, injLine, stageSize: c.stageSize });
  $("#result-title").textContent = copy.title;
  $("#result-summary").textContent = copy.summary;
  cont.textContent = copy.continueLabel;
  cont.onclick = continueToMarket(true);
  setResultActionMode("career", { showContinue: true, continuePrimary: true });
  autosaveCareer();
}

/** Tick recovery + new injury rolls between晋级 games. */
function boxTable(team) {
  const rows = [...team.roster]
    .sort((a, b) => (b.gradeScore || 0) - (a.gradeScore || 0) || b.stats.pts - a.stats.pts)
    .map((p) => {
      const s = p.stats;
      const grade = p.grade || "—";
      const gTone = p.gradeTone || "grade-c";
      return `<tr>
        <td class="player-cell">${photoImg(p, "headshot sm")} ${esc(p.name)}<div class="tiny">${p.season}</div></td>
        <td><span class="live-grade ${gTone}">${grade}</span></td>
        <td>${s.min}</td><td>${s.pts}</td><td>${s.reb}</td><td>${s.oreb}</td><td>${s.dreb}</td>
        <td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.tov}</td><td>${s.pf}</td>
        <td>${s.fgm}/${s.fga}</td><td>${s.tpm}/${s.tpa}</td><td>${s.ftm}/${s.fta}</td>
        <td>${s.pm >= 0 ? "+" : ""}${s.pm}</td>
      </tr>`;
    })
    .join("");
  return `<div class="box-wrap"><strong>${esc(teamNameL(team.name))}</strong>
    <div class="table-scroll"><table>
      <thead><tr>
        <th>${L("球员", "Player")}</th><th>${L("评级", "Grade")}</th><th>MIN</th><th>PTS</th><th>REB</th><th>OREB</th><th>DREB</th>
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

async function boot() {
  try {
    // S-P2-5 step 1: <img> error fallbacks run through one capture-phase listener
    // (no inline onerror attributes), so a CSP without 'unsafe-inline' can switch on.
    installImgErrorFallback();
    // Freeze diagnostic (2026-11-20 rotation-board freeze): heartbeat +
    // longtask observer, records screen + last action for stalls >= 1s.
    startFreezeDiag();
    applyStaticLang();
    const langBtn = $("#btn-lang");
    const paintLangBtn = () => {
      if (langBtn) langBtn.textContent = getLang() === "en" ? "中文" : "EN";
    };
    paintLangBtn();
    // Player Voice: one feedback dialog for every screen, opened from the top bar.
    const voice = createPlayerVoice({
      getLang,
      getAccount: activeAccount,
      getContext: () => {
        const screen = document.querySelector("main.screen.active")?.id || "";
        return { screen, hint: screen === "screen-home" ? document.querySelector(".home-tab.active")?.dataset.category || "" : String(state.mode || "") };
      },
    });
    const voiceBtn = $("#btn-voice");
    const paintVoiceBtn = () => {
      const label = getLang() === "en" ? "Player Voice: feedback" : "玩家之声：提建议 / 报问题";
      voiceBtn?.setAttribute("aria-label", label);
      voiceBtn?.setAttribute("title", label);
    };
    paintVoiceBtn();
    voiceBtn?.addEventListener("click", () => voice.open(voiceBtn));
    // Gold Lifestyle Shop: one dialog for every screen, opened from the top-bar gold chip.
    const shop = createShop({
      getLang,
      getAccount: activeAccount,
      onUseTickets: useAutoPlayTickets,
      ticketContext: shopTicketContext,
      onOpenAccounts: () => openAccountScreen(),
      onPurchased: () => { refreshGoldChip(); refreshMyWorld(); },
    });
    $("#btn-gold-chip")?.addEventListener("click", () => shop?.open());
    $("#btn-season-shop")?.addEventListener("click", () => shop?.open({ category: "convenience" }));
    langBtn?.addEventListener("click", () => {
      const nextLang = getLang() === "en" ? "zh" : "en";
      setLang(nextLang);
      // Sandbox is mount-once: re-render its language chrome in place (picks stay).
      screens.sandbox?.__sandboxSetLang?.(nextLang);
      halfCourtScreen?.setLang(nextLang);
      applyStaticLang();
      coachMode?.refreshLabel();
      relocalizeShellScreens(screens); // screens built on the Screen Shell re-render their own language
      timeTravelScreen.repaint();
      refreshCareerEntry();
      refreshMyWorld();
      myTeamLineup?.refresh();
      myTeamClubhouse?.refresh();
      refreshRankedCardLock();
      // The season hub builds its tabs from JS strings, so a language flip has to rebuild them (no save: nothing changed).
      if (state.season && $("#screen-season").classList.contains("active")) renderSeasonHub({ persist: false });
      // The starting-five cards and their status lines are JS strings too: redraw them in place (picks and drawers stay).
      if (state.setup?.you && $("#screen-setup")?.classList.contains("active")) renderSetupRoster();
      paintLangBtn();
      paintVoiceBtn();
      voice.refresh();
      refreshGoldChip();
      refreshDailyStrip(activeAccount()); // its meta lines are JS strings: the static walker half-translated them ("需Account")
      shop?.refresh();
    });
    audio.init({ getProfileId: () => activeAccount()?.id || null, getLang });
    decorateHome();
    // Unified Career entry (3+1): Player opens the Player Reborn
    // creation flow (or resumes the run); Coach pre-sets the prologue
    // role to COACH and opens the Time Travel creation (the same path as
    // the ?career=coach dev entry — the creation flow stamps the identity
    // on the save via setIdentity at offer acceptance, so no
    // pendingCareerStart stamp is needed here); GM opens the League
    // Manager setup; the Architect (unlocked) opens the Time Travel
    // creation after the era step. The identity stamp
    // (pendingCareerStart) marks the first save of a career started from
    // the GM / Architect card, so completions can derive the role (see
    // saveLongCareer). rebornView is a `let` declared before this call
    // because initCareerEntry runs before the view is created.
    let rebornView = null;
    // Another account's (or the guest's) Reborn run is never shown, played or mirrored into this account.
    const openRebornGuarded = async () => {
      if (careerHidden()) return foreignSaveNotice("career", lockReasonFor("career") || "other");
      return rebornView?.open();
    };
    let careerInboxView = null;
    let networkView = null;
    initCareerEntry({
      onPlay: (identityId, era, opts) => {
        if (identityId === "player") {
          openRebornGuarded();
          return;
        }
        if (identityId === "coach") {
          // Coach career: the prologue role is pre-set before the Time
          // Travel creation screen opens (same as the ?career=coach dev
          // entry); createTimeTravelPrologue() consumes it, and the
          // accepted offer stamps the identity on the save.
          setPrologueRole("COACH");
          startMode("timeTravel");
          return;
        }
        if (identityId === "gm") {
          pendingCareerStart = {
            previousCareerId: state.longCareerRoot?.leagueCareer?.careerId ?? null,
            identity: { currentRole: "GM", initialRole: "GM" },
          };
          startMode("franchise");
          return;
        }
        if (identityId === "gm_coach" && era === "historical") {
          pendingCareerStart = {
            previousCareerId: state.longCareerRoot?.leagueCareer?.careerId ?? null,
            identity: {
              currentRole: "GM_COACH",
              initialRole: "GM_COACH",
              ...(opts?.prestige ? { prestige: "architect" } : {}),
            },
          };
          startMode("timeTravel");
        }
      },
      getAccount: activeAccount,
    });
    activateHomeTab = wireHomeTabs(document, { onActivate: (id) => { audio.homeTab(id); if (id === "world") refreshMyWorld(); if (id === "players") myTeamClubhouse?.refresh(); } });
    // B116 bottom tab bar. The four home tabs switch the panel themselves (wireHomeTabs, above); from the collection or
    // the draw they also bring the player back to home. The cards tab opens the collection behind the same account
    // gate as the account bar's "我的球员卡". show() re-lights the bar.
    $("[data-tabbar]")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.nav === "cards") {
        if (activeScreenName() === "collection") return;
        if (!requireAccountReady({ zh: "我的球员卡", en: "My Player Cards" })) return;
        openCollection();
        return;
      }
      if (btn.dataset.category && activeScreenName() !== "home") show("home");
      else syncAppTabbar();
    });
    syncAppTabbar();
    // Legacy Museum (篮球人生博物馆): the honours wall's earned titles open the
    // career legacy detail view (user decision 2026-11-10, after 375b75d).
    // My Home screen — Screen Shell: mount once at boot (museum pattern); open() only renders.
    const myHome = createMyHome({ getLang, getModel: () => myWorld.homeModel(), show, goBack, onOpenShop: (category) => shop?.open({ category }) });
    screens.myHome = myHome.mount();
    const legacyMuseumView = createLegacyMuseumView({ getLang, getAccount: activeAccount, show, goBack });
    screens.legacyMuseum = legacyMuseumView.mount();
    myWorld = createMyWorld({
      el: $("#my-world-root"),
      getLang,
      mountAvatar: deferUntil(bootGate, (stage, opts) => chooseAvatarMount()(stage, opts)), // the portrait stays until the figure is allowed to load
      getAccount: activeAccount,
      onPortraitChanged: refreshAccountAvatar,
      readRootSave: () => currentCareerRoot(),
      topCards: (account) => resolvePlayers(account.playerIds || [], account).sort((a, b) => overall(b) - overall(a)).slice(0, 3),
      readSession: peekSave,
      sessionLabel: (meta, lang) => formatSaveLabel(meta, lang),
      readSeason: () => (hasSeasonSave() ? rawSeasonSave() : null),
      seasonLabel: (st, lang) => { try { return seasonProgressLabel(st, lang); } catch { return ""; } }, // a damaged season must not break boot
      deleteSave: deleteUnlinkedSave,
      readMyTeam: () => readMyTeamSeason(),
      myTeamLabel: (st, lang) => {
        try {
          const r = st?.myTeam?.result;
          if (r) return lang === "en" ? `Finished · ${r.champion ? "champions · " : ""}${r.w}-${r.l}` : `已完成 · ${r.champion ? "夺冠 · " : ""}${r.w}胜${r.l}负`;
          return seasonProgressLabel(st, lang);
        } catch { return ""; }
      },
      myTeamSigOf: myTeamSig,
      onResumeMyTeam: resumeMyTeamSeason,
      confirm: (message) => confirmAction(message, { title: L("认领本机存档？", "Claim this local save?"), acceptLabel: L("确认认领", "Claim it") }),
      onResumeCareer: () => !careerHidden() && resumeLongCareer(currentCareerRoot()),
      onResumeSession: () => continueFromSave(),
      onClaimed: () => { refreshLongCareerHomeBar(); refreshSaveHomeBar(); },
      onOpenCollection: () => openCollection(),
      onOpenAccounts: () => openAccountScreen(),
      onOpenShop: (category) => shop?.open({ category }),
      onOpenHome: () => myHome.open(),
      onOpenLegacyMuseum: (titleId) => legacyMuseumView.open(titleId),
      onStartCareer: () => activateHomeTab?.("career"),
      onIdentitySaved: () => refreshAccountHomeBar(),
      // M4-B Hometown Legends wiring (the section itself lives in hometownView.js).
      hometownNames: (account) => {
        const names = {};
        const brefs = new Set(LEGEND_LOCATIONS.map((r) => r.bref));
        const idol = readHometownState(account).idolBref;
        if (idol) brefs.add(idol);
        for (const bref of brefs) {
          const card = bestCardByBref(bref);
          if (card) names[bref] = card.name;
        }
        return names;
      },
      hometownChallengeAvailable: (account) => !!hometownChallengeFor(account),
      hometownKnownBrefs: () => new Set(PLAYERS.map((p) => p.bref)),
      onSearchIdol: (query) => {
        const seen = new Set();
        return searchPeople(PLAYERS, query, { ovrOf: overall })
          .filter((p) => (seen.has(p.bref) ? false : (seen.add(p.bref), true)))
          .slice(0, 8)
          .map((p) => ({ bref: p.bref, name: `${p.name} · ${p.season}` }));
      },
      onPlayHometownChallenge: () => startHometownChallenge(),
    });
    // Legend Duel screen (created dynamically by duelView) + view wiring.
    // Screen Shell: mount once at boot (museum pattern); open() only renders.
    screens.duel = ensureDuelScreen({ getLang });
    initDuelView({ show, goBack });
    // Player Reborn — the public entry. The Career Player card routes
    // here (onPlay "player" above); ?reborn=1 opens it directly.
    // open() shows the creation flow for a new run, or resumes the run.
    // Screen Shell: mount once at boot (museum pattern); open() only renders.
    rebornView = createRebornView({
      getLang,
      readRootSave: () => currentCareerRoot(),
      writeRootSave,
      show,
      goBack,
      // M4-C: the view snapshots the account's identity places when a
      // Reborn career is created; injected like the other views' getAccount.
      getAccount: activeAccount,
      saveAccount,
    });
    screens.reborn = rebornView.mount();
    // Career Relationships dev entry (workstream E): the relationships /
    // promises / legacy panel for the active account. ?relationships=1
    // opens it after boot (below). It never invents offers or
    // transitions — those come from the Opportunity engine (workstream G).
    // Screen Shell: mount once at boot (museum pattern); open() only renders.
    const relationshipsView = createRelationshipsView({
      getLang,
      getAccount: activeAccount,
      saveAccount,
      readRootSave: () => currentCareerRoot(),
      writeRootSave,
      show,
      goBack,
    });
    screens.relationships = relationshipsView.mount();
    // Shared Career Inbox (workstream A): the dev entry is ?inbox=1 below;
    // the view itself is reachable from the Career entry later.
    // Screen Shell: mount once at boot (museum pattern); open() only renders.
    careerInboxView = createCareerInboxView({
      getLang,
      readRootSave: () => currentCareerRoot(),
      writeRootSave,
      show,
      goBack,
      getAccount: activeAccount,
      saveAccount,
    });
    screens.careerInbox = careerInboxView.mount();
    // GM Executive Dynasty dev entry (workstream F): ?gm-business=1 opens the
    // three-season business scenario after boot.
    // Screen Shell: mount once at boot (museum pattern); open() only renders.
    let gmBusinessView = null;
    gmBusinessView = createGmBusinessView({
      getLang,
      readRootSave: () => currentCareerRoot(),
      writeRootSave,
      show,
      goBack,
    });
    screens.gmBusiness = gmBusinessView.mount();
    // GM draft gamble (workstream C): the 1996 scouting/draft slice.
    // ?draft-gamble=1 opens it directly after boot. open() shows the
    // scout phase for a new run, or resumes the saved run.
    // Screen Shell: mount once at boot (museum pattern); open() only renders.
    const draftGambleView = createDraftGambleView({
      getLang,
      readRootSave: () => currentCareerRoot(),
      writeRootSave,
      show,
      goBack,
    });
    screens.draftGamble = draftGambleView.mount();
    // Coach tactical depth (workstream B) — the comeback-challenge slice.
    // Dev entry ?coach-tactics=1 opens it after boot (see below).
    // Screen Shell: mount once at boot (museum pattern); open() only renders.
    const coachingMomentView = createCoachingMomentView({
      getPool: () => PLAYERS,
      show,
      goBack,
    });
    screens.coachTactics = coachingMomentView.mount();
    // [Career 2.0 G] Basketball Career Network — dev entries only
    // (?scout=1 / ?film=1 / ?analytics=1 / ?network=1). The public entry
    // is an integration follow-up once the slices land.
    // Screen Shell: mount once at boot (museum pattern); open() only renders.
    networkView = createNetworkView({
      getLang,
      getAccountId: () => activeAccount()?.id || null,
      show,
      goBack,
    });
    screens.network = networkView.mount();
    myTeamLineup = createMyTeamLineup({
      el: $("#my-team-lineup-root"),
      getLang,
      getAccount: activeAccount,
      saveLineup: saveMyTeamLineup,
      clearLineup: clearMyTeamLineup,
      onOpenAccounts: () => openAccountScreen(),
      getResume: myTeamResumeLabel,
      onStartSeason: startMyTeamSeason,
      onResumeSeason: resumeMyTeamSeason,
    });
    // My Team Clubhouse (workstream D): the My Team home — hero, court, wall, season, honours.
    // The lineup editor stays one click away inside it ("编辑阵容").
    myTeamClubhouse = createMyTeamClubhouse({
      el: $("#my-team-clubhouse-root"),
      getLang,
      getAccount: activeAccount,
      saveLineup: saveMyTeamLineup,
      getResume: myTeamResumeLabel,
      getSeason: () => readMyTeamSeason(),
      onStartSeason: startMyTeamSeason,
      onResumeSeason: resumeMyTeamSeason,
      onOpenLineup: () => { myTeamLineup.open(); show("myTeamLineup"); },
      onOpenCollection: () => openCollection(),
      onOpenAccounts: () => openAccountScreen(),
    });
    $("#btn-my-lineup-back")?.addEventListener("click", () => goBack());
    $("#load-status").textContent = L("正在加载名册（优先本地缓存）…", "Loading roster (local cache first)…");
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
        $("#load-status").textContent = L(`读取本地缓存 ${pct}%…`, `Reading local cache ${pct}%…`);
      } else if (phase === "download") {
        $("#load-status").textContent = L("下载 / 解析 JSON…", "Downloading / parsing JSON…");
      } else if (phase === "build") {
        sawBuild = true;
        $("#load-status").textContent = L(`构建赛季卡与暗属性 ${pct}%（首次较慢，完成后会分块写入缓存）…`, `Building season cards & hidden traits ${pct}% (slower the first time, cached in chunks after)…`);
      } else {
        $("#load-status").textContent = L("即将进入主界面…", "Almost at the home screen…");
      }
    });
    clearPeakPoolCache();
    window.__rosterBootOk = true;
    bootGate.open();
    audio.prewarm(); // the audio device start-up (0.5-1 s, once per browser) happens now, in idle time, not inside the first tap
    $("#load-bar").style.width = "100%";
    // perf-r3: on the lazy path, PLAYERS is still [] right here (the pool finishes building in
    // idle time after boot) — don't tell the player we loaded 0 cards. Once the backfill finishes
    // we quietly correct the line if the dialog is still showing it.
    $("#load-status").textContent = isPlayersReady()
      ? sawCache && !sawBuild
        ? L(`已从本地缓存加载 ${PLAYERS.length} 张赛季卡`, `Loaded ${PLAYERS.length} season cards from local cache`)
        : L(`已加载 ${PLAYERS.length} 张赛季卡（已写入本地缓存，下次秒开）`, `Loaded ${PLAYERS.length} season cards (cached, next launch is instant)`)
      : L("名册索引就绪，卡片正在后台补建…", "Roster index ready; cards are building in the background…");
    if (!isPlayersReady()) {
      playersReady().then(() => {
        const el = $("#load-status");
        if (el) el.textContent = L(`名册已全部就绪：${PLAYERS.length} 张赛季卡`, `Roster fully ready: ${PLAYERS.length} season cards`);
      });
    }
    const wd = $("#load-watchdog");
    if (wd) wd.hidden = true;
    const poolNote = document.querySelector("#howto-dialog ul");
    if (poolNote) {
      const li = document.createElement("li");
      li.textContent = isPlayersReady()
        ? `卡池 ${PLAYERS.length} 张；换人面板显示板凳头像与属性；传奇模式可从八队历史球员自选位置组队。`
        : `卡池正在后台补建；换人面板显示板凳头像与属性；传奇模式可从八队历史球员自选位置组队。`;
      poolNote.appendChild(li);
    }
    // ADR-004 D5: the read path runs the lazy v3→v4 migration (inside
    // migrateLegacySaves). A failed migration returns the v3 root plus the
    // error instead of throwing, so boot still reaches home and the next
    // boot retries. The call itself is guarded too (D-P1-4): an unexpected
    // throw inside the migrator must not land in the boot catch below, which
    // would blame the roster and strand the player on the loading screen.
    let legacyDiscovery = null;
    try {
      legacyDiscovery = migrateLegacySaves();
    } catch (error) {
      legacyDiscovery = { root: null, migrationError: error };
    }
    const discovered = legacyDiscovery?.root || readRootSave() || null;
    if (legacyDiscovery?.migrationError) {
      console.warn("[long-career-migration]", legacyDiscovery.migrationError);
      alert(L(
        `旧存档升级失败（${legacyDiscovery.migrationError.message}），原存档已保留；你仍可继续游玩，下次启动时会重试升级。`,
        `Upgrading the old save failed (${legacyDiscovery.migrationError.message}); the original is kept. You can keep playing — the upgrade will be retried on the next launch.`,
      ));
    }
    state.longCareerRoot = discovered;
    stampLegacySaves({ career: discovered, session: peekSave(), season: hasSeasonSave() ? rawSeasonSave() : null, myteam: readMyTeamSeason() }); // pre-ownership saves stay unassociated
    // D-P1-2: a corrupt account store is quarantined, never overwritten — but the player
    // would otherwise just see an empty guest bar with no explanation. Tell them now, before
    // any write attempt, and point at the account screen where the backup can be downloaded
    // or the damaged store discarded. (Same one-alert-per-boot pattern as the migration
    // failure above: the damage persists until the player acts on it.)
    if (isAccountStoreCorrupt()) {
      alert(L(
        "账号数据已损坏，原始数据已自动备份，未被覆盖。损坏期间账号写入会被拒绝，数据不会丢失。请前往「账号」页下载备份，或删除损坏的账号库重新开始。",
        "Your account data is damaged; the original bytes were automatically backed up and not overwritten. Account writes are refused while it stays damaged, so nothing is lost. Go to the Accounts page to download the backup or discard the damaged store and start fresh.",
      ));
    }
    refreshAccountHomeBar();
    setTimeout(() => show("home"), 200);
    // Developer entry points (?reborn=1, ?inbox=1, ?career=coach, ...): devEntries.js decides WHICH the URL asks for;
    // this table is what each one does. `now` runs at once, `later` once home has painted. They are independent.
    const devEntryActions = {
      reborn: { later: () => openRebornGuarded() },
      relationships: { later: () => relationshipsView.open() },
      inbox: { later: () => careerInboxView.open() },
      // Reborn's season screen carries the awakening progress panel; a skill fired there lands on the card next game.
      awakening: { later: () => openRebornGuarded() },
      "gm-business": { later: () => gmBusinessView.open(gmBusinessView.createScenario({ players: PLAYERS }), PLAYERS) },
      // Time Travel creation with the Coach role pre-set (ADR-006 R4), same path as the Career entry's Coach card.
      "career-coach": { now: () => setPrologueRole("COACH"), later: () => startMode("timeTravel") },
      "coach-tactics": { later: () => coachingMomentView.open() },
      "draft-gamble": { later: () => draftGambleView.open() },
      network: { later: (board) => networkView.open(board) },
    };
    for (const { key, arg } of devEntriesFromSearch(location.search)) {
      devEntryActions[key].now?.();
      setTimeout(() => { devEntryActions[key].later(arg); }, DEV_ENTRY_DELAY_MS);
    }
  } catch (e) {
    console.error(e);
    const quotaError = /quota|storage quota|存储空间/i.test(e?.message || "");
    $("#load-status").textContent = quotaError
      ? L(`本地存档写入失败：${e.message}。名册本身未必损坏。`, `Couldn't write the local save: ${e.message}. The roster itself may be fine.`)
      : L(`名册加载失败：${e.message}。请确认用本地服务器打开（当前应为 http://127.0.0.1:5173）。`, `Couldn't load the roster: ${e.message}. Open the game from a local server (http://127.0.0.1:5173).`);
    const tip = $("#load-watchdog");
    if (tip) {
      tip.hidden = false;
      if (quotaError) {
        tip.innerHTML = `${L("请清理名册缓存后重启：", "Clear the roster cache, then restart: ")}<button type="button" class="btn small" id="btn-recover-storage">${L("清理缓存并重启", "Clear cache and restart")}</button>`;
        $("#btn-recover-storage")?.addEventListener("click", async () => {
          await clearRosterCache();
          try { localStorage.removeItem("cls_root_v3_tmp"); } catch (_) { /* best effort */ }
          location.reload();
        });
      } else {
        tip.textContent = L("可尝试强制刷新（Cmd+Shift+R），或点主页「清除名册本地缓存」后再开。", "Try a hard refresh (Cmd+Shift+R), or use Clear local roster cache on the home screen and open the game again.");
      }
    }
  }
}

$("#btn-clear-roster-cache")?.addEventListener("click", async () => {
  const btn = $("#btn-clear-roster-cache");
  if (btn) btn.disabled = true;
  try {
    await clearRosterCache();
    alert(L("名册缓存已清除。刷新页面将重新下载并构建赛季卡。", "Roster cache cleared. Refresh the page to download it again and rebuild the season cards."));
  } catch (e) {
    alert(L(`清除失败：${e.message}`, `Couldn't clear the cache: ${e.message}`));
  } finally {
    if (btn) btn.disabled = false;
  }
});

boot();
