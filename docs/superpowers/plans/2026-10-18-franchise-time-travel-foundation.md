# Franchise and Time-Travel Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared state/save foundation and a playable time-travel career prologue that creates and resumes a real historical season from one of three interview offers.

**Architecture:** Add pure, DOM-free modules for root state, storage migration, league-career orchestration, and time-travel story state. Keep the existing `season.js` and `GameSim` engines authoritative; `app.js` remains the composition root during this slice and receives only thin screen/event wiring.

**Tech Stack:** Browser ES modules, vanilla JavaScript, HTML/CSS, `localStorage`, Node.js built-in `node:test`; no build step and no third-party runtime dependencies.

## Global Constraints

- The app must continue to run from a static HTTP server; direct `file://` use remains unsupported.
- Manual lineup, matchup, role, minute, training, and skill choices always override automatic recommendations.
- The existing `GameSim`, player database, gold career, ranked, draft, and tournament flows must remain behavior-compatible.
- The new story-career name is `timeTravel`; existing `career` continues to mean the gold progression bracket.
- Historical mode starts from real teams and rosters; player intervention may diverge afterward.
- Future knowledge gives limited probabilistic or informational advantages, never guaranteed outcomes or exact future OVR.
- Old `cls_savegame_v1` and `cls_season_v1` keys are not deleted during this slice.
- All new domain functions accept deterministic seeds where randomness affects persisted results.

---

## Planned File Structure

- Create `package.json` — declares ES module semantics and the Node smoke-test command.
- Create `tests/helpers/memoryStorage.js` — in-memory Web Storage test double.
- Create `tests/gameStore.test.js` — root-store event and immutable replacement tests.
- Create `tests/saveRoot.test.js` — round-trip, migration, corruption, and future-version tests.
- Create `tests/leagueCareer.test.js` — wrapper lifecycle and manual-override preservation tests.
- Create `tests/timeTravelCareer.test.js` — deterministic interviews and prologue decision tests.
- Create `js/core/gameStore.js` — minimal root-state store with subscriptions.
- Create `js/data/saveRoot.js` — versioned root persistence, migration, import, and export.
- Create `js/modes/leagueCareer.js` — shared wrapper around an existing season state.
- Create `js/modes/timeTravelCareer.js` — interview generation, offer acceptance, and prologue state.
- Modify `js/app.js` — compose the new modules, route the new mode, save/resume it, and hand accepted careers to the existing season hub.
- Modify `index.html` — add the time-travel mode entry and prologue screen.
- Modify `css/style.css` — add layout for the year picker, interview offers, and story decision.
- Modify `README.md` — document the first playable time-travel slice and portable save files.

---

### Task 1: Add a Zero-Dependency Smoke-Test Harness and Root Store

**Files:**
- Create: `package.json`
- Create: `tests/gameStore.test.js`
- Create: `js/core/gameStore.js`

**Interfaces:**
- Produces: `createGameStore(initialState)` returning `{ getState, replaceState, update, subscribe }`.
- `replaceState(nextState, meta?)` replaces the root object and notifies subscribers.
- `update(updater, meta?)` computes a new root object and rejects in-place mutation.
- `subscribe(listener)` returns an unsubscribe function.

- [ ] **Step 1: Write the failing store tests**

```js
// tests/gameStore.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createGameStore } from "../js/core/gameStore.js";

test("store publishes replacement state and metadata", () => {
  const store = createGameStore({ count: 0 });
  const seen = [];
  const unsubscribe = store.subscribe((next, prev, meta) => seen.push({ next, prev, meta }));

  store.update((state) => ({ ...state, count: state.count + 1 }), { type: "increment" });

  assert.equal(store.getState().count, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].prev.count, 0);
  assert.deepEqual(seen[0].meta, { type: "increment" });
  unsubscribe();
  store.replaceState({ count: 2 });
  assert.equal(seen.length, 1);
});

test("store rejects updater functions that return the same object", () => {
  const state = { count: 0 };
  const store = createGameStore(state);
  assert.throws(() => store.update((current) => current), /new root object/);
});
```

- [ ] **Step 2: Add the Node test command and verify the test fails**

```json
{
  "name": "courtside-legends",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests"
  }
}
```

Run: `npm test -- --test-name-pattern="store"`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/core/gameStore.js`.

- [ ] **Step 3: Implement the minimal store**

```js
// js/core/gameStore.js
export function createGameStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  const publish = (next, meta = {}) => {
    if (!next || typeof next !== "object") throw new TypeError("state must be an object");
    if (next === state) throw new Error("update must return a new root object");
    const prev = state;
    state = next;
    for (const listener of listeners) listener(state, prev, meta);
    return state;
  };

  return {
    getState: () => state,
    replaceState: publish,
    update(updater, meta = {}) {
      if (typeof updater !== "function") throw new TypeError("updater must be a function");
      return publish(updater(state), meta);
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

- [ ] **Step 4: Run the store tests**

Run: `npm test -- --test-name-pattern="store"`  
Expected: 2 tests pass.

- [ ] **Step 5: Commit the root store**

```bash
git add package.json tests/gameStore.test.js js/core/gameStore.js
git commit -m "Add root game state store"
```

---

### Task 2: Add Versioned Root Saves, Import/Export, and Legacy Migration

**Files:**
- Create: `tests/helpers/memoryStorage.js`
- Create: `tests/saveRoot.test.js`
- Create: `js/data/saveRoot.js`

**Interfaces:**
- Produces: `ROOT_SAVE_KEY`, `ROOT_SAVE_VERSION`, `createRootState(overrides?)`.
- Produces: `writeRootSave(root, storage?)`, `readRootSave(storage?)`, `clearRootSave(storage?)`.
- Produces: `exportRootSave(root)` and `importRootSave(text)`.
- Produces: `migrateLegacySaves(storage?)`.
- A successful migration returns `{ root, source }`; unsupported future versions throw without writing.

- [ ] **Step 1: Add the in-memory storage test double**

```js
// tests/helpers/memoryStorage.js
export function createMemoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    dump() {
      return Object.fromEntries(values);
    },
  };
}
```

- [ ] **Step 2: Write failing save tests**

```js
// tests/saveRoot.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import {
  ROOT_SAVE_KEY,
  createRootState,
  exportRootSave,
  importRootSave,
  migrateLegacySaves,
  readRootSave,
  writeRootSave,
} from "../js/data/saveRoot.js";

test("root save round-trips and exported JSON imports", () => {
  const storage = createMemoryStorage();
  const root = createRootState({ activeMode: "timeTravel" });
  writeRootSave(root, storage);
  assert.deepEqual(readRootSave(storage), root);
  assert.deepEqual(importRootSave(exportRootSave(root)), root);
});

test("legacy season becomes a franchise leagueCareer without deleting the old key", () => {
  const legacy = { v: 2, year: 1991, phase: "regular", teams: {}, schedule: [] };
  const storage = createMemoryStorage({ cls_season_v1: JSON.stringify(legacy) });
  const migrated = migrateLegacySaves(storage);
  assert.equal(migrated.source, "cls_season_v1");
  assert.equal(migrated.root.activeMode, "franchise");
  assert.deepEqual(migrated.root.leagueCareer.season, legacy);
  assert.ok(storage.getItem("cls_season_v1"));
  assert.ok(storage.getItem(ROOT_SAVE_KEY));
});

test("future save versions are rejected without replacing the current save", () => {
  const storage = createMemoryStorage();
  const root = createRootState();
  writeRootSave(root, storage);
  const before = storage.getItem(ROOT_SAVE_KEY);
  assert.throws(
    () => importRootSave(JSON.stringify({ schemaVersion: 999, root: {} })),
    /newer game version/
  );
  assert.equal(storage.getItem(ROOT_SAVE_KEY), before);
});
```

- [ ] **Step 3: Run the save tests and verify failure**

Run: `npm test -- --test-name-pattern="save|legacy|future"`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/data/saveRoot.js`.

- [ ] **Step 4: Implement versioned saves and atomic writes**

Implement `js/data/saveRoot.js` with these exact data and validation rules:

```js
export const ROOT_SAVE_KEY = "cls_root_v3";
export const ROOT_SAVE_VERSION = 3;
const TEMP_KEY = `${ROOT_SAVE_KEY}_tmp`;

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

function validateRoot(root) {
  if (!root || typeof root !== "object") throw new TypeError("invalid root save");
  if (root.schemaVersion > ROOT_SAVE_VERSION) throw new Error("save requires a newer game version");
  if (root.schemaVersion !== ROOT_SAVE_VERSION) throw new Error("unsupported root save version");
  return root;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function writeRootSave(root, storage = localStorage) {
  const next = clone({ ...validateRoot(root), savedAt: Date.now() });
  const text = JSON.stringify(next);
  storage.setItem(TEMP_KEY, text);
  const verified = JSON.parse(storage.getItem(TEMP_KEY));
  validateRoot(verified);
  storage.setItem(ROOT_SAVE_KEY, text);
  storage.removeItem(TEMP_KEY);
  root.savedAt = next.savedAt;
  return next;
}

export function readRootSave(storage = localStorage) {
  const text = storage.getItem(ROOT_SAVE_KEY);
  if (!text) return null;
  return validateRoot(JSON.parse(text));
}

export function clearRootSave(storage = localStorage) {
  storage.removeItem(ROOT_SAVE_KEY);
  storage.removeItem(TEMP_KEY);
}

export function exportRootSave(root) {
  return JSON.stringify({
    format: "courtside-legends-save",
    schemaVersion: ROOT_SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    root: validateRoot(clone(root)),
  }, null, 2);
}

export function importRootSave(text) {
  const envelope = JSON.parse(text);
  if (envelope?.schemaVersion > ROOT_SAVE_VERSION) {
    throw new Error("save requires a newer game version");
  }
  if (envelope?.format !== "courtside-legends-save") throw new Error("invalid save file");
  return validateRoot(envelope.root);
}
```

Add `migrateLegacySaves(storage)` in the same file:

- Prefer `cls_season_v1` when present and parseable.
- Wrap it as `{ kind: "franchise", careerId: "legacy-season", phase: season.phase, season, history: [] }`.
- Otherwise wrap `cls_savegame_v1` into `liveGame.legacySession` and preserve its original object.
- Call `writeRootSave`; never remove either legacy key.
- Return `null` when neither key is valid.

- [ ] **Step 5: Run all save tests**

Run: `npm test -- --test-name-pattern="save|legacy|future"`  
Expected: all save tests pass.

- [ ] **Step 6: Commit root persistence**

```bash
git add tests/helpers/memoryStorage.js tests/saveRoot.test.js js/data/saveRoot.js
git commit -m "Add versioned portable root saves"
```

---

### Task 3: Add the Shared League-Career Controller

**Files:**
- Create: `tests/leagueCareer.test.js`
- Create: `js/modes/leagueCareer.js`

**Interfaces:**
- Consumes: an existing season state from `createSeason`.
- Produces: `createLeagueCareer({ kind, season, storyId? })`.
- Produces: `setManualOverride(career, category, key, value)`.
- Produces: `applyRecommendation(career, category, recommendations)`.
- Produces: `recordCareerEvent(career, event)`.
- Produces: `advanceCareerOffseason(career)` delegating to `advanceLeagueOffseason`.

- [ ] **Step 1: Write failing controller tests**

```js
// tests/leagueCareer.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRecommendation,
  createLeagueCareer,
  recordCareerEvent,
  setManualOverride,
} from "../js/modes/leagueCareer.js";

test("manual values survive later recommendations", () => {
  let career = createLeagueCareer({ kind: "franchise", season: { phase: "regular" } });
  career = setManualOverride(career, "matchups", "PG", "defender-1");
  career = applyRecommendation(career, "matchups", {
    PG: "defender-auto",
    SG: "defender-2",
  });
  assert.equal(career.manualOverrides.matchups.PG, "defender-1");
  assert.equal(career.recommendations.matchups.PG, "defender-1");
  assert.equal(career.recommendations.matchups.SG, "defender-2");
});

test("career history is append-only", () => {
  const career = createLeagueCareer({ kind: "timeTravel", season: { phase: "regular" } });
  const next = recordCareerEvent(career, { type: "accepted-offer", year: 1991 });
  assert.equal(career.history.length, 0);
  assert.equal(next.history.length, 1);
});
```

- [ ] **Step 2: Run the controller tests and verify failure**

Run: `npm test -- --test-name-pattern="manual values|history"`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/modes/leagueCareer.js`.

- [ ] **Step 3: Implement immutable controller operations**

The constructor must return:

```js
{
  careerId: `career-${Date.now()}`,
  kind,
  storyId,
  phase: season.phase,
  season,
  history: [],
  manualOverrides: {},
  recommendations: {}
}
```

`applyRecommendation` merges recommendations first, then overlays
`manualOverrides[category]`. `setManualOverride` writes the value to both maps.
`recordCareerEvent` appends `{ at: Date.now(), ...event }` without mutating the
input. `advanceCareerOffseason` may clone only the wrapper, because the existing
season engine mutates its season object; document this compatibility boundary in
the file header.

- [ ] **Step 4: Run controller tests**

Run: `npm test -- --test-name-pattern="manual values|history"`  
Expected: both tests pass.

- [ ] **Step 5: Commit the controller**

```bash
git add tests/leagueCareer.test.js js/modes/leagueCareer.js
git commit -m "Add shared league career controller"
```

---

### Task 4: Build Deterministic Time-Travel Interviews and Prologue State

**Files:**
- Create: `tests/timeTravelCareer.test.js`
- Create: `js/modes/timeTravelCareer.js`

**Interfaces:**
- Consumes: `historicalSeason(year)`, `buildCpuTeamForYear(year, teamMeta, usedIds)`, `createSeason(opts)`, and `createLeagueCareer`.
- Produces: `createTimeTravelPrologue({ year, philosophy, seed })`.
- Produces: `generateInterviewOffers({ year, philosophy, seed })`.
- Produces: `acceptInterviewOffer(prologue, offerId)`.
- Produces: `resolveFutureKnowledgeChoice(careerRoot, choiceId)`.

- [ ] **Step 1: Write failing domain tests**

```js
// tests/timeTravelCareer.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptInterviewOffer,
  createTimeTravelPrologue,
  resolveFutureKnowledgeChoice,
} from "../js/modes/timeTravelCareer.js";

test("the same year and seed produce three stable, distinct interviews", () => {
  const a = createTimeTravelPrologue({ year: 1991, philosophy: "analytics", seed: 42 });
  const b = createTimeTravelPrologue({ year: 1991, philosophy: "analytics", seed: 42 });
  assert.equal(a.offers.length, 3);
  assert.deepEqual(a.offers, b.offers);
  assert.equal(new Set(a.offers.map((offer) => offer.teamId)).size, 3);
  assert.deepEqual(new Set(a.offers.map((offer) => offer.archetype)), new Set([
    "rebuild",
    "middle",
    "contender",
  ]));
});

test("accepting an offer creates a historical league career and story timeline", () => {
  const prologue = createTimeTravelPrologue({ year: 1991, philosophy: "relationships", seed: 7 });
  const root = acceptInterviewOffer(prologue, prologue.offers[0].id);
  assert.equal(root.activeMode, "timeTravel");
  assert.equal(root.leagueCareer.kind, "timeTravel");
  assert.equal(root.leagueCareer.season.year, 1991);
  assert.equal(root.story.eventLog[0].type, "accepted-offer");
});

test("future knowledge costs one point and changes trust and divergence once", () => {
  const prologue = createTimeTravelPrologue({ year: 1991, philosophy: "analytics", seed: 7 });
  const root = acceptInterviewOffer(prologue, prologue.offers[0].id);
  const next = resolveFutureKnowledgeChoice(root, "share-draft-sleeper");
  assert.equal(next.story.futureKnowledge, root.story.futureKnowledge - 1);
  assert.ok(next.story.frontOfficeTrust > root.story.frontOfficeTrust);
  assert.ok(next.story.timelineDivergence > root.story.timelineDivergence);
  assert.throws(() => resolveFutureKnowledgeChoice(next, "share-draft-sleeper"), /already resolved/);
});
```

- [ ] **Step 2: Run the time-travel tests and verify failure**

Run: `npm test -- --test-name-pattern="interviews|accepting|future knowledge"`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/modes/timeTravelCareer.js`.

- [ ] **Step 3: Implement deterministic interview generation**

Use a local seeded PRNG; do not call `Math.random()` in offer generation.
`generateInterviewOffers` must:

- Validate `historicalSeason(year)` exists.
- Sort available historical teams by a deterministic roster-strength estimate.
- Select one team from the bottom third (`rebuild`), middle third (`middle`), and top third (`contender`) using the seed.
- Return exactly three offers with:

```js
{
  id: `${year}-${team.id}-${archetype}`,
  teamId: team.id,
  teamName: team.name,
  archetype,
  authority: 80 | 60 | 40,
  firstYearGoal: "培养两名核心轮换" | "进入季后赛" | "进入分区决赛",
  pressure: 35 | 55 | 80,
  trust: 58 | 52 | 45,
  summary: "..."
}
```

Build the strength estimate from `buildCpuTeamForYear` and the average `overall`
of its best eight players. Use a fresh `Set` per team during estimation so one
team does not consume another team's roster candidates.

- [ ] **Step 4: Implement offer acceptance and one prologue decision**

`acceptInterviewOffer` must:

1. Rebuild the selected historical team roster.
2. Call `createSeason` with `mode: "historical"`, the selected team ID/name, the real roster, and the prologue seed.
3. Create a `timeTravel` league-career wrapper.
4. Return `createRootState` with a story state containing:

```js
{
  storyId: `tt-${year}-${seed}`,
  startYear: year,
  currentChapter: "prologue",
  philosophy,
  employer: offer.teamId,
  futureKnowledge: 3,
  frontOfficeTrust: offer.trust,
  mediaPressure: offer.pressure,
  timelineDivergence: 0,
  relationships: { owner: 0, gm: 0, coach: 0, players: 0, media: 0 },
  promises: [{ id: "first-year-goal", text: offer.firstYearGoal, status: "active" }],
  flags: {},
  eventLog: [{ type: "accepted-offer", year, teamId: offer.teamId }],
  pendingDecision: "future-knowledge-intro",
  ending: null
}
```

`resolveFutureKnowledgeChoice` supports:

- `share-draft-sleeper`: knowledge `-1`, trust `+8`, divergence `+6`.
- `introduce-load-management`: knowledge `-1`, trust `+4`, media pressure `+5`, divergence `+4`.
- `keep-quiet`: no knowledge cost, trust `-2`, divergence unchanged.

It sets `flags.futureKnowledgeIntroResolved = true`, clears `pendingDecision`,
and appends a decision event. It rejects duplicate resolution and insufficient
knowledge.

- [ ] **Step 5: Run all time-travel domain tests**

Run: `npm test -- --test-name-pattern="interviews|accepting|future knowledge"`  
Expected: all 3 tests pass.

- [ ] **Step 6: Commit the time-travel domain**

```bash
git add tests/timeTravelCareer.test.js js/modes/timeTravelCareer.js
git commit -m "Add time-travel career prologue domain"
```

---

### Task 5: Wire Root Saves into Existing Startup Without Breaking Legacy Resume

**Files:**
- Modify: `js/app.js:1-520`
- Test: `tests/saveRoot.test.js`

**Interfaces:**
- Consumes: `readRootSave`, `writeRootSave`, `migrateLegacySaves`.
- Produces in `app.js`: `saveLongCareer()`, `resumeLongCareer()`, and `refreshLongCareerHomeBar()`.
- Existing `saveProgress()` and `continueFromSave()` remain unchanged for old modes in this task.

- [ ] **Step 1: Extend save tests for time-travel resume**

Add a test that writes a root with `activeMode: "timeTravel"`, a non-null
`leagueCareer`, and story `pendingDecision`, then asserts `readRootSave` returns
all three unchanged.

- [ ] **Step 2: Run the new test**

Run: `npm test -- --test-name-pattern="time-travel resume"`  
Expected: PASS using the root-save implementation; this is a characterization
gate before UI wiring.

- [ ] **Step 3: Import root-save functions and add app-state slots**

Add imports in `app.js`:

```js
import {
  exportRootSave,
  importRootSave,
  migrateLegacySaves,
  readRootSave,
  writeRootSave,
} from "./data/saveRoot.js";
```

Add `leagueCareer: null` and `story: null` to the existing global `state`
initializer. Do not rename or remove `state.career`.

- [ ] **Step 4: Add long-career save and resume adapters**

Implement:

```js
function currentRootState() {
  return {
    schemaVersion: 3,
    savedAt: 0,
    activeMode: state.mode === "timeTravel" ? "timeTravel" : "franchise",
    profile: { accountId: activeAccount()?.id || null, settings: {}, accessibility: {} },
    leagueCareer: state.leagueCareer,
    story: state.story,
    liveGame: state.sim ? {
      context: state.pendingMatch || null,
      sim: state.sim.exportState(),
      feed: collectFeedLines(),
      manualOverrides: state.leagueCareer?.manualOverrides || {},
    } : null,
  };
}

function saveLongCareer() {
  if (!state.leagueCareer) return false;
  writeRootSave(currentRootState());
  return true;
}

function resumeLongCareer(root = readRootSave()) {
  if (!root?.leagueCareer?.season) return false;
  state.mode = root.activeMode;
  state.leagueCareer = root.leagueCareer;
  state.story = root.story;
  state.season = root.leagueCareer.season;
  renderSeasonHub();
  show(root.story?.pendingDecision ? "time-travel" : "season");
  return true;
}
```

At `boot()`, call `readRootSave() || migrateLegacySaves()` only to discover the
save. Do not automatically redirect away from home. Keep the old save bar and
add root-save metadata in Task 6.

- [ ] **Step 5: Save at established season mutation points**

After existing calls that mutate a long-career season—user game result, sim one,
sim week, trade, free-agent signing, and offseason advance—call
`saveLongCareer()` only when `state.leagueCareer` is non-null. Existing
`saveSeason(state.season)` remains during the compatibility period.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`  
Expected: all tests pass.

- [ ] **Step 7: Commit the save integration**

```bash
git add tests/saveRoot.test.js js/app.js
git commit -m "Integrate long-career root saves"
```

---

### Task 6: Add the Playable Time-Travel Prologue Screen

**Files:**
- Modify: `index.html:40-125`
- Modify: `index.html` immediately before the existing season screen
- Modify: `css/style.css`
- Modify: `js/app.js:620-700`
- Modify: `js/app.js:8775-end`

**Interfaces:**
- Consumes: `createTimeTravelPrologue`, `acceptInterviewOffer`, and `resolveFutureKnowledgeChoice`.
- Produces: mode route `timeTravel`.
- Produces DOM IDs: `time-travel-year`, `time-travel-philosophy`,
  `btn-time-travel-interview`, `time-travel-offers`, `time-travel-decision`,
  `btn-time-travel-continue`, and `btn-time-travel-back`.

- [ ] **Step 1: Add the mode entry and screen markup**

Add a home mode card:

```html
<button class="mode-card mode-card-feature" data-mode="timeTravel">
  <strong>穿越生涯</strong>
  <span>回到过去担任经理兼教练，用有限的未来知识改写五年历史</span>
</button>
```

Add a `screen-time-travel` section containing:

- Header and back button.
- Year `<select>` using the same supported historical year range as season mode.
- Philosophy select with `analytics`, `relationships`, `tactics`, `scouting`.
- Interview button.
- Empty offers container.
- Hidden decision panel with the three exact future-knowledge choices.
- Hidden continue button.

- [ ] **Step 2: Add restrained responsive styling**

Add `.time-travel-create`, `.interview-grid`, `.interview-offer`,
`.interview-offer.selected`, and `.story-decision` styles. At widths below
760px, `.interview-grid` becomes one column. Reuse existing colors, border
tokens, `.btn`, and panel spacing; do not add gradients or fixed-height cards.

- [ ] **Step 3: Route and render the prologue**

Import the four time-travel domain functions in `app.js`. In `startMode`, route
`timeTravel` to `openTimeTravelScreen()`.

`openTimeTravelScreen()` must:

- Populate years once from supported historical seasons.
- Reset only transient offer selection, not an existing root career.
- If a root career exists, render its pending decision or continue button.

`renderInterviewOffers(prologue)` must create three accessible buttons. Each
shows team name, archetype, first-year goal, authority, trust, and pressure.
Clicking an offer calls `acceptInterviewOffer`, assigns `state.leagueCareer`,
`state.story`, `state.season`, and `state.mode`, then saves immediately.

- [ ] **Step 4: Wire the first future-knowledge decision**

Each decision button calls `resolveFutureKnowledgeChoice(currentRootState(), id)`.
Copy the returned story and league career to app state, save immediately, render
the updated trust/knowledge/divergence, and reveal “进入球队” after resolution.
“进入球队” calls `renderSeasonHub()` and then shows the season screen.

- [ ] **Step 5: Add root save import/export controls**

Add “导出长期存档” and a hidden file input “导入长期存档” beside the long-career
resume UI. Export creates a Blob from `exportRootSave(currentRootState())` and
downloads `courtside-legends-save.json`. Import reads text, calls
`importRootSave`, asks for confirmation, writes it, and calls
`resumeLongCareer(root)`. On validation failure, display the thrown error without
overwriting the existing root save.

- [ ] **Step 6: Perform browser smoke checks**

Run: `python3 scripts/serve_nocache.py`  
Open: `http://127.0.0.1:5173/`

Verify:

1. Home loads and old mode cards still open.
2. 穿越生涯 → 1991 → 面试 produces three distinct offer types.
3. Selecting an offer immediately survives a hard refresh.
4. Resolving the future-knowledge choice changes the displayed values once.
5. 进入球队 opens the existing season hub with the selected historical team.
6. Export, clear the root key in browser storage, import, and resume.

- [ ] **Step 7: Run automated tests**

Run: `npm test`  
Expected: all tests pass.

- [ ] **Step 8: Commit the playable prologue**

```bash
git add index.html css/style.css js/app.js
git commit -m "Add playable time-travel career prologue"
```

---

### Task 7: Add Regression Invariants and Documentation

**Files:**
- Create: `tests/manualOverrides.test.js`
- Modify: `README.md`
- Modify: `js/data/saveRoot.js`
- Modify: `js/modes/leagueCareer.js`

**Interfaces:**
- Verifies the global “manual beats automatic” invariant.
- Documents local save portability and the current time-travel scope.

- [ ] **Step 1: Add a cross-category manual-override regression test**

```js
// tests/manualOverrides.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRecommendation,
  createLeagueCareer,
  setManualOverride,
} from "../js/modes/leagueCareer.js";

for (const category of ["lineup", "matchups", "roles", "minutes", "training", "skills"]) {
  test(`manual ${category} overrides automatic recommendations`, () => {
    let career = createLeagueCareer({ kind: "timeTravel", season: { phase: "regular" } });
    career = setManualOverride(career, category, "player-1", "manual-value");
    career = applyRecommendation(career, category, {
      "player-1": "automatic-value",
      "player-2": "automatic-second",
    });
    assert.equal(career.recommendations[category]["player-1"], "manual-value");
    assert.equal(career.recommendations[category]["player-2"], "automatic-second");
  });
}
```

- [ ] **Step 2: Run the invariant tests**

Run: `npm test -- --test-name-pattern="manual"`  
Expected: all category cases pass.

- [ ] **Step 3: Document the playable slice**

Update `README.md`:

- Add “穿越生涯（第一阶段）” to the modes list.
- Explain year selection, three interviews, limited future knowledge, and entry
  into the historical season.
- Add “长期存档导入/导出” instructions and clarify that old browser saves are
  migrated without being deleted.
- State that the five-year event arc, full historical drafts, and deep contract
  system remain subsequent roadmap phases, not completed features.

- [ ] **Step 4: Run the complete verification**

Run:

```bash
npm test
git diff --check
```

Expected: all tests pass; `git diff --check` prints no errors.

- [ ] **Step 5: Review only first-slice changes**

Run:

```bash
git diff --stat 005c2ac..HEAD
git status --short
```

Expected: changes are limited to the files listed by Tasks 1–7 plus pre-existing
user changes to `README.md`, `js/data/skills.js`, and local verification assets.
Do not stage the verification images or `assets/photos/jokicni01_2010.jpg`.

- [ ] **Step 6: Commit tests and documentation**

```bash
git add tests/manualOverrides.test.js README.md js/data/saveRoot.js js/modes/leagueCareer.js
git commit -m "Document and verify career foundation"
```

---

## Completion Evidence for This Plan

The first implementation slice is complete only when all evidence below exists:

1. `npm test` passes the root store, migration, round-trip, deterministic offer,
   future-knowledge, controller, and manual-override tests.
2. A browser run proves a 1991 career can progress from year selection through
   interview, decision, historical season hub, hard refresh, export, and import.
3. Existing quick, season, gold-career, and ranked entries still open.
4. Old storage keys remain after migration.
5. A selected historical team has the correct year and real roster.
6. Root-save validation rejects corrupt or future-version files without
   replacing the current save.
7. No local verification images or unrelated player-skill changes are included
   in implementation commits.

