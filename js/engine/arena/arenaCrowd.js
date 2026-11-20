/**
 * People for the venue (spectators, bench players, coaches, officials): low-poly bodies + heads drawn as TWO InstancedMeshes,
 * whatever the head count. Colours are per-instance (instanceColor), poses are static except a slow idle bob on the heads of
 * anyone flagged `bob`. Deterministic: the same preset + quality always seats the same crowd.
 */
import { hashSeed, seededStream } from "../../core/seededRandom.js";
import { onCourt } from "./arenaLayout.js";

const SEATED_LIFT = 0.2; // torso starts this far above the tread
const HEAD_R = 0.13;
const BOB_AMPLITUDE = 0.035;
const BOB_PERIOD_MS = 620;
const BOB_STEP_MS = 100;

/**
 * @param people [{ x, y, z, body, skin, bodyH?, standing?, bob? }]  y is the tread/floor the person stands or sits on
 * @returns { group, count, update(now) }
 */
export function instancedPeople(T, people) {
  const group = new T.Group();
  const n = people.length;
  const bodyGeo = new T.CylinderGeometry(0.2, 0.24, 1, 6);
  const headGeo = T.IcosahedronGeometry ? new T.IcosahedronGeometry(HEAD_R, 0) : new T.SphereGeometry(HEAD_R, 6, 4);
  const bodies = new T.InstancedMesh(bodyGeo, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), n);
  const heads = new T.InstancedMesh(headGeo, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), n);
  const dummy = new T.Object3D();
  const col = new T.Color();
  const headY = new Float32Array(n);
  people.forEach((p, i) => {
    const h = p.bodyH ?? 0.62;
    const base = p.y + (p.standing ? 0 : SEATED_LIFT);
    dummy.position.set(p.x, base + h / 2, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, col.set(p.body));
    headY[i] = base + h + HEAD_R * 0.9;
    dummy.position.set(p.x, headY[i], p.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, col.set(p.skin));
  });
  for (const m of [bodies, heads]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    group.add(m);
  }
  const movers = people.map((p, i) => (p.bob ? i : -1)).filter((i) => i >= 0);
  let last = -Infinity;
  return {
    group,
    count: n,
    update(now) {
      if (!movers.length || now - last < BOB_STEP_MS) return;
      last = now;
      for (const i of movers) {
        const p = people[i];
        const phase = (i * 2.399) % (Math.PI * 2); // golden-angle spread: neighbours never bob together
        dummy.position.set(p.x, headY[i] + (0.5 + 0.5 * Math.sin(now / BOB_PERIOD_MS + phase)) * BOB_AMPLITUDE, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
      }
      heads.instanceMatrix.needsUpdate = true;
    },
  };
}

/** The crowd: a deterministic share (`density`) of the stand seats, never one on the playing floor. */
export function crowdPeople(seats, preset, density) {
  const rnd = seededStream(hashSeed(`arena-crowd:${preset.id}`));
  const { palette, skin } = preset.crowd;
  const people = [];
  for (const s of seats) {
    const pick = rnd(); // always consume, so a thinner crowd is a subset of a fuller one
    const tone = rnd();
    const tint = rnd();
    if (pick >= density || onCourt(s.x, s.z, 0.5)) continue;
    people.push({
      x: s.x, y: s.y, z: s.z,
      body: palette[Math.floor(tint * palette.length) % palette.length],
      skin: skin[Math.floor(tone * skin.length) % skin.length],
      bodyH: 0.56 + tone * 0.12,
      bob: true,
    });
  }
  return people;
}
