import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";
import { withRng } from "../js/core/rng.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";
import {
  DEFAULT_TIMEOUT_TIER,
  TIMEOUT_TIERS,
  normalizeTimeoutTier,
  timeoutTierLabel,
  timeoutTierParams,
} from "../js/engine/timeoutTiers.js";

/**
 * B27: auto-timeout strategy tiers. Same harness as managedAutopilot.test.js —
 * real 2020 roster cards, no mocked player shapes.
 */
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool2020 = rows.filter((r) => r.season === 2020).map(seasonToCard);

function buildTeam(name, offset) {
  const players = pool2020.slice(offset, offset + 12);
  assert.ok(players.length === 12, `need 12 distinct 2020 cards from offset ${offset}`);
  return {
    name,
    players,
    starterIds: players.slice(0, 5).map((p) => p.id),
  };
}

function freshSim(overrides = {}) {
  return new GameSim({
    home: buildTeam("Home", 0),
    away: buildTeam("Away", 12),
    youSide: "home",
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
    ...overrides,
  });
}

/**
 * A sim with autopilot on and every trigger input neutral, so a direct
 * maybeManagedCoach() call tests exactly one trigger at a time.
 * _manageCd is pinned high so the fatigue-sub block never runs and cannot
 * move players (and their fatigue) around before the timeout check.
 */
function armedSim(tier) {
  const sim = freshSim();
  sim.setAutoRotation(true);
  sim.setTimeoutTier(tier);
  sim._manageCd = 5;
  sim._manageLastTo = -999;
  sim.elapsedSec = 1000;
  sim.momentum = { side: null, points: 0, streak: 0 };
  sim.score = { home: 50, away: 50 };
  for (const p of sim.home.onCourt) {
    p.hot = 0;
    p.fatigue = 0;
  }
  sim.quarter = 1;
  sim.clock = 720;
  return sim;
}

/** Call maybeManagedCoach with rnd() forced to 0: any true trigger fires. */
function managedCall(sim) {
  withRng(() => 0, () => sim.maybeManagedCoach());
}

test("timeoutTierParams pins the balanced baseline (pre-B27 numbers, unchanged)", () => {
  assert.deepEqual(timeoutTierParams("balanced"), {
    tier: "balanced",
    momentum: 8,
    momentumProb: 0.72,
    deficit: 12,
    deficitProb: 0.48,
    coldProb: 0.42,
    fatigue: 72,
    fatigueProb: 0.3,
    lateEnabled: true,
    lateProb: 0.4,
    cooldownSec: 85,
  });
});

test("conservative: half probabilities, higher thresholds, no late trigger, 85s cooldown", () => {
  assert.deepEqual(timeoutTierParams("conservative"), {
    tier: "conservative",
    momentum: 10,
    momentumProb: 0.36,
    deficit: 14,
    deficitProb: 0.24,
    coldProb: 0.21,
    fatigue: 78,
    fatigueProb: 0.15,
    lateEnabled: false,
    lateProb: 0.2,
    cooldownSec: 85,
  });
});

test("aggressive: x1.5 probabilities capped at 0.9, lower thresholds, 60s cooldown", () => {
  assert.deepEqual(timeoutTierParams("aggressive"), {
    tier: "aggressive",
    momentum: 6,
    momentumProb: 0.9,
    deficit: 8,
    deficitProb: 0.72,
    coldProb: 0.63,
    fatigue: 65,
    fatigueProb: 0.45,
    lateEnabled: true,
    lateProb: 0.6,
    cooldownSec: 60,
  });
});

test("normalizeTimeoutTier falls back to balanced for unknown or missing tiers", () => {
  assert.deepEqual(TIMEOUT_TIERS, ["conservative", "balanced", "aggressive"]);
  assert.equal(DEFAULT_TIMEOUT_TIER, "balanced");
  for (const bad of ["turbo", "", null, undefined, 0, "BALANCED", " Balanced "]) {
    assert.equal(normalizeTimeoutTier(bad), "balanced");
  }
  for (const tier of TIMEOUT_TIERS) assert.equal(normalizeTimeoutTier(tier), tier);
  assert.equal(timeoutTierLabel("conservative", "zh"), "保守");
  assert.equal(timeoutTierLabel("balanced", "en"), "Balanced");
  assert.equal(timeoutTierLabel("aggressive", "en"), "Aggressive");
  assert.equal(timeoutTierLabel("nope", "en"), "Balanced");
});

test("fresh sim defaults to balanced; setTimeoutTier validates and returns the tier", () => {
  const sim = freshSim();
  assert.equal(sim.timeoutTier, "balanced");
  assert.equal(sim.setTimeoutTier("aggressive"), "aggressive");
  assert.equal(sim.timeoutTier, "aggressive");
  assert.equal(sim.setTimeoutTier("turbo"), "balanced");
  assert.equal(sim.setTimeoutTier(null), "balanced");
});

test("setTimeoutTier announces a real switch on the coach feed, silent when unchanged", () => {
  const events = [];
  const sim = freshSim({ onEvent: (e) => events.push(e) });
  sim.setTimeoutTier("aggressive");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "coach");
  assert.ok(events[0].text.includes("暂停策略") && events[0].text.includes("积极"));
  sim.setTimeoutTier("aggressive");
  assert.equal(events.length, 1, "same tier again stays silent (game start re-applies it)");
  sim.setTimeoutTier("bogus");
  assert.equal(events.length, 2);
  assert.ok(events[1].text.includes("均衡"));
});

test("exportState/fromSave round-trips the tier; legacy and junk saves fall back to balanced", () => {
  const sim = freshSim();
  sim.setTimeoutTier("aggressive");
  const saved = sim.exportState();
  assert.equal(saved.timeoutTier, "aggressive");
  assert.equal(GameSim.fromSave(saved).timeoutTier, "aggressive");
  const legacy = { ...saved };
  delete legacy.timeoutTier;
  assert.equal(GameSim.fromSave(legacy).timeoutTier, "balanced");
  assert.equal(GameSim.fromSave({ ...saved, timeoutTier: "turbo" }).timeoutTier, "balanced");
});

test("B3 floor holds in every tier: <= 4 timeouts left -> no call, even with a run and rnd()=0", () => {
  for (const tier of TIMEOUT_TIERS) {
    const sim = armedSim(tier);
    sim.momentum = { side: "away", points: 20, streak: 5 };
    sim.timeouts.home = 4;
    managedCall(sim);
    assert.equal(sim.timeouts.home, 4, `${tier}: reserve of 4 must hold`);
    sim.timeouts.home = 5;
    managedCall(sim);
    assert.equal(sim.timeouts.home, 4, `${tier}: one above the floor, the call goes through`);
  }
});

test("momentum threshold moves with the tier: 9 fires balanced not conservative, 7 fires aggressive not balanced", () => {
  const nineBalanced = armedSim("balanced");
  nineBalanced.momentum = { side: "away", points: 9, streak: 3 };
  managedCall(nineBalanced);
  assert.equal(nineBalanced.timeouts.home, 6);

  const nineConservative = armedSim("conservative");
  nineConservative.momentum = { side: "away", points: 9, streak: 3 };
  managedCall(nineConservative);
  assert.equal(nineConservative.timeouts.home, 7);

  const sevenAggressive = armedSim("aggressive");
  sevenAggressive.momentum = { side: "away", points: 7, streak: 3 };
  managedCall(sevenAggressive);
  assert.equal(sevenAggressive.timeouts.home, 6);

  const sevenBalanced = armedSim("balanced");
  sevenBalanced.momentum = { side: "away", points: 7, streak: 3 };
  managedCall(sevenBalanced);
  assert.equal(sevenBalanced.timeouts.home, 7);
});

test("deficit threshold moves with the tier: 9 fires aggressive not balanced, 13 fires balanced not conservative", () => {
  const nineAggressive = armedSim("aggressive");
  nineAggressive.score = { home: 50, away: 59 };
  nineAggressive.quarter = 2;
  managedCall(nineAggressive);
  assert.equal(nineAggressive.timeouts.home, 6);

  const nineBalanced = armedSim("balanced");
  nineBalanced.score = { home: 50, away: 59 };
  nineBalanced.quarter = 2;
  managedCall(nineBalanced);
  assert.equal(nineBalanced.timeouts.home, 7);

  const thirteenBalanced = armedSim("balanced");
  thirteenBalanced.score = { home: 50, away: 63 };
  thirteenBalanced.quarter = 2;
  managedCall(thirteenBalanced);
  assert.equal(thirteenBalanced.timeouts.home, 6);

  const thirteenConservative = armedSim("conservative");
  thirteenConservative.score = { home: 50, away: 63 };
  thirteenConservative.quarter = 2;
  managedCall(thirteenConservative);
  assert.equal(thirteenConservative.timeouts.home, 7);
});

test("fatigue threshold moves with the tier: 68 fires aggressive, not balanced", () => {
  const tired = (tier) => {
    const sim = armedSim(tier);
    for (const p of sim.home.onCourt) p.fatigue = 68;
    return sim;
  };
  const aggressive = tired("aggressive");
  managedCall(aggressive);
  assert.equal(aggressive.timeouts.home, 6);
  const balanced = tired("balanced");
  managedCall(balanced);
  assert.equal(balanced.timeouts.home, 7);
});

test("cold trigger still fires on the balanced baseline", () => {
  const sim = armedSim("balanced");
  for (const p of sim.home.onCourt) p.hot = -2;
  sim.score = { home: 50, away: 55 };
  managedCall(sim);
  assert.equal(sim.timeouts.home, 6);
});

test("late key-possession trigger fires balanced and aggressive, never conservative", () => {
  const late = (tier) => {
    const sim = armedSim(tier);
    sim.quarter = 4;
    sim.score = { home: 50, away: 60 };
    return sim;
  };
  for (const tier of ["balanced", "aggressive"]) {
    const sim = late(tier);
    managedCall(sim);
    assert.equal(sim.timeouts.home, 6, tier);
  }
  const conservative = late("conservative");
  managedCall(conservative);
  assert.equal(conservative.timeouts.home, 7);
});

test("cooldown is per tier: a 70s gap lets aggressive call, blocks conservative and balanced", () => {
  const gap = (tier) => {
    const sim = armedSim(tier);
    sim.momentum = { side: "away", points: 20, streak: 5 };
    sim.elapsedSec = 1000;
    sim._manageLastTo = 930;
    return sim;
  };
  const aggressive = gap("aggressive");
  managedCall(aggressive);
  assert.equal(aggressive.timeouts.home, 6);
  for (const tier of ["conservative", "balanced"]) {
    const sim = gap(tier);
    managedCall(sim);
    assert.equal(sim.timeouts.home, 7, tier);
  }
});

test("ordinary turnovers never trigger a timeout, even on the most sensitive tier", () => {
  const sim = freshSim({ rng: seededStream(hashSeed("b27-turnover|0")) });
  sim.setAutoRotation(true);
  sim.setTimeoutTier("aggressive");
  const tov = () =>
    sim.home.onCourt.concat(sim.home.bench).reduce((s, p) => s + (p.stats?.tov || 0), 0);
  let turnedOver = false;
  for (let i = 0; i < 200 && !sim.ended && !turnedOver; i++) {
    const before = tov();
    sim.step();
    if (tov() > before) turnedOver = true;
  }
  assert.ok(turnedOver, "seeded game should produce a turnover within 200 steps");
  // Clear every trigger input, so the ONLY recent event is the turnover.
  sim.paused = false;
  sim._manageCd = 5;
  sim._manageLastTo = -999;
  sim.elapsedSec = 1000;
  sim.momentum = { side: null, points: 0, streak: 0 };
  sim.score = { home: 50, away: 50 };
  for (const p of sim.home.onCourt) {
    p.hot = 0;
    p.fatigue = 0;
  }
  sim.quarter = 1;
  sim.clock = 720;
  const before = sim.timeouts.home;
  managedCall(sim);
  assert.equal(sim.timeouts.home, before);
});
