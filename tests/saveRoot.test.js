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
  purgeOrphanedLegacySaves,
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

function managedRoot(management) {
  return createRootState({
    activeMode: "franchise",
    leagueCareer: {
      careerId: "career-1",
      kind: "franchise",
      phase: "draft",
      season: validSeason({ phase: "done" }),
      history: [],
      manualOverrides: {},
      recommendations: {},
      management,
    },
  });
}

function validDraft(overrides = {}) {
  return {
    year: 1991,
    seed: "career-1:1991:draft",
    order: ["POR"],
    prospects: [],
    selections: [],
    currentPick: 1,
    status: "complete",
    ...overrides,
  };
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

test("root saves accept structured story-event decisions", () => {
  const storage = createMemoryStorage();
  const root = createRootState({
    activeMode: "timeTravel",
    leagueCareer: {
      careerId: "tt-1991-event",
      kind: "timeTravel",
      storyId: "tt-1991-event",
      phase: "regular",
      season: validSeason(),
      history: [],
      manualOverrides: {},
      recommendations: {},
    },
    story: validStory({
      storyId: "tt-1991-event",
      pendingDecision: { type: "story-event", eventId: "first-year-owner-test", year: 1992 },
    }),
  });
  writeRootSave(root, storage);
  assert.deepEqual(readRootSave(storage).story.pendingDecision, root.story.pendingDecision);
});

// evaluateCareerEmployment() parks the career on {type: "contract-renewal", year}. The validator
// only knew "story-event", so that state could never be saved: the renewal screen worked in
// memory, the failure went to the console, and closing the tab lost the pending decision.
function rootPendingOn(pendingDecision) {
  return createRootState({
    activeMode: "timeTravel",
    leagueCareer: {
      careerId: "tt-1991-renewal",
      kind: "timeTravel",
      storyId: "tt-1991-renewal",
      phase: "regular",
      season: validSeason(),
      history: [],
      manualOverrides: {},
      recommendations: {},
    },
    story: validStory({ storyId: "tt-1991-renewal", pendingDecision }),
  });
}

test("root saves accept the pending contract-renewal decision", () => {
  const storage = createMemoryStorage();
  const root = rootPendingOn({ type: "contract-renewal", year: 1996 });
  writeRootSave(root, storage);
  assert.deepEqual(readRootSave(storage).story.pendingDecision, { type: "contract-renewal", year: 1996 });
});

test("root saves still reject malformed pending decisions", () => {
  for (const bad of [
    { type: "contract-renewal" }, // no year
    { type: "contract-renewal", year: "1996" }, // year must be an integer
    { type: "contract-renewal", year: 1996.5 },
    { type: "made-up", year: 1996 },
    { type: "story-event", year: 1996 }, // no eventId
    42,
    [],
  ]) {
    const storage = createMemoryStorage();
    assert.throws(() => writeRootSave(rootPendingOn(bad), storage), /invalid root save/, JSON.stringify(bad));
    assert.equal(storage.getItem(ROOT_SAVE_KEY), null, "a rejected save must not touch storage");
  }
});

test("root persistence strips large ephemeral box snapshots but keeps schedule state", () => {
  const storage = createMemoryStorage();
  const root = createRootState({
    activeMode: "franchise",
    leagueCareer: {
      careerId: "compact-1",
      kind: "franchise",
      phase: "regular",
      season: validSeason({
        resultsLog: [{ day: 1, box: { huge: true }, snapshot: { huge: true }, score: 101 }],
        schedule: [[{ homeId: "POR", awayId: "LAL", _lastSnap: { huge: true }, box: { huge: true } }]],
        finalsAllTeam: { huge: true },
      }),
      history: [],
      manualOverrides: {},
      recommendations: {},
    },
  });
  writeRootSave(root, storage);
  const saved = readRootSave(storage);
  assert.equal(saved.leagueCareer.season.resultsLog[0].box, undefined);
  assert.equal(saved.leagueCareer.season.resultsLog[0].score, 101);
  assert.equal(saved.leagueCareer.season.schedule[0][0]._lastSnap, undefined);
  assert.equal(saved.leagueCareer.season.schedule[0][0].homeId, "POR");
  assert.equal(saved.leagueCareer.season.finalsAllTeam, undefined);
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
    // The data now lives in cls_root_v3 -- the legacy key must be dropped, not kept around
    // forever as a silent duplicate eating into this origin's one storage budget.
    assert.equal(storage.getItem(LEGACY_SEASON_KEY), null);
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
  // The migrated key is dropped. The OTHER legacy key wasn't usable (invalid season), so it's
  // left alone rather than silently discarding data migrateLegacySaves() never looked at again.
  assert.equal(storage.getItem(LEGACY_GAME_KEY), null);
  assert.equal(storage.getItem(LEGACY_SEASON_KEY), JSON.stringify(invalidSeason));
});

test("orphaned legacy keys from a pre-fix build are cleaned up once cls_root_v3 already exists", () => {
  const root = createRootState();
  const storage = createMemoryStorage({
    [ROOT_SAVE_KEY]: JSON.stringify(root),
    [LEGACY_SEASON_KEY]: JSON.stringify(validSeason()),
    [LEGACY_GAME_KEY]: JSON.stringify({ v: 1, quarter: 1, score: [0, 0] }),
  });

  const migrated = migrateLegacySaves(storage);

  assert.equal(migrated.source, ROOT_SAVE_KEY);
  assert.deepEqual(migrated.root, root);
  assert.equal(storage.getItem(LEGACY_SEASON_KEY), null);
  assert.equal(storage.getItem(LEGACY_GAME_KEY), null);
  // The thing that actually matters -- the current root save -- is untouched.
  assert.deepEqual(readRootSave(storage), root);
});

test("purgeOrphanedLegacySaves removes both legacy keys and reports bytes freed", () => {
  const seasonJson = JSON.stringify(validSeason());
  const gameJson = JSON.stringify({ v: 1, quarter: 2, score: [10, 8] });
  const storage = createMemoryStorage({
    [LEGACY_SEASON_KEY]: seasonJson,
    [LEGACY_GAME_KEY]: gameJson,
    [ROOT_SAVE_KEY]: "untouched",
  });

  const freed = purgeOrphanedLegacySaves(storage);

  assert.equal(freed, seasonJson.length + gameJson.length);
  assert.equal(storage.getItem(LEGACY_SEASON_KEY), null);
  assert.equal(storage.getItem(LEGACY_GAME_KEY), null);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), "untouched");
});

test("purgeOrphanedLegacySaves is a safe no-op when nothing is orphaned", () => {
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: "untouched" });
  assert.equal(purgeOrphanedLegacySaves(storage), 0);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), "untouched");
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

test("temporary root quota falls back to direct replacement", () => {
  const original = JSON.stringify(createRootState({ savedAt: 23 }));
  const base = createMemoryStorage({ [ROOT_SAVE_KEY]: original });
  const storage = {
    ...base,
    setItem(key, value) {
      if (key === TEMP_ROOT_SAVE_KEY) throw new Error("quota");
      base.setItem(key, value);
    },
  };

  const root = createRootState({ activeMode: "timeTravel" });
  writeRootSave(root, storage);
  assert.notEqual(storage.getItem(ROOT_SAVE_KEY), original);
  assert.equal(storage.getItem(TEMP_ROOT_SAVE_KEY), null);
});

test("root quota error is actionable when even direct replacement fails", () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error("quota"); },
    removeItem() {},
  };
  assert.throws(() => writeRootSave(createRootState(), storage), /storage quota exceeded/);
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

test("managed root saves validate draft and season history shapes", () => {
  const valid = managedRoot({
    draft: validDraft(),
    draftHistory: [validDraft()],
    seasonHistory: [{
      year: 1991,
      teamId: "POR",
      teamName: "Portland Trail Blazers",
      record: { w: 50, l: 32 },
      championId: "CHI",
      finish: "playoffs",
      awards: { mvp: null, dpoy: null, roy: null },
    }],
    developmentPlans: {},
  });
  assert.deepEqual(importRootSave(exportEnvelope(valid)), valid);

  const malformed = [
    managedRoot({ draft: validDraft({ currentPick: -1 }), draftHistory: [], seasonHistory: [] }),
    managedRoot({ draft: null, draftHistory: [validDraft({ status: "in_progress" })], seasonHistory: [] }),
    managedRoot({ draft: null, draftHistory: [validDraft(), validDraft()], seasonHistory: [] }),
    managedRoot({ draft: null, draftHistory: [], seasonHistory: [{ year: 1991, teamId: "", record: { w: 1, l: 1 }, finish: "lottery" }] }),
    managedRoot({
      draft: null,
      draftHistory: [],
      seasonHistory: [
        { year: 1991, teamId: "POR", record: { w: 1, l: 1 }, finish: "lottery" },
        { year: 1991, teamId: "POR", record: { w: 2, l: 0 }, finish: "playoffs" },
      ],
    }),
    managedRoot({ draft: null, draftHistory: [], seasonHistory: [], developmentPlans: [] }),
  ];
  for (const root of malformed) {
    assert.throws(() => importRootSave(exportEnvelope(root)), /invalid save file/);
  }
});

test("malformed managed saves do not change storage", () => {
  const stored = createRootState({ savedAt: 91 });
  const storage = createMemoryStorage({ [ROOT_SAVE_KEY]: JSON.stringify(stored) });
  const malformed = managedRoot({
    draft: validDraft({ seed: "" }),
    draftHistory: [],
    seasonHistory: [],
  });
  assert.throws(() => importRootSave(exportEnvelope(malformed)), /invalid save file/);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), JSON.stringify(stored));
});

test("old schema-v3 careers without management still round-trip", () => {
  const oldRoot = createRootState({
    savedAt: 33,
    activeMode: "franchise",
    leagueCareer: {
      careerId: "old-career",
      kind: "franchise",
      phase: "regular",
      season: validSeason(),
      history: [],
      manualOverrides: {},
      recommendations: {},
    },
  });
  assert.deepEqual(importRootSave(exportRootSave(oldRoot)), oldRoot);
});

test("season summary transactions are optional, compact, and validated", () => {
  const transaction = {
    type: "trade",
    year: 1991,
    day: 12,
    description: "Portland: Outgoing for Incoming",
  };
  const valid = managedRoot({
    draft: null,
    draftHistory: [],
    seasonHistory: [{
      year: 1991,
      teamId: "POR",
      record: { w: 50, l: 32 },
      championId: "CHI",
      finish: "playoffs",
      awards: {},
      transactions: [transaction],
    }],
  });
  assert.deepEqual(importRootSave(exportEnvelope(valid)), valid);

  const legacy = structuredClone(valid);
  delete legacy.leagueCareer.management.seasonHistory[0].transactions;
  assert.deepEqual(importRootSave(exportEnvelope(legacy)), legacy);

  const invalidTransactions = [
    "not-an-array",
    Array.from({ length: 21 }, () => transaction),
    [{ ...transaction, type: "" }],
    [{ ...transaction, year: 1991.5 }],
    [{ ...transaction, year: 1992 }],
    [{ ...transaction, description: "" }],
    [{ ...transaction, description: "x".repeat(201) }],
    [{ ...transaction, day: "one" }],
    [{ ...transaction, extra: true }],
    [{ year: 1991, day: 12, description: "missing type" }],
  ];
  for (const transactions of invalidTransactions) {
    const malformed = structuredClone(valid);
    malformed.leagueCareer.management.seasonHistory[0].transactions = transactions;
    assert.throws(() => importRootSave(exportEnvelope(malformed)), /invalid save file/);
  }

  for (const teamName of ["", "   ", 42]) {
    const malformed = structuredClone(valid);
    malformed.leagueCareer.management.seasonHistory[0].teamName = teamName;
    assert.throws(() => importRootSave(exportEnvelope(malformed)), /invalid save file/);
  }
});
