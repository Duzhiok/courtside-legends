# League Career Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing single-season wrapper into a repeatable long-term management loop with rookie drafts, rookie contracts, development plans, deterministic CPU decisions, and durable league history.

**Architecture:** Add pure draft and development domain modules beside `leagueCareer.js`; keep `season.js` authoritative for games and yearly reset. Persist long-lived management data on `leagueCareer.management`, use stable `bref` identities across yearly card replacement, and keep `app.js` as a thin integration layer.

**Tech Stack:** Browser ES modules, vanilla JavaScript, HTML/CSS, `localStorage`, Node.js `node:test`; no build step or runtime dependencies.

## Global Constraints

- Historical careers derive rookie classes from each player's earliest available NBA season card; the UI must label them as debut classes rather than exact historical draft classes.
- The same career seed and league state must produce the same lottery, prospect order, and CPU selections; no persisted draft decision may use `Math.random()` or `Date.now()`.
- Player identity across seasons is `bref`; season-card `id` must not key development plans or career history.
- Manual draft-board and development choices always override automatic recommendations.
- Existing quick, ranked, gold-career, standalone season, and time-travel prologue flows remain compatible.
- Root saves remain schema version 3 during this phase; all new management fields are optional and old valid saves must continue to load.
- A roster may not exceed 15 players. If a CPU team is full when drafting, it deterministically waives its lowest-value non-rookie.
- Real debut data ends in 2025. Later seasons use deterministic generated prospects clearly marked as fictional.

---

### Task 1: Add Deterministic Rookie Classes and Draft Order

**Files:**
- Create: `js/engine/leagueDraft.js`
- Create: `tests/leagueDraft.test.js`

**Interfaces:**
- Produces: `rookieClassForYear(year, { seed, minimumSize, players = PLAYERS })`.
- Produces: `generateDraftOrder(season, { seed })`.
- Produces: `createDraftState({ season, seed })`.
- A prospect contains `prospectId`, `bref`, `name`, `pos`, `source`, `player`, `potential`, and `scoutingRange`.
- A draft state contains `year`, `seed`, `order`, `prospects`, `currentPick`, `selections`, and `status`.

- [ ] **Step 1: Write failing rookie-class tests**

```js
test("historical rookie class uses each bref earliest card", () => {
  const players = [
    fixtureCard({ bref: "rookie-a", season: 1998, ovr: 72 }),
    fixtureCard({ bref: "rookie-a", season: 1999, ovr: 79 }),
    fixtureCard({ bref: "veteran-b", season: 1997, ovr: 68 }),
  ];
  const rookies = rookieClassForYear(1997, {
    seed: 7,
    minimumSize: 1,
    players,
  });
  assert.equal(rookies[0].player.season, 1998);
  assert.equal(rookies[0].source, "historical-debut");
  assert.equal(new Set(rookies.map((p) => p.bref)).size, rookies.length);
});

test("post-data rookie classes are deterministic and fictional", () => {
  const a = rookieClassForYear(2028, { seed: 44, minimumSize: 30 });
  const b = rookieClassForYear(2028, { seed: 44, minimumSize: 30 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 30);
  assert.ok(a.every((p) => p.source === "generated"));
});
```

- [ ] **Step 2: Run the tests and verify `ERR_MODULE_NOT_FOUND`**

Run: `node --test tests/leagueDraft.test.js`

- [ ] **Step 3: Implement debut-class indexing and generated fallback**

Build a lazy `bref → earliest card` index from `PLAYERS`. For draft year `Y`, use cards whose first season is `Y + 1`, because the season model stores ending years. A completed season ending in `Y` therefore opens the `Y` draft before the new `Y + 1` season. Clone cards before returning them. Generate missing prospects with a local seeded PRNG, stable IDs `generated-${year}-${index}`, age 19–22, bounded attributes, `bref` equal to the generated ID, and no NBA photo metadata.

- [ ] **Step 4: Write and implement inverse-standings draft-order tests**

```js
test("draft order is deterministic and favors non-playoff records", () => {
  const season = fixtureSeasonWithRecords();
  const a = generateDraftOrder(season, { seed: 91 });
  const b = generateDraftOrder(season, { seed: 91 });
  assert.deepEqual(a, b);
  assert.deepEqual(new Set(a), new Set(Object.keys(season.teams)));
  assert.ok(a.indexOf("worst") < a.indexOf("best"));
});
```

Use a seeded weighted lottery for the bottom teams, then inverse record with deterministic tie-breaking for the rest. Never mutate standings.

- [ ] **Step 5: Implement `createDraftState` and verify**

The draft year is the completed `season.year`; the selected debut cards belong to `season.year + 1`. The class must contain at least one prospect per team. Set `status: "in_progress"` and `currentPick: 0`.

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/leagueDraft.test.js && npm test`

Commit: `Add deterministic league rookie draft`

---

### Task 2: Execute User and CPU Draft Picks with Rookie Contracts

**Files:**
- Modify: `js/engine/leagueDraft.js`
- Modify: `js/modes/leagueCareer.js`
- Modify: `tests/leagueDraft.test.js`
- Modify: `tests/leagueCareer.test.js`

**Interfaces:**
- Produces: `rookieContractForPick(pickNumber, year)`.
- Produces: `selectDraftProspect(draft, season, prospectId)`.
- Produces: `advanceDraftToUserPick(draft, season)`.
- Produces: `beginCareerDraft(career)` and `makeCareerDraftPick(career, prospectId)`.

- [ ] **Step 1: Add failing contract and selection tests**

Assert four guaranteed years, descending pick-based salary, immutable draft-state replacement, removal from the available pool, addition to the drafting roster, and a selection record containing team, pick, `bref`, source, and contract.

- [ ] **Step 2: Implement deterministic CPU valuation**

Score prospects by overall, potential, positional need, and a seeded tie-break derived from draft seed/team/pick/prospect ID. CPU teams must select without `Math.random()`. When full, waive the lowest `(overall - age penalty)` non-rookie and record the waiver.

- [ ] **Step 3: Add the career wrapper**

Store active draft state at `career.management.draft`; store completed drafts in `career.management.draftHistory`; append concise events with `recordCareerEvent`. `makeCareerDraftPick` must reject picks when the current team is not the user team.

- [ ] **Step 4: Verify repeated picks and full completion**

Test CPU advancement before and after the user's pick, uniqueness of selected players, final `status: "complete"`, roster caps, and draft-history preservation.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/leagueDraft.test.js tests/leagueCareer.test.js && npm test`

Commit: `Add rookie contracts and career draft flow`

---

### Task 3: Stage the Offseason and Preserve Fifteen-Year Continuity

**Files:**
- Modify: `js/engine/season.js`
- Modify: `js/modes/leagueCareer.js`
- Modify: `js/data/saveRoot.js`
- Create: `tests/longCareer.test.js`
- Modify: `tests/saveRoot.test.js`

**Interfaces:**
- Produces career phases `season_complete`, `draft`, and `regular`.
- Produces `prepareCareerOffseason(career)`.
- Produces `completeCareerOffseason(career)`.
- Produces annual summaries under `career.history` and `career.management.seasonHistory`.

- [ ] **Step 1: Write a failing staged-offseason test**

Start from a completed season fixture. Assert that preparation snapshots champion, user record, awards, and year; creates a draft before resetting the season; and does not mutate the input career when validation fails.

- [ ] **Step 2: Split yearly reset from career orchestration**

Keep `advanceLeagueOffseason` compatible for standalone seasons. In the career wrapper, prepare the draft first; after completion, call existing development/reset logic exactly once and synchronize phase/year.

- [ ] **Step 3: Validate optional management data**

Extend root-save validation to reject malformed active drafts and non-object development plans while accepting schema-v3 saves with no `management` field.

- [ ] **Step 4: Add a fifteen-year deterministic simulation test**

Use small fixture leagues and generated post-2025 classes. For each year, complete a draft and offseason. Assert advancing years, unique active `bref` identities, roster caps, 15 season summaries, 15 draft histories, and save round-trip equality.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/longCareer.test.js tests/saveRoot.test.js && npm test`

Commit: `Stage long-career offseason progression`

---

### Task 4: Add Stable Development Plans and Growth Modifiers

**Files:**
- Create: `js/modes/playerDevelopment.js`
- Create: `tests/playerDevelopment.test.js`
- Modify: `js/engine/develop.js`
- Modify: `js/modes/leagueCareer.js`

**Interfaces:**
- Produces: `setDevelopmentPlan(career, bref, plan)`.
- Produces: `recommendDevelopmentPlans(career)`.
- Produces: `developmentModifier(player, plan, context)`.
- Plans contain `focus`, `role`, `mentorBref`, and `load`.

- [ ] **Step 1: Write failing immutable-plan tests**

Cover valid focuses (`shooting`, `playmaking`, `defense`, `conditioning`, `balanced`), roles, mentor lookup on the same roster, stable `bref` keys, and manual-over-automatic behavior through `manualOverrides.training`.

- [ ] **Step 2: Implement bounded modifiers**

Apply at most ±3 total attribute points per year. Minutes, morale, role stability, mentor quality, and injury/load risk contribute capped adjustments. Modifiers may bend but not replace the historical card trajectory.

- [ ] **Step 3: Integrate development context**

Pass the prior season's player stats and saved plan into `developLeagueRosters`. Preserve plans after card-ID replacement and prune plans only when that `bref` leaves the user's roster.

- [ ] **Step 4: Test historical and generated prospects**

Assert deterministic bounded gains, no mutation on invalid plans, plan survival across card changes, and automatic plan recommendations never replacing manual values.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/playerDevelopment.test.js tests/manualOverrides.test.js && npm test`

Commit: `Add persistent player development plans`

---

### Task 5: Add Draft and Development Tabs Without Growing `app.js`

**Files:**
- Create: `js/ui/leagueManagementView.js`
- Create: `tests/leagueManagementView.test.js`
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/app.js`

**Interfaces:**
- Produces: `renderDraftBoard(container, model, handlers)`.
- Produces: `renderDevelopmentPlans(container, model, handlers)`.
- Adds panels `#season-draft-board` and `#season-development`.

- [ ] **Step 1: Add view tests with a minimal DOM fixture**

Verify prospect source labels, scouting ranges rather than exact future OVR, disabled controls outside the user pick, explicit “手动” development markers, and escaped text.

- [ ] **Step 2: Add the two season-hub tabs and responsive panels**

Reuse existing panel/list tokens. At widths below 760px, controls stack to one column and no fixed-width element creates horizontal overflow.

- [ ] **Step 3: Wire thin callbacks in `app.js`**

Callbacks replace `state.leagueCareer`, synchronize `state.season`, call `saveSeasonAndCareer`, and rerender. Render functions themselves must not save or mutate state.

- [ ] **Step 4: Add offseason routing**

After the finals, “进入休赛期” opens the draft panel. Completing the draft exposes “开始新赛季”; existing standalone season behavior remains unchanged.

- [ ] **Step 5: Run tests, browser smoke checks, and commit**

Run: `npm test && node --check js/app.js && git diff --check`

Browser: finish a fixture season, make the user pick, complete the draft, start the next year, hard-refresh, and verify both draft history and development plans persist.

Commit: `Add league draft and development management UI`

---

### Task 6: Add League Timeline, Documentation, and Final Regression

**Files:**
- Modify: `js/ui/leagueManagementView.js`
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `README.md`
- Create: `tests/careerTimeline.test.js`

**Interfaces:**
- Produces a read-only history panel from `seasonHistory`, `draftHistory`, and career events.
- Produces compact yearly records suitable for root-save storage.

- [ ] **Step 1: Add timeline projection tests**

Assert chronological season cards containing year, record, finish/champion, awards, user draft pick, and major transactions without embedding full box scores.

- [ ] **Step 2: Render league history**

Add a history tab with yearly summaries and filters for seasons, drafts, and transactions. Keep advanced detail collapsed by default.

- [ ] **Step 3: Update README**

Document the long-term loop, historical-debut data limitation, generated post-2025 rookies, portable saves, and which deeper contract/pick-trading features remain future work.

- [ ] **Step 4: Run complete verification**

Run:

```bash
npm test
node --check js/app.js
git diff --check
git status -sb
```

Browser checks: franchise and time-travel careers both complete two offseasons; manual plans survive refresh; old schema-v3 saves resume; quick/ranked/gold/standalone entries still open.

- [ ] **Step 5: Commit**

Commit: `Document and verify long-term league careers`

---

## Completion Evidence

Phase 2 is complete only when:

1. A franchise and a time-travel career can each complete repeated draft/offseason cycles.
2. A deterministic 15-year automated regression passes, including years after 2025.
3. Every team drafts uniquely, honors the roster cap, and receives persisted rookie contracts.
4. Development plans use `bref`, survive yearly card replacement, and manual plans beat recommendations.
5. Root-save import/export round-trips active drafts, plans, season history, and draft history while old schema-v3 saves remain valid.
6. The UI labels historical classes as debut classes and generated classes as fictional.
7. Existing modes pass automated and browser regression checks.
