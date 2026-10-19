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

function validSeason(overrides = {}) {
  return {
    v: 2,
    year: 1991,
    phase: "regular",
    userTeamId: "POR",
    teams: { POR: { id: "POR", players: [] } },
    schedule: [],
    ...overrides,
  };
}

function validStory(overrides = {}) {
  return {
    storyId: "tt-1991-42",
    currentChapter: "prologue",
    employer: "POR",
    futureKnowledge: 3,
    frontOfficeTrust: 52,
    mediaPressure: 20,
    timelineDivergence: 0,
    relationships: {},
    promises: [],
    pendingDecision: "future-knowledge-intro",
    eventLog: [],
    flags: {},
    ...overrides,
  };
}

function exportEnvelope(root) {
  return JSON.stringify({
    format: "courtside-legends-save",
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    root,
  });
}

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

test("time-travel resume preserves career story and pending decision", () => {
  const storage = createMemoryStorage();
  const root = createRootState({
    activeMode: "timeTravel",
    leagueCareer: {
      careerId: "tt-1991-42",
      kind: "timeTravel",
      storyId: "tt-1991-42",
      phase: "regular",
      season: validSeason(),
      history: [],
      manualOverrides: { matchups: { PG: "player-1" } },
      recommendations: {},
    },
    story: validStory(),
    liveGame: {
      context: {
        gameId: "1991-LAL-POR-1",
        homeId: "LAL",
        awayId: "POR",
        youSide: "away",
      },
      seasonPendingGame: { homeId: "LAL", awayId: "POR", played: false },
      sim: {
        v: 1,
        quarter: 3,
        clock: 421,
        score: { home: 71, away: 74 },
      },
      feed: [{ type: "score", text: "POR 74-71 LAL" }],
      manualOverrides: { matchups: { PG: "player-1" } },
    },
  });

  writeRootSave(root, storage);
  const resumed = readRootSave(storage);

  assert.equal(resumed.activeMode, "timeTravel");
  assert.deepEqual(resumed.leagueCareer, root.leagueCareer);
  assert.deepEqual(resumed.story, root.story);
  assert.deepEqual(resumed.liveGame, root.liveGame);
  assert.equal(resumed.story.pendingDecision, "future-knowledge-intro");
  assert.equal(resumed.leagueCareer.manualOverrides.matchups.PG, "player-1");
  assert.equal(resumed.liveGame.sim.clock, 421);
  assert.deepEqual(resumed.liveGame.seasonPendingGame, root.liveGame.seasonPendingGame);
});

test("exported root save imports to the same state", () => {
  const root = createRootState({
    savedAt: 123,
    activeMode: "franchise",
    leagueCareer: {
      careerId: "career-1",
      kind: "franchise",
      phase: "regular",
      season: validSeason(),
      history: [],
      manualOverrides: {},
      recommendations: {},
    },
  });

  assert.deepEqual(importRootSave(exportRootSave(root)), root);
});

for (const version of [1, 2]) {
  test(`legacy season v${version} becomes a franchise career and remains stored`, () => {
    const legacy = validSeason({ v: version, phase: "playoffs", seasonNumber: 4 });
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
      manualOverrides: {},
      recommendations: {},
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

test("import rejects an unsupported root active mode", () => {
  const root = createRootState({ activeMode: "season" });

  assert.throws(() => importRootSave(exportEnvelope(root)), /invalid save file/);
});

test("import rejects malformed root live-game structure", () => {
  const root = createRootState({
    liveGame: {
      sim: { v: 1 },
      feed: {},
      manualOverrides: {},
      context: null,
      seasonPendingGame: null,
    },
  });

  assert.throws(() => importRootSave(exportEnvelope(root)), /invalid save file/);
});

test("import rejects an empty league career before stored state changes", () => {
  const stored = createRootState({ savedAt: 17 });
  const storage = createMemoryStorage({
    [ROOT_SAVE_KEY]: JSON.stringify(stored),
  });
  const malformed = createRootState({ leagueCareer: {} });
  const text = JSON.stringify({
    format: "courtside-legends-save",
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    root: malformed,
  });

  assert.throws(() => importRootSave(text), /invalid save file/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), JSON.stringify(stored));
});

test("import rejects malformed league season structure before writing", () => {
  const stored = createRootState({ savedAt: 18 });
  const storage = createMemoryStorage({
    [ROOT_SAVE_KEY]: JSON.stringify(stored),
  });
  const season = validSeason();
  delete season.schedule;
  const malformed = createRootState({
    activeMode: "franchise",
    leagueCareer: {
      careerId: "career-1",
      kind: "franchise",
      phase: "regular",
      season,
      history: [],
      manualOverrides: {},
      recommendations: {},
    },
  });

  assert.throws(() => importRootSave(exportEnvelope(malformed)), /invalid save file/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), JSON.stringify(stored));
});

test("import rejects invalid time-travel story resources before writing", () => {
  const stored = createRootState({ savedAt: 19 });
  const storage = createMemoryStorage({
    [ROOT_SAVE_KEY]: JSON.stringify(stored),
  });
  const malformed = createRootState({
    activeMode: "timeTravel",
    leagueCareer: {
      careerId: "tt-1991-42",
      kind: "timeTravel",
      storyId: "tt-1991-42",
      phase: "regular",
      season: validSeason(),
      history: [],
      manualOverrides: {},
      recommendations: {},
    },
    story: validStory({ futureKnowledge: "three" }),
  });

  assert.throws(() => importRootSave(exportEnvelope(malformed)), /invalid save file/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), JSON.stringify(stored));
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

test("future root prevents legacy migration and leaves all bytes unchanged", () => {
  const future = JSON.stringify({ ...createRootState(), schemaVersion: 999 });
  const legacy = JSON.stringify({ v: 2, phase: "regular", marker: "legacy" });
  const storage = createMemoryStorage({
    [ROOT_SAVE_KEY]: future,
    [LEGACY_SEASON_KEY]: legacy,
  });
  const before = storage.dump();

  assert.equal(migrateLegacySaves(storage), null);
  assert.deepEqual(storage.dump(), before);
});

test("failed temporary root write leaves the official root unchanged", () => {
  const original = JSON.stringify(createRootState({ savedAt: 23 }));
  const base = createMemoryStorage({ [ROOT_SAVE_KEY]: original });
  const storage = {
    ...base,
    setItem(key, value) {
      if (key === TEMP_ROOT_SAVE_KEY) throw new Error("quota");
      base.setItem(key, value);
    },
  };

  assert.throws(() => writeRootSave(createRootState(), storage), /quota/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), original);
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
