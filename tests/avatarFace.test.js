import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOOK, sanitizeLook } from "../js/data/avatarLook.js";
import { FACE_PART_IDS, sanitizeFace, withFacePart } from "../js/data/avatarFace.js";
import { lookSignature } from "../js/data/avatarPortrait.js";
import { ART, faceChoices, faceControls, requiredFiles, requiredFilesFor, resolveLayers } from "../js/ui/avatar2d/avatar2dLayers.js";
import { facePane } from "../js/ui/avatarLookView.js";

// TEST FIXTURE ONLY. No face-variant art ships (ART.faceVariants is empty); this declares some, so the resolver, the file list and the page can be checked
// without pretending art exists. Nothing here is a product asset.
const FIXTURE = Object.freeze({ ...ART, faceVariants: Object.freeze({ male: Object.freeze({ eyes: ["b", "c"], brows: ["b"], nose: ["b", "c"], mouth: ["b"] }) }), blankFace: Object.freeze(["male"]) });
const NO_BLANK = Object.freeze({ ...FIXTURE, blankFace: Object.freeze([]) });
const roles = (r) => r.layers.map((l) => l.role);
const fileOf = (r, role) => r.layers.find((l) => l.role === role)?.file;

test("sanitizeFace: known parts and well-formed ids only; the default, junk and path tricks are dropped; nothing left = no face", () => {
  assert.deepEqual(sanitizeFace({ eyes: "b", nose: "default", mouth: "../x", brows: 5, junk: "a", extra: "b" }), { eyes: "b" });
  assert.deepEqual(sanitizeFace({ eyes: "b", brows: "c", nose: "wide_2", mouth: "m" }), { eyes: "b", brows: "c", nose: "wide_2", mouth: "m" });
  for (const bad of [null, undefined, "eyes", 7, [], {}, { eyes: "default" }, { eyes: "B" }, { eyes: "a/b" }, { eyes: "a.png" }, { eyes: "" }, { eyes: "x".repeat(30) }]) assert.equal(sanitizeFace(bad), null, JSON.stringify(bad));
  assert.deepEqual(FACE_PART_IDS, ["eyes", "brows", "nose", "mouth"], "no facial hair and no face shape: those need art that does not exist");
});

test("withFacePart: sets one part, 'default' clears it, never mutates, unknown parts change nothing", () => {
  const base = Object.freeze({ eyes: "b" });
  assert.deepEqual(withFacePart(base, "nose", "c"), { eyes: "b", nose: "c" });
  assert.equal(withFacePart(base, "eyes", "default"), null);
  assert.deepEqual(withFacePart(null, "mouth", "b"), { mouth: "b" });
  assert.deepEqual(withFacePart(base, "ears", "b"), { eyes: "b" });
  assert.deepEqual(base, { eyes: "b" });
});

test("sparse like the other Creator 2.0 fields: a look with no face has no `face` key, so every old save is byte-identical", () => {
  for (const old of [{}, DEFAULT_LOOK, { skin: "deep", hair: "red", style: "shaved", body: "broad", figure: "bobblehead", cut: "street" }, { face: {} }, { face: { eyes: "default" } }]) {
    assert.equal("face" in sanitizeLook(old), false, JSON.stringify(old));
  }
  assert.deepEqual(sanitizeLook({ face: { eyes: "b", nose: "../.." } }).face, { eyes: "b" });
  assert.equal(lookSignature(DEFAULT_LOOK), lookSignature({ ...DEFAULT_LOOK, face: {} }), "an empty face does not stale a picture");
  assert.notEqual(lookSignature({ ...DEFAULT_LOOK, face: { eyes: "b" } }), lookSignature(DEFAULT_LOOK), "a face change does");
  assert.notEqual(lookSignature({ ...DEFAULT_LOOK, face: { eyes: "b" } }), lookSignature({ ...DEFAULT_LOOK, face: { eyes: "c" } }));
});

test("the art that ships has NO face variants: no control, no look can change a pixel, the file list is the original ten", () => {
  assert.deepEqual(ART.faceVariants, {});
  for (const p of ["male", "female"]) assert.deepEqual(faceControls(p), []);
  const plain = resolveLayers(DEFAULT_LOOK);
  const asked = resolveLayers({ ...DEFAULT_LOOK, face: { eyes: "b", nose: "c" } });
  assert.deepEqual(asked.layers, plain.layers, "a saved variant with no art draws the original");
  assert.deepEqual(asked.faceFellBack, ["eyes", "nose"], "and says so, without rewriting the save");
  assert.deepEqual(plain.faceFellBack, []);
  assert.equal(requiredFiles().length, 10);
  assert.ok(requiredFiles().every((f) => !f.includes("face/") && !f.includes("blank")));
});

test("with finished variants declared: controls appear per part; nose and mouth also need the blank skin base", () => {
  assert.deepEqual(faceControls("male", FIXTURE), ["eyes", "brows", "nose", "mouth"]);
  assert.deepEqual(faceControls("male", NO_BLANK), ["eyes", "brows"], "no blank base, no nose / mouth choice: they are painted into the skin");
  assert.deepEqual(faceControls("female", FIXTURE), [], "per presentation: the female set has its own art");
  assert.deepEqual(faceChoices("male", "eyes", FIXTURE), ["default", "b", "c"], "the original first");
});

test("eyes / brows variants replace exactly that layer, in place, with the same tint rules", () => {
  const plain = resolveLayers(DEFAULT_LOOK, null, FIXTURE);
  const eyes = resolveLayers({ ...DEFAULT_LOOK, face: { eyes: "c" } }, null, FIXTURE);
  assert.deepEqual(roles(eyes), roles(plain), "same layers, same order");
  assert.equal(fileOf(eyes, "face"), "face/eyes/c.png");
  assert.equal(eyes.layers.find((l) => l.role === "face").tint, null);
  assert.deepEqual(eyes.layers.filter((l) => l.role !== "face"), plain.layers.filter((l) => l.role !== "face"), "nothing else moves");
  const aged = resolveLayers({ ...DEFAULT_LOOK, appearanceAge: 62, face: { brows: "b" } }, null, FIXTURE);
  assert.equal(fileOf(aged, "brows"), "face/brows/b.png");
  assert.equal(aged.layers.find((l) => l.role === "brows").tint, resolveLayers({ ...DEFAULT_LOOK, appearanceAge: 62 }, null, FIXTURE).layers.find((l) => l.role === "brows").tint, "the chosen brows still grey with age");
});

test("a nose or mouth choice swaps in the blank skin and draws BOTH parts right above it (the other one as its original layer)", () => {
  const r = resolveLayers({ ...DEFAULT_LOOK, face: { nose: "b" } }, null, FIXTURE);
  const i = roles(r).indexOf("body");
  assert.equal(fileOf(r, "body"), "base/body_blank_face.png");
  assert.deepEqual(roles(r).slice(i, i + 3), ["body", "nose", "mouth"]);
  assert.equal(fileOf(r, "nose"), "face/nose/b.png");
  assert.equal(fileOf(r, "mouth"), "face/mouth/default.png");
  assert.equal(r.layers.find((l) => l.role === "nose").tint, r.layers.find((l) => l.role === "body").tint, "both take the skin colour");
  const mouth = resolveLayers({ ...DEFAULT_LOOK, face: { mouth: "b" } }, null, FIXTURE);
  assert.equal(fileOf(mouth, "nose"), "face/nose/default.png");
  const none = resolveLayers(DEFAULT_LOOK, null, FIXTURE);
  assert.equal(fileOf(none, "body"), "base/body.png", "the original face is the ORIGINAL skin layer: the default never changes");
  assert.ok(!roles(none).includes("nose"));
});

test("an unknown or unshipped variant falls back to the original and is reported; the save is not rewritten", () => {
  const look = { ...DEFAULT_LOOK, face: { eyes: "zzz", nose: "b" } };
  const r = resolveLayers(look, null, FIXTURE);
  assert.deepEqual(r.faceFellBack, ["eyes"]);
  assert.equal(fileOf(r, "face"), "base/face.png");
  assert.equal(fileOf(r, "nose"), "face/nose/b.png");
  assert.deepEqual(r.look.face, { eyes: "zzz", nose: "b" }, "the look is returned as saved");
  const noBlank = resolveLayers({ ...DEFAULT_LOOK, face: { nose: "b" } }, null, NO_BLANK);
  assert.deepEqual(noBlank.faceFellBack, ["nose"]);
  assert.equal(fileOf(noBlank, "body"), "base/body.png");
});

test("a saved female look still draws the male art, including the male face variants (never a half-switched face)", () => {
  const r = resolveLayers({ ...DEFAULT_LOOK, presentation: "female", face: { eyes: "b" } }, null, FIXTURE);
  assert.equal(r.presentation, "male");
  assert.equal(r.presentationFellBack, true);
  assert.equal(fileOf(r, "face"), "face/eyes/b.png");
});

test("the file list asks for exactly the declared variants, the original nose / mouth layers and the blank skin", () => {
  const files = requiredFilesFor("male", FIXTURE);
  for (const f of ["face/eyes/b.png", "face/eyes/c.png", "face/brows/b.png", "face/nose/b.png", "face/nose/c.png", "face/nose/default.png", "face/mouth/b.png", "face/mouth/default.png", "base/body_blank_face.png"]) assert.ok(files.includes(f), f);
  assert.ok(!files.includes("face/eyes/default.png"), "the original eyes are base/face.png: no copy");
  assert.equal(new Set(files).size, files.length);
  assert.equal(requiredFilesFor("male", NO_BLANK).includes("base/body_blank_face.png"), false);
});

test("the Face page: the honest note when nothing ships, one radio group per usable part when something does, the saved variant checked", () => {
  const none = facePane(DEFAULT_LOOK, "en");
  assert.match(none, /separate art layers/);
  assert.doesNotMatch(none, /mw-look-face-/, "no control that does nothing");
  const html = facePane({ ...DEFAULT_LOOK, face: { eyes: "c" } }, "en", FIXTURE);
  for (const part of ["eyes", "brows", "nose", "mouth"]) assert.match(html, new RegExp(`name="mw-look-face-${part}"`));
  assert.match(html, /name="mw-look-face-eyes" value="c" checked/);
  assert.match(html, /name="mw-look-face-brows" value="default" checked/, "no saved brows = the original is checked");
  assert.doesNotMatch(html, /type="range"/, "no slider");
  assert.doesNotMatch(facePane(DEFAULT_LOOK, "en", FIXTURE), /[\u4e00-\u9fff]/, "an English page carries no Chinese");
  assert.match(facePane(DEFAULT_LOOK, "zh", FIXTURE), /原版/, "and the Chinese page says \"original\" in Chinese");
});
