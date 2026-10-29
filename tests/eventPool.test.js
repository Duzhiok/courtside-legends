import test from "node:test";
import assert from "node:assert/strict";
import {
  eligibleEvents,
  eventMatches,
  eventOnCooldown,
  pickNextEvent,
  pickWeightedRandom,
} from "../js/career/eventPool.js";

function ctx(overrides = {}) {
  return {
    currentYear: 1995,
    tenureYear: 3,
    trust: 50,
    pressure: 20,
    mood: 60,
    reputation: 50,
    flags: {},
    ...overrides,
  };
}

test("eventMatches: an event with no conditions always matches", () => {
  assert.equal(eventMatches({ id: "e" }, ctx()), true);
  assert.equal(eventMatches({ id: "e", conditions: {} }, ctx()), true);
});

test("eventMatches: tenure year range", () => {
  const event = { id: "e", conditions: { minTenureYear: 2, maxTenureYear: 4 } };
  assert.equal(eventMatches(event, ctx({ tenureYear: 1 })), false);
  assert.equal(eventMatches(event, ctx({ tenureYear: 2 })), true);
  assert.equal(eventMatches(event, ctx({ tenureYear: 4 })), true);
  assert.equal(eventMatches(event, ctx({ tenureYear: 5 })), false);
});

test("eventMatches: trust / pressure / mood / reputation ranges", () => {
  assert.equal(eventMatches({ conditions: { minTrust: 60 } }, ctx({ trust: 59 })), false);
  assert.equal(eventMatches({ conditions: { minTrust: 60 } }, ctx({ trust: 60 })), true);
  assert.equal(eventMatches({ conditions: { maxPressure: 30 } }, ctx({ pressure: 31 })), false);
  assert.equal(eventMatches({ conditions: { maxPressure: 30 } }, ctx({ pressure: 30 })), true);
  assert.equal(eventMatches({ conditions: { minMood: 70 } }, ctx({ mood: 65 })), false);
  assert.equal(eventMatches({ conditions: { maxReputation: 40 } }, ctx({ reputation: 50 })), false);
});

test("eventMatches: required and forbidden flags", () => {
  const needsFlag = { conditions: { requiresFlags: ["wasFired"] } };
  assert.equal(eventMatches(needsFlag, ctx({ flags: {} })), false);
  assert.equal(eventMatches(needsFlag, ctx({ flags: { wasFired: true } })), true);

  const forbidsFlag = { conditions: { forbidsFlags: ["retired"] } };
  assert.equal(eventMatches(forbidsFlag, ctx({ flags: { retired: true } })), false);
  assert.equal(eventMatches(forbidsFlag, ctx({ flags: {} })), true);
});

test("eventMatches: missing ctx value for a gated dimension fails closed, not open", () => {
  // If an event cares about reputation but the caller's ctx doesn't carry one (e.g. an older
  // call site that hasn't been updated to pass it yet), treat it as not-yet-eligible rather than
  // silently matching -- a silent match would let a reputation-gated event fire for everyone.
  const event = { conditions: { minReputation: 50 } };
  assert.equal(eventMatches(event, ctx({ reputation: undefined })), false);
});

test("eventOnCooldown: a non-repeatable event is blocked forever after firing once", () => {
  const event = { id: "once" };
  const log = [{ type: "story-choice", eventId: "once", year: 1990 }];
  assert.equal(eventOnCooldown(event, [], 2000), false);
  assert.equal(eventOnCooldown(event, log, 1990), true);
  assert.equal(eventOnCooldown(event, log, 2050), true, "no cooldown escape for non-repeatable events");
});

test("eventOnCooldown: a repeatable event respects its cooldownYears window", () => {
  const event = { id: "presser", repeatable: true, conditions: { cooldownYears: 2 } };
  const log = [{ type: "story-choice", eventId: "presser", year: 1995 }];
  assert.equal(eventOnCooldown(event, log, 1996), true, "still inside the 2-year cooldown");
  assert.equal(eventOnCooldown(event, log, 1997), false, "cooldownYears have fully elapsed, allowed again");
  assert.equal(eventOnCooldown(event, log, 1998), false, "well past the cooldown");
});

test("eventOnCooldown: repeatable with no cooldownYears can fire again immediately", () => {
  const event = { id: "presser", repeatable: true };
  const log = [{ type: "story-choice", eventId: "presser", year: 1995 }];
  assert.equal(eventOnCooldown(event, log, 1995), false);
});

test("eventOnCooldown: only counts this event's own entries, not other events' history", () => {
  const event = { id: "a" };
  const log = [{ type: "story-choice", eventId: "b", year: 1990 }];
  assert.equal(eventOnCooldown(event, log, 2000), false);
});

test("eligibleEvents filters by both cooldown and conditions, preserving pool order", () => {
  const pool = [
    { id: "a", conditions: { minTenureYear: 1 } },
    { id: "b", conditions: { minTenureYear: 10 } }, // not yet eligible
    { id: "c" }, // already fired, non-repeatable
    { id: "d", conditions: { minTenureYear: 1 } },
  ];
  const log = [{ type: "story-choice", eventId: "c", year: 1990 }];
  const eligible = eligibleEvents(pool, log, ctx({ tenureYear: 3 }));
  assert.deepEqual(eligible.map((e) => e.id), ["a", "d"]);
});

test("pickNextEvent returns the lowest-order eligible event, ties broken by pool order", () => {
  const pool = [
    { id: "low-order-but-later", order: 5 },
    { id: "tie-first", order: 1 },
    { id: "tie-second", order: 1 },
  ];
  assert.equal(pickNextEvent(pool, [], ctx()).id, "tie-first");
});

test("pickNextEvent treats a missing order as 0 (highest priority)", () => {
  const pool = [{ id: "has-order", order: 5 }, { id: "no-order" }];
  assert.equal(pickNextEvent(pool, [], ctx()).id, "no-order");
});

test("pickNextEvent returns null when nothing is eligible", () => {
  const pool = [{ id: "only", conditions: { minTenureYear: 99 } }];
  assert.equal(pickNextEvent(pool, [], ctx({ tenureYear: 1 })), null);
});

test("pickWeightedRandom returns null for an empty candidate list", () => {
  assert.equal(pickWeightedRandom([], () => 0.5), null);
});

test("pickWeightedRandom always returns the sole candidate", () => {
  const only = { id: "only" };
  assert.equal(pickWeightedRandom([only], () => 0.99), only);
});

test("pickWeightedRandom distributes rolls proportionally to weight, with an injected rng", () => {
  const a = { id: "a", weight: 1 };
  const b = { id: "b", weight: 3 };
  // total weight = 4. roll * 4 < 1 -> a; otherwise -> b.
  assert.equal(pickWeightedRandom([a, b], () => 0).id, "a");
  assert.equal(pickWeightedRandom([a, b], () => 0.24).id, "a");
  assert.equal(pickWeightedRandom([a, b], () => 0.26).id, "b");
  assert.equal(pickWeightedRandom([a, b], () => 0.99).id, "b");
});

test("pickWeightedRandom treats a missing or non-positive weight as 1", () => {
  const a = { id: "a" };
  const b = { id: "b", weight: -5 };
  // total weight = 1 + 1 = 2 regardless of b's bogus negative weight.
  assert.equal(pickWeightedRandom([a, b], () => 0.1).id, "a");
  assert.equal(pickWeightedRandom([a, b], () => 0.9).id, "b");
});
