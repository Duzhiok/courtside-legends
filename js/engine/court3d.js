/**
 * Clutch 3D replay — key-moments theater (ONE possession only).
 *
 * docs/3D_BROADCAST_PLAN.md Stages 0–3 + §8 prototype decisions:
 *  - style A capsule figures (fastest, most stable, mobile-friendly);
 *  - default is 2D; 3D is an explicit opt-in replay, never the default;
 *  - fixed sideline TV broadcast angle (a very slight lateral pan during the
 *    push phase only, camera + look-target move together);
 *  - name plates kept (consistent with the 2D tok-name / tok-pts);
 *  - dunk flash kept as a replay-screen flash (the plan's named
 *    showDunkFlash no longer exists in the codebase — see BACKLOG);
 *  - performance floor deferred: measure on Mac, decide later.
 *
 * Scope: the JUST-RESOLVED clutch possession only. CourtView3D has the
 * EXACT same interface as CourtView (render(snap) + onShot(shot)) so app.js
 * branches only at construction; the replay reads the settled result
 * (meta.clutchOutcome + the retained possession snapshot) and NEVER
 * re-simulates. No full-game 3D, no Stage 4 toggle, no Stage 3b.
 *
 * Positions reuse CourtView's computations exactly (SETS, lineupForSlots,
 * DEF_GAP, toCourtPct, 2.6s push phase, landing drift) — only the output
 * target changes from el.style.left/top to 3D meters. The shot flight
 * reuses _shotFrame's made/miss end logic, translated to the real y axis:
 * made = through the net to the floor under the rim; miss = bounce off the
 * rim toward midcourt. The Bézier itself is meter-scale (arcPoint's bulge
 * constant is tuned for % coordinates and is not reused verbatim).
 */
import {
  SETS,
  DEF_GAP,
  lineupForSlots,
  handlerSlotIndex,
  toCourtPct,
  shortName,
} from "./court.js";
import { clamp } from "../core/seededRandom.js";
import { webglAvailable } from "../core/capabilities.js";
import { arenaPreset, qualityProfile } from "./arena/arenaPresets.js";
import { makeFloorTexture } from "./arena/floorTexture.js";
import { loadPlayerTemplate, makeGlbFigure, players3dEnabled } from "./court3dPlayers.js";
import { addHoopDetails } from "./arena/arenaHoop.js";
import { addArenaLights } from "./arena/arenaLights.js";
import { buildArenaEnvironment } from "./arena/arenaEnvironment.js";
import { SCOREBOARD_BOX } from "./arena/arenaCourtside.js";
import { canInstance, instancedBoxes } from "./arena/arenaInstances.js";
import { createBallAids } from "./broadcast/ballAids.js";
import { PLATE_LEGIBLE_PX, PLATE_MIN_PX, PLATE_WORLD, compactName, placeLabels, plateScreenSize, platePriority, readableBoost } from "./broadcast/labelLayout.js";

/** Vendored full Three.js 0.187.0 (three.module.js + three.core.js). The R171
 * avatar bundle is tree-shaken to 13 symbols (no geometry/material classes)
 * and cannot serve a replay view, so the full build is vendored instead.
 * License: js/vendor/THREE_LICENSE.txt (MIT, Three.js Authors 2010–2026). */
const THREE_URL = new URL("../vendor/three.module.js", import.meta.url).href;

/** Full court: 28.65m × 15.24m (plan §3.3). y=6% is the away hoop, y=94% the home hoop. */
export const COURT_HALF_WIDTH_M = 7.62;
const COURT_HALF_LENGTH_M = 14.33;
export const RIM_HEIGHT_M = 3.05;
/** Push phase length (mirrors CourtView._paint's ~2.6s). */
export const PUSH_MS = 2600;
/** Shot flight (mirrors CourtView._shotFrame's FLIGHT=750ms); the ball then
 * settles to the floor over SHOT_SETTLE_MS (not part of the flight). */
export const SHOT_FLIGHT_MS = 750;
export const SHOT_SETTLE_MS = 180;
/** A pass flies from the passer's figure to the receiver's in this long (staging, like every duration here). */
export const PASS_FLIGHT_MS = 380;
/** Dunk timings (mirror CourtView._dunkFrame: DRIVE 420 + NET 150 + SETTLE 200). */
export const DUNK_DRIVE_MS = 420;
const DUNK_NET_MS = 150;
const DUNK_SETTLE_MS = 200;
export const DUNK_TOTAL_MS = DUNK_DRIVE_MS + DUNK_NET_MS + DUNK_SETTLE_MS; // 770
export const BALL_RADIUS_M = 0.12;
/** The ball is drawn bigger than life (a regulation ball is a speck from the broadcast angle). Its centre offset keeps it resting on the floor. */
export const BALL_VISUAL_SCALE = 1.7;
/** Broadcast framing: closer than "the whole court fits", panning along the court with the ball. */
export const FRAMING_ZOOM = 0.8;
const PAN_FOLLOW = 0.5;
const PAN_LIMIT_M = 6;
/** The arena select and the 2D/3D button sit along the top of the view (about 44 px tall plus their margin): names stay below them. */
const UI_SAFE_TOP_PX = 56;
const RIM_CLEAR_PX = 45; // half-size of the square kept free of names around the rim a shot is flying to
const FOCUS_PLATE_FLIGHT_OPACITY = 0.35;
const PORTRAIT_FROM_ASPECT = 1.6; // desktop framing (16:10) shows no empty strip
const PORTRAIT_DROP_PER_ASPECT = 0.55; // 1.34 (a phone's 3D view) -> about 14% of the height: the empty strip goes, the court stays big
const PORTRAIT_DROP_MAX = 0.25;
export const BALL_GLIDE_MS = 220;
const PLATE_BASE_Y = { full: 2.75, compact: 2.5 };
/** Miss bounce distance toward midcourt: 2D's 18% of court length, in meters. */
export const MISS_BOUNCE_M = 5.16;
/** The clutch scenario is always 2016 GSW (home) vs CLE (away). */
const CLUTCH_TEAM_COLORS = Object.freeze({ home: 0x1d428a, away: 0x860038 });

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const lerp = (a, b, t) => a + (b - a) * t;

function detectReducedMotion() {
  try {
    return (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** Pure: court % coords → floor meters (plan §3.3). x: 50% = center line,
 * 0/100% = sidelines; y: 6% = away hoop, 94% = home hoop. */
export function courtPercentToVec3(xPct, yPct) {
  return {
    x: ((xPct - 50) / 50) * COURT_HALF_WIDTH_M,
    y: 0,
    z: ((yPct - 50) / 50) * COURT_HALF_LENGTH_M,
  };
}

/** Pure: the rim the attacking team shoots at (attackingUp = home has ball). */
export function rimVec3(attackingUp) {
  const base = courtPercentToVec3(50, attackingUp ? 6 : 94);
  return { x: base.x, y: RIM_HEIGHT_M, z: base.z };
}

/**
 * Pure: snapshot → per-player 3D positions. This is CourtView._paint's exact
 * computation (same slots, same DEF_GAP defense offset, same toCourtPct push
 * lerp, same drift formulas and time base) with the output mapped to meters.
 * phase 0–1 is the push; tSec is seconds (performance.now() / 1000 in 2D).
 * The 1:1 acceptance is tests/court3dReplay.test.js ("matches CourtView").
 */
export function snapshotTo3DPositions(snap, phase = 1, tSec = 0) {
  const offSide = snap.possession === "away" ? "away" : "home";
  const attackingUp = offSide === "home";
  const off = attackingUp ? snap.home : snap.away;
  const def = attackingUp ? snap.away : snap.home;
  const tacticId = off?.tactic?.id || "balanced";
  const slots = SETS[tacticId] || SETS.balanced;
  const offOrdered = lineupForSlots(off?.onCourt || []);
  const defOrdered = lineupForSlots(def?.onCourt || []);
  const handlerIdx = handlerSlotIndex(offOrdered);
  const out = [];
  const push = (p, i, isOff) => {
    const slot = slots[i] || slots[slots.length - 1];
    let xPct;
    let yPct;
    if (isOff) {
      const base = toCourtPct(slot, attackingUp, phase);
      const drift = phase > 0.7 ? 1 : 0.35;
      xPct = base.x + Math.sin(tSec * 1.4 + i) * 1.2 * drift;
      yPct = base.y + Math.cos(tSec * 1.1 + i * 0.9) * 1.0 * drift;
    } else {
      const gap = DEF_GAP[i] || DEF_GAP[DEF_GAP.length - 1];
      const base = toCourtPct(
        { x: clamp(slot.x + gap.dx, 10, 90), y: clamp(slot.y + gap.dy, 5, 95) },
        attackingUp,
        Math.min(1, phase + 0.08),
      );
      xPct = base.x + Math.sin(tSec * 1.2 + i + 2) * 1.0;
      yPct = base.y + Math.cos(tSec * 1.35 + i) * 0.9;
    }
    const m = courtPercentToVec3(xPct, yPct);
    out.push({
      playerId: p.id,
      name: p.cardName || p.name,
      short: shortName(p.name),
      side: isOff ? offSide : offSide === "home" ? "away" : "home",
      isOffense: isOff,
      isHandler: isOff && i === handlerIdx,
      slotIndex: i,
      xPct,
      yPct,
      x: m.x,
      y: 0,
      z: m.z,
      pts: p.stats?.pts || 0,
    });
  };
  offOrdered.forEach((p, i) => push(p, i, true));
  defOrdered.forEach((p, i) => push(p, i, false));
  return out;
}

/**
 * Pure: slim a sim.snapshot() to the minimal immutable replay snapshot.
 * Only the fields CourtView3D reads (possession, score, clock, quarter,
 * youSide, per-team name + tactic + onCourt with pts) — the live sim is
 * never consulted again after the possession resolves.
 */
export function captureClutchReplaySnapshot(snap) {
  const team = (t) => ({
    name: t?.name || "",
    tactic: { id: t?.tactic?.id || "balanced", name: t?.tactic?.name || "" },
    onCourt: (t?.onCourt || []).map((p) => ({
      id: p.id,
      name: p.name,
      cardName: p.cardName || p.name,
      pos: p.pos,
      playPos: p.playPos,
      stats: { pts: p.stats?.pts || 0 },
    })),
  });
  return {
    quarter: snap.quarter,
    clock: snap.clock,
    score: { home: snap.score?.home || 0, away: snap.score?.away || 0 },
    possession: snap.possession,
    youSide: snap.youSide,
    home: team(snap.home),
    away: team(snap.away),
  };
}

/**
 * Pure: decide what the replay plays from the settled outcome.
 * - not attempted (no possession / foul / turnover) → null (no shot to show);
 * - the actual shooter also dunked (separate "dunk" sim event, captured by
 *   the app while the outcome is unset) → a dunk;
 * - otherwise the shot the outcome records (shooter = actualShooterId).
 * Never re-simulates: the outcome is the settled record.
 */
export function buildReplayShot(outcome, dunkShooterId) {
  if (!outcome || !outcome.attempted || !outcome.actualShooterId) return null;
  if (dunkShooterId && dunkShooterId === outcome.actualShooterId) {
    return { kind: "dunk", shooterId: outcome.actualShooterId };
  }
  return {
    kind: "shot",
    shooterId: outcome.actualShooterId,
    made: !!outcome.made,
    pts: outcome.points || 0,
  };
}

/**
 * Pure: camera distance for the sideline TV angle so the whole court fits.
 * The length (28.65m) is the limiting dimension on wide screens; on
 * portrait the horizontal fov shrinks, so the camera backs off (capped).
 */
export function fitCameraDistance(aspect, fovDeg = 50) {
  const tanV = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  const distLen = (COURT_HALF_LENGTH_M + 1.5) / (tanV * Math.max(aspect, 0.3));
  const distH = 4.2 / tanV;
  return Math.min(75, Math.max(16, Math.max(distLen, distH)));
}

/** Load the vendored full Three.js for the replay. Rejects (no WebGL / bad
 * import) so the caller can stay on the 2D result page with a note. */
async function loadThreeForReplay(doc) {
  if (!webglAvailable(doc)) throw new Error("WebGL unavailable");
  return import(THREE_URL);
}

/**
 * 3D replay view. Same interface as CourtView: render(snap) + onShot(shot)
 * (+ onDunk(playerId), same as 2D). One rAF loop drives the push phase, the
 * shot/dunk animations, idle sway and the dribble; tick(now) is the frame
 * function (tests drive it directly with fake time).
 */
export class CourtView3D {
  static async create(container, opts = {}) {
    const T = await loadThreeForReplay(opts.doc);
    // Experimental humanoid players (?players3d=1): a null template (flag off, load failure, timeout) keeps the capsule figures.
    const wantGlb = opts.players3d ?? players3dEnabled();
    const playerTemplate = opts.playerTemplate ?? (wantGlb ? await loadPlayerTemplate(T) : null);
    return new CourtView3D(container, { ...opts, three: T, playerTemplate });
  }

  constructor(container, opts = {}) {
    if (!opts.three) {
      throw new Error("CourtView3D needs the THREE namespace (use CourtView3D.create)");
    }
    this.T = opts.three;
    this.root = container;
    this._reducedMotion = opts.reducedMotion ?? detectReducedMotion();
    this._clock =
      opts.clock ||
      (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    // rAF/cancelRaf MUST be bound: calling these Window methods detached
    // ("Illegal invocation" in Chrome/Safari) is exactly what stuck the
    // replay on "正在加载 3D 回放…" — the stored function is invoked as
    // this._raf(step), so an unbound Window method throws inside _startLoop
    // and the push promise never resolves. (Same pattern as
    // courtAnimationQueue.js.)
    const rafFn =
      opts.raf ||
      (typeof globalThis !== "undefined" &&
      typeof globalThis.requestAnimationFrame === "function"
        ? globalThis.requestAnimationFrame
        : null);
    this._raf = rafFn ? rafFn.bind(globalThis) : () => 0;
    const cancelFn =
      opts.cancelRaf ||
      (typeof globalThis !== "undefined" &&
      typeof globalThis.cancelAnimationFrame === "function"
        ? globalThis.cancelAnimationFrame
        : null);
    this._cancelRaf = cancelFn ? cancelFn.bind(globalThis) : () => {};
    this._colors = { ...CLUTCH_TEAM_COLORS, ...(opts.colors || {}) };
    // Venue look (pure presentation: nothing here reads or changes GameSim state). opts.arena = preset id, opts.quality = low|medium|high.
    this._arena = arenaPreset(opts.arena);
    this._quality = qualityProfile(opts.quality);
    this._doc = opts.doc || (typeof document !== "undefined" ? document : null);
    this._floorTex = null;
    this._plateFocusId = null;
    this._aids = null; // focus ring, ball shadow, shot path (null where the THREE-like lacks the classes)
    this._panZ = 0;
    this._lastNow = null;
    this._dt = 0.016;
    this._glide = null; // { from, start }: the ball easing to a new holder
    this.onShotLanded = null; // set by the match controller: ({ made, pts, side, shooterId, dunk }) when a shot/dunk reaches the rim
    this._env = null; // the stands/crowd/courtside group (null where InstancedMesh is missing or the build failed)
    this._fov = opts.fov || 50;
    this._disposed = false;
    this._snap = null;
    this._possession = null;
    this._phaseStart = null;
    this._phase = 1;
    this._playerTpl = opts.playerTemplate || null; // GLB humanoid template; null = capsule figures
    this._figures = new Map();
    this._lineupSig = "";
    this._shot = null;
    this._dunk = null;
    this._ballRest = null;
    this._ballOwner = null; // player id the ball is with (set by the presentation from GameSim's actor ids); null = fall back to the PG slot
    this._pass = null; // { fromId, toId, start } while a pass is in the air
    this._pushResolve = null;
    this._loopStarted = false;
    this._rafId = 0;
    this._ro = null;
    this._rimShakeUntil = 0;
    this._shakeRim = null;
    this._flashUntil = 0;
    this._flashPeak = 0;
    this._buildScene();
    this._bindResize();
  }

  // ------------------------------------------------------------ scene build

  _buildScene() {
    const T = this.T;
    const renderer = new T.WebGLRenderer({ antialias: true });
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    renderer.setPixelRatio(Math.min(dpr, 2));
    if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    this._renderer = renderer;
    this.root.appendChild(renderer.domElement);

    const scene = new T.Scene();
    scene.background = new T.Color(this._arena.background);
    this._scene = scene;

    const camera = new T.PerspectiveCamera(this._fov, 16 / 9, 0.1, 200);
    this._camera = camera;

    addArenaLights(T, scene, this._arena.lighting);

    this._buildFloor(scene);
    this._rims = {
      away: this._buildHoop(scene, -COURT_HALF_LENGTH_M + 1.72).rim,
      home: this._buildHoop(scene, COURT_HALF_LENGTH_M - 1.72).rim,
    };

    try {
      this._env = buildArenaEnvironment(T, scene, this._arena, this._quality, { doc: this._doc, colors: this._colors });
    } catch (err) {
      console.warn("[court3d] arena environment skipped:", err); // decoration only: the match view must never depend on it
      this._env = null;
    }

    const ballGeo = new T.SphereGeometry(BALL_RADIUS_M * BALL_VISUAL_SCALE, 20, 14);
    ballGeo.translate?.(0, BALL_RADIUS_M * (BALL_VISUAL_SCALE - 1), 0); // grow upward: a resting ball still touches the floor
    const ball = new T.Mesh(ballGeo, new T.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0x4a1d00, roughness: 0.55 }));
    ball.visible = false;
    scene.add(ball);
    this._ball = ball;
    try {
      this._aids = createBallAids(T, scene);
    } catch (err) {
      console.warn("[court3d] ball aids skipped:", err);
      this._aids = null;
    }

    // Dunk flash (the plan's showDunkFlash no longer exists; the replay
    // keeps the emphasis as a gold flash over the replay container).
    try {
      const flash = document.createElement("div");
      flash.className = "clutch-3d-flash";
      flash.style.opacity = "0";
      this.root.appendChild(flash);
      this._flashEl = flash;
    } catch {
      this._flashEl = null;
    }
    this._layoutCamera(0);
  }

  _buildFloor(scene) {
    const T = this.T;
    const planeW = COURT_HALF_WIDTH_M * 2 + 1.4;
    const planeH = COURT_HALF_LENGTH_M * 2 + 1.5;
    const tex = makeFloorTexture(
      T, this._doc, this._arena,
      { halfW: COURT_HALF_WIDTH_M, halfL: COURT_HALF_LENGTH_M, planeW, planeH },
      this._quality.floorPx,
    );
    this._floorTex = tex;
    const floor = new T.Mesh(
      new T.PlaneGeometry(planeW, planeH),
      new T.MeshStandardMaterial(tex ? { map: tex, roughness: 0.55 } : { color: this._arena.floor.wood, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const lineMat = new T.MeshBasicMaterial({ color: this._arena.floor.lines });
    const group = new T.Group();
    const W = COURT_HALF_WIDTH_M;
    const L = COURT_HALF_LENGTH_M;
    const strips = [];
    const strip = (x1, z1, x2, z2, w = 0.06) => {
      strips.push({
        x: (x1 + x2) / 2, y: 0.006, z: (z1 + z2) / 2,
        sx: Math.hypot(x2 - x1, z2 - z1), sy: 0.012, sz: w, ry: -Math.atan2(z2 - z1, x2 - x1),
      });
    };
    // Boundary + half-court.
    strip(-W, -L, W, -L);
    strip(-W, L, W, L);
    strip(-W, -L, -W, L);
    strip(W, -L, W, L);
    strip(-W, 0, W, 0);
    // Center circle + free-throw circles (full rings — no angle math).
    const ring = (x, z, r = 1.8) => {
      const m = new T.Mesh(new T.RingGeometry(r - 0.03, r + 0.03, 48), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.008, z);
      group.add(m);
    };
    ring(0, 0);
    // Keys: 4.88m wide, 5.8m from the baseline; FT circle at the FT line.
    for (const s of [-1, 1]) {
      const base = s * L;
      const ft = base - s * 5.8;
      strip(-2.44, base, 2.44, base);
      strip(-2.44, base, -2.44, ft);
      strip(2.44, base, 2.44, ft);
      strip(-2.44, ft, 2.44, ft);
      ring(0, ft);
      // 3pt: corner lines + arc (radius 6.75m from the rim center).
      const rimZ = base - s * 1.72;
      const cx = 6.72;
      const dz = Math.sqrt(6.75 * 6.75 - cx * cx); // ≈0.64m
      const cornerZ = rimZ - s * dz; // arc meets the corner line here
      strip(-cx, base, -cx, cornerZ);
      strip(cx, base, cx, cornerZ);
      // Arc endpoints (±cx, cornerZ); the arc bulges toward center court
      // (through 90° for the away rim, through 270° for the home rim).
      const a0 = Math.atan2(-s * dz, cx);
      const a1 = s < 0 ? Math.PI - a0 : -Math.PI - a0;
      const n = 24;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        const p = { x: 6.75 * Math.cos(a), z: rimZ + 6.75 * Math.sin(a) };
        if (prev) strip(prev.x, prev.z, p.x, p.z, 0.05);
        prev = p;
      }
    }
    // ~60 line segments: one draw call where instancing exists (mobile budget), one mesh each otherwise.
    if (canInstance(T)) {
      group.add(instancedBoxes(T, strips, lineMat));
    } else {
      for (const it of strips) {
        const m = new T.Mesh(new T.BoxGeometry(it.sx, it.sy, it.sz), lineMat);
        m.position.set(it.x, it.y, it.z);
        m.rotation.y = it.ry;
        group.add(m);
      }
    }
    scene.add(group);
  }

  _buildHoop(scene, rimZ) {
    const T = this.T;
    const s = rimZ < 0 ? -1 : 1;
    const group = new T.Group();
    const board = new T.Mesh(
      new T.BoxGeometry(1.83, 1.07, 0.05),
      new T.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 }),
    );
    board.position.set(0, 3.48, rimZ + s * 0.45);
    group.add(board);
    const rim = new T.Mesh(
      new T.TorusGeometry(0.23, 0.02, 8, 24),
      new T.MeshStandardMaterial({ color: 0xed7a1a, roughness: 0.4 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, RIM_HEIGHT_M, rimZ);
    group.add(rim);
    const net = new T.Mesh(
      new T.CylinderGeometry(0.23, 0.13, 0.4, 8, 1, true),
      new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, wireframe: true }),
    );
    net.position.set(0, 2.84, rimZ);
    group.add(net);
    const post = new T.Mesh(
      new T.CylinderGeometry(0.08, 0.08, 3.9, 10),
      new T.MeshStandardMaterial({ color: 0x2a2f2b, roughness: 0.7 }),
    );
    post.position.set(0, 1.95, rimZ + s * 1.0);
    group.add(post);
    addHoopDetails(T, group, { rimZ, s, rimY: RIM_HEIGHT_M, padColor: this._arena.floor.paint });
    const arm = new T.Mesh(
      new T.BoxGeometry(0.08, 0.08, 0.6),
      new T.MeshStandardMaterial({ color: 0x2a2f2b, roughness: 0.7 }),
    );
    arm.position.set(0, 3.9, rimZ + s * 0.72);
    group.add(arm);
    scene.add(group);
    return { group, rim };
  }

  _bindResize() {
    if (typeof ResizeObserver === "function") {
      try {
        this._ro = new ResizeObserver(() => this.resize());
        this._ro.observe(this.root);
      } catch {
        this._ro = null;
      }
    }
    this.resize();
  }

  resize() {
    if (this._disposed || !this._renderer || !this._camera) return;
    const w = this.root?.clientWidth || 0;
    const h = this.root?.clientHeight || 0;
    this._camera.aspect = w > 0 && h > 0 ? w / h : 16 / 9;
    // A narrower view than the desktop's 16:10 (a phone shows this view at about 4:3, or taller) has to cover more height than the
    // court needs, so the strip below the near sideline was empty (the black band). Sliding the picture down crops that strip and
    // shows more stands above instead; a 16:10 or wider view is untouched.
    const drop = w > 0 && h > 0 ? clamp((PORTRAIT_FROM_ASPECT - this._camera.aspect) * PORTRAIT_DROP_PER_ASPECT, 0, PORTRAIT_DROP_MAX) : 0;
    if (drop > 0 && typeof this._camera.setViewOffset === "function") this._camera.setViewOffset(w, h, 0, -Math.round(drop * h), w, h);
    else this._camera.clearViewOffset?.();
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(Math.max(1, w), Math.max(1, h));
    this._layoutCamera(0);
  }

  /** Sideline TV angle: above the floor, slight downward tilt, looking at
   * court center. panZ is the small lateral drift during the push. */
  _layoutCamera(panZ = 0) {
    const w = this.root?.clientWidth || 0;
    const h = this.root?.clientHeight || 0;
    const aspect = w > 0 && h > 0 ? w / h : 16 / 9;
    const dist = fitCameraDistance(aspect, this._fov);
    this._camera.position.set(dist * 0.94 * FRAMING_ZOOM, dist * 0.5 * FRAMING_ZOOM, panZ);
    this._camera.lookAt(0, 0.6, panZ);
  }

  // ------------------------------------------------------------ figures

  _lineupSignature(snap) {
    const offSide = snap.possession === "away" ? "away" : "home";
    const off = offSide === "home" ? snap.home : snap.away;
    const def = offSide === "home" ? snap.away : snap.home;
    const ids = (t) => (t?.onCourt || []).map((p) => p.id).join(",");
    return `${ids(off)}|${ids(def)}|${offSide}|${off?.tactic?.id || "balanced"}`;
  }

  _rebuildFiguresIfNeeded(snap) {
    const sig = this._lineupSignature(snap);
    const positions = snapshotTo3DPositions(snap, 1, 0);
    if (sig === this._lineupSig) {
      // Same lineup: only the pts on the name plates can change.
      for (const pos of positions) {
        const fig = this._figures.get(pos.playerId);
        if (fig && fig.pts !== pos.pts) {
          fig.pts = pos.pts;
          this._drawPlate(fig.plate, pos.short, pos.pts); // keeps whatever look (full / compact) it has now
        }
      }
      return;
    }
    this._lineupSig = sig;
    for (const fig of this._figures.values()) {
      this._scene.remove(fig.group);
      fig.glb?.dispose();
    }
    this._figures.clear();
    for (const pos of positions) {
      const fig = this._makeFigure(pos);
      fig.pts = pos.pts;
      this._figures.set(pos.playerId, fig);
      this._scene.add(fig.group);
    }
  }

  /** Style A capsule figure: capsule body + head + two stub arms, jersey
   * color by side. Identity lives on the name plate (name + pts), as in 2D;
   * jersey numbers on the body are deferred (see BACKLOG). */
  _makeFigure(pos) {
    const T = this.T;
    const color = this._colors[pos.side] ?? 0x888888;
    if (this._playerTpl) {
      try {
        const g = makeGlbFigure(T, this._playerTpl, { color, playerId: pos.playerId });
        const plate = this._makePlate(pos.short, pos.pts);
        if (plate) g.group.add(plate.sprite);
        g.group.position.set(pos.x, 0, pos.z);
        return { ...g, plate, playerId: pos.playerId, short: pos.short, isOffense: pos.isOffense, pts: pos.pts, pinned: null };
      } catch {
        this._playerTpl = null; // a bad clone must never break the replay: fall back to capsules for the rest of the view
      }
    }
    const group = new T.Group();
    const mat = new T.MeshStandardMaterial({ color, roughness: 0.8 });
    const body = new T.Mesh(new T.CapsuleGeometry(0.3, 0.75, 4, 12), mat);
    body.position.y = 1.05;
    group.add(body);
    const head = new T.Mesh(
      new T.SphereGeometry(0.22, 16, 12),
      new T.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.7 }),
    );
    head.position.y = 1.95;
    group.add(head);
    const mkArm = (sideX) => {
      const pivot = new T.Group();
      pivot.position.set(sideX, 1.5, 0);
      const arm = new T.Mesh(new T.CapsuleGeometry(0.09, 0.5, 4, 8), mat);
      arm.position.y = -0.28;
      pivot.add(arm);
      pivot.rotation.z = sideX < 0 ? 0.15 : -0.15;
      group.add(pivot);
      return pivot;
    };
    const armL = mkArm(-0.38);
    const armR = mkArm(0.38);
    const plate = this._makePlate(pos.short, pos.pts);
    if (plate) group.add(plate.sprite);
    group.position.set(pos.x, 0, pos.z);
    return { group, body, head, armL, armR, plate, playerId: pos.playerId, short: pos.short, isOffense: pos.isOffense, pts: pos.pts, pinned: null };
  }

  _makePlate(name, pts) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const texture = new this.T.CanvasTexture(canvas);
      const sprite = new this.T.Sprite(
        new this.T.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
      );
      sprite.scale.set(PLATE_WORLD.compact.w, PLATE_WORLD.compact.h, 1);
      sprite.position.y = PLATE_BASE_Y.compact;
      const plate = { sprite, canvas, ctx, texture, mode: null };
      this._drawPlate(plate, name, pts, "compact");
      return plate;
    } catch {
      return null;
    }
  }

  /** Two looks: `full` (the ball handler / shooter: name + points, bright, big) and `compact` (a short surname, quiet). */
  _drawPlate(plate, name, pts, mode = plate?.mode || "compact") {
    if (!plate) return;
    const { canvas, ctx, texture } = plate;
    plate.mode = mode;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (mode === "full") {
      ctx.fillStyle = "rgba(255, 211, 77, 0.96)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#14181b";
      ctx.font = "bold 38px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${name} · ${pts}`, canvas.width / 2, canvas.height / 2 + 1);
    } else {
      ctx.fillStyle = "rgba(6, 20, 14, 0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.font = "bold 42px sans-serif"; // big in the canvas: a compact plate is small on screen
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(compactName(name), canvas.width / 2, canvas.height / 2 + 1);
    }
    if (texture) texture.needsUpdate = true;
  }

  /** Who the eye should follow: the real ball holder, or the shooter / dunker while the ball is in the air. */
  _focusId() {
    return this._shot?.shooterId || this._dunk?.playerId || this._ballOwner || null; // the shot in the air outranks the book-keeping owner
  }

  /**
   * Every plate: the focus gets the full look and is never hidden; the rest are compact, and where two would overlap on screen the
   * less important one steps up above the other or is hidden. Presentation only; skipped where Vector3.project is missing (the test fake).
   */
  _updatePlates() {
    const T = this.T;
    const W = this.root?.clientWidth || 0;
    const H = this.root?.clientHeight || 0;
    if (typeof T.Vector3?.prototype?.project !== "function" || !W || !H || !this._figures.size) return;
    this._v3 = this._v3 || new T.Vector3();
    this._camera.updateMatrixWorld?.();
    const focus = this._focusId();
    this._plateFocusId = focus; // the focus these plates were drawn for this frame
    const focusFig = focus ? this._figures.get(focus) : null;
    const items = [];
    for (const fig of this._figures.values()) {
      if (!fig.plate) continue;
      const isFocus = fig === focusFig;
      const mode = isFocus ? "full" : "compact";
      if (fig.plate.mode !== mode) {
        this._drawPlate(fig.plate, fig.short, fig.pts, mode);
        const w = PLATE_WORLD[mode];
        fig.plate.sprite.scale.set(w.w, w.h, 1);
        fig.plate.sprite.material.depthTest = !isFocus; // the active player's name is never behind a scoreboard or a body
        fig.plate.sprite.renderOrder = isFocus ? 20 : 5;
        fig.body.material?.emissive?.setHex(isFocus ? 0x3d3d3d : 0x000000);
      }
      const p = fig.group.position;
      const baseY = p.y + PLATE_BASE_Y[mode]; // the plate rides on the figure: a dunker in the air carries his plate up with him
      this._v3.set(p.x, baseY, p.z).project(this._camera);
      const sy = (-this._v3.y * 0.5 + 0.5) * H;
      // How many screen pixels one metre of height is worth HERE: the camera looks down, so it is less than the face-on scale.
      this._v3.set(p.x, baseY + 1, p.z).project(this._camera);
      const pxPerMetreUp = Math.max(1e-3, sy - (-this._v3.y * 0.5 + 0.5) * H);
      this._v3.set(p.x, baseY, p.z).project(this._camera); // back to the plate's own spot
      const dist = this._camera.position.distanceTo(p);
      let size = plateScreenSize(PLATE_WORLD[mode].w, PLATE_WORLD[mode].h, dist, this._fov, H);
      const boost = readableBoost(size.h, PLATE_MIN_PX[mode]); // a plate too small to read is enlarged (a phone shows the whole court in 390 px)
      if (boost !== 1) size = { ...size, w: size.w * boost, h: size.h * boost };
      fig.plate.sprite.scale.set(PLATE_WORLD[mode].w * boost, PLATE_WORLD[mode].h * boost, 1);
      items.push({
        id: fig.playerId, fig, mode, pxPerMetreUp,
        x: (this._v3.x * 0.5 + 0.5) * W, y: (-this._v3.y * 0.5 + 0.5) * H, w: size.w, h: size.h,
        behind: this._v3.z > 1,
        priority: platePriority({ isFocus, isOffense: !!fig.isOffense, distToFocus: focusFig ? Math.hypot(p.x - focusFig.group.position.x, p.z - focusFig.group.position.z) : Infinity }),
      });
    }
    // Screen areas a name must not sit on: the page's own controls along the top, and the hung scoreboard where it is drawn now.
    const blockers = this._plateBlockers(W, H);
    const blocked = (it, dy = 0) => it.priority < 100 && blockers.some((b) => b.x0 < it.x + it.w / 2 && b.x1 > it.x - it.w / 2 && b.y0 < it.y + dy + it.h / 2 && b.y1 > it.y + dy - it.h / 2);
    const placed = placeLabels(items.filter((it) => !it.behind && !blocked(it) && (it.priority >= 100 || it.h >= PLATE_LEGIBLE_PX)), { gap: 7 }); // a speck is not a name; the gap also absorbs the perspective error of the px->metre nudge
    for (const it of items) {
      const res = placed.get(it.id) || { visible: false, dy: 0 };
      if (res.visible && blocked(it, res.dy)) res.visible = false; // nudged up into a blocked area: hide it instead
      it.fig.plate.sprite.visible = res.visible && !it.behind;
      // The big plate of the player who is shooting must not hide the ball or the rim it flies to (on a phone it is as wide as the court):
      // while the ball is in the air it is see-through; it is never hidden or moved.
      if (it.mode === "full" && it.fig.plate.sprite.material) it.fig.plate.sprite.material.opacity = this._shot && !this._shot.settling ? FOCUS_PLATE_FLIGHT_OPACITY : 1;
      it.fig.plate.sprite.position.y = PLATE_BASE_Y[it.mode] + (-res.dy) / it.pxPerMetreUp;
    }
  }

  /** Screen rectangles {x0,y0,x1,y1} (px) that non-focus name plates avoid: a fixed safe strip under the page's controls, and the hung scoreboard. */
  _plateBlockers(W, H) {
    const out = [{ x0: 0, y0: 0, x1: W, y1: UI_SAFE_TOP_PX }];
    if (this._shot && !this._shot.settling) { // a shot is in the air: nobody's name hangs on the basket it is heading for
      this._v3.set(this._shot.to.x, this._shot.to.y ?? 3.05, this._shot.to.z).project(this._camera);
      if (this._v3.z <= 1) {
        const rx = (this._v3.x * 0.5 + 0.5) * W;
        const ry = (-this._v3.y * 0.5 + 0.5) * H;
        out.push({ x0: rx - RIM_CLEAR_PX, y0: ry - RIM_CLEAR_PX, x1: rx + RIM_CLEAR_PX, y1: ry + RIM_CLEAR_PX });
      }
    }
    if (!this._env) return out;
    const s = SCOREBOARD_BOX;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      this._v3.set((sx * s.w) / 2, s.y + (sy * s.h) / 2, (sz * s.d) / 2).project(this._camera);
      if (this._v3.z > 1) return out; // the board is behind the camera: nothing to avoid
      const px = (this._v3.x * 0.5 + 0.5) * W;
      const py = (-this._v3.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    out.push({ x0, y0, x1, y1 });
    return out;
  }

  // ------------------------------------------------------------ interface

  /** CourtView interface: project a snapshot onto the 3D court. Returns a
   * promise that resolves when the push phase reaches its set positions
   * (immediately with reduced motion). */
  render(snap) {
    if (this._disposed) return Promise.resolve();
    this._snap = snap;
    this._env?.setSnapshot(snap);
    const offSide = snap.possession === "away" ? "away" : "home";
    if (this._possession !== offSide) {
      this._possession = offSide;
      this._phaseStart = this._clock();
      this._shot = null;
      this._dunk = null;
      this._ballRest = null;
      this._pass = null;
      this._setBallOwner(null); // the other team has the ball now; the presentation names the holder right after
    }
    this._rebuildFiguresIfNeeded(snap);
    this._setReplayState(this._reducedMotion ? "ready" : "pushing");
    this._startLoop();
    if (this._reducedMotion) {
      this._phase = 1;
      this.tick(this._clock());
      return Promise.resolve();
    }
    if (this._pushResolve) {
      const r = this._pushResolve;
      this._pushResolve = null;
      r();
    }
    this._phase = 0;
    return new Promise((resolve) => {
      this._pushResolve = resolve;
    });
  }

  /** The ball is with this player (an id from GameSim's events), or with nobody (null: back to the PG-slot staging). */
  setBallOwner(playerId) {
    if (this._disposed) return false;
    this._pass = null;
    if (playerId) this._ballRest = null;
    this._setBallOwner(playerId);
    return true;
  }

  _setBallOwner(playerId) {
    const next = playerId || null;
    // Hands changed with no pass drawn (GameSim reported none: an offensive rebound, a loose ball): the ball glides to the new
    // holder instead of teleporting. Presentation only; it is never written up as a pass.
    if (next && next !== this._ballOwner && this._ball?.visible) {
      this._glide = { from: { x: this._ball.position.x, z: this._ball.position.z }, start: this._clock() };
    } else if (!next) {
      this._glide = null;
    }
    this._ballOwner = next;
    if (this.root && this.root.dataset) this.root.dataset.ballOwner = this._ballOwner || "";
  }

  /** CourtView interface: the ball flies from the passer's figure to the receiver's, who then holds it. */
  onPass({ passerId, receiverId } = {}) {
    if (this._disposed || !this._ball || !receiverId) return false;
    const fromFig = this._figures.get(passerId);
    const toFig = this._figures.get(receiverId);
    this._ballRest = null;
    if (!fromFig || !toFig || this._reducedMotion) {
      this._pass = null;
      this._setBallOwner(receiverId);
      return !!toFig;
    }
    this._pass = { fromId: passerId, toId: receiverId, start: this._clock() };
    return true;
  }

  /** CourtView interface: play the shot arc from the shooter's current spot.
   * made = through the net; miss = bounce off the rim toward midcourt. */
  onShot(shot) {
    if (this._disposed || !this._ball || !this._snap) return false;
    const fig = this._figures.get(shot.shooterId);
    if (!fig) return false;
    const attackingUp = this._snap.possession !== "away";
    const to = rimVec3(attackingUp);
    if (this._reducedMotion) {
      this._ballRest = shot.made
        ? { x: to.x, z: to.z }
        : { x: to.x, z: to.z + (attackingUp ? 1 : -1) * MISS_BOUNCE_M };
      this._ball.position.set(this._ballRest.x, BALL_RADIUS_M, this._ballRest.z);
      this._ball.visible = true;
      this._landed({ made: !!shot.made, pts: shot.pts || 0, side: attackingUp ? "home" : "away", shooterId: shot.shooterId });
      this._setReplayState("done");
      return true;
    }
    this._shot = {
      from: { x: fig.group.position.x, y: 2.2, z: fig.group.position.z },
      to,
      start: this._clock(),
      made: !!shot.made,
      pts: shot.pts || 0,
      side: attackingUp ? "home" : "away",
      out: attackingUp ? 1 : -1,
      settling: false,
      settleStart: 0,
      shooterId: shot.shooterId,
    };
    this._aids?.setShot((u) => this._shotPoint(this._shot, u), to);
    fig.glb?.trigger("jump", (SHOT_FLIGHT_MS / 1000) * 1.2); // the shooter rises with the release
    this._ballRest = null;
    this._setReplayState("shot");
    return true;
  }

  /** CourtView interface: slide to the basket, jump, dunk (≤1000ms total). */
  onDunk(playerId) {
    if (this._disposed || !this._ball || !this._snap || this._reducedMotion) return false;
    const fig = this._figures.get(playerId);
    if (!fig) return false;
    const attackingUp = this._snap.possession !== "away";
    const to = rimVec3(attackingUp);
    this._dunk = {
      playerId,
      from: { x: fig.group.position.x, z: fig.group.position.z },
      to: { x: to.x, z: to.z },
      start: this._clock(),
      side: attackingUp ? "home" : "away",
      landed: false,
    };
    this._ballRest = null;
    this._shakeRim = attackingUp ? this._rims.away : this._rims.home;
    this._setReplayState("dunk");
    return true;
  }

  /** Replay choreography: fresh push from the backcourt, then the settled
   * shot/dunk. The shot itself is not awaited — it plays on the loop.
   * No shot (turnover / foul / no possession) -> state "done" after the push. */
  async playReplay(snap, shot) {
    if (this._disposed) return;
    this._possession = null; // force a fresh push even for the same snapshot
    await this.render(snap);
    if (this._disposed) return;
    if (shot?.kind === "dunk") {
      if (!this.onDunk(shot.shooterId)) this._setReplayState("done");
    } else if (shot) {
      if (!this.onShot({ shooterId: shot.shooterId, made: shot.made, pts: shot.pts })) {
        this._setReplayState("done");
      }
    } else {
      this._setReplayState("done");
    }
  }

  setReducedMotion(v) {
    this._reducedMotion = !!v;
    if (this._reducedMotion && this._snap) {
      this._phase = 1;
      if (this._pushResolve) {
        const r = this._pushResolve;
        this._pushResolve = null;
        r();
      }
      this.tick(this._clock());
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this._rafId) this._cancelRaf(this._rafId);
    this._rafId = 0;
    if (this._ro) {
      try {
        this._ro.disconnect();
      } catch {
        /* already gone */
      }
      this._ro = null;
    }
    if (this._pushResolve) {
      const r = this._pushResolve;
      this._pushResolve = null;
      r();
    }
    try {
      this._renderer?.dispose();
    } catch {
      /* renderer already gone */
    }
    try {
      this.root?.removeChild?.(this._renderer?.domElement);
    } catch {
      /* container already gone */
    }
    try {
      this._flashEl?.remove?.();
    } catch {
      /* already gone */
    }
    try {
      this._aids?.dispose();
    } catch {
      /* aids already gone */
    }
    try {
      this._env?.dispose();
    } catch {
      /* arena already gone */
    }
    try {
      this._floorTex?.dispose?.();
    } catch {
      /* texture already gone */
    }
    for (const fig of this._figures.values()) fig.glb?.dispose();
    this._figures.clear();
  }

  // ------------------------------------------------------------ frame loop

  /** Expose the venue + the live renderer cost on the host element (QA / perf measurement; refreshed every 30 frames). */
  _publishStats() {
    const ds = this.root?.dataset;
    const info = this._renderer?.info?.render;
    if (!ds) return;
    ds.arena = this._arena.id;
    ds.players = this._playerTpl ? "glb" : "capsule";
    this._statFrames = (this._statFrames || 0) + 1;
    if (info && this._statFrames % 30 === 1) {
      ds.drawCalls = String(info.calls);
      ds.triangles = String(info.triangles);
    }
  }

  _startLoop() {
    if (this._loopStarted || this._disposed) return;
    this._loopStarted = true;
    const step = (now) => {
      if (this._disposed) {
        this._rafId = 0;
        return;
      }
      this.tick(now);
      this._rafId = this._raf(step);
    };
    this._rafId = this._raf(step);
  }

  tick(now) {
    if (this._disposed || !this._snap) return;
    this._env?.update(now);
    const snap = this._snap;
    const offSide = snap.possession === "away" ? "away" : "home";
    const attackingUp = offSide === "home";
    // Push phase (mirrors CourtView._paint: 0–1 over ~2.6s).
    let phase = 1;
    if (!this._reducedMotion && this._phaseStart !== null) {
      phase = clamp((now - this._phaseStart) / PUSH_MS, 0, 1);
    }
    this._phase = phase;
    if (this._pushResolve && phase >= 1) {
      const r = this._pushResolve;
      this._pushResolve = null;
      r();
    }
    const tSec = now / 1000;
    this._dt = this._lastNow === null ? 0.016 : clamp((now - this._lastNow) / 1000, 0.001, 0.25);
    this._lastNow = now;
    const positions = snapshotTo3DPositions(snap, phase, tSec);
    let handlerPos = null;
    for (const pos of positions) {
      const fig = this._figures.get(pos.playerId);
      if (!fig) continue;
      // A finished dunk pins the dunker at the rim until the next render.
      const x = fig.pinned ? fig.pinned.x : pos.x;
      const z = fig.pinned ? fig.pinned.z : pos.z;
      fig.group.position.set(x, 0, z);
      fig.isOffense = pos.isOffense;
      // Offense faces the attacking rim; defense faces the ball.
      fig.group.rotation.y = pos.isOffense ? (attackingUp ? Math.PI : 0) : attackingUp ? 0 : Math.PI;
      // Push = running swing; set = breathing sway.
      const swing =
        phase < 1
          ? Math.sin(now * 0.009 + pos.slotIndex * 1.7) * 0.55
          : Math.sin(now * 0.0012 + pos.slotIndex) * 0.03;
      fig.armL.rotation.x = swing;
      fig.armR.rotation.x = -swing;
      fig.body.rotation.z = Math.sin(now * 0.0011 + pos.slotIndex * 2.3) * 0.02;
      fig.glb?.step(this._dt, x, z, fig.group.rotation.y);
      if (pos.isHandler) handlerPos = { x, z };
    }
    // Follow the real ball holder when the presentation has named one; the PG slot is only the fallback.
    const ownerFig = this._ballOwner ? this._figures.get(this._ballOwner) : null;
    if (ownerFig) handlerPos = { x: ownerFig.group.position.x, z: ownerFig.group.position.z };
    // Camera: fixed sideline TV angle + a very slight lateral drift toward
    // the handler's half (camera and look-target move together, so the
    // framing never rotates).
    // Closer than the whole-court fit, so the camera pans along the court with the ball (eased: a new holder never snaps the view).
    const panTarget = handlerPos ? clamp(handlerPos.z * PAN_FOLLOW, -PAN_LIMIT_M, PAN_LIMIT_M) : 0;
    this._panZ += (panTarget - this._panZ) * (1 - Math.exp(-this._dt * 4));
    this._layoutCamera(this._panZ);
    this._updateBall(now, attackingUp, handlerPos); // a dunk moves its dunker here, so plates are laid out after it
    this._updateAids(now);
    this._updatePlates();
    this._updateEffects(now);
    this._renderer.render(this._scene, this._camera);
    this._publishStats();
  }

  _updateBall(now, attackingUp, handlerPos) {
    const ball = this._ball;
    if (!ball) return;
    if (this._shot || this._dunk || this._ballRest || this._pass) this._glide = null;
    if (this._shot) {
      const s = this._shot;
      if (!s.settling) {
        const u = (now - s.start) / SHOT_FLIGHT_MS;
        if (u < 1) {
          const p = this._shotPoint(s, u);
          ball.position.set(p.x, p.y, p.z);
          ball.visible = true;
          return;
        }
        s.settling = true;
        s.settleStart = now;
        this._landed(s);
      }
      const v = clamp((now - s.settleStart) / SHOT_SETTLE_MS, 0, 1);
      if (s.made) {
        ball.position.set(s.to.x, lerp(RIM_HEIGHT_M, BALL_RADIUS_M, v), s.to.z);
      } else {
        const z = lerp(s.to.z, s.to.z + s.out * MISS_BOUNCE_M, easeOut(v));
        const y = lerp(RIM_HEIGHT_M, BALL_RADIUS_M, v) + Math.sin(v * Math.PI) * 0.5;
        ball.position.set(s.to.x, y, z);
      }
      if (v >= 1) {
        this._ballRest = s.made
          ? { x: s.to.x, z: s.to.z }
          : { x: s.to.x, z: s.to.z + s.out * MISS_BOUNCE_M };
        this._shot = null;
        this._setReplayState("done");
      }
      return;
    }
    if (this._dunk) {
      const d = this._dunk;
      const el = now - d.start;
      const fig = this._figures.get(d.playerId);
      if (el < DUNK_DRIVE_MS) {
        const u = easeOut(el / DUNK_DRIVE_MS);
        const x = lerp(d.from.x, d.to.x, u);
        const z = lerp(d.from.z, d.to.z, u);
        if (fig) {
          fig.group.position.set(x, 0, z);
          fig.pinned = { x, z };
        }
        ball.position.set(x, 1.6, z); // ball in the dunker’s hands
        ball.visible = true;
      } else if (el < DUNK_DRIVE_MS + DUNK_NET_MS) {
        const v = (el - DUNK_DRIVE_MS) / DUNK_NET_MS;
        const jumpY = Math.sin(v * Math.PI) * 0.9;
        if (fig) fig.group.position.set(d.to.x, jumpY, d.to.z);
        if (!d.jumped) {
          d.jumped = true;
          fig?.glb?.trigger("jump", (DUNK_NET_MS + DUNK_SETTLE_MS) / 1000);
        }
        ball.position.set(d.to.x, 1.6 + jumpY + v * 1.2, d.to.z);
        this._rimShakeUntil = now + 150;
        this._flash(0.5);
        if (!d.landed) {
          d.landed = true;
          this._landed({ made: true, pts: 2, side: d.side, shooterId: d.playerId, dunk: true });
        }
      } else if (el < DUNK_TOTAL_MS) {
        const v = (el - DUNK_DRIVE_MS - DUNK_NET_MS) / DUNK_SETTLE_MS;
        if (fig) fig.group.position.set(d.to.x, Math.max(0, 0.9 * (1 - v)), d.to.z);
        ball.position.set(d.to.x, Math.max(BALL_RADIUS_M, RIM_HEIGHT_M - v * 2.93), d.to.z);
      } else {
        if (fig) {
          fig.group.position.set(d.to.x, 0, d.to.z);
          fig.pinned = { x: d.to.x, z: d.to.z };
        }
        ball.position.set(d.to.x, BALL_RADIUS_M, d.to.z);
        this._ballRest = { x: d.to.x, z: d.to.z };
        this._dunk = null;
        this._setReplayState("done");
      }
      return;
    }
    if (this._ballRest) {
      ball.position.set(this._ballRest.x, BALL_RADIUS_M, this._ballRest.z);
      ball.visible = true;
      return;
    }
    if (this._pass) {
      const p = this._pass;
      const a = this._figures.get(p.fromId)?.group.position;
      const b = this._figures.get(p.toId)?.group.position;
      const u = (now - p.start) / PASS_FLIGHT_MS;
      if (a && b && u < 1) {
        // Chest-high arc between the two figures' LIVE spots, so it still lands in the receiver's hands if he is moving.
        ball.position.set(lerp(a.x, b.x, u), 1.3 + Math.sin(Math.PI * u) * 0.5, lerp(a.z, b.z, u));
        ball.visible = true;
        return;
      }
      this._pass = null;
      this._setBallOwner(p.toId);
    }
    // Idle: the ball dribbles with the handler.
    if (handlerPos) {
      let bx = handlerPos.x + 0.35;
      let bz = handlerPos.z + 0.3;
      if (this._glide) {
        const u = clamp((this._clock() - this._glide.start) / BALL_GLIDE_MS, 0, 1);
        const e = easeOut(u);
        bx = lerp(this._glide.from.x, bx, e);
        bz = lerp(this._glide.from.z, bz, e);
        if (u >= 1) this._glide = null;
      }
      ball.position.set(bx, BALL_RADIUS_M + Math.abs(Math.sin(now * 0.006)) * 0.35, bz);
      ball.visible = true;
    } else {
      ball.visible = false;
    }
  }

  /** One flight formula for the ball AND the path line: a Bézier in the floor plane + a real height arc. */
  _shotPoint(s, u) {
    const p = this._arcXZ(s.from, s.to, u);
    return { x: p.x, y: lerp(s.from.y, RIM_HEIGHT_M, u) + Math.sin(Math.PI * u) * 1.3, z: p.z };
  }

  /** Focus ring under the holder / shooter, the ball's shadow, the shot path. */
  _updateAids(now) {
    if (!this._aids) return;
    const fig = this._focusId() ? this._figures.get(this._focusId()) : null;
    const s = this._shot;
    const shot = s ? (s.settling ? 1 : clamp((now - s.start) / SHOT_FLIGHT_MS, 0, 1)) : null;
    if (!s) this._aids.clearShot();
    this._aids.update({
      now,
      focus: fig ? { x: fig.group.position.x, z: fig.group.position.z } : null,
      ball: this._ball ? { x: this._ball.position.x, y: this._ball.position.y, z: this._ball.position.z, visible: this._ball.visible } : null,
      shot,
    });
  }

  /** Meter-scale quadratic Bézier in the floor plane (arcPoint's shape, with
   * a bulge tuned for meters instead of % coordinates). */
  _arcXZ(from, to, u) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const bulge = Math.min(1.2, len * 0.12);
    const cx = (from.x + to.x) / 2 + (-dz / len) * bulge;
    const cz = (from.z + to.z) / 2 + (dx / len) * bulge;
    const v = 1 - u;
    return {
      x: v * v * from.x + 2 * v * u * cx + u * u * to.x,
      z: v * v * from.z + 2 * v * u * cz + u * u * to.z,
    };
  }

  /**
   * A shot or dunk reached the rim, on the presentation clock (so never before the picture). A basket makes the stands, and the
   * scoring side's bench, hop; the controller's `onShotLanded` hook gets the same fact for sound. Visual and audio only: nothing
   * here reads or changes the game.
   */
  _landed({ made, pts = 0, side = "home", shooterId = null, dunk = false }) {
    if (made && !this._reducedMotion) this._env?.cheer?.(dunk || pts >= 3 ? 1.3 : 1, side, this._clock());
    if (made && !this._reducedMotion) {
      // The scorer celebrates; a three or a dunk gets the whole scoring side on its feet.
      for (const fig of this._figures.values()) {
        if (fig.glb && (fig.playerId === shooterId || ((dunk || pts >= 3) && fig.isOffense))) fig.glb.trigger("celebrate");
      }
    }
    try {
      this.onShotLanded?.({ made, pts, side, shooterId, dunk });
    } catch {
      /* a listener must never break the render loop */
    }
  }

  _updateEffects(now) {
    if (this._shakeRim) {
      if (now < this._rimShakeUntil) {
        this._shakeRim.position.x = Math.sin(now * 0.09) * 0.02;
      } else {
        this._shakeRim.position.x = 0;
        this._shakeRim = null;
      }
    }
    if (this._flashEl) {
      const left = Math.max(0, this._flashUntil - now);
      this._flashEl.style.opacity = left > 0 ? String((this._flashPeak * left) / 300) : "0";
    }
  }

  _flash(peak) {
    this._flashPeak = peak;
    this._flashUntil = this._clock() + 300;
  }

  _setReplayState(state) {
    if (this.root && this.root.dataset) this.root.dataset.replayState = state;
  }
}
