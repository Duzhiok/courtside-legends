import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStagePods,
  computeCareerAllTeam,
  findYourOpenMatch,
  noteCareerAllTeamGame,
  noteCareerLoss,
  runCpuMatchInto,
  yourCareerMatch,
} from "../js/engine/careerBracket.js";

/**
 * Extracted from js/app.js alongside careerEconomy.js (R26 continued): these five
 * functions used to read `state.career` as a hidden global inside app.js. They now
 * take the career object `c` explicitly, which is what makes them testable here at all.
 */
function team(id, overrides = {}) {
  return { bracketId: id, name: id, isCpu: id !== "you", players: [], ...overrides };
}

test("noteCareerLoss: increments the loss counter for that bracketId only", () => {
  const c = { losses: {} };
  noteCareerLoss(c, team("cpu-a"));
  noteCareerLoss(c, team("cpu-a"));
  noteCareerLoss(c, team("cpu-b"));
  assert.deepEqual(c.losses, { "cpu-a": 2, "cpu-b": 1 });
});

test("noteCareerLoss: no-ops safely without c.losses or a bracketId", () => {
  assert.doesNotThrow(() => noteCareerLoss(null, team("x")));
  assert.doesNotThrow(() => noteCareerLoss({}, team("x")));
  assert.doesNotThrow(() => noteCareerLoss({ losses: {} }, null));
});

test("noteCareerAllTeamGame: lazily creates allTeamBoard and is a no-op without a snapshot", () => {
  const c = {};
  noteCareerAllTeamGame(c, null, team("a"), team("b"));
  assert.equal(c.allTeamBoard, undefined, "nothing should be created when snap is missing");
  // A minimal fake snapshot just needs whatever shape accumulateGameToAllTeamBoard reads;
  // the point of this test is the wiring (board gets created, doesn't throw), not the box math.
  assert.doesNotThrow(() => noteCareerAllTeamGame(c, { home: {}, away: {}, score: { home: 1, away: 0 } }, team("a"), team("b")));
  assert.ok(c.allTeamBoard, "board should exist after a real snapshot comes through");
});

test("runCpuMatchInto: a match already done or belonging to the human is left untouched", () => {
  const c = { losses: {} };
  const doneMatch = { a: team("a"), b: team("b"), done: true, yours: false };
  const yoursMatch = { a: team("you"), b: team("b"), done: false, yours: true };
  const beforeDone = JSON.stringify(doneMatch);
  const beforeYours = JSON.stringify(yoursMatch);
  runCpuMatchInto(c, doneMatch);
  runCpuMatchInto(c, yoursMatch);
  assert.equal(JSON.stringify(doneMatch), beforeDone);
  assert.equal(JSON.stringify(yoursMatch), beforeYours);
});

test("runCpuMatchInto: null/undefined match is a safe no-op", () => {
  assert.doesNotThrow(() => runCpuMatchInto({ losses: {} }, null));
});

test("yourCareerMatch: pods take priority over the legacy flat roundMatches list", () => {
  const { pods } = buildStagePods([team("you"), team("b"), team("c"), team("d")]);
  const c = {
    pods,
    roundMatches: [{ a: team("you"), b: team("z"), yours: true, done: false }],
  };
  const fromPods = findYourOpenMatch(pods);
  assert.ok(fromPods, "pods really do have an open match for 'you' in this fixture");
  assert.equal(yourCareerMatch(c), fromPods);
});

test("yourCareerMatch: falls back to roundMatches when there are no pods", () => {
  const openMatch = { a: team("you"), b: team("z"), yours: true, done: false };
  const c = { roundMatches: [{ a: team("x"), b: team("y"), yours: false, done: true }, openMatch] };
  assert.equal(yourCareerMatch(c), openMatch);
});

test("yourCareerMatch: no pods, no roundMatches, nothing crashes — returns null", () => {
  assert.equal(yourCareerMatch({}), null);
  assert.equal(yourCareerMatch(null), null);
});

test("computeCareerAllTeam: with no board yet, falls back to pulling rosters from team/alive/series", () => {
  const c = {
    team: team("you", { players: [{ id: "p1", pos: "PG", name: "P1" }] }),
    alive: [team("cpu-a", { players: [{ id: "p2", pos: "SG", name: "P2" }] })],
  };
  const result = computeCareerAllTeam(c);
  assert.ok(Array.isArray(result));
  assert.equal(c.allTeam, result, "the computed all-team is stashed back onto c.allTeam");
});

test("computeCareerAllTeam: a career object with nothing at all returns an empty array, not a crash", () => {
  assert.deepEqual(computeCareerAllTeam(null), []);
  assert.deepEqual(computeCareerAllTeam({}), []);
});
