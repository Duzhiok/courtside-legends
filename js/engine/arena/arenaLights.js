/**
 * Arena lighting presets: "warm" (hardwood-and-tungsten) and "broadcast" (cool white, strong key). One hemisphere + one key light
 * + a small ambient fill. Constructors are looked up defensively so a minimal THREE-like (tests) just gets what it has.
 * No shadow maps: they cost draw calls and the figures are blob-simple (see the Phase 2 avatar-lighting measurement).
 */

const RIGS = {
  warm: { ambient: [0xfff1dc, 0.7], hemi: [0xfff4e0, 0x3a2a1a, 0.55], key: [0xffe8c8, 1.5, [8, 14, 6]] },
  broadcast: { ambient: [0xe8f0ff, 0.55], hemi: [0xf2f6ff, 0x1a2230, 0.7], key: [0xffffff, 1.9, [6, 16, 4]] },
};

export function addArenaLights(T, scene, lighting = "warm") {
  const rig = RIGS[lighting] || RIGS.warm;
  const key = new T.DirectionalLight(rig.key[0], rig.key[1]);
  key.position.set(...rig.key[2]);
  scene.add(key);
  scene.add(new T.AmbientLight(rig.ambient[0], rig.ambient[1]));
  if (T.HemisphereLight) scene.add(new T.HemisphereLight(rig.hemi[0], rig.hemi[1], rig.hemi[2]));
  return { key };
}
