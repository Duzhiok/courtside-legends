import test from "node:test";
import assert from "node:assert/strict";
import { orderTacticsDefaultFirst } from "../js/data/coaches.js";

// User requirement (2026-11-01): the default tactic set on the rotation screen
// must lead every game's tip-off order, even after auto-manage changed tactics
// mid-game. The setup screen collects checked tactics in DOM (TACTICS enum)
// order, so the confirm step must re-order default-first; the helper below is
// the unit-testable core of that fix.

test("default in the middle moves to front, rest keep order", () => {
  assert.deepEqual(
    orderTacticsDefaultFirst(["balanced", "motion", "triangle"], "triangle"),
    ["triangle", "balanced", "motion"]
  );
});

test("default already first stays as-is", () => {
  assert.deepEqual(
    orderTacticsDefaultFirst(["pace_space", "balanced"], "pace_space"),
    ["pace_space", "balanced"]
  );
});

test("default unchecked leaves the checked order alone", () => {
  assert.deepEqual(
    orderTacticsDefaultFirst(["balanced", "motion"], "triangle"),
    ["balanced", "motion"]
  );
});

test("no default or empty checked list is a no-op", () => {
  assert.deepEqual(orderTacticsDefaultFirst(["balanced", "motion"], null), ["balanced", "motion"]);
  assert.deepEqual(orderTacticsDefaultFirst([], "triangle"), []);
});

test("input list is not mutated", () => {
  const checked = ["balanced", "motion", "triangle"];
  orderTacticsDefaultFirst(checked, "motion");
  assert.deepEqual(checked, ["balanced", "motion", "triangle"]);
});
