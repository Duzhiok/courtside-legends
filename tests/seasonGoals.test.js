import test from "node:test";
import assert from "node:assert/strict";
import {
  FINISH_TIERS,
  buildSeasonGoal,
  goalAchieved,
  rosterTier,
  teamRosterStrength,
} from "../js/career/seasonGoals.js";

/** A player card overall() can score deterministically: ovr2k + "anchor" bypasses the formula
 * entirely and just clamps to [40, 100], so `ovr` round-trips exactly for any value in range. */
function player(ovr) {
  return { ovr2k: ovr, ratingSource: "anchor" };
}

function team(ovrs) {
  return { players: ovrs.map(player) };
}

function leagueOf(ovrByTeam) {
  return Object.fromEntries(Object.entries(ovrByTeam).map(([id, ovrs]) => [id, team(ovrs)]));
}

test("teamRosterStrength averages the best GOAL_ROSTER_STRENGTH_SAMPLE players, ignoring the rest", () => {
  // 8-man sample: ten players at 80 OVR plus two scrubs at 40 should still average to 80, because
  // the two scrubs fall outside the top-8 window.
  const t = team([80, 80, 80, 80, 80, 80, 80, 80, 40, 40]);
  assert.equal(teamRosterStrength(t), 80);
});

test("teamRosterStrength handles a roster smaller than the sample size", () => {
  assert.equal(teamRosterStrength(team([60, 70])), 65);
});

test("teamRosterStrength is 0 for a missing or empty roster, not a crash", () => {
  assert.equal(teamRosterStrength(team([])), 0);
  assert.equal(teamRosterStrength({}), 0);
  assert.equal(teamRosterStrength(null), 0);
});

test("rosterTier buckets the user's team into rebuild/middle/contender by league rank", () => {
  const teams = leagueOf({
    WORST: Array(8).fill(50),
    BAD: Array(8).fill(55),
    MID: Array(8).fill(70),
    GOOD: Array(8).fill(85),
    BEST: Array(8).fill(95),
    FILLER1: Array(8).fill(60),
    FILLER2: Array(8).fill(65),
    FILLER3: Array(8).fill(75),
    FILLER4: Array(8).fill(80),
  });
  assert.equal(rosterTier(teams, "WORST"), "rebuild");
  assert.equal(rosterTier(teams, "BEST"), "contender");
});

test("rosterTier throws on a team id that isn't in the league", () => {
  assert.throws(() => rosterTier(leagueOf({ A: [70] }), "GHOST"), /unknown team id/);
});

test("buildSeasonGoal assigns a goal whose tier matches rosterTier, drawn from the real templates", () => {
  // Needs a realistic-size league (the thirds split degenerates with only a couple of teams,
  // same as the pre-existing interview-offer bucketing this mirrors) -- real seasons always have
  // a full league, so this uses enough teams to actually exercise rebuild vs. contender.
  const teams = leagueOf({
    WEAK: Array(8).fill(45),
    STRONG: Array(8).fill(95),
    F1: Array(8).fill(55),
    F2: Array(8).fill(60),
    F3: Array(8).fill(65),
    F4: Array(8).fill(70),
    F5: Array(8).fill(75),
    F6: Array(8).fill(80),
    F7: Array(8).fill(85),
  });
  const weakGoal = buildSeasonGoal(teams, "WEAK");
  const strongGoal = buildSeasonGoal(teams, "STRONG");
  assert.equal(weakGoal.tier, "rebuild");
  assert.equal(weakGoal.kind, "win-rate");
  assert.ok(weakGoal.label && weakGoal.labelEn, "goal must carry display text in both languages");
  assert.equal(strongGoal.tier, "contender");
  assert.equal(strongGoal.kind, "finish");
  assert.equal(strongGoal.target, "finals");
});

test("goalAchieved: win-rate goals compare against actual wins/losses", () => {
  const goal = { kind: "win-rate", target: 0.5 };
  assert.equal(goalAchieved(goal, { record: { w: 41, l: 41 } }), true, "exactly at target counts");
  assert.equal(goalAchieved(goal, { record: { w: 40, l: 42 } }), false);
  assert.equal(goalAchieved(goal, { record: { w: 0, l: 0 } }), false, "no games played is not a hit");
});

test("goalAchieved: finish goals accept the target tier or anything better", () => {
  const goal = { kind: "finish", target: "playoffs" };
  assert.equal(goalAchieved(goal, { finish: "lottery" }), false);
  assert.equal(goalAchieved(goal, { finish: "playoffs" }), true);
  assert.equal(goalAchieved(goal, { finish: "finals" }), true, "finals is better than the playoffs target");
  assert.equal(goalAchieved(goal, { finish: "champion" }), true);
});

test("goalAchieved: an unrecognized finish value on the summary fails closed, not open", () => {
  assert.equal(goalAchieved({ kind: "finish", target: "playoffs" }, { finish: "mystery" }), false);
});

test("goalAchieved throws on an unknown goal kind rather than silently passing", () => {
  assert.throws(() => goalAchieved({ kind: "bogus" }, {}), /unknown season goal kind/);
});

test("FINISH_TIERS is ordered worst-to-best and matches what annualSummary() actually produces", () => {
  assert.deepEqual(FINISH_TIERS, ["lottery", "playoffs", "finals", "champion"]);
});
