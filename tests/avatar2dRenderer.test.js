import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOOK } from "../js/data/avatarLook.js";
import { CANVAS, PORTRAIT_CROP } from "../js/ui/avatar2d/avatar2dLayers.js";
import { PORTRAIT_PX, avatarRenderer, mountAvatar2d, mountAvatar2dProto, paintLayers } from "../js/ui/avatar2d/avatar2dRenderer.js";

/** A canvas whose 2D context records every call; unknown drawing calls (paths, strokes) are accepted and ignored. */
function makeCanvases() {
  const all = [];
  const create = (width, height) => {
    const ops = [];
    const known = {
      clearRect: () => ops.push(["clear"]),
      fillRect: () => ops.push(["fillRect"]),
      drawImage: (img, ...a) => ops.push(["draw", img.name || img.tag, ...a]),
    };
    const ctx = new Proxy({}, {
      get: (t, k) => known[k] ?? t[k] ?? (() => {}),
      set: (t, k, v) => { t[k] = v; if (k === "globalCompositeOperation" || k === "fillStyle") ops.push([k, v]); return true; },
    });
    const canvas = { width, height, dataset: {}, style: {}, tag: `canvas${all.length}`, ops, getContext: () => ctx, toDataURL: (type, q) => `data:${type};q=${q}`, remove() { this.removed = true; } };
    all.push(canvas);
    return canvas;
  };
  return { create, all };
}
const container = () => ({ children: [], appendChild(c) { this.children.push(c); } });
const art = (file) => Promise.resolve({ name: file });
const SHAVED = { ...DEFAULT_LOOK, style: "shaved" };

test("layers are drawn in order; a tinted layer is multiplied by its colour and clipped back to its own alpha", async () => {
  const { create, all } = makeCanvases();
  const handle = await mountAvatar2d(container(), { look: DEFAULT_LOOK, createCanvas: create, loadImage: art });
  const composition = all[0];
  const drawn = composition.ops.filter((o) => o[0] === "draw").map((o) => o[1]);
  // the tinted layers are blitted from the scratch canvas, the untinted ones (shoes, face) come straight from the art
  assert.ok(drawn.includes("base/shoes.png") && drawn.includes("base/face.png"));
  assert.equal(drawn.filter((n) => n.startsWith("canvas")).length, 8, "8 tinted layers go through the scratch canvas");
  const scratch = all.find((c) => c.ops.some((o) => o[1] === "multiply"));
  const ops = scratch.ops.map((o) => o.join(":"));
  assert.ok(ops.indexOf("globalCompositeOperation:multiply") < ops.indexOf("globalCompositeOperation:destination-in"));
  assert.ok(ops.some((o) => o === "fillStyle:#d9a477"), "warm skin tint was applied");
  assert.deepEqual(handle.inspect().layers.slice(0, 3), ["hair_back", "body", "shoes"]);
  assert.equal(handle.canvas.dataset.renderer, "2d");
});

test("setLook repaints for the new look; Shaved removes the hair layers", async () => {
  const { create } = makeCanvases();
  const handle = await mountAvatar2d(container(), { look: DEFAULT_LOOK, createCanvas: create, loadImage: art });
  assert.ok(handle.inspect().layers.includes("hair_front"));
  assert.equal(await handle.setLook(SHAVED), true);
  assert.ok(!handle.inspect().layers.includes("hair_front"));
  assert.equal(handle.look().style, "shaved");
});

test("a slow older setLook never overwrites a newer one", async () => {
  const { create } = makeCanvases();
  let release;
  const slow = new Promise((r) => { release = r; });
  // mounted Shaved, so the hair files are not cached yet: they load slowly
  const handle = await mountAvatar2d(container(), {
    look: SHAVED, createCanvas: create,
    loadImage: (file) => (file.startsWith("hair_") ? slow.then(() => ({ name: file })) : art(file)),
  });
  const first = handle.setLook(DEFAULT_LOOK);   // needs the slow hair files
  const second = handle.setLook(SHAVED);        // newer, everything already cached
  assert.equal(await second, true);
  release();
  assert.equal(await first, false, "the stale request is dropped");
  assert.equal(handle.look().style, "shaved");
});

test("capturePortrait cuts the head-and-shoulders square at 256px as a JPEG; null once disposed", async () => {
  const { create, all } = makeCanvases();
  const handle = await mountAvatar2d(container(), { look: DEFAULT_LOOK, createCanvas: create, loadImage: art });
  const before = all.length;
  const url = handle.capturePortrait("#123456");
  assert.equal(url, "data:image/jpeg;q=0.82");
  const out = all[before];
  assert.equal(out.width, PORTRAIT_PX);
  assert.deepEqual(out.ops.find((o) => o[0] === "draw").slice(2), [PORTRAIT_CROP.x, PORTRAIT_CROP.y, PORTRAIT_CROP.size, PORTRAIT_CROP.size, 0, 0, PORTRAIT_PX, PORTRAIT_PX]);
  assert.ok(out.ops.some((o) => o[0] === "fillStyle" && o[1] === "#123456"));
  handle.dispose();
  assert.equal(handle.capturePortrait(), null);
});

test("capturePortrait returns null (never throws) when drawing fails", async () => {
  const { create } = makeCanvases();
  let broken = false;
  const handle = await mountAvatar2d(container(), {
    look: DEFAULT_LOOK, loadImage: art,
    createCanvas: (w, h) => { if (broken && w === PORTRAIT_PX) throw new Error("boom"); return create(w, h); },
  });
  broken = true;
  assert.equal(handle.capturePortrait(), null);
});

test("no art and no placeholders: the mount rejects, which My World already answers with the static portrait", async () => {
  const { create } = makeCanvases();
  const host = container();
  await assert.rejects(mountAvatar2d(host, { look: DEFAULT_LOOK, createCanvas: create, loadImage: () => Promise.reject(new Error("404")) }));
  assert.equal(host.children.length, 0, "nothing is left in the container");
});

test("placeholder mode (QA only) draws a full figure and says so in inspect()", async () => {
  const { create } = makeCanvases();
  const handle = await mountAvatar2dProto(container(), { look: DEFAULT_LOOK, createCanvas: create, loadImage: () => Promise.reject(new Error("404")) });
  const info = handle.inspect();
  assert.equal(info.placeholders, true);
  assert.ok(info.layers.includes("body") && info.layers.includes("top"));
});

test("a missing layer is skipped and reported, the rest still draw", () => {
  const { create } = makeCanvases();
  const target = create(CANVAS.width, CANVAS.height);
  const layers = [{ role: "body", file: "body.png", tint: null }, { role: "face", file: "face.png", tint: null }];
  const report = paintLayers(target.getContext("2d"), layers, (l) => (l.role === "face" ? null : { name: l.file }), create);
  assert.deepEqual(report, { drawn: ["body"], missing: ["face"] });
});

test("dispose is idempotent and later setLook calls do nothing", async () => {
  const { create } = makeCanvases();
  const handle = await mountAvatar2d(container(), { look: DEFAULT_LOOK, createCanvas: create, loadImage: art });
  handle.dispose();
  assert.doesNotThrow(() => handle.dispose());
  assert.equal(handle.canvas.removed, true);
  assert.equal(await handle.setLook(SHAVED), false);
});

test("2D has no animation clips: previews report 'not played'; the handle matches what My World calls on the 3D one", async () => {
  const { create } = makeCanvases();
  const handle = await mountAvatar2d(container(), { look: DEFAULT_LOOK, createCanvas: create, loadImage: art });
  for (const fn of ["setLook", "capturePortrait", "dispose", "playAction", "playIdle", "look", "inspect", "setYaw"]) assert.equal(typeof handle[fn], "function", fn);
  assert.equal(handle.playAction("jump"), false);
  assert.equal(handle.action(), "idle");
});

test("3D stays the default; 2D is chosen only by ?avatar=2d (real art) or ?avatar=2d-proto (placeholder QA)", () => {
  for (const q of [undefined, "", "?avatarLight=studio", "?avatar=bogus", "?avatar=2dx"]) assert.equal(avatarRenderer(q), "3d", String(q));
  assert.equal(avatarRenderer("?avatar=3d"), "3d");
  assert.equal(avatarRenderer("?avatar=2d"), "2d");
  assert.equal(avatarRenderer("?avatar=2d-proto"), "2d-proto");
  assert.equal(avatarRenderer("?x=1&avatar=2d-proto&y=2"), "2d-proto");
});

test("the portrait steps its JPEG quality down until it fits the stored-portrait limit, else gives up with null", async () => {
  const { create } = makeCanvases();
  const sizes = { 0.82: 45000, 0.7: 42000, 0.6: 39000, 0.5: 30000 };
  const handle = await mountAvatar2d(container(), {
    look: DEFAULT_LOOK, loadImage: art,
    createCanvas: (w, h) => { const c = create(w, h); if (w === PORTRAIT_PX) c.toDataURL = (type, q) => "x".repeat(sizes[q]); return c; },
  });
  assert.equal(handle.capturePortrait().length, 39000, "quality 0.6 is the first that fits 40,000 characters");
  const tooBig = await mountAvatar2d(container(), {
    look: DEFAULT_LOOK, loadImage: art,
    createCanvas: (w, h) => { const c = create(w, h); if (w === PORTRAIT_PX) c.toDataURL = () => "x".repeat(50000); return c; },
  });
  assert.equal(tooBig.capturePortrait(), null);
});

test("decoded layers the look no longer needs are released; colour-only edits reuse everything", async () => {
  const { create } = makeCanvases();
  let loads = 0;
  const handle = await mountAvatar2d(container(), { look: DEFAULT_LOOK, createCanvas: create, loadImage: (f) => { loads += 1; return art(f); } });
  assert.equal(handle.inspect().cached, 10);
  await handle.setLook({ ...DEFAULT_LOOK, skin: "deep", hair: "red", outfit: "royal" });
  assert.equal(loads, 10, "changing colours loads nothing new");
  await handle.setLook(SHAVED);
  assert.equal(handle.inspect().cached, 8, "the two hair files were released");
  assert.equal(handle.renderer, "2d");
});
