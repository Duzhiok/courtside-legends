import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOOK, HAIR_COLORS, OUTFITS, SKIN_TONES, lookColors } from "../js/data/avatarLook.js";
import { ART, CANVAS, LAYER_SPEC, PORTRAIT_CROP, requiredFiles, resolveLayers } from "../js/ui/avatar2d/avatar2dLayers.js";

const tintOf = (resolved, role) => resolved.layers.find((l) => l.role === role)?.tint;

test("default look: one stable bottom-to-top order, files named by role and cut", () => {
  const r = resolveLayers(DEFAULT_LOOK);
  assert.deepEqual(r.layers.map((l) => l.role), LAYER_SPEC.map((s) => s.role));
  const file = (role) => r.layers.find((l) => l.role === role).file;
  assert.equal(file("top"), "outfits/jersey/top.png");
  assert.equal(file("body"), "base/body.png");
  assert.equal(file("hair_front"), "hair/short/front.png", "hair files are keyed by style, so a new style is only new files");
  assert.equal(file("hair_back"), "hair/short/back.png");
  assert.equal(r.fellBack, false);
  assert.equal(r.styleFellBack, false);
});

test("skin, hair and outfit colours are the SAME ones the 3D figure uses (lookColors)", () => {
  const look = { ...DEFAULT_LOOK, skin: "deep", hair: "red", outfit: "royal" };
  const r = resolveLayers(look);
  const c = lookColors(look);
  assert.equal(tintOf(r, "body"), SKIN_TONES.find((s) => s.id === "deep").hex);
  assert.equal(tintOf(r, "hair_front"), c.Hair);
  assert.equal(tintOf(r, "top"), c.Shirt);
  assert.equal(tintOf(r, "bottom"), c.Pants);
  assert.equal(tintOf(r, "top_trim"), c.Trim);
  assert.equal(r.layers.find((l) => l.role === "shoes").tint, null, "shoes keep their art colours");
});

test("Shaved: both hair layers are skipped (the skin layer owns a finished bald head) and eyebrows keep the hair colour", () => {
  const r = resolveLayers({ ...DEFAULT_LOOK, style: "shaved", hair: "blond", skin: "light" });
  const roles = r.layers.map((l) => l.role);
  assert.ok(!roles.includes("hair_front") && !roles.includes("hair_back"));
  assert.ok(roles.includes("body") && roles.includes("brows"));
  assert.ok(!r.layers.some((l) => l.file.startsWith("hair/")), "no hair file is even requested for Shaved");
  assert.equal(r.style, null);
  assert.equal(tintOf(r, "brows"), HAIR_COLORS.find((h) => h.id === "blond").hex);
  assert.notEqual(tintOf(r, "brows"), tintOf(r, "body"), "brows must not vanish into the skin");
});

test("every outfit colourway, including all shop-gated ones, resolves: nothing is dropped or re-locked by 2D", () => {
  assert.ok(OUTFITS.filter((o) => o.shop).length >= 5);
  for (const o of OUTFITS) {
    const r = resolveLayers({ ...DEFAULT_LOOK, outfit: o.id });
    assert.equal(tintOf(r, "top"), o.shirt, o.id);
    assert.equal(tintOf(r, "bottom"), o.pants, o.id);
  }
});

test("a cut without 2D art draws the fallback cut, reports it, and never rewrites the saved look", () => {
  const input = Object.freeze({ ...DEFAULT_LOOK, cut: "street" });
  const r = resolveLayers(input);
  assert.deepEqual(ART.cuts, ["jersey"]);
  assert.equal(r.fellBack, true);
  assert.equal(r.cut, "jersey");
  assert.equal(r.look.cut, "street", "the look itself is untouched: only the drawing falls back");
  assert.equal(input.cut, "street");
});

test("junk input is sanitised like the 3D path and adds no persistent field", () => {
  const r = resolveLayers({ skin: "zzz", hair: 5, style: null, outfit: "nope", cut: {}, evil: "x" });
  assert.deepEqual(Object.keys(r.look).sort(), Object.keys(DEFAULT_LOOK).sort());
  assert.deepEqual(r.look, { ...DEFAULT_LOOK });
  assert.doesNotThrow(() => resolveLayers(undefined));
});

test("requiredFiles is exactly the spec's folder layout, once each", () => {
  const files = requiredFiles();
  assert.equal(new Set(files).size, files.length);
  assert.deepEqual([...files].sort(), [
    "base/body.png", "base/brows.png", "base/face.png", "base/shoes.png",
    "hair/short/back.png", "hair/short/front.png",
    "outfits/jersey/bottom.png", "outfits/jersey/bottom_trim.png", "outfits/jersey/top.png", "outfits/jersey/top_trim.png",
  ]);
});

test("every layer the resolver can ask for is a file the art set must contain (no orphan paths)", () => {
  const required = new Set(requiredFiles());
  for (const style of ["short", "shaved"]) for (const cut of ["jersey", "street"]) {
    for (const l of resolveLayers({ ...DEFAULT_LOOK, style, cut }).layers) assert.ok(required.has(l.file), l.file);
  }
});

test("portrait crop is the Style A head-and-shoulders square (340px at 340, 46) and stays inside the canvas", () => {
  assert.deepEqual({ ...PORTRAIT_CROP }, { x: 340, y: 46, size: 340 });
  assert.ok(PORTRAIT_CROP.x >= 0 && PORTRAIT_CROP.y >= 0);
  assert.ok(PORTRAIT_CROP.x + PORTRAIT_CROP.size <= CANVAS.width);
  assert.ok(PORTRAIT_CROP.y + PORTRAIT_CROP.size <= CANVAS.height);
});
