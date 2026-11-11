/**
 * The showcase floor under the figure: a dark platform, a glowing disc, a thin gold rim and a soft contact shadow, so the
 * character stands on something instead of floating in the page. Opt-in (`stage: true`) because only My World's hero wants it.
 * One unit-sized group, scaled to the figure's height by `place()`; hidden while a profile picture is captured.
 */
const RIM_GOLD = 0xf2cf7a;
const DISC_GREEN = 0x2f9a68;
const TOP = 0.03; // local height of the platform's top face

function shadowTexture(T) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

export function createStage(T) {
  const group = new T.Group();
  group.name = "ShowcaseStage";
  const flat = (geo, mat, y) => {
    const mesh = new T.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    return mesh;
  };
  const platform = new T.Mesh(new T.CylinderGeometry(1, 1.04, 0.06, 72), new T.MeshStandardMaterial({ color: 0x10241b, metalness: 0.55, roughness: 0.38 }));
  const disc = flat(new T.CircleGeometry(0.94, 64), new T.MeshBasicMaterial({ color: DISC_GREEN, transparent: true, opacity: 0.38, depthWrite: false }), TOP + 0.002);
  const rim = flat(new T.TorusGeometry(0.98, 0.018, 10, 96), new T.MeshBasicMaterial({ color: RIM_GOLD }), TOP);
  rim.rotation.x = Math.PI / 2;
  const shadow = flat(new T.PlaneGeometry(1.6, 1.6), new T.MeshBasicMaterial({ map: shadowTexture(T), transparent: true, depthWrite: false }), TOP + 0.004);
  group.add(platform, disc, rim, shadow);
  return {
    group,
    /** Put the platform's top face at the feet of a figure `height` tall that is centred on the origin. */
    place(height) {
      const r = height * 0.3;
      group.scale.setScalar(r);
      group.position.y = -height / 2 - TOP * r;
    },
    dispose() {
      group.traverse((n) => {
        n.geometry?.dispose?.();
        [].concat(n.material || []).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      });
    },
  };
}
