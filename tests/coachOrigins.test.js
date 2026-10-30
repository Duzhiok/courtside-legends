import test from "node:test";
import assert from "node:assert/strict";
import {
  COACH_ORIGINS,
  COACH_ORIGIN_ORDER,
  DEFAULT_COACH_ORIGIN,
  applyOriginToCoach,
  applyOriginToOffer,
  coachOrigin,
  isKnownCoachOrigin,
  listCoachOrigins,
} from "../js/career/coachOrigins.js";

test("DEFAULT_COACH_ORIGIN is a real, zero-modifier origin", () => {
  assert.ok(isKnownCoachOrigin(DEFAULT_COACH_ORIGIN));
  const origin = COACH_ORIGINS[DEFAULT_COACH_ORIGIN];
  assert.equal(origin.reputationDelta, 0);
  assert.equal(origin.trustDelta, 0);
  assert.equal(origin.pressureDelta, 0);
  assert.equal(origin.authorityDelta, 0);
});

test("every origin has bilingual label/description and an id matching its key", () => {
  for (const [key, origin] of Object.entries(COACH_ORIGINS)) {
    assert.equal(origin.id, key);
    assert.ok(/[\u4e00-\u9fff]/.test(origin.label), `${key} label should contain Chinese`);
    assert.ok(origin.labelEn && /^[\x20-\x7e]+$/.test(origin.labelEn), `${key} labelEn should be plain ASCII`);
    assert.ok(origin.description.length > 0);
    assert.ok(origin.descriptionEn.length > 0);
  }
});

test("COACH_ORIGIN_ORDER lists exactly the keys in COACH_ORIGINS, no more no less", () => {
  assert.deepEqual([...COACH_ORIGIN_ORDER].sort(), Object.keys(COACH_ORIGINS).sort());
});

test("listCoachOrigins returns the full catalogue in COACH_ORIGIN_ORDER", () => {
  const listed = listCoachOrigins();
  assert.deepEqual(listed.map((o) => o.id), COACH_ORIGIN_ORDER);
});

test("isKnownCoachOrigin rejects unknown ids and prototype-pollution attempts", () => {
  assert.equal(isKnownCoachOrigin("madeUpOrigin"), false);
  assert.equal(isKnownCoachOrigin("toString"), false);
  assert.equal(isKnownCoachOrigin("__proto__"), false);
  assert.equal(isKnownCoachOrigin(undefined), false);
});

test("coachOrigin falls back to the default for unknown ids instead of throwing", () => {
  assert.equal(coachOrigin("nonsense").id, DEFAULT_COACH_ORIGIN);
  assert.equal(coachOrigin(undefined).id, DEFAULT_COACH_ORIGIN);
  assert.equal(coachOrigin("formerPlayer").id, "formerPlayer");
});

test("applyOriginToOffer nudges trust/pressure/authority by the origin's deltas", () => {
  const offer = { trust: 50, pressure: 50, authority: 50, salary: 7 };
  const nudged = applyOriginToOffer(offer, "formerPlayer");
  const origin = COACH_ORIGINS.formerPlayer;
  assert.equal(nudged.trust, 50 + origin.trustDelta);
  assert.equal(nudged.pressure, 50 + origin.pressureDelta);
  assert.equal(nudged.authority, 50 + origin.authorityDelta);
  assert.equal(nudged.salary, 7, "fields the origin doesn't touch pass through untouched");
});

test("applyOriginToOffer clamps into 0-100 at both ends", () => {
  const lowClamp = applyOriginToOffer({ trust: 2, pressure: 2, authority: 2 }, "grassroots");
  assert.ok(lowClamp.pressure >= 0, "pressure should not go negative");
  const highClamp = applyOriginToOffer({ trust: 99, pressure: 99, authority: 99 }, "formerPlayer");
  assert.ok(highClamp.trust <= 100 && highClamp.pressure <= 100);
});

test("applyOriginToOffer does not mutate the input offer", () => {
  const offer = { trust: 50, pressure: 50, authority: 50 };
  const frozen = JSON.stringify(offer);
  applyOriginToOffer(offer, "overseas");
  assert.equal(JSON.stringify(offer), frozen);
});

test("the generalist origin leaves an offer's numbers completely unchanged", () => {
  const offer = { trust: 61, pressure: 37, authority: 48 };
  assert.deepEqual(applyOriginToOffer(offer, "generalist"), offer);
  assert.deepEqual(applyOriginToOffer(offer, undefined), offer);
});

test("applyOriginToCoach nudges reputation only, clamped to 0-100", () => {
  const coach = { reputation: 50, cash: 12, mood: 60 };
  const bumped = applyOriginToCoach(coach, "formerPlayer");
  assert.equal(bumped.reputation, 50 + COACH_ORIGINS.formerPlayer.reputationDelta);
  assert.equal(bumped.cash, 12, "fields other than reputation pass through untouched");
  assert.equal(bumped.mood, 60);

  const grounded = applyOriginToCoach({ reputation: 2 }, "grassroots");
  assert.ok(grounded.reputation >= 0, "reputation should not go negative");
});

test("applyOriginToCoach does not mutate the input coach", () => {
  const coach = { reputation: 50 };
  applyOriginToCoach(coach, "overseas");
  assert.equal(coach.reputation, 50);
});
