/**
 * Career 2.0 decision 1, last source: the coaching challenge's in-game promises go through the unified promise
 * engine (one lifecycle, deterministic settle mark, idempotent), keeping their own (zero career) effects.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { listCanonicalPromises, settleCoachingPromises } from "../js/career/promiseEngine.js";
import { recordPromise, settlePromises } from "../js/career/coach/tacticalLearning.js";

const open = () => recordPromise(recordPromise({}, { id: "p1", text: "star gets touches", kind: "star-touches", threshold: 3, madeAt: 10 }),
  { id: "p2", text: "hold them under 12", kind: "defense-holds", threshold: 12, madeAt: 12 });

test("settled by the engine with a deterministic mark: the same game settles the same way, once", () => {
  const evidence = { starAttempts: 4, opponentPoints: 14 };
  const a = settleCoachingPromises(open(), evidence, { at: 16 });
  const b = settleCoachingPromises(open(), evidence, { at: 16 });
  assert.deepEqual(a, b, "no wall clock in the result");
  assert.deepEqual(a.settled.map((p) => [p.id, p.status, p.settledAt]), [["p1", "kept", 16], ["p2", "broken", 16]]);
  assert.deepEqual(a.unified.map((u) => [u.promiseId, u.source, u.status, u.effects.trust]), [["p1", "coaching", "fulfilled", 0], ["p2", "coaching", "broken", 0]]);
  assert.deepEqual(settleCoachingPromises(a.state, { starAttempts: 0, opponentPoints: 99 }, { at: 30 }).settled, [], "never re-evaluated");
  assert.deepEqual(settlePromises(open(), evidence, { at: 16 }).settled, a.settled, "the old entry is the same path");
});

test("one promise recorded twice is one promise; the engine lists coaching promises with the others", () => {
  const twice = recordPromise(open(), { id: "p1", text: "again", kind: "star-touches", threshold: 9 });
  assert.equal(twice.promises.length, 2);
  const { promises } = listCanonicalPromises({ coaching: open() });
  assert.deepEqual(promises.map((p) => [p.promiseId, p.source, p.status, p.createdAt]), [["p1", "coaching", "pending", 10], ["p2", "coaching", "pending", 12]]);
});
