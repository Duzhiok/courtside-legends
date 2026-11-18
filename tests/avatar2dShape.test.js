import test from "node:test";
import assert from "node:assert/strict";
import { AXIS_X, FEET_Y, NEUTRAL_SHAPE, REGIONS, RESHAPE_FROM, RESHAPE_TO, STRIP, applyBodyShape, isNeutralShape, rowScale, shapeFromLook, window4 } from "../js/ui/avatar2d/avatar2dShape.js";
import { BODY_PRESETS, DEFAULT_LOOK } from "../js/data/avatarLook.js";
import { mountAvatar2d } from "../js/ui/avatar2d/avatar2dRenderer.js";

const BROAD = shapeFromLook({ body: "broad" });
const SLIM = shapeFromLook({ body: "slim" });

test("window4: zero outside, one inside, smooth (monotonic) ramps", () => {
  const w = [100, 200, 300, 400];
  assert.equal(window4(50, w), 0);
  assert.equal(window4(450, w), 0);
  assert.equal(window4(250, w), 1);
  let last = 0;
  for (let y = 100; y <= 200; y += 10) { const v = window4(y, w); assert.ok(v >= last); last = v; }
  assert.ok(window4(150, w) > 0 && window4(150, w) < 1);
});

test("the head, the neck and the feet are never scaled sideways, whatever the build", () => {
  for (const shape of [BROAD, SLIM, { shoulders: 0.3, arms: 0.3, waist: 0.3, legs: 0.3, height: 0 }]) {
    for (const y of [0, 73, 150, 280, RESHAPE_FROM - 1, RESHAPE_TO + 1, 1463, 1535]) assert.equal(rowScale(y, shape), 1, `row ${y}`);
  }
});

test("Standard is the neutral shape (the renderer skips the pass); Broad is wider and Slim narrower in every body region", () => {
  assert.ok(isNeutralShape(shapeFromLook({ body: "standard" })));
  assert.ok(!isNeutralShape(BROAD) && !isNeutralShape(SLIM));
  for (const [region, [, b, c]] of Object.entries(REGIONS)) {
    const mid = (b + c) / 2;
    assert.ok(rowScale(mid, BROAD) > 1.05, `${region}: broad is at least 5% wider at the middle of the region`);
    assert.ok(rowScale(mid, SLIM) < 0.95, `${region}: slim is at least 5% narrower at the middle of the region`);
  }
  // The region ramps keep neighbouring rows close: no step in the silhouette.
  for (let y = RESHAPE_FROM; y < RESHAPE_TO - 1; y += 1) assert.ok(Math.abs(rowScale(y, BROAD) - rowScale(y + 1, BROAD)) < 0.01, `row ${y}`);
});

test("a junk or missing look never throws and falls back to the neutral shape; every preset declares a full shape", () => {
  for (const look of [null, undefined, {}, { body: "nope" }, { body: 7 }]) assert.deepEqual(shapeFromLook(look), NEUTRAL_SHAPE);
  for (const preset of BODY_PRESETS) for (const key of Object.keys(NEUTRAL_SHAPE)) assert.ok(Number.isFinite(preset.shape?.[key]), `${preset.id}.${key}`);
  assert.equal(shapeFromLook(DEFAULT_LOOK).shoulders, 0);
});

test("applyBodyShape copies the head and the feet whole, and covers every strip in between exactly once", () => {
  const ops = [];
  const dst = { getContext: () => ({ clearRect() {}, save() {}, restore() {}, translate: (...a) => ops.push(["translate", ...a]), scale: (...a) => ops.push(["scale", ...a]), drawImage: (...a) => ops.push(["draw", ...a.slice(1)]) }) };
  applyBodyShape({}, dst, { ...BROAD, height: 0.05 });
  const draws = ops.filter((o) => o[0] === "draw");
  assert.deepEqual(draws[0].slice(1, 5), [0, 0, 1024, RESHAPE_FROM]);
  assert.deepEqual(draws.at(-1).slice(1, 3), [0, RESHAPE_TO]);
  const strips = draws.slice(1, -1);
  assert.equal(strips.length, Math.ceil((RESHAPE_TO - RESHAPE_FROM) / STRIP));
  strips.forEach((d, i) => assert.equal(d[2], RESHAPE_FROM + i * STRIP, "contiguous, no gap, no overlap"));
  for (const d of strips) assert.ok(Math.abs(d[5] - AXIS_X * (1 - d[7] / 1024)) < 1e-6, "scaled about the body axis x = 510 (a point at x maps to 510 + (x - 510) * s)");
  const scale = ops.find((o) => o[0] === "scale");
  assert.deepEqual(scale.slice(1), [1.05, 1.05]);
  const translate = ops.find((o) => o[0] === "translate");
  assert.ok(Math.abs(translate[2] - FEET_Y * (1 - 1.05)) < 1e-9, "a taller figure grows upward from the feet");
});

function fakeEnv() {
  const all = [];
  const create = (width, height) => {
    const ops = [];
    const ctx = new Proxy({ drawImage: (img, ...a) => ops.push(["draw", img.tag, ...a]) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true });
    const c = { width, height, dataset: {}, style: {}, tag: `c${all.length}`, ops, getContext: () => ctx, toDataURL: () => "data:image/jpeg;base64,xx", remove() {} };
    all.push(c);
    return c;
  };
  return { all, create };
}
const art = async (file) => ({ tag: file });
const host = () => ({ appendChild() {} });

test("renderer: a standard build is drawn straight; a broad one is re-shaped, shown, and the portrait is cut from the re-shaped copy", async () => {
  const std = fakeEnv();
  const h1 = await mountAvatar2d(host(), { look: DEFAULT_LOOK, createCanvas: std.create, loadImage: art });
  assert.equal(std.all.length, 4 - 1 + 0, "no extra canvas for a standard build (art, display, scratch)");
  assert.deepEqual(h1.inspect().shape, NEUTRAL_SHAPE);
  h1.dispose();

  const env = fakeEnv();
  const h2 = await mountAvatar2d(host(), { look: { ...DEFAULT_LOOK, body: "broad" }, createCanvas: env.create, loadImage: art });
  assert.ok(h2.inspect().shape.shoulders > 0);
  assert.equal(h2.canvas.dataset.shape, JSON.stringify(BROAD));
  const shaped = env.all.find((c) => c.ops.filter((o) => o[0] === "draw").length > 300);
  assert.ok(shaped, "a canvas received the strip passes");
  h2.capturePortrait();
  const portrait = env.all.find((c) => c.width === 256);
  assert.equal(portrait.ops.at(-1)[1], shaped.tag, "the portrait is cut from the re-shaped figure, not the flat art");
  await h2.setLook({ ...DEFAULT_LOOK, body: "standard" });
  assert.deepEqual(h2.inspect().shape, NEUTRAL_SHAPE);
  h2.capturePortrait();
  const flat = env.all.filter((c) => c.width === 256).at(-1);
  assert.notEqual(flat.ops.at(-1)[1], shaped.tag, "back to Standard: the portrait is cut from the flat art again");
});
