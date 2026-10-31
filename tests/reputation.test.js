import test from "node:test";
import assert from "node:assert/strict";
import {
  REPUTATION_BAD_SEASON, REPUTATION_CHAMPIONSHIP, REPUTATION_GOAL_HIT, REPUTATION_GOAL_MISS,
  REPUTATION_GOOD_SEASON, REPUTATION_WINNING_SEASON,
} from "../js/career/balance.js";
import { seasonReputationDelta, settleSeasonReputation } from "../js/career/reputation.js";
import { YEAR, goodSeasons, hiredRoot, withHistory } from "./helpers/careerFixtures.js";

const rec = (w, l) => ({ w, l });

test("seasonReputationDelta: record bands", () => {
  assert.equal(seasonReputationDelta({ record: rec(55, 27) }), REPUTATION_GOOD_SEASON, ".671");
  assert.equal(seasonReputationDelta({ record: rec(60, 40) }), REPUTATION_GOOD_SEASON, "exactly .600 is the good-season line");
  assert.equal(seasonReputationDelta({ record: rec(49, 33) }), REPUTATION_WINNING_SEASON, ".598 just misses it: winning, not good");
  assert.equal(seasonReputationDelta({ record: rec(42, 40) }), REPUTATION_WINNING_SEASON, ".512");
  assert.equal(seasonReputationDelta({ record: rec(36, 46) }), 0, ".439 is the dead zone");
  assert.equal(seasonReputationDelta({ record: rec(28, 54) }), REPUTATION_BAD_SEASON, ".341");
});

test("seasonReputationDelta: a title replaces the record band, the board goal stacks on top", () => {
  assert.equal(seasonReputationDelta({ record: rec(60, 22), champion: true }), REPUTATION_CHAMPIONSHIP, "title, not title + good-season");
  assert.equal(seasonReputationDelta({ record: rec(30, 52), champion: true }), REPUTATION_CHAMPIONSHIP, "a lucky title still counts");
  assert.equal(seasonReputationDelta({ record: rec(60, 22), champion: true, goalAchieved: true }), REPUTATION_CHAMPIONSHIP + REPUTATION_GOAL_HIT);
  assert.equal(seasonReputationDelta({ record: rec(28, 54), goalAchieved: false }), REPUTATION_BAD_SEASON + REPUTATION_GOAL_MISS);
  assert.equal(seasonReputationDelta({ record: rec(41, 41), goalAchieved: null }), REPUTATION_WINNING_SEASON, "no goal on record = no goal adjustment");
});

test("seasonReputationDelta: an empty record is treated as average, not as a disaster", () => {
  assert.equal(seasonReputationDelta({ record: rec(0, 0) }), REPUTATION_WINNING_SEASON);
  assert.equal(seasonReputationDelta({}), REPUTATION_WINNING_SEASON);
});

function settled(root) {
  return settleSeasonReputation(root);
}

test("settleSeasonReputation: pays the last finished season once, and logs what happened", () => {
  const hired = hiredRoot(50);
  const root = withHistory(hired, goodSeasons(hired, 1));
  const out = settled(root);
  assert.equal(out.coach.reputation, 50 + REPUTATION_GOOD_SEASON);
  const entry = out.story.eventLog.at(-1);
  assert.deepEqual({ type: entry.type, year: entry.year, delta: entry.delta, from: entry.from, to: entry.to },
    { type: "reputation-settled", year: YEAR - 1, delta: REPUTATION_GOOD_SEASON, from: 50, to: 54 });
  assert.equal(root.coach.reputation, 50, "input root is not mutated");
});

test("settleSeasonReputation: idempotent per season -- the offseason hook can safely run twice", () => {
  const hired = hiredRoot(50);
  const once = settled(withHistory(hired, goodSeasons(hired, 1)));
  const twice = settled(once);
  assert.equal(twice, once, "same object back: nothing re-applied");
  assert.equal(twice.story.eventLog.filter((e) => e.type === "reputation-settled").length, 1);
});

test("settleSeasonReputation: reads the champion flag and the MATCHING year's goal result", () => {
  const hired = hiredRoot(50);
  const history = goodSeasons(hired, 1, { champion: true });
  const year = history[0].year;
  const withGoals = (entries) => ({ ...withHistory(hired, history), story: { ...hired.story, eventLog: entries } });

  const hit = settled(withGoals([{ type: "season-goal-result", year, achieved: true }]));
  assert.equal(hit.coach.reputation, 50 + REPUTATION_CHAMPIONSHIP + REPUTATION_GOAL_HIT);

  const stale = settled(withGoals([{ type: "season-goal-result", year: year - 1, achieved: false }]));
  assert.equal(stale.coach.reputation, 50 + REPUTATION_CHAMPIONSHIP, "last year's missed goal must not leak into this year");
});

test("settleSeasonReputation: clamps at 0 and 100 and logs the real (clamped) delta", () => {
  const hired = hiredRoot(99);
  const top = settled(withHistory(hired, goodSeasons(hired, 1, { champion: true })));
  assert.equal(top.coach.reputation, 100);
  assert.equal(top.story.eventLog.at(-1).delta, 1, "logged +1, not +8");

  const low = hiredRoot(1);
  const bad = [{ year: YEAR - 1, teamId: low.story.employer, record: rec(20, 62), finish: "lottery", championId: "LAL" }];
  const floor = settled(withHistory(low, bad));
  assert.equal(floor.coach.reputation, 0);
  assert.equal(floor.story.eventLog.at(-1).delta, -1);
});

test("settleSeasonReputation: nothing to settle before the first season ends, and it leaves other coach fields alone", () => {
  const hired = hiredRoot(60);
  assert.equal(settled(hired), hired, "no finished season yet");
  const out = settled(withHistory(hired, goodSeasons(hired, 1)));
  assert.equal(out.coach.cash, hired.coach.cash);
  assert.equal(out.coach.age, hired.coach.age);
});
