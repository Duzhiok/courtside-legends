// A3: the arena reacts to real events only, on the presentation clock. Sound cues are pure + rate-limited; the stands and the
// scoring side's bench hop on a made basket and settle back; nothing here touches the game.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../js/vendor/three.module.js";
import { ARENA_PRESETS } from "../js/engine/arena/arenaPresets.js";
import { instancedPeople } from "../js/engine/arena/arenaCrowd.js";
import { courtsidePeople } from "../js/engine/arena/arenaCourtside.js";
import { ROAR_GAP_MS, WHISTLE_GAP_MS, createArenaCues } from "../js/match/presentation/arenaCues.js";

const recorder = () => {
  const calls = [];
  const sfx = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
  return { calls, sfx };
};

test("cues: a miss is silent; a make is a swish and a roar, bigger for a three or a dunk", () => {
  const { calls, sfx } = recorder();
  let t = 0;
  const cues = createArenaCues({ sfx, now: () => t });
  cues.shotLanded({ made: false, pts: 2 });
  assert.deepEqual(calls, [], "a miss makes no cheer");
  cues.shotLanded({ made: true, pts: 2 });
  assert.deepEqual(calls, [["swish"], ["roar", 0.8]]);
  t += ROAR_GAP_MS;
  cues.shotLanded({ made: true, pts: 3 });
  assert.deepEqual(calls.slice(2), [["swish"], ["roar", 1.3]]);
  t += ROAR_GAP_MS;
  cues.shotLanded({ made: true, pts: 2, dunk: true });
  assert.equal(calls.at(-1)[1], 1.3, "a dunk roars like a three");
});

test("cues: at 2x/3x the roars do not stack (the swish still plays), and the whistle is limited too", () => {
  const { calls, sfx } = recorder();
  let t = 0;
  const cues = createArenaCues({ sfx, now: () => t });
  cues.shotLanded({ made: true, pts: 2 });
  t += 200;
  cues.shotLanded({ made: true, pts: 2 });
  assert.equal(calls.filter((c) => c[0] === "roar").length, 1);
  assert.equal(calls.filter((c) => c[0] === "swish").length, 2);
  cues.foul();
  t += WHISTLE_GAP_MS - 1;
  cues.foul();
  t += 2;
  cues.foul();
  assert.equal(calls.filter((c) => c[0] === "whistle").length, 2);
  assert.doesNotThrow(() => createArenaCues({ sfx: null }).shotLanded({ made: true }), "no audio: a safe no-op");
});

// —— the stands ——
const preset = ARENA_PRESETS.modern;
const people = [
  { x: 0, y: 0, z: 0, body: 0xffffff, skin: 0xffffff, bob: true, cheer: true }, // a spectator
  { x: 1, y: 0, z: 0, body: 0xffffff, skin: 0xffffff, cheer: true, side: "home" }, // home bench
  { x: 2, y: 0, z: 0, body: 0xffffff, skin: 0xffffff, cheer: true, side: "away" }, // away bench
  { x: 3, y: 0, z: 0, body: 0xffffff, skin: 0xffffff, standing: true }, // a coach: never hops
];
const bodyY = (mesh, i) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return new THREE.Vector3().setFromMatrixPosition(m).y; };
const meshes = (g) => g.children.filter((c) => c.isInstancedMesh);

test("a cheer lifts the stands and the scoring side's bench, not the other bench or the coach, then settles back", () => {
  const crowd = instancedPeople(THREE, people);
  const [bodies] = meshes(crowd.group);
  const rest = [0, 1, 2, 3].map((i) => bodyY(bodies, i));
  crowd.cheer(1, "home", 0);
  let peak = [0, 0, 0, 0];
  for (let now = 50; now < 1100; now += 50) {
    crowd.update(now);
    peak = peak.map((p, i) => Math.max(p, bodyY(bodies, i) - rest[i]));
  }
  assert.ok(peak[0] > 0.05, "a spectator hopped");
  assert.ok(peak[1] > peak[0], "the scoring bench jumps higher than the stands");
  assert.equal(peak[2], 0, "the other side's bench stays seated");
  assert.equal(peak[3], 0, "the coach never hops");
  crowd.update(1200);
  crowd.update(1300);
  [0, 1, 2, 3].forEach((i) => assert.ok(Math.abs(bodyY(bodies, i) - rest[i]) < 1e-6, `person ${i} is back on the seat`));
});

test("a cheer is deterministic, and with nobody flagged to cheer it is a no-op", () => {
  const run = () => {
    const c = instancedPeople(THREE, people);
    c.cheer(1.3, "away", 0);
    c.update(300);
    return Array.from(meshes(c.group)[0].instanceMatrix.array);
  };
  assert.deepEqual(run(), run());
  const quiet = instancedPeople(THREE, [{ x: 0, y: 0, z: 0, body: 1, skin: 1 }]);
  assert.doesNotThrow(() => { quiet.cheer(1, "home", 0); quiet.update(100); });
});

test("the real bench people are flagged for their own side only; officials and coaches are not", () => {
  const side = courtsidePeople(preset, { home: 0x112233, away: 0x445566 });
  const hoppers = side.filter((p) => p.cheer);
  assert.equal(hoppers.length, 20, "ten players on each bench");
  assert.ok(hoppers.every((p) => p.side === "home" || p.side === "away"));
  assert.equal(hoppers.filter((p) => p.side === "home").length, 10);
});
