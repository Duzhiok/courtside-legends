import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../js/vendor/three.module.js";
import { PLATE_LEGIBLE_PX, PLATE_MAX_BOOST, PLATE_MIN_PX, PLATE_WORLD, compactName, placeLabels, plateScreenSize, platePriority, readableBoost } from "../js/engine/broadcast/labelLayout.js";
import { TRAIL_POINTS, createBallAids } from "../js/engine/broadcast/ballAids.js";

const box = (id, x, y, priority, w = 100, h = 25) => ({ id, x, y, w, h, priority });

test("a plate that overlaps a stronger one is nudged up; the strongest never moves", () => {
  const out = placeLabels([box("focus", 200, 200, 100, 220, 55), box("mate", 205, 205, 20), box("far", 600, 300, 10)]);
  assert.deepEqual(out.get("focus"), { visible: true, dy: 0 }, "the ball handler's plate is placed first and stays put");
  assert.equal(out.get("mate").visible, true);
  assert.ok(out.get("mate").dy < 0, "it dodges upward");
  assert.deepEqual(out.get("far"), { visible: true, dy: 0 }, "a plate with room is untouched");
});

test("when nudging cannot clear the pile the weakest plate is hidden, and the ones that stay never overlap", () => {
  const pile = [box("a", 300, 300, 20), box("b", 302, 301, 19), box("c", 299, 299, 18), box("d", 301, 300, 17), box("e", 300, 302, 16)];
  const out = placeLabels(pile, { maxShifts: 2 });
  const shown = pile.filter((p) => out.get(p.id).visible).map((p) => ({ ...p, y: p.y + out.get(p.id).dy }));
  assert.ok(shown.length >= 3 && shown.length < pile.length, `${shown.length} shown of ${pile.length}`);
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
    const a = shown[i];
    const b = shown[j];
    const hit = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
    assert.equal(hit, false, `${a.id} and ${b.id} must not overlap`);
  }
  assert.equal(out.get("a").visible, true, "the strongest survives");
  assert.equal(out.get("e").visible, false, "the weakest gave way");
});

test("the focus plate is always visible, even buried under other plates, and is deterministic regardless of input order", () => {
  const items = [box("x", 100, 100, 20), box("focus", 100, 100, 100, 200, 50), box("y", 100, 100, 19)];
  const a = placeLabels(items);
  const b = placeLabels([...items].reverse());
  const byId = (m) => [...m.entries()].sort(([p], [q]) => p.localeCompare(q));
  assert.deepEqual(byId(a), byId(b), "the same plates win whatever order they are listed in");
  assert.deepEqual(a.get("focus"), { visible: true, dy: 0 });
});

test("priority: the focus beats everyone, offence beats defence, and nearer the action beats farther", () => {
  assert.equal(platePriority({ isFocus: true }), 100);
  assert.ok(platePriority({ isOffense: true, distToFocus: 4 }) > platePriority({ isOffense: false, distToFocus: 4 }));
  assert.ok(platePriority({ isOffense: false, distToFocus: 2 }) > platePriority({ isOffense: false, distToFocus: 20 }));
  assert.ok(platePriority({ isOffense: true, distToFocus: 0 }) < 100);
});

test("screen size follows perspective: twice as far is half as big; the full plate is twice the compact one", () => {
  const near = plateScreenSize(3.4, 0.85, 20, 50, 900);
  const far = plateScreenSize(3.4, 0.85, 40, 50, 900);
  assert.ok(Math.abs(near.w / far.w - 2) < 1e-9);
  assert.ok(PLATE_WORLD.full.w >= PLATE_WORLD.compact.w * 1.9, "the active player's plate is clearly bigger");
  assert.ok(near.h > 20, "from the default framing the full plate is comfortably readable (> 20 px tall)");
});

test("a plate too small to read is enlarged up to the minimum (a phone), a big one is left alone, and the boost is capped", () => {
  assert.equal(readableBoost(60, PLATE_MIN_PX.full), 1, "already big enough: untouched");
  assert.equal(readableBoost(17, 34), 2);
  assert.equal(readableBoost(1, 34), PLATE_MAX_BOOST, "never more than the cap");
  assert.equal(readableBoost(0, 34), 1, "no size, no boost");
  // The phone case that motivated it: the 390 px portrait court makes the full plate ~12 px and the compact one ~4 px tall.
  assert.ok(12 * readableBoost(12, PLATE_MIN_PX.full) >= 12 * 2.8, "a 12 px full plate gets close to its 34 px target");
  assert.ok(PLATE_MIN_PX.full > PLATE_MIN_PX.compact, "the active player's plate is always the biggest");
  assert.ok(PLATE_LEGIBLE_PX < PLATE_MIN_PX.compact, "the hide-floor sits below the target size, so a normal boost never hides a plate");
});

test("compact names stay compact", () => {
  assert.equal(compactName("Ibaka"), "Ibaka");
  assert.equal(compactName("Antetokounmpo"), "Anteto.");
  assert.equal(compactName("Antetokounmpo").length, 7, "never longer than the limit");
  assert.equal(compactName(null), "");
});

// ---------------------------------------------------------------- ball aids with the real THREE

test("ball aids: the ring follows the focus only while there is one; the shadow appears only in the air", () => {
  const scene = new THREE.Scene();
  const aids = createBallAids(THREE, scene);
  const { focusRing, shadow } = aids.parts;
  aids.update({ now: 100, focus: { x: 3, z: -4 }, ball: { x: 3, y: 1, z: -4, visible: true }, shot: null });
  assert.equal(focusRing.visible, true);
  assert.deepEqual([focusRing.position.x, focusRing.position.z], [3, -4]);
  assert.equal(shadow.visible, true);
  assert.deepEqual([shadow.position.x, shadow.position.z], [3, -4], "the shadow is straight under the ball");
  aids.update({ now: 200, focus: null, ball: { x: 3, y: 0.12, z: -4, visible: true }, shot: null });
  assert.equal(focusRing.visible, false, "nobody has the ball: no ring");
  assert.equal(shadow.visible, false, "a ball on the floor needs no shadow");
});

test("ball aids: the shot path is the given flight, ends at the rim, and clears", () => {
  const scene = new THREE.Scene();
  const aids = createBallAids(THREE, scene);
  const sample = (u) => ({ x: u * 10, y: 2 + Math.sin(Math.PI * u) * 1.3, z: -u * 5 });
  aids.setShot(sample, { x: 10, y: 3.05, z: -5 });
  const { trail, rimRing } = aids.parts;
  const pos = trail.geometry.getAttribute("position");
  assert.equal(pos.count, TRAIL_POINTS);
  assert.deepEqual([pos.getX(0), pos.getZ(0)], [0, -0], "starts at the shooter");
  assert.ok(Math.abs(pos.getX(TRAIL_POINTS - 1) - 10) < 1e-6 && Math.abs(pos.getZ(TRAIL_POINTS - 1) + 5) < 1e-6, "ends at the hoop");
  assert.ok(Math.max(...Array.from({ length: TRAIL_POINTS }, (_, i) => pos.getY(i))) > 3, "it arcs");
  assert.equal(trail.visible && rimRing.visible, true);
  assert.deepEqual([rimRing.position.x, rimRing.position.y, rimRing.position.z], [10, 3.05, -5]);
  aids.update({ now: 0, focus: null, ball: null, shot: 0 });
  const early = trail.material.opacity;
  aids.update({ now: 0, focus: null, ball: null, shot: 1 });
  assert.ok(trail.material.opacity < early, "the line fades as the ball arrives");
  aids.clearShot();
  assert.equal(trail.visible || rimRing.visible, false);
});

test("ball aids: dispose removes everything it added; a THREE-like without the classes gets null", () => {
  const scene = new THREE.Scene();
  const aids = createBallAids(THREE, scene);
  assert.equal(scene.children.length, 4);
  aids.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(createBallAids({ Mesh: class {} }, scene), null);
});
