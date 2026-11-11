// The portrait frame is a CSS class built from the frame's effect key, not from the shop item id. Mixing them up (the
// class became "mw-frame-frame-champion-gold") equips a frame the player paid for and draws no ring at all.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const { SHOP_ITEMS } = await import("../js/data/shopCatalog.js");
const shop = await import("../js/data/shop.js");
const acc = await import("../js/data/account.js");
const view = await import("../js/ui/myWorldView.js");

const FRAMES = SHOP_ITEMS.filter((i) => i.effect?.type === "frame");
const CSS = readFileSync(new URL("../css/shop.css", import.meta.url), "utf8");

function richAccount(gold = 5000) {
  globalThis.localStorage = createMemoryStorage();
  const a = acc.createAccount("frame QA");
  a.gold = gold;
  a.onboardingDone = true;
  acc.saveAccount(a);
  acc.setActiveAccountId(a.id);
  return acc.getAccount(a.id);
}

test("every frame in the catalog has a CSS rule for the class it will really wear", () => {
  assert.ok(FRAMES.length >= 4);
  for (const f of FRAMES) {
    assert.match(CSS, new RegExp(`\\.mw-portrait\\.mw-frame-${f.effect.frameId}\\b`), `${f.id}: no .mw-portrait.mw-frame-${f.effect.frameId} rule in shop.css`);
  }
});

test("the equipped frame resolves to its CSS key, never to the item id", () => {
  const a = richAccount();
  assert.equal(shop.equippedFrameClassKey(acc.getAccount(a.id)), null);
  for (const f of FRAMES) {
    assert.equal(shop.purchaseShopItem(acc.getAccount(a.id), f.id).ok, true, f.id);
    assert.equal(shop.equipShopItem(acc.getAccount(a.id), f.id).ok, true, f.id);
    const key = shop.equippedFrameClassKey(acc.getAccount(a.id));
    assert.equal(key, f.effect.frameId);
    assert.ok(!key.startsWith("frame-"), `${key} looks like an item id`);
  }
  shop.unequipShopItem(acc.getAccount(a.id), FRAMES[FRAMES.length - 1].id);
  assert.equal(shop.equippedFrameClassKey(acc.getAccount(a.id)), null);
});

test("the My World portrait wears exactly that class", () => {
  const html = view.myWorldHtml({ identity: { name: "Z", hometown: "", bio: "", guest: false }, games: [], legacy: null, frames: [], frame: "gold" }, "zh");
  assert.match(html, /class="mw-portrait mw-frame-gold"/);
  assert.doesNotMatch(html, /mw-frame-frame-/);
});
