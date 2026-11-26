/**
 * Coach pace three-tier (docs/implementation/pace-strategy-design.md §7):
 * push = more possessions, more threes, more hunting (costs quality, transition
 * defense, legs); grind = better looks, fewer turnovers, harder on the glass
 * (costs possessions); normal = the zero baseline. The numbers are starting
 * points to calibrate (B26-style), so these tests pin the MECHANISMS, not the
 * exact calibration values — except where the design fixes one (cap ×3.5).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim, chooseShot, offenseHuntLevel, notePushMiss, takePushMissBonus, paceChaseHint } from "../js/engine/sim.js";
import { shotOpenThreshold, shotGateLevel } from "../js/engine/gameplan.js";
import { TACTICS } from "../js/data/coaches.js";
import { seededStream } from "../js/core/seededRandom.js";
import { withRng } from "../js/core/rng.js";

// ---- chooseShot: tempo reshapes the shot mix (paired seeds, no raw volume so the
// B35 end-anchor does not damp the effect) ----
const shooter = { three: 80, threeTend: 60, mid: 70, midTend: 45, paint: 70, paintTend: 50, shotTend: 55, offenseStyle: "balanced", confidence: 50 };
const brick = { three: 30, threeTend: 12, mid: 60, midTend: 45, paint: 75, paintTend: 55, shotTend: 55, offenseStyle: "balanced", confidence: 50 };
const off = { coach: { playerAutonomy: 40 }, temp: {}, tactic: {} };
const threeShare = (player, sideCtx, focusPlay, n = 2000) => {
  let threes = 0;
  withRng(seededStream(20261126), () => {
    for (let i = 0; i < n; i += 1) {
      if (chooseShot(player, off, focusPlay, sideCtx).zone === "three") threes += 1;
    }
  });
  return threes / n;
};

test("chooseShot: push lifts a shooter's three share, grind lowers it (measured +0.019 / -0.014 at n=3000)", () => {
  const normal = threeShare(shooter, {}, null);
  assert.ok(threeShare(shooter, { tempoId: "push" }, null) > normal + 0.01, "push adds fast-break threes");
  assert.ok(threeShare(shooter, { tempoId: "grind" }, null) < normal - 0.005, "grind tilts to mid/paint");
});

test("chooseShot: push does not make a bricklayer chuck (three < 55 gate)", () => {
  assert.equal(threeShare(brick, { tempoId: "push" }, null), threeShare(brick, {}, null));
});

test("chooseShot: the three-way stack is capped at x3.5 but never below pace_three + needThree on their own", () => {
  const chase = threeShare(shooter, { lateChaseNeedThree: true }, { id: "pace_three" });
  // Pushing in the chase adds nothing (the stack is already 4.8) but must not hurt.
  assert.equal(threeShare(shooter, { tempoId: "push", lateChaseNeedThree: true }, { id: "pace_three" }), chase);
  // With needThree alone the cap binds at 3.5, so push still helps there.
  assert.ok(threeShare(shooter, { tempoId: "push", lateChaseNeedThree: true }, null) > threeShare(shooter, { lateChaseNeedThree: true }, null) + 0.01);
});

// ---- offenseHuntLevel: tempo moves the hunt (P2/G2) ----
test("offenseHuntLevel: push +0.15, grind -0.10, and a patient order still holds under push", () => {
  const coach = { buffs: { offense: 8 } };
  const base = 8 / 18;
  assert.ok(Math.abs(offenseHuntLevel(coach, null, { gameplan: { tempo: "normal" } }) - base) < 1e-9);
  assert.ok(Math.abs(offenseHuntLevel(coach, null, { gameplan: { tempo: "push" } }) - (base + 0.15)) < 1e-9);
  assert.ok(Math.abs(offenseHuntLevel(coach, null, { gameplan: { tempo: "grind" } }) - (base - 0.1)) < 1e-9);
  const patientPush = offenseHuntLevel(coach, { orders: { hunt: "patient" } }, { gameplan: { tempo: "push" } });
  assert.ok(patientPush < 0.3 && patientPush < base + 0.15, `patient still holds: ${patientPush}`);
});

// ---- shotOpenThreshold: tempo moves the gate (P3/C2) ----
test("shotOpenThreshold: push loosens the gate for hunters only, grind tightens it for everyone", () => {
  const hunter = { raw: { mpg: 30, fga: 13, gp: 70 }, orders: { aggression: "low" } };
  assert.equal(shotGateLevel(hunter), 0.55);
  assert.equal(shotOpenThreshold(hunter), 0.44);
  assert.ok(Math.abs(shotOpenThreshold(hunter, "push") - 0.38) < 1e-9);
  assert.ok(Math.abs(shotOpenThreshold(hunter, "grind") - 0.48) < 1e-9);
  const nonShooter = { raw: { mpg: 30, fga: 2, gp: 70 }, orders: { aggression: "low" } };
  assert.equal(shotGateLevel(nonShooter), 0.22);
  assert.equal(shotOpenThreshold(nonShooter), 0.7);
  assert.equal(shotOpenThreshold(nonShooter, "push"), 0.7, "blue collars do not start chucking on push");
  assert.ok(Math.abs(shotOpenThreshold(nonShooter, "grind") - 0.74) < 1e-9);
});

// ---- T4: the transition-defense flag (set + one-use read) ----
test("T4: notePushMiss sets the flag only for a push-tempo possession by the player's team", () => {
  const you = { gameplan: { tempo: "push" }, temp: {} };
  notePushMiss(you, you);
  assert.equal(you.temp.lastPushMiss, true);
  const normal = { gameplan: { tempo: "normal" }, temp: {} };
  notePushMiss(normal, normal);
  assert.equal(normal.temp.lastPushMiss, undefined);
  const cpu = { gameplan: { tempo: "push" }, temp: {} };
  notePushMiss(cpu, you);
  assert.equal(cpu.temp.lastPushMiss, undefined, "CPU has no tempo to push with");
});

test("T4: takePushMissBonus pays +0.02 once, then clears", () => {
  const def = { temp: { lastPushMiss: true } };
  assert.equal(takePushMissBonus(def), 0.02);
  assert.equal(def.temp.lastPushMiss, false);
  assert.equal(takePushMissBonus(def), 0);
  assert.equal(takePushMissBonus({}), 0);
  assert.equal(takePushMissBonus({ temp: {} }), 0);
});

// ---- paceChaseHint: the pure-UI suggestion read ----
const fakeSim = ({ tempo = "normal", speed = 70, fatigue = 0, quarter = 4, clock = 120, homeScore = 90, awayScore = 95 } = {}) => {
  const team = { side: "home", gameplan: { tempo }, onCourt: Array.from({ length: 5 }, () => ({ speed, fatigue })) };
  const opp = { side: "away", onCourt: [] };
  return { you: () => team, home: team, away: opp, quarter, clock, score: { home: homeScore, away: awayScore } };
};

test("paceChaseHint: appears in the chase zone with live numbers, and only there", () => {
  const hint = paceChaseHint(fakeSim());
  assert.ok(hint, "chasing, normal tempo, fit to run");
  assert.equal(hint.deficit, 5);
  assert.equal(hint.clock, 120);
  assert.equal(hint.extra, 3, "120s: ~12 push possessions vs ~9 normal ones");
  assert.ok(hint.makeCost > 0 && hint.makeCost < 5, `make cost ${hint.makeCost}`);
  assert.ok(hint.tovCost > 0 && hint.tovCost < 40, `tov cost ${hint.tovCost}`);
  assert.equal(paceChaseHint(fakeSim({ tempo: "push" })), null, "already pushing");
  assert.equal(paceChaseHint(fakeSim({ speed: 35 })), null, "too tired/slow to run (fit < 0.4)");
  assert.equal(paceChaseHint(fakeSim({ homeScore: 95, awayScore: 90 })), null, "leading, not chasing");
  assert.equal(paceChaseHint(fakeSim({ clock: 400 })), null, "not in the chase window yet");
  const b4 = paceChaseHint(fakeSim({ quarter: 3, clock: 300, homeScore: 80, awayScore: 92 }));
  assert.ok(b4, "B4 zone (Q3, down 12) also suggests pushing");
  assert.equal(b4.extra, 9, "300s: ~30 push possessions vs ~21 normal ones");
});

// ---- managed auto-push (§8 decision 1 = B, user 2026-11-26) ----
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool = rows.filter((r) => r.season === 2020).map(seasonToCard);
const simTeam = (name, offset) => {
  const players = pool.slice(offset, offset + 12);
  return { name, players, starterIds: players.slice(0, 5).map((p) => p.id) };
};
const managedSim = () => {
  const s = new GameSim({ rng: seededStream(20261114), home: simTeam("Home", 0), away: simTeam("Away", 12), youSide: "home", onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  s.you().coach = { ...(s.you().coach || {}), name: "Coach", specialTactics: Object.keys(TACTICS) };
  s.setAutoOffense(true);
  return s;
};
const plan = (s) => withRng(s.rng, () => s.managedOffensePlan({ light: false }));

test("managedOffensePlan: clutchChase sets tempo to push (and stays push); leading still grinds", () => {
  const chase = managedSim();
  chase.score[chase.opp().side] = 65;
  chase.score[chase.you().side] = 60;
  chase.quarter = 4;
  chase.clock = 120;
  plan(chase);
  assert.equal(chase.you().gameplan.tempo, "push");

  const already = managedSim();
  already.setTempo("push");
  already.score[already.opp().side] = 65;
  already.score[already.you().side] = 60;
  already.quarter = 4;
  already.clock = 120;
  plan(already);
  assert.equal(already.you().gameplan.tempo, "push", "already pushing: untouched");

  const grind = managedSim();
  grind.setTempo("grind");
  grind.score[grind.opp().side] = 65;
  grind.score[grind.you().side] = 60;
  grind.quarter = 4;
  grind.clock = 120;
  plan(grind);
  assert.equal(grind.you().gameplan.tempo, "push", "grind gives way to the chase");

  const lead = managedSim();
  lead.score[lead.opp().side] = 60;
  lead.score[lead.you().side] = 69;
  lead.quarter = 4;
  lead.clock = 120;
  plan(lead);
  assert.equal(lead.you().gameplan.tempo, "grind", "leading by 9 still auto-grinds (regression)");
});
