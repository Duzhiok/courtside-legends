import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseClip, hashId, players3dEnabled, RUN_OFF_MPS, RUN_ON_MPS } from "../js/engine/court3dPlayers.js";

test("players3d flag: off by default, ?players3d=1 or localStorage turns it on, the URL wins", () => {
  const empty = { getItem: () => null };
  assert.equal(players3dEnabled("", empty), false);
  assert.equal(players3dEnabled("?players3d=1", empty), true);
  assert.equal(players3dEnabled("?a=1&players3d=true", empty), true);
  assert.equal(players3dEnabled("?players3d=0", { getItem: () => "1" }), false);
  assert.equal(players3dEnabled("", { getItem: (k) => (k === "cls.players3d" ? "1" : null) }), true);
  assert.equal(players3dEnabled("", { getItem: () => { throw new Error("blocked"); } }), false);
});

test("chooseClip: run/idle by speed with hysteresis; one-shots hold until their timer ends", () => {
  assert.equal(chooseClip("idle", RUN_ON_MPS + 0.1), "run");
  assert.equal(chooseClip("idle", (RUN_ON_MPS + RUN_OFF_MPS) / 2), "idle"); // not fast enough to start
  assert.equal(chooseClip("run", (RUN_ON_MPS + RUN_OFF_MPS) / 2), "run"); // fast enough to keep going
  assert.equal(chooseClip("run", RUN_OFF_MPS - 0.1), "idle");
  assert.equal(chooseClip("jump", 5, 0.4), "jump");
  assert.equal(chooseClip("celebrate", 0, 0.4), "celebrate");
  assert.equal(chooseClip("jump", 5, 0), "run");
  assert.equal(chooseClip("celebrate", 0, 0), "idle");
});

test("hashId is stable and spreads ids", () => {
  assert.equal(hashId("p1"), hashId("p1"));
  assert.notEqual(hashId("p1"), hashId("p2"));
  assert.ok(Number.isInteger(hashId(undefined)));
});
