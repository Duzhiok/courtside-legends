/**
 * Gold Lifestyle Shop state (user decision 2026-11-09): gold is the Lifestyle &
 * Convenience Currency. Purchases are account-scoped and live on `account.shop`:
 *
 *   account.shop = {
 *     owned: { [itemId]: true },        // cosmetics, permanent unlocks
 *     equippedFrame: string | null,     // frame item id currently on the profile portrait
 *     tickets: number,                   // Auto-Play credits (one credit = one simulated game)
 *     autoUsed: { [dateKey]: number },  // auto games already paid XP today (cap: XP_TABLE.autoDailyCap)
 *     purchases: [{ itemId, at }],      // newest first, capped — the "recently bought" list
 *   }
 *
 * Rules enforced here (all pure apart from the saves):
 * - Cosmetics unlock permanently; buying one you already own is refused, never double-charged.
 * - Tickets are consumables: buying adds credits, using deducts exactly the games simulated.
 * - Auto games pay XP_TABLE.autoGame (+5) per game, up to XP_TABLE.autoDailyCap (20) per day —
 *   the existing (previously unwired) automation limit. Games past the cap still simulate
 *   (season progress is real) but pay no XP. Auto XP is always below the +40 a played
 *   My Team game pays, so托管 never earns more than playing.
 * - Guests have no gold income anywhere in the game, so they can browse but not buy.
 *   Purchase/equip/use return { ok: false, reason: "guest" } instead of inventing a balance.
 * - Clothing equips through the public saveLook() API (the outfit id is a real OUTFITS
 *   entry); the equipped state is derived from the look, so the editor and the shop
 *   can never disagree about what the avatar is wearing.
 */
import { saveAccount, todayKey } from "./account.js";
import { awardAccountXp, XP_TABLE } from "./accountLevel.js";
import { readLook, saveLook } from "./avatarLook.js";
import { SHOP_ITEMS, itemById } from "./shopCatalog.js";

export const SHOP_AUTO_XP_PER_GAME = XP_TABLE.autoGame; // 5
export const SHOP_AUTO_DAILY_CAP = XP_TABLE.autoDailyCap; // 20
/** How many purchase records the "recently bought" list keeps (newest first). */
export const SHOP_PURCHASES_KEEP = 20;

/** Normalize (or create) the shop record. Pure shape, no save. */
export function getShop(account) {
  const raw = account?.shop && typeof account.shop === "object" ? account.shop : {};
  return {
    owned: { ...(raw.owned || {}) },
    equippedFrame: typeof raw.equippedFrame === "string" ? raw.equippedFrame : null,
    tickets: Math.max(0, Math.floor(raw.tickets) || 0),
    autoUsed: { ...(raw.autoUsed || {}) },
    purchases: Array.isArray(raw.purchases)
      ? raw.purchases.filter((p) => p && typeof p.itemId === "string").slice(0, SHOP_PURCHASES_KEEP)
      : [],
  };
}

function writeShop(account, shop) {
  account.shop = shop;
}

/** Furniture item ids the account owns (rendered into the My Home room). */
export function ownedFurnitureIds(account) {
  if (!account) return [];
  const shop = getShop(account);
  return SHOP_ITEMS.filter((item) => item.effect?.type === "furniture" && shop.owned[item.id]).map((item) => item.effect.furnitureId);
}

/** Outfit ids the account owns via the shop (the avatar editor locks the rest). */
export function ownedOutfitIds(account) {
  if (!account) return [];
  const shop = getShop(account);
  return SHOP_ITEMS.filter((item) => item.effect?.type === "outfit" && shop.owned[item.id]).map((item) => item.effect.outfitId);
}

/** Frame item id currently on the profile portrait, or null. */
export function equippedFrameId(account) {
  return account ? getShop(account).equippedFrame : null;
}

/** Auto-Play credits held. */
export function ticketBalance(account) {
  return account ? getShop(account).tickets : 0;
}

/** Auto games still paying XP today. */
export function autoXpRemaining(account, today = todayKey()) {
  if (!account) return 0;
  return Math.max(0, SHOP_AUTO_DAILY_CAP - (getShop(account).autoUsed[today] || 0));
}

/** The shop clothing item the avatar is currently wearing, or null (derived from the look). */
export function equippedClothingItemId(account) {
  if (!account) return null;
  const look = readLook(account);
  const item = SHOP_ITEMS.find((entry) => entry.effect?.type === "outfit" && entry.effect.outfitId === look.outfit);
  if (!item) return null;
  return getShop(account).owned[item.id] ? item.id : null;
}

/**
 * Owned cosmetics, one entry per item, in catalog order (category, then catalog
 * position). `equipped` is true when the item is currently worn / on the portrait /
 * placed in the room — furniture is placed the moment it is owned. This is the
 * inventory API the My World "recently bought / owned" area consumes (workstream D):
 * it never reads account.shop directly, so the state shape can evolve here.
 */
export function ownedItems(account) {
  if (!account) return [];
  const shop = getShop(account);
  const wearing = equippedClothingItemId(account);
  const framed = equippedFrameId(account);
  return SHOP_ITEMS.filter((item) => item.effect?.type !== "autoTickets" && shop.owned[item.id]).map((item) => ({
    item,
    equipped:
      item.effect?.type === "outfit" ? wearing === item.id
      : item.effect?.type === "frame" ? framed === item.id
      : item.effect?.type === "furniture",
  }));
}

/** Newest purchases first (default 5), each with its catalog item — the "recently bought" list. */
export function recentPurchases(account, n = 5) {
  if (!account) return [];
  return getShop(account)
    .purchases.slice(0, Math.max(0, n))
    .map((p) => ({ item: itemById(p.itemId), at: p.at }))
    .filter((entry) => entry.item);
}

/** Furniture ids placed in the My Home room — same set as ownedFurnitureIds, named for the room API. */
export function placedFurnitureIds(account) {
  return ownedFurnitureIds(account);
}

/** Frame item ids the account owns (any of them can go on the portrait). */
export function ownedFrameIds(account) {
  if (!account) return [];
  const shop = getShop(account);
  return SHOP_ITEMS.filter((item) => item.effect?.type === "frame" && shop.owned[item.id]).map((item) => item.effect.frameId);
}

/**
 * Buy one catalog item. Gold is deducted and ownership granted in a single save,
 * so a refresh mid-click cannot double-charge or grant without paying.
 * Tickets are consumables (no already-owned check); cosmetics refuse repeats.
 */
export function purchaseShopItem(account, itemId) {
  if (!account) return { ok: false, reason: "guest" };
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: "unknown-item" };
  const shop = getShop(account);
  const isTicket = item.effect?.type === "autoTickets";
  if (!isTicket && shop.owned[item.id]) return { ok: false, reason: "already-owned", item };
  const gold = account.gold || 0;
  if (gold < item.price) return { ok: false, reason: "not-enough-gold", item, price: item.price, gold };
  account.gold = gold - item.price;
  if (isTicket) shop.tickets += item.effect.games;
  else shop.owned[item.id] = true;
  shop.purchases = [{ itemId: item.id, at: Date.now() }, ...(shop.purchases || [])].slice(0, SHOP_PURCHASES_KEEP);
  writeShop(account, shop);
  saveAccount(account);
  return { ok: true, item, gold: account.gold, tickets: shop.tickets };
}

/** Equip an owned cosmetic: clothing writes the look, a frame is recorded on the shop record. */
export function equipShopItem(account, itemId) {
  if (!account) return { ok: false, reason: "guest" };
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: "unknown-item" };
  const shop = getShop(account);
  if (!shop.owned[item.id]) return { ok: false, reason: "not-owned", item };
  if (item.effect?.type === "outfit") {
    const look = saveLook(account, { outfit: item.effect.outfitId });
    return { ok: true, item, look };
  }
  if (item.effect?.type === "frame") {
    shop.equippedFrame = item.id;
    writeShop(account, shop);
    saveAccount(account);
    return { ok: true, item };
  }
  return { ok: false, reason: "no-equip", item };
}

/** Take a cosmetic off: a frame clears, clothing falls back to the default outfit. */
export function unequipShopItem(account, itemId) {
  if (!account) return { ok: false, reason: "guest" };
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: "unknown-item" };
  if (item.effect?.type === "frame") {
    const shop = getShop(account);
    if (shop.equippedFrame !== item.id) return { ok: false, reason: "not-equipped", item };
    shop.equippedFrame = null;
    writeShop(account, shop);
    saveAccount(account);
    return { ok: true, item };
  }
  if (item.effect?.type === "outfit") {
    const look = saveLook(account, { outfit: "forest" });
    return { ok: true, item, look };
  }
  return { ok: false, reason: "no-equip", item };
}

/** Deduct exactly n Auto-Play credits (never more than held). Returns credits actually used. */
export function consumeAutoTickets(account, n) {
  if (!account || !(n > 0)) return 0;
  const shop = getShop(account);
  const used = Math.min(n, shop.tickets);
  if (used <= 0) return 0;
  shop.tickets -= used;
  writeShop(account, shop);
  saveAccount(account);
  return used;
}

/**
 * Pay the auto-game XP for `gamesSimmed` simulated games, capped at
 * SHOP_AUTO_DAILY_CAP XP-paying auto games per day. Returns how many games
 * actually paid XP and how much XP was granted. Games past the cap pay nothing.
 */
export function awardAutoGameXp(account, gamesSimmed, today = todayKey()) {
  if (!account || !(gamesSimmed > 0)) return { xpGames: 0, gained: 0 };
  const shop = getShop(account);
  const xpGames = Math.min(gamesSimmed, Math.max(0, SHOP_AUTO_DAILY_CAP - (shop.autoUsed[today] || 0)));
  if (xpGames <= 0) return { xpGames: 0, gained: 0 };
  shop.autoUsed[today] = (shop.autoUsed[today] || 0) + xpGames;
  writeShop(account, shop);
  const res = awardAccountXp(account, SHOP_AUTO_XP_PER_GAME * xpGames, { source: "autoGame" });
  return { xpGames, gained: res.gained || 0 };
}
