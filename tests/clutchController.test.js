// M2b-2 ClutchController: state machine, attemptId generations, cancel/retry.
// The engine contract (issueAttemptId / submitDecision / clutchLog) is M2b-1's;
// this file pins the controller that sits on top of it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClutchController } from "../js/engine/clutchController.js";
import { buildClutchSim, otherThanClutch } from "./helpers/clutchSim.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function armedController(seed = 1, shooterId = null) {
  const { sim } = buildClutchSim(seed);
  const ctrl = createClutchController({ sim });
  const pick = shooterId || otherThanClutch(seed).id;
  assert.deepEqual(ctrl.openDecision(), { ok: true, attemptId: "clutch-1" });
  assert.ok(ctrl.select(pick, "three").ok);
  return { sim, ctrl, pick };
}

test("controller: no Math.random anywhere (state machine never rolls dice)", () => {
  const src = readFileSync(join(HERE, "../js/engine/clutchController.js"), "utf8");
  assert.ok(!src.includes("Math.random"), "clutchController must not read Math.random");
});

test("happy path: READY -> AWAITING_DECISION -> RESOLVING -> CONTINUING -> COMPLETED, with a structured outcome", () => {
  const { sim, ctrl, pick } = armedController(1);
  assert.equal(ctrl.state, "AWAITING_DECISION");
  assert.deepEqual(ctrl.submit(), { ok: true, attemptId: "clutch-1" });
  assert.equal(ctrl.state, "RESOLVING");
  const res = ctrl.resolve();
  assert.equal(res.ok, true);
  assert.equal(ctrl.state, "COMPLETED");
  const o = ctrl.outcome;
  for (const k of ["attemptId", "shooterId", "actionHint", "handedOff", "attempted", "zone", "made", "points", "honored", "reason", "actualShooterId", "teamPoints", "role", "delivery"]) {
    assert.ok(k in o, `outcome has ${k}`);
  }
  assert.equal(o.attemptId, "clutch-1");
  assert.equal(o.shooterId, pick);
  assert.equal(o.actionHint, "three");
  assert.equal(sim.clutchLog.length, 1, "exactly one outcome logged");
  // The rest of the game was played out: a final score exists and the game ended.
  assert.ok(ctrl.finalSnapshot, "resolve() plays the rest of the game out");
  assert.ok(Number.isInteger(ctrl.finalSnapshot.score.home) && Number.isInteger(ctrl.finalSnapshot.score.away));
  assert.equal(sim.running, false, "the sim is finished after resolve()");
  // The explanation answers the five result-page questions.
  const ex = ctrl.explain();
  assert.equal(typeof ex.receivedBall, "boolean");
  assert.equal(typeof ex.attempted, "boolean");
  assert.equal(typeof ex.shotByPick, "boolean");
  assert.equal(typeof ex.shotAsHinted, "boolean");
  assert.ok(["none", "turnover", "foul", "defense", "not_handed_off", "not_on_court", "no_possession"].includes(ex.failureKind));
  if (o.attempted) assert.equal(ex.reason, null);
  else assert.ok(ex.reason, "a non-shot names its reason");
});

test("meta.clutchOutcome event matches clutchLog (the result page's render source)", async () => {
  const { initializeScenario, startClutchSim } = await import("../js/engine/clutchController.js");
  const { CLUTCH_POOL } = await import("./helpers/clutchSim.js");
  const { seededStream } = await import("../js/core/seededRandom.js");
  const events = [];
  const scenario = initializeScenario({ pool: CLUTCH_POOL });
  const sim = startClutchSim(scenario, {
    rng: seededStream(3),
    onEvent: (e) => events.push(e),
    onTick() {},
    onEnd() {},
  });
  const ctrl = createClutchController({ sim });
  const pick = otherThanClutch(3).id;
  ctrl.openDecision();
  ctrl.select(pick, "three");
  ctrl.submit();
  ctrl.resolve();
  const metas = events.filter((e) => e.meta?.clutchOutcome).map((e) => e.meta.clutchOutcome);
  assert.equal(metas.length, 1, "exactly one terminal outcome event");
  assert.deepEqual(metas[0], ctrl.outcome, "event meta and clutchLog carry the same outcome");
});

test("replaceDecision: voids the old attemptId, issues a new one, and only once", () => {
  const { sim, ctrl, pick } = armedController(4);
  const oldId = ctrl.attemptId;
  const other = sim.home.onCourt.find((p) => p.id !== pick);
  const res = ctrl.replaceDecision(other.id, "attack");
  assert.equal(res.ok, true);
  assert.notEqual(res.attemptId, oldId);
  assert.deepEqual(ctrl.selection, { shooterId: other.id, actionHint: "attack" });
  // The old id is dead: the engine reports it stale.
  assert.equal(
    sim.submitDecision({ attemptId: oldId, kind: "clutch_shooter", shooterId: pick, actionHint: "three" }).reason,
    "stale_attempt",
  );
  // A second change is refused.
  assert.deepEqual(ctrl.replaceDecision(pick, "three").reason, "already_replaced");
  assert.deepEqual(ctrl.selection, { shooterId: other.id, actionHint: "attack" }, "the first replacement stands");
  // The new id submits fine.
  assert.deepEqual(ctrl.submit(), { ok: true, attemptId: res.attemptId });
  assert.equal(ctrl.resolve().ok, true);
  assert.equal(ctrl.outcome.shooterId, other.id);
});

test("replaceDecision: refused after submit (locked) and without a selection", () => {
  const { ctrl } = armedController(5);
  assert.equal(ctrl.replaceDecision(ctrl.selection.shooterId, "attack").ok, true); // one change used
  ctrl.submit();
  assert.equal(ctrl.replaceDecision(ctrl.selection.shooterId, "three").reason, "wrong_state");
  const { sim } = buildClutchSim(6);
  const fresh = createClutchController({ sim });
  fresh.openDecision();
  assert.equal(fresh.replaceDecision(sim.home.onCourt[0].id, "three").reason, "no_selection");
});

test("select: rejects a bad hint, a bench player, and calls in the wrong state", () => {
  const { sim, ctrl } = armedController(7);
  assert.equal(ctrl.select(sim.home.onCourt[0].id, "dunk").reason, "invalid");
  const bench = sim.home.roster.find((p) => !sim.home.onCourt.includes(p));
  assert.equal(ctrl.select(bench.id, "three").reason, "not_on_court");
  const { sim: sim2 } = buildClutchSim(8);
  const early = createClutchController({ sim: sim2 });
  assert.equal(early.select(sim2.home.onCourt[0].id, "three").reason, "wrong_state");
  assert.equal(early.submit().reason, "wrong_state");
  assert.equal(early.resolve().reason, "wrong_state");
});

test("cancel: supersedes the open id so a late submit can never land", () => {
  const { sim, ctrl } = armedController(9);
  const id = ctrl.attemptId;
  assert.deepEqual(ctrl.cancel(), { ok: true });
  assert.equal(ctrl.state, "CANCELLED");
  assert.equal(
    sim.submitDecision({ attemptId: id, kind: "clutch_shooter", shooterId: sim.home.onCourt[0].id, actionHint: "three" }).reason,
    "stale_attempt",
  );
  assert.equal(ctrl.submit().reason, "wrong_state", "a cancelled controller never submits");
  assert.equal(ctrl.cancel().reason, "wrong_state", "cancel is terminal");
});

test("reset (retry): attaches a FRESH sim, reopens, and leaves the old sim untouched", () => {
  const { sim, ctrl } = armedController(10);
  ctrl.submit();
  ctrl.resolve();
  assert.equal(ctrl.state, "COMPLETED");
  const oldLog = sim.clutchLog.length;
  const { sim: fresh } = buildClutchSim(11);
  assert.deepEqual(ctrl.reset(fresh), { ok: true });
  assert.equal(ctrl.state, "READY");
  assert.equal(ctrl.outcome, null);
  assert.equal(ctrl.attemptId, null);
  assert.equal(sim.clutchLog.length, oldLog, "the finished sim was never reused or touched");
  assert.deepEqual(ctrl.openDecision(), { ok: true, attemptId: "clutch-1" }, "a fresh sim restarts the id sequence");
  const pick = otherThanClutch(11).id;
  assert.ok(ctrl.select(pick, "attack").ok);
  assert.ok(ctrl.submit().ok);
  assert.ok(ctrl.resolve().ok);
  assert.equal(ctrl.outcome.attemptId, "clutch-1");
});

test("a second submit while armed is rejected by the engine (already_armed) and changes nothing", () => {
  const { sim, ctrl, pick } = armedController(12);
  ctrl.submit();
  const dup = sim.submitDecision({ attemptId: sim.issueAttemptId(), kind: "clutch_shooter", shooterId: pick, actionHint: "attack" });
  assert.deepEqual(dup, { accepted: false, reason: "already_armed" });
  assert.equal(ctrl.resolve().ok, true);
  assert.equal(sim.clutchLog.length, 1, "exactly one terminal outcome");
});
