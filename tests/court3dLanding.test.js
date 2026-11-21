// A3: the court says "a shot landed" exactly when the ball reaches the rim (never at release), once, with who scored; a make makes
// the arena cheer for that side. The listener is the only thing that touches sound, and a throwing listener cannot break rendering.
import test from "node:test";
import assert from "node:assert/strict";
import { DUNK_DRIVE_MS, SHOT_FLIGHT_MS } from "../js/engine/court3d.js";
import { makeShellView } from "./helpers/court3dFixtures.js";

const PUSH_END = 1200; // the replay push has finished by here; shots below start from `start`

async function shotView() {
  const ctx = await makeShellView();
  const landed = [];
  const cheers = [];
  ctx.view.onShotLanded = (e) => landed.push(e);
  const realCheer = ctx.view._env?.cheer?.bind(ctx.view._env);
  if (ctx.view._env) ctx.view._env.cheer = (...a) => { cheers.push(a); realCheer(...a); };
  return { ...ctx, landed, cheers };
}

test("a made three lands at the rim, not at release: one event with the points and the scoring side, and the stands cheer", async () => {
  const { view, at, setNow, landed, cheers } = await shotView();
  const start = PUSH_END;
  setNow(start);
  const shooterId = [...view._figures.keys()][0];
  assert.equal(view.onShot({ shooterId, made: true, pts: 3 }), true);
  at(start + 10);
  at(start + SHOT_FLIGHT_MS - 20);
  assert.equal(landed.length, 0, "the ball is still in the air: no cheer yet");
  at(start + SHOT_FLIGHT_MS + 20);
  assert.equal(landed.length, 1);
  assert.equal(landed[0].made, true);
  assert.equal(landed[0].pts, 3);
  assert.ok(["home", "away"].includes(landed[0].side));
  assert.equal(landed[0].shooterId, shooterId);
  at(start + SHOT_FLIGHT_MS + 400);
  assert.equal(landed.length, 1, "reported once, not every frame of the settle");
  assert.equal(cheers.length, 1, "the arena cheered once");
  assert.equal(cheers[0][0], 1.3, "a three is a bigger cheer");
  assert.equal(cheers[0][1], landed[0].side, "the scoring side's bench");
});

test("a miss lands too (the sound layer decides it is silent) but nobody in the arena cheers", async () => {
  const { view, at, setNow, landed, cheers } = await shotView();
  setNow(PUSH_END);
  view.onShot({ shooterId: [...view._figures.keys()][0], made: false, pts: 0 });
  at(PUSH_END + SHOT_FLIGHT_MS + 20);
  assert.deepEqual(landed.map((e) => e.made), [false]);
  assert.equal(cheers.length, 0);
});

test("a dunk lands when it hits the rim: one cheer, flagged as a dunk", async () => {
  const { view, at, setNow, landed, cheers } = await shotView();
  setNow(PUSH_END);
  view.onDunk([...view._figures.keys()][0]);
  at(PUSH_END + 50);
  assert.equal(landed.length, 0, "still driving to the rim");
  at(PUSH_END + DUNK_DRIVE_MS + 40);
  at(PUSH_END + DUNK_DRIVE_MS + 120);
  assert.equal(landed.length, 1);
  assert.equal(landed[0].dunk, true);
  assert.equal(cheers.length, 1);
});

test("a listener that throws cannot break the render loop", async () => {
  const { view, at, setNow } = await shotView();
  view.onShotLanded = () => { throw new Error("audio exploded"); };
  setNow(PUSH_END);
  view.onShot({ shooterId: [...view._figures.keys()][0], made: true, pts: 2 });
  assert.doesNotThrow(() => at(PUSH_END + SHOT_FLIGHT_MS + 20));
});
