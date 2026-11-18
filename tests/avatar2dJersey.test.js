// Wearing an owned jersey on the 2D figure: colours on the existing cut's tint slots + the number on the chest. Never part of the look.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { DEFAULT_LOOK, sanitizeLook } = await import("../js/data/avatarLook.js");
const { ART_FAMILY, NUMBER_ANCHOR, jerseyKit, paintJerseyNumber } = await import("../js/ui/avatar2d/avatar2dJersey.js");
const { CANVAS, resolveLayers } = await import("../js/ui/avatar2d/avatar2dLayers.js");
const { mountAvatar2d } = await import("../js/ui/avatar2d/avatar2dRenderer.js");
const { listJerseyCatalog, getJerseyTemplate } = await import("../js/collectibles/jerseyCatalog.js");
const { equipJersey, equippedJerseyTemplate, listOwnedJerseys, unequipJersey } = await import("../js/collectibles/jerseyCollection.js");
const { SHOP_ITEMS } = await import("../js/data/shopCatalog.js");
const shop = await import("../js/data/shop.js");
const acc = await import("../js/data/account.js");
const { jerseyCollectionHtml } = await import("../js/ui/collectibles/jerseyCollectionView.js");

const originals = () => listJerseyCatalog({ onSale: true });
const tintOf = (resolved, role) => resolved.layers.find((l) => l.role === role).tint;

test("all eight original jerseys make a kit: their own colours and their own number, nothing invented", () => {
  const all = originals();
  assert.equal(all.length, 8);
  for (const t of all) {
    const kit = jerseyKit(t);
    assert.ok(kit, t.id);
    assert.equal(kit.shirt, t.colors.primary);
    assert.equal(kit.pants, t.colors.secondary);
    assert.equal(kit.trim, t.colors.trim);
    assert.equal(kit.number, String(t.number), `${t.id} keeps its number`);
    assert.equal(kit.simplified, t.family !== ART_FAMILY);
  }
});

test("a template with no usable colours or number makes no kit / no number, rather than a guess", () => {
  assert.equal(jerseyKit(null), null);
  assert.equal(jerseyKit({}), null);
  assert.equal(jerseyKit({ colors: { primary: "red", secondary: "#fff", trim: "#ffffff" } }), null, "only 6-digit hex colours are accepted");
  const base = { family: "modern_fitted", colors: { primary: "#112233", secondary: "#445566", trim: "#778899" } };
  assert.equal(jerseyKit({ ...base, number: null }).number, null, "a story jersey states no number, so none is drawn");
  assert.equal(jerseyKit({ ...base, number: 100 }).number, null);
  assert.equal(jerseyKit({ ...base, number: -1 }).number, null);
  assert.equal(jerseyKit({ ...base, number: "x" }).number, null);
  assert.equal(jerseyKit({ ...base, number: 0 }).number, "0", "zero is a real number");
  assert.equal(jerseyKit({ ...base, number: 7 }).simplified, false, "the art's own family is not flagged");
  assert.equal(jerseyKit({ ...base, family: "classic_short" }).simplified, true);
});

test("layers: the jersey's colours replace shirt / shorts / trim; skin, hair, cut and the look itself are untouched", () => {
  const kit = jerseyKit(getJerseyTemplate("orig_neon_1986_23"));
  const plain = resolveLayers(DEFAULT_LOOK);
  const worn = resolveLayers(DEFAULT_LOOK, kit);
  assert.equal(tintOf(worn, "top"), kit.shirt);
  assert.equal(tintOf(worn, "bottom"), kit.pants);
  assert.equal(tintOf(worn, "top_trim"), kit.trim);
  assert.equal(tintOf(worn, "bottom_trim"), kit.trim);
  for (const role of ["body", "hair_front", "hair_back", "brows"]) assert.equal(tintOf(worn, role), tintOf(plain, role), `${role} unchanged`);
  assert.deepEqual(worn.layers.map((l) => l.file), plain.layers.map((l) => l.file), "same art files, only tints differ");
  assert.deepEqual(worn.look, plain.look, "the look has no jersey in it");
  assert.equal(plain.jersey, null);
  assert.deepEqual(resolveLayers(DEFAULT_LOOK, null).layers, plain.layers);
  const shaved = resolveLayers({ ...DEFAULT_LOOK, style: "shaved" }, kit);
  assert.equal(tintOf(shaved, "top"), kit.shirt, "a jersey works with every hairstyle");
});

test("two different jerseys give two different figures (not one shirt that never changes)", () => {
  const tints = new Set(originals().map((t) => tintOf(resolveLayers(DEFAULT_LOOK, jerseyKit(t)), "top") + tintOf(resolveLayers(DEFAULT_LOOK, jerseyKit(t)), "bottom")));
  assert.ok(tints.size >= 5, `${tints.size} distinct shirt+shorts colourways across 8 jerseys`);
});

// ---- the canvas -----------------------------------------------------------------------------------------------------

function recordingCanvases() {
  const all = [];
  const create = (width, height) => {
    const ops = [];
    const ctx = new Proxy({}, {
      get: (t, k) => {
        if (k === "fillText" || k === "strokeText") return (text, x, y, max) => ops.push([k, text, x, y, max]);
        if (k === "drawImage") return () => ops.push(["draw"]);
        return t[k] ?? (() => {});
      },
      set: (t, k, v) => { t[k] = v; if (k === "fillStyle" || k === "strokeStyle" || k === "font") ops.push([k, v]); return true; },
    });
    const canvas = { width, height, dataset: {}, style: {}, ops, getContext: () => ctx, toDataURL: () => "data:image/jpeg;base64,xx", remove() {} };
    all.push(canvas);
    return canvas;
  };
  return { create, all };
}
const container = () => ({ children: [], appendChild(c) { this.children.push(c); } });
const art = (file) => Promise.resolve({ name: file });
const numbersDrawn = (canvas) => canvas.ops.filter((o) => o[0] === "fillText").map((o) => o[1]);

test("the number is painted on the chest after the layers, at the measured anchor, inside the art canvas", async () => {
  const { create, all } = recordingCanvases();
  const kit = jerseyKit(getJerseyTemplate("orig_neon_1986_23"));
  const handle = await mountAvatar2d(container(), { look: DEFAULT_LOOK, jersey: kit, createCanvas: create, loadImage: art });
  const composition = all[0];
  assert.deepEqual(numbersDrawn(composition), ["23"]);
  const fill = composition.ops.find((o) => o[0] === "fillText");
  assert.deepEqual([fill[2], fill[3]], [NUMBER_ANCHOR.x, NUMBER_ANCHOR.y]);
  assert.ok(NUMBER_ANCHOR.x > 0 && NUMBER_ANCHOR.x < CANVAS.width && NUMBER_ANCHOR.y > 0 && NUMBER_ANCHOR.y < CANVAS.height);
  assert.ok(NUMBER_ANCHOR.x - NUMBER_ANCHOR.maxWidth / 2 > 373 && NUMBER_ANCHOR.x + NUMBER_ANCHOR.maxWidth / 2 < 649, "even the widest number sits inside the shirt (x 373..649)");
  assert.ok(composition.ops.findIndex((o) => o[0] === "fillText") > composition.ops.reduce((n, o, i) => (o[0] === "draw" ? i : n), -1), "drawn after every layer");
  assert.deepEqual(handle.inspect().jersey, { number: "23", simplified: kit.simplified });
  assert.equal(handle.canvas.dataset.jersey, JSON.stringify({ number: "23", simplified: kit.simplified }));
});

test("setJersey wears and takes off without touching the look; a later setLook keeps the jersey", async () => {
  const { create, all } = recordingCanvases();
  const handle = await mountAvatar2d(container(), { look: DEFAULT_LOOK, createCanvas: create, loadImage: art });
  assert.deepEqual(numbersDrawn(all[0]), [], "no jersey, no number");
  assert.equal(handle.inspect().jersey, null);
  const a = jerseyKit(getJerseyTemplate("orig_neon_1986_23"));
  assert.equal(await handle.setJersey(a), true);
  assert.deepEqual(numbersDrawn(all[0]), ["23"]);
  assert.equal(await handle.setLook({ ...DEFAULT_LOOK, skin: "deep" }), true);
  assert.equal(numbersDrawn(all[0]).at(-1), "23", "changing the look repaints with the jersey still on");
  assert.deepEqual(handle.look(), sanitizeLook({ ...DEFAULT_LOOK, skin: "deep" }), "the look never carries the jersey");
  const before = numbersDrawn(all[0]).length;
  assert.equal(await handle.setJersey(null), true);
  assert.equal(numbersDrawn(all[0]).length, before, "taken off: nothing new is painted");
  assert.equal(handle.inspect().jersey, null);
  assert.equal("jersey" in handle.canvas.dataset, false);
});

test("a jersey with no number paints none, and the painter ignores a context that cannot draw text", () => {
  assert.equal(paintJerseyNumber({ fillText() {} }, { number: null }), false);
  assert.equal(paintJerseyNumber({}, { number: "7" }), false);
  assert.equal(paintJerseyNumber(null, { number: "7" }), false);
});

// ---- the account: what is worn is what the shop / exchange put in the collection ----------------------------------------

function richAccount() {
  globalThis.localStorage = createMemoryStorage();
  const a = acc.createAccount("jersey 2D");
  a.gold = 5000; a.onboardingDone = true;
  acc.saveAccount(a);
  return a;
}

test("equip a bought jersey: the worn template follows; switching and taking off follow; an unowned key is refused", () => {
  const a = richAccount();
  const [one, two, three] = SHOP_ITEMS.filter((i) => i.effect?.type === "jersey");
  for (const i of [one, two, three]) assert.equal(shop.purchaseShopItem(a, i.id).ok, true);
  assert.equal(equippedJerseyTemplate(a), null, "owning is not wearing");
  assert.equal(equipJersey(a, one.id).ok, true);
  assert.equal(equippedJerseyTemplate(a).id, one.effect.templateId);
  assert.equal(equipJersey(a, three.id).ok, true);
  assert.equal(equippedJerseyTemplate(a).id, three.effect.templateId);
  const kits = [one, two, three].map((i) => jerseyKit(getJerseyTemplate(i.effect.templateId)));
  assert.equal(new Set(kits.map((k) => k.shirt + k.pants + k.number)).size, 3, "three different jerseys, three different kits");
  assert.equal(equipJersey(a, "jersey-not-owned").ok, false);
  assert.equal(equippedJerseyTemplate(a).id, three.effect.templateId, "a refused equip changes nothing");
  unequipJersey(a);
  assert.equal(equippedJerseyTemplate(a), null);
});

test("accounts are isolated: another account's worn jersey is never mine; a guest wears nothing", () => {
  const a = richAccount();
  const item = SHOP_ITEMS.find((i) => i.effect?.type === "jersey");
  shop.purchaseShopItem(a, item.id); equipJersey(a, item.id); acc.saveAccount(a);
  const b = acc.createAccount("other");
  assert.equal(equippedJerseyTemplate(acc.getAccount(b.id)), null);
  assert.equal(equippedJerseyTemplate(null), null);
});

test("a worn key that is no longer in the collection (old or damaged save) just means nothing is worn", () => {
  const a = richAccount();
  a.shop = { ...(a.shop || {}), equippedJersey: "jersey-ghost" };
  assert.equal(equippedJerseyTemplate(a), null);
});

test("the collection says which jerseys are simplified 2D previews, and that 3D has no jersey model", () => {
  const a = richAccount();
  const items = SHOP_ITEMS.filter((i) => i.effect?.type === "jersey");
  for (const i of items) shop.purchaseShopItem(a, i.id);
  const html = jerseyCollectionHtml({ list: listOwnedJerseys(a), equipped: null }, "zh");
  assert.match(html, /简化预览/);
  assert.match(html, /3D 形象还没有球衣模型/);
  assert.match(jerseyCollectionHtml({ list: listOwnedJerseys(a), equipped: null }, "en"), /simplified preview/);
});
