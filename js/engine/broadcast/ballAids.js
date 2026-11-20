/**
 * Ball readability aids (S4), presentation only:
 *   - a pulsing ring on the floor under whoever the presentation says has the ball (or is shooting it),
 *   - a soft shadow under the ball while it is in the air, so its height reads from the broadcast angle,
 *   - the planned shot path as a bright line from the shooter's hands to the hoop, and a ring on the rim it is flying to.
 *
 * It draws what it is told. The path comes from court3d's own flight formula (one source), and the focus is the id the
 * presentation named from GameSim's actor ids: nothing here decides a game fact. Returns null when the THREE-like lacks the
 * needed classes (the unit-test fake), so callers just skip it.
 */

export const TRAIL_POINTS = 28;
const RING_COLOR = 0xffd34d;
const TRAIL_COLOR = 0xffe08a;

export function createBallAids(T, scene) {
  if (!T?.RingGeometry || !T.CircleGeometry || !T.Line || !T.LineBasicMaterial || !T.BufferGeometry || !T.Float32BufferAttribute) return null;
  const flat = (mesh, y) => {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return mesh;
  };
  const glow = (color, opacity) => new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide });
  const focusRing = flat(new T.Mesh(new T.RingGeometry(0.55, 0.8, 32), glow(RING_COLOR, 0.92)), 0.045);
  const shadow = flat(new T.Mesh(new T.CircleGeometry(0.22, 18), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })), 0.03);
  const rimRing = flat(new T.Mesh(new T.RingGeometry(0.34, 0.5, 28), glow(0xffffff, 0.9)), 3.07);

  const positions = new Float32Array(TRAIL_POINTS * 3);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  const trail = new T.Line(geometry, new T.LineBasicMaterial({ color: TRAIL_COLOR, transparent: true, opacity: 0.85, depthWrite: false }));
  trail.visible = false;
  trail.frustumCulled = false;
  trail.renderOrder = 3;
  scene.add(trail);

  return {
    parts: { focusRing, shadow, rimRing, trail },
    /** The shot path: `sample(u)` -> {x,y,z} for u in 0..1 (court3d's own flight function). `rim` = {x,y,z}. */
    setShot(sample, rim) {
      const attr = geometry.getAttribute("position");
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const p = sample(i / (TRAIL_POINTS - 1));
        attr.setXYZ(i, p.x, p.y, p.z);
      }
      attr.needsUpdate = true;
      trail.visible = true;
      rimRing.position.set(rim.x, rim.y, rim.z);
      rimRing.visible = true;
    },
    clearShot() {
      trail.visible = false;
      rimRing.visible = false;
    },
    /**
     * @param focus {x,z}|null   where the ball handler / shooter stands
     * @param ball  {x,y,z,visible}|null
     * @param shot  progress 0..1 of a flight in the air, or null
     */
    update({ now, focus, ball, shot }) {
      if (focus) {
        focusRing.visible = true;
        focusRing.position.x = focus.x;
        focusRing.position.z = focus.z;
        focusRing.scale.setScalar(1 + 0.07 * Math.sin(now * 0.008));
      } else {
        focusRing.visible = false;
      }
      const airborne = !!ball?.visible && ball.y > 0.35;
      shadow.visible = airborne;
      if (airborne) {
        shadow.position.x = ball.x;
        shadow.position.z = ball.z;
        shadow.scale.setScalar(1 + ball.y * 0.12);
        shadow.material.opacity = 0.38 / (1 + ball.y * 0.35);
      }
      if (trail.visible && typeof shot === "number") {
        trail.material.opacity = 0.9 * (1 - 0.55 * shot);
        rimRing.scale.setScalar(1 + 0.12 * Math.sin(now * 0.014));
      }
    },
    dispose() {
      for (const o of [focusRing, shadow, rimRing, trail]) {
        scene.remove?.(o);
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      }
    },
  };
}
