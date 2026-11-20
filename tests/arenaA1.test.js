import test from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_IDS, ARENA_PRESETS, DEFAULT_ARENA, QUALITY_PROFILES,
  arenaPreset, chosenArena, chosenQuality, normalizeArenaId, qualityProfile, resolveQuality, writeArenaPref, readArenaPref, writeQualityPref,
} from "../js/engine/arena/arenaPresets.js";
import { paintFloor, makeFloorTexture, shade } from "../js/engine/arena/floorTexture.js";
import { addHoopDetails } from "../js/engine/arena/arenaHoop.js";
import { addArenaLights } from "../js/engine/arena/arenaLights.js";

const HEX = /^#[0-9a-f]{6}$/i;
const memory = (init = {}) => { const m = { ...init }; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

// A recording 2D context: every call is kept with the fillStyle in force, so a test can ask "was the key painted in the paint colour".
function recordingCtx() {
  const calls = [];
  const ctx = { fillStyle: "", globalAlpha: 1, font: "", textAlign: "", textBaseline: "" };
  for (const name of ["fillRect", "save", "restore", "translate", "rotate", "beginPath", "arc", "fill", "lineTo", "closePath", "fillText"]) {
    ctx[name] = (...args) => calls.push({ name, args, fill: ctx.fillStyle, alpha: ctx.globalAlpha });
  }
  return { ctx, calls };
}
const DIMS = { width: 512, height: 928, halfW: 7.62, halfL: 14.33, planeW: 16.64, planeH: 30.16 };

test("three original arenas, each complete, valid colours, one renderer's worth of data", () => {
  assert.deepEqual([...ARENA_IDS], ["classic", "modern", "retro90"]);
  for (const id of ARENA_IDS) {
    const p = ARENA_PRESETS[id];
    assert.equal(p.id, id);
    for (const c of [p.floor.wood, p.floor.border, p.floor.paint, p.floor.lines, p.background, p.shell.wall, p.shell.seat, p.shell.led, p.shell.ledText]) assert.match(c, HEX, `${id} colour ${c}`);
    assert.ok(["parquet", "long-plank", "herringbone"].includes(p.floor.pattern));
    assert.ok(["warm", "broadcast"].includes(p.lighting));
    assert.ok(p.label.zh && p.label.en);
    assert.ok(p.crowd.palette.length >= 4 && p.crowd.skin.length >= 3);
  }
  assert.equal(new Set(ARENA_IDS.map((id) => ARENA_PRESETS[id].floor.pattern)).size, 3, "three different floor patterns");
  assert.equal(new Set(ARENA_IDS.map((id) => ARENA_PRESETS[id].floor.paint)).size, 3, "three different key colours");
});

test("an unknown arena id falls back to the default, never throws", () => {
  assert.equal(normalizeArenaId("nope"), DEFAULT_ARENA);
  assert.equal(normalizeArenaId(undefined), DEFAULT_ARENA);
  assert.equal(arenaPreset("modern").id, "modern");
  assert.equal(arenaPreset("???").id, DEFAULT_ARENA);
});

test("quality: auto is Low on a small/touch screen and High otherwise; Low thins the crowd but keeps the floor", () => {
  assert.equal(resolveQuality("auto", { mobile: true }), "low");
  assert.equal(resolveQuality("auto", { mobile: false }), "high");
  assert.equal(resolveQuality("garbage", { mobile: true }), "low");
  assert.equal(resolveQuality("medium", { mobile: true }), "medium", "an explicit choice beats the device guess");
  assert.ok(QUALITY_PROFILES.low.crowd < QUALITY_PROFILES.medium.crowd && QUALITY_PROFILES.medium.crowd < QUALITY_PROFILES.high.crowd);
  assert.ok(QUALITY_PROFILES.low.floorPx >= 1024, "low still has a real floor texture");
  assert.equal(qualityProfile("low"), QUALITY_PROFILES.low);
});

test("arena choice: URL beats the saved preference beats the default; a broken storage is harmless", () => {
  const saved = memory();
  writeArenaPref(saved, "retro90");
  assert.equal(readArenaPref(saved), "retro90");
  assert.equal(chosenArena("", saved), "retro90");
  assert.equal(chosenArena("?arena=modern", saved), "modern");
  assert.equal(chosenArena("?arena=bogus", saved), "retro90", "a bad URL value does not hide the saved choice");
  assert.equal(chosenArena("", memory()), DEFAULT_ARENA);
  assert.equal(chosenArena("", { getItem() { throw new Error("blocked"); } }), DEFAULT_ARENA);
  assert.equal(writeArenaPref({ setItem() { throw new Error("full"); } }, "modern"), false);
  writeArenaPref(saved, "x-not-an-arena");
  assert.equal(readArenaPref(saved), DEFAULT_ARENA, "only real ids are stored");
  const q = memory();
  writeQualityPref(q, "low");
  assert.equal(chosenQuality("", q), "low");
  assert.equal(chosenQuality("?arenaQuality=high", q), "high");
  assert.equal(chosenQuality("", memory()), "auto");
});

test("floor painting: every pattern lays hundreds of boards, deterministically, and the three arenas differ", () => {
  const paint = (id) => { const { ctx, calls } = recordingCtx(); paintFloor(ctx, ARENA_PRESETS[id], DIMS); return calls; };
  const sig = (calls) => JSON.stringify(calls);
  for (const id of ARENA_IDS) {
    const a = paint(id);
    assert.ok(a.filter((c) => c.name === "fillRect").length > 150, `${id} paints many boards`);
    assert.equal(sig(a), sig(paint(id)), `${id}: same preset, same floor, every time`);
  }
  assert.notEqual(sig(paint("classic")), sig(paint("modern")));
  assert.notEqual(sig(paint("modern")), sig(paint("retro90")));
});

test("floor painting: keys and centre circle use the paint colour, with an emblem and the game's own name", () => {
  for (const id of ARENA_IDS) {
    const { ctx, calls } = recordingCtx();
    paintFloor(ctx, ARENA_PRESETS[id], DIMS);
    const paintCol = ARENA_PRESETS[id].floor.paint;
    const keys = calls.filter((c) => c.name === "fillRect" && c.fill === paintCol);
    assert.equal(keys.length, 2, `${id}: one painted key per end`);
    assert.ok(keys.every((k) => Math.abs(k.args[2] - 4.88 * (DIMS.width / DIMS.planeW)) < 1), "key is 4.88 m wide");
    assert.ok(calls.some((c) => c.name === "arc" && c.fill === paintCol), `${id}: painted centre circle`);
    assert.ok(calls.some((c) => c.name === "lineTo"), `${id}: the star emblem`);
    const names = calls.filter((c) => c.name === "fillText");
    assert.equal(names.length, 2, "one wordmark per baseline");
    assert.ok(names.every((n) => n.args[0] === "COURTSIDE LEGENDS"), "only the game's own name, no borrowed marks");
  }
});

test("shade is a pure channel multiply", () => {
  assert.equal(shade("#808080", 0), "rgb(128,128,128)");
  assert.equal(shade("#ffffff", 0.5), "rgb(255,255,255)");
  assert.equal(shade("#640000", -0.5), "rgb(50,0,0)");
});

test("makeFloorTexture: no DOM or no 2D context gives null; a paint failure gives null (flat wood), never a thrown error", () => {
  const T = { CanvasTexture: class { constructor(c) { this.image = c; } dispose() {} }, SRGBColorSpace: "srgb" };
  const court = { halfW: 7.62, halfL: 14.33, planeW: 16.64, planeH: 30.16 };
  assert.equal(makeFloorTexture(T, null, ARENA_PRESETS.classic, court, 512), null);
  assert.equal(makeFloorTexture(T, { createElement: () => ({ getContext: () => null }) }, ARENA_PRESETS.classic, court, 512), null);
  assert.equal(makeFloorTexture(T, { createElement: () => ({ getContext: () => ({}) }) }, ARENA_PRESETS.classic, court, 512), null, "a half-implemented context");
  const { ctx } = recordingCtx();
  const canvas = { getContext: () => ctx };
  const tex = makeFloorTexture(T, { createElement: () => canvas }, ARENA_PRESETS.modern, court, 512);
  assert.equal(tex.image, canvas);
  assert.equal(canvas.width, 512);
  assert.equal(canvas.height, Math.round((512 * 30.16) / 16.64), "the canvas keeps the floor's aspect");
  assert.equal(tex.colorSpace, "srgb");
});

class Obj { constructor(...a) { this.args = a; this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; this.children = []; } add(...c) { this.children.push(...c); } }
const FakeT = { Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } }, BoxGeometry: class extends Obj {}, MeshStandardMaterial: class extends Obj { constructor(o) { super(); Object.assign(this, o); } },
  DirectionalLight: class extends Obj {}, AmbientLight: class extends Obj {} };

test("hoop trim is on the court side of the glass at both ends, and adds only to the hoop group", () => {
  for (const s of [-1, 1]) {
    const rimZ = s * (14.33 - 1.72);
    const group = new Obj();
    addHoopDetails(FakeT, group, { rimZ, s, rimY: 3.05, padColor: "#216747" });
    const boardZ = rimZ + s * 0.45;
    assert.ok(group.children.length >= 10, "frame, square, bracket, pad");
    const squares = group.children.filter((m) => m.material.color === 0xd0352b);
    assert.equal(squares.length, 4, "shooter's square has four sides");
    for (const q of squares) assert.ok(s * (q.position.z - boardZ) < 0, "painted on the face toward the court, not behind the glass");
    const pad = group.children.find((m) => m.material.color === "#216747");
    assert.ok(pad, "the pad takes the arena accent colour");
    assert.ok(Math.abs(pad.position.z - (rimZ + s * 1.0)) < 1e-9, "pad sits on the existing post");
  }
});

test("lights: a key and ambient always; the hemisphere light only where the THREE-like has one", () => {
  const scene = new Obj();
  addArenaLights(FakeT, scene, "broadcast");
  assert.equal(scene.children.length, 2);
  const withHemi = new Obj();
  addArenaLights({ ...FakeT, HemisphereLight: class extends Obj {} }, withHemi, "warm");
  assert.equal(withHemi.children.length, 3);
  assert.doesNotThrow(() => addArenaLights(FakeT, new Obj(), "unknown-rig"), "an unknown rig falls back to warm");
});
