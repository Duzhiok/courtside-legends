/**
 * Defensive matchup assignment, extracted from js/app.js (R34). Pure logic: same-position-first,
 * adjacent-position fallback, then any-remaining catch-all, while preserving manual overrides
 * and never double-booking a defender.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MATCHUP_NEAR_POS,
  MATCHUP_POS_ORDER,
  buildSamePosMatchups,
  matchupPosOf,
  sortByMatchupPos,
} from "../js/engine/matchups.js";

function p(id, pos, defense = 50) {
  return { id, name: id, pos, defense };
}

test("matchupPosOf: reads playPos over pos, and normalizes compound/garbage labels the same way app.js always has", () => {
  assert.equal(matchupPosOf(p("a", "PG")), "PG");
  assert.equal(matchupPosOf({ id: "b", pos: "C", playPos: "PF" }), "PF");
  assert.equal(matchupPosOf(p("c", "PG-SG")), "PG");
  // "SF-PF" doesn't start with "P" (starts with "S"), so the PF branch's startsWith("P") guard
  // skips it and it falls through to the SF default -- preserving this exact (slightly quirky)
  // behavior from app.js's original normalizePos() is the whole point of this local copy.
  assert.equal(matchupPosOf(p("d", "SF-PF")), "SF");
  assert.equal(matchupPosOf(p("e", undefined)), "SF");
  assert.equal(matchupPosOf(null), "SF");
});

test("sortByMatchupPos: orders PG -> C, ties broken by higher defense first", () => {
  const list = [p("c1", "C", 60), p("pg1", "PG", 50), p("pf1", "PF", 70), p("pg2", "PG", 80)];
  const sorted = sortByMatchupPos(list);
  assert.deepEqual(sorted.map((x) => x.id), ["pg2", "pg1", "pf1", "c1"]);
});

test("buildSamePosMatchups: same position pairs up first, preferring the higher-defense defender", () => {
  const you = [p("you-pg-weak", "PG", 40), p("you-pg-strong", "PG", 90), p("you-c", "C", 70)];
  const opp = [p("opp-pg", "PG", 50), p("opp-c", "C", 60)];
  const assign = buildSamePosMatchups(you, opp);
  assert.equal(assign["opp-pg"], "you-pg-strong");
  assert.equal(assign["opp-c"], "you-c");
});

test("buildSamePosMatchups: exact position match wins even over a MUCH better defender at a far-off position (position fit beats raw defense rating)", () => {
  // A weak PG (defense 30) must still guard the opposing PG over a dominant defensive center
  // (defense 95) -- a center is not even an "adjacent" position to PG (index distance 4), so if
  // exact-match priority were ever accidentally broken/removed, the fallback tiers would wrongly
  // hand PG to the center purely because of his gaudy defense number.
  const you = [p("weak-pg", "PG", 30), p("elite-c", "C", 95)];
  const opp = [p("opp-pg", "PG", 50)];
  const assign = buildSamePosMatchups(you, opp);
  assert.equal(assign["opp-pg"], "weak-pg", "exact position fit must beat raw defense rating");
});

test("buildSamePosMatchups: no exact position left falls back to an adjacent position", () => {
  const you = [p("you-sf", "SF", 70)];
  const opp = [p("opp-sg", "SG", 50)]; // SG's near list includes SF
  const assign = buildSamePosMatchups(you, opp);
  assert.equal(assign["opp-sg"], "you-sf");
});

test("buildSamePosMatchups: nothing exact or adjacent left still assigns SOMEONE via the final catch-all", () => {
  const you = [p("you-c", "C", 70)];
  const opp = [p("opp-pg", "PG", 50)]; // PG's near list is [SG, SF] -- C is neither
  const assign = buildSamePosMatchups(you, opp);
  assert.equal(assign["opp-pg"], "you-c");
});

test("buildSamePosMatchups: never assigns the same defender to two different opponents", () => {
  const you = [p("you-only", "PG", 80)];
  const opp = [p("opp1", "PG", 50), p("opp2", "PG", 60), p("opp3", "PG", 70)];
  const assign = buildSamePosMatchups(you, opp);
  const defenders = Object.values(assign);
  assert.equal(new Set(defenders).size, defenders.length, "same defender assigned twice");
  assert.equal(defenders.filter((d) => d === "you-only").length, 1);
});

test("buildSamePosMatchups: preserves a saved manual override even if it's a deliberate mismatch", () => {
  const you = [p("you-pg", "PG", 90), p("you-c", "C", 40)];
  const opp = [p("opp-pg", "PG", 50)];
  // Player deliberately put the center on the point guard -- a weird choice, but their choice.
  const assign = buildSamePosMatchups(you, opp, { "opp-pg": "you-c" });
  assert.equal(assign["opp-pg"], "you-c");
});

test("buildSamePosMatchups: a saved override pointing at someone no longer on the roster is ignored, not crashed on", () => {
  const you = [p("you-pg", "PG", 90)];
  const opp = [p("opp-pg", "PG", 50)];
  const assign = buildSamePosMatchups(you, opp, { "opp-pg": "someone-who-got-traded" });
  assert.equal(assign["opp-pg"], "you-pg");
});

test("buildSamePosMatchups: empty pools are a safe no-op", () => {
  assert.deepEqual(buildSamePosMatchups([], []), {});
  assert.deepEqual(buildSamePosMatchups([p("a", "PG")], []), {});
});

test("MATCHUP_POS_ORDER and MATCHUP_NEAR_POS: every position has a near-list, and near-lists only reference real positions", () => {
  for (const pos of MATCHUP_POS_ORDER) {
    assert.ok(Array.isArray(MATCHUP_NEAR_POS[pos]), `${pos} has no near-list`);
    for (const near of MATCHUP_NEAR_POS[pos]) assert.ok(MATCHUP_POS_ORDER.includes(near), `${pos}'s near-list has invalid position ${near}`);
  }
});
