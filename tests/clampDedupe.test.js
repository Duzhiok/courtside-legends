import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { clamp } from "../js/core/seededRandom.js";
import { clampPct } from "../js/ui/timeTravel/format.js";

test("shared clamp bounds a value to [lo, hi]", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp(2.5, 2, 3), 2.5);
});

test("clampPct keeps the old format.js semantics: 0-100 defaults, Number coercion", () => {
  assert.equal(clampPct(42), 42);
  assert.equal(clampPct(150), 100);
  assert.equal(clampPct(-5), 0);
  assert.equal(clampPct("80"), 80);
  assert.equal(clampPct(undefined), 0);
  assert.equal(clampPct(3, 0, 5), 3);
});

// Guard: one 3-arg clamp for the whole client (A-P2-15). New code must import
// js/core/seededRandom.js instead of pasting its own copy (21 copies removed).
// The myteam single-arg 0-99 rounding helpers (coachDrivenAnalysis /
// counterStrategy / opponentScouting) used to be carved out here; since
// 2026-11-15 they share js/core/seededRandom.js's clamp99 instead (same
// A-P2-15 item), so a local copy of that one-liner is now flagged too.
// Deliberately not flagged: the distinctively named clampCoachProfile /
// clampStanding / clampPoint / clampTrust / clamp100, and inline 0-99
// expressions with different bounds or extra arithmetic (skills.js,
// duelAvatar.js clampRating, develop.js, playerRoleFit.js roleScore).
const LOCAL_CLAMP =
  /^[ \t]*(?:export\s+)?(?:function\s+clamp\s*\([^)]*,[^)]*,[^)]*\)|const\s+clamp\s*=\s*\([^)]*,[^)]*,[^)]*\))/m;
const ALLOWED = new Set(["js/core/seededRandom.js"]);
const CLAMP_IMPORT = /import\s*\{[^}]*\bclamp\b[^}]*\}\s*from\s*"([^"]+)"/g;

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "vendor") jsFiles(path, out);
    } else if (name.endsWith(".js")) out.push(path);
  }
  return out;
}

test("no client module defines its own 3-arg clamp (import js/core/seededRandom.js)", () => {
  const root = new URL("..", import.meta.url).pathname;
  const offenders = jsFiles(join(root, "js"))
    .map((file) => relative(root, file))
    .filter((file) => !ALLOWED.has(file))
    .filter((file) => LOCAL_CLAMP.test(readFileSync(join(root, file), "utf8")));
  assert.deepEqual(offenders, []);
});

test("every clamp import comes from js/core/seededRandom.js", () => {
  const root = new URL("..", import.meta.url).pathname;
  const bad = [];
  for (const file of jsFiles(join(root, "js"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(CLAMP_IMPORT)) {
      if (!m[1].endsWith("core/seededRandom.js")) bad.push(`${relative(root, file)} <- ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

// The myteam 0-99 rounding one-liner now lives in js/core/seededRandom.js as
// clamp99 (A-P2-15); a local copy of it is the same duplication, so flag it.
const LOCAL_CLAMP99 =
  /(?:^|[^\w$])const\s+clamp(?:99)?\s*=\s*\(x\)\s*=>\s*Math\.max\(0,\s*Math\.min\(99,\s*Math\.round\(x\)\)\)/m;

test("no client module defines its own 0-99 rounding clamp (import clamp99)", () => {
  const root = new URL("..", import.meta.url).pathname;
  const offenders = jsFiles(join(root, "js"))
    .map((file) => relative(root, file))
    .filter((file) => !ALLOWED.has(file))
    .filter((file) => LOCAL_CLAMP99.test(readFileSync(join(root, file), "utf8")));
  assert.deepEqual(offenders, []);
});
