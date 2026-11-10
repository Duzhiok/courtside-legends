/**
 * Gold Lifestyle Shop — catalog integrity + state rules.
 * Gold never buys draws or power: the catalog is audited structurally, purchases
 * are exactly-once, cosmetics unlock permanently, tickets are consumables, and
 * auto-game XP respects the existing daily cap (5 XP/game, max 20/day).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const catalog = await import("../js/data/shopCatalog.js");
const shop = await import("../js/data/shop.js");
const acc = await import("../js/data/account.js");
const level = await import("../js/data/accountLevel.js");
const furniture = await import("../js/ui/shopFurniture.js");
const avatarLook = await import("../js/data/avatarLook.js");

const fresh = () => {
  globalThis.localStorage = createMemoryStorage();
};

function richAccount(gold = 1000) {
  fresh();
  const a = acc.createAccount("shop QA");
  a.gold = gold;
  a.onboardingDone = true;
  acc.saveAccount(a);
  acc.setActiveAccountId(a.id);
  return acc.getAccount(a.id);
}

test("catalog: twenty items, unique ids, real effects, no draws, no power", () => {
  const v = catalog.validateCatalog();
  assert.deepEqual(v, { ok: true, items: 20 });
  const ids = catalog.SHOP_ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of catalog.SHOP_ITEMS) {
    assert.ok(item.price > 0);
    assert.ok(["cosmetic", "convenience"].includes(item.kind));
    assert.ok(item.effect && typeof item.effect.type === "string");
    assert.ok(!/draw|抽卡/i.test(`${item.zh} ${item.en} ${item.descZh} ${item.descEn}`), `${item.id} must not sell draws`);
  }
  // No Competitive Power kind exists in the catalog at all.
  assert.ok(!catalog.SHOP_ITEMS.some((i) => i.kind === "power" || i.kind === "competitive"));
});

test("catalog: prices sit inside the approved ranges", () => {
  const byId = Object.fromEntries(catalog.SHOP_ITEMS.map((i) => [i.id, i]));
  for (const item of catalog.SHOP_ITEMS) {
    if (item.effect?.type === "frame") assert.ok(item.price >= 50 && item.price <= 100, `${item.id} frame price out of range`);
    if (item.effect?.type === "outfit") assert.ok(item.price >= 80 && item.price <= 200, `${item.id} outfit price out of range`);
    if (item.effect?.type === "furniture") assert.ok(item.price >= 100 && item.price <= 500, `${item.id} furniture price out of range`);
  }
  assert.equal(byId["ticket-auto-5"].price, 100);
  assert.equal(byId["ticket-auto-5"].effect.games, 5);
  assert.equal(byId["ticket-auto-20"].price, 350);
  assert.equal(byId["ticket-auto-20"].effect.games, 20);
  assert.equal(byId["ticket-auto-50"].price, 800);
  assert.equal(byId["ticket-auto-50"].effect.games, 50);
  // Category counts: 8 furniture, 5 outfits, 4 frames, 3 ticket packs.
  const byCategory = (c) => catalog.SHOP_ITEMS.filter((i) => i.category === c).length;
  assert.equal(byCategory("home"), 8);
  assert.equal(byCategory("style"), 5);
  assert.equal(byCategory("collection"), 4);
  assert.equal(byCategory("convenience"), 3);
});

test("purchase: deducts gold exactly once; a repeat buy is refused, never double-charged", () => {
  const a = richAccount(500);
  const first = shop.purchaseShopItem(a, "furniture-trophy-cabinet");
  assert.equal(first.ok, true);
  assert.equal(first.gold, 200);
  const again = shop.purchaseShopItem(acc.getAccount(a.id), "furniture-trophy-cabinet");
  assert.equal(again.ok, false);
  assert.equal(again.reason, "already-owned");
  assert.equal(acc.getAccount(a.id).gold, 200);
  assert.deepEqual(shop.ownedFurnitureIds(acc.getAccount(a.id)), ["trophy-cabinet"]);
});

test("purchase: not-enough-gold buys nothing and changes nothing", () => {
  const a = richAccount(50);
  const res = shop.purchaseShopItem(a, "outfit-champion-gold");
  assert.equal(res.ok, false);
  assert.equal(res.reason, "not-enough-gold");
  const after = acc.getAccount(a.id);
  assert.equal(after.gold, 50);
  assert.deepEqual(shop.getShop(after).owned, {});
});

test("purchase: guests browse but cannot buy (no invented balance)", () => {
  const res = shop.purchaseShopItem(null, "frame-champion-gold");
  assert.deepEqual(res, { ok: false, reason: "guest" });
  assert.equal(shop.equipShopItem(null, "frame-champion-gold").reason, "guest");
  assert.equal(shop.ticketBalance(null), 0);
});

test("purchase: unknown item is refused", () => {
  const a = richAccount(500);
  assert.equal(shop.purchaseShopItem(a, "no-such-item").reason, "unknown-item");
});

test("tickets: bundles add credits; consuming deducts exactly what was used", () => {
  const a = richAccount(1000);
  assert.equal(shop.purchaseShopItem(a, "ticket-auto-5").tickets, 5);
  assert.equal(shop.purchaseShopItem(acc.getAccount(a.id), "ticket-auto-20").tickets, 25);
  assert.equal(acc.getAccount(a.id).gold, 1000 - 100 - 350);
  assert.equal(shop.consumeAutoTickets(acc.getAccount(a.id), 7), 7);
  assert.equal(shop.ticketBalance(acc.getAccount(a.id)), 18);
  assert.equal(shop.consumeAutoTickets(acc.getAccount(a.id), 99), 18);
  assert.equal(shop.ticketBalance(acc.getAccount(a.id)), 0);
});

test("equip: frame persists on the account; unequip clears it", () => {
  const a = richAccount(500);
  assert.equal(shop.equipShopItem(a, "frame-champion-gold").reason, "not-owned");
  shop.purchaseShopItem(a, "frame-champion-gold");
  const equipped = shop.equipShopItem(acc.getAccount(a.id), "frame-champion-gold");
  assert.equal(equipped.ok, true);
  assert.equal(shop.equippedFrameId(acc.getAccount(a.id)), "frame-champion-gold");
  const off = shop.unequipShopItem(acc.getAccount(a.id), "frame-champion-gold");
  assert.equal(off.ok, true);
  assert.equal(shop.equippedFrameId(acc.getAccount(a.id)), null);
});

test("equip: clothing writes the real look through saveLook", () => {
  const a = richAccount(500);
  shop.purchaseShopItem(a, "outfit-champion-gold");
  const res = shop.equipShopItem(acc.getAccount(a.id), "outfit-champion-gold");
  assert.equal(res.ok, true);
  assert.equal(res.look.outfit, "champion");
  assert.equal(shop.equippedClothingItemId(acc.getAccount(a.id)), "outfit-champion-gold");
  const off = shop.unequipShopItem(acc.getAccount(a.id), "outfit-champion-gold");
  assert.equal(off.ok, true);
  assert.equal(off.look.outfit, "forest");
  assert.equal(shop.equippedClothingItemId(acc.getAccount(a.id)), null);
});

test("auto XP: +5 per game, capped at 20 per day; past-cap games pay nothing", () => {
  const a = richAccount(0);
  const today = "2026-11-09";
  const first = shop.awardAutoGameXp(a, 12, today);
  assert.deepEqual(first, { xpGames: 12, gained: 60 });
  assert.equal(level.getAxp(acc.getAccount(a.id)).totalXp, 60);
  const second = shop.awardAutoGameXp(acc.getAccount(a.id), 12, today);
  assert.deepEqual(second, { xpGames: 8, gained: 40 });
  assert.equal(level.getAxp(acc.getAccount(a.id)).totalXp, 100);
  const third = shop.awardAutoGameXp(acc.getAccount(a.id), 5, today);
  assert.deepEqual(third, { xpGames: 0, gained: 0 });
  // A new day resets the cap.
  const next = shop.awardAutoGameXp(acc.getAccount(a.id), 3, "2026-11-10");
  assert.deepEqual(next, { xpGames: 3, gained: 15 });
  assert.equal(shop.autoXpRemaining(acc.getAccount(a.id), today), 0);
  assert.equal(shop.autoXpRemaining(acc.getAccount(a.id), "2026-11-10"), 17);
});

test("isolation: two accounts have separate gold, ownership, tickets and auto caps", () => {
  const a = richAccount(1000);
  const b = acc.createAccount("shop QA 2");
  b.gold = 1000;
  b.onboardingDone = true;
  acc.saveAccount(b);
  shop.purchaseShopItem(a, "frame-champion-gold");
  shop.purchaseShopItem(a, "ticket-auto-5");
  shop.awardAutoGameXp(a, 5, "2026-11-09");
  const afterA = acc.getAccount(a.id);
  const afterB = acc.getAccount(b.id);
  assert.equal(afterA.gold, 1000 - 80 - 100);
  assert.equal(afterB.gold, 1000);
  assert.deepEqual(shop.getShop(afterB).owned, {});
  assert.equal(shop.ticketBalance(afterB), 0);
  assert.equal(shop.autoXpRemaining(afterB, "2026-11-09"), 20);
  assert.equal(shop.equippedFrameId(afterB), null);
});

test("purchases: every buy is recorded newest-first, capped at 20, per account", () => {
  const a = richAccount(5000);
  shop.purchaseShopItem(a, "furniture-sofa");
  shop.purchaseShopItem(acc.getAccount(a.id), "frame-silver");
  shop.purchaseShopItem(acc.getAccount(a.id), "ticket-auto-5");
  let recent = shop.recentPurchases(acc.getAccount(a.id), 5);
  assert.deepEqual(recent.map((r) => r.item.id), ["ticket-auto-5", "frame-silver", "furniture-sofa"]);
  assert.ok(recent.every((r) => typeof r.at === "number"));
  // 21 more ticket buys: the list keeps only the newest 20.
  for (let i = 0; i < 21; i++) shop.purchaseShopItem(acc.getAccount(a.id), "ticket-auto-5");
  const kept = shop.getShop(acc.getAccount(a.id)).purchases;
  assert.equal(kept.length, 20);
  assert.equal(kept[0].itemId, "ticket-auto-5");
  assert.ok(!kept.some((p) => p.itemId === "furniture-sofa"), "the oldest purchase rolled off");
  // The other account bought nothing.
  const b = acc.createAccount("shop QA 3");
  assert.deepEqual(shop.recentPurchases(b), []);
});

test("ownedItems: owned cosmetics with their real equipped/placed state", () => {
  const a = richAccount(1000);
  shop.purchaseShopItem(a, "furniture-sofa");
  shop.purchaseShopItem(acc.getAccount(a.id), "outfit-midnight");
  shop.purchaseShopItem(acc.getAccount(a.id), "frame-silver");
  let owned = shop.ownedItems(acc.getAccount(a.id));
  assert.deepEqual(owned.map((o) => o.item.id), ["furniture-sofa", "outfit-midnight", "frame-silver"]);
  assert.deepEqual(owned.map((o) => o.equipped), [true, false, false], "furniture is placed when owned; outfit/frame are not equipped yet");
  shop.equipShopItem(acc.getAccount(a.id), "outfit-midnight");
  shop.equipShopItem(acc.getAccount(a.id), "frame-silver");
  owned = shop.ownedItems(acc.getAccount(a.id));
  assert.deepEqual(owned.map((o) => o.equipped), [true, true, true]);
  assert.deepEqual(shop.ownedFrameIds(acc.getAccount(a.id)), ["silver"]);
  assert.deepEqual(shop.placedFurnitureIds(acc.getAccount(a.id)), ["sofa"]);
});

test("furniture: every furniture item has a real SVG group in the registry", () => {
  const furnitureItems = catalog.SHOP_ITEMS.filter((i) => i.effect?.type === "furniture");
  assert.equal(furnitureItems.length, 8);
  for (const item of furnitureItems) {
    const svg = furniture.furnitureSvgFor(item.effect.furnitureId);
    assert.ok(svg.includes(`data-furniture="${item.effect.furnitureId}"`), `${item.id} has no SVG group`);
    const vb = furniture.furnitureViewBox(item.effect.furnitureId).split(" ").map(Number);
    assert.equal(vb.length, 4);
    assert.ok(vb.every((n) => Number.isFinite(n)));
  }
  assert.equal(furniture.furnitureSvgFor("no-such-furniture"), "");
  const all = furniture.roomFurnitureSvg(furniture.furnitureIds());
  for (const item of furnitureItems) assert.ok(all.includes(`data-furniture="${item.effect.furnitureId}"`));
  // Rug first: everything else sits on it.
  assert.ok(all.indexOf('data-furniture="rug"') < all.indexOf('data-furniture="sofa"'));
  const preview = furniture.roomPreviewSvg(["sofa", "rug"]);
  assert.ok(preview.includes('data-furniture="sofa"'));
  assert.ok(preview.includes('data-furniture="rug"'));
  assert.ok(furniture.roomPreviewSvg([]).includes("房间还空着"));
});

test("outfits: every catalog outfit is a real OUTFITS row, locked until owned", () => {
  const outfitItems = catalog.SHOP_ITEMS.filter((i) => i.effect?.type === "outfit");
  assert.equal(outfitItems.length, 5);
  for (const item of outfitItems) {
    const row = avatarLook.OUTFITS.find((o) => o.id === item.effect.outfitId);
    assert.ok(row, `${item.id} has no OUTFITS row`);
    assert.equal(row.shop, item.id, `${item.id} must flag its shop item so the editor locks it`);
  }
  // Buying + equipping a new outfit really changes the look (and the colours match the row).
  const a = richAccount(1000);
  shop.purchaseShopItem(a, "outfit-crimson");
  const res = shop.equipShopItem(acc.getAccount(a.id), "outfit-crimson");
  assert.equal(res.ok, true);
  assert.equal(res.look.outfit, "crimson");
  const colors = avatarLook.lookColors(res.look);
  assert.equal(colors.Shirt, "#a31621");
  assert.equal(colors.Pants, "#f4f4f0");
  assert.equal(shop.equippedClothingItemId(acc.getAccount(a.id)), "outfit-crimson");
});

test("frames: every frame item has its portrait CSS class", () => {
  const css = readFileSync(new URL("../css/shop.css", import.meta.url), "utf8");
  const frameItems = catalog.SHOP_ITEMS.filter((i) => i.effect?.type === "frame");
  assert.equal(frameItems.length, 4);
  for (const item of frameItems) {
    assert.ok(css.includes(`.mw-portrait.mw-frame-${item.effect.frameId}`), `${item.id} has no portrait CSS`);
  }
  // Equipping a new frame really records it.
  const a = richAccount(1000);
  shop.purchaseShopItem(a, "frame-allstar");
  assert.equal(shop.equipShopItem(acc.getAccount(a.id), "frame-allstar").ok, true);
  assert.equal(shop.equippedFrameId(acc.getAccount(a.id)), "frame-allstar");
});

test("tickets: the x50 bulk pack grants 50 credits", () => {
  const a = richAccount(1000);
  const res = shop.purchaseShopItem(a, "ticket-auto-50");
  assert.equal(res.ok, true);
  assert.equal(res.tickets, 50);
  assert.equal(acc.getAccount(a.id).gold, 200);
});
