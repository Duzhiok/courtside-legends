import test from "node:test";
import assert from "node:assert/strict";
import {
  ARM_ANCHORS, AXIS_X, FEET_Y, LEG_ANCHORS, NEUTRAL_SHAPE, REGIONS, RESHAPE_FROM, RESHAPE_TO, STAGE_FIT, STRIP,
  anchorsAt, applyBodyShape, figureScale, portraitCropFor, rowOps, rowScale, shapeFromLook, window4,
} from "../js/ui/avatar2d/avatar2dShape.js";
import { BODY_PRESETS, DEFAULT_LOOK } from "../js/data/avatarLook.js";
import { PORTRAIT_CROP } from "../js/ui/avatar2d/avatar2dLayers.js";
import { mountAvatar2d } from "../js/ui/avatar2d/avatar2dRenderer.js";

const only = (key, value) => ({ ...NEUTRAL_SHAPE, [key]: value });
const mid = ([, b, c]) => (b + c) / 2;

test("window4: zero outside, one inside, smooth (monotonic) ramps", () => {
  const w = [100, 200, 300, 400];
  assert.equal(window4(50, w), 0);
  assert.equal(window4(450, w), 0);
  assert.equal(window4(250, w), 1);
  let last = 0;
  for (let y = 100; y <= 200; y += 10) { const v = window4(y, w); assert.ok(v >= last); last = v; }
  assert.ok(window4(150, w) > 0 && window4(150, w) < 1);
});

test("the head, the neck and the feet are never re-cut sideways, whatever the build", () => {
  const extreme = { shoulders: 0.3, arms: 0.45, waist: 0.3, legs: 0.3, height: 0.19 };
  for (const y of [0, 73, 150, 280, RESHAPE_FROM - 1, RESHAPE_TO + 1, 1463, 1535]) {
    assert.equal(rowScale(y, extreme), 1, `row ${y}`);
    assert.deepEqual(rowOps(y, extreme), [{ sx: 0, sw: 1024, dx: 0, dw: 1024 }], `row ${y}`);
  }
});

test("a neutral shape is the plain row everywhere: nothing is moved, only the stage fit and height scale the whole figure", () => {
  for (let y = RESHAPE_FROM; y < RESHAPE_TO; y += 7) assert.deepEqual(rowOps(y, NEUTRAL_SHAPE), [{ sx: 0, sw: 1024, dx: 0, dw: 1024 }], `row ${y}`);
});

test("shoulders and waist scale the whole row about the body axis, each only in its own rows", () => {
  const sh = only("shoulders", 0.2);
  assert.ok(Math.abs(rowScale(mid(REGIONS.shoulders), sh) - 1.2) < 1e-9);
  assert.equal(rowScale(mid(REGIONS.waist), sh), 1, "shoulders do not touch the waist");
  const wa = only("waist", -0.2);
  assert.ok(Math.abs(rowScale(mid(REGIONS.waist), wa) - 0.8) < 1e-9);
  assert.equal(rowScale(mid(REGIONS.shoulders), wa), 1, "the waist does not touch the shoulders");
  // no step in the silhouette
  for (let y = RESHAPE_FROM; y < RESHAPE_TO - 1; y += 1) assert.ok(Math.abs(rowScale(y, { ...NEUTRAL_SHAPE, shoulders: 0.24, waist: 0.28 }) - rowScale(y + 1, { ...NEUTRAL_SHAPE, shoulders: 0.24, waist: 0.28 })) < 0.01, `row ${y}`);
});

test("arms: only the arms change, they thicken away from the torso (the inner edge stays), and the torso and legs do not move", () => {
  const y = mid(REGIONS.arms);
  const [oL, iL, iR, oR] = anchorsAt(ARM_ANCHORS, y);
  const thick = rowOps(y, only("arms", 0.4));
  assert.equal(thick.length, 3, "left arm | torso | right arm");
  const [left, torso, right] = thick;
  assert.equal(left.dx + left.dw, iL, "the left arm's inner edge does not move");
  assert.equal(right.dx, iR, "the right arm's inner edge does not move");
  assert.deepEqual([torso.sx, torso.sw, torso.dx, torso.dw], [iL, iR - iL, iL, iR - iL], "the torso is copied as it is");
  assert.ok(left.dw > left.sw * 1.35 && right.dw > right.sw * 1.35, "each arm is about 40% thicker");
  assert.ok(left.dx < left.sx && right.dx + right.dw > right.sx + right.sw, "the outer edges move outward");
  const thin = rowOps(y, only("arms", -0.4));
  assert.ok(thin[0].dw < thin[0].sw * 0.65 && thin[2].dw < thin[2].sw * 0.65);
  assert.ok(oL < iL && iR < oR);
  // other regions: untouched
  for (const row of [mid(REGIONS.shoulders) - 100, mid(REGIONS.waist) + 120, mid(REGIONS.legs)]) assert.equal(rowOps(row, only("arms", 0.4)).length, 1, `row ${row}`);
});

test("legs: each leg scales about its OWN centre line, so the legs thicken without spreading apart; arms and torso rows do not move", () => {
  const y = mid(REGIONS.legs);
  const [a1, b1, a2, b2] = anchorsAt(LEG_ANCHORS, y);
  const c1 = (a1 + b1) / 2;
  const c2 = (a2 + b2) / 2;
  const [left, right] = rowOps(y, only("legs", 0.3));
  const centreAfter = (op, c) => op.dx + (c - op.sx) * (op.dw / op.sw);
  assert.ok(Math.abs(centreAfter(left, c1) - c1) < 1e-6, "left leg keeps its centre");
  assert.ok(Math.abs(centreAfter(right, c2) - c2) < 1e-6, "right leg keeps its centre");
  assert.ok(Math.abs(left.dw / left.sw - 1.3) < 1e-9 && Math.abs(right.dw / right.sw - 1.3) < 1e-9, "each leg is 30% thicker");
  const thin = rowOps(y, only("legs", -0.3));
  assert.ok(thin[0].dw / thin[0].sw < 0.75, "thinner legs");
  for (const row of [mid(REGIONS.shoulders), 700]) assert.equal(rowOps(row, only("legs", 0.3)).length, 1, `row ${row}`);
});

test("independence: changing one control never changes another control's rows", () => {
  const base = { shoulders: 0.1, arms: -0.2, waist: 0.15, legs: 0.1, height: 0 };
  const rowsOf = (shape, from, to) => { const out = []; for (let y = from; y < to; y += 6) out.push(JSON.stringify(rowOps(y, shape))); return out.join("|"); };
  const [s0, s1] = REGIONS.shoulders, [l0] = REGIONS.legs;
  assert.equal(rowsOf(base, l0 + 60, 1395), rowsOf({ ...base, shoulders: -0.2, arms: 0.4 }, l0 + 60, 1395), "leg rows ignore shoulders and arms");
  assert.equal(rowsOf(base, s0, REGIONS.arms[0]), rowsOf({ ...base, legs: -0.3, waist: -0.2 }, s0, REGIONS.arms[0]), "shoulder-only rows ignore legs and waist");
  assert.ok(s1 > s0);
});

test("anchors: the sampled rows are sorted, interpolate in between and clamp at the ends", () => {
  for (const table of [ARM_ANCHORS, LEG_ANCHORS]) {
    for (let i = 1; i < table.length; i += 1) assert.ok(table[i][0] > table[i - 1][0]);
    assert.deepEqual(anchorsAt(table, 0), table[0].slice(1));
    assert.deepEqual(anchorsAt(table, 9999), table.at(-1).slice(1));
  }
  const [mid1] = [anchorsAt(ARM_ANCHORS, 530)];
  assert.deepEqual(mid1, ARM_ANCHORS[0].slice(1).map((v, k) => (v + ARM_ANCHORS[1][k + 1]) / 2));
  for (const [, a, b, c, d] of ARM_ANCHORS) assert.ok(a < b && b < c && c < d, "left outer < left inner < right inner < right outer");
  for (const [, a, b, c, d] of LEG_ANCHORS) assert.ok(a < b && b < c && c < d, "left leg, then right leg");
});

test("a custom build wins over the preset; a junk or missing look never throws and falls back to the neutral shape", () => {
  for (const look of [null, undefined, {}, { body: "nope" }, { body: 7 }]) assert.deepEqual(shapeFromLook(look), NEUTRAL_SHAPE);
  for (const preset of BODY_PRESETS) for (const key of Object.keys(NEUTRAL_SHAPE)) assert.ok(Number.isFinite(preset.shape?.[key]), `${preset.id}.${key}`);
  const custom = shapeFromLook({ body: "broad", build: { height: 200, shoulders: 0, waist: 50, arms: 100, legs: 50 } });
  assert.ok(custom.shoulders < 0 && custom.arms > 0 && custom.waist === 0 && custom.height > 0.07, "the sliders, not the Broad preset");
  assert.deepEqual(shapeFromLook({ body: "broad", build: "junk" }), shapeFromLook({ body: "broad" }));
});

test("height scales the whole figure about the feet and the tallest height still fits under the top of the canvas", () => {
  const tallest = shapeFromLook({ build: { height: 220, shoulders: 50, waist: 50, arms: 50, legs: 50 } });
  const shortest = shapeFromLook({ build: { height: 150, shoulders: 50, waist: 50, arms: 50, legs: 50 } });
  const headTop = 73, headTopOnScreen = (shape) => FEET_Y - (FEET_Y - headTop) * figureScale(shape);
  assert.ok(headTopOnScreen(tallest) >= 0, `220 cm: the head top is at ${headTopOnScreen(tallest).toFixed(0)}`);
  assert.ok(figureScale(shortest) < figureScale(NEUTRAL_SHAPE) && figureScale(NEUTRAL_SHAPE) < figureScale(tallest));
  assert.equal(figureScale(NEUTRAL_SHAPE), STAGE_FIT);
  // the portrait square keeps the head the same fraction of the picture whatever the height
  for (const shape of [tallest, shortest, NEUTRAL_SHAPE]) {
    const crop = portraitCropFor(shape);
    assert.ok(Math.abs(crop.size / PORTRAIT_CROP.size - figureScale(shape)) < 1e-9);
    assert.ok(Math.abs(crop.x + crop.size / 2 - AXIS_X) < 1e-6, "centred on the body axis");
  }
});

test("applyBodyShape copies the head and the feet whole, covers every strip in between exactly once, and scales about the feet", () => {
  const ops = [];
  const dst = { getContext: () => ({ clearRect() {}, save() {}, restore() {}, translate: (...a) => ops.push(["translate", ...a]), scale: (...a) => ops.push(["scale", ...a]), drawImage: (...a) => ops.push(["draw", ...a.slice(1)]) }) };
  const shape = { shoulders: 0.2, arms: 0.3, waist: 0.1, legs: 0.2, height: 0.05 };
  applyBodyShape({}, dst, shape);
  const draws = ops.filter((o) => o[0] === "draw");
  assert.deepEqual(draws[0].slice(1, 5), [0, 0, 1024, RESHAPE_FROM]);
  assert.deepEqual(draws.at(-1).slice(1, 3), [0, RESHAPE_TO]);
  const strips = draws.slice(1, -1);
  const expected = [];
  for (let y = RESHAPE_FROM; y < RESHAPE_TO; y += STRIP) for (const op of rowOps(y + STRIP / 2, shape)) expected.push([op.sx, y, op.sw, STRIP, op.dx, y, op.dw, STRIP]);
  assert.deepEqual(strips.map((d) => d.slice(1)), expected, "exactly the planned parts, in order");
  const h = STAGE_FIT * 1.05;
  assert.deepEqual(ops.find((o) => o[0] === "scale").slice(1), [h, h]);
  assert.ok(Math.abs(ops.find((o) => o[0] === "translate")[2] - FEET_Y * (1 - h)) < 1e-9, "the feet stay on the floor");
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

test("renderer: every figure is drawn through the shape pass; the portrait is cut from it; the dataset carries the drawing scale", async () => {
  const env = fakeEnv();
  const handle = await mountAvatar2d(host(), { look: { ...DEFAULT_LOOK, build: { height: 200, shoulders: 80, waist: 50, arms: 50, legs: 50 } }, createCanvas: env.create, loadImage: art });
  const shaped = env.all.find((c) => c.ops.filter((o) => o[0] === "draw").length > 300);
  assert.ok(shaped, "a canvas received the strip passes");
  const shown = JSON.parse(handle.canvas.dataset.shape);
  assert.ok(shown.shoulders > 0 && Math.abs(shown.height - (200 / 185 - 1)) < 1e-9);
  assert.ok(Math.abs(shown.scale - figureScale(shown)) < 1e-9, "QA reads the drawing scale from the dataset");
  handle.capturePortrait();
  const portrait = env.all.find((c) => c.width === 256);
  assert.equal(portrait.ops.at(-1)[1], shaped.tag, "the portrait is cut from the shaped figure");
  const crop = portraitCropFor(shown);
  assert.deepEqual(portrait.ops.at(-1).slice(2, 6), [crop.x, crop.y, crop.size, crop.size]);
  await handle.setLook({ ...DEFAULT_LOOK, body: "slim" });
  assert.ok(handle.inspect().shape.shoulders < 0, "a preset look replaces the custom build");
});
