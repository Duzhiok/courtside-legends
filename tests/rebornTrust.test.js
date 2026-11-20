/**
 * Player Reborn PR2 — coach trust and rotation roles. Pure + deterministic.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  roleForTrust,
  expectedGameScore,
  updateTrust,
  describeTrustChange,
  describeNextTier,
  nextTier,
  ROLE_MINUTES,
  TRUST_START,
} from "../js/reborn/trust.js";

test("role tiers follow trust thresholds", () => {
  assert.equal(roleForTrust(0), "dnp");
  assert.equal(roleForTrust(14), "dnp");
  assert.equal(roleForTrust(15), "garbage");
  assert.equal(roleForTrust(29), "garbage");
  assert.equal(roleForTrust(30), "bench");
  assert.equal(roleForTrust(49), "bench");
  assert.equal(roleForTrust(50), "rotation");
  assert.equal(roleForTrust(74), "rotation");
  assert.equal(roleForTrust(75), "starter");
  assert.equal(roleForTrust(100), "starter");
  assert.equal(roleForTrust(-5), "dnp");
  assert.equal(roleForTrust(150), "starter");
});

test("a vacancy bumps one tier, but never past starter", () => {
  assert.equal(roleForTrust(30, { vacancy: true }), "rotation");
  assert.equal(roleForTrust(10, { vacancy: true }), "garbage");
  assert.equal(roleForTrust(90, { vacancy: true }), "starter");
});

test("expected Game Score rises with the role", () => {
  assert.deepEqual(
    ["dnp", "garbage", "bench", "rotation", "starter"].map(expectedGameScore),
    [0, 2, 4, 7, 10],
  );
});

test("minutes follow the role", () => {
  assert.deepEqual(ROLE_MINUTES, { dnp: 0, garbage: 4, bench: 10, rotation: 18, starter: 30 });
  assert.equal(TRUST_START, 25);
  assert.equal(roleForTrust(TRUST_START), "garbage");
});

test("good play earns trust, bad play loses it, bounded per game", () => {
  const good = updateTrust(40, { gameScore: 12, role: "bench" });
  assert.equal(good.delta, 7, "clamped at +7");
  assert.equal(good.trust, 47);
  const bad = updateTrust(40, { gameScore: -2, role: "starter" });
  assert.equal(bad.delta, -5, "clamped at -5");
  assert.equal(bad.trust, 35);
  const even = updateTrust(40, { gameScore: 4, role: "bench" });
  assert.equal(even.delta, 0, "meeting expectation changes nothing");
});

test("training adds trust — more when DNP, the way back onto the court", () => {
  assert.equal(updateTrust(10, { gameScore: 0, role: "dnp", trainingDone: true }).delta, 4);
  assert.equal(updateTrust(40, { gameScore: 4, role: "bench", trainingDone: true }).delta, 2);
  assert.equal(updateTrust(40, { gameScore: 4, role: "bench" }).delta, 0);
});

test("a takeover adds or costs trust by its outcome", () => {
  const made = updateTrust(40, { gameScore: 4, role: "bench", takeover: { attempted: true, made: true } });
  assert.equal(made.delta, 4);
  const missed = updateTrust(40, { gameScore: 4, role: "bench", takeover: { attempted: true, made: false } });
  assert.equal(missed.delta, -2);
  const never = updateTrust(40, { gameScore: 4, role: "bench", takeover: { attempted: false, made: false } });
  assert.equal(never.delta, 0);
});

test("trust clamps to 0–100", () => {
  assert.equal(updateTrust(98, { gameScore: 30, role: "bench" }).trust, 100);
  assert.equal(updateTrust(2, { gameScore: -10, role: "starter" }).trust, 0);
});

test("the trust change explains itself on the card, zh + en", () => {
  const change = updateTrust(40, {
    gameScore: 11,
    role: "rotation",
    trainingDone: true,
    takeover: { attempted: true, made: true },
  });
  const zh = describeTrustChange(change, "zh");
  const en = describeTrustChange(change, "en");
  assert.match(zh, /信任 \+11/);
  assert.match(zh, /关键回合打成/);
  assert.match(en, /Trust \+11/);
  assert.match(en, /Takeover made/);
});

test("a game he barely played is not a bad performance: no trust is lost for sitting", () => {
  const sat = updateTrust(25, { gameScore: 0, role: "garbage", minutes: 0 });
  assert.equal(sat.delta, 0);
  assert.deepEqual(sat.parts[0], { kind: "unplayed", delta: 0, minutes: 0 });
  assert.equal(updateTrust(25, { gameScore: 0, role: "garbage", minutes: 2.9 }).delta, 0);
  // Real minutes are judged exactly as before, and omitting minutes keeps the old rule.
  assert.equal(updateTrust(25, { gameScore: 0, role: "garbage", minutes: 3 }).delta, -2);
  assert.equal(updateTrust(25, { gameScore: 0, role: "garbage" }).delta, -2);
  assert.equal(updateTrust(40, { gameScore: -2, role: "starter", minutes: 20 }).delta, -5);
});

test("sitting still lets training move him up the ladder (the death spiral is gone)", () => {
  let trust = 25;
  for (let game = 1; game <= 60; game += 1) {
    trust = updateTrust(trust, { gameScore: 0, role: roleForTrust(trust), minutes: 0, trainingDone: game % 4 === 0 }).trust;
  }
  assert.ok(trust >= 30, `a diligent unused player reaches the bench band, got ${trust}`);
  // ...and without training nothing moves: no free ride either.
  let idle = 25;
  for (let game = 1; game <= 60; game += 1) idle = updateTrust(idle, { gameScore: 0, role: roleForTrust(idle), minutes: 0 }).trust;
  assert.equal(idle, 25);
});

test("the ladder names the next role, the gap, and what moves it (zh + en)", () => {
  assert.deepEqual(nextTier(25), { role: "bench", at: 30, missing: 5 });
  assert.deepEqual(nextTier(10), { role: "garbage", at: 15, missing: 5 });
  assert.deepEqual(nextTier(74), { role: "starter", at: 75, missing: 1 });
  assert.equal(nextTier(75), null);
  assert.match(describeNextTier(25, "zh"), /轮换末端.*30.*还差 5.*训练 \+2/);
  assert.match(describeNextTier(10, "en"), /Garbage time at trust 15 \(5 to go\).*\+4 a week/);
  assert.equal(describeNextTier(90, "zh"), "");
});

test("the unplayed trust line explains itself, zh + en", () => {
  const change = updateTrust(25, { gameScore: 0, role: "garbage", minutes: 0 });
  assert.match(describeTrustChange(change, "zh"), /没有上场.*信任不扣/);
  assert.match(describeTrustChange(change, "en"), /Didn't play.*no trust lost/);
});
