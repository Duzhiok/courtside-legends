import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ART, LAYER_SPEC, requiredFiles, requiredFilesFor, resolveLayers } from "../js/ui/avatar2d/avatar2dLayers.js";
import { PRESENTATIONS, sanitizeLook } from "../js/data/avatarLook.js";

const DOC = "docs/implementation/AVATAR-2D-FEMALE-FACE-ART-SPEC.md";
const doc = () => readFileSync(DOC, "utf8").replace(/\*/g, "");   // plain text: the document uses **bold**

test("the female art request is exactly the male set under female/, one file per layer", () => {
  const male = requiredFilesFor("male"), female = requiredFilesFor("female");
  assert.equal(female.length, LAYER_SPEC.length * ART.cuts.length * ART.styles.length);
  assert.deepEqual(female, male.map((f) => `female/${f}`));
  assert.ok(female.every((f) => f.startsWith("female/")));
});

test("the document lists every file the resolver would ask the artist for, and no other female/ file", () => {
  const text = doc();
  for (const file of requiredFilesFor("female")) assert.ok(text.includes(`\`${file}\``), `${file} is missing from ${DOC}`);
  const listed = [...text.matchAll(/`(female\/[a-z_/]+\.png)`/g)].map((m) => m[1]);
  const allowed = new Set([...requiredFilesFor("female"), "female/base/body_blank_face.png"]);   // the blank-skin base is the one extra, requested in the face section
  for (const file of listed) assert.ok(allowed.has(file), `${DOC} asks for ${file}, which the resolver does not know`);
});

test("every document the code points to exists (the old comment named a file that was never written)", () => {
  const source = readFileSync("js/data/avatarLook.js", "utf8");
  const refs = [...source.matchAll(/docs\/implementation\/[A-Za-z0-9_.-]+\.md/g)].map((m) => m[0]);
  assert.ok(refs.includes(DOC), "avatarLook.js points at the art spec");
  for (const ref of refs) assert.ok(existsSync(ref), `${ref} does not exist`);
});

test("female is declared but not enabled: not in the shipped art, not selectable, and the shipped file list stays male-only", () => {
  assert.deepEqual(ART.presentations, ["male"]);
  assert.equal(PRESENTATIONS.find((p) => p.id === "female").art, false);
  assert.ok(requiredFiles().every((f) => !f.startsWith("female/")), "the validator must not demand female files until the art exists");
  assert.deepEqual(requiredFiles(), requiredFilesFor("male"));
});

test("a saved female look is kept as saved but drawn with the male art, and says so", () => {
  const look = sanitizeLook({ skin: "tan", presentation: "female", build: { height: 170, shoulders: 30, waist: 50, arms: 50, legs: 50 } });
  assert.equal(look.presentation, "female", "never rewritten to male");
  const r = resolveLayers(look);
  assert.equal(r.presentation, "male");
  assert.equal(r.presentationFellBack, true);
  assert.ok(r.layers.every((l) => !l.file.startsWith("female/")), "no request for art that does not exist");
});

test("the document is honest about what is not there: no face control today, no wrinkle claim", () => {
  const text = doc();
  assert.match(text, /no face control is shown today/i);
  assert.match(text, /No wrinkles, no skin change/);
  assert.match(text, /not an acceptable female character/);
});
