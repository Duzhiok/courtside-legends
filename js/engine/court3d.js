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
  clamp,
} from "./court.js";
import { webglAvailable } from "../ui/avatar3d.js";

/** Vendored full Three.js 0.187.0 (three.module.js + three.core.js). The R171
 * avatar bundle is tree-shaken to 13 symbols (no geometry/material classes)
 * and cannot serve a replay view, so the full build is vendored instead.
 * License: js/vendor/THREE_LICENSE.txt (MIT, Three.js Authors 2010–2026). */
export const THREE_URL = new URL("../vendor/three.module.js", import.meta.url).href;

/** Full court: 28.65m × 15.24m (plan §3.3). y=6% is the away hoop, y=94% the home hoop. */
export const COURT_HALF_WIDTH_M = 7.62;
export const COURT_HALF_LENGTH_M = 14.33;
export const RIM_HEIGHT_M = 3.05;
/** Push phase length (mirrors CourtView._paint's ~2.6s). */
export const PUSH_MS = 2600;
/** Shot flight (mirrors CourtView._shotFrame's FLIGHT=750ms); the ball then
 * settles to the floor over SHOT_SETTLE_MS (not part of the flight). */
export const SHOT_FLIGHT_MS = 750;
export const SHOT_SETTLE_MS = 180;
/** Dunk timings (mirror CourtView._dunkFrame: DRIVE 420 + NET 150 + SETTLE 200). */
export const DUNK_DRIVE_MS = 420;
export const DUNK_NET_MS = 150;
export const DUNK_SETTLE_MS = 200;
export const DUNK_TOTAL_MS = DUNK_DRIVE_MS + DUNK_NET_MS + DUNK_SETTLE_MS; // 770
export const BALL_RADIUS_M = 0.12;
/** Miss bounce distance toward midcourt: 2D's 18% of court length, in meters. */
export const MISS_BOUNCE_M = 5.16;
/** The clutch scenario is always 2016 GSW (home) vs CLE (away). */
export const CLUTCH_TEAM_COLORS = Object.freeze({ home: 0x1d428a, away: 0x860038 });

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
export async function loadThreeForReplay(doc) {
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
    return new CourtView3D(container, { ...opts, three: T });
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
    this._raf =
      opts.raf ||
      (typeof requestAnimationFrame === "function" ? requestAnimationFrame : () => 0);
    this._cancelRaf =
      opts.cancelRaf ||
      (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : () => {});
    this._colors = { ...CLUTCH_TEAM_COLORS, ...(opts.colors || {}) };
    this._fov = opts.fov || 50;
    this._disposed = false;
    this._snap = null;
    this._possession = null;
    this._phaseStart = null;
    this._phase = 1;
    this._figures = new Map();
    this._lineupSig = "";
    this._shot = null;
    this._dunk = null;
    this._ballRest = null;
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
    scene.background = new T.Color(0x0d1f16); // deep green, matches the app
    this._scene = scene;

    const camera = new T.PerspectiveCamera(this._fov, 16 / 9, 0.1, 200);
    this._camera = camera;

    const dir = new T.DirectionalLight(0xffffff, 1.6);
    dir.position.set(8, 14, 6);
    scene.add(dir);
    scene.add(new T.AmbientLight(0xffffff, 0.9));

    this._buildFloor(scene);
    this._rims = {
      away: this._buildHoop(scene, -COURT_HALF_LENGTH_M + 1.72).rim,
      home: this._buildHoop(scene, COURT_HALF_LENGTH_M - 1.72).rim,
    };

    const ball = new T.Mesh(
      new T.SphereGeometry(BALL_RADIUS_M, 20, 14),
      new T.MeshStandardMaterial({ color: 0xed7a1a, roughness: 0.6 }),
    );
    ball.visible = false;
    scene.add(ball);
    this._ball = ball;

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
    const floor = new T.Mesh(
      new T.PlaneGeometry(COURT_HALF_WIDTH_M * 2 + 1.4, COURT_HALF_LENGTH_M * 2 + 1.5),
      new T.MeshStandardMaterial({ color: 0xc89b6a, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const lineMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const group = new T.Group();
    const W = COURT_HALF_WIDTH_M;
    const L = COURT_HALF_LENGTH_M;
    const strip = (x1, z1, x2, z2, w = 0.06) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const m = new T.Mesh(new T.BoxGeometry(len, 0.012, w), lineMat);
      m.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
      m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      group.add(m);
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
    this._camera.position.set(dist * 0.94, dist * 0.5, panZ);
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
          this._drawPlate(fig.plate, pos.short, pos.pts);
        }
      }
      return;
    }
    this._lineupSig = sig;
    for (const fig of this._figures.values()) {
      this._scene.remove(fig.group);
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
    return { group, body, head, armL, armR, plate, playerId: pos.playerId, pts: pos.pts, pinned: null };
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
      sprite.scale.set(2.4, 0.6, 1);
      sprite.position.y = 2.5;
      const plate = { sprite, canvas, ctx, texture };
      this._drawPlate(plate, name, pts);
      return plate;
    } catch {
      return null;
    }
  }

  _drawPlate(plate, name, pts) {
    if (!plate) return;
    const { canvas, ctx, texture } = plate;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(6, 20, 14, 0.72)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${name} · ${pts}`, canvas.width / 2, canvas.height / 2 + 1);
    if (texture) texture.needsUpdate = true;
  }

  // ------------------------------------------------------------ interface

  /** CourtView interface: project a snapshot onto the 3D court. Returns a
   * promise that resolves when the push phase reaches its set positions
   * (immediately with reduced motion). */
  render(snap) {
    if (this._disposed) return Promise.resolve();
    this._snap = snap;
    const offSide = snap.possession === "away" ? "away" : "home";
    if (this._possession !== offSide) {
      this._possession = offSide;
      this._phaseStart = this._clock();
      this._shot = null;
      this._dunk = null;
      this._ballRest = null;
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
      this._setReplayState("done");
      return true;
    }
    this._shot = {
      from: { x: fig.group.position.x, y: 2.2, z: fig.group.position.z },
      to,
      start: this._clock(),
      made: !!shot.made,
      out: attackingUp ? 1 : -1,
      settling: false,
      settleStart: 0,
    };
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
    this._figures.clear();
  }

  // ------------------------------------------------------------ frame loop

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
    const positions = snapshotTo3DPositions(snap, phase, tSec);
    let handlerPos = null;
    for (const pos of positions) {
      const fig = this._figures.get(pos.playerId);
      if (!fig) continue;
      // A finished dunk pins the dunker at the rim until the next render.
      const x = fig.pinned ? fig.pinned.x : pos.x;
      const z = fig.pinned ? fig.pinned.z : pos.z;
      fig.group.position.set(x, 0, z);
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
      if (pos.isHandler) handlerPos = { x, z };
    }
    // Camera: fixed sideline TV angle + a very slight lateral drift toward
    // the handler's half (camera and look-target move together, so the
    // framing never rotates).
    const panZ = handlerPos ? clamp(handlerPos.z * 0.06, -0.9, 0.9) : 0;
    this._layoutCamera(panZ);
    this._updateBall(now, attackingUp, handlerPos);
    this._updateEffects(now);
    this._renderer.render(this._scene, this._camera);
  }

  _updateBall(now, attackingUp, handlerPos) {
    const ball = this._ball;
    if (!ball) return;
    if (this._shot) {
      const s = this._shot;
      if (!s.settling) {
        const u = (now - s.start) / SHOT_FLIGHT_MS;
        if (u < 1) {
          // Quadratic Bézier in the floor plane + a real height arc.
          const p = this._arcXZ(s.from, s.to, u);
          const y = lerp(s.from.y, RIM_HEIGHT_M, u) + Math.sin(Math.PI * u) * 1.3;
          ball.position.set(p.x, y, p.z);
          ball.visible = true;
          return;
        }
        s.settling = true;
        s.settleStart = now;
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
        ball.position.set(d.to.x, 1.6 + jumpY + v * 1.2, d.to.z);
        this._rimShakeUntil = now + 150;
        this._flash(0.5);
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
    // Idle: the ball dribbles with the handler.
    if (handlerPos) {
      ball.position.set(
        handlerPos.x + 0.35,
        BALL_RADIUS_M + Math.abs(Math.sin(now * 0.006)) * 0.35,
        handlerPos.z + 0.3,
      );
      ball.visible = true;
    } else {
      ball.visible = false;
    }
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
