// Avatar look (ADR-008a N-1f step 2): whitelist, persistence, isolation, and the panel's honesty rules.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const acc = await import("../js/data/account.js");
const look = await import("../js/data/avatarLook.js");
const { lookPanelHtml } = await import("../js/ui/avatarLookView.js");
const { myWorldHtml } = await import("../js/ui/myWorldView.js");

const fresh = () => {
  globalThis.localStorage = createMemoryStorage();
};

test("sanitizeLook whitelists every field and falls back per field, never throwing on junk", () => {
  assert.deepEqual(look.sanitizeLook(undefined), look.DEFAULT_LOOK);
  assert.deepEqual(look.sanitizeLook("nope"), look.DEFAULT_LOOK);
  assert.deepEqual(look.sanitizeLook({ skin: "deep", hair: "<script>", outfit: 7 }), { skin: "deep", hair: "black", outfit: "forest" });
  assert.deepEqual(look.sanitizeLook({ skin: "__proto__", hair: "constructor" }), look.DEFAULT_LOOK);
});

test("lookColors maps every preset to hex colours for exactly the four recolourable materials", () => {
  for (const skin of look.SKIN_TONES) for (const outfit of look.OUTFITS) {
    const colors = look.lookColors({ skin: skin.id, outfit: outfit.id });
    assert.deepEqual(Object.keys(colors).sort(), ["Hair", "Pants", "Shirt", "Skin"]);
    for (const hex of Object.values(colors)) assert.match(hex, /^#[0-9a-f]{6}$/i);
    assert.equal(colors.Skin, skin.hex);
    assert.equal(colors.Shirt, outfit.shirt);
  }
  assert.ok(look.OUTFITS.length >= 2 && look.SKIN_TONES.length >= 2 && look.HAIR_COLORS.length >= 2);
  assert.equal(new Set(look.OUTFITS.map((o) => o.shirt)).size, look.OUTFITS.length, "outfits must look different");
});

test("a signed-in look persists on the account across a reload and never reaches another account or the guest key", () => {
  fresh();
  const a = acc.createAccount("阿尔法");
  const b = acc.createAccount("贝塔");
  a.gold = 321;
  acc.saveAccount(a);
  const res = look.saveLook(acc.getAccount(a.id), { hair: "red", outfit: "royal" });
  assert.equal(res.saved, true);
  const reloaded = acc.getAccount(a.id);
  assert.deepEqual(look.readLook(reloaded), { skin: "warm", hair: "red", outfit: "royal" });
  assert.equal(reloaded.gold, 321, "nothing else on the account changes");
  assert.deepEqual(look.readLook(acc.getAccount(b.id)), look.DEFAULT_LOOK, "other account untouched");
  assert.equal(localStorage.getItem(look.GUEST_LOOK_KEY), null);
  assert.equal(localStorage.getItem("cls_root_v3"), null, "no career save is created");
});

test("a guest look lives in one local key; a corrupt value or blocked storage degrades safely", () => {
  fresh();
  assert.equal(look.saveLook(null, { skin: "tan" }).saved, true);
  assert.deepEqual(look.readLook(null), { skin: "tan", hair: "black", outfit: "forest" });
  localStorage.setItem(look.GUEST_LOOK_KEY, "{not json");
  assert.deepEqual(look.readLook(null), look.DEFAULT_LOOK);
  const blocked = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.deepEqual(look.readLook(null, blocked), look.DEFAULT_LOOK);
  const res = look.saveLook(null, { skin: "deep" }, { store: blocked });
  assert.equal(res.saved, false);
  assert.equal(res.skin, "deep", "the chosen value is still returned so the page can show it this session");
});

test("a hand-edited account.avatar cannot smuggle values past the whitelist", () => {
  fresh();
  const a = acc.createAccount("x");
  a.avatar = { skin: "red\"onerror=1", hair: "gray", outfit: "<img>" };
  acc.saveAccount(a);
  assert.deepEqual(look.readLook(acc.getAccount(a.id)), { skin: "warm", hair: "gray", outfit: "forest" });
});

test("the panel has one checked radio per group, named swatches in both languages, and no fake controls", () => {
  const html = lookPanelHtml({ skin: "deep", hair: "gray", outfit: "white" }, "Zoro", "en");
  for (const group of ["skin", "hair", "outfit"]) {
    const checked = html.match(new RegExp(`name="mw-look-${group}" value="[a-z]+" checked`, "g")) || [];
    assert.equal(checked.length, 1, group);
  }
  assert.match(html, /value="deep" checked/);
  assert.match(html, /Classic white/);
  assert.match(lookPanelHtml(undefined, "阿尔法", "zh"), /经典白/);
  assert.doesNotMatch(lookPanelHtml(undefined, "x", "en"), /[\u4e00-\u9fff]/, "English panel has no Chinese");
  assert.doesNotMatch(html, /hairstyle|发型/i, "no hairstyle control: the model has one hair mesh");
  assert.match(html, /hidden/, "closed until the player opens it");
});

test("the player's name is escaped in the static fallback and the panel sits right after the identity card", () => {
  const html = myWorldHtml({ identity: { name: "<b>x</b>", hometown: "", bio: "", guest: true }, games: { career: null, session: null, canClaim: false }, legacy: { cups: 0 }, frames: [], draft: {}, look: undefined }, "zh");
  assert.ok(html.indexOf('id="mw-look"') > html.indexOf("mw-identity"));
  assert.ok(html.indexOf('id="mw-look"') < html.indexOf("mw-grid"));
  assert.match(html, /data-mw-action="toggle-look"/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});
