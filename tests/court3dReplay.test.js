import test from "node:test";
import assert from "node:assert/strict";
import { CourtView } from "../js/engine/court.js";
import {
  CourtView3D,
  snapshotTo3DPositions,
  captureClutchReplaySnapshot,
  buildReplayShot,
  fitCameraDistance,
  courtPercentToVec3,
  rimVec3,
  PUSH_MS,
  SHOT_FLIGHT_MS,
  SHOT_SETTLE_MS,
  DUNK_TOTAL_MS,
  RIM_HEIGHT_M,
  MISS_BOUNCE_M,
} from "../js/engine/court3d.js";

// The 3D view's rAF loop never runs in Node; tests drive tick(now) manually.
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

// ---- element stubs (same shape as tests/courtSimple.test.js) --------------

function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => {
      if (force === undefined) set.has(c) ? set.delete(c) : set.add(c);
      else if (force) set.add(c);
      else set.delete(c);
    },
    contains: (c) => set.has(c),
  };
}

function makeEl() {
  const children = [];
  const bySelector = new Map();
  let html = "";
  return {
    tagName: "DIV",
    className: "",
    get innerHTML() {
      return html;
    },
    set innerHTML(v) {
      html = v;
      if (v === "") children.length = 0;
    },
    textContent: "",
    style: {},
    children,
    dataset: {},
    classList: makeClassList(),
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    removeChild: (child) => {
      const i = children.indexOf(child);
      if (i >= 0) children.splice(i, 1);
      return child;
    },
    remove: () => {},
    querySelector: (sel) => {
      if (!bySelector.has(sel)) {
        bySelector.set(sel, { textContent: "", classList: makeClassList(), style: {} });
      }
      return bySelector.get(sel);
    },
    addEventListener: () => {},
  };
}

function makeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      fillText: () => {},
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
    }),
  };
}

globalThis.document = { createElement: (tag) => (tag === "canvas" ? makeCanvas() : makeEl()) };

function makeRoot() {
  const parts = {
    "#court-stage": makeEl(),
    "#court-tokens": makeEl(),
    "#court-ball": makeEl(),
    "#court-formation": makeEl(),
    "#court-mode-btn": makeEl(),
  };
  return {
    querySelector: (sel) => parts[sel] || null,
    innerHTML: "",
    _parts: parts,
  };
}

function makeContainer() {
  const el = makeEl();
  el.clientWidth = 800;
  el.clientHeight = 450;
  return el;
}

// ---- fake THREE (records what the view does; renders nothing) -------------

class FakeVec {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
}
class FakeObj {
  constructor() {
    this.position = new FakeVec();
    this.rotation = new FakeVec();
    this.scale = new FakeVec(1, 1, 1);
    this.children = [];
    this.visible = true;
  }
  add(...c) {
    this.children.push(...c);
    return this;
  }
  remove(...c) {
    for (const x of c) {
      const i = this.children.indexOf(x);
      if (i >= 0) this.children.splice(i, 1);
    }
    return this;
  }
  lookAt() {}
  updateProjectionMatrix() {}
}
class FakeMesh extends FakeObj {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
class FakeGeo {
  constructor(...args) {
    this.args = args;
  }
}
class FakeRenderer {
  constructor() {
    this.domElement = { style: {} };
    this.renderCalls = 0;
    this.size = { w: 0, h: 0 };
  }
  setPixelRatio() {}
  setSize(w, h) {
    this.size = { w, h };
  }
  render() {
    this.renderCalls++;
  }
  dispose() {}
}
class FakeTexture {
  constructor(canvas) {
    this.image = canvas;
    this.needsUpdate = false;
  }
}
class FakeCamera extends FakeObj {
  constructor(fov, aspect, near, far) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
  }
}
class FakeColor {
  constructor(v) {
    this.value = v;
  }
}
const FakeThree = {
  Scene: FakeObj,
  PerspectiveCamera: FakeCamera,
  WebGLRenderer: FakeRenderer,
  Group: FakeObj,
  Mesh: FakeMesh,
  CapsuleGeometry: FakeGeo,
  SphereGeometry: FakeGeo,
  PlaneGeometry: FakeGeo,
  BoxGeometry: FakeGeo,
  TorusGeometry: FakeGeo,
  CylinderGeometry: FakeGeo,
  RingGeometry: FakeGeo,
  MeshStandardMaterial: FakeGeo,
  MeshBasicMaterial: FakeGeo,
  CanvasTexture: FakeTexture,
  Sprite: FakeMesh,
  SpriteMaterial: FakeGeo,
  DirectionalLight: FakeObj,
  AmbientLight: FakeObj,
  Color: FakeColor,
  Vector3: FakeVec,
  SRGBColorSpace: "srgb",
};

// ---- fixtures ---------------------------------------------------------------

function player(id, name, pos, pts = 0) {
  return { id, name, cardName: name, pos, playPos: pos, stats: { pts } };
}

/** The clutch scenario: 2016 GSW (home, you) vs CLE (away), Q4, 12s, 97–100. */
function clutchSnap() {
  return {
    quarter: 4,
    clock: 12,
    score: { home: 97, away: 100 },
    possession: "home",
    youSide: "home",
    home: {
      name: "勇士",
      tactic: { id: "balanced", name: "均衡" },
      onCourt: [
        player("gsw-curry", "Stephen Curry", "PG", 24),
        player("gsw-klay", "Klay Thompson", "SG", 18),
        player("gsw-barnes", "Harrison Barnes", "SF", 9),
        player("gsw-green", "Draymond Green", "PF", 11),
        player("gsw-bogut", "Andrew Bogut", "C", 4),
      ],
    },
    away: {
      name: "骑士",
      tactic: { id: "balanced", name: "均衡" },
      onCourt: [
        player("cle-irving", "Kyrie Irving", "PG", 27),
        player("cle-smith", "J.R. Smith", "SG", 12),
        player("cle-james", "LeBron James", "SF", 31),
        player("cle-love", "Kevin Love", "PF", 15),
        player("cle-thompson", "Tristan Thompson", "C", 8),
      ],
    },
  };
}

function deepFreeze(o) {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** Drive a view to its set positions (push phase done) with a fake clock. */
function makeView(opts = {}) {
  let nowMs = 0;
  const container = makeContainer();
  const view = new CourtView3D(container, {
    three: FakeThree,
    clock: () => nowMs,
    reducedMotion: false,
    ...opts,
  });
  return { view, container, setNow: (v) => { nowMs = v; } };
}

async function settle(view, snap) {
  const p = view.render(snap);
  view.tick(0);
  view.tick(PUSH_MS);
  await p;
}

// ---- pure mapping -----------------------------------------------------------

test("courtPercentToVec3 maps the 2D % court to meters (plan §3.3)", () => {
  const away = courtPercentToVec3(50, 6);
  assert.deepEqual([away.x, away.z], [0, -12.6104]);
  const home = courtPercentToVec3(50, 94);
  assert.deepEqual([home.x, home.z], [0, 12.6104]);
  assert.deepEqual([courtPercentToVec3(0, 50).x, courtPercentToVec3(100, 50).x], [-7.62, 7.62]);
  assert.deepEqual(rimVec3(true), { x: 0, y: RIM_HEIGHT_M, z: -12.6104 });
  assert.deepEqual(rimVec3(false), { x: 0, y: RIM_HEIGHT_M, z: 12.6104 });
});

test("fitCameraDistance fits the court wide and portrait", () => {
  assert.ok(Math.abs(fitCameraDistance(16 / 9) - 19.1) < 0.1);
  assert.ok(fitCameraDistance(0.5) > fitCameraDistance(16 / 9));
  assert.ok(fitCameraDistance(0.5) <= 75);
  assert.ok(fitCameraDistance(3) >= 16);
});

// ---- 1:1 with CourtView -----------------------------------------------------

test("snapshotTo3DPositions matches CourtView token positions 1:1 for the same snapshot", () => {
  const snap1 = clutchSnap();
  const snap2 = clutchSnap();
  const realNow = performance.now;
  try {
    performance.now = () => 10000;
    const view = new CourtView(makeRoot());
    view.render(snap1); // push starts: phase 0, _phaseStart = 10000
    performance.now = () => 13000;
    view.render(snap2); // elapsed 3000ms -> phase 1, drift at t = 13s
    assert.equal(view._phase, 1);
    const expected = snapshotTo3DPositions(snap2, 1, 13);
    assert.equal(expected.length, 10);
    assert.equal(expected.filter((p) => p.side === "home").length, 5);
    assert.equal(expected.filter((p) => p.side === "away").length, 5);
    assert.equal(expected.find((p) => p.isHandler)?.playerId, "gsw-curry");
    for (const pos of expected) {
      const tok = view._lastTokenPos.get(`${pos.side}-${pos.playerId}`);
      assert.ok(tok, `2D token missing for ${pos.playerId}`);
      const m2d = courtPercentToVec3(tok.x, tok.y);
      assert.ok(
        Math.abs(m2d.x - pos.x) < 1e-9 && Math.abs(m2d.z - pos.z) < 1e-9,
        `${pos.playerId}: 2D (${m2d.x}, ${m2d.z}) vs 3D (${pos.x}, ${pos.z})`,
      );
    }
  } finally {
    performance.now = realNow;
  }
});

test("CourtView3D has the same render/onShot/onDunk interface as CourtView", () => {
  for (const m of ["render", "onShot", "onDunk"]) {
    assert.equal(typeof CourtView.prototype[m], "function", `CourtView.${m}`);
    assert.equal(typeof CourtView3D.prototype[m], "function", `CourtView3D.${m}`);
  }
});

// ---- replay data (pure) -----------------------------------------------------

test("buildReplayShot decides shot vs dunk vs none from the settled outcome", () => {
  assert.deepEqual(
    buildReplayShot({ attempted: true, actualShooterId: "gsw-curry", made: true, points: 3 }, null),
    { kind: "shot", shooterId: "gsw-curry", made: true, pts: 3 },
  );
  // The actual shooter also dunked (separate sim event) -> a dunk, not a jumper.
  assert.deepEqual(
    buildReplayShot({ attempted: true, actualShooterId: "gsw-curry", made: true, points: 2 }, "gsw-curry"),
    { kind: "dunk", shooterId: "gsw-curry" },
  );
  // A dunk by someone else does not turn this shot into a dunk.
  assert.equal(
    buildReplayShot({ attempted: true, actualShooterId: "gsw-curry", made: false, points: 0 }, "cle-james").kind,
    "shot",
  );
  assert.equal(buildReplayShot({ attempted: false, reason: "turnover" }, null), null);
  assert.equal(buildReplayShot({ attempted: false, reason: "no_possession" }, null), null);
  assert.equal(buildReplayShot({ attempted: true, actualShooterId: null }, null), null);
  assert.equal(buildReplayShot(null, null), null);
});

test("captureClutchReplaySnapshot slims the snapshot and freezes the possession", () => {
  const snap = clutchSnap();
  snap.timeouts = { home: 2, away: 1 };
  snap.momentum = { home: 3 };
  snap.home.roster = [{ id: "bench", name: "Bench" }];
  const cap = captureClutchReplaySnapshot(snap);
  assert.equal(cap.quarter, 4);
  assert.equal(cap.clock, 12);
  assert.deepEqual(cap.score, { home: 97, away: 100 });
  assert.equal(cap.possession, "home");
  assert.equal(cap.home.onCourt.length, 5);
  assert.equal(cap.home.onCourt[0].stats.pts, 24);
  assert.equal(cap.timeouts, undefined);
  assert.equal(cap.momentum, undefined);
  assert.equal(cap.home.roster, undefined);
  // Mutating the live snapshot afterwards must not change the capture.
  snap.home.onCourt[0].stats.pts = 99;
  snap.score.home = 120;
  assert.equal(cap.home.onCourt[0].stats.pts, 24);
  assert.equal(cap.score.home, 97);
});

// ---- CourtView3D with the fake THREE ---------------------------------------

test("CourtView3D renders 10 figures and dribbles with the handler", async () => {
  const { view, container } = makeView();
  const snap = clutchSnap();
  await settle(view, snap);
  assert.equal(view._figures.size, 10);
  assert.equal(container.dataset.replayState, "pushing");
  // Figures sit exactly where snapshotTo3DPositions puts them at t = 2.6s.
  const expected = snapshotTo3DPositions(snap, 1, PUSH_MS / 1000);
  for (const pos of expected) {
    const fig = view._figures.get(pos.playerId);
    assert.ok(fig, `figure missing for ${pos.playerId}`);
    assert.ok(Math.abs(fig.group.position.x - pos.x) < 1e-9, `${pos.playerId} x`);
    assert.ok(Math.abs(fig.group.position.z - pos.z) < 1e-9, `${pos.playerId} z`);
    assert.ok(fig.plate, `${pos.playerId} keeps a name plate`);
  }
  // Ball dribbles with the handler (Curry, the PG).
  assert.equal(view._ball.visible, true);
  assert.ok(view._ball.position.y >= 0.12 && view._ball.position.y <= 0.47);
  const curry = view._figures.get("gsw-curry").group.position;
  assert.ok(Math.abs(view._ball.position.x - (curry.x + 0.35)) < 1e-9);
  assert.ok(view._renderer.renderCalls > 0);
});

test("onShot: made shot arcs up and lands under the rim; miss bounces toward midcourt", async () => {
  const { view, setNow } = makeView();
  await settle(view, clutchSnap());
  setNow(PUSH_MS);
  assert.equal(view.onShot({ shooterId: "gsw-curry", made: true }), true);
  view.tick(PUSH_MS + SHOT_FLIGHT_MS / 2);
  assert.ok(view._ball.position.y > 3.5, `mid-flight height ${view._ball.position.y}`);
  view.tick(PUSH_MS + SHOT_FLIGHT_MS);
  view.tick(PUSH_MS + SHOT_FLIGHT_MS + SHOT_SETTLE_MS);
  assert.equal(view._shot, null);
  assert.ok(Math.abs(view._ball.position.z - rimVec3(true).z) < 1e-9, "made: under the rim");
  assert.ok(Math.abs(view._ball.position.y - 0.12) < 1e-9, "made: on the floor");
  assert.equal(view.root.dataset.replayState, "done");

  // Miss: same flight, then a bounce toward midcourt (out = +1 for home attacking up).
  const { view: v2, setNow: setNow2 } = makeView();
  await settle(v2, clutchSnap());
  setNow2(PUSH_MS);
  assert.equal(v2.onShot({ shooterId: "gsw-curry", made: false }), true);
  v2.tick(PUSH_MS + SHOT_FLIGHT_MS);
  v2.tick(PUSH_MS + SHOT_FLIGHT_MS + SHOT_SETTLE_MS);
  assert.equal(v2._shot, null);
  assert.ok(
    Math.abs(v2._ball.position.z - (rimVec3(true).z + MISS_BOUNCE_M)) < 1e-9,
    `miss: bounced to ${v2._ball.position.z}`,
  );
  assert.equal(v2.root.dataset.replayState, "done");

  // Unknown shooter: no shot starts (same guard as CourtView.onShot).
  const { view: v3 } = makeView();
  await settle(v3, clutchSnap());
  assert.equal(v3.onShot({ shooterId: "nope", made: true }), false);
});

test("onDunk: slide, jump and dunk finish within 1000ms", async () => {
  assert.ok(DUNK_TOTAL_MS <= 1000, `dunk total ${DUNK_TOTAL_MS}ms`);
  const { view, setNow } = makeView();
  const snap = clutchSnap();
  await settle(view, snap);
  setNow(PUSH_MS);
  const fig = view._figures.get("gsw-curry");
  const startZ = fig.group.position.z;
  assert.equal(view.onDunk("gsw-curry"), true);
  view.tick(PUSH_MS + 210); // mid-drive: between the set spot and the rim
  assert.ok(fig.group.position.z < startZ && fig.group.position.z > rimVec3(true).z);
  view.tick(PUSH_MS + 420 + 75); // mid-net: airborne
  assert.ok(fig.group.position.y > 0.5, `jump height ${fig.group.position.y}`);
  view.tick(PUSH_MS + DUNK_TOTAL_MS);
  assert.equal(view._dunk, null);
  assert.ok(Math.abs(fig.group.position.z - rimVec3(true).z) < 1e-9, "dunker stays at the rim");
  assert.ok(Math.abs(view._ball.position.z - rimVec3(true).z) < 1e-9, "ball under the rim");
  assert.equal(view.root.dataset.replayState, "done");
});

test("reduced motion: set positions at once, shot lands immediately, no dunk", async () => {
  const { view } = makeView({ reducedMotion: true });
  const snap = clutchSnap();
  await view.render(snap);
  assert.equal(view._phase, 1);
  const expected = snapshotTo3DPositions(snap, 1, 0);
  for (const pos of expected) {
    const fig = view._figures.get(pos.playerId);
    assert.ok(Math.abs(fig.group.position.x - pos.x) < 1e-9);
  }
  assert.equal(view.onShot({ shooterId: "gsw-curry", made: true }), true);
  assert.ok(Math.abs(view._ball.position.z - rimVec3(true).z) < 1e-9);
  assert.equal(view.root.dataset.replayState, "done");
  assert.equal(view.onDunk("gsw-curry"), false);
});

test("render never mutates the snapshot (frozen replay snapshot)", async () => {
  const { view } = makeView();
  const snap = deepFreeze(clutchSnap());
  await settle(view, snap);
  view.onShot({ shooterId: "gsw-curry", made: true });
  view.tick(PUSH_MS + SHOT_FLIGHT_MS + SHOT_SETTLE_MS);
  assert.equal(view._figures.size, 10);
});

test("WebGL missing: CourtView3D.create rejects so the app stays on the 2D result", async () => {
  const noWebglDoc = { createElement: () => ({ getContext: () => null }) };
  await assert.rejects(
    CourtView3D.create(makeContainer(), { doc: noWebglDoc }),
    /WebGL unavailable/,
  );
});

test("dispose stops the view and resolves a pending push", async () => {
  const { view } = makeView();
  const p = view.render(clutchSnap());
  view.dispose();
  assert.equal(view._disposed, true);
  await p; // must not hang
  view.tick(99999); // no-op after dispose
  assert.equal(view._renderer.renderCalls, 0);
});
