/**
 * 3D avatar viewer (ADR-008a N-1f). Display only: it reads no game data and never touches GameSim or saves.
 * Three.js is loaded with a dynamic import() the first time a viewer mounts, so no other screen pays for it.
 * Any failure (no WebGL, 404, timeout) rejects; the caller keeps showing its static avatar.
 */
import { avatarModelFile, bodyBoneScales, lookColors, sanitizeLook } from "../data/avatarLook.js";

const LIB_URL = new URL("../vendor/three-avatar.min.js", import.meta.url).href;
/** Pure: the GLB URL for a look (see avatarModelFile). */
export const avatarModelUrl = (look) => new URL(`../../assets/avatar3d/${avatarModelFile(look)}`, import.meta.url).href;
/**
 * Pure: a bone name the way THREE.GLTFLoader stores it (PropertyBinding.sanitizeNodeName drops [ ] . : / and turns
 * spaces into _). The GLB says "UpperArm.L", the loaded scene says "UpperArmL": look bones up through this on both sides.
 */
export const boneKey = (name) => String(name).replace(/\s/g, "_").replace(/[[\].:/]/g, "");
export const LOAD_TIMEOUT_MS = 6000;
export const PORTRAIT_PX = 128;

/**
 * Creator preview actions (W3 slice): the model's own clips, wired as celebration / sitting actions.
 * `suffix` matches the clip name exactly at the end, so Man_Run never picks up Man_RunningJump.
 * `loop: false` means one-shot: it plays once and the figure returns to idle.
 */
export const AVATAR_ACTIONS = Object.freeze([
  { id: "clap", suffix: "Man_Clapping", zh: "鼓掌", en: "Cheer", loop: false },
  { id: "jump", suffix: "Man_Jump", zh: "跳跃", en: "Jump", loop: false },
  { id: "run", suffix: "Man_Run", zh: "跑步", en: "Run", loop: true },
  { id: "sit", suffix: "Man_Sitting", zh: "坐下", en: "Sit", loop: false },
]);

/** Pure: pick the clip for an action id from a list of clip names (or clip-like objects). Null when absent. */
export function findActionClip(clips, actionId) {
  const def = AVATAR_ACTIONS.find((a) => a.id === actionId);
  if (!def) return null;
  return (clips || []).find((c) => String(c?.name ?? c).endsWith(def.suffix)) || null;
}
// Head-and-shoulders framing as fractions of the model height (the figure is centred on the pivot).
const PORTRAIT_HEAD_DOWN = 0.085; // head centre, measured down from the top of the model
const PORTRAIT_FRAME = 0.27;      // visible height of the frame
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

/**
 * The prop (basketball) bone sits under the scaled arm chain. Overwrite its local matrix so its WORLD matrix keeps the
 * parent's position and rotation but unit scale: the ball follows the hand and never gets squashed by a build preset.
 */
const _pw = { m: null, q: null, p: null, s: null, one: null };
function keepPropUnscaled(T, prop) {
  if (!prop?.parent) return;
  // The vendored three bundle exports no Matrix4 / Quaternion, so borrow their constructors from live instances.
  const Matrix4 = prop.matrix.constructor;
  _pw.m ||= { parent: new Matrix4(), want: new Matrix4() };
  _pw.q ||= new (prop.quaternion.constructor)(); _pw.p ||= new T.Vector3(); _pw.s ||= new T.Vector3(); _pw.one ||= new T.Vector3(1, 1, 1);
  prop.parent.updateWorldMatrix(true, false);
  const { parent, want } = _pw.m;
  parent.copy(prop.parent.matrixWorld);
  // The rest offset of the prop from its parent (bone head to head), measured in the parent's unscaled frame.
  if (!prop.userData.rest) prop.userData.rest = prop.position.clone();
  parent.decompose(_pw.p, _pw.q, _pw.s);
  const offset = prop.userData.rest.clone().applyQuaternion(_pw.q);
  want.compose(_pw.p.clone().add(offset), _pw.q, _pw.one);
  prop.matrixAutoUpdate = false;
  prop.matrix.copy(parent.invert()).multiply(want);
  prop.matrixWorldNeedsUpdate = true;
}

function disposeTree(root) {
  root.traverse((node) => {
    node.geometry?.dispose?.();
    [].concat(node.material || []).forEach((mat) => mat.dispose?.());
  });
}

function fitCamera(T, camera, model) {
  const box = new T.Box3().setFromObject(model);
  const size = box.getSize(new T.Vector3());
  const center = box.getCenter(new T.Vector3());
  model.position.sub(center);                       // centre the model on the pivot so it spins in place
  const dist = (size.y / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.25;
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  return size.y;                                    // model height, for the head-and-shoulders portrait framing
}

/**
 * Mount a rotatable idle avatar in `container` (it must have a size). Resolves with a handle once the first
 * frame is drawn; rejects (after cleaning up) if anything fails or takes longer than `timeoutMs`.
 */
export async function mountAvatar3d(container, { src = null, timeoutMs = LOAD_TIMEOUT_MS, look } = {}) {
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

    const pivot = new T.Group();
    scene.add(pivot);
    state.pivot = pivot;
    // The loaded model. setLook() swaps it when the look needs another GLB (Stylized cut <-> cut, Stylized <-> Bobblehead).
    const m = { url: "", root: null, clips: [], materials: {}, bones: {}, mixer: null, idleAction: null, current: null };
    let actionToken = 0;
    let loadToken = 0;
    const loadModel = async (url) => {
      const token = ++loadToken;
      const gltf = await withTimeout(new T.GLTFLoader().loadAsync(url), timeoutMs, "model");
      if (state.disposed || token !== loadToken) { disposeTree(gltf.scene); return false; } // a newer look won the race
      if (m.root) { m.mixer?.stopAllAction(); pivot.remove(m.root); disposeTree(m.root); }
      pivot.scale.setScalar(1);                       // fit the camera on the unscaled model; applyBody rescales it
      pivot.add(gltf.scene);
      state.height = fitCamera(T, camera, gltf.scene);
      Object.assign(m, { url, root: gltf.scene, clips: gltf.animations, materials: {}, bones: {} });
      // Recolour by material name (Skin / Hair / Shirt / Pants / Trim). Materials are per-model, so no cloning is needed.
      gltf.scene.traverse((node) => {
        if (node.isBone || node.type === "Bone") m.bones[boneKey(node.name)] = node;
        if (node.isMesh) [].concat(node.material).forEach((mat) => { m.materials[mat.name] = mat; });
      });
      m.mixer = new T.AnimationMixer(gltf.scene);
      const idle = gltf.animations.find((clip) => /idle/i.test(clip.name)) || gltf.animations[0];
      m.idleAction = idle ? m.mixer.clipAction(idle) : null;
      m.idleAction?.play();
      m.current = m.idleAction;
      actionToken += 1;
      state.actionId = "idle";
      canvas.dataset.action = "idle";
      canvas.dataset.model = url.split("/").pop();    // read by QA / devtools: which GLB is on screen
      return true;
    };
    // Body preset + figure style: bone scales + overall height. The clips carry no scale tracks (verified from the GLB),
    // so a scale applied here is never overwritten by an animation. See FIGURE_STYLES for why the head scale is uniform.
    const applyBody = (look) => {
      const { height, bones: scales } = bodyBoneScales(look.body, look.figure);
      for (const [name, s] of Object.entries(scales)) m.bones[boneKey(name)]?.scale.set(s[0], s[1], s[2]);
      pivot.scale.setScalar(height);
      state.heightScale = height;
    };
    const paint = (next) => {
      state.look = sanitizeLook(next);
      for (const [name, hex] of Object.entries(lookColors(state.look))) m.materials[name]?.color.set(hex);
      // Hair stays visible for every style: "shaved" is a skin-coloured scalp (see lookColors), because that mesh is the skull cap.
      applyBody(state.look);
      canvas.dataset.look = JSON.stringify(state.look); // read by QA / devtools to confirm what is actually painted
    };
    // An explicit `src` pins one model (tests, spikes); otherwise the look picks it.
    const urlFor = (look) => src || avatarModelUrl(look);
    const setLook = async (next) => {
      const look = sanitizeLook(next);
      state.look = look;
      const url = urlFor(look);
      if (url !== m.url) {
        try { await loadModel(url); } catch { /* keep the model on screen; the colours below still apply */ }
      }
      if (state.look === look) paint(look);          // a later setLook() owns the paint if it came in meanwhile
    };
    await loadModel(urlFor(state.look));
    paint(state.look);

    const playIdle = () => {
      actionToken += 1;
      if (m.current && m.current !== m.idleAction) m.current.fadeOut(0.25);
      if (m.idleAction) { m.idleAction.reset().fadeIn(0.25).play(); m.current = m.idleAction; }
      state.actionId = "idle";
      canvas.dataset.action = "idle";
      return true;
    };
    const playAction = (id) => {
      const clip = findActionClip(m.clips, id);
      const def = AVATAR_ACTIONS.find((a) => a.id === id);
      if (!clip || !def) return false;
      const token = ++actionToken;
      const { mixer } = m;
      const next = mixer.clipAction(clip);
      next.reset();
      next.setLoop(def.loop ? T.LoopRepeat : T.LoopOnce, Infinity);
      next.clampWhenFinished = !def.loop;
      if (m.current && m.current !== next) m.current.fadeOut(0.25);
      next.fadeIn(0.25).play();
      m.current = next;
      state.actionId = id;
      canvas.dataset.action = id;
      if (!def.loop) {
        const onFinished = (e) => {
          if (e.action !== next || token !== actionToken) return;
          mixer.removeEventListener("finished", onFinished);
          if (!state.disposed && state.actionId === id) playIdle();
        };
        mixer.addEventListener("finished", onFinished);
      }
      return true;
    };

    let dragX = null;
    canvas.addEventListener("pointerdown", (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
    canvas.addEventListener("pointermove", (e) => { if (dragX !== null) { pivot.rotation.y += (e.clientX - dragX) * DRAG_RADIANS_PER_PX; dragX = e.clientX; } });
    const endDrag = () => { dragX = null; canvas.style.cursor = "grab"; };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    tick = () => {
      if (state.disposed) return;
      m.mixer?.update(clock.getDelta());
      keepPropUnscaled(T, m.bones.Prop);
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
    state.setLook = setLook;
    state.playAction = playAction;
    state.playIdle = playIdle;
    state.actionId = "idle";
    canvas.dataset.action = "idle";
    // Render one head-and-shoulders frame straight to a JPEG data URL. Rendering and reading happen in the same task,
    // so the WebGL buffer is still valid and `preserveDrawingBuffer` (a permanent perf cost) is not needed.
    state.capture = (bg = "#1f6b45") => {
      const saved = { pos: camera.position.clone(), aspect: camera.aspect, rot: state.pivot.rotation.y };
      try {
        const height = state.height * (state.heightScale || 1); // the body preset's overall scale moves the head
        const headY = height / 2 - height * PORTRAIT_HEAD_DOWN;
        const dist = (height * PORTRAIT_FRAME) / 2 / Math.tan((camera.fov * Math.PI) / 360);
        state.pivot.rotation.y = 0;
        camera.aspect = 1;
        camera.position.set(0, headY, dist);
        camera.lookAt(0, headY, 0);
        camera.updateProjectionMatrix();
        renderer.setSize(PORTRAIT_PX, PORTRAIT_PX, false);
        renderer.render(scene, camera);
        const out = document.createElement("canvas");
        out.width = out.height = PORTRAIT_PX;
        const ctx = out.getContext("2d");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
        ctx.drawImage(canvas, 0, 0, PORTRAIT_PX, PORTRAIT_PX);
        return out.toDataURL("image/jpeg", 0.82);
      } catch {
        return null;
      } finally {
        camera.position.copy(saved.pos);
        camera.aspect = saved.aspect;
        camera.lookAt(0, 0, 0);
        state.pivot.rotation.y = saved.rot;
        resize();                                   // restores the on-screen canvas size and projection
      }
    };
    tick();
  } catch (err) {
    cleanup();
    throw err;
  }
  return {
    canvas,
    rotationY: () => state.pivot.rotation.y,
    /** Recolour / rescale, and swap the GLB when the look needs another model. Resolves once painted. */
    setLook: (next) => state.setLook(next),
    /** @returns {string|null} a small JPEG data URL of the head and shoulders, or null if it could not be drawn */
    capturePortrait: (bg) => state.capture(bg),
    look: () => ({ ...state.look }),
    /** Play a preview action (clap/jump/run/sit); one-shots return to idle on their own. False when unknown. */
    playAction: (id) => state.playAction?.(id) ?? false,
    /** Back to the idle pose. */
    playIdle: () => state.playIdle?.() ?? false,
    /** Current preview action id, or "idle". */
    action: () => state.actionId || "idle",
    dispose: cleanup,
  };
}
