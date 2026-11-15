import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { GROWTH_CARRYOVER as TUNING_CARRYOVER } from "../js/core/tuning.js";
import { GROWTH_CARRYOVER as BALANCE_CARRYOVER } from "../js/career/balance.js";
import {
  FOCUS_ATTRIBUTES,
  carriedDeltas,
  developmentModifier,
} from "../js/engine/developmentRules.js";

const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Guard: A-P2-6 — js/engine/develop.js no longer imports the career/modes
// layers above it, and the rules it depends on live in the engine layer.
test("engine layer does not import career/modes except the documented exceptions (A-P2-6)", () => {
  assert.doesNotMatch(src("../js/engine/develop.js"), /from\s+["']\.\.\/(career|modes)\//);
  assert.doesNotMatch(src("../js/engine/developmentRules.js"), /from\s+["']\.\.\/(career|modes)\//);
  // Whole-layer scan: the only remaining upward imports are the two
  // A-P2-7 exceptions, both deliberate — seasonMarket -> careerGuards is
  // the B41 permission enforcement, tradeProposals -> balance/buzz is the
  // shared-tuning coupling A-P2-7 tracks. Any new one fails this test.
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
    'tradeProposals.js -> from "../career/balance.js"',
    'tradeProposals.js -> from "../career/buzz.js"',
  ]);
});

// Guard: the moves actually happened — no stale copies left behind.
test("development rules live in engine/developmentRules.js", () => {
  assert.doesNotMatch(src("../js/modes/playerDevelopment.js"), /export (const FOCUS_ATTRIBUTES|function developmentModifier|function validatePlan)/);
  assert.doesNotMatch(src("../js/career/playerGrowth.js"), /export function carriedDeltas/);
  assert.match(src("../js/modes/playerDevelopment.js"), /from\s+["']\.\.\/engine\/developmentRules\.js["']/);
  assert.match(src("../js/modes/playerDevelopment.js"), /export \{ FOCUS_ATTRIBUTES, developmentModifier \}/);
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
