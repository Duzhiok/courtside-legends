// Profile picture (ADR-008a addendum W1): whitelist, staleness, isolation, persistence, art, and the honesty of the UI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const portrait = await import("../js/data/avatarPortrait.js");
const look = await import("../js/data/avatarLook.js");
const art = await import("../js/ui/avatarPortraitArt.js");
const { portraitFor } = await import("../js/ui/portraitFor.js");
const { lookPanelHtml } = await import("../js/ui/avatarLookView.js");
const { identityCardHtml, myWorldHtml } = await import("../js/ui/myWorldView.js");

const CJK = /[\u4e00-\u9fff]/;
const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const sig = (l) => portrait.lookSignature(l);
const noPersist = { persist: () => {} };

test("sanitizePortrait accepts a preset and a small raster data URL, and nothing else", () => {
  assert.deepEqual(portrait.sanitizePortrait({ source: "preset", preset: "p2" }), { source: "preset", preset: "p2" });
  assert.deepEqual(portrait.sanitizePortrait({ source: "3d", image: IMG, sig: "a.b.c.d" }), { source: "3d", image: IMG, sig: "a.b.c.d" });
  for (const bad of [
    undefined, null, "p1", 7, [], {},
    { source: "preset", preset: "nope" }, { source: "preset", preset: "__proto__" }, { source: "preset" },
    { source: "3d", image: "data:image/svg+xml;base64,PHN2Zz4=", sig: "x" },       // SVG can carry script
    { source: "3d", image: "https://evil.example/a.jpg", sig: "x" },
    { source: "3d", image: "javascript:alert(1)", sig: "x" },
    { source: "3d", image: "data:image/jpeg;base64,/9j/\"onerror=1", sig: "x" },
    { source: "3d", image: `data:image/jpeg;base64,${"A".repeat(portrait.MAX_PORTRAIT_CHARS)}`, sig: "x" }, // too big
    { source: "3d", image: IMG },                                                      // no signature
    { source: "3d", image: IMG, sig: "s".repeat(200) },
    { source: "url", image: IMG, sig: "x" },
  ]) assert.equal(portrait.sanitizePortrait(bad), null, String(JSON.stringify(bad)).slice(0, 60));
});

test("lookSignature changes with every visible field and ignores junk", () => {
  const base = sig(look.DEFAULT_LOOK);
  assert.equal(sig(look.DEFAULT_LOOK), base);
  assert.equal(sig({ skin: "<script>", hair: 3 }), base);
  for (const [k, v] of [["skin", "deep"], ["hair", "red"], ["outfit", "royal"], ["style", "shaved"]]) {
    assert.notEqual(sig({ ...look.DEFAULT_LOOK, [k]: v }), base, k);
  }
});

test("defaultPresetId is stable per owner, always valid, and not one picture for everybody", () => {
  const ids = new Set();
  for (let i = 0; i < 60; i++) {
    const id = portrait.defaultPresetId(`acc-${i}`);
    assert.ok(portrait.PORTRAIT_PRESETS.some((p) => p.id === id));
    assert.equal(portrait.defaultPresetId(`acc-${i}`), id);
    ids.add(id);
  }
  assert.ok(ids.size >= 4, `only ${ids.size} distinct defaults`);
  assert.ok(portrait.PORTRAIT_PRESETS.length >= 6);
});

test("resolvePortrait: default, chosen preset, matching 3D picture, and a stale 3D picture is NOT shown", () => {
  const l = look.DEFAULT_LOOK;
  const none = portrait.resolvePortrait(null, l, "a1");
  assert.equal(none.kind, "preset"); assert.equal(none.chosen, false); assert.equal(none.stale, false);
  const pick = portrait.resolvePortrait({ source: "preset", preset: "p4" }, l, "a1");
  assert.deepEqual([pick.kind, pick.presetId, pick.chosen], ["preset", "p4", true]);
  const raw3d = { source: "3d", image: IMG, sig: sig(l) };
  const live = portrait.resolvePortrait(raw3d, l, "a1");
  assert.deepEqual([live.kind, live.image, live.stale], ["3d", IMG, false]);
  const changed = portrait.resolvePortrait(raw3d, { ...l, hair: "red" }, "a1");
  assert.equal(changed.kind, "preset"); assert.equal(changed.image, null); assert.equal(changed.stale, true);
});

test("save/read: account field, invalid input is refused without touching anything, guests use their own key", () => {
  const store = createMemoryStorage();
  const saved = [];
  const a = { id: "a1", avatar: { skin: "deep" } };
  const res = portrait.savePortrait(a, { source: "preset", preset: "p3" }, { store, persist: (x) => saved.push(x) });
  assert.equal(res.saved, true);
  assert.deepEqual(a.avatarPortrait, { source: "preset", preset: "p3" });
  assert.equal(saved.length, 1);
  assert.deepEqual(portrait.readPortrait(a, store), { source: "preset", preset: "p3" });

  const bad = portrait.savePortrait(a, { source: "3d", image: "https://x/y.png", sig: "s" }, { store, persist: (x) => saved.push(x) });
  assert.equal(bad.invalid, true); assert.equal(bad.saved, false);
  assert.equal(saved.length, 1, "an invalid picture must not be persisted");
  assert.deepEqual(a.avatarPortrait, { source: "preset", preset: "p3" });

  assert.equal(portrait.readPortrait(null, store), null);
  portrait.savePortrait(null, { source: "preset", preset: "p5" }, { store });
  assert.deepEqual(portrait.readPortrait(null, store), { source: "preset", preset: "p5" });
  assert.equal(JSON.parse(store.getItem(portrait.GUEST_PORTRAIT_KEY)).preset, "p5");
  assert.equal(portrait.readPortrait({ id: "other" }, store), null, "an account never reads the guest's picture");
});

test("a guest save on a device with storage disabled says so instead of pretending", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const r = portrait.savePortrait(null, { source: "preset", preset: "p1" }, { store: broken });
  assert.equal(r.saved, false);
  assert.equal(portrait.readPortrait(null, broken), null);
});

test("two accounts keep their own pictures", () => {
  const a = { id: "a" }; const b = { id: "b" };
  portrait.savePortrait(a, { source: "preset", preset: "p2" }, noPersist);
  portrait.savePortrait(b, { source: "preset", preset: "p6" }, noPersist);
  assert.equal(portrait.readPortrait(a).preset, "p2");
  assert.equal(portrait.readPortrait(b).preset, "p6");
});

test("REGRESSION: changing the look must not wipe the picture, and saving a picture must not touch the look", () => {
  const a = { id: "a1" };
  portrait.savePortrait(a, { source: "preset", preset: "p4" }, noPersist);
  look.saveLook(a, { hair: "red" }, { persist: () => {} });
  assert.deepEqual(a.avatarPortrait, { source: "preset", preset: "p4" });
  const before = JSON.stringify(a.avatar);
  portrait.savePortrait(a, { source: "preset", preset: "p1" }, noPersist);
  assert.equal(JSON.stringify(a.avatar), before);
});

test("the picture is cosmetic: the data module reaches no engine or rating code", () => {
  const src = readFileSync(new URL("../js/data/avatarPortrait.js", import.meta.url), "utf8");
  const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./account.js", "./avatarLook.js", "./profile.js"]);
});

test("portraitFor: every surface gets the same picture; a 3D picture only while the look still matches", () => {
  const a = { id: "acc-7", avatar: { hair: "red" } };
  const store = createMemoryStorage();
  const first = portraitFor(a, { store });
  assert.match(first.src, /^data:image\/svg\+xml/);
  assert.equal(portraitFor(a, { store }).src, first.src, "deterministic");
  a.avatarPortrait = { source: "3d", image: IMG, sig: sig(a.avatar) };
  assert.equal(portraitFor(a, { store }).src, IMG);
  a.avatar = { hair: "gray" }; // look changed after the picture was taken
  const stale = portraitFor(a, { store });
  assert.match(stale.src, /^data:image\/svg\+xml/);
  assert.equal(stale.stale, true);
});

test("preset art: valid, self-contained, deterministic and visibly different from each other", () => {
  const seen = new Set();
  for (const p of portrait.PORTRAIT_PRESETS) {
    const svg = art.presetPortraitSvg(p);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.doesNotMatch(svg, /<script|href=|onload|onerror|https?:\/\/(?!www\.w3\.org)/i);
    assert.equal(art.presetPortraitSvg(p), svg);
    seen.add(svg);
    const uri = art.presetPortraitUri(p);
    assert.match(uri, /^data:image\/svg\+xml;charset=utf-8,/);
    assert.equal(decodeURIComponent(uri.split(",").slice(1).join(",")), svg);
  }
  assert.equal(seen.size, portrait.PORTRAIT_PRESETS.length);
  assert.ok(art.presetPortraitSvg({ id: "does-not-exist" }).includes("<svg"), "unknown id falls back instead of throwing");
  assert.equal(art.portraitSrc({ kind: "3d", image: IMG, presetId: null }), IMG);
  assert.equal(art.portraitSrc({ kind: "3d", image: null, presetId: "p2" }), art.presetPortraitUri(portrait.PORTRAIT_PRESETS[1]));
});

test("panel: six presets, the chosen one checked, the 3D button disabled until the figure exists, honest stale note", () => {
  const html = lookPanelHtml(look.DEFAULT_LOOK, "Zoro", "zh", { kind: "preset", presetId: "p3", chosen: true, stale: false });
  assert.equal((html.match(/name="mw-portrait"/g) || []).length, portrait.PORTRAIT_PRESETS.length);
  assert.match(html, /value="p3" checked/);
  assert.equal((html.match(/name="mw-portrait" value="[^"]+" checked/g) || []).length, 1);
  assert.match(html, /data-mw-action="use-3d-portrait"[^>]*disabled/);
  const unchosen = lookPanelHtml(look.DEFAULT_LOOK, "Zoro", "zh", { kind: "preset", presetId: "p3", chosen: false, stale: false });
  assert.doesNotMatch(unchosen, /name="mw-portrait" value="[^"]+" checked/, "an automatic default is not shown as 'chosen'");
  const stale = lookPanelHtml(look.DEFAULT_LOOK, "Zoro", "zh", { kind: "preset", presetId: "p3", chosen: true, stale: true });
  assert.match(stale, /不再显示/);
  const on3d = lookPanelHtml(look.DEFAULT_LOOK, "Zoro", "zh", { kind: "3d", presetId: null, image: IMG, chosen: true, stale: false });
  assert.match(on3d, /aria-pressed="true"/);
  assert.doesNotMatch(lookPanelHtml(look.DEFAULT_LOOK, "Zoro", "en", { kind: "preset", presetId: "p1", chosen: true, stale: true }), CJK);
});

test("identity card shows the resolved picture, escapes it, and falls back to initials only when none is given", () => {
  const id = { name: "Zoro", hometown: "", bio: "", guest: false };
  assert.match(identityCardHtml(id, "en", { src: IMG }), new RegExp(`class="mw-avatar" src="${IMG.replace(/[+/]/g, "\\$&")}"`));
  const evil = identityCardHtml(id, "en", { src: 'x" onerror="alert(1)' });
  assert.doesNotMatch(evil, /onerror="alert/);
  assert.match(identityCardHtml(id, "en"), /class="mw-avatar" src="data:image\/svg\+xml/);
  const page = myWorldHtml({ identity: id, journey: null, legacy: null, frames: [], look: look.DEFAULT_LOOK, portrait: { src: IMG, kind: "3d", chosen: true } }, "en");
  assert.ok(page.includes(IMG));
  assert.doesNotMatch(page, CJK);
});
