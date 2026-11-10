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
