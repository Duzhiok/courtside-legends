import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptCareerContract,
  advanceSeasonGoal,
  careerPerformance,
  declineCareerContracts,
  evaluateCareerEmployment,
} from "../js/modes/careerContract.js";
import { SEASON_GOAL_TRUST_BONUS, SEASON_GOAL_TRUST_PENALTY } from "../js/career/balance.js";

function rootWithHistory(history, seasonOverrides = {}) {
  return {
    leagueCareer: {
      season: { year: 1996, ...seasonOverrides },
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

/** A player card overall() can score deterministically, same trick seasonGoals.test.js uses. */
function player(ovr) {
  return { ovr2k: ovr, ratingSource: "anchor" };
}

function league(ovrByTeam) {
  return Object.fromEntries(
    Object.entries(ovrByTeam).map(([id, ovrs]) => [id, { players: ovrs.map(player) }]),
  );
}

// A realistic-size league so the rebuild/middle/contender thirds split doesn't degenerate (same
// note as seasonGoals.test.js).
const WEAK_LEAGUE = league({
  USER: Array(8).fill(45),
  STRONG: Array(8).fill(95),
  F1: Array(8).fill(55),
  F2: Array(8).fill(60),
  F3: Array(8).fill(65),
  F4: Array(8).fill(70),
  F5: Array(8).fill(75),
  F6: Array(8).fill(80),
  F7: Array(8).fill(85),
});
const STRONG_LEAGUE = league({
  USER: Array(8).fill(95),
  WEAK: Array(8).fill(45),
  F1: Array(8).fill(55),
  F2: Array(8).fill(60),
  F3: Array(8).fill(65),
  F4: Array(8).fill(70),
  F5: Array(8).fill(75),
  F6: Array(8).fill(80),
  F7: Array(8).fill(85),
});

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

// B1 of docs/CAREER_LIFE_ROADMAP.md: the season goal that used to be dead flavor text
// (firstYearGoal) now actually swings frontOfficeTrust at year's end.
test("advanceSeasonGoal grants trust and logs a hit when the pending goal was achieved", () => {
  const root = rootWithHistory(
    [summary(1995, 55, 27)],
    { year: 1996, teams: WEAK_LEAGUE, userTeamId: "USER" },
  );
  root.story.seasonGoal = { year: 1995, tier: "rebuild", kind: "win-rate", target: 0.35, label: "x", labelEn: "x", status: "active" };
  const next = advanceSeasonGoal(root);
  assert.equal(next.story.frontOfficeTrust, 50 + SEASON_GOAL_TRUST_BONUS);
  const logged = next.story.eventLog.at(-1);
  assert.equal(logged.type, "season-goal-result");
  assert.equal(logged.year, 1995);
  assert.equal(logged.achieved, true);
  assert.equal(logged.trustDelta, SEASON_GOAL_TRUST_BONUS);
});

test("advanceSeasonGoal penalizes trust and logs a miss when the pending goal was not achieved", () => {
  const root = rootWithHistory(
    [summary(1995, 10, 72)],
    { year: 1996, teams: WEAK_LEAGUE, userTeamId: "USER" },
  );
  root.story.seasonGoal = { year: 1995, tier: "rebuild", kind: "win-rate", target: 0.35, label: "x", labelEn: "x", status: "active" };
  const next = advanceSeasonGoal(root);
  assert.equal(next.story.frontOfficeTrust, 50 + SEASON_GOAL_TRUST_PENALTY);
  assert.equal(next.story.eventLog.at(-1).achieved, false);
});

test("advanceSeasonGoal never drops trust below zero", () => {
  const root = rootWithHistory(
    [summary(1995, 10, 72)],
    { year: 1996, teams: WEAK_LEAGUE, userTeamId: "USER" },
  );
  root.story.frontOfficeTrust = 2;
  root.story.seasonGoal = { year: 1995, tier: "rebuild", kind: "win-rate", target: 0.9, label: "x", labelEn: "x", status: "active" };
  assert.equal(advanceSeasonGoal(root).story.frontOfficeTrust, 0);
});

test("advanceSeasonGoal assigns a new goal for the upcoming season, sized to the current roster", () => {
  const root = rootWithHistory([], { year: 1996, teams: STRONG_LEAGUE, userTeamId: "USER" });
  root.story.seasonGoal = null;
  const next = advanceSeasonGoal(root);
  assert.equal(next.story.seasonGoal.year, 1996);
  assert.equal(next.story.seasonGoal.status, "active");
  assert.equal(next.story.seasonGoal.tier, "contender", "USER is the strongest roster in STRONG_LEAGUE");
});

test("advanceSeasonGoal with no pending goal yet still assigns one without touching trust", () => {
  const root = rootWithHistory([], { year: 1996, teams: WEAK_LEAGUE, userTeamId: "USER" });
  delete root.story.seasonGoal;
  const next = advanceSeasonGoal(root);
  assert.equal(next.story.frontOfficeTrust, 50, "no pending goal means nothing to judge");
  assert.ok(next.story.seasonGoal, "a goal for the upcoming season must still be assigned");
  assert.equal(next.story.eventLog.length, 0, "nothing to log when there was no prior goal to resolve");
});

test("advanceSeasonGoal does not resolve a goal whose season summary hasn't been recorded yet", () => {
  // Pending goal is for 1996, but seasonHistory only has 1995 -- the 1996 season isn't over, so
  // there's nothing to judge yet. Must not silently "achieve" or "miss" against the wrong year.
  const root = rootWithHistory([summary(1995, 50, 32)], { year: 1996, teams: WEAK_LEAGUE, userTeamId: "USER" });
  root.story.seasonGoal = { year: 1996, tier: "middle", kind: "finish", target: "playoffs", label: "x", labelEn: "x", status: "active" };
  const next = advanceSeasonGoal(root);
  assert.equal(next.story.frontOfficeTrust, 50, "no summary for the pending goal's year yet");
  assert.equal(next.story.eventLog.length, 0);
});

test("advanceSeasonGoal leaves the pending goal untouched if the next season's roster isn't available", () => {
  const root = rootWithHistory([summary(1995, 55, 27)]); // no teams/userTeamId on this season
  const goal = { year: 1995, tier: "rebuild", kind: "win-rate", target: 0.35, label: "x", labelEn: "x", status: "active" };
  root.story.seasonGoal = goal;
  const next = advanceSeasonGoal(root);
  assert.equal(next.story.frontOfficeTrust, 50 + SEASON_GOAL_TRUST_BONUS, "the finished season's goal is still judged");
  assert.deepEqual(next.story.seasonGoal, goal, "but no new goal can be computed without a roster");
});

test("advanceSeasonGoal does not mutate the input root", () => {
  const root = rootWithHistory([summary(1995, 55, 27)], { year: 1996, teams: WEAK_LEAGUE, userTeamId: "USER" });
  root.story.seasonGoal = { year: 1995, tier: "rebuild", kind: "win-rate", target: 0.35, label: "x", labelEn: "x", status: "active" };
  const before = JSON.stringify(root);
  advanceSeasonGoal(root);
  assert.equal(JSON.stringify(root), before);
});
