import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceCareerOffseason,
  applyRecommendation,
  beginCareerDraft,
  clearManualOverride,
  createLeagueCareer,
  isSeasonProgressMode,
  makeCareerDraftPick,
  recordCareerEvent,
  resolveRootLiveGame,
  setManualOverride,
  syncCareerPhase,
} from "../js/modes/leagueCareer.js";

function careerWith(overrides = {}) {
  return createLeagueCareer({
    kind: "franchise",
    season: { phase: "regular" },
    careerId: "test-career",
    ...overrides,
  });
}

test("season progress modes include standalone and both long-career kinds", () => {
  assert.equal(isSeasonProgressMode("season"), true);
  assert.equal(isSeasonProgressMode("franchise"), true);
  assert.equal(isSeasonProgressMode("timeTravel"), true);
  for (const mode of ["career", "ranked", "draft"]) {
    assert.equal(isSeasonProgressMode(mode), false);
  }
});

test("clearing root live game cannot preserve a cached finished sim", () => {
  const cached = { sim: { quarter: 4 }, seasonPendingGame: { homeId: "A", awayId: "B" } };

  assert.equal(resolveRootLiveGame("clear", { sim: {} }, cached), null);
  assert.deepEqual(resolveRootLiveGame("preserve", null, cached), cached);
  assert.deepEqual(resolveRootLiveGame("include", { sim: { quarter: 2 } }, cached), {
    sim: { quarter: 2 },
  });
});

test("league career creation initializes the shared wrapper", () => {
  const season = { phase: "regular" };
  const career = createLeagueCareer({
    kind: "timeTravel",
    season,
    storyId: "story-1",
    careerId: "career-1",
  });

  assert.deepEqual(career, {
    careerId: "career-1",
    kind: "timeTravel",
    storyId: "story-1",
    phase: "regular",
    season,
    history: [],
    manualOverrides: {},
    recommendations: {},
    management: {
      draft: null,
      draftHistory: [],
      seasonHistory: [],
    },
  });
});

test("manual PG matchup survives automatic recommendation while SG is applied", () => {
  let career = careerWith();
  career = setManualOverride(career, "matchups", "PG", "defender-1");
  career = applyRecommendation(career, "matchups", {
    PG: "defender-auto",
    SG: "defender-2",
  });

  assert.equal(career.recommendations.matchups.PG, "defender-1");
  assert.equal(career.recommendations.matchups.SG, "defender-2");
});

test("manual and automatic recommendation operations preserve prior wrappers and maps", () => {
  const original = careerWith();
  const overridden = setManualOverride(original, "matchups", "PG", "defender-1");
  const recommended = applyRecommendation(overridden, "matchups", { SG: "defender-2" });

  assert.notEqual(overridden, original);
  assert.notEqual(overridden.manualOverrides, original.manualOverrides);
  assert.notEqual(overridden.recommendations, original.recommendations);
  assert.deepEqual(original.manualOverrides, {});
  assert.deepEqual(original.recommendations, {});

  assert.notEqual(recommended, overridden);
  assert.notEqual(recommended.manualOverrides, overridden.manualOverrides);
  assert.notEqual(recommended.manualOverrides.matchups, overridden.manualOverrides.matchups);
  assert.notEqual(recommended.recommendations, overridden.recommendations);
  assert.notEqual(recommended.recommendations.matchups, overridden.recommendations.matchups);
  assert.deepEqual(overridden.recommendations.matchups, { PG: "defender-1" });
});

test("clearing a manual override keeps its displayed value until the next recommendation", () => {
  const overridden = setManualOverride(careerWith(), "matchups", "PG", "defender-1");
  const cleared = clearManualOverride(overridden, "matchups", "PG");

  assert.equal(cleared.recommendations.matchups.PG, "defender-1");
  assert.equal(cleared.manualOverrides.matchups.PG, undefined);

  const recommended = applyRecommendation(cleared, "matchups", { PG: "defender-auto" });
  assert.equal(recommended.recommendations.matchups.PG, "defender-auto");
});

test("league career history append is immutable and supplied timestamp wins", () => {
  const original = careerWith();
  const recorded = recordCareerEvent(
    original,
    { type: "trade", at: "event-time", playerId: "player-1" },
    "explicit-time",
  );

  assert.notEqual(recorded, original);
  assert.notEqual(recorded.history, original.history);
  assert.deepEqual(original.history, []);
  assert.deepEqual(recorded.history, [
    { at: "explicit-time", type: "trade", playerId: "player-1" },
  ]);
});

test("league career validation rejects invalid inputs descriptively", () => {
  assert.throws(
    () => createLeagueCareer({ kind: "career", season: { phase: "regular" } }),
    TypeError,
  );
  assert.throws(() => createLeagueCareer({ kind: "franchise" }), /season/i);
  assert.throws(() => setManualOverride(careerWith(), "", "PG", "x"), /category/i);
  assert.throws(() => setManualOverride(careerWith(), "matchups", "", "x"), /key/i);
  assert.throws(() => clearManualOverride(careerWith(), "", "PG"), /category/i);
  assert.throws(() => clearManualOverride(careerWith(), "matchups", ""), /key/i);
  assert.throws(
    () => applyRecommendation(careerWith(), "matchups", null),
    /recommendations.*object/i,
  );
  assert.throws(
    () => applyRecommendation(careerWith(), "matchups", []),
    /recommendations.*object/i,
  );
  assert.throws(() => applyRecommendation(careerWith(), "", {}), /category/i);
});

test("league career phase sync copies the nested season phase immutably", () => {
  const original = careerWith();
  original.season.phase = "playoffs";

  const synced = syncCareerPhase(original);

  assert.notEqual(synced, original);
  assert.equal(original.phase, "regular");
  assert.equal(synced.phase, "playoffs");
});

test("league career offseason validates input and blocks managed direct progression", () => {
  assert.throws(() => advanceCareerOffseason(null), /career.*season/i);
  assert.throws(() => advanceCareerOffseason({}), /career.*season/i);

  const original = careerWith();
  const advanced = advanceCareerOffseason(original);

  assert.equal(advanced.career, original);
  assert.equal(advanced.career.phase, "regular");
  assert.equal(advanced.result.ok, false);
  assert.match(advanced.result.reason, /staged|prepare|draft/i);
});

test("legacy direct offseason synchronizes the career wrapper", () => {
  const season = {
    phase: "done",
    year: 2000,
    mode: "modern",
    seed: 1,
    userTeamId: "A",
    league: {
      teamIds: ["A", "B"],
      eastIds: ["A"],
      westIds: ["B"],
      confById: { A: "East", B: "West" },
    },
    teams: {
      A: { id: "A", players: [] },
      B: { id: "B", players: [] },
    },
    playerSeason: {},
    tradeLog: [],
  };
  const original = careerWith({ season });
  delete original.management;

  const advanced = advanceCareerOffseason(original);

  assert.equal(advanced.result.ok, true);
  assert.equal(advanced.career.phase, "regular");
  assert.equal(advanced.career.season.phase, "regular");
  assert.equal(advanced.career.season.year, 2001);
});

function completedCareerSeason(userTeamId = "B") {
  const ids = ["A", "B", "C", "D"];
  return {
    phase: "done",
    year: 2024,
    userTeamId,
    league: { teamIds: ids },
    teams: Object.fromEntries(ids.map((id) => [id, { id, players: [] }])),
    standings: Object.fromEntries(
      ids.map((id, index) => [id, { w: 20 + index, l: 62 - index, pf: 8000, pa: 8100 }]),
    ),
    freeAgents: [],
  };
}

test("career draft requires a completed season and persists CPU advancement", () => {
  const unfinished = careerWith({
    season: { ...completedCareerSeason(), phase: "regular" },
  });
  assert.throws(() => beginCareerDraft(unfinished), /done|complete|season/i);

  const original = careerWith({ season: completedCareerSeason("B") });
  const started = beginCareerDraft(original);

  assert.notEqual(started, original);
  assert.equal(original.management.draft, null);
  assert.equal(started.management.draft.seed, "test-career:2024:draft");
  assert.equal(started.management.draft.order[started.management.draft.currentPick], "B");
  assert.equal(started.history.filter((event) => event.type === "draft-opened").length, 1);
  assert.equal(started.history.at(-1).at, 20240000);
  assert.deepEqual(started.manualOverrides, original.manualOverrides);
  assert.deepEqual(started.recommendations, original.recommendations);
});

test("career draft rejects picks outside the user's turn without mutation", () => {
  const original = careerWith({ season: completedCareerSeason("B") });
  const started = beginCareerDraft(original);
  started.management.draft.order[started.management.draft.currentPick] = "A";
  const before = structuredClone(started);

  assert.throws(
    () => makeCareerDraftPick(started, started.management.draft.prospects[0].prospectId),
    /user|turn/i,
  );
  assert.deepEqual(started, before);
});

test("career draft user picks auto-advance and completion records one summary", () => {
  const original = careerWith({ season: completedCareerSeason("B") });
  const started = beginCareerDraft(original);
  const prospectId = started.management.draft.prospects[0].prospectId;
  const prospectSource = started.management.draft.prospects[0].source;
  const picked = makeCareerDraftPick(started, prospectId);

  assert.notEqual(picked, started);
  assert.equal(started.management.draft.prospects.some((p) => p.prospectId === prospectId), true);
  assert.equal(picked.management.draft.status, "complete");
  assert.equal(picked.management.draftHistory.length, 1);
  assert.notEqual(picked.management.draftHistory[0], picked.management.draft);
  assert.equal(picked.history.filter((event) => event.type === "draft-completed").length, 1);
  assert.equal(picked.management.draft.selections.find((selection) => selection.prospectId === prospectId).teamId, "B");
  assert.equal(picked.management.draft.selections.find((selection) => selection.prospectId === prospectId).source, prospectSource);

  assert.throws(() => makeCareerDraftPick(picked, prospectId), /active|progress|user|turn/i);
  assert.equal(picked.management.draftHistory.length, 1);
  assert.equal(picked.history.filter((event) => event.type === "draft-completed").length, 1);
});

test("career draft cannot reopen a completed draft for the same season", () => {
  const original = careerWith({ season: completedCareerSeason("B") });
  const started = beginCareerDraft(original);
  const completed = makeCareerDraftPick(
    started,
    started.management.draft.prospects[0].prospectId,
  );
  const before = structuredClone(completed);

  assert.throws(() => beginCareerDraft(completed), /already.*complete|complete.*already/i);
  assert.deepEqual(completed, before);
});
