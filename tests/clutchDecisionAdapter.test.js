// M2b-2 adapter: the UI's path (scenario -> sim -> controller -> outcome ->
// explanation) writes the player's choice into the engine and reads the
// structured outcome back — never a guess from the score. Non-clutch games
// must be untouched by any of it.
import test from "node:test";
import assert from "node:assert/strict";
import { createClutchController, explainClutchOutcome, initializeScenario, startClutchSim } from "../js/engine/clutchController.js";
import { seededStream } from "../js/core/seededRandom.js";
import { CLUTCH_POOL, buildClutchSim, otherThanClutch } from "./helpers/clutchSim.js";

function playOne(seed, decide) {
  const { sim } = buildClutchSim(seed);
  const ctrl = createClutchController({ sim });
  const pick = otherThanClutch(seed);
  let outcome = null;
  if (decide) {
    ctrl.openDecision();
    assert.ok(ctrl.select(pick.id, "three").ok);
    assert.ok(ctrl.submit().ok);
    assert.ok(ctrl.resolve().ok);
    outcome = ctrl.outcome;
  } else {
    // No decision: step the same single possession and see who really shot.
    const fga = new Map(sim.home.roster.map((p) => [p.id, p.stats.fga || 0]));
    for (let i = 0; i < 6; i++) {
      sim.step();
      if (sim.home.roster.some((p) => (p.stats.fga || 0) > fga.get(p.id))) break;
    }
    const shooter = sim.home.roster.find((p) => (p.stats.fga || 0) > fga.get(p.id));
    return { shooterId: shooter?.id ?? null, outcome: null };
  }
  return { shooterId: outcome?.actualShooterId ?? null, outcome };
}

test("the player's choice reaches the engine: the pick shoots far more often with the call than without", () => {
  const N = 150;
  let withCall = 0, withShots = 0, without = 0, withoutShots = 0;
  for (let seed = 1; seed <= N; seed++) {
    const pick = otherThanClutch(seed).id;
    const a = playOne(seed, true);
    if (a.outcome?.attempted) { withShots++; if (a.shooterId === pick) withCall++; }
    const b = playOne(seed, false);
    if (b.shooterId) { withoutShots++; if (b.shooterId === pick) without++; }
  }
  const shareWith = withCall / withShots;
  const shareWithout = without / withoutShots;
  assert.ok(shareWith >= 0.4, `pick share with the call ${shareWith.toFixed(2)} (target >= 0.4)`);
  assert.ok(shareWith - shareWithout >= 0.2, `call lifts the pick (${shareWith.toFixed(2)} vs ${shareWithout.toFixed(2)} default)`);
});

test("the adapter's outcome carries the decision through: shooter, hint and attempt id", () => {
  const { sim } = buildClutchSim(21);
  const ctrl = createClutchController({ sim });
  const pick = otherThanClutch(21);
  ctrl.openDecision();
  ctrl.select(pick.id, "attack");
  ctrl.submit();
  ctrl.resolve();
  assert.equal(ctrl.outcome.shooterId, pick.id);
  assert.equal(ctrl.outcome.actionHint, "attack");
  assert.equal(ctrl.outcome.attemptId, "clutch-1");
  assert.equal(sim.clutchLog.length, 1);
});

test("explainClutchOutcome: the five answers come from the outcome, and each reason maps to its failure kind", () => {
  const base = { attemptId: "clutch-1", shooterId: "p1", actionHint: "three", handedOff: true, attempted: false, zone: null, made: false, points: 0, actualShooterId: null, teamPoints: 0, honored: false, reason: "turnover" };
  const kinds = {
    turnover: "turnover",
    foul: "foul",
    doubled: "defense",
    kicked_out: "defense",
    not_handed_off: "not_handed_off",
    not_on_court: "not_on_court",
    no_possession: "no_possession",
  };
  for (const [reason, kind] of Object.entries(kinds)) {
    const ex = explainClutchOutcome({ ...base, reason }, { shooterName: "Klay", actualShooterName: "" });
    assert.equal(ex.failureKind, kind, reason);
    assert.equal(ex.attempted, false);
    assert.equal(ex.reason, reason);
    // Same score delta, different reason => different explanation: nothing is inferred from the score.
    assert.equal(ex.teamPoints, 0);
  }
  // A made three by the pick: ball received, executed as chosen, no failure.
  const made = explainClutchOutcome(
    { ...base, handedOff: true, attempted: true, zone: "three", made: true, points: 3, actualShooterId: "p1", teamPoints: 3, honored: true, reason: null },
    { shooterName: "Klay", actualShooterName: "Klay" },
  );
  assert.equal(made.receivedBall, true);
  assert.equal(made.shotByPick, true);
  assert.equal(made.shotAsHinted, true);
  assert.equal(made.failureKind, "none");
  // A "three" call that ends in a two is a shot, but not as hinted.
  const two = explainClutchOutcome(
    { ...base, handedOff: true, attempted: true, zone: "two", made: true, points: 2, actualShooterId: "p1", teamPoints: 2, honored: true, reason: null },
    { shooterName: "Klay", actualShooterName: "Klay" },
  );
  assert.equal(two.shotByPick, true);
  assert.equal(two.shotAsHinted, false, "three call, two-point shot: not as hinted");
  // An "attack" call: any shot by the pick counts as executed.
  const attack = explainClutchOutcome(
    { ...base, actionHint: "attack", handedOff: true, attempted: true, zone: "three", made: false, points: 0, actualShooterId: "p1", teamPoints: 0, honored: true, reason: null },
    { shooterName: "Klay", actualShooterName: "Klay" },
  );
  assert.equal(attack.shotAsHinted, true, "attack call does not prescribe the zone");
  // Someone else shot: the explanation names them.
  const other = explainClutchOutcome(
    { ...base, handedOff: true, attempted: true, zone: "three", made: false, points: 0, actualShooterId: "p2", teamPoints: 0, honored: false, reason: null },
    { shooterName: "Klay", actualShooterName: "Curry" },
  );
  assert.equal(other.shotByPick, false);
  assert.equal(other.actualShooterName, "Curry");
  assert.throws(() => explainClutchOutcome(null), /needs a settled outcome/);
});

test("non-clutch games are untouched: issuing an id alone changes nothing, and a clutch run leaks no state", () => {
  // Issuing an id without submitting must not change play (M2b-1 pin, via the adapter's builder).
  const a = buildClutchSim(5).sim;
  const b = buildClutchSim(5).sim;
  a.runFast();
  b.issueAttemptId();
  b.runFast();
  assert.deepEqual(a.score, b.score);
  assert.equal(a.clutchLog.length, 0);
  assert.equal(b.clutchLog.length, 0);
  // A clutch run first, then a plain sim on the same seed: identical score.
  const c1 = buildClutchSim(6).sim;
  const ctrl = createClutchController({ sim: c1 });
  ctrl.openDecision();
  ctrl.select(otherThanClutch(6).id, "three");
  ctrl.submit();
  ctrl.resolve();
  const plainAfter = buildClutchSim(6).sim;
  plainAfter.runFast();
  const plainBefore = buildClutchSim(6).sim;
  plainBefore.runFast();
  assert.deepEqual(plainAfter.score, plainBefore.score, "no state leaks from a clutch run into a later game");
});

test("startClutchSim applies the scenario (not a fresh Q1 game) and honors an injected rng", () => {
  const scenario = initializeScenario({ pool: CLUTCH_POOL });
  const run = () => {
    const sim = startClutchSim(scenario, { rng: seededStream(9), onEvent() {}, onTick() {}, onEnd() {} });
    return JSON.stringify([sim.score, sim.quarter, sim.clock, sim.runFast().score]);
  };
  assert.equal(run(), run(), "same seed + same scenario => same game");
  const { sim } = buildClutchSim(9);
  assert.equal(sim.quarter, 4);
  assert.equal(sim.clock, 12);
});
