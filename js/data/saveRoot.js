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
    || (root.activeMode !== null && typeof root.activeMode !== "string")
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
  const existingRoot = readRootSave(target);
  if (existingRoot) {
    return { root: existingRoot, source: ROOT_SAVE_KEY };
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
