import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceCareerOffseason,
  applyRecommendation,
  clearManualOverride,
  createLeagueCareer,
  recordCareerEvent,
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

test("league career offseason validates input and delegates season result", () => {
  assert.throws(() => advanceCareerOffseason(null), /career.*season/i);
  assert.throws(() => advanceCareerOffseason({}), /career.*season/i);

  const original = careerWith();
  const advanced = advanceCareerOffseason(original);

  assert.notEqual(advanced.career, original);
  assert.equal(advanced.career.phase, "regular");
  assert.deepEqual(advanced.result, {
    ok: false,
    reason: "需先打完总决赛才能进入休赛期",
  });
});
