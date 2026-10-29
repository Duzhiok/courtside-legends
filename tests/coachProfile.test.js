import test from "node:test";
import assert from "node:assert/strict";
import {
  COACH_PROFILE_VERSION,
  advanceCoachAge,
  applyCoachXp,
  canAffordEnergy,
  clampCoachProfile,
  createCoachProfile,
  ensureCoachProfile,
  grantEnergy,
  isRetirementAge,
  spendEnergy,
  spendPerkPoint,
  withCoachProfile,
  xpToNextLevel,
} from "../js/career/coachProfile.js";
import { COACH_PERK_LINES, COACH_RETIRE_AGE, COACH_START_AGE } from "../js/career/balance.js";

test("createCoachProfile returns sane starting defaults", () => {
  const coach = createCoachProfile();
  assert.equal(coach.version, COACH_PROFILE_VERSION);
  assert.equal(coach.age, COACH_START_AGE);
  assert.equal(coach.level, 1);
  assert.equal(coach.xp, 0);
  assert.equal(coach.perkPoints, 0);
  assert.equal(coach.cash, 0);
  for (const line of COACH_PERK_LINES) {
    assert.equal(coach.perks[line], 0, `${line} should start unspent`);
  }
});

test("createCoachProfile overrides merge on top of defaults", () => {
  const coach = createCoachProfile({ age: 50, reputation: 90 });
  assert.equal(coach.age, 50);
  assert.equal(coach.reputation, 90);
  assert.equal(coach.mood, 60, "fields not overridden keep their default");
});

test("ensureCoachProfile defaults a root that predates this field, without mutating it", () => {
  const oldRoot = { leagueCareer: { kind: "timeTravel" } };
  const coach = ensureCoachProfile(oldRoot);
  assert.equal(coach.level, 1);
  assert.equal(oldRoot.coach, undefined, "ensureCoachProfile must not write back into root");
});

test("ensureCoachProfile returns the existing profile when present", () => {
  const root = { coach: createCoachProfile({ level: 4 }) };
  assert.equal(ensureCoachProfile(root).level, 4);
});

test("ensureCoachProfile treats a non-object coach field as missing", () => {
  for (const bad of [null, "nope", 42, []]) {
    assert.equal(ensureCoachProfile({ coach: bad }).level, 1);
  }
});

test("withCoachProfile returns a new root object without touching the original", () => {
  const root = { activeMode: "timeTravel" };
  const coach = createCoachProfile({ level: 3 });
  const next = withCoachProfile(root, coach);
  assert.notEqual(next, root);
  assert.equal(root.coach, undefined);
  assert.equal(next.coach, coach);
  assert.equal(next.activeMode, "timeTravel");
});

test("clampCoachProfile repairs out-of-range and missing fields instead of throwing", () => {
  const repaired = clampCoachProfile({
    age: -5,
    reputation: 500,
    cash: "not a number",
    mood: -40,
    energy: -2,
    level: 0,
    xp: -10,
    perkPoints: -1,
    perks: { tactics: 99, madeUp: 2 },
  });
  assert.equal(repaired.age, 0);
  assert.equal(repaired.reputation, 100);
  assert.equal(repaired.cash, 0);
  assert.equal(repaired.mood, 0);
  assert.equal(repaired.energy, 0);
  assert.equal(repaired.level, 1);
  assert.equal(repaired.xp, 0);
  assert.equal(repaired.perkPoints, 0);
  assert.equal(repaired.perks.tactics, 3, "clamped to COACH_PERK_MAX_LEVEL");
  assert.equal(repaired.perks.madeUp, undefined, "unknown perk lines are dropped");
  for (const line of COACH_PERK_LINES) {
    assert.ok(line in repaired.perks, `${line} is always present after clamping`);
  }
});

test("clampCoachProfile tolerates a completely empty input", () => {
  const repaired = clampCoachProfile({});
  assert.equal(repaired.level, 1);
  assert.equal(repaired.perkPoints, 0);
});

test("isRetirementAge / advanceCoachAge", () => {
  const coach = createCoachProfile({ age: COACH_RETIRE_AGE - 1 });
  assert.equal(isRetirementAge(coach), false);
  const older = advanceCoachAge(coach);
  assert.equal(older.age, COACH_RETIRE_AGE);
  assert.equal(isRetirementAge(older), true);
  assert.equal(coach.age, COACH_RETIRE_AGE - 1, "advanceCoachAge does not mutate its input");
});

test("applyCoachXp levels up once and grants one perk point", () => {
  const coach = createCoachProfile();
  const { coach: next, leveledUp } = applyCoachXp(coach, xpToNextLevel(1));
  assert.equal(leveledUp, 1);
  assert.equal(next.level, 2);
  assert.equal(next.xp, 0);
  assert.equal(next.perkPoints, 1);
  assert.equal(coach.level, 1, "applyCoachXp does not mutate its input");
});

test("applyCoachXp can level up multiple times from one big chunk of XP", () => {
  const coach = createCoachProfile();
  // Needs xpToNextLevel(1) + xpToNextLevel(2) to go from level 1 to level 3.
  const total = xpToNextLevel(1) + xpToNextLevel(2) + 15;
  const { coach: next, leveledUp } = applyCoachXp(coach, total);
  assert.equal(leveledUp, 2);
  assert.equal(next.level, 3);
  assert.equal(next.xp, 15);
  assert.equal(next.perkPoints, 2);
});

test("applyCoachXp without enough XP to level up just accumulates it", () => {
  const coach = createCoachProfile();
  const { coach: next, leveledUp } = applyCoachXp(coach, 10);
  assert.equal(leveledUp, 0);
  assert.equal(next.level, 1);
  assert.equal(next.xp, 10);
  assert.equal(next.perkPoints, 0);
});

test("applyCoachXp rejects non-positive amounts as a no-op", () => {
  const coach = createCoachProfile({ xp: 5 });
  for (const amount of [0, -5, NaN, Infinity]) {
    const result = applyCoachXp(coach, amount);
    assert.equal(result.coach, coach, `amount=${amount} should return the same object`);
    assert.equal(result.leveledUp, 0);
  }
});

test("spendPerkPoint moves one point from perkPoints into the chosen line", () => {
  const coach = createCoachProfile({ perkPoints: 2 });
  const next = spendPerkPoint(coach, "tactics");
  assert.equal(next.perkPoints, 1);
  assert.equal(next.perks.tactics, 1);
  assert.equal(coach.perkPoints, 2, "spendPerkPoint does not mutate its input");
});

test("spendPerkPoint rejects an unknown perk line", () => {
  const coach = createCoachProfile({ perkPoints: 1 });
  assert.throws(() => spendPerkPoint(coach, "made-up-line"), RangeError);
});

test("spendPerkPoint rejects spending with no points available", () => {
  const coach = createCoachProfile({ perkPoints: 0 });
  assert.throws(() => spendPerkPoint(coach, "tactics"), /no perk points/);
});

test("spendPerkPoint rejects spending past the max level for a line", () => {
  const coach = createCoachProfile({ perkPoints: 1, perks: { tactics: 3, development: 0, negotiation: 0, media: 0 } });
  assert.throws(() => spendPerkPoint(coach, "tactics"), /already maxed/);
});

test("grantEnergy sets energy to exactly the given amount, not additive", () => {
  const coach = createCoachProfile({ energy: 7 });
  const next = grantEnergy(coach, 3);
  assert.equal(next.energy, 3, "leftover energy from before the grant must not carry over");
  assert.equal(coach.energy, 7, "grantEnergy does not mutate its input");
});

test("grantEnergy rejects a negative or non-finite amount", () => {
  const coach = createCoachProfile();
  for (const bad of [-1, NaN, Infinity, "3"]) {
    assert.throws(() => grantEnergy(coach, bad), RangeError, String(bad));
  }
  assert.doesNotThrow(() => grantEnergy(coach, 0));
});

test("canAffordEnergy / spendEnergy happy path", () => {
  const coach = createCoachProfile({ energy: 3 });
  assert.equal(canAffordEnergy(coach, 3), true);
  assert.equal(canAffordEnergy(coach, 4), false);
  const next = spendEnergy(coach, 2);
  assert.equal(next.energy, 1);
  assert.equal(coach.energy, 3, "spendEnergy does not mutate its input");
});

test("spendEnergy throws rather than going negative when overspending", () => {
  const coach = createCoachProfile({ energy: 1 });
  assert.throws(() => spendEnergy(coach, 2), /not enough energy/);
});

test("spendEnergy rejects a non-positive cost", () => {
  const coach = createCoachProfile({ energy: 5 });
  for (const bad of [0, -1, NaN]) {
    assert.throws(() => spendEnergy(coach, bad), RangeError);
  }
});
