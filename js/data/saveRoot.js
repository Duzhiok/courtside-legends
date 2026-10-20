export const ROOT_SAVE_KEY = "cls_root_v3";
export const ROOT_SAVE_VERSION = 3;

const TEMP_ROOT_SAVE_KEY = "cls_root_v3_tmp";
const LEGACY_GAME_KEY = "cls_savegame_v1";
const LEGACY_SEASON_KEY = "cls_season_v1";
const EXPORT_FORMAT = "courtside-legends-save";

function getStorage(storage) {
  const resolved = storage ?? globalThis.localStorage;
  if (!resolved) {
    throw new Error("storage is unavailable");
  }
  return resolved;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validateDraft(draft, { completed = false } = {}) {
  const validSeed =
    (typeof draft?.seed === "number" && Number.isFinite(draft.seed))
    || isNonEmptyString(draft?.seed);
  if (
    !isObject(draft)
    || !Number.isInteger(draft.year)
    || !validSeed
    || !Array.isArray(draft.order)
    || !Array.isArray(draft.prospects)
    || !Array.isArray(draft.selections)
    || !Number.isInteger(draft.currentPick)
    || draft.currentPick < 0
    || !["in_progress", "complete"].includes(draft.status)
    || (completed && draft.status !== "complete")
  ) {
    throw new Error("invalid root save");
  }
}

function validateSeasonSummary(summary) {
  if (
    !isObject(summary)
    || !Number.isInteger(summary.year)
    || !isNonEmptyString(summary.teamId)
    || !isObject(summary.record)
    || !Number.isFinite(summary.record.w)
    || summary.record.w < 0
    || !Number.isFinite(summary.record.l)
    || summary.record.l < 0
    || typeof summary.finish !== "string"
    || (
      summary.teamName !== undefined
      && !isNonEmptyString(summary.teamName)
    )
  ) {
    throw new Error("invalid root save");
  }
  if (summary.transactions === undefined) return;
  const transactionTypes = new Set([
    "sign",
    "cut",
    "trade",
    "hire_coach",
    "hire_assistant",
    "fire_coach",
    "fire_assistant",
  ]);
  const transactionKeys = ["day", "description", "type", "year"];
  if (
    !Array.isArray(summary.transactions)
    || summary.transactions.length > 20
    || summary.transactions.some(
      (entry) =>
        !isObject(entry)
        || Object.keys(entry).sort().join(",") !== transactionKeys.join(",")
        || !transactionTypes.has(entry.type)
        || !Number.isInteger(entry.year)
        || entry.year !== summary.year
        || !Number.isInteger(entry.day)
        || entry.day < 0
        || !isNonEmptyString(entry.description)
        || entry.description.length > 200,
    )
  ) {
    throw new Error("invalid root save");
  }
}

function validateManagement(management) {
  if (!isObject(management)) {
    throw new Error("invalid root save");
  }
  if (management.draft !== undefined && management.draft !== null) {
    validateDraft(management.draft);
  }
  if (
    management.draftHistory !== undefined
    && !Array.isArray(management.draftHistory)
  ) {
    throw new Error("invalid root save");
  }
  for (const draft of management.draftHistory || []) {
    validateDraft(draft, { completed: true });
  }
  const draftYears = (management.draftHistory || []).map((draft) => draft.year);
  if (new Set(draftYears).size !== draftYears.length) {
    throw new Error("invalid root save");
  }
  if (
    management.seasonHistory !== undefined
    && !Array.isArray(management.seasonHistory)
  ) {
    throw new Error("invalid root save");
  }
  for (const summary of management.seasonHistory || []) {
    validateSeasonSummary(summary);
  }
  const seasonYears = (management.seasonHistory || []).map(
    (summary) => summary.year,
  );
  if (new Set(seasonYears).size !== seasonYears.length) {
    throw new Error("invalid root save");
  }
  if (
    management.developmentPlans !== undefined
    && !isObject(management.developmentPlans)
  ) {
    throw new Error("invalid root save");
  }
}

function validateLeagueCareer(career) {
  const season = career.season;
  if (
    !isNonEmptyString(career.careerId)
    || !["franchise", "timeTravel"].includes(career.kind)
    || !isNonEmptyString(career.phase)
    || !isObject(season)
    || !isNonEmptyString(season.phase)
    || !Number.isInteger(season.year)
    || !isNonEmptyString(season.userTeamId)
    || !isObject(season.teams)
    || !isObject(season.teams[season.userTeamId])
    || !Array.isArray(season.schedule)
    || !Array.isArray(career.history)
    || !isObject(career.manualOverrides)
    || !isObject(career.recommendations)
  ) {
    throw new Error("invalid root save");
  }
  if (career.management !== undefined) {
    validateManagement(career.management);
  }
}

function validateTimeTravelStory(root) {
  const { leagueCareer: career, story } = root;
  if (
    !isObject(story)
    || !isNonEmptyString(story.storyId)
    || !isNonEmptyString(career.storyId)
    || story.storyId !== career.storyId
    || !isNonEmptyString(story.currentChapter)
    || !isNonEmptyString(story.employer)
    || !Number.isFinite(story.futureKnowledge)
    || !Number.isFinite(story.frontOfficeTrust)
    || !Number.isFinite(story.mediaPressure)
    || !Number.isFinite(story.timelineDivergence)
    || !isObject(story.relationships)
    || !Array.isArray(story.promises)
    || !Array.isArray(story.eventLog)
    || !isObject(story.flags)
    || !validPendingDecision(story.pendingDecision)
  ) {
    throw new Error("invalid root save");
  }
}

function validPendingDecision(value) {
  if (value === null || typeof value === "string") return true;
  return isObject(value)
    && value.type === "story-event"
    && isNonEmptyString(value.eventId)
    && Number.isInteger(value.year);
}

function validateLiveGame(liveGame) {
  if (isObject(liveGame.legacySession)) {
    return;
  }
  if (
    !isObject(liveGame.sim)
    || !Array.isArray(liveGame.feed)
    || !isObject(liveGame.manualOverrides)
    || (
      liveGame.context !== undefined
      && liveGame.context !== null
      && !isObject(liveGame.context)
    )
    || (
      liveGame.seasonPendingGame !== undefined
      && liveGame.seasonPendingGame !== null
      && !isObject(liveGame.seasonPendingGame)
    )
  ) {
    throw new Error("invalid root save");
  }
}

function validateRoot(root) {
  if (!isObject(root)) {
    throw new Error("invalid root save");
  }
  if (!Number.isInteger(root.schemaVersion)) {
    throw new Error("invalid root save");
  }
  if (root.schemaVersion > ROOT_SAVE_VERSION) {
    throw new Error("save was created by a newer game version");
  }
  if (root.schemaVersion < ROOT_SAVE_VERSION) {
    throw new Error("save was created by an unsupported older game version");
  }
  if (
    !Number.isFinite(root.savedAt)
    || ![null, "franchise", "timeTravel"].includes(root.activeMode)
    || !isObject(root.profile)
    || !isObject(root.profile.settings)
    || !isObject(root.profile.accessibility)
    || (root.profile.accountId !== null && typeof root.profile.accountId !== "string")
    || (root.leagueCareer !== null && !isObject(root.leagueCareer))
    || (root.story !== null && !isObject(root.story))
    || (root.liveGame !== null && !isObject(root.liveGame))
  ) {
    throw new Error("invalid root save");
  }
  if (root.leagueCareer) {
    validateLeagueCareer(root.leagueCareer);
    if (root.leagueCareer.kind === "timeTravel") {
      validateTimeTravelStory(root);
    }
  }
  if (root.liveGame) {
    validateLiveGame(root.liveGame);
  }
  return root;
}

function parseJson(text) {
  return JSON.parse(text);
}

function cloneJson(value) {
  return parseJson(JSON.stringify(value));
}

function parseLegacy(storage, key, allowedVersions) {
  const text = storage.getItem(key);
  if (text === null) {
    return null;
  }
  try {
    const value = parseJson(text);
    return isObject(value) && allowedVersions.includes(value.v) ? value : null;
  } catch {
    return null;
  }
}

export function createRootState(overrides = {}) {
  return {
    schemaVersion: ROOT_SAVE_VERSION,
    savedAt: 0,
    activeMode: null,
    profile: { accountId: null, settings: {}, accessibility: {} },
    leagueCareer: null,
    story: null,
    liveGame: null,
    ...overrides,
  };
}

export function writeRootSave(root, storage) {
  const target = getStorage(storage);
  const persisted = cloneJson(root);
  const savedAt = Date.now();
  persisted.savedAt = savedAt;
  validateRoot(persisted);

  const serialized = JSON.stringify(persisted);
  target.setItem(TEMP_ROOT_SAVE_KEY, serialized);
  const verified = parseJson(target.getItem(TEMP_ROOT_SAVE_KEY));
  validateRoot(verified);
  target.setItem(ROOT_SAVE_KEY, JSON.stringify(verified));
  target.removeItem(TEMP_ROOT_SAVE_KEY);
  root.savedAt = savedAt;
  return root;
}

export function readRootSave(storage) {
  try {
    const text = getStorage(storage).getItem(ROOT_SAVE_KEY);
    return text === null ? null : validateRoot(parseJson(text));
  } catch {
    return null;
  }
}

export function clearRootSave(storage) {
  const target = getStorage(storage);
  target.removeItem(ROOT_SAVE_KEY);
  target.removeItem(TEMP_ROOT_SAVE_KEY);
}

export function exportRootSave(root) {
  const exportedRoot = validateRoot(cloneJson(root));
  return JSON.stringify({
    format: EXPORT_FORMAT,
    schemaVersion: ROOT_SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    root: exportedRoot,
  });
}

export function importRootSave(text) {
  let envelope;
  try {
    envelope = parseJson(text);
  } catch {
    throw new Error("invalid save file: malformed JSON");
  }
  if (
    !isObject(envelope)
    || envelope.format !== EXPORT_FORMAT
    || !Number.isInteger(envelope.schemaVersion)
    || typeof envelope.exportedAt !== "string"
    || !isObject(envelope.root)
  ) {
    throw new Error("invalid save file");
  }
  if (envelope.schemaVersion > ROOT_SAVE_VERSION) {
    throw new Error("save file requires a newer game version");
  }
  if (envelope.schemaVersion < ROOT_SAVE_VERSION) {
    throw new Error("save file uses an unsupported older game version");
  }
  try {
    return validateRoot(cloneJson(envelope.root));
  } catch (error) {
    if (/newer game version|older game version/.test(error.message)) {
      throw error;
    }
    throw new Error("invalid save file");
  }
}

export function migrateLegacySaves(storage) {
  const target = getStorage(storage);
  if (target.getItem(ROOT_SAVE_KEY) !== null) {
    const existingRoot = readRootSave(target);
    return existingRoot ? { root: existingRoot, source: ROOT_SAVE_KEY } : null;
  }

  const season = parseLegacy(target, LEGACY_SEASON_KEY, [1, 2]);
  if (season) {
    const root = createRootState({
      activeMode: "franchise",
      leagueCareer: {
        kind: "franchise",
        careerId: "legacy-season",
        phase: season.phase,
        season,
        history: [],
        manualOverrides: {},
        recommendations: {},
      },
    });
    validateRoot(root);
    writeRootSave(root, target);
    return { root, source: LEGACY_SEASON_KEY };
  }

  const legacySession = parseLegacy(target, LEGACY_GAME_KEY, [1]);
  if (legacySession) {
    const root = createRootState({
      liveGame: { legacySession },
    });
    validateRoot(root);
    writeRootSave(root, target);
    return { root, source: LEGACY_GAME_KEY };
  }

  return null;
}
