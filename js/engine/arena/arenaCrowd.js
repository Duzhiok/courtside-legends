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
const CHEER_MS = 1100; // a made basket: the stand hops up and down three times, then settles
const CHEER_HOPS = 3;
const CHEER_LIFT_M = 0.3;
const CHEER_STEP_MS = 50;

/**
 * @param people [{ x, y, z, body, skin, bodyH?, standing?, bob?, cheer?, side? }]  y is the tread/floor the person stands or sits on.
 *   `cheer` people hop when `cheer(level, side, now)` is called; one with a `side` only does for that side's baskets (a bench).
 * @returns { group, count, update(now), cheer(level, side, now) }
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
  const hoppers = people.map((p, i) => (p.cheer ? i : -1)).filter((i) => i >= 0);
  const restY = people.map((p) => p.y + (p.standing ? 0 : SEATED_LIFT));
  const phase = (i) => (i * 2.399) % (Math.PI * 2); // golden-angle spread: neighbours never move together
  let last = -Infinity;
  let cheering = null; // { start, level, side }
  let hopped = false; // somebody is currently off their seat: one more pass puts everyone back

  /** Everything about person i at `now`: idle bob on the head, plus the hop (whole body) while a cheer is on. */
  const place = (i, now, lift, withBody) => {
    const p = people[i];
    const h = p.bodyH ?? 0.62;
    dummy.rotation.set(0, 0, 0);
    if (withBody) { // only while hopping: an idle bob moves heads alone
      dummy.position.set(p.x, restY[i] + lift + h / 2, p.z);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
    }
    const bob = p.bob ? (0.5 + 0.5 * Math.sin(now / BOB_PERIOD_MS + phase(i))) * BOB_AMPLITUDE : 0;
    dummy.position.set(p.x, headY[i] + lift + bob, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  };
  const hopFor = (i, now) => {
    const p = people[i];
    if (!cheering || (p.side && p.side !== cheering.side)) return 0;
    const t = (now - cheering.start) / CHEER_MS;
    const up = Math.max(0, Math.sin((t * CHEER_HOPS + phase(i) / (Math.PI * 2) * 0.5) * Math.PI * 2)); // each person is a little out of step
    return up * Math.sin(Math.PI * t) * CHEER_LIFT_M * cheering.level * (p.side ? 1.6 : 1); // a bench jumps higher than the stands
  };
  const flush = (withBody) => {
    heads.instanceMatrix.needsUpdate = true;
    if (withBody) bodies.instanceMatrix.needsUpdate = true;
  };

  return {
    group,
    count: n,
    cheer(level, side, now) {
      if (hoppers.length) cheering = { start: now, level, side };
    },
    update(now) {
      if (cheering && now - cheering.start >= CHEER_MS) {
        cheering = null;
        hopped = true; // fall through: one pass with no lift sets everybody back on their seat
      }
      const active = !!cheering || hopped;
      if (!active && !movers.length) return;
      if (now - last < (active ? CHEER_STEP_MS : BOB_STEP_MS)) return;
      last = now;
      const touched = new Set(movers);
      if (active) hoppers.forEach((i) => touched.add(i));
      for (const i of touched) place(i, now, active ? hopFor(i, now) : 0, active);
      flush(active);
      hopped = !!cheering;
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
      cheer: true,
    });
  }
  return people;
}
