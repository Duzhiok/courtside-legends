import test from "node:test";
import assert from "node:assert/strict";
import { memoize } from "../js/core/memo.js";

test("memoize: computes once per key, returns the same value", () => {
  let calls = 0;
  const upper = memoize((s) => { calls += 1; return s.toUpperCase(); }, (s) => s);
  assert.equal(upper("a"), "A");
  assert.equal(upper("a"), "A");
  assert.equal(upper("b"), "B");
  assert.equal(calls, 2);
});

test("memoize: different keys stay separate, null results are cached too", () => {
  let calls = 0;
  const find = memoize((n) => { calls += 1; return n === 7 ? "seven" : null; }, (n) => n);
  assert.equal(find(3), null);
  assert.equal(find(3), null);
  assert.equal(find(7), "seven");
  assert.equal(calls, 2);
});

test("memoize: array results are copies, so mutating one cannot corrupt the cache", () => {
  const ids = memoize((bref) => (bref === "x" ? ["a", "b"] : []), (bref) => bref);
  const first = ids("x");
  first.push("c");
  assert.deepEqual(ids("x"), ["a", "b"]);
  assert.notEqual(ids("x"), ids("x"));
});
