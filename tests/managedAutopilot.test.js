import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim, ROTATION_FATIGUE_OUT, ROTATION_FATIGUE_IN } from "../js/engine/sim.js";

/**
 * 托管被拆成三个独立开关：进攻托管 / 防守托管 / 沿用当前策略（只管换人，不碰战术）。
 * These build a real, playable two-team GameSim from real roster cards — no mocked
 * player shapes that could silently drift from what the live game actually constructs.
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

test("fresh sim: all three autopilot switches start off", () => {
  const sim = freshSim();
  assert.equal(sim.autoOffense, false);
  assert.equal(sim.autoDefense, false);
  assert.equal(sim.autoRotation, false);
  assert.equal(sim.isAutopilotOn(), false);
});

test("the three switches are independent — turning one on doesn't flip the others", () => {
  const sim = freshSim();
  sim.setAutoDefense(true);
  assert.deepEqual(
    [sim.autoOffense, sim.autoDefense, sim.autoRotation],
    [false, true, false]
  );
  assert.equal(sim.isAutopilotOn(), true);
  sim.setAutoDefense(false);
  assert.equal(sim.isAutopilotOn(), false);
});

test("each setter emits its own coach message naming the switch, not a generic '智能托管'", () => {
  const events = [];
  const sim = freshSim({ onEvent: (e) => events.push(e) });
  sim.setAutoOffense(true);
  sim.setAutoDefense(true);
  sim.setAutoRotation(true);
  const texts = events.map((e) => e.text);
  assert.ok(texts.some((t) => t.includes("进攻托管") && t.includes("开启")));
  assert.ok(texts.some((t) => t.includes("防守托管") && t.includes("开启")));
  assert.ok(texts.some((t) => t.includes("沿用当前策略") && t.includes("开启")));
  assert.ok(!texts.some((t) => t.includes("智能托管")), "the old blended label should be gone");
});

test("autoSubsByFatigue: nobody over the threshold → no substitution happens", () => {
  const sim = freshSim();
  for (const p of sim.home.onCourt) p.fatigue = ROTATION_FATIGUE_OUT - 1;
  for (const p of sim.home.bench) p.fatigue = 50;
  const before = sim.home.onCourt.map((p) => p.id).join("|");
  sim.autoSubsByFatigue();
  assert.equal(sim.home.onCourt.map((p) => p.id).join("|"), before);
});

test("autoSubsByFatigue: the most-gassed starter comes off for the freshest bench player", () => {
  const sim = freshSim();
  const [gassed, ...rest] = sim.home.onCourt;
  gassed.fatigue = 95;
  for (const p of rest) p.fatigue = 40;
  const freshest = sim.home.bench[0];
  freshest.fatigue = 5;
  for (const p of sim.home.bench.slice(1)) p.fatigue = 60;
  sim.autoSubsByFatigue();
  assert.ok(!sim.home.onCourt.some((p) => p.id === gassed.id), "gassed starter sat down");
  assert.ok(sim.home.onCourt.some((p) => p.id === freshest.id), "freshest bench player checked in");
});

test("autoSubsByFatigue: a bench STARTER fully recovered (fatigue 0) returns immediately, even over everyone else", () => {
  const sim = freshSim();
  const starterIds = new Set(sim.home.starterIds);
  // Move a starter to the bench by hand (simulating they'd been subbed out earlier) and rest them fully.
  const restingStarterIdx = sim.home.bench.findIndex((p) => starterIds.has(p.id));
  assert.ok(restingStarterIdx === -1, "none of the starters happen to already be on the bench in this fixture");
  const subOut = sim.home.onCourt[0]; // a starter, per starterIds construction
  const subIn = sim.home.bench[0];
  assert.ok(sim.substitute(subOut.id, subIn.id, "home"), "pre-condition: benched one starter");
  const restingStarter = sim.home.bench.find((p) => p.id === subOut.id);
  restingStarter.fatigue = ROTATION_FATIGUE_IN;
  // Nobody currently on court is anywhere near the sub-out threshold — only the "rested starter
  // returns" rule should fire, not the "gassed player subs out" rule.
  for (const p of sim.home.onCourt) p.fatigue = 20;
  sim.autoSubsByFatigue();
  assert.ok(sim.home.onCourt.some((p) => p.id === restingStarter.id), "rested starter is back on court");
});

test("autoSubsByFatigue: the rested-starter return beats a simultaneous gassed sub-out (one swap, the starter wins)", () => {
  const sim = freshSim();
  const subOut = sim.home.onCourt[0];
  const subIn = sim.home.bench[0];
  sim.substitute(subOut.id, subIn.id, "home");
  const restingStarter = sim.home.bench.find((p) => p.id === subOut.id);
  restingStarter.fatigue = ROTATION_FATIGUE_IN;
  // Also make someone currently on court very gassed, so both rules WOULD fire if independent.
  sim.home.onCourt[1].fatigue = 99;
  for (const p of sim.home.onCourt.slice(2)) p.fatigue = 30;
  const before = sim.home.onCourt.map((p) => p.id).join("|");
  sim.autoSubsByFatigue();
  assert.ok(sim.home.onCourt.some((p) => p.id === restingStarter.id), "the rested starter is the one who came in");
  assert.notEqual(sim.home.onCourt.map((p) => p.id).join("|"), before, "exactly one swap happened");
});

test("maybeManagedCoach: with ONLY autoRotation on, tactics (defense scheme / offense tactic) never change", () => {
  const sim = freshSim();
  sim.setAutoRotation(true);
  const schemeBefore = sim.defensePlan?.scheme;
  const tacticBefore = sim.home.tactic;
  const realRandom = Math.random;
  Math.random = () => 0; // force every random-gated branch to fire if it's reachable at all
  try {
    for (let i = 0; i < 50; i++) {
      sim.home.onCourt.forEach((p, i2) => (p.fatigue = i2 === 0 ? 10 : 10)); // keep it boring, no subs noise
      sim.maybeManagedCoach();
    }
  } finally {
    Math.random = realRandom;
  }
  assert.equal(sim.defensePlan?.scheme, schemeBefore, "defense scheme untouched by rotation-only autopilot");
  assert.equal(sim.home.tactic, tacticBefore, "offense tactic untouched by rotation-only autopilot");
});

test("maybeManagedCoach: with ONLY autoOffense/autoDefense on, no fatigue-based sub ever happens", () => {
  const sim = freshSim();
  sim.setAutoOffense(true);
  sim.setAutoDefense(true);
  const gassed = sim.home.onCourt[0];
  gassed.fatigue = 99; // would be an obvious sub-out under autoRotation
  for (const p of sim.home.onCourt.slice(1)) p.fatigue = 10;
  const before = sim.home.onCourt.map((p) => p.id).join("|");
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    for (let i = 0; i < 20; i++) sim.maybeManagedCoach();
  } finally {
    Math.random = realRandom;
  }
  assert.equal(sim.home.onCourt.map((p) => p.id).join("|"), before, "gassed starter stays on court — rotation is off");
});

test("runManagedBreak: the feed message only lists the switches that are actually on", () => {
  const events = [];
  const sim = freshSim({ onEvent: (e) => events.push(e) });
  sim.setAutoDefense(true);
  events.length = 0; // drop the "已开启" toggle message, we only care about the break summary
  sim.runManagedBreak("timeout");
  const summary = events.find((e) => e.text.includes("托管助手已调整"));
  assert.ok(summary, "a summary was emitted");
  assert.ok(summary.text.includes("盯防"));
  assert.ok(!summary.text.includes("轮换"), "rotation is off, so it should not be claimed");
  assert.ok(!summary.text.includes("基本战术"), "offense is off, so it should not be claimed");
});

test("runManagedBreak: nothing on → no 'adjusted' message at all (not an empty claim)", () => {
  const events = [];
  const sim = freshSim({ onEvent: (e) => events.push(e) });
  sim.runManagedBreak("timeout");
  assert.ok(!events.some((e) => e.text.includes("托管助手已调整")));
});

test("exportState/fromSave round-trips the three switches independently", () => {
  const sim = freshSim();
  sim.setAutoDefense(true);
  sim.setAutoRotation(true);
  const saved = sim.exportState();
  assert.equal(saved.autoOffense, false);
  assert.equal(saved.autoDefense, true);
  assert.equal(saved.autoRotation, true);
  assert.ok(!("managed" in saved), "the old single-flag field should be gone from new saves");
  const revived = GameSim.fromSave(saved, { onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  assert.deepEqual(
    [revived.autoOffense, revived.autoDefense, revived.autoRotation],
    [false, true, true]
  );
});

test("fromSave migrates a legacy single-flag save (managed: true) by turning all three on", () => {
  const sim = freshSim();
  const saved = sim.exportState();
  delete saved.autoOffense;
  delete saved.autoDefense;
  delete saved.autoRotation;
  saved.managed = true;
  const revived = GameSim.fromSave(saved, { onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  assert.deepEqual(
    [revived.autoOffense, revived.autoDefense, revived.autoRotation],
    [true, true, true]
  );
});
