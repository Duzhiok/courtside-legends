// A-P2-16: fmtClock is defined exactly once, in js/core/format.js.
// Pins the migration contract: the three files that used to carry their own
// local copy (app.js, js/online/client.js, js/ui/coachingMomentView.js) now
// import the shared one, and the shared one floors fractional seconds —
// matching the old main live-game clock in app.js. The sim clock is
// fractional (possessions burn rand(8, 20) / pace seconds), so floor is the
// one display rounding; the old round (client.js) and ceil
// (coachingMomentView.js) copies could show 1s more when the fraction
// was >= 0.5.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fmtClock } from "../js/core/format.js";

test("fmtClock: floors fractional seconds (game-clock display)", () => {
  assert.equal(fmtClock(125.6), "2:05");
  assert.equal(fmtClock(125.4), "2:05");
  assert.equal(fmtClock(125), "2:05");
  assert.equal(fmtClock(61.9), "1:01");
  assert.equal(fmtClock(59.99), "0:59");
});

test("fmtClock: whole-second boundaries", () => {
  assert.equal(fmtClock(0), "0:00");
  assert.equal(fmtClock(60), "1:00");
  assert.equal(fmtClock(59), "0:59");
  assert.equal(fmtClock(720), "12:00");
  assert.equal(fmtClock(300), "5:00");
});

test("fmtClock: null / undefined / NaN / negative input shows 0:00", () => {
  assert.equal(fmtClock(null), "0:00");
  assert.equal(fmtClock(undefined), "0:00");
  assert.equal(fmtClock(NaN), "0:00");
  assert.equal(fmtClock(-5), "0:00");
  assert.equal(fmtClock(-0.5), "0:00");
});

test("fmtClock: numeric strings are accepted", () => {
  assert.equal(fmtClock("90"), "1:30");
});

const FORMER_COPIES = [
  "js/app.js",
  "js/online/client.js",
  "js/ui/coachingMomentView.js",
];

test("fmtClock: no local definition remains in the three former copies", () => {
  for (const file of FORMER_COPIES) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(
      !/^function fmtClock/m.test(src) && !/const fmtClock\s*=/.test(src),
      `${file} still defines fmtClock locally`,
    );
  }
});

test("fmtClock: the three call sites import the shared helper", () => {
  const imports = {
    "js/app.js": `from "./core/format.js"`,
    "js/online/client.js": `from "../core/format.js"`,
    "js/ui/coachingMomentView.js": `from "../core/format.js"`,
  };
  for (const [file, spec] of Object.entries(imports)) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(
      src.includes("fmtClock") && src.includes(spec),
      `${file} does not import fmtClock from ${spec}`,
    );
  }
});
