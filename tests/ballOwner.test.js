import { test } from "node:test";
import assert from "node:assert/strict";
import { ballHolders, openingHolder } from "../js/match/presentation/ballOwner.js";

test("a pass moves the ball from the passer to the receiver", () => {
  assert.deepEqual(ballHolders("pass", { pass: { passerId: "a", receiverId: "b", kind: "kick" } }), { before: "a", after: "b" });
});

test("a shot or a dunk starts in the shooter's hands and leaves nobody holding it", () => {
  assert.deepEqual(ballHolders("score", { shot: { shooterId: "a", made: true, pts: 3 } }), { before: "a", after: null });
  assert.deepEqual(ballHolders("miss", { shot: { shooterId: "a", made: false, pts: 2 } }), { before: "a", after: null });
  assert.deepEqual(ballHolders("dunk", { player: { id: "d" } }), { before: "d", after: null });
});

test("a rebound hands the ball to the rebounder", () => {
  assert.deepEqual(ballHolders("reb", { reb: { rebounderId: "r", offensive: false } }), { before: undefined, after: "r" });
});

test("a steal gives the ball to the stealer; any other turnover leaves it loose", () => {
  assert.deepEqual(ballHolders("miss", { actorId: "s", turnover: { actorId: "h", kind: "steal", forcedById: "s" } }), { before: "h", after: "s" });
  assert.deepEqual(ballHolders("miss", { turnover: { actorId: "h", kind: "unforced", forcedById: "s" } }), { before: "h", after: null });
});

test("events that say nothing about the ball say nothing", () => {
  assert.deepEqual(ballHolders("coach", {}), {});
  assert.deepEqual(ballHolders("substitution", null), {});
  assert.deepEqual(ballHolders("miss", { foul: { fouledId: "x" } }), {});
});

test("the opening holder is the first player the same possession names, and never reads past the next start", () => {
  const ev = [
    { kind: "possession_start" },
    { kind: "coach", meta: {} },
    { kind: "pass", meta: { pass: { passerId: "pg", receiverId: "sf" } } },
    { kind: "score", meta: { shot: { shooterId: "sf", made: true, pts: 2 } } },
    { kind: "possession_start" },
    { kind: "score", meta: { shot: { shooterId: "later", made: true, pts: 2 } } },
  ];
  assert.equal(openingHolder(ev, 0), "pg");
  assert.equal(openingHolder(ev, 4), "later");
  assert.equal(openingHolder([{ kind: "possession_start" }, { kind: "possession_start" }], 0), null, "an empty possession names nobody");
  assert.equal(openingHolder([], 0), null);
});
