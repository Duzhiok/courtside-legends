import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOOK, PRESENTATIONS, BODY_PRESETS, lookColors, sanitizeLook, saveLook, readLook } from "../js/data/avatarLook.js";
import { BUILD_KEYS, BUILD_RANGE, DEFAULT_BUILD, HEIGHT_CM, buildFromShape, sanitizeBuild, shapeFromBuild } from "../js/data/avatarBuild.js";
import { AGE, GRAY_FROM, agedHex, grayFraction, sanitizeAge } from "../js/data/avatarAge.js";
import { lookSignature } from "../js/data/avatarPortrait.js";
import { ART, requiredFiles, resolveLayers } from "../js/ui/avatar2d/avatar2dLayers.js";
import { effectiveBuild } from "../js/ui/avatarLookView.js";
import { LOOK_TABS, lookPanelHtml } from "../js/ui/avatarLookView.js";
import { nextTabId } from "../js/ui/avatarLookControls.js";

const OLD_LOOKS = [{}, DEFAULT_LOOK, { skin: "deep", hair: "red", outfit: "royal", style: "shaved", body: "broad", figure: "bobblehead", cut: "street" }];

test("old saves are untouched: a look without the Creator 2.0 fields comes out exactly as before (no new keys), and its portrait signature does not change", () => {
  for (const look of OLD_LOOKS) {
    const out = sanitizeLook(look);
    assert.deepEqual(Object.keys(out).sort(), ["body", "cut", "figure", "hair", "outfit", "skin", "style"], "seven fields, as it has always been");
  }
  assert.equal(lookSignature(DEFAULT_LOOK), "warm.black.forest.short.standard.stylized");
  assert.equal(lookSignature({}), "warm.black.forest.short.standard.stylized");
  assert.deepEqual(sanitizeLook(DEFAULT_LOOK), DEFAULT_LOOK);
});

test("the new fields are sparse and sanitised: junk, out-of-range and default values vanish; real values are clamped", () => {
  assert.equal(sanitizeLook({ appearanceAge: AGE.default }).appearanceAge, undefined, "the default age is no age");
  assert.equal(sanitizeLook({ appearanceAge: "x" }).appearanceAge, undefined);
  assert.equal(sanitizeLook({ appearanceAge: 3 }).appearanceAge, AGE.min);
  assert.equal(sanitizeLook({ appearanceAge: 200 }).appearanceAge, AGE.max);
  assert.equal(sanitizeLook({ appearanceAge: 41.6 }).appearanceAge, 42);
  assert.equal(sanitizeLook({ build: DEFAULT_BUILD }).build, undefined, "a build equal to the default is no build");
  assert.equal(sanitizeLook({ build: "tall" }).build, undefined);
  assert.equal(sanitizeLook({ build: [1, 2] }).build, undefined);
  assert.deepEqual(sanitizeLook({ build: { height: 999, shoulders: -5, waist: "no" } }).build, { height: 220, shoulders: 0, waist: 50, arms: 50, legs: 50 });
  assert.equal(sanitizeLook({ presentation: "male" }).presentation, undefined);
  assert.equal(sanitizeLook({ presentation: "robot" }).presentation, undefined);
  assert.equal(sanitizeLook({ presentation: "female" }).presentation, "female", "a saved female look is kept (so the choice survives until art arrives)");
  assert.deepEqual(sanitizeLook(sanitizeLook({ appearanceAge: 60, build: { height: 170, shoulders: 20, waist: 50, arms: 50, legs: 50 }, presentation: "female" })), sanitizeLook({ appearanceAge: 60, build: { height: 170, shoulders: 20, waist: 50, arms: 50, legs: 50 }, presentation: "female" }), "idempotent");
});

test("the portrait signature changes when a Creator 2.0 field changes, so a stale picture is hidden", () => {
  const base = lookSignature(DEFAULT_LOOK);
  const ids = new Set([base, lookSignature({ appearanceAge: 60 }), lookSignature({ build: { height: 170, shoulders: 50, waist: 50, arms: 50, legs: 50 } }), lookSignature({ presentation: "female" })]);
  assert.equal(ids.size, 4);
  assert.notEqual(lookSignature({ build: { height: 170, shoulders: 50, waist: 50, arms: 50, legs: 50 } }), lookSignature({ build: { height: 171, shoulders: 50, waist: 50, arms: 50, legs: 50 } }));
});

test("save and read: the new fields round-trip through the account, and a look saved without them stays without", () => {
  const account = { avatar: { skin: "tan" } };
  const persisted = [];
  const persist = (a) => persisted.push(JSON.stringify(a.avatar));
  saveLook(account, { appearanceAge: 58, build: { height: 172, shoulders: 30, waist: 50, arms: 80, legs: 50 } }, { persist });
  assert.deepEqual(readLook(account), sanitizeLook({ skin: "tan", appearanceAge: 58, build: { height: 172, shoulders: 30, waist: 50, arms: 80, legs: 50 } }));
  assert.equal(readLook(account).appearanceAge, 58);
  saveLook(account, { build: null, appearanceAge: AGE.default }, { persist });
  assert.deepEqual(Object.keys(readLook(account)).sort(), ["body", "cut", "figure", "hair", "outfit", "skin", "style"], "reset leaves no trace");
  assert.ok(!persisted.at(-1).includes("build") && !persisted.at(-1).includes("appearanceAge"));
});

test("build sliders <-> shape: centre is neutral, ends move by the declared range, monotonic, and a preset round-trips through the sliders", () => {
  const neutral = shapeFromBuild(DEFAULT_BUILD);
  for (const key of ["shoulders", "arms", "waist", "legs", "height"]) assert.equal(neutral[key], 0, key);
  for (const key of ["shoulders", "arms", "waist", "legs"]) {
    const lo = shapeFromBuild({ ...DEFAULT_BUILD, [key]: 0 })[key];
    const hi = shapeFromBuild({ ...DEFAULT_BUILD, [key]: 100 })[key];
    assert.ok(Math.abs(lo + BUILD_RANGE[key]) < 1e-9 && Math.abs(hi - BUILD_RANGE[key]) < 1e-9, key);
    let last = -Infinity;
    for (let v = 0; v <= 100; v += 5) { const d = shapeFromBuild({ ...DEFAULT_BUILD, [key]: v })[key]; assert.ok(d > last); last = d; }
  }
  assert.ok(Math.abs(shapeFromBuild({ ...DEFAULT_BUILD, height: HEIGHT_CM.max }).height - (HEIGHT_CM.max / HEIGHT_CM.default - 1)) < 1e-9);
  for (const preset of BODY_PRESETS) {
    const sliders = buildFromShape(preset.shape);
    const back = shapeFromBuild(sliders);
    for (const key of ["shoulders", "arms", "waist", "legs"]) assert.ok(Math.abs(back[key] - preset.shape[key]) < BUILD_RANGE[key] / 50 + 1e-9, `${preset.id}.${key}`);
    assert.deepEqual(effectiveBuild({ body: preset.id }), sliders, "the editor opens on the figure the preset draws");
  }
  assert.deepEqual(sanitizeBuild({ ...DEFAULT_BUILD, height: 186 }), { ...DEFAULT_BUILD, height: 186 });
  assert.equal(BUILD_KEYS.length, 5);
});

test("appearance age: no grey up to 34, steadily more after, never a flat grey; grey hair barely moves; brows grey with the hair", () => {
  assert.equal(grayFraction(GRAY_FROM), 0);
  assert.equal(grayFraction(20), 0);
  let last = 0;
  for (let a = GRAY_FROM + 1; a <= AGE.max; a += 1) { const g = grayFraction(a); assert.ok(g > last, `age ${a}`); last = g; }
  assert.ok(last < 1, "never a pure flat grey");
  assert.equal(agedHex("#1b1b1b", 20), "#1b1b1b");
  assert.equal(agedHex("#1b1b1b", undefined), "#1b1b1b");
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255); };
  assert.ok(lum(agedHex("#1b1b1b", 60)) > lum(agedHex("#1b1b1b", 45)) && lum(agedHex("#1b1b1b", 45)) > lum("#1b1b1b"));
  assert.ok(Math.abs(lum(agedHex("#9aa0a6", 65)) - lum("#9aa0a6")) < 200, "already-grey hair stays near grey");
  assert.equal(lookColors({ hair: "black", appearanceAge: 20 }).Hair, "#1b1b1b");
  assert.notEqual(lookColors({ hair: "black", appearanceAge: 62 }).Hair, "#1b1b1b");
  assert.equal(lookColors({ style: "shaved", skin: "tan", appearanceAge: 62 }).Hair, lookColors({ style: "shaved", skin: "tan" }).Hair, "a shaved head is still skin-coloured");
  const tint = (look, role) => resolveLayers(look).layers.find((l) => l.role === role)?.tint;
  assert.equal(tint({ hair: "black", appearanceAge: 62 }, "hair_front"), tint({ hair: "black", appearanceAge: 62 }, "brows"), "the eyebrows grey together with the hair");
  assert.notEqual(tint({ hair: "black", appearanceAge: 62 }, "brows"), tint({ hair: "black" }, "brows"));
  assert.ok(sanitizeAge(AGE.default) === null);
});

test("presentation: female is declared but has no art, so it is not selectable, and a saved female look draws the male art and says so", () => {
  assert.deepEqual(PRESENTATIONS.map((p) => [p.id, p.art]), [["male", true], ["female", false]]);
  assert.deepEqual(ART.presentations, ["male"]);
  const male = resolveLayers({});
  assert.equal(male.presentation, "male");
  assert.equal(male.presentationFellBack, false);
  const female = resolveLayers({ presentation: "female" });
  assert.equal(female.presentation, "male");
  assert.equal(female.presentationFellBack, true, "reported, never hidden");
  assert.deepEqual(female.layers.map((l) => l.file), male.layers.map((l) => l.file), "no recoloured stand-in: the same male files");
  assert.ok(requiredFiles().every((f) => !f.startsWith("female/")), "no female file is required until the art exists");
  const html = lookPanelHtml({}, "Z", "en");
  assert.match(html, /name="mw-look-presentation" value="female" [^>]*disabled/, "the female choice is shown and disabled");
  assert.match(html, /name="mw-look-presentation" value="male" checked/);
});

test("the editor has the five pages, in order, each with one panel; face offers no control that does nothing; both languages, no Chinese in English", () => {
  assert.deepEqual(LOOK_TABS.map((t) => t.id), ["identity", "face", "body", "hair", "outfit"]);
  for (const lang of ["zh", "en"]) {
    const html = lookPanelHtml({}, "Z", lang);
    for (const tab of LOOK_TABS) {
      assert.match(html, new RegExp(`role="tab"[^>]*data-tab="${tab.id}"`));
      assert.match(html, new RegExp(`role="tabpanel" id="mw-pane-${tab.id}"`));
    }
    assert.equal((html.match(/role="tabpanel"[^>]*>/g) || []).filter((p) => !p.includes("hidden")).length, 1, "only the first page is visible");
    if (lang === "en") assert.doesNotMatch(html, /[\u4e00-\u9fff]/);
  }
  const html = lookPanelHtml({}, "Z", "en");
  const face = html.slice(html.indexOf('id="mw-pane-face"'), html.indexOf('id="mw-pane-body"'));
  assert.doesNotMatch(face, /<input|<button/, "the Face page has nothing to click until the art exists");
  assert.equal((html.match(/name="mw-build-/g) || []).length, 5, "exactly the five build sliders");
  assert.match(html, /name="mw-age" min="18" max="65"/);
  assert.match(html, /never changes in-game height/i, "height is declared appearance-only");
  // the sliders open on the preset figure and on a custom one
  assert.match(lookPanelHtml({ body: "broad" }, "Z", "en"), /name="mw-build-shoulders"[^>]*value="85"/);
  assert.match(lookPanelHtml({ build: { height: 171, shoulders: 10, waist: 50, arms: 50, legs: 50 } }, "Z", "en"), /name="mw-build-height"[^>]*value="171"/);
});

test("tab keys: arrows wrap, Home and End jump, anything else does nothing", () => {
  assert.equal(nextTabId("identity", "ArrowRight"), "face");
  assert.equal(nextTabId("outfit", "ArrowRight"), "identity");
  assert.equal(nextTabId("identity", "ArrowLeft"), "outfit");
  assert.equal(nextTabId("body", "Home"), "identity");
  assert.equal(nextTabId("body", "End"), "outfit");
  assert.equal(nextTabId("body", "a"), null);
});
