import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../js/vendor/three.module.js";
import { ARENA_IDS, ARENA_PRESETS, QUALITY_PROFILES } from "../js/engine/arena/arenaPresets.js";
import { COURTSIDE, FLOOR_HALF_L, FLOOR_HALF_W, SECTIONS, STEP_RISE, buildStands, onCourt, rowGeometry } from "../js/engine/arena/arenaLayout.js";
import { crowdPeople } from "../js/engine/arena/arenaCrowd.js";
import { buildArenaEnvironment } from "../js/engine/arena/arenaEnvironment.js";
import { clockText, drawScoreboard, periodText, scoreboardState } from "../js/engine/arena/arenaScreens.js";

const preset = ARENA_PRESETS.classic;
const { steps, seats } = buildStands();

// The desktop broadcast camera: high on the +x side looking at the court centre (see court3d._layoutCamera / fitCameraDistance).
const sightlineY = (x) => 0.6 + (8.9 / 18) * x;

test("no spectator seat is on, or touching, the playing floor", () => {
  assert.ok(seats.length > 2000, `${seats.length} seats`);
  for (const s of seats) assert.equal(onCourt(s.x, s.z, 0.5), false, `${s.section} row ${s.row} at ${s.x.toFixed(1)},${s.z.toFixed(1)}`);
  for (const st of steps) { // the stand blocks themselves too
    const nearestX = Math.max(0, Math.min(Math.abs(st.x) - st.sx / 2, 99));
    const nearestZ = Math.max(0, Math.min(Math.abs(st.z) - st.sz / 2, 99));
    const crosses = (st.x - st.sx / 2 < FLOOR_HALF_W && st.x + st.sx / 2 > -FLOOR_HALF_W) && (st.z - st.sz / 2 < FLOOR_HALF_L && st.z + st.sz / 2 > -FLOOR_HALF_L);
    assert.equal(crosses, false, `${st.section} row ${st.row} overlaps the floor (${nearestX}, ${nearestZ})`);
  }
});

test("every stand rises row by row, the walkway is wider, and seats sit on their step's tread", () => {
  for (const sec of SECTIONS) {
    const rows = steps.filter((s) => s.section === sec.id).sort((a, b) => a.row - b.row);
    assert.equal(rows.length, sec.rows);
    for (let r = 1; r < rows.length; r++) assert.ok(rows[r].sy > rows[r - 1].sy, `${sec.id} climbs`);
    if (sec.rows > 7) {
      const jump = rowGeometry(sec, 7).top - rowGeometry(sec, 6).top;
      assert.ok(jump > STEP_RISE, `${sec.id}: a walkway between the bowls`);
    }
  }
  for (const s of seats.slice(0, 400)) assert.ok(Math.abs(s.y - rowGeometry(SECTIONS.find((q) => q.id === s.section), s.row).top) < 1e-9);
});

test("the low near-side stand stays below the camera's sightline: it can never hide the court", () => {
  for (const s of seats.filter((q) => q.section === "near")) assert.ok(s.y + 1.2 < sightlineY(s.x), `near row ${s.row}: head ${(s.y + 1.2).toFixed(1)} vs sightline ${sightlineY(s.x).toFixed(1)}`);
});

test("benches and the scorer's table are beside the floor on the far side, clear of the stands", () => {
  const farStart = SECTIONS.find((s) => s.id === "far").start;
  assert.ok(COURTSIDE.benchX < -FLOOR_HALF_W && COURTSIDE.benchX > -farStart);
  assert.ok(COURTSIDE.tableX < -FLOOR_HALF_W + 0.5 && COURTSIDE.tableX > -farStart);
  const [a, b] = COURTSIDE.benches;
  assert.ok(a.z + a.halfLen < -COURTSIDE.tableHalfLen && b.z - b.halfLen > COURTSIDE.tableHalfLen, "benches do not overlap the table");
});

test("crowd: deterministic, never on the court, a thin crowd is a subset of a full one, and it follows the density", () => {
  const full = crowdPeople(seats, preset, 1);
  const again = crowdPeople(seats, preset, 1);
  assert.deepEqual(again, full);
  const thin = crowdPeople(seats, preset, QUALITY_PROFILES.low.crowd);
  const key = (p) => `${p.x}|${p.y}|${p.z}`;
  const fullKeys = new Set(full.map(key));
  assert.ok(thin.every((p) => fullKeys.has(key(p))), "Low shows the same people as High, just fewer");
  assert.ok(Math.abs(thin.length / full.length - QUALITY_PROFILES.low.crowd) < 0.05, `${thin.length}/${full.length}`);
  assert.ok(full.every((p) => !onCourt(p.x, p.z, 0.5)));
  const palette = new Set([...preset.crowd.palette]);
  assert.ok(full.every((p) => palette.has(p.body)), "only the preset's colours");
  assert.notDeepEqual(crowdPeople(seats, ARENA_PRESETS.modern, 1).slice(0, 50), full.slice(0, 50), "each arena has its own crowd");
});

function build(profileId, arenaId = "classic", doc = null) {
  const scene = new THREE.Scene();
  const env = buildArenaEnvironment(THREE, scene, ARENA_PRESETS[arenaId], QUALITY_PROFILES[profileId], { doc });
  return { scene, env };
}
const drawables = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; };
const triangles = (root) => { let t = 0; root.traverse((o) => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); }); return t; };

test("draw-call budget: the whole venue is a handful of meshes, at every quality and in every arena", () => {
  for (const arena of ARENA_IDS) for (const q of ["low", "medium", "high"]) {
    const { env } = build(q, arena);
    const calls = drawables(env.group);
    assert.ok(calls <= 14, `${arena}/${q}: ${calls} drawables`);
  }
});

test("triangle budget: Low fits the phone target (100K for the whole scene), High the desktop one, and quality only thins the crowd", () => {
  const low = build("low");
  const high = build("high");
  assert.ok(triangles(low.env.group) < 60000, `low venue ${Math.round(triangles(low.env.group))} triangles`);
  assert.ok(triangles(high.env.group) < 200000, `high venue ${Math.round(triangles(high.env.group))} triangles`);
  assert.ok(low.env.spectators < high.env.spectators / 2);
  assert.ok(low.env.spectators > 300, "Low is still a crowd");
});

test("without InstancedMesh (a minimal THREE) the venue is simply absent, never an error", () => {
  const { InstancedMesh, ...noInstancing } = THREE;
  void InstancedMesh;
  assert.equal(buildArenaEnvironment(noInstancing, new THREE.Scene(), preset, QUALITY_PROFILES.high), null);
});

test("the crowd idles on the clock: heads move between 100 ms steps, and not at all faster than that", () => {
  const { env } = build("medium");
  const heads = [...env.group.children].find((c) => c.children?.length === 2).children[1];
  const before = heads.instanceMatrix.array.slice(0, 16 * 40);
  env.update(1000);
  const a = heads.instanceMatrix.array.slice(0, 16 * 40);
  env.update(1050); // inside the 100 ms step: untouched
  const b = heads.instanceMatrix.array.slice(0, 16 * 40);
  env.update(1400);
  const c = heads.instanceMatrix.array.slice(0, 16 * 40);
  assert.notDeepEqual([...a], [...before]);
  assert.deepEqual([...b], [...a]);
  assert.notDeepEqual([...c], [...b]);
});

test("dispose frees the venue and detaches it; the scene is left empty", () => {
  const { scene, env } = build("low");
  assert.equal(scene.children.length, 1);
  env.dispose();
  assert.equal(scene.children.length, 0);
});

test("scoreboard text is read from the snapshot only", () => {
  assert.equal(clockText(754), "12:34");
  assert.equal(clockText(59.94), "59.9");
  assert.equal(clockText(-3), "0.0");
  assert.equal(periodText(1), "Q1");
  assert.equal(periodText(4), "Q4");
  assert.equal(periodText(5), "OT");
  assert.equal(periodText(6), "2OT");
  assert.equal(scoreboardState(null), null, "no snapshot, no numbers");
  const s = scoreboardState({ quarter: 3, clock: 461, score: { home: 71, away: 68 }, home: { name: "Chicago" }, away: { abbr: "sea" } });
  assert.deepEqual(s, { home: "CHIC", away: "SEA", hs: 71, as: 68, period: "Q3", clock: "7:41" });
});

test("the board draws the score, clock and period; the scoreboard redraws only when something changed, and survives a broken canvas", () => {
  const texts = [];
  const ctx = new Proxy({}, { get: (t, k) => (k === "fillText" ? (s) => texts.push(String(s)) : t[k] ?? (() => {})), set: (t, k, v) => { t[k] = v; return true; } });
  drawScoreboard(ctx, preset, { home: "CHI", away: "SEA", hs: 71, as: 68, period: "Q3", clock: "7:41" }, 512, 256);
  for (const want of ["71", "68", "7:41", "Q3", "CHI", "SEA"]) assert.ok(texts.includes(want), `board shows ${want}`);

  let draws = 0;
  const canvasCtx = new Proxy({}, { get: (t, k) => (k === "fillText" ? () => { draws++; } : t[k] ?? (() => {})), set: (t, k, v) => { t[k] = v; return true; } });
  const doc = { createElement: () => ({ getContext: () => canvasCtx }) };
  const { env } = build("low", "modern", doc);
  const snap = { quarter: 1, clock: 700, score: { home: 2, away: 0 }, home: { name: "A" }, away: { name: "B" } };
  const base = draws;
  env.setSnapshot(snap);
  const first = draws - base;
  assert.ok(first > 0, "a new state is drawn");
  env.setSnapshot({ ...snap });
  assert.equal(draws - base, first, "the same state is not redrawn");
  env.setSnapshot({ ...snap, score: { home: 4, away: 0 } });
  assert.ok(draws - base > first, "a changed score is");
  assert.doesNotThrow(() => build("low", "classic", { createElement: () => ({ getContext: () => ({}) }) }), "a half-implemented canvas never breaks the venue");
});
