/**
 * Avatar light rigs. "classic" is the production three-point rig; "studio" adds a warm bounce from the floor side and
 * a little ambient so the underside of the head/chin stops going muddy brown; All modes keep Neutral tone mapping.
 * A key-light shadow variant was tried and dropped: no visible gain, and it doubled the draw calls (21 -> 38). Pure scene setup, no
 * state, so the before/after comparison uses the same model, pose and camera.
 */
export const LIGHTING_MODES = Object.freeze(["classic", "studio"]);

export function addAvatarLights(T, scene, _renderer, mode = "classic") {
  const studio = mode !== "classic";
  // Studio: a warmer, brighter ground colour is what the downward-facing surfaces of the head pick up.
  scene.add(new T.HemisphereLight(0xdfe9ff, studio ? 0xd9b79b : 0x8a7766, studio ? 0.85 : 0.9));
  const key = new T.DirectionalLight(0xfff1de, 2.6);
  key.position.set(-2.2, 3.6, 4.2);
  const fill = new T.DirectionalLight(0xdbe8ff, 1.0);
  fill.position.set(3.2, 1.4, 3.0);
  const rim = new T.DirectionalLight(0xffffff, 1.6);
  rim.position.set(1.5, 3.0, -3.5);
  scene.add(key, fill, rim);
  if (studio) {
    const bounce = new T.DirectionalLight(0xffd9bd, 0.55);   // floor bounce, from low and in front
    bounce.position.set(0.5, -1.6, 3.4);
    scene.add(bounce, new T.AmbientLight(0xffffff, 0.12));
  }
}
