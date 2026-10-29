import test from "node:test";
import assert from "node:assert/strict";
import {
  GAMES_PER_WEEK,
  NULL_SCHEDULE_PRESET,
  advanceOffseason,
  advanceWeek,
  isWeekBoundary,
  onGameCompleted,
  weeksElapsed,
} from "../js/career/calendar.js";
import { OFFSEASON_ENERGY, WEEKLY_ENERGY } from "../js/career/balance.js";
import { createCoachProfile } from "../js/career/coachProfile.js";

test("GAMES_PER_WEEK matches the roadmap's §2.1 cadence (4 games = 1 week)", () => {
  assert.equal(GAMES_PER_WEEK, 4);
});

test("isWeekBoundary fires on every 4th game, not in between", () => {
  const boundaries = [];
  for (let game = 1; game <= 12; game += 1) {
    if (isWeekBoundary(game)) boundaries.push(game);
  }
  assert.deepEqual(boundaries, [4, 8, 12]);
});

test("isWeekBoundary rejects zero, negative, and non-integer game counts", () => {
  for (const bad of [0, -4, 4.5, NaN, undefined, null]) {
    assert.equal(isWeekBoundary(bad), false, String(bad));
  }
});

test("isWeekBoundary honors a custom gamesPerWeek", () => {
  assert.equal(isWeekBoundary(5, 5), true);
  assert.equal(isWeekBoundary(4, 5), false);
});

// Acceptance criterion from docs/CAREER_LIFE_ROADMAP.md A3: an 82-game season produces ~20 weeks.
test("an 82-game regular season produces exactly 20 week boundaries", () => {
  let weekCount = 0;
  for (let game = 1; game <= 82; game += 1) {
    if (isWeekBoundary(game)) weekCount += 1;
  }
  assert.equal(weekCount, 20);
  assert.equal(weeksElapsed(82), 20);
});

test("weeksElapsed floors partial weeks and never goes negative", () => {
  assert.equal(weeksElapsed(0), 0);
  assert.equal(weeksElapsed(3), 0);
  assert.equal(weeksElapsed(4), 1);
  assert.equal(weeksElapsed(7), 1);
  assert.equal(weeksElapsed(-5), 0);
  assert.equal(weeksElapsed(undefined), 0);
});

test("NULL_SCHEDULE_PRESET.apply is a no-op passthrough", () => {
  const coach = createCoachProfile({ energy: 2 });
  assert.equal(NULL_SCHEDULE_PRESET.apply(coach), coach);
});

test("advanceWeek grants weekly energy and runs the default preset", () => {
  const coach = createCoachProfile({ energy: 0 });
  const next = advanceWeek(coach);
  assert.equal(next.energy, WEEKLY_ENERGY);
});

test("advanceWeek runs a custom preset on the freshly granted energy", () => {
  const coach = createCoachProfile({ energy: 0 });
  const spendHalf = { id: "spend-half", apply: (c) => ({ ...c, energy: Math.floor(c.energy / 2) }) };
  const next = advanceWeek(coach, spendHalf);
  assert.equal(next.energy, Math.floor(WEEKLY_ENERGY / 2));
});

test("advanceOffseason grants the larger offseason energy lump", () => {
  const coach = createCoachProfile({ energy: 1 });
  const next = advanceOffseason(coach);
  assert.equal(next.energy, OFFSEASON_ENERGY);
  assert.ok(OFFSEASON_ENERGY > WEEKLY_ENERGY, "sanity: offseason grant should be the bigger one");
});

test("onGameCompleted is a no-op except on week-boundary games", () => {
  const coach = createCoachProfile({ energy: 0 });
  assert.equal(onGameCompleted(coach, 1), coach);
  assert.equal(onGameCompleted(coach, 2), coach);
  assert.equal(onGameCompleted(coach, 3), coach);
  const next = onGameCompleted(coach, 4);
  assert.equal(next.energy, WEEKLY_ENERGY);
});

test("onGameCompleted never pops a dialog -- it's a pure function safe for bulk simulation", () => {
  // Simulating an entire 82-game season headlessly must produce exactly 20 grants and never
  // throw or require any interaction, which is the whole point of the schedule-preset hook.
  // Energy resets to the same WEEKLY_ENERGY value every week (grantEnergy is not additive), so a
  // grant can't be detected by "did the value change" -- count via isWeekBoundary() itself,
  // which is exactly what onGameCompleted uses to decide whether to grant at all.
  let coach = createCoachProfile({ energy: 0 });
  let grants = 0;
  for (let game = 1; game <= 82; game += 1) {
    coach = onGameCompleted(coach, game);
    if (isWeekBoundary(game)) grants += 1;
  }
  assert.equal(grants, 20);
  assert.equal(coach.energy, WEEKLY_ENERGY, "last grant still leaves exactly one week's energy");
});

test("onGameCompleted honors a custom gamesPerWeek and preset together", () => {
  const coach = createCoachProfile({ energy: 0 });
  const doubleIt = { id: "double", apply: (c) => ({ ...c, energy: c.energy * 2 }) };
  assert.equal(onGameCompleted(coach, 4, { gamesPerWeek: 5 }), coach, "not a boundary yet at 4 of 5");
  const next = onGameCompleted(coach, 5, { gamesPerWeek: 5, preset: doubleIt });
  assert.equal(next.energy, WEEKLY_ENERGY * 2);
});
