import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../js/vendor/three.module.js";
import {
  DUNK_TOTAL_MS, PUSH_MS, SHOT_FLIGHT_MS, SHOT_SETTLE_MS, FRAMING_ZOOM, BALL_VISUAL_SCALE, BALL_RADIUS_M, fitCameraDistance,
} from "../js/engine/court3d.js";
import { PLATE_LEGIBLE_PX, PLATE_WORLD, plateScreenSize } from "../js/engine/broadcast/labelLayout.js";
import { makeShellView as makeView } from "./helpers/court3dFixtures.js";

const mode = (view, id) => view._figures.get(id).plate.mode;

test("the ball handler gets the full plate (big, bright, never behind anything); everyone else is compact; it follows the ball", async () => {
  const { view, at } = await makeView();
  view.setBallOwner("gsw-curry");
  at(PUSH_MS + 300);
  assert.equal(mode(view, "gsw-curry"), "full");
  const full = view._figures.get("gsw-curry").plate.sprite;
  assert.ok(full.scale.x >= PLATE_WORLD.full.w, "never smaller than its design size (a small screen enlarges it)");
  assert.equal(full.material.depthTest, false, "drawn over bodies and the scoreboard");
  for (const [id, fig] of view._figures) {
    if (id === "gsw-curry") continue;
    assert.equal(fig.plate.mode, "compact", id);
    assert.ok(fig.plate.sprite.scale.x >= PLATE_WORLD.compact.w, id);
    assert.ok(fig.plate.sprite.scale.x < full.scale.x, `${id}: the active player's plate is the biggest`);
  }
  view.setBallOwner("gsw-klay");
  at(PUSH_MS + 600);
  assert.equal(mode(view, "gsw-klay"), "full", "the new holder");
  assert.equal(mode(view, "gsw-curry"), "compact", "the old holder gives it up");
  assert.equal(view._figures.get("gsw-curry").plate.sprite.material.depthTest, true);
  assert.equal(view._aids.parts.focusRing.visible, true, "and the ring is under him");
  view.setBallOwner(null);
  at(PUSH_MS + 900);
  assert.equal(view._aids.parts.focusRing.visible, false, "nobody has it: no ring");
});

test("while a shot is in the air the shooter stays the focus, and the ball's real owner id is what the view reports", async () => {
  const { view, at, setNow } = await makeView();
  view.setBallOwner("gsw-curry");
  setNow(PUSH_MS);
  assert.equal(view.onShot({ shooterId: "gsw-klay", made: true }), true);
  at(PUSH_MS + SHOT_FLIGHT_MS / 2);
  assert.equal(view._focusId(), "gsw-klay", "owner is curry on the book, but the eye follows the shooter once the shot is on");
  assert.equal(mode(view, "gsw-klay"), "full");
});

for (const [name, size] of [["desktop 800x450", { width: 800, height: 450 }], ["phone 390x700", { width: 390, height: 700 }]]) {
  test(`no two visible plates overlap on screen, on any frame (${name}), and the focus plate is never hidden`, async () => {
    const { view, at, width, height } = await makeView(size);
    const ids = [...view._figures.keys()];
    let framesChecked = 0;
    for (let f = 0; f < 40; f++) {
      view.setBallOwner(ids[f % ids.length]);
      at(PUSH_MS + 40 * f);
      const boxes = [];
      for (const [id, fig] of view._figures) {
        const sprite = fig.plate.sprite;
        if (!sprite.visible) continue;
        const v = new THREE.Vector3(fig.group.position.x, fig.group.position.y + sprite.position.y, fig.group.position.z).project(view._camera);
        const dist = view._camera.position.distanceTo(fig.group.position);
        const sz = plateScreenSize(sprite.scale.x, sprite.scale.y, dist, view._fov, height);
        if (id !== view._focusId()) assert.ok(sz.h >= PLATE_LEGIBLE_PX - 0.01, `frame ${f}: ${id} is shown at ${sz.h.toFixed(1)} px, a speck; it should be hidden`);
        boxes.push({ id, x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, w: sz.w, h: sz.h });
      }
      assert.ok(view._figures.get(view._focusId()).plate.sprite.visible, "the focus plate is always visible");
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const hit = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.5 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 0.5;
        assert.equal(hit, false, `frame ${f}: ${a.id} overlaps ${b.id}`);
      }
      framesChecked += 1;
    }
    assert.equal(framesChecked, 40);
  });
}

test("plates stay clear of each other while a player is in the air on a dunk (the plate rides on the jumping figure)", async () => {
  for (const dunker of ["gsw-curry", "gsw-bogut", "cle-james"]) {
    const { view, at, setNow, width, height } = await makeView();
    setNow(PUSH_MS);
    assert.equal(view.onDunk(dunker), true);
    let airborne = 0;
    for (let k = 0; k <= 24; k++) {
      at(PUSH_MS + (DUNK_TOTAL_MS * k) / 24);
      if (view._figures.get(dunker).group.position.y > 0.2) airborne += 1;
      const boxes = [];
      for (const [id, fig] of view._figures) {
        const sprite = fig.plate.sprite;
        if (!sprite.visible) continue;
        const v = new THREE.Vector3(fig.group.position.x, fig.group.position.y + sprite.position.y, fig.group.position.z).project(view._camera);
        const sz = plateScreenSize(sprite.scale.x, sprite.scale.y, view._camera.position.distanceTo(fig.group.position), view._fov, height);
        boxes.push({ id, x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, w: sz.w, h: sz.h });
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        assert.equal(Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.5 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 0.5, false, `${dunker} step ${k}: ${a.id} overlaps ${b.id}`);
      }
    }
    assert.ok(airborne >= 3, `${dunker} was really in the air for ${airborne} steps`);
  }
});

test("the camera is closer than the whole-court fit and eases along the court with the ball (never snaps)", async () => {
  const { view, at } = await makeView();
  at(PUSH_MS + 16);
  const aspect = 800 / 450;
  const expected = fitCameraDistance(aspect, view._fov) * 0.94 * FRAMING_ZOOM;
  assert.ok(Math.abs(view._camera.position.x - expected) < 1e-9, "closer by FRAMING_ZOOM");
  assert.ok(FRAMING_ZOOM < 0.9, "noticeably closer");
  // Whoever holds the ball, the pan moves toward him a little per frame, within limits.
  const ids = [...view._figures.keys()];
  let last = view._camera.position.z;
  let biggestStep = 0;
  for (let f = 0; f < 120; f++) {
    view.setBallOwner(ids[(f >> 4) % ids.length]); // a new holder every 16 frames
    at(PUSH_MS + 32 + 16 * f); // 60 fps
    biggestStep = Math.max(biggestStep, Math.abs(view._camera.position.z - last));
    last = view._camera.position.z;
    assert.ok(Math.abs(view._camera.position.z) <= 6 + 1e-9, "the pan stays inside the limit");
  }
  assert.ok(biggestStep < 0.8, `no frame moves the camera more than ${biggestStep.toFixed(2)} m`);
});

test("the ball is drawn bigger than life but still rests ON the floor, and the floor shadow sits straight under it in the air", async () => {
  const { view, at, setNow } = await makeView();
  const geo = view._ball.geometry;
  assert.ok(Math.abs(geo.parameters.radius - BALL_RADIUS_M * BALL_VISUAL_SCALE) < 1e-9);
  geo.computeBoundingBox();
  setNow(PUSH_MS);
  view.onShot({ shooterId: "gsw-curry", made: true });
  at(PUSH_MS + SHOT_FLIGHT_MS / 2);
  const air = { x: view._ball.position.x, y: view._ball.position.y, z: view._ball.position.z };
  assert.ok(air.y > 3, "in the air");
  assert.equal(view._aids.parts.shadow.visible, true);
  assert.deepEqual([view._aids.parts.shadow.position.x, view._aids.parts.shadow.position.z], [air.x, air.z], "straight under the ball");
  at(PUSH_MS + SHOT_FLIGHT_MS); // lands: starts settling
  at(PUSH_MS + SHOT_FLIGHT_MS + SHOT_SETTLE_MS); // settled on the floor
  const lowest = view._ball.position.y + geo.boundingBox.min.y;
  assert.ok(Math.abs(lowest) < 1e-6, `the ball's bottom touches the floor (${lowest})`); // geometry is float32
  assert.equal(view._aids.parts.shadow.visible, false, "on the floor: no shadow");
});

test("the shot path line IS the ball's flight (one formula): it starts at the shooter, ends at the rim, and goes away when the shot is over", async () => {
  const { view, at, setNow } = await makeView();
  setNow(PUSH_MS);
  view.onShot({ shooterId: "gsw-curry", made: false });
  const { trail, rimRing } = view._aids.parts;
  assert.equal(trail.visible && rimRing.visible, true);
  const pos = trail.geometry.getAttribute("position");
  const n = pos.count;
  const s = view._shot;
  assert.ok(Math.hypot(pos.getX(0) - s.from.x, pos.getZ(0) - s.from.z) < 1e-6, "from the shooter's hands");
  assert.ok(Math.hypot(pos.getX(n - 1) - s.to.x, pos.getY(n - 1) - s.to.y, pos.getZ(n - 1) - s.to.z) < 1e-6, "to the rim");
  at(PUSH_MS + SHOT_FLIGHT_MS * ((n >> 1) / (n - 1))); // the flight tick that matches the path's middle sample
  const i = n >> 1;
  assert.ok(Math.hypot(view._ball.position.x - pos.getX(i), view._ball.position.y - pos.getY(i), view._ball.position.z - pos.getZ(i)) < 1e-6, "the ball is on the line");
  at(PUSH_MS + SHOT_FLIGHT_MS);
  at(PUSH_MS + SHOT_FLIGHT_MS + SHOT_SETTLE_MS);
  assert.equal(view._shot, null);
  assert.equal(trail.visible || rimRing.visible, false, "the path is cleared after the shot");
});
