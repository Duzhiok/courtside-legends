// Profile photo: the player's own picture, cropped square on this device. Avatar and picture stay separate.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const photo = await import("../js/ui/portraitPhoto.js");
const portrait = await import("../js/data/avatarPortrait.js");
const look = await import("../js/data/avatarLook.js");
const { portraitSrc } = await import("../js/ui/avatarPortraitArt.js");
const { lookPanelHtml } = await import("../js/ui/avatarLookView.js");

const JPEG = (n) => `data:image/jpeg;base64,${"A".repeat(n)}`;
const file = (over = {}) => ({ type: "image/jpeg", size: 2000, ...over });
const deps = (over = {}) => {
  const d = {
    closed: false,
    decode: async () => ({ width: 4000, height: 3000, close() { d.closed = true; } }),
    encode: () => JPEG(500),
    ...over,
  };
  return d;
};

test("squareCrop takes the largest centred square, from any orientation", () => {
  assert.deepEqual(photo.squareCrop(4000, 3000), { sx: 500, sy: 0, side: 3000 });
  assert.deepEqual(photo.squareCrop(3000, 4000), { sx: 0, sy: 500, side: 3000 });
  assert.deepEqual(photo.squareCrop(500, 500), { sx: 0, sy: 0, side: 500 });
  for (const bad of [[0, 5], [5, 0], [-1, 5], [NaN, 5], [Infinity, 5]]) assert.equal(photo.squareCrop(...bad), null, String(bad));
});

test("a good photo becomes a small data URL and the decoded bitmap is released", async () => {
  const d = deps();
  const r = await photo.photoToPortrait(file(), d);
  assert.equal(r.ok, true);
  assert.match(r.image, /^data:image\/jpeg;base64,/);
  assert.equal(d.closed, true);
});

test("refusals: wrong type, empty, huge, unreadable; none of them reach the encoder", async () => {
  let encoded = 0;
  const d = deps({ encode: () => { encoded += 1; return JPEG(10); } });
  assert.equal((await photo.photoToPortrait(file({ type: "image/svg+xml" }), d)).reason, "type", "SVG can carry script");
  assert.equal((await photo.photoToPortrait(file({ type: "video/mp4" }), d)).reason, "type");
  assert.equal((await photo.photoToPortrait(null, d)).reason, "type");
  assert.equal((await photo.photoToPortrait(file({ size: 0 }), d)).reason, "empty");
  assert.equal((await photo.photoToPortrait(file({ size: photo.PHOTO_MAX_BYTES + 1 }), d)).reason, "huge");
  assert.equal((await photo.photoToPortrait(file(), deps({ decode: async () => { throw new Error("corrupt"); } }))).reason, "unreadable");
  assert.equal((await photo.photoToPortrait(file(), deps({ decode: async () => ({ width: 0, height: 0 }) }))).reason, "unreadable");
  assert.equal(encoded, 0);
});

test("a busy photo is retried at lower quality until it fits the storage cap; otherwise it is refused, not truncated", async () => {
  const tried = [];
  const big = portrait.MAX_PORTRAIT_CHARS + 1;
  const fits = await photo.photoToPortrait(file(), deps({ encode: (_i, _c, _s, q) => { tried.push(q); return JPEG(q > 0.6 ? big : 900); } }));
  assert.equal(fits.ok, true);
  assert.ok(tried.length >= 2 && tried[0] > tried[tried.length - 1], `qualities ${tried}`);
  const never = await photo.photoToPortrait(file(), deps({ encode: () => JPEG(big) }));
  assert.deepEqual(never, { ok: false, reason: "toobig" });
});

test("the photo is encoded square at the profile size", async () => {
  let seen;
  await photo.photoToPortrait(file(), deps({ encode: (_i, crop, size) => { seen = { crop, size }; return JPEG(10); } }));
  assert.equal(seen.size, photo.PHOTO_PX);
  assert.deepEqual(seen.crop, { sx: 500, sy: 0, side: 3000 });
});

test("storage whitelist: only a small raster data URL is accepted as a photo", () => {
  const ok = JPEG(200);
  assert.deepEqual(portrait.sanitizePortrait({ source: "photo", image: ok }), { source: "photo", image: ok });
  for (const image of ["https://evil.example/x.jpg", "data:image/svg+xml;base64,AAAA", "javascript:alert(1)", "data:text/html;base64,AAAA", JPEG(portrait.MAX_PORTRAIT_CHARS + 1), 42, null]) {
    assert.equal(portrait.sanitizePortrait({ source: "photo", image }), null, String(image).slice(0, 40));
  }
  assert.deepEqual(portrait.sanitizePortrait({ source: "photo", image: ok, extra: "<x>" }), { source: "photo", image: ok }, "extra fields are dropped");
});

test("a photo never goes stale: changing the character or its style does not hide it", () => {
  const p = { source: "photo", image: JPEG(200) };
  for (const l of [look.DEFAULT_LOOK, { ...look.DEFAULT_LOOK, figure: "bobblehead" }, { ...look.DEFAULT_LOOK, skin: "deep", outfit: "royal" }]) {
    const r = portrait.resolvePortrait(p, l, "acct");
    assert.equal(r.kind, "photo");
    assert.equal(r.stale, false);
    assert.equal(r.image, p.image);
  }
  assert.equal(portraitSrc(portrait.resolvePortrait(p, look.DEFAULT_LOOK, "acct")), p.image);
});

test("picture and character are independent: saving a photo leaves the look alone, and the look leaves the photo alone", () => {
  globalThis.localStorage = createMemoryStorage();
  const account = { id: "a" };
  const persist = () => {};
  look.saveLook(account, { figure: "bobblehead", skin: "brown" }, { persist });
  const before = JSON.stringify(look.readLook(account));
  const res = portrait.savePortrait(account, { source: "photo", image: JPEG(300) }, { persist });
  assert.equal(res.saved, true);
  assert.equal(JSON.stringify(look.readLook(account)), before, "look untouched by the photo");
  look.saveLook(account, { figure: "stylized", hair: "red" }, { persist });
  assert.equal(portrait.readPortrait(account).source, "photo", "photo untouched by the look");
});

test("photos are per account and per guest, never shared", () => {
  globalThis.localStorage = createMemoryStorage();
  const a = { id: "a" };
  const b = { id: "b" };
  const persist = () => {};
  portrait.savePortrait(a, { source: "photo", image: JPEG(300) }, { persist });
  assert.equal(portrait.readPortrait(b), null);
  assert.equal(portrait.readPortrait(null), null);
  portrait.savePortrait(null, { source: "photo", image: JPEG(310) });
  assert.equal(portrait.readPortrait(null).source, "photo");
  assert.notEqual(portrait.readPortrait(null).image, portrait.readPortrait(a).image);
});

test("the panel has the upload control with an honest privacy note, in both languages", () => {
  const zh = lookPanelHtml(look.DEFAULT_LOOK, "Ann", "zh", { kind: "preset", chosen: false, presetId: "p1" });
  const en = lookPanelHtml(look.DEFAULT_LOOK, "Ann", "en", { kind: "photo", chosen: true, image: JPEG(100) });
  assert.match(zh, /data-mw-action="pick-photo" aria-pressed="false"/);
  assert.match(zh, /不会上传/);
  assert.match(en, /pick-photo" aria-pressed="true"/);
  assert.match(en, /never uploaded/);
  assert.match(en, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.ok(!/[\u4e00-\u9fff]/.test(en.replace(/<img[^>]*>/g, "")), "no Chinese in English");
});

test("every refusal reason has text in both languages", () => {
  for (const reason of ["type", "empty", "huge", "unreadable", "toobig", "something-new"]) {
    assert.ok(photo.photoReasonText(reason, "zh").length > 0);
    assert.ok(!/[\u4e00-\u9fff]/.test(photo.photoReasonText(reason, "en")), reason);
  }
});
