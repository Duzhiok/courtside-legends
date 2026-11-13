// Character style (stylized / bobblehead): one identity, two presentations. Appearance only.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const look = await import("../js/data/avatarLook.js");
const { lookSignature } = await import("../js/data/avatarPortrait.js");
const { lookPanelHtml } = await import("../js/ui/avatarLookView.js");

test("figure is whitelisted like every other field and defaults to stylized (old saves keep working)", () => {
  assert.equal(look.sanitizeLook({}).figure, "stylized");
  assert.equal(look.sanitizeLook({ figure: "bobblehead" }).figure, "bobblehead");
  assert.equal(look.sanitizeLook({ figure: "<script>" }).figure, "stylized");
  // an account saved before this field existed
  assert.equal(look.sanitizeLook({ skin: "deep", hair: "red", outfit: "royal", style: "shaved", body: "broad" }).figure, "stylized");
});

test("bobblehead keeps every other choice: same skin, hair, outfit and build", () => {
  const a = look.sanitizeLook({ skin: "brown", hair: "red", outfit: "royal", style: "shaved", body: "slim", figure: "stylized" });
  const b = look.sanitizeLook({ ...a, figure: "bobblehead" });
  for (const k of ["skin", "hair", "outfit", "style", "body"]) assert.equal(b[k], a[k], k);
  assert.deepEqual(look.lookColors(a), look.lookColors(b), "same colours in both styles");
});

test("bobblehead is its own model: the figure style adds no bone scaling, so the baked toy proportions are what you see", () => {
  const s = look.bodyBoneScales("standard", "stylized");
  const b = look.bodyBoneScales("standard", "bobblehead");
  assert.deepEqual(b, s, "no extra head/limb/height scaling on top of the toy model");
  assert.deepEqual(b.bones.Head, [1, 1, 1], "the big head is in the mesh, never a runtime scale");
  assert.equal(b.height, 1);
  assert.deepEqual(look.bodyBoneScales("standard"), s, "figure argument is optional");
  assert.deepEqual(look.bodyBoneScales("standard", "nope"), s, "unknown figure falls back to stylized");
});

test("build presets still apply on top of each figure style", () => {
  const broad = look.bodyBoneScales("broad", "bobblehead");
  const slim = look.bodyBoneScales("slim", "bobblehead");
  assert.ok(broad.bones["Shoulder.L"][0] > slim.bones["Shoulder.L"][0]);
});

test("a 3D profile picture goes stale when the character style changes (it would no longer look like the avatar)", () => {
  const a = look.sanitizeLook({ figure: "stylized" });
  const b = look.sanitizeLook({ figure: "bobblehead" });
  assert.notEqual(lookSignature(a), lookSignature(b));
});

test("saved per account, survives a reload, separate between accounts", () => {
  globalThis.localStorage = createMemoryStorage();
  const saved = [];
  const persist = (acc) => saved.push(JSON.stringify(acc.avatar));
  const alice = { id: "a" };
  const bob = { id: "b" };
  look.saveLook(alice, { figure: "bobblehead" }, { persist });
  assert.equal(look.readLook(alice).figure, "bobblehead");
  assert.equal(look.readLook(bob).figure, "stylized");
  assert.equal(look.readLook(JSON.parse(JSON.stringify(alice))).figure, "bobblehead", "plain JSON round trip");
});

test("the panel offers the style choice first, in both languages, with no Chinese leaking into English", () => {
  const zh = lookPanelHtml(look.DEFAULT_LOOK, "Ann", "zh");
  const en = lookPanelHtml({ ...look.DEFAULT_LOOK, figure: "bobblehead" }, "Ann", "en");
  assert.ok(zh.indexOf('data-mw-look-group="figure"') > 0 && zh.indexOf('data-mw-look-group="figure"') < zh.indexOf('data-mw-look-group="skin"'));
  assert.match(zh, /Q 版大头/);
  assert.match(en, /Bobblehead/);
  assert.match(en, /name="mw-look-figure" value="bobblehead" checked/);
  assert.ok(!/[\u4e00-\u9fff]/.test(en.replace(/<img[^>]*>/g, "")), "English panel has no Chinese");
});
