import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptCareerContract,
  careerPerformance,
  declineCareerContracts,
  evaluateCareerEmployment,
} from "../js/modes/careerContract.js";

function rootWithHistory(history) {
  return {
    leagueCareer: {
      season: { year: 1996 },
      management: { seasonHistory: history },
    },
    story: {
      currentChapter: "year-five",
      frontOfficeTrust: 50,
      mediaPressure: 20,
      timelineDivergence: 5,
      eventLog: [],
      pendingDecision: null,
      employment: { status: "active" },
    },
  };
}

function summary(year, w, l, championId = "LAL", teamId = "CHI") {
  return { year, teamId, teamName: "Bulls", record: { w, l }, championId };
}

test("careerPerformance aggregates wins, rate, championships, and bad-season streak", () => {
  const root = rootWithHistory([
    summary(1991, 30, 52),
    summary(1992, 28, 54),
  ]);
  const performance = careerPerformance(root);
  assert.equal(performance.seasons, 2);
  assert.equal(performance.wins, 58);
  assert.equal(performance.games, 164);
  assert.equal(performance.championships, 0);
  assert.equal(performance.consecutiveBadSeasons, true);
});

test("two consecutive bad seasons fire the coach before the finale", () => {
  const root = rootWithHistory([summary(1991, 30, 52), summary(1992, 28, 54)]);
  const next = evaluateCareerEmployment(root);
  assert.equal(next.story.employment.status, "fired");
  assert.equal(next.story.ending.id, "fired-before-finale");
  assert.equal(next.story.eventLog.at(-1).type, "employment-ended");
});

test("five completed seasons produce salary, authority, and privilege offers", () => {
  const history = Array.from({ length: 5 }, (_, index) => summary(1991 + index, 45 + index, 37 - index));
  const root = rootWithHistory(history);
  const next = evaluateCareerEmployment(root);
  assert.equal(next.story.employment.status, "renewal");
  assert.equal(next.story.pendingDecision.type, "contract-renewal");
  assert.equal(next.story.employment.offers.length, 2);
  assert.ok(next.story.employment.offers.every((offer) => offer.salary > 0 && offer.privileges.length > 0));
});

test("accepting or declining a renewal is immutable and recorded", () => {
  const history = Array.from({ length: 5 }, (_, index) => summary(1991 + index, 50, 32));
  const root = evaluateCareerEmployment(rootWithHistory(history));
  const accepted = acceptCareerContract(root, "rebuild-extension");
  assert.equal(root.story.employment.status, "renewal");
  assert.equal(accepted.story.employment.status, "renewed");
  assert.equal(accepted.story.employment.offer.salary, 7);
  assert.equal(accepted.story.ending.id, "renewed-career");
  assert.equal(accepted.story.pendingDecision, null);

  const departed = declineCareerContracts(root);
  assert.equal(departed.story.employment.status, "departed");
  assert.equal(departed.story.ending.id, "left-as-legend");
});

test("employment evaluation is idempotent after firing or renewal", () => {
  const history = Array.from({ length: 5 }, (_, index) => summary(1991 + index, 50, 32));
  const renewal = evaluateCareerEmployment(rootWithHistory(history));
  assert.equal(evaluateCareerEmployment(renewal), renewal);
  const fired = evaluateCareerEmployment(rootWithHistory([summary(1991, 30, 52), summary(1992, 28, 54)]));
  assert.equal(evaluateCareerEmployment(fired), fired);
});

// Regression for a real bug: deriveEnding()'s 4-tier narrative verdict (Dynasty
// Builder / History Maker / Unfinished Revolution / Departed Under Pressure) was
// unreachable in the live app -- queueNextTimeTravelEvent() only called it when
// evaluateCareerEmployment() returned the *same object reference* back, but every
// firing/renewal branch always returns a fresh object. So no matter how a 5-year
// tenure actually went, players only ever saw the flat contract-mechanic labels.
// Fixed by having careerContract.js attach deriveEnding()'s verdict onto
// `ending.narrativeTier` directly in the firing/accept/decline branches.
test("a dominant tenure surfaces the Dynasty Builder narrative tier on renewal, not just the flat contract label", () => {
  const history = Array.from({ length: 5 }, (_, index) =>
    summary(1991 + index, 60, 22, index < 2 ? "CHI" : "LAL", "CHI"));
  const root = rootWithHistory(history);
  root.story.frontOfficeTrust = 70;
  const renewal = evaluateCareerEmployment(root);
  const accepted = acceptCareerContract(renewal, "rebuild-extension");
  assert.equal(accepted.story.ending.id, "renewed-career", "mechanic outcome is still the contract pick");
  assert.equal(accepted.story.ending.narrativeTier.id, "dynasty-builder", "but the 5-year verdict now actually shows up");

  const departed = declineCareerContracts(renewal);
  assert.equal(departed.story.ending.narrativeTier.id, "dynasty-builder", "same verdict regardless of accept/decline choice");
});

test("a mediocre tenure that still survives to year 5 does not falsely claim a dynasty", () => {
  const history = Array.from({ length: 5 }, (_, index) => summary(1991 + index, 42, 40));
  const root = rootWithHistory(history);
  root.story.frontOfficeTrust = 30;
  const renewal = evaluateCareerEmployment(root);
  const accepted = acceptCareerContract(renewal, "rebuild-extension");
  assert.equal(accepted.story.ending.narrativeTier.id, "unfinished-revolution");
});

test("getting fired early still carries a narrative verdict, not just the bare firing label", () => {
  const fired = evaluateCareerEmployment(
    rootWithHistory([summary(1991, 30, 52), summary(1992, 28, 54)]),
  );
  assert.ok(fired.story.ending.narrativeTier, "fired endings should also carry a deriveEnding() verdict");
  assert.equal(fired.story.ending.narrativeTier.id, "unfinished-revolution");
});
