import test from "node:test";
import assert from "node:assert/strict";
import { ASSISTANT_TIMEOUT_RESERVE, assistantMayCallTimeout } from "../js/engine/sim.js";

test("live: the assistant can spend 3 of 7 timeouts and must leave the player the rest", () => {
  let left = 7;
  let used = 0;
  while (assistantMayCallTimeout(left)) { left -= 1; used += 1; }
  assert.equal(used, 3);
  assert.equal(left, ASSISTANT_TIMEOUT_RESERVE);
});

test("quick sim has no player to protect: the assistant may use them all", () => {
  assert.equal(assistantMayCallTimeout(1, true), true);
  assert.equal(assistantMayCallTimeout(0, true), false);
});

test("a player who already burned timeouts is never overdrawn by the assistant", () => {
  assert.equal(assistantMayCallTimeout(ASSISTANT_TIMEOUT_RESERVE), false);
  assert.equal(assistantMayCallTimeout(2), false);
});
