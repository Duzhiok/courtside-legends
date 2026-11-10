/**
 * Gold Lifestyle Shop — dialog rendering + My World integration.
 * The builders are pure HTML strings (no DOM needed): the dialog shows real
 * prices/states, the room shows owned furniture, the portrait shows the frame,
 * and the avatar editor locks the shop outfit until it is owned.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const view = await import("../js/ui/shopView.js");
const shop = await import("../js/data/shop.js");
const catalog = await import("../js/data/shopCatalog.js");
const acc = await import("../js/data/account.js");
const mw = await import("../js/ui/myWorldView.js");
const lookView = await import("../js/ui/avatarLookView.js");

function richAccount(gold = 1000) {
  globalThis.localStorage = createMemoryStorage();
  const a = acc.createAccount("shop view QA");
  a.gold = gold;
  a.onboardingDone = true;
  acc.saveAccount(a);
  acc.setActiveAccountId(a.id);
  return acc.getAccount(a.id);
}

function stateFor(account, overrides = {}) {
  return {
    account,
    shop: account ? shop.getShop(account) : { owned: {}, tickets: 0 },
    category: "home",
    selectedId: "furniture-trophy-cabinet",
    armedBuyId: null,
    lastUse: null,
    status: null,
    ticketCtx: { season: false, remaining: 0, credits: 0, xpRemaining: 20 },
    ...overrides,
  };
}

const IDENTITY = { name: "Shop QA", hometown: "", bio: "", guest: false };

test("dialog: four tabs, five items, gold balance and the no-power note", () => {
  const a = richAccount(500);
  const html = view.shopDialogHtml(stateFor(a), "zh");
  for (const tab of ["我的家", "我的形象", "我的收藏", "便利"]) assert.ok(html.includes(tab), `missing tab ${tab}`);
  assert.ok(html.includes("我的金币：¤500"));
  assert.ok(html.includes("金币不买球员卡、不加比赛属性"));
  const en = view.shopDialogHtml(stateFor(a), "en");
  assert.ok(en.includes("My gold: ¤500"));
  assert.ok(en.includes("Gold never buys player cards"));
});

test("cards: owned furniture shows 已拥有; tickets always show their price", () => {
  const a = richAccount(1000);
  shop.purchaseShopItem(a, "furniture-trophy-cabinet");
  const st = stateFor(acc.getAccount(a.id));
  const owned = view.shopItemCardHtml(catalog.itemById("furniture-trophy-cabinet"), st, "zh");
  assert.ok(owned.includes("已拥有"));
  assert.ok(owned.includes("is-owned"));
  const ticket = view.shopItemCardHtml(catalog.itemById("ticket-auto-5"), st, "zh");
  assert.ok(ticket.includes("¤100"));
  assert.ok(!ticket.includes("已拥有"));
});

test("detail: guests get a sign-in button, never a buy button", () => {
  const html = view.shopDetailHtml(catalog.itemById("frame-champion-gold"), stateFor(null), "zh");
  assert.ok(html.includes("登录账号后购买"));
  assert.ok(!html.includes("购买 ¤80"));
});

test("detail: buy is two-step — armed state asks for confirmation with the exact price", () => {
  const a = richAccount(500);
  const st = stateFor(a);
  const before = view.shopDetailHtml(catalog.itemById("frame-champion-gold"), st, "zh");
  assert.ok(before.includes("购买 ¤80"));
  const armed = view.shopDetailHtml(catalog.itemById("frame-champion-gold"), { ...st, armedBuyId: "frame-champion-gold" }, "zh");
  assert.ok(armed.includes("确认花费 ¤80？"));
});

test("detail: owned outfit offers 穿上, wearing offers 换下; owned frame offers 戴上/取下", () => {
  const a = richAccount(1000);
  shop.purchaseShopItem(a, "outfit-champion-gold");
  shop.purchaseShopItem(a, "frame-champion-gold");
  let st = stateFor(acc.getAccount(a.id));
  assert.ok(view.shopDetailHtml(catalog.itemById("outfit-champion-gold"), st, "zh").includes("穿上"));
  assert.ok(view.shopDetailHtml(catalog.itemById("frame-champion-gold"), st, "zh").includes("戴上头像框"));
  shop.equipShopItem(acc.getAccount(a.id), "outfit-champion-gold");
  shop.equipShopItem(acc.getAccount(a.id), "frame-champion-gold");
  st = stateFor(acc.getAccount(a.id));
  assert.ok(view.shopDetailHtml(catalog.itemById("outfit-champion-gold"), st, "zh").includes("换下"));
  assert.ok(view.shopDetailHtml(catalog.itemById("frame-champion-gold"), st, "zh").includes("取下头像框"));
});

test("detail: owned furniture says it is placed in My Home; tickets show the use row", () => {
  const a = richAccount(1000);
  shop.purchaseShopItem(a, "furniture-trophy-cabinet");
  const st = stateFor(acc.getAccount(a.id));
  const furn = view.shopDetailHtml(catalog.itemById("furniture-trophy-cabinet"), st, "zh");
  assert.ok(furn.includes("已摆进 My Home"));
  const ticket = view.shopDetailHtml(catalog.itemById("ticket-auto-5"), { ...st, category: "convenience", ticketCtx: { season: true, remaining: 12, credits: 5, xpRemaining: 20 } }, "zh");
  assert.ok(ticket.includes("托管卡：5 张"));
  assert.ok(ticket.includes("托管 5 场"));
  assert.ok(!ticket.includes("disabled") || ticket.includes("托管 20 场"));
});

test("detail: a successful ticket use renders the real W-L and XP", () => {
  const a = richAccount(1000);
  const st = stateFor(a, {
    category: "convenience",
    selectedId: "ticket-auto-5",
    lastUse: { ok: true, simmed: 5, wins: 3, losses: 2, xpGames: 5, gained: 25, tickets: 0 },
    ticketCtx: { season: true, remaining: 7, credits: 0, xpRemaining: 15 },
  });
  const html = view.shopDetailHtml(catalog.itemById("ticket-auto-5"), st, "zh");
  assert.ok(html.includes("已托管 5 场：3 胜 2 负"));
  assert.ok(html.includes("账号经验 +25"));
  assert.ok(html.includes("剩余托管卡 0 张"));
});

test("previews: furniture reuses the room cabinet, outfit uses the real champion colours", () => {
  const furn = view.shopPreviewHtml(catalog.itemById("furniture-trophy-cabinet"), "zh");
  assert.ok(furn.includes('data-furniture="trophy-cabinet"'));
  const outfit = view.shopPreviewHtml(catalog.itemById("outfit-champion-gold"), "zh");
  assert.ok(outfit.includes("#d6b25a"));
  assert.ok(outfit.includes("#1f2937"));
  const frame = view.shopPreviewHtml(catalog.itemById("frame-champion-gold"), "zh");
  assert.ok(frame.includes("mw-frame-gold"));
  const ticket = view.shopPreviewHtml(catalog.itemById("ticket-auto-20"), "zh");
  assert.ok(ticket.includes("×20"));
});

test("My World: the cabinet renders in the room only when owned, plus a shop button", () => {
  const without = mw.homeSceneHtml({ identity: IDENTITY, frames: [], furniture: [] }, "zh");
  assert.ok(!without.includes('data-furniture="trophy-cabinet"'));
  assert.ok(without.includes('data-mw-action="open-shop"'));
  const withCabinet = mw.homeSceneHtml({ identity: IDENTITY, frames: [], furniture: ["trophy-cabinet"] }, "zh");
  assert.ok(withCabinet.includes('data-furniture="trophy-cabinet"'));
  assert.ok(withCabinet.includes("已摆放冠军奖杯柜"));
});

test("My World: the equipped frame adds the gold class to the portrait", () => {
  const plain = mw.identityCardHtml(IDENTITY, "zh", null);
  assert.ok(!plain.includes("mw-frame-gold"));
  const framed = mw.identityCardHtml(IDENTITY, "zh", null, "gold");
  assert.ok(framed.includes('class="mw-portrait mw-frame-gold"'));
});

test("avatar editor: the shop outfit is locked until owned, free when owned, untouched when unknown", () => {
  const locked = lookView.lookPanelHtml({ outfit: "forest" }, "Shop QA", "zh", null, []);
  assert.ok(locked.includes('value="champion"'));
  assert.ok(locked.includes("is-locked"));
  assert.ok(locked.includes("商城"));
  const owned = lookView.lookPanelHtml({ outfit: "forest" }, "Shop QA", "zh", null, ["champion"]);
  assert.ok(owned.includes('value="champion"'));
  assert.ok(!owned.includes("is-locked"));
  const legacy = lookView.lookPanelHtml({ outfit: "forest" }, "Shop QA", "zh");
  assert.ok(legacy.includes('value="champion"'));
  assert.ok(!legacy.includes("is-locked"));
});
