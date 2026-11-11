/**
 * 3D avatar viewer (ADR-008a N-1f). Display only: it reads no game data and never touches GameSim or saves.
 * Three.js is loaded with a dynamic import() the first time a viewer mounts, so no other screen pays for it.
 * Any failure (no WebGL, 404, timeout) rejects; the caller keeps showing its static avatar.
 */
import { avatarModelFile, bodyBoneScales, lookColors, sanitizeLook } from "../data/avatarLook.js";
import { AVATAR_ACTIONS, findActionClip, findExitClip, holdsPose } from "./avatarActions.js";

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

export { AVATAR_ACTIONS, findActionClip } from "./avatarActions.js";
// Head-and-shoulders framing as fractions of the model height (the figure is centred on the pivot).
const PORTRAIT_HEAD_DOWN = 0.085; // head centre, measured down from the top of the model
const PORTRAIT_FRAME = 0.27;      // visible height of the frame
const DRAG_RADIANS_PER_PX = 0.012;
export const DEFAULT_YAW = -0.5;     // three-quarter turn toward the ball hand; drag still spins freely
const FRAME_PAD = 1.16;               // camera distance as a multiple of "model height fills the view"
const ZOOM_LERP = 4;                 // 1/s: how fast the camera eases between idle framing and an action's framing

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
  const dist = (size.y / 2) / Math.tan((camera.fov * Math.PI) / 360) * FRAME_PAD;
  camera.userData.baseDist = dist;
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
    // Three-point light: a warm key high and in front (so the face and eyes read), a cool fill from the other side to lift
    // the shadow, a rim from behind for the silhouette, and a sky/ground hemisphere so no surface goes flat black.
    scene.add(new T.HemisphereLight(0xdfe9ff, 0x8a7766, 0.9));
    const key = new T.DirectionalLight(0xfff1de, 2.6);
    key.position.set(-2.2, 3.6, 4.2);
    const fill = new T.DirectionalLight(0xdbe8ff, 1.0);
    fill.position.set(3.2, 1.4, 3.0);
    const rim = new T.DirectionalLight(0xffffff, 1.6);
    rim.position.set(1.5, 3.0, -3.5);
    scene.add(key, fill, rim);

    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = 7;                     // THREE.NeutralToneMapping (r162+): true colours, no highlight clipping
    renderer.toneMappingExposure = 1.05;
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
    pivot.rotation.y = DEFAULT_YAW;
    // The loaded model. setLook() swaps it when the look needs another GLB (Stylized cut <-> cut, Stylized <-> Bobblehead).
    const m = { url: "", root: null, clips: [], materials: {}, bones: {}, mixer: null, idleAction: null, current: null,
                props: [], seat: null, loadMs: 0 };
    let actionToken = 0;
    let loadToken = 0;
    const loadModel = async (url) => {
      const token = ++loadToken;
      const t0 = performance.now();
      const gltf = await withTimeout(new T.GLTFLoader().loadAsync(url), timeoutMs, "model");
      if (state.disposed || token !== loadToken) { disposeTree(gltf.scene); return false; } // a newer look won the race
      if (m.root) { m.mixer?.stopAllAction(); pivot.remove(m.root); disposeTree(m.root); }
      pivot.scale.setScalar(1);                       // fit the camera on the unscaled model; applyBody rescales it
      // Body presets scale bones, so no clip may write a scale track (the exporter bakes constant ones): drop them all.
      gltf.animations.forEach((clip) => { clip.tracks = clip.tracks.filter((t) => !t.name.endsWith(".scale")); });
      Object.assign(m, { url, root: gltf.scene, clips: gltf.animations, materials: {}, bones: {}, props: [], seat: null });
      // Recolour by material name (Skin / Hair / Shirt / Pants / Trim). Materials are per-model, so no cloning is needed.
      gltf.scene.traverse((node) => {
        if (node.isBone || node.type === "Bone") m.bones[boneKey(node.name)] = node;
        if (node.isMesh) [].concat(node.material).forEach((mat) => { m.materials[mat.name] = mat; });
        if (node.isMesh && node.name.startsWith("Prop_")) (node.name.startsWith("Prop_Stool") ? (m.seat = node) : m.props.push(node));
      });
      // The stool is out of the framing (and hidden) until a Sit action needs it: fit the camera without it.
      const seatParent = m.seat?.parent;
      m.seat?.removeFromParent();
      pivot.add(gltf.scene);
      state.height = fitCamera(T, camera, gltf.scene);
      if (m.seat) { seatParent.add(m.seat); m.seat.visible = false; }
      m.mixer = new T.AnimationMixer(gltf.scene);
      const idle = gltf.animations.find((clip) => /idle/i.test(clip.name)) || gltf.animations[0];
      m.idleAction = idle ? m.mixer.clipAction(idle) : null;
      m.idleAction?.play();
      m.current = m.idleAction;
      actionToken += 1;
      state.actionId = "idle";
      state.holding = false;
      state.heldId = null;
      state.frame = 1;
      canvas.dataset.action = "idle";
      canvas.dataset.model = url.split("/").pop();    // read by QA / devtools: which GLB is on screen
      m.loadMs = Math.round(performance.now() - t0);
      return true;
    };
    // Body preset + figure style: bone scales + overall height. loadModel strips every clip's scale tracks, so a scale
    // applied here is never overwritten by an animation. See FIGURE_STYLES for why the head scale is uniform.
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

    // What an action changes besides the pose: the ball is put away (or back), the stool shows (or hides), the camera framing.
    const dress = (def) => {
      for (const node of m.props) node.visible = def ? def.ball !== false : true;
      if (m.seat) m.seat.visible = !!def?.seat;
      state.frame = def?.frame || 1;
    };
    // Play one clip with a crossfade. `onDone` runs when a once-clip ends, unless a newer request replaced it.
    const playClip = (clip, { loop, clamp, onDone }) => {
      const token = ++actionToken;
      const { mixer } = m;
      const next = mixer.clipAction(clip);
      next.reset();
      next.setLoop(loop ? T.LoopRepeat : T.LoopOnce, Infinity);
      next.clampWhenFinished = !!clamp;
      if (m.current && m.current !== next) m.current.fadeOut(0.25);
      next.fadeIn(0.25).play();
      m.current = next;
      if (!loop && onDone) {
        const finished = (e) => {
          if (e.action !== next) return;
          mixer.removeEventListener("finished", finished);
          if (!state.disposed && token === actionToken) onDone();
        };
        mixer.addEventListener("finished", finished);
      }
      return token;
    };
    // Leaving a held pose (sitting) plays its exit clip (standing up) first, then continues with `then`.
    const releaseHold = (then) => {
      const held = AVATAR_ACTIONS.find((a) => a.id === state.heldId);
      const exit = state.holding && held ? findExitClip(m.clips, held.id) : null;
      state.holding = false;
      state.heldId = null;
      if (!exit) return then();
      playClip(exit, { loop: false, clamp: true, onDone: then });
    };
    const startIdle = () => {
      actionToken += 1;
      if (m.current && m.current !== m.idleAction) m.current.fadeOut(0.25);
      if (m.idleAction) { m.idleAction.reset().fadeIn(0.25).play(); m.current = m.idleAction; }
      dress(null);
    };
    const playIdle = () => {
      state.actionId = "idle";
      canvas.dataset.action = "idle";
      releaseHold(startIdle);
      return true;
    };
    const playAction = (id) => {
      const clip = findActionClip(m.clips, id);
      const def = AVATAR_ACTIONS.find((a) => a.id === id);
      if (!clip || !def) return false;
      state.actionId = id;
      canvas.dataset.action = id;
      const hold = holdsPose(def, m.seat);
      const start = () => {
        dress(def);
        state.holding = hold;
        state.heldId = hold ? id : null;
        playClip(clip, { loop: def.mode === "loop", clamp: def.mode !== "loop", onDone: hold ? null : () => { if (state.actionId === id) playIdle(); } });
      };
      releaseHold(start);
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
      const dt = clock.getDelta();
      m.mixer?.update(dt);
      keepPropUnscaled(T, m.bones.Prop);
      const want = (camera.userData.baseDist || camera.position.z) * (state.frame || 1);
      camera.position.z += (want - camera.position.z) * Math.min(1, dt * ZOOM_LERP);
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
    // Read-only facts for QA / devtools: what is on screen right now, how heavy it is, and where the feet are.
    state.inspect = () => {
      let tris = 0, meshes = 0, hidden = 0;
      m.root.traverse((n) => {
        if (!n.isMesh) return;
        if (!n.visible) { hidden += 1; return; }
        meshes += 1;
        tris += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3;
      });
      m.root.updateWorldMatrix(true, true);
      const probe = new T.Vector3();
      const local = (bone) => { bone.getWorldPosition(probe); return m.root.worldToLocal(probe).toArray().map((v) => +v.toFixed(4)); };
      const scaleOf = (bone) => [bone.scale.x, bone.scale.y, bone.scale.z].map((v) => +v.toFixed(3));
      const prop = m.bones.Prop;
      const propScale = prop ? new T.Vector3().setFromMatrixScale(prop.matrixWorld).toArray().map((v) => +v.toFixed(3)) : null; // world scale: keepPropUnscaled pins it to 1
      return {
        model: canvas.dataset.model, action: state.actionId, holding: !!state.holding, loadMs: m.loadMs,
        clips: m.clips.map((c) => c.name),
        scaleTracks: m.clips.reduce((n, c) => n + c.tracks.filter((t) => t.name.endsWith(".scale")).length, 0),
        triangles: Math.round(tris), meshes, hiddenMeshes: hidden, materials: Object.keys(m.materials).length,
        drawCalls: renderer.info.render.calls, geometries: renderer.info.memory.geometries,
        ballVisible: m.props.length > 0 && m.props.every((p) => p.visible), seatVisible: !!m.seat?.visible, hasSeat: !!m.seat,
        propScale, heightScale: state.heightScale || 1, camDistRatio: +(camera.position.z / (camera.userData.baseDist || 1)).toFixed(3),
        scales: { ShoulderL: m.bones.ShoulderL && scaleOf(m.bones.ShoulderL), Head: m.bones.Head && scaleOf(m.bones.Head) },
        hips: m.bones.Hips ? local(m.bones.Hips) : null,
        feet: [m.bones.FootL, m.bones.FootR].map((b) => (b ? local(b) : null)),
      };
    };
    state.setYaw = (radians) => { pivot.rotation.y = radians; };
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
    /** Facts about what is on screen (QA / devtools): model, action, triangles, draw calls, body scales, foot heights. */
    inspect: () => state.inspect(),
    /** Turn the figure to an absolute yaw (radians); the default is the three-quarter DEFAULT_YAW. */
    setYaw: (radians) => state.setYaw(radians),
    /** Back to the idle pose. */
    playIdle: () => state.playIdle?.() ?? false,
    /** Current preview action id, or "idle". */
    action: () => state.actionId || "idle",
    dispose: cleanup,
  };
}
