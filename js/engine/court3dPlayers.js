/**
 * Experimental humanoid court players for CourtView3D (feature-flagged, OFF by default).
 *
 * One rigged GLB (Quaternius "Man", CC0 — assets/avatar3d/man.glb, see docs/ASSET_CREDITS.md) is loaded once and cloned per
 * player. Shirt / shorts take the team colour, skin and hair vary by player id. Idle / run / jump / celebrate play through
 * an AnimationMixer.
 *
 * Presentation only: nothing here reads or changes GameSim. CourtView3D keeps authority over positions, facing and timing
 * (the S1a–S4 presentation timeline); this module only picks the clip that matches what the timeline is doing. Any failure
 * (no WebGL, fetch error, bad file, timeout) resolves to `null` and the caller keeps the capsule figures.
 *
 * Enable: `?players3d=1` in the URL, or `localStorage["cls.players3d"] = "1"`.
 */

const MODEL_URL = new URL("../../assets/avatar3d/man.glb", import.meta.url).href;
const GLTF_LIB_URL = new URL("../vendor/three-gltf.min.js", import.meta.url).href;

export const PLAYERS3D_STORAGE_KEY = "cls.players3d";
export const PLAYER_HEIGHT_M = 2.0;
const LOAD_TIMEOUT_MS = 8000;
const FADE_S = 0.18;
/** Below this ground speed (m/s) a figure stands; above it, it runs. Hysteresis keeps the clip from flickering. */
export const RUN_ON_MPS = 0.9;
export const RUN_OFF_MPS = 0.4;
const RUN_REF_MPS = 4.2; // ground speed the Run clip is authored for (timeScale = speed / this)
const CELEBRATE_S = 1.6;

const SKIN_TONES = [0xf1c8a5, 0xe0ac81, 0xc68863, 0xa86b45, 0x8a5233, 0x5e3a24];
const HAIR_TONES = [0x16100d, 0x241812, 0x3a2a1c, 0x0d0d0d];

/** Opt-in switch. `search` / `storage` are injectable for tests. */
export function players3dEnabled(search, storage) {
  const s = search ?? (typeof location !== "undefined" ? location.search : "");
  const m = /[?&]players3d=([^&]*)/.exec(s || "");
  if (m) return m[1] === "1" || m[1] === "true";
  try {
    const st = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    return st?.getItem(PLAYERS3D_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Stable small hash so a player keeps the same skin / hair across rebuilds. */
export function hashId(id) {
  let h = 2166136261;
  const s = String(id ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pure clip choice. `current` is the clip now playing ("idle" | "run" | "jump" | "celebrate"); jump / celebrate are one-shots
 * that hold until their `oneShotLeft` runs out, then fall back to run/idle by speed.
 */
export function chooseClip(current, speedMps, oneShotLeft = 0) {
  if ((current === "jump" || current === "celebrate") && oneShotLeft > 0) return current;
  if (current === "run") return speedMps < RUN_OFF_MPS ? "idle" : "run";
  return speedMps > RUN_ON_MPS ? "run" : "idle";
}

function withTimeout(promise, ms) {
  let t;
  const timer = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error("players3d load timeout")), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

function findClip(clips, name) {
  return clips.find((c) => c.name === name || c.name.endsWith(`|${name}`)) || null;
}

/** Loads and measures the shared template. Resolves `null` on ANY failure so the capsule path stays the fallback. */
export async function loadPlayerTemplate(T, opts = {}) {
  try {
    const lib = await withTimeout(import(GLTF_LIB_URL), LOAD_TIMEOUT_MS);
    const loader = new lib.GLTFLoader();
    const gltf = await withTimeout(loader.loadAsync(opts.url || MODEL_URL), LOAD_TIMEOUT_MS);
    const scene = gltf.scene;
    if (!scene) return null;
    // Normalise: scale to PLAYER_HEIGHT_M and drop the feet on y = 0 (the rig's own armature scale is 100).
    scene.updateMatrixWorld(true);
    let box = new T.Box3().setFromObject(scene, true);
    const h = box.max.y - box.min.y;
    if (!(h > 0.01) || !Number.isFinite(h)) return null;
    const k = PLAYER_HEIGHT_M / h;
    scene.scale.multiplyScalar(k);
    scene.updateMatrixWorld(true);
    box = new T.Box3().setFromObject(scene, true);
    scene.position.y -= box.min.y;
    const clips = {
      idle: findClip(gltf.animations, "Man_Idle"),
      run: findClip(gltf.animations, "Man_Run"),
      jump: findClip(gltf.animations, "Man_Jump"),
      celebrate: findClip(gltf.animations, "Man_Clapping"),
    };
    if (!clips.idle || !clips.run) return null;
    return { scene, clips, clone: lib.clone, scale: k };
  } catch {
    return null;
  }
}

/**
 * One animated player. The returned shape is a superset of CourtView3D's capsule figure so existing code (`group`, `body`,
 * `head`, `armL`, `armR`, `body.material.emissive`) keeps working unchanged; the extra `glb` handle drives the animation.
 */
export function makeGlbFigure(T, tpl, { color = 0x888888, playerId = "" } = {}) {
  const group = new T.Group();
  const body = new T.Group(); // sways a hair, like the capsule body; carries the shirt material for the focus highlight
  const model = tpl.clone(tpl.scene);
  body.add(model);
  group.add(body);

  const h = hashId(playerId);
  const own = [];
  let shirt = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // skinned bounds are the bind pose; the clip moves limbs outside it
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map((m) => {
      const c = m.clone();
      own.push(c);
      const name = (m.name || "").toLowerCase();
      if (name === "shirt") {
        c.color.setHex(color);
        c.roughness = 0.75;
        shirt = c;
      } else if (name === "pants") {
        c.color.setHex(color);
        c.color.multiplyScalar(0.55);
      } else if (name === "skin") {
        c.color.setHex(SKIN_TONES[h % SKIN_TONES.length]);
      } else if (name === "hair") {
        c.color.setHex(HAIR_TONES[(h >>> 3) % HAIR_TONES.length]);
      }
      return c;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
  body.material = shirt || own[0] || { emissive: { setHex() {} } };

  const mixer = new T.AnimationMixer(model);
  const actions = {};
  for (const [k, clip] of Object.entries(tpl.clips)) {
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    if (k === "jump" || k === "celebrate") {
      a.setLoop(T.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    actions[k] = a;
  }
  // Stagger idle phases so ten players never breathe in unison.
  let current = "idle";
  actions.idle.play();
  actions.idle.time = (h % 1000) / 1000 * (tpl.clips.idle.duration || 1);

  const st = { lastX: null, lastZ: null, speed: 0, oneShotLeft: 0, yaw: 0 };

  const play = (name, { timeScale = 1 } = {}) => {
    const next = actions[name];
    if (!next) return;
    next.timeScale = timeScale;
    if (name === current) return;
    const prev = actions[current];
    next.reset().play();
    prev?.crossFadeTo(next, FADE_S, false);
    current = name;
  };

  const glb = {
    get clip() {
      return current;
    },
    get speed() {
      return st.speed;
    },
    /** A one-shot (jump shot / dunk lift-off / basket celebration). `seconds` fits the clip to the presentation window. */
    trigger(name, seconds) {
      const a = actions[name];
      if (!a) return false;
      const dur = tpl.clips[name].duration || 1;
      st.oneShotLeft = seconds ?? (name === "celebrate" ? CELEBRATE_S : dur);
      current = current === name ? "idle" : current; // force a restart if it is already the active clip
      play(name, { timeScale: seconds ? Math.max(0.5, Math.min(2.2, dur / seconds)) : 1 });
      return true;
    },
    /**
     * Per frame, AFTER CourtView3D set group.position / rotation.y. `baseYaw` is the facing the timeline wants; while the
     * figure actually travels it turns toward its velocity instead (so a run looks like a run, not a moonwalk).
     */
    step(dt, x, z, baseYaw) {
      const d = Math.max(1e-3, dt);
      let speed = 0;
      let vx = 0;
      let vz = 0;
      if (st.lastX !== null) {
        vx = (x - st.lastX) / d;
        vz = (z - st.lastZ) / d;
        speed = Math.min(9, Math.hypot(vx, vz));
      }
      st.lastX = x;
      st.lastZ = z;
      st.speed += (speed - st.speed) * (1 - Math.exp(-d * 10));
      st.oneShotLeft = Math.max(0, st.oneShotLeft - d);
      const want = chooseClip(current, st.speed, st.oneShotLeft);
      if (want !== current) play(want);
      if (current === "run") actions.run.timeScale = Math.max(0.6, Math.min(1.5, st.speed / RUN_REF_MPS));
      // Turn toward travel while running (local yaw relative to the group), else settle back to the timeline's facing.
      let target = 0;
      if (current === "run" && st.speed > RUN_ON_MPS) {
        target = Math.atan2(vx, vz) - baseYaw;
        target = Math.atan2(Math.sin(target), Math.cos(target)); // wrap to ±π
      }
      let diff = target - st.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      st.yaw += diff * (1 - Math.exp(-d * 9));
      model.rotation.y = st.yaw;
      mixer.update(d);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot?.(model);
      for (const m of own) m.dispose?.();
    },
  };
  return { group, body, head: model, armL: new T.Group(), armR: new T.Group(), glb };
}
