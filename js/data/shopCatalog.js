/**
 * Gold Lifestyle Shop catalog (user decision 2026-11-09): gold is the Lifestyle &
 * Convenience Currency. It NEVER buys random player cards and NEVER raises competitive
 * attributes — the daily player draw is a separate system (dailyTasks / accountGacha),
 * and nothing in this catalog is a draw, a ticket for a draw, or a stat boost.
 *
 * Every item is data-driven: a stable id, a category, a price, a kind
 * (cosmetic = looks only, convenience = saves time without raising the single-game
 * win rate), and an effect the shop state knows how to apply for real. No
 * Competitive Power items exist here by design — if a future item would change
 * win rates or OVR, it does not belong in this catalog.
 *
 * Prices are initial values for dev playtesting, not final balance numbers.
 * Ranges from the approved decision: frames 50–100, clothing 80–200,
 * furniture 100–500, Auto-Play Tickets 5 for 100 / 20 for 350.
 */
export const SHOP_CATEGORIES = Object.freeze([
  { id: "home", zh: "我的家", en: "My Home" },
  { id: "style", zh: "我的形象", en: "My Style" },
  { id: "collection", zh: "我的收藏", en: "My Collection" },
  { id: "convenience", zh: "便利", en: "Convenience" },
]);

export const SHOP_KINDS = Object.freeze({
  COSMETIC: "cosmetic",
  CONVENIENCE: "convenience",
});

/**
 * effect types (each one has a real application path in js/data/shop.js):
 * - furniture { furnitureId } — rendered into the My Home room (myWorldView homeSceneHtml).
 * - outfit { outfitId } — an avatarLook OUTFITS id; equipping writes the look via saveLook.
 * - frame { frameId } — a CSS frame class on the My World profile portrait.
 * - autoTickets { games } — consumable credits; using one simulates one regular-season
 *   game through the existing engine (simUserNextGame + settleUserGame), no bonuses.
 */
export const SHOP_ITEMS = Object.freeze([
  {
    id: "furniture-trophy-cabinet",
    category: "home",
    kind: "cosmetic",
    price: 300,
    zh: "冠军奖杯柜",
    en: "Champion Trophy Cabinet",
    descZh: "一座摆进 My Home 房间的奖杯柜：深色木柜、金边玻璃门，专门陈列你的冠军记忆。",
    descEn: "A trophy cabinet for your My Home room — dark wood, gold-trimmed glass door, built to show off championship memories.",
    effect: { type: "furniture", furnitureId: "trophy-cabinet" },
  },
  {
    id: "outfit-champion-gold",
    category: "style",
    kind: "cosmetic",
    price: 150,
    zh: "冠军金边球衣",
    en: "Champion Gold-Trim Jersey",
    descZh: "金色上衣配深色长裤的冠军球衣。穿上后，你的 3D 形象和头像都会换上它；不加任何比赛属性。",
    descEn: "A gold champion jersey with dark pants. Wear it and your 3D figure and portrait change into it; no match attributes.",
    effect: { type: "outfit", outfitId: "champion" },
  },
  {
    id: "frame-champion-gold",
    category: "collection",
    kind: "cosmetic",
    price: 80,
    zh: "冠军金边头像框",
    en: "Champion Gold Frame",
    descZh: "给 My World 个人资料头像加一圈金边和微光。只改外观，不加任何属性。",
    descEn: "A gold rim with a soft glow for your My World profile portrait. Looks only — no attributes.",
    effect: { type: "frame", frameId: "gold" },
  },
  {
    id: "ticket-auto-5",
    category: "convenience",
    kind: "convenience",
    price: 100,
    zh: "托管卡 ×5",
    en: "Auto-Play Ticket ×5",
    descZh: "托管 5 场常规赛：用现有比赛引擎模拟，胜负正常记录。每场托管 +5 账号经验，每天最多 20 场计经验；不加胜率、不加 OVR。",
    descEn: "Simulate 5 regular-season games with the normal engine (results count). +5 account XP per auto game, max 20 XP-paying auto games per day; no win-rate bonus, no OVR boost.",
    effect: { type: "autoTickets", games: 5 },
  },
  {
    id: "ticket-auto-20",
    category: "convenience",
    kind: "convenience",
    price: 350,
    zh: "托管卡 ×20",
    en: "Auto-Play Ticket ×20",
    descZh: "托管 20 场常规赛：用现有比赛引擎模拟，胜负正常记录。每场托管 +5 账号经验，每天最多 20 场计经验；不加胜率、不加 OVR。",
    descEn: "Simulate 20 regular-season games with the normal engine (results count). +5 account XP per auto game, max 20 XP-paying auto games per day; no win-rate bonus, no OVR boost.",
    effect: { type: "autoTickets", games: 20 },
  },
]);

export function itemById(id) {
  return SHOP_ITEMS.find((item) => item.id === id) || null;
}

export function itemsByCategory(categoryId) {
  return SHOP_ITEMS.filter((item) => item.category === categoryId);
}

export function categoryLabel(categoryId, lang = "zh") {
  const c = SHOP_CATEGORIES.find((entry) => entry.id === categoryId);
  if (!c) return categoryId;
  return lang === "en" ? c.en : c.zh;
}

export function itemName(item, lang = "zh") {
  return lang === "en" ? item.en : item.zh;
}

export function itemDesc(item, lang = "zh") {
  return lang === "en" ? item.descEn : item.descZh;
}

export function kindLabel(kind, lang = "zh") {
  if (kind === SHOP_KINDS.CONVENIENCE) return lang === "en" ? "Convenience" : "便利";
  return lang === "en" ? "Cosmetic" : "外观";
}

/** The shop sells no draws and no Competitive Power items — assert it structurally. */
export function validateCatalog() {
  const ids = new Set();
  for (const item of SHOP_ITEMS) {
    if (ids.has(item.id)) return { ok: false, reason: `duplicate id ${item.id}` };
    ids.add(item.id);
    if (!SHOP_CATEGORIES.some((c) => c.id === item.category)) return { ok: false, reason: `${item.id}: unknown category ${item.category}` };
    if (!Object.values(SHOP_KINDS).includes(item.kind)) return { ok: false, reason: `${item.id}: unknown kind ${item.kind}` };
    if (!(item.price > 0)) return { ok: false, reason: `${item.id}: bad price ${item.price}` };
    if (item.kind === SHOP_KINDS.COSMETIC && !["furniture", "outfit", "frame"].includes(item.effect?.type)) return { ok: false, reason: `${item.id}: cosmetic without a real effect` };
    if (item.kind === SHOP_KINDS.CONVENIENCE && item.effect?.type !== "autoTickets") return { ok: false, reason: `${item.id}: convenience without a ticket effect` };
    if (String(item.zh || "").includes("抽") || String(item.en || "").toLowerCase().includes("draw")) return { ok: false, reason: `${item.id}: must not sell draws` };
  }
  return { ok: true, items: SHOP_ITEMS.length };
}
