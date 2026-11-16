/**
 * js/core/seededRandom.js used to have its Fisher-Yates shuffle copy-pasted identically into
 * seven places (app.js x1, draft.js, seasonDraft.js, season.js, careerBracket.js, and skills.js
 * x2 under two other names -- shuffleInPlace/shuffleLocal). This covers the one shared version.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shuffle, seededStream, hashSeed, clamp99 } from "../js/core/seededRandom.js";

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

test("clamp99 rounds to an integer inside 0-99 (A-P2-15 shared myteam clamp)", () => {
  assert.equal(clamp99(50.4), 50);
  assert.equal(clamp99(50.5), 51);
  assert.equal(clamp99(0), 0);
  assert.equal(clamp99(99), 99);
  assert.equal(clamp99(-3), 0);
  assert.equal(clamp99(120), 99);
  assert.equal(clamp99(99.6), 99, "rounds to 100 first, then clamps to 99");
});

test("clamp99 matches the old myteam one-liner on a sweep (no behavior change)", () => {
  const old = (x) => Math.max(0, Math.min(99, Math.round(x)));
  for (let x = -50; x <= 150; x += 0.25) assert.equal(clamp99(x), old(x), `x=${x}`);
});
