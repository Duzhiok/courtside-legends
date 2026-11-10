// Coach tactical learning — the three indicators are history/readouts, never
// engine bonuses. Pins the curves, the derivation, and the promise checks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createTacticalState,
  recordSystemRun,
  familiarityOf,
  buyInOf,
  buyInLabel,
  opponentReadinessOf,
  opponentReadinessLabel,
  executionRisk,
  tradeoffFor,
  tacticName,
  recordPromise,
  settlePromises,
  promiseCounts,
  challengeCareerEffect,
} from "../js/career/coach/tacticalLearning.js";
import { REPUTATION_GOAL_HIT, REPUTATION_GOAL_MISS } from "../js/career/balance.js";

const HERE = dirname(fileURLToPath(import.meta.url));

test("no Math.random anywhere — the learning module never rolls dice", () => {
  const src = readFileSync(join(HERE, "../js/career/coach/tacticalLearning.js"), "utf8");
  assert.ok(!src.includes("Math.random"), "tacticalLearning must not read Math.random");
});

test("familiarity: grows with games run, ~6 games to feel familiar, decays when stale", () => {
  let st = createTacticalState();
  assert.equal(familiarityOf(st, "switch_all"), 0);
  st = recordSystemRun(st, "switch_all", { opponentKey: "CLE:2016", possessions: 20 });
  assert.equal(familiarityOf(st, "switch_all"), 15); // 100*(1-0.85^1)
  for (let i = 0; i < 5; i += 1) st = recordSystemRun(st, "switch_all", { opponentKey: "CLE:2016" });
  assert.ok(familiarityOf(st, "switch_all") >= 60, `6 games should feel familiar, got ${familiarityOf(st, "switch_all")}`);
  // Run a different system for 3 games: switch_all goes stale by 4/game.
  const before = familiarityOf(st, "switch_all");
  for (let i = 0; i < 3; i += 1) st = recordSystemRun(st, "zone_drop", { opponentKey: "CLE:2016" });
  assert.equal(familiarityOf(st, "switch_all"), Math.max(0, before - 12));
  assert.ok(familiarityOf(st, "switch_all") <= 100 && familiarityOf(st, "switch_all") >= 0);
});

test("recordSystemRun never mutates its input", () => {
  const st = createTacticalState();
  const next = recordSystemRun(st, "switch_all", { opponentKey: "CLE:2016" });
  assert.equal(familiarityOf(st, "switch_all"), 0);
  assert.equal(familiarityOf(next, "switch_all"), 15);
});

test("buy-in is a readout from live morale + fit, moved by kept/broken promises", () => {
  assert.equal(buyInOf({ morale: 80, fit: 70 }), Math.round(0.55 * 80 + 0.45 * 70));
  assert.equal(buyInOf({ morale: 80, fit: 70, promisesKept: 2 }), Math.round(0.55 * 80 + 0.45 * 70) + 6);
  assert.equal(buyInOf({ morale: 80, fit: 70, promisesBroken: 1 }), Math.round(0.55 * 80 + 0.45 * 70) - 8);
  assert.equal(buyInOf({ morale: 0, fit: 0, promisesBroken: 5 }), 0); // clamped
  assert.equal(buyInLabel(80), "bought-in");
  assert.equal(buyInLabel(50), "wavering");
  assert.equal(buyInLabel(20), "tuned-out");
});

test("opponent readiness: 4 exposures = fully read, per opponent", () => {
  let st = createTacticalState();
  assert.equal(opponentReadinessOf(st, "switch_all", "CLE:2016"), 0);
  assert.equal(opponentReadinessLabel(0), "unseen");
  for (let i = 0; i < 2; i += 1) st = recordSystemRun(st, "switch_all", { opponentKey: "CLE:2016" });
  assert.equal(opponentReadinessOf(st, "switch_all", "CLE:2016"), 50);
  assert.equal(opponentReadinessLabel(50), "read");
  // A different opponent has never seen it.
  assert.equal(opponentReadinessOf(st, "switch_all", "BOS:2016"), 0);
  for (let i = 0; i < 2; i += 1) st = recordSystemRun(st, "switch_all", { opponentKey: "CLE:2016" });
  assert.equal(opponentReadinessOf(st, "switch_all", "CLE:2016"), 100);
  assert.equal(opponentReadinessLabel(100), "solved");
});

test("execution risk names its reasons; a familiar, fitting, bought-in system is solid", () => {
  assert.deepEqual(executionRisk({ familiarity: 80, fit: 80, buyIn: 80 }), {
    level: "solid",
    reasons: ["familiar system, good fit, players bought in"],
  });
  const shaky = executionRisk({ familiarity: 10, fit: 80, buyIn: 80 });
  assert.equal(shaky.level, "shaky");
  assert.ok(shaky.reasons.some((r) => r.includes("low familiarity")));
  const risky = executionRisk({ familiarity: 10, fit: 40, buyIn: 30 });
  assert.equal(risky.level, "risky");
  assert.equal(risky.reasons.length, 3);
});

test("trade-off table quotes the real engine effects, not the marketing copy", () => {
  const sw = tradeoffFor("switch_all");
  assert.ok(sw.effect.includes("×1.10"), "switch_all defense multiplier is the real one");
  assert.ok(sw.downside.includes("fit-gated"));
  const pack = tradeoffFor("pack_paint");
  assert.ok(pack.effect.includes("×1.25"), "pack_paint block multiplier is the real one");
  assert.ok(pack.downside.includes("+0.08"), "pack_paint kick-out cost is the real one");
  assert.equal(tradeoffFor("nope"), null);
  assert.equal(tacticName("switch_all", "en"), "Switch Everything");
  assert.equal(tacticName("switch_all", "zh"), "无限换防");
});

test("promises settle against measured evidence, never by assertion", () => {
  let st = createTacticalState();
  st = recordPromise(st, { id: "p1", text: "star gets touches", kind: "star-touches", targetId: "curry", threshold: 3 });
  st = recordPromise(st, { id: "p2", text: "hold them under 12", kind: "defense-holds", threshold: 12 });
  st = recordPromise(st, { id: "p3", text: "cut the deficit by 5", kind: "comeback", threshold: 5 });
  assert.deepEqual(promiseCounts(st), { kept: 0, broken: 0, open: 3 });
  const { state: st2, settled } = settlePromises(st, { starAttempts: 4, opponentPoints: 14, deficitChange: -6 });
  assert.deepEqual(promiseCounts(st2), { kept: 2, broken: 1, open: 0 });
  assert.deepEqual(settled.map((p) => [p.id, p.status]), [["p1", "kept"], ["p2", "broken"], ["p3", "kept"]]);
  // Settling again is a no-op (idempotent).
  const again = settlePromises(st2, { starAttempts: 0, opponentPoints: 99, deficitChange: 0 });
  assert.deepEqual(again.settled, []);
  assert.throws(() => recordPromise(st, { id: "x", text: "?", kind: "nope" }), /unknown promise kind/);
});

test("challenge career effect uses the reputation system's goal component only", () => {
  assert.equal(challengeCareerEffect({ won: true, goalAchieved: true }).reputationDelta, REPUTATION_GOAL_HIT);
  assert.equal(challengeCareerEffect({ won: false, goalAchieved: false }).reputationDelta, REPUTATION_GOAL_MISS);
  assert.equal(challengeCareerEffect({ won: true, goalAchieved: null }).reputationDelta, 0);
  // A win without the goal met still counts the win in the record, but the
  // reputation move comes from the goal, not the one-game win rate.
  assert.equal(challengeCareerEffect({ won: true, goalAchieved: false }).reputationDelta, REPUTATION_GOAL_MISS);
});
