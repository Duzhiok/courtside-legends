// The between-seasons pipeline, run on real saves. The interesting bugs here are about ORDER.
import test from "node:test";
import assert from "node:assert/strict";
import { COACH_RETIRE_AGE } from "../js/career/balance.js";
import { currentCoachSalary } from "../js/career/finance.js";
import { settleSeasonRollover } from "../js/modes/seasonRollover.js";
import { retireCoach } from "../js/modes/retirement.js";
import { YEAR, badSeasons, hiredRoot, poachReadyRoot, withHistory } from "./helpers/careerFixtures.js";

const withAge = (root, age) => ({ ...root, coach: { ...root.coach, age } });
const rollover = (root) => settleSeasonRollover(root, { year: YEAR });

test("an ordinary rollover: a year older, reputation and money settled, nobody retires", () => {
  const root = poachReadyRoot();
  const out = rollover(root);
  assert.equal(out.root.coach.age, root.coach.age + 1);
  assert.equal(out.retirement, null);
  assert.ok(out.settledReputation && out.settledFinances, "the recap carries the reputation and finance facts");
  assert.notEqual(out.root.story.employment?.status, "retired");
});

test("the season that makes a coach 70 is his last: retired by the age rule, and the recap says so", () => {
  const root = withAge(poachReadyRoot(), COACH_RETIRE_AGE - 1);
  const out = rollover(root);
  assert.equal(out.root.coach.age, COACH_RETIRE_AGE);
  assert.equal(out.root.story.employment.status, "retired");
  assert.equal(out.root.story.employment.reason, "forced");
  assert.deepEqual(out.retirement, { age: COACH_RETIRE_AGE, tier: out.root.story.ending.tier });
  assert.equal(out.root.story.pendingDecision, null, "no story beat is left hanging for a retired coach");
  assert.equal(out.poachOffer, null);
  assert.equal(out.root.coach.stints.at(-1).reason, "retired");
});

test("one season short of the limit he is still coaching", () => {
  const out = rollover(withAge(poachReadyRoot(), COACH_RETIRE_AGE - 2));
  assert.equal(out.root.coach.age, COACH_RETIRE_AGE - 1);
  assert.equal(out.retirement, null);
  assert.notEqual(out.root.story.employment?.status, "retired");
});

test("the last season's pay still lands: retirement is after the books are settled", () => {
  const root = withAge(poachReadyRoot(), COACH_RETIRE_AGE - 1);
  const out = rollover(root);
  assert.equal(out.root.coach.cash, root.coach.cash + currentCoachSalary(root));
});

test("running the same rollover again can't age him twice", () => {
  const root = poachReadyRoot();
  const once = rollover(root).root;
  const twice = rollover(once).root;
  assert.equal(twice.coach.age, root.coach.age + 1);
});

test("fired and of retirement age in the same rollover: the firing is recorded first, then he retires", () => {
  const hired = withAge(hiredRoot(70), COACH_RETIRE_AGE - 1);
  const root = withHistory(hired, badSeasons(hired));
  const out = rollover(root);
  assert.equal(out.root.story.employment.status, "retired");
  assert.equal(out.root.story.employment.reason, "forced");
  assert.equal(out.root.coach.stints.length, root.coach.stints.length + 1, "the job he lost is archived once");
  assert.ok(["two-bad-seasons", "missed-goals", "trust-collapsed"].includes(out.root.coach.stints.at(-1).reason), "...as a firing, not as a retirement");
  assert.equal(out.root.coach.stints.filter((s) => s.reason === "retired").length, 0);
});

test("a retired career is sealed: no pay, no aging, no story beats, nothing changes", () => {
  const retired = retireCoach(poachReadyRoot({ reputation: 90 }));
  const out = rollover(retired);
  assert.equal(out.root, retired, "the very same object comes back");
  assert.deepEqual(Object.keys(out), ["root"], "and there is nothing to recap");
  assert.equal(out.root.coach.cash, retired.coach.cash);
});
