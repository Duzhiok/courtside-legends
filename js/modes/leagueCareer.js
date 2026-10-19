import { advanceLeagueOffseason } from "../engine/season.js";
import {
  advanceDraftToUserPick,
  createDraftState,
  selectDraftProspect,
} from "../engine/leagueDraft.js";

const CAREER_KINDS = new Set(["franchise", "timeTravel"]);
const SEASON_PROGRESS_MODES = new Set(["season", "franchise", "timeTravel"]);

export function isSeasonProgressMode(mode) {
  return SEASON_PROGRESS_MODES.has(mode);
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
    },
  };
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

/**
 * Advances the contained season and synchronizes the immutable career wrapper.
 * advanceLeagueOffseason mutates the nested season object for backward compatibility.
 */
export function advanceCareerOffseason(career) {
  if (!career?.season) {
    throw new TypeError("career with a season is required");
  }

  const result = advanceLeagueOffseason(career.season);
  return { career: syncCareerPhase(career), result };
}

function careerManagement(career) {
  return {
    ...(career.management || {}),
    draft: career.management?.draft || null,
    draftHistory: [...(career.management?.draftHistory || [])],
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
  return {
    ...career,
    management: {
      ...management,
      draft,
      draftHistory: [...management.draftHistory, structuredClone(draft)],
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
export function beginCareerDraft(career) {
  requireCareer(career);
  requireSeason(career.season);
  if (career.season.phase !== "done") {
    throw new Error("career season must be done before beginning the draft");
  }
  if (career.management?.draft?.status === "in_progress") {
    throw new Error("career already has an active incomplete draft");
  }

  const seed = `${career.careerId}:${career.season.year}:draft`;
  const created = createDraftState({ season: career.season, seed });
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

export function makeCareerDraftPick(career, prospectId) {
  requireCareer(career);
  requireSeason(career.season);
  const draft = career.management?.draft;
  if (!draft || draft.status !== "in_progress") {
    throw new Error("career requires an active draft in progress");
  }
  if (draft.order[draft.currentPick] !== career.season.userTeamId) {
    throw new Error("draft pick is not the user's turn");
  }

  const selected = selectDraftProspect(draft, career.season, prospectId);
  const advanced = advanceDraftToUserPick(selected, career.season);
  const management = careerManagement(career);
  return withCompletedDraft(
    career,
    advanced,
    management,
    [...(career.history || [])],
  );
}
