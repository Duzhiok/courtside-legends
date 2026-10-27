import { advanceLeagueOffseason } from "../engine/season.js";
import { withPickLedger } from "../engine/pickLedger.js";
import {
  advanceDraftToUserPick,
  applyPickOwnership,
  buildNaturalPicks,
  createDraftState,
  selectDraftProspect,
} from "../engine/leagueDraft.js";
import {
  pruneDevelopmentPlans,
  reconcileDevelopmentPlans,
  validateDevelopmentPlans,
} from "./playerDevelopment.js";

const CAREER_KINDS = new Set(["franchise", "timeTravel"]);
const SEASON_PROGRESS_MODES = new Set(["season", "franchise", "timeTravel"]);

export function isSeasonProgressMode(mode) {
  return SEASON_PROGRESS_MODES.has(mode);
}

export function hasExistingCareerRoot(root) {
  return Boolean(root?.leagueCareer);
}

export function resolveRootLiveGame(mode, includedLiveGame, cachedLiveGame) {
  if (mode === "include") return includedLiveGame ?? null;
  if (mode === "clear") return null;
  if (mode === "preserve") return cachedLiveGame ?? null;
  throw new TypeError("live game mode must be include, clear, or preserve");
}

function requireCareer(career) {
  if (!career || typeof career !== "object") {
    throw new TypeError("career must be an object");
  }
  return career;
}

function requireSeason(season) {
  if (!season || typeof season !== "object" || Array.isArray(season)) {
    throw new TypeError("season must be a non-null object");
  }
  return season;
}

function requireName(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function cloneCategoryMap(groups, category) {
  return {
    ...(groups || {}),
    [category]: { ...(groups?.[category] || {}) },
  };
}

export function createLeagueCareer({ kind, season, storyId, careerId } = {}) {
  if (!CAREER_KINDS.has(kind)) {
    throw new TypeError('kind must be either "franchise" or "timeTravel"');
  }
  requireSeason(season);

  return {
    careerId: careerId || `career-${Date.now()}`,
    kind,
    storyId: storyId || null,
    phase: season.phase,
    season,
    history: [],
    manualOverrides: {},
    recommendations: {},
    management: {
      draft: null,
      draftHistory: [],
      seasonHistory: [],
      developmentPlans: {},
    },
  };
}

export function upgradeLeagueCareerManagement(career) {
  requireCareer(career);
  requireSeason(career.season);
  const upgraded = {
    ...career,
    phase: career.season.phase,
    history: [...(career.history || [])],
    manualOverrides: { ...(career.manualOverrides || {}) },
    recommendations: { ...(career.recommendations || {}) },
    management: careerManagement(career),
  };
  return recoverCareerPhase(upgraded);
}

export function setManualOverride(career, category, key, value) {
  requireCareer(career);
  requireName(category, "category");
  requireName(key, "key");

  const manualOverrides = cloneCategoryMap(career.manualOverrides, category);
  const recommendations = cloneCategoryMap(career.recommendations, category);
  manualOverrides[category][key] = value;
  recommendations[category][key] = value;

  return { ...career, manualOverrides, recommendations };
}

export function clearManualOverride(career, category, key) {
  requireCareer(career);
  requireName(category, "category");
  requireName(key, "key");

  const manualOverrides = cloneCategoryMap(career.manualOverrides, category);
  const recommendations = cloneCategoryMap(career.recommendations, category);
  delete manualOverrides[category][key];

  return { ...career, manualOverrides, recommendations };
}

export function applyRecommendation(career, category, recommendations) {
  requireCareer(career);
  requireName(category, "category");
  if (
    !recommendations ||
    typeof recommendations !== "object" ||
    Array.isArray(recommendations)
  ) {
    throw new TypeError("recommendations must be a non-null object");
  }

  const manualOverrides = cloneCategoryMap(career.manualOverrides, category);
  const nextRecommendations = cloneCategoryMap(career.recommendations, category);
  nextRecommendations[category] = {
    ...nextRecommendations[category],
    ...recommendations,
    ...manualOverrides[category],
  };

  return {
    ...career,
    manualOverrides,
    recommendations: nextRecommendations,
  };
}

export function recordCareerEvent(career, event, at = Date.now()) {
  requireCareer(career);
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("event must be a non-null object");
  }

  return {
    ...career,
    history: [...(career.history || []), { ...event, at }],
  };
}

export function syncCareerPhase(career) {
  requireCareer(career);
  requireSeason(career.season);
  return { ...career, phase: career.season.phase };
}

export function recoverCareerPhase(career) {
  if (!career?.management || career.season?.phase !== "done") return career;
  const draft = career.management.draft;
  if (
    !draft ||
    draft.year !== career.season.year ||
    !["in_progress", "complete"].includes(draft.status)
  ) {
    return career;
  }
  const offseasonCompleted = (career.history || []).some(
    (event) =>
      event?.type === "offseason-completed" &&
      Number(event.year) >= Number(draft.year),
  );
  if (draft.status === "complete" && offseasonCompleted) return career;
  if (career.phase === "draft") return career;
  return { ...career, phase: "draft" };
}

/**
 * Advances the contained season and synchronizes the immutable career wrapper.
 * advanceLeagueOffseason mutates the nested season object for backward compatibility.
 */
export function advanceCareerOffseason(career) {
  if (!career?.season) {
    throw new TypeError("career with a season is required");
  }
  if (career.management !== undefined) {
    return {
      career,
      result: {
        ok: false,
        reason: "managed careers use staged prepareCareerOffseason and completeCareerOffseason",
      },
    };
  }

  const result = advanceLeagueOffseason(career.season);
  return { career: syncCareerPhase(career), result };
}

function compactCompletedDraft(draft) {
  if (!draft || draft.status !== "complete") return draft || null;
  return {
    year: draft.year,
    seed: draft.seed,
    order: [...(draft.order || [])],
    currentPick: draft.currentPick,
    selections: structuredClone(draft.selections || []),
    status: draft.status,
    prospects: [],
  };
}

function careerManagement(career) {
  return {
    ...(career.management || {}),
    draft: compactCompletedDraft(career.management?.draft),
    draftHistory: (career.management?.draftHistory || []).map(
      compactCompletedDraft,
    ),
    seasonHistory: [...(career.management?.seasonHistory || [])],
    developmentPlans: { ...(career.management?.developmentPlans || {}) },
  };
}

function compactAward(entry) {
  if (!entry) return null;
  return {
    playerId: entry.playerId,
    name: entry.name,
    teamId: entry.teamId,
  };
}

function userReachedPlayoffs(season, teamId) {
  const conferences = [season.playoffs?.east, season.playoffs?.west];
  return conferences.some((conference) =>
    (conference?.series || []).some(
      (series) => series?.high?.id === teamId || series?.low?.id === teamId,
    ),
  );
}

/**
 * Career timeline prose. Descriptions are computed at season-completion
 * time and stored, so both languages are stored side by side (old histories
 * without descriptionEn fall back to the Chinese text at render time).
 */
export function transactionDescription(entry, lang = "zh") {
  const en = lang === "en";
  if (entry.type === "sign" || entry.type === "cut") {
    return String(entry.name || entry.playerId || (en ? "Unknown player" : "未知球员"));
  }
  if (entry.type === "trade") {
    const outgoing = (entry.give || []).map((player) => player?.name).filter(Boolean).join(en ? ", " : "、") || "—";
    const incoming = (entry.get || []).map((player) => player?.name).filter(Boolean).join(en ? ", " : "、") || "—";
    return en
      ? `${entry.withName || entry.with || "Opponent"}: sent ${outgoing}, got ${incoming}`
      : `${entry.withName || entry.with || "对手球队"}：送出 ${outgoing}，得到 ${incoming}`;
  }
  if (entry.type === "trade_3team") {
    const outgoing = (entry.give || []).map((player) => player?.name).filter(Boolean).join(en ? ", " : "、") || "—";
    const incoming = (entry.get || []).map((player) => player?.name).filter(Boolean).join(en ? ", " : "、") || "—";
    const via = entry.withName || entry.with || (en ? "a third team" : "第二支球队");
    return en
      ? `3-team deal via ${via}: sent ${outgoing}, got ${incoming}`
      : `三方交易（经 ${via}）：送出 ${outgoing}，得到 ${incoming}`;
  }
  if (entry.type === "trade_declined") {
    const from = entry.target || entry.from || (en ? "a team" : "对方球队");
    return en ? `Declined an offer from ${from}` : `拒绝了 ${from} 的交易报价`;
  }
  if (entry.type === "hire_coach" || entry.type === "hire_assistant") {
    return entry.replaced
      ? en
        ? `${entry.name || "Unknown staff"} (replacing ${entry.replaced})`
        : `${entry.name || "未知职员"}（替换 ${entry.replaced}）`
      : String(entry.name || (en ? "Unknown staff" : "未知职员"));
  }
  return String(entry.name || (en ? "Unknown staff" : "未知职员"));
}

function compactTransactions(season, includeLegacy) {
  return (season.tradeLog || [])
    .filter(
      (entry) =>
        entry?.year === season.year ||
        (includeLegacy && entry?.year === undefined),
    )
    .slice(-20)
    .map((entry) => {
      const description = transactionDescription(entry).slice(0, 200);
      const descriptionEn = transactionDescription(entry, "en").slice(0, 200);
      return {
        type: String(entry.type),
        year: season.year,
        day: Number.isInteger(entry.day) ? entry.day : 0,
        description,
        descriptionEn,
      };
    });
}

function annualSummary(season, { includeLegacyTransactions = false } = {}) {
  const teamId = season.userTeamId;
  const record = season.standings?.[teamId];
  if (
    !record ||
    !Number.isFinite(record.w) ||
    !Number.isFinite(record.l)
  ) {
    throw new TypeError("completed season requires a valid user-team record");
  }
  const championId = season.playoffs?.championId || null;
  const finals = season.playoffs?.finals;
  const finalist =
    finals?.high?.id === teamId || finals?.low?.id === teamId;
  const finish =
    championId === teamId
      ? "champion"
      : finalist
        ? "finals"
        : userReachedPlayoffs(season, teamId)
          ? "playoffs"
          : "lottery";
  const summary = {
    year: season.year,
    teamId,
    teamName:
      season.teams?.[teamId]?.name
      || season.league?.labels?.[teamId]
      || teamId,
    record: { w: record.w, l: record.l },
    championId,
    finish,
    awards: {
      mvp: compactAward(season.awards?.mvp),
      dpoy: compactAward(season.awards?.dpoy),
      roy: compactAward(season.awards?.roy),
    },
    transactions: compactTransactions(season, includeLegacyTransactions),
  };
  return summary;
}

function appendSeasonCompletedEvent(history, year) {
  const existing = (history || []).find(
    (event) => event?.type === "season-completed" && event.year === year,
  );
  const events = (history || []).filter(
    (event) => !(event?.type === "season-completed" && event.year === year),
  );
  const event = {
    ...(existing || {}),
    type: "season-completed",
    year,
    at: year * 10000 - 1,
  };
  const draftIndex = events.findIndex(
    (entry) =>
      entry?.year === year &&
      (entry.type === "draft-opened" || entry.type === "draft-completed"),
  );
  if (draftIndex < 0) return [...events, event];
  return [
    ...events.slice(0, draftIndex),
    event,
    ...events.slice(draftIndex),
  ];
}

export function prepareCareerOffseason(career) {
  requireCareer(career);
  requireSeason(career.season);
  if (career.season.phase !== "done") {
    throw new Error("career season must be done before preparing the offseason");
  }
  if (!career.management || typeof career.management !== "object") {
    throw new Error("managed career data is required for staged offseason preparation");
  }
  const year = career.season.year;
  if (
    (career.management.seasonHistory || []).some(
      (summary) => summary.year === year,
    )
  ) {
    throw new Error(`season summary for ${year} already exists`);
  }

  const working = structuredClone(career);
  const summary = annualSummary(working.season, {
    includeLegacyTransactions:
      (working.management?.seasonHistory || []).length === 0,
  });
  working.management = careerManagement(working);
  working.management.seasonHistory.push(summary);
  working.history = appendSeasonCompletedEvent(working.history, year);
  if (
    working.management.draft?.status === "complete" &&
    working.management.draft.year === year
  ) {
    return {
      ...working,
      phase: "draft",
    };
  }
  const drafted = beginCareerDraft(working);
  return {
    ...drafted,
    phase: "draft",
  };
}

export function completeCareerOffseason(career) {
  requireCareer(career);
  requireSeason(career.season);
  const draft = career.management?.draft;
  const year = career.season.year;
  if (career.phase !== "draft") {
    throw new Error("career must be in the draft phase before completing the offseason");
  }
  if (!draft || draft.status !== "complete" || draft.year !== year) {
    throw new Error("current-year draft must be complete before completing the offseason");
  }
  if (
    !(career.management?.seasonHistory || []).some(
      (summary) => summary.year === year,
    )
  ) {
    throw new Error("current-year season summary is required");
  }
  const reconciled = reconcileDevelopmentPlans(career);
  validateDevelopmentPlans(reconciled);

  const working = structuredClone(reconciled);
  const result = advanceLeagueOffseason(working.season, {
    developmentPlans: working.management.developmentPlans || {},
  });
  if (!result.ok) {
    throw new Error(result.reason || "failed to complete offseason");
  }
  const pruned = pruneDevelopmentPlans(working);
  return {
    result,
    career: {
      ...pruned,
      phase: "regular",
      history: [
        ...(pruned.history || []),
        {
          type: "offseason-completed",
          year,
          nextYear: working.season.year,
          at: year * 10000 + 2,
        },
      ],
    },
  };
}

function withCompletedDraft(career, draft, management, history) {
  if (
    draft.status !== "complete" ||
    management.draftHistory.some(
      (entry) => entry.year === draft.year && entry.seed === draft.seed,
    )
  ) {
    return { ...career, management: { ...management, draft }, history };
  }
  const compactDraft = compactCompletedDraft(draft);
  return {
    ...career,
    management: {
      ...management,
      draft: compactDraft,
      draftHistory: [...management.draftHistory, structuredClone(compactDraft)],
    },
    history: [
      ...history,
      {
        type: "draft-completed",
        year: draft.year,
        selections: draft.selections.length,
        at: draft.year * 10000 + 1,
      },
    ],
  };
}

/**
 * Career wrappers are immutable. Draft selections intentionally mutate the
 * nested season rosters for compatibility with the existing season engines.
 */
export function beginCareerDraft(input) {
  requireCareer(input);
  requireSeason(input.season);
  // An older save may have traded picks as per-club tokens; bring its ledger up to date first so the
  // draft sees those trades even if the trade market was never opened. The result is carried in the
  // returned career, so this happens once.
  const career = { ...input, season: withPickLedger(input.season) };
  if (career.season.phase !== "done") {
    throw new Error("career season must be done before beginning the draft");
  }
  if (career.management?.draft?.status === "in_progress") {
    throw new Error("career already has an active incomplete draft");
  }
  if (
    career.management?.draft?.status === "complete" &&
    career.management.draft.year === career.season.year
  ) {
    throw new Error("career draft for this season is already completed");
  }

  const seed = `${career.careerId}:${career.season.year}:draft`;
  // Traded picks change who owns which slot: build the pick list from the
  // season's ownership map (set by pick swaps during the season).
  const picks = applyPickOwnership(
    buildNaturalPicks(career.season),
    career.season?.pickOwnership?.[career.season.year],
  );
  // Career drafts are two rounds: round 2 extends the same draft state
  // (same year, same ownership map) when round 1 completes.
  const created = createDraftState({ season: career.season, seed, picks, rounds: 2 });
  const draft = advanceDraftToUserPick(created, career.season);
  const management = careerManagement(career);
  const history = [
    ...(career.history || []),
    {
      type: "draft-opened",
      year: draft.year,
      order: [...draft.order],
      at: draft.year * 10000,
    },
  ];
  return withCompletedDraft(career, draft, management, history);
}

export function makeCareerDraftPick(career, prospectId, options = {}) {
  requireCareer(career);
  requireSeason(career.season);
  const draft = career.management?.draft;
  if (!draft || draft.status !== "in_progress") {
    throw new Error("career requires an active draft in progress");
  }
  if (draft.order[draft.currentPick] !== career.season.userTeamId) {
    throw new Error("draft pick is not the user's turn");
  }

  const selected = selectDraftProspect(
    draft,
    career.season,
    prospectId,
    options,
  );
  const advanced = advanceDraftToUserPick(selected, career.season);
  const management = careerManagement(career);
  return withCompletedDraft(
    career,
    advanced,
    management,
    [...(career.history || [])],
  );
}
