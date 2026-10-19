import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOT_SAVE_KEY,
  createRootState,
  writeRootSave,
  readRootSave,
  clearRootSave,
  exportRootSave,
  importRootSave,
  migrateLegacySaves,
} from "../js/data/saveRoot.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

const TEMP_ROOT_SAVE_KEY = "cls_root_v3_tmp";
const LEGACY_GAME_KEY = "cls_savegame_v1";
const LEGACY_SEASON_KEY = "cls_season_v1";

test("time-travel root saves round-trip through storage", () => {
  const storage = createMemoryStorage();
  const root = createRootState({
    activeMode: "timeTravel",
    story: { timelineId: "timeline-1" },
  });

  writeRootSave(root, storage);

  assert.ok(root.savedAt > 0);
  assert.deepEqual(readRootSave(storage), root);
  assert.equal(storage.getItem(TEMP_ROOT_SAVE_KEY), null);
});

test("exported root save imports to the same state", () => {
  const root = createRootState({
    savedAt: 123,
    activeMode: "franchise",
    leagueCareer: { careerId: "career-1" },
  });

  assert.deepEqual(importRootSave(exportRootSave(root)), root);
});

for (const version of [1, 2]) {
  test(`legacy season v${version} becomes a franchise career and remains stored`, () => {
    const legacy = { v: version, phase: "playoffs", seasonNumber: 4 };
    const storage = createMemoryStorage({
      [LEGACY_SEASON_KEY]: JSON.stringify(legacy),
    });

    const migrated = migrateLegacySaves(storage);

    assert.equal(migrated.source, LEGACY_SEASON_KEY);
    assert.equal(migrated.root.activeMode, "franchise");
    assert.deepEqual(migrated.root.leagueCareer, {
      kind: "franchise",
      careerId: "legacy-season",
      phase: legacy.phase,
      season: legacy,
      history: [],
    });
    assert.deepEqual(readRootSave(storage), migrated.root);
    assert.equal(storage.getItem(LEGACY_SEASON_KEY), JSON.stringify(legacy));
  });
}

test("valid legacy live game is migrated when no valid season exists", () => {
  const legacySession = { v: 1, quarter: 3, score: [81, 78] };
  const invalidSeason = { v: 3, phase: "unsupported" };
  const storage = createMemoryStorage({
    [LEGACY_SEASON_KEY]: JSON.stringify(invalidSeason),
    [LEGACY_GAME_KEY]: JSON.stringify(legacySession),
  });

  const migrated = migrateLegacySaves(storage);

  assert.equal(migrated.source, LEGACY_GAME_KEY);
  assert.deepEqual(migrated.root.liveGame.legacySession, legacySession);
  assert.equal(storage.getItem(LEGACY_GAME_KEY), JSON.stringify(legacySession));
  assert.equal(storage.getItem(LEGACY_SEASON_KEY), JSON.stringify(invalidSeason));
});

test("import rejects saves from a newer schema version", () => {
  const text = JSON.stringify({
    format: "courtside-legends-save",
    schemaVersion: 999,
    exportedAt: new Date().toISOString(),
    root: createRootState(),
  });

  assert.throws(() => importRootSave(text), /newer game version/);
});

test("import rejects invalid export envelopes", () => {
  assert.throws(
    () => importRootSave(JSON.stringify({ format: "another-game-save" })),
    /invalid save file/,
  );
  assert.throws(() => importRootSave("{"), /invalid save file/);
});

test("import rejects roots without a schema version", () => {
  const root = createRootState();
  delete root.schemaVersion;
  const text = JSON.stringify({
    format: "courtside-legends-save",
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    root,
  });

  assert.throws(() => importRootSave(text), /invalid save file/);
});

test("corrupt stored JSON is ignored without changing storage", () => {
  const storage = createMemoryStorage({
    [ROOT_SAVE_KEY]: "{corrupt",
    [LEGACY_SEASON_KEY]: "{also-corrupt",
    [LEGACY_GAME_KEY]: "{still-corrupt",
  });
  const before = storage.dump();

  assert.equal(readRootSave(storage), null);
  assert.equal(migrateLegacySaves(storage), null);
  assert.deepEqual(storage.dump(), before);
});

test("migration returns an existing valid root without replacing it", () => {
  const storage = createMemoryStorage();
  const root = createRootState({ savedAt: 42, activeMode: "timeTravel" });
  storage.setItem(ROOT_SAVE_KEY, JSON.stringify(root));
  storage.setItem(LEGACY_SEASON_KEY, "{corrupt");

  const result = migrateLegacySaves(storage);

  assert.deepEqual(result, { root, source: ROOT_SAVE_KEY });
  assert.equal(storage.getItem(ROOT_SAVE_KEY), JSON.stringify(root));
});

test("clear removes root and temporary saves but preserves legacy saves", () => {
  const storage = createMemoryStorage({
    [ROOT_SAVE_KEY]: "{}",
    [TEMP_ROOT_SAVE_KEY]: "{}",
    [LEGACY_SEASON_KEY]: "season",
    [LEGACY_GAME_KEY]: "game",
  });

  clearRootSave(storage);

  assert.deepEqual(storage.dump(), {
    [LEGACY_SEASON_KEY]: "season",
    [LEGACY_GAME_KEY]: "game",
  });
});
