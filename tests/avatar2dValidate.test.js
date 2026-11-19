import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { CANVAS, ART, requiredFiles } from "../js/ui/avatar2d/avatar2dLayers.js";
import { PRESENTATIONS } from "../js/data/avatarLook.js";
import { RULES, SIGNATURE, checkLayerPixels, chunk, decodePng, encodePng, findHoles, validateSet } from "../scripts/avatar/avatar2dValidate.mjs";

const { width: W, height: H } = CANVAS;

// ---- PNG codec ------------------------------------------------------------------------------------------------------
/** Forward PNG filters written straight from the spec, independent of the decoder's reconstruction code. */
function filterRow(type, row, prev, bpp) {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0; const b = prev ? prev[i] : 0; const c = i >= bpp && prev ? prev[i - bpp] : 0;
    let pred = 0;
    if (type === 1) pred = a; else if (type === 2) pred = b; else if (type === 3) pred = (a + b) >> 1;
    else if (type === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
    out[i] = (row[i] - pred) & 255;
  }
  return out;
}

test("decoder reverses all five PNG row filters (none, sub, up, average, paeth) bit-exactly", () => {
  const w = 37; const h = 29; const px = new Uint8Array(w * h * 4); let s = 99;
  for (let i = 0; i < px.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; px[i] = (s >> 7) & 255; }
  const rows = []; const stride = w * 4;
  for (let y = 0; y < h; y++) {
    const row = Buffer.from(px.subarray(y * stride, (y + 1) * stride)); const prev = y ? Buffer.from(px.subarray((y - 1) * stride, y * stride)) : null;
    const type = y % 5; rows.push(Buffer.concat([Buffer.from([type]), filterRow(type, row, prev, 4)]));
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
  const out = decodePng(png);
  assert.deepEqual([out.width, out.height, out.colorType], [w, h, 6]);
  assert.ok(Buffer.from(out.rgba).equals(Buffer.from(px)), "decoded pixels must equal the originals");
});

test("encode then decode round-trips; non-RGBA, junk and truncated files are reported, not misread", () => {
  const px = new Uint8Array(8 * 6 * 4).map((_, i) => (i * 7) & 255);
  assert.ok(Buffer.from(decodePng(encodePng(8, 6, px)).rgba).equals(Buffer.from(px)));
  const rgb = decodePng(encodePng(8, 6, new Uint8Array(8 * 6 * 3), 2));
  assert.equal(rgb.rgba, null, "RGB (colour type 2) is flagged, not decoded as RGBA");
  assert.throws(() => decodePng(Buffer.from("definitely not a png file, no way, nope nope nope")), /not a PNG/);
  assert.throws(() => decodePng(encodePng(8, 6, px).subarray(0, 40)));
});

// ---- a synthetic spec-conformant art set ------------------------------------------------------------------------------
/** A layer: grey (or coloured) rectangle `box` = [x0, y0, x1, y1]; tint layers get a vertical grey ramp lo..hi. */
function layer({ box, lo = 90, hi = 245, colour = null, mutate = null }) {
  const px = new Uint8Array(W * H * 4); const [x0, y0, x1, y1] = box;
  for (let y = y0; y < y1; y++) {
    const v = Math.round(lo + ((hi - lo) * (y - y0)) / Math.max(1, y1 - y0 - 1));
    for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; px[i] = colour ? colour[0] : v; px[i + 1] = colour ? colour[1] : v; px[i + 2] = colour ? colour[2] : v; px[i + 3] = 255; }
  }
  mutate?.(px);
  return encodePng(W, H, px);
}
const BODY = [160, 100, 860, 1400]; const SMALL = [300, 300, 400, 400];
const UNTINTED = new Set(["base/shoes.png", "base/face.png"]);
let baseSet;
const goodSet = () => {
  baseSet ??= new Map(requiredFiles().map((f) => [f, f === "base/body.png" ? layer({ box: BODY }) : UNTINTED.has(f) ? layer({ box: SMALL, colour: [200, 60, 60] }) : layer({ box: SMALL })]));
  return new Map(baseSet);
};
const levels = (findings, level) => findings.filter((f) => f.level === level);
const failIds = (findings) => levels(findings, "FAIL").map((f) => f.id);
const hasFail = (findings, id, text) => levels(findings, "FAIL").some((f) => f.id === id && (!text || f.msg.includes(text)));

test("a conformant set passes: no failure, V1 and V6 verified for every look (short and shaved)", () => {
  const out = validateSet(goodSet());
  assert.deepEqual(levels(out, "FAIL"), []);
  assert.equal(levels(out, "PASS").filter((f) => f.id === "V6").length, ART.styles.length * ART.cuts.length + ART.cuts.length);
  assert.ok(levels(out, "PASS").some((f) => f.id === "V1"));
});

test("V1: a missing file and an unexpected file are both failures (and V6 is skipped, not guessed)", () => {
  const miss = goodSet(); miss.delete("base/face.png");
  const a = validateSet(miss);
  assert.ok(hasFail(a, "V1", "missing base/face.png"));
  assert.ok(levels(a, "WARN").some((f) => f.id === "V6"));
  const extra = goodSet(); extra.set("base/face_smile.png", Buffer.from("x"));
  assert.ok(hasFail(validateSet(extra), "V1", "unexpected file base/face_smile.png"));
});

test("V2: wrong size, RGB instead of RGBA, and a corrupt file are failures", () => {
  const size = goodSet(); size.set("base/shoes.png", encodePng(512, 768, new Uint8Array(512 * 768 * 4)));
  assert.ok(hasFail(validateSet(size), "V2", "512x768"));
  const rgb = goodSet(); rgb.set("base/shoes.png", encodePng(W, H, new Uint8Array(W * H * 3), 2));
  assert.ok(hasFail(validateSet(rgb), "V2", "8-bit RGBA"));
  const bad = goodSet(); bad.set("base/shoes.png", Buffer.from("not a png at all, just text bytes here, 1234567890"));
  assert.ok(hasFail(validateSet(bad), "V2", "not a PNG"));
});

test("V3: non-transparent border pixels and artwork outside the safe margin are failures", () => {
  const bleed = goodSet(); bleed.set("hair/short/front.png", layer({ box: SMALL, mutate: (px) => { px[(5 * W + 5) * 4 + 3] = 255; } }));
  assert.ok(hasFail(validateSet(bleed), "V3", `inside the ${RULES.border}px border`));
  const wide = goodSet(); wide.set("base/body.png", layer({ box: [40, 100, 860, 1400] }));
  assert.ok(hasFail(validateSet(wide), "V3", "safe margin"));
});

test("V4: a coloured pixel field, too-dark shading and a clipped highlight peak each fail a tint layer; untinted layers may be coloured", () => {
  const colourful = goodSet(); colourful.set("outfits/jersey/top.png", layer({ box: SMALL, colour: [220, 40, 40] }));
  assert.ok(hasFail(validateSet(colourful), "V4", "not neutral grey"));
  const dark = goodSet(); dark.set("outfits/jersey/top.png", layer({ box: SMALL, lo: 20, hi: 245 }));
  assert.ok(hasFail(validateSet(dark), "V4", "below the floor"));
  const dim = goodSet(); dim.set("outfits/jersey/top.png", layer({ box: SMALL, lo: 90, hi: 200 }));
  assert.ok(hasFail(validateSet(dim), "V4", "peak"));
  assert.deepEqual(failIds(validateSet(goodSet())), [], "the coloured untinted shoes/face in the good set are fine");
});

test("V6: an enclosed transparent hole in the stacked silhouette fails; a pin-hole and an open notch do not", () => {
  const hole = goodSet(); hole.set("base/body.png", layer({ box: BODY, mutate: (px) => { for (let y = 600; y < 640; y++) for (let x = 500; x < 540; x++) px[(y * W + x) * 4 + 3] = 0; } }));
  const holes = validateSet(hole).filter((f) => f.id === "V6" && f.level === "FAIL");
  assert.equal(holes.length, ART.styles.length * ART.cuts.length + ART.cuts.length, "both short and shaved looks are checked");
  assert.match(holes[0].msg, /1600px at \(500,600\)/);
  const pin = goodSet(); pin.set("base/body.png", layer({ box: BODY, mutate: (px) => { for (let y = 600; y < 605; y++) for (let x = 500; x < 505; x++) px[(y * W + x) * 4 + 3] = 0; } }));
  assert.deepEqual(failIds(validateSet(pin)), [], "a 25px pin-hole is below the threshold");
  const notch = goodSet(); notch.set("base/body.png", layer({ box: BODY, mutate: (px) => { for (let y = 1000; y < 1400; y++) for (let x = 500; x < 540; x++) px[(y * W + x) * 4 + 3] = 0; } }));
  assert.deepEqual(failIds(validateSet(notch)), [], "a gap open to the outside (between the legs) is not a hole");
});

test("V6 uses only the layers a look really draws: a hair-only cover over a body hole does not count for Shaved", () => {
  const files = goodSet();
  files.set("base/body.png", layer({ box: BODY, mutate: (px) => { for (let y = 300; y < 340; y++) for (let x = 600; x < 640; x++) px[(y * W + x) * 4 + 3] = 0; } }));   // away from the other layers' SMALL boxes
  files.set("hair/short/front.png", layer({ box: [590, 290, 650, 350] }));   // covers the hole, but only when hair is drawn
  const v6 = validateSet(files).filter((f) => f.id === "V6");
  assert.ok(v6.some((f) => f.level === "PASS" && f.msg.startsWith("short/")), "hair covers the hole for the short look");
  assert.ok(v6.some((f) => f.level === "FAIL" && f.msg.startsWith("shaved/")), "but the Shaved look has no hair, so the hole shows");
});

test("V10: an oversized layer is a warning, not a failure", () => {
  const files = goodSet();
  files.set("base/shoes.png", layer({ box: [100, 100, 600, 600], colour: [1, 1, 1], mutate: (px) => { let s = 5; for (let i = 0; i < px.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; px[i] = s & 255; px[i + 1] = (s >> 8) & 255; px[i + 2] = (s >> 16) & 255; } } }));
  const out = validateSet(files);
  assert.ok(levels(out, "WARN").some((f) => f.id === "V10" && f.msg.startsWith("base/shoes.png")));
  assert.deepEqual(levels(out, "FAIL"), []);
});

test("checkLayerPixels and findHoles are usable on their own", () => {
  const png = decodePng(layer({ box: BODY }));
  assert.deepEqual(checkLayerPixels(png, { tinted: true }), []);
  const fully = decodePng(encodePng(W, H, new Uint8Array(W * H * 4)));
  assert.ok(checkLayerPixels(fully, { tinted: false }).some((f) => f.msg === "layer is fully transparent"));
  assert.deepEqual(findHoles(new Map([["a", png]]), ["a"]), []);
});

test("the shipped art in assets/avatar2d passes the validator with no failure", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join, relative } = await import("node:path");
  const root = new URL("../assets/avatar2d/", import.meta.url).pathname;
  const files = new Map();
  // a presentation that is not switched on yet keeps its art in its own folder, validated by its own test (avatarFemaleArt.test.js); once it is
  // in ART.presentations its folder is part of the shipped set and is walked here too
  const dormant = new Set(PRESENTATIONS.map((p) => p.id).filter((id) => !ART.presentations.includes(id)));
  const walk = (dir) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) { if (!(dir === root && dormant.has(name))) walk(full); } else if (name.endsWith(".png")) files.set(relative(root, full).split("\\").join("/"), readFileSync(full)); } };
  walk(root);
  const out = validateSet(files);
  assert.deepEqual(levels(out, "FAIL"), [], JSON.stringify(levels(out, "FAIL")));
  assert.equal(levels(out, "PASS").filter((f) => f.id === "V6").length, 2, "short and shaved stacks are hole-free");
});
