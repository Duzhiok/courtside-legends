import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { BUZZ_EXTRA_PICK as TUNING_EXTRA_PICK, GROWTH_CARRYOVER as TUNING_CARRYOVER } from "../js/core/tuning.js";
import { BUZZ_EXTRA_PICK as BALANCE_EXTRA_PICK, GROWTH_CARRYOVER as BALANCE_CARRYOVER } from "../js/career/balance.js";
import {
  FOCUS_ATTRIBUTES,
  carriedDeltas,
  developmentModifier,
} from "../js/engine/developmentRules.js";
import { resolvedAge } from "../js/data/playerAge.js";

const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Guard: A-P2-6 — js/engine/develop.js no longer imports the career/modes
// layers above it, and the rules it depends on live in the engine layer.
test("engine layer does not import career/modes except the documented B41 exception (A-P2-6, A-P2-7)", () => {
  assert.doesNotMatch(src("../js/engine/develop.js"), /from\s+["']\.\.\/(career|modes)\//);
  assert.doesNotMatch(src("../js/engine/developmentRules.js"), /from\s+["']\.\.\/(career|modes)\//);
  // Whole-layer scan: the only remaining upward import is the one A-P2-7
  // exception, deliberate — seasonMarket -> careerGuards is the B41
  // permission enforcement. A-P2-7's other two edges (tradeProposals ->
  // balance/buzz) are gone: the buzz tuning cluster lives in core/tuning.js
  // and the buzz rules in data/buzz.js. Any new one fails this test.
  const upward = [];
  for (const file of readdirSync(new URL("../js/engine/", import.meta.url))) {
    if (!file.endsWith(".js")) continue;
    const text = src(`../js/engine/${file}`);
    for (const match of text.matchAll(/from\s+["']\.\.\/(career|modes)\/[^"']+["']/g)) {
      upward.push(`${file} -> ${match[0]}`);
    }
  }
  assert.deepEqual(upward.sort(), [
    'seasonMarket.js -> from "../career/careerGuards.js"',
  ]);
});

// Guard: the moves actually happened — no stale copies left behind.
test("development rules live in engine/developmentRules.js", () => {
  assert.doesNotMatch(src("../js/modes/playerDevelopment.js"), /export (const FOCUS_ATTRIBUTES|function developmentModifier|function validatePlan)/);
  assert.doesNotMatch(src("../js/career/playerGrowth.js"), /export function carriedDeltas/);
  assert.match(src("../js/modes/playerDevelopment.js"), /from\s+["']\.\.\/engine\/developmentRules\.js["']/);
  assert.match(src("../js/modes/playerDevelopment.js"), /export \{ FOCUS_ATTRIBUTES, developmentModifier, resolvedAge \}/);
  assert.match(src("../js/engine/develop.js"), /from\s+["']\.\/developmentRules\.js["']/);
  assert.match(src("../js/reborn/contract.js"), /from\s+["']\.\.\/engine\/developmentRules\.js["']/);
});

// Spot check: carriedDeltas behaves exactly as before the move (50% rounded half up).
test("carriedDeltas: same-year gains carry at 50%, stale entries carry nothing", () => {
  const YEAR = 2030;
  assert.deepEqual(
    carriedDeltas({ year: YEAR, deltas: { three: 1, mid: 2, scoring: 3, pass: 4 } }, YEAR),
    { three: 1, mid: 1, scoring: 2, pass: 2 },
  );
  assert.deepEqual(carriedDeltas({ year: YEAR - 1, deltas: { three: 4 } }, YEAR), {});
  assert.deepEqual(carriedDeltas(undefined, YEAR), {});
});

// Spot check: developmentModifier behaves exactly as before the move.
test("developmentModifier: deterministic, bounded, skips capped attributes", () => {
  const athlete = { bref: "alpha", three: 99, mid: 97, scoring: 98 };
  const plan = { focus: "shooting", role: "alpha", mentorBref: "mentor", load: "high", source: "manual" };
  const context = {
    roleStable: true,
    averageMinutes: 36,
    morale: 80,
    injured: false,
    mentor: { bref: "mentor", age: 30, iq: 90 },
    rosterBrefs: ["alpha", "mentor"],
  };
  const first = developmentModifier(athlete, plan, context);
  const second = developmentModifier(athlete, plan, context);
  assert.deepEqual(first, second);
  assert.equal(first.totalPoints, 3);
  assert.deepEqual(first.attributeDeltas, { mid: 2, scoring: 1 });
  assert.equal(first.injuryRiskDelta, 8);
  assert.equal(first.moraleDelta, 3);
  assert.deepEqual(FOCUS_ATTRIBUTES.shooting, ["three", "mid", "scoring"]);
});

// Guard: GROWTH_CARRYOVER has a single source (core/tuning.js, A-P2-7
// direction); career/balance.js only re-exports it.
test("GROWTH_CARRYOVER is defined once in core/tuning.js and re-exported by balance.js", () => {
  assert.equal(TUNING_CARRYOVER, 0.5);
  assert.equal(BALANCE_CARRYOVER, TUNING_CARRYOVER);
  assert.match(src("../js/core/tuning.js"), /export const GROWTH_CARRYOVER = 0\.5;/);
  assert.doesNotMatch(src("../js/career/balance.js"), /export const GROWTH_CARRYOVER/);
  assert.match(src("../js/career/balance.js"), /export \{ GROWTH_CARRYOVER \} from "\.\.\/core\/tuning\.js";/);
});

// Guard: the buzz tuning cluster has a single source (core/tuning.js, A-P2-7);
// career/balance.js only re-exports it.
test("buzz tuning constants are defined once in core/tuning.js and re-exported by balance.js", () => {
  assert.equal(TUNING_EXTRA_PICK, 4);
  assert.equal(BALANCE_EXTRA_PICK, TUNING_EXTRA_PICK);
  for (const name of [
    "HIGHLIGHT_SCORING", "HIGHLIGHT_BLOCKS", "HIGHLIGHT_THREES", "HIGHLIGHT_TRIPLE_DOUBLE",
    "BUZZ_GAME_CAP", "BUZZ_DECAY", "BUZZ_MAX", "BUZZ_HOT",
    "BUZZ_BONUS_PER_POINT", "BUZZ_MAX_BONUS", "BUZZ_EXTRA_PICK",
  ]) {
    assert.match(src("../js/core/tuning.js"), new RegExp(`export const ${name} =`));
    assert.doesNotMatch(src("../js/career/balance.js"), new RegExp(`export const ${name} =`));
  }
  assert.match(src("../js/career/balance.js"), /export \{[^}]*BUZZ_EXTRA_PICK[^}]*\};/);
  assert.match(src("../js/career/balance.js"), /export \{[^}]*HIGHLIGHT_SCORING[^}]*\};/);
});

// Guard: the buzz rules live in data/buzz.js (A-P2-7) — no stale copy in career/.
test("buzz rules live in data/buzz.js and the engine reads them from there", () => {
  assert.equal(existsSync(new URL("../js/career/buzz.js", import.meta.url)), false);
  assert.match(src("../js/data/buzz.js"), /export function settleBuzz/);
  assert.match(src("../js/data/buzz.js"), /from\s+["']\.\.\/core\/tuning\.js["']/);
  assert.match(src("../js/engine/tradeProposals.js"), /from\s+["']\.\.\/data\/buzz\.js["']/);
  assert.match(src("../js/engine/tradeProposals.js"), /from\s+["']\.\.\/core\/tuning\.js["']/);
  assert.doesNotMatch(src("../js/engine/tradeProposals.js"), /from\s+["']\.\.\/career\//);
  assert.match(src("../js/app.js"), /from\s+["']\.\/data\/buzz\.js["']/);
});

// Guard: A-P2-6 residue — the career layer used to import `resolvedAge` from
// modes/playerDevelopment.js (gameGoals, playerGrowth). The helper is a pure
// data rule now in js/data/playerAge.js, so career/ must not import modes/
// at all. (js/app.js is the top-level shell and legitimately imports modes;
// tests and QA scripts may still read the modes re-export.)
test("career layer does not import modes/ (A-P2-6 residue)", () => {
  const modesEdges = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
      const rel = `${dir}${entry.name}`;
      if (entry.isDirectory()) walk(`${rel}/`);
      else if (entry.name.endsWith(".js")) {
        for (const match of src(rel).matchAll(/from\s+["'](?:\.\.\/)+modes\/[^"']+["']/g)) {
          modesEdges.push(`${rel} -> ${match[0]}`);
        }
      }
    }
  };
  walk("../js/career/");
  assert.deepEqual(modesEdges, []);
});

// Guard: the move actually happened — no stale copy left behind.
test("resolvedAge lives in data/playerAge.js and modes/ only re-exports it", () => {
  assert.match(src("../js/career/gameGoals.js"), /from\s+["']\.\.\/data\/playerAge\.js["']/);
  assert.match(src("../js/career/playerGrowth.js"), /from\s+["']\.\.\/data\/playerAge\.js["']/);
  assert.match(src("../js/modes/playerDevelopment.js"), /from\s+["']\.\.\/data\/playerAge\.js["']/);
  assert.match(src("../js/modes/playerDevelopment.js"), /export \{[^}]*resolvedAge[^}]*\}/);
  assert.doesNotMatch(src("../js/modes/playerDevelopment.js"), /export function resolvedAge/);
  assert.doesNotMatch(src("../js/career/gameGoals.js"), /from\s+["']\.\.\/modes\//);
  assert.doesNotMatch(src("../js/career/playerGrowth.js"), /from\s+["']\.\.\/modes\//);
});

// Spot check: resolvedAge behaves exactly as before the move.
test("resolvedAge: card age wins, otherwise the career-span estimate", () => {
  assert.equal(resolvedAge({ age: 24 }), 24);
  assert.equal(resolvedAge({ age: "31" }), 31);
  // No age and no season: estimateAge falls back to 26.
  assert.equal(resolvedAge({}), 26);
  assert.equal(resolvedAge({ age: null }), 26);
  assert.equal(resolvedAge(null), 26);
});
