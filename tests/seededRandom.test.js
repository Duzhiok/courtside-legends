/**
 * js/core/seededRandom.js used to have its Fisher-Yates shuffle copy-pasted identically into
 * seven places (app.js x1, draft.js, seasonDraft.js, season.js, careerBracket.js, and skills.js
 * x2 under two other names -- shuffleInPlace/shuffleLocal). This covers the one shared version.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shuffle, seededStream, hashSeed } from "../js/core/seededRandom.js";

test("shuffle returns a new array, never mutates the input", () => {
  const input = [1, 2, 3, 4, 5];
  const out = shuffle(input, seededStream(1));
  assert.deepEqual(input, [1, 2, 3, 4, 5], "input array must be untouched");
  assert.notEqual(out, input, "must be a different array reference");
});

test("shuffle preserves every element, just reorders them", () => {
  const input = Array.from({ length: 20 }, (_, i) => i);
  const out = shuffle(input, seededStream(42));
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
});

test("shuffle is deterministic for a given injected rng seed", () => {
  const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededStream(99));
  const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededStream(99));
  assert.deepEqual(a, b, "same seed must produce the same order every time");
});

test("shuffle with different seeds eventually produces different orders (not a no-op)", () => {
  const input = Array.from({ length: 12 }, (_, i) => i);
  const orders = new Set();
  for (let seed = 0; seed < 15; seed++) {
    orders.add(shuffle(input, seededStream(hashSeed(`seed-${seed}`))).join(","));
  }
  assert.ok(orders.size > 1, "15 different seeds should not all produce the identical order");
});

test("shuffle defaults to Math.random when no rng is passed (existing call sites rely on this)", () => {
  const input = [1, 2, 3, 4, 5];
  const out = shuffle(input);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
});

test("shuffle on an empty or single-element array is a safe no-op", () => {
  assert.deepEqual(shuffle([], seededStream(1)), []);
  assert.deepEqual(shuffle([7], seededStream(1)), [7]);
});
