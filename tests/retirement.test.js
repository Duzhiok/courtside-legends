// B7: retirement. Real-engine fixtures throughout (tests/helpers/careerFixtures.js).
import test from "node:test";
import assert from "node:assert/strict";
import { COACH_RETIRE_AGE } from "../js/career/balance.js";
import { buildLegacy } from "../js/career/legacy.js";
import { maybeCreatePoachOffer } from "../js/modes/poaching.js";
import { evaluateCareerEmployment } from "../js/modes/careerContract.js";
import {
  canRetire, previewLegacy, retireCoach, retireIfDue, retirementBlocker, settleCoachAge,
} from "../js/modes/retirement.js";
import { readRootSave, writeRootSave } from "../js/data/saveRoot.js";
import { buildCareerReport } from "../js/story/eventEngine.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import {
  YEAR, firedRoot, goodSeasons, poachReadyRoot, withGamePlayed, withHistory,
} from "./helpers/careerFixtures.js";

const withAge = (root, age) => ({ ...root, coach: { ...root.coach, age } });
const withStory = (root, patch) => ({ ...root, story: { ...root.story, ...patch } });

// ------------------------------------------------------------------ aging
test("settleCoachAge: nothing happens before a season has been finished", () => {
  const fresh = poachReadyRoot({ seasons: 0 });
  assert.equal(settleCoachAge(fresh), fresh);
});

test("settleCoachAge: a finished season makes the coach a year older, once", () => {
  const root = poachReadyRoot();
  const aged = settleCoachAge(root);
  assert.equal(aged.coach.age, root.coach.age + 1);
  const entry = aged.story.eventLog.at(-1);
  assert.deepEqual([entry.type, entry.year, entry.from, entry.to], ["coach-aged", YEAR - 1, root.coach.age, root.coach.age + 1]);
  assert.equal(settleCoachAge(aged), aged, "the same season can't age him twice");
});

test("settleCoachAge: each new finished season adds a year, and a reload (saved log) can't double-count", () => {
  const root = poachReadyRoot({ seasons: 3 });
  let aged = settleCoachAge(root);
  const storage = createMemoryStorage();
  writeRootSave(aged, storage);
  aged = readRootSave(storage);
  assert.equal(settleCoachAge(aged), aged, "still guarded after a save round-trip");
  const nextSeason = [...goodSeasons(root, 3), { year: YEAR, teamId: root.story.employer, teamName: "T", record: { w: 50, l: 32 }, finish: "playoffs", championId: "LAL" }];
  const later = settleCoachAge(withHistory(aged, nextSeason));
  assert.equal(later.coach.age, root.coach.age + 2);
});

test("a retired coach stops aging", () => {
  const retired = retireCoach(poachReadyRoot());
  assert.equal(settleCoachAge(retired), retired);
});

// ------------------------------------------------------------------ when you may retire
test("retirementBlocker: each closed gate names itself, and a coach with a clear desk may go", () => {
  const ready = poachReadyRoot();
  assert.equal(retirementBlocker(ready), null);
  assert.equal(canRetire(ready), true);
  assert.equal(retirementBlocker(null), "no-career");
  assert.equal(retirementBlocker(poachReadyRoot({ seasons: 0 })), "no-finished-season", "nothing to retire from yet");
  assert.equal(retirementBlocker(withGamePlayed(ready)), "season-underway", "a half-played season isn't thrown away");
  assert.equal(retirementBlocker(withStory(ready, { pendingDecision: { type: "contract-renewal", year: YEAR } })), "decision-pending");
  assert.equal(retirementBlocker(retireCoach(ready)), "already-retired");
});

test("a coach between jobs (fired) may retire instead of job-hunting", () => {
  const fired = firedRoot(70);
  assert.equal(retirementBlocker(fired), null);
});

test("retiring when blocked throws, and so does retiring twice", () => {
  const ready = poachReadyRoot();
  assert.throws(() => retireCoach(withGamePlayed(ready)), /season-underway/);
  assert.throws(() => retireCoach(poachReadyRoot({ seasons: 0 })), /no-finished-season/);
  assert.throws(() => retireCoach(retireCoach(ready)), /already retired/);
});

// ------------------------------------------------------------------ retiring
test("retiring from a job: stint archived as 'retired', terminal status, rated ending, desk cleared", () => {
  const root = withStory(poachReadyRoot(), { poachOffer: { year: YEAR, id: "x", teamId: "SAS", teamName: "S", archetype: "contender" } });
  const out = retireCoach(root);

  assert.equal(out.story.employment.status, "retired");
  assert.equal(out.story.employment.reason, "voluntary");
  assert.equal(out.story.employment.age, root.coach.age);
  assert.equal(out.story.currentChapter, "epilogue");
  assert.equal(out.story.pendingDecision, null);
  assert.equal(out.story.poachOffer, null, "an offer pending when you retire is moot");

  assert.equal(out.coach.stints.length, root.coach.stints.length + 1);
  const stint = out.coach.stints.at(-1);
  assert.equal(stint.reason, "retired");
  assert.equal(stint.teamId, root.story.employer);
  assert.equal(stint.seasons, 2);
  assert.equal(stint.wins, 116);

  const legacy = buildLegacy(out.coach);
  assert.equal(out.story.ending.id, "retired");
  assert.equal(out.story.ending.tier, legacy.tier);
  assert.ok(out.story.ending.label && out.story.ending.labelEn);
  const log = out.story.eventLog.at(-1);
  assert.deepEqual([log.type, log.reason, log.tier], ["retired", "voluntary", legacy.tier]);

  assert.equal(out.coach.cash, root.coach.cash, "retiring doesn't touch savings");
  assert.equal(out.coach.reputation, root.coach.reputation);
});

test("the preview before retiring is exactly the legacy you get after", () => {
  const root = poachReadyRoot();
  const preview = previewLegacy(root);
  assert.equal(preview.seasons, 2, "the job in progress counts in the preview");
  assert.deepEqual(buildLegacy(retireCoach(root).coach), preview);
});

test("retiring after being fired does not archive the old job a second time", () => {
  const fired = firedRoot(70);
  const out = retireCoach(fired);
  assert.equal(out.coach.stints.length, fired.coach.stints.length);
  assert.equal(out.coach.stints.filter((s) => s.reason === "retired").length, 0);
  assert.equal(out.story.employment.status, "retired");
});

test("a retired career is closed to every other engine: no firing check, no poaching, no more aging", () => {
  const retired = retireCoach(poachReadyRoot({ reputation: 95 }));
  assert.equal(evaluateCareerEmployment(retired), retired);
  assert.equal(maybeCreatePoachOffer(retired), retired);
  assert.equal(settleCoachAge(retired), retired);
});

test("the report and the save: a retired career survives a round-trip with its ending and legacy", () => {
  const retired = retireCoach(poachReadyRoot());
  const storage = createMemoryStorage();
  writeRootSave(retired, storage);
  const back = readRootSave(storage);
  assert.equal(back.story.employment.status, "retired");
  assert.equal(back.coach.stints.at(-1).reason, "retired");
  assert.deepEqual(buildLegacy(back.coach), buildLegacy(retired.coach));
  const report = buildCareerReport(back);
  assert.equal(report.finished, true);
  assert.equal(report.ending.id, "retired");
  assert.deepEqual(report.legacy, buildLegacy(back.coach));
});

// ------------------------------------------------------------------ forced retirement
test("retireIfDue: below the age nothing happens; at the age the coach is retired, reason 'forced'", () => {
  const young = withAge(poachReadyRoot(), COACH_RETIRE_AGE - 1);
  assert.equal(retireIfDue(young), young);
  const due = retireIfDue(withAge(poachReadyRoot(), COACH_RETIRE_AGE));
  assert.equal(due.story.employment.status, "retired");
  assert.equal(due.story.employment.reason, "forced");
  assert.equal(due.story.ending.reason, "forced");
});

test("forced retirement ignores the clear-desk rules (mid-season, a pending decision)", () => {
  const busy = withStory(withGamePlayed(withAge(poachReadyRoot(), COACH_RETIRE_AGE)), { pendingDecision: { type: "contract-renewal", year: YEAR } });
  assert.notEqual(retirementBlocker(busy), null, "a voluntary retirement would be refused here");
  assert.equal(retireIfDue(busy).story.employment.status, "retired");
});

test("forced retirement also catches a coach who was just fired, without re-archiving the job", () => {
  const fired = withAge(firedRoot(70), COACH_RETIRE_AGE);
  const out = retireIfDue(fired);
  assert.equal(out.story.employment.status, "retired");
  assert.equal(out.coach.stints.length, fired.coach.stints.length);
});

test("end to end: the season that makes him 70 is his last", () => {
  const root = withAge(poachReadyRoot(), COACH_RETIRE_AGE - 1);
  const aged = settleCoachAge(root);
  assert.equal(aged.coach.age, COACH_RETIRE_AGE);
  assert.equal(retireIfDue(aged).story.employment.reason, "forced");
  assert.equal(retireIfDue(root), root, "...but not a season earlier");
});

test("retireIfDue leaves an already-retired coach alone, whatever his age", () => {
  const retired = retireCoach(poachReadyRoot());
  assert.equal(retireIfDue(retired), retired);
  const old = withAge(retired, COACH_RETIRE_AGE + 5);
  assert.equal(retireIfDue(old), old);
});
