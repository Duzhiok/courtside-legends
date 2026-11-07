/**
 * 3D avatar viewer (ADR-008a N-1f). Display only: it reads no game data and never touches GameSim or saves.
 * Three.js is loaded with a dynamic import() the first time a viewer mounts, so no other screen pays for it.
 * Any failure (no WebGL, 404, timeout) rejects; the caller keeps showing its static avatar.
 */
import { lookColors, sanitizeLook } from "../data/avatarLook.js";

const LIB_URL = new URL("../vendor/three-avatar.min.js", import.meta.url).href;
export const AVATAR_MODEL_URL = new URL("../../assets/avatar3d/man.glb", import.meta.url).href;
export const LOAD_TIMEOUT_MS = 4000;
const DRAG_RADIANS_PER_PX = 0.012;

/** True when the browser can create a WebGL context at all (checked on a throwaway canvas). */
export function webglAvailable(doc = document) {
  try {
    const canvas = doc.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

const withTimeout = (promise, ms, what) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)),
]);

function fitCamera(T, camera, model) {
  const box = new T.Box3().setFromObject(model);
  const size = box.getSize(new T.Vector3());
  const center = box.getCenter(new T.Vector3());
  model.position.sub(center);                       // centre the model on the pivot so it spins in place
  const dist = (size.y / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.25;
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
}

/**
 * Mount a rotatable idle avatar in `container` (it must have a size). Resolves with a handle once the first
 * frame is drawn; rejects (after cleaning up) if anything fails or takes longer than `timeoutMs`.
 */
export async function mountAvatar3d(container, { src = AVATAR_MODEL_URL, timeoutMs = LOAD_TIMEOUT_MS, look } = {}) {
  if (!webglAvailable(container.ownerDocument)) throw new Error("WebGL unavailable");
  const T = await withTimeout(import(LIB_URL), timeoutMs, "3D library");
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  const canvas = renderer.domElement;
  const state = { disposed: false, raf: 0, pivot: null, look: sanitizeLook(look) };
  let tick = () => {};                              // set once the scene exists; the visibility handler restarts it
  const cleanup = () => {
    state.disposed = true;
    cancelAnimationFrame(state.raf);
    document.removeEventListener("visibilitychange", onVisibility);
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    renderer.dispose();
    canvas.remove();
  };
  let resizeObserver = null;
  let visibilityObserver = null;
  const onVisibility = () => { if (!document.hidden && !state.disposed) { clock.getDelta(); tick(); } else cancelAnimationFrame(state.raf); };
  const clock = new T.Clock();
  try {
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(28, 1, 0.1, 100);
    scene.add(new T.HemisphereLight(0xffffff, 0x445566, 1.6));
    const key = new T.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    scene.add(key);

    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab";
    canvas.setAttribute("aria-hidden", "true");
    container.append(canvas);
    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(container);

    const gltf = await withTimeout(new T.GLTFLoader().loadAsync(src), timeoutMs, "model");
    const pivot = new T.Group();
    pivot.add(gltf.scene);
    fitCamera(T, camera, gltf.scene);
    scene.add(pivot);
    state.pivot = pivot;

    // Recolour by material name (Skin / Hair / Shirt / Pants). Materials are per-model, so no cloning is needed.
    const materials = {};
    gltf.scene.traverse((node) => { if (node.isMesh) [].concat(node.material).forEach((m) => { materials[m.name] = m; }); });
    const paint = (next) => {
      state.look = sanitizeLook(next);
      for (const [name, hex] of Object.entries(lookColors(state.look))) materials[name]?.color.set(hex);
      canvas.dataset.look = JSON.stringify(state.look); // read by QA / devtools to confirm what is actually painted
    };
    paint(state.look);

    const mixer = new T.AnimationMixer(gltf.scene);
    const idle = gltf.animations.find((clip) => /idle/i.test(clip.name)) || gltf.animations[0];
    if (idle) mixer.clipAction(idle).play();

    let dragX = null;
    canvas.addEventListener("pointerdown", (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
    canvas.addEventListener("pointermove", (e) => { if (dragX !== null) { pivot.rotation.y += (e.clientX - dragX) * DRAG_RADIANS_PER_PX; dragX = e.clientX; } });
    const endDrag = () => { dragX = null; canvas.style.cursor = "grab"; };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    tick = () => {
      if (state.disposed) return;
      mixer.update(clock.getDelta());
      renderer.render(scene, camera);
      state.raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Off-screen (another tab, closed panel, scrolled away) means no frames: the loop restarts when it returns.
    if (typeof IntersectionObserver === "function") {
      visibilityObserver = new IntersectionObserver(([entry]) => {
        cancelAnimationFrame(state.raf);
        if (entry.isIntersecting && !document.hidden && !state.disposed) { clock.getDelta(); tick(); }
      });
      visibilityObserver.observe(container);
    }
    state.paint = paint;
    tick();
  } catch (err) {
    cleanup();
    throw err;
  }
  return {
    canvas,
    rotationY: () => state.pivot.rotation.y,
    setLook: (next) => state.paint(next),
    look: () => ({ ...state.look }),
    dispose: cleanup,
  };
}
