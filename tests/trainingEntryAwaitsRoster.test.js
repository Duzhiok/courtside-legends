import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression pin (Muse independent verification of the Training Center landing,
// 2026-11-25 05:26 run): the Training Center entry reads the full PLAYERS pool
// (the card list in formHtml, and onboarding inside requireAccountReady), which
// is still [] for a while after a cold resume (roster is lazy, perf-r3). Without
// the await, a fresh account opening the Center would see an empty player list
// and no startable training. Same class as B132 (marketRefreshAwaitsRoster).
// This pins the source: openTraining must be async and await playersReady()
// BEFORE requireAccountReady / opening the screen.
const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("the Training Center entry waits for the full roster before opening", () => {
  const at = src.indexOf("async function openTraining() {");
  assert.ok(at >= 0, "openTraining not found");
  const fn = src.slice(at, src.indexOf("\n}\n", at));
  const ready = fn.indexOf("await playersReady()");
  const gate = fn.indexOf("requireAccountReady(");
  const open = fn.indexOf("trainingScreen?.open()");
  assert.ok(ready >= 0 && gate >= 0 && open >= 0, "all three calls present");
  assert.ok(ready < gate, "await playersReady() must come before requireAccountReady()");
  assert.ok(ready < open, "await playersReady() must come before opening the screen");
});
