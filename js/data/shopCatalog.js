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
 * furniture 100–500, Auto-Play Tickets 5 for 100 / 20 for 350 / 50 for 800
 * (bulk: 50-pack at ¤16/game vs ¤20/¤17.50 for the smaller packs).
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
  // ---- Furniture: every piece renders into the My Home room (see js/ui/shopFurniture.js
  // for the SVG registry; the room itself is wired by workstream D from that registry). ----
  {
    id: "furniture-sofa",
    category: "home",
    kind: "cosmetic",
    price: 250,
    zh: "球场沙发",
    en: "Courtside Sofa",
    descZh: "一张深绿皮沙发摆进房间：看球、复盘、发呆都舒服。买下即摆进 My Home 房间。",
    descEn: "A deep-green leather sofa for your room — for watching games, reviewing plays, or just sitting. Placed in My Home as soon as you buy it.",
    effect: { type: "furniture", furnitureId: "sofa" },
  },
  {
    id: "furniture-star-poster",
    category: "home",
    kind: "cosmetic",
    price: 150,
    zh: "球星海报",
    en: "Star Poster",
    descZh: "一张金底球星海报挂上墙：球衣号码与星星，房间里最亮的一角。",
    descEn: "A gold star poster for the wall — jersey number and stars, the brightest corner of the room.",
    effect: { type: "furniture", furnitureId: "star-poster" },
  },
  {
    id: "furniture-hoop",
    category: "home",
    kind: "cosmetic",
    price: 400,
    zh: "迷你篮球架",
    en: "Mini Basketball Hoop",
    descZh: "一副挂在墙上的迷你篮架：白篮板、橙篮圈、篮网俱全，练投篮不用出门。",
    descEn: "A mini hoop on the wall — white backboard, orange rim, full net. Practice shots without leaving the room.",
    effect: { type: "furniture", furnitureId: "hoop" },
  },
  {
    id: "furniture-floor-lamp",
    category: "home",
    kind: "cosmetic",
    price: 180,
    zh: "落地灯",
    en: "Floor Lamp",
    descZh: "一盏暖光落地灯立在奖杯柜旁：晚上看球，房间也亮堂。",
    descEn: "A warm floor lamp beside the cabinet — the room stays bright for late-night games.",
    effect: { type: "furniture", furnitureId: "floor-lamp" },
  },
  {
    id: "furniture-display-stand",
    category: "home",
    kind: "cosmetic",
    price: 350,
    zh: "球员卡展示台",
    en: "Card Display Stand",
    descZh: "一个带玻璃罩的展示台：把你最得意的一张球员卡立在上面，旁边还放着一颗篮球。",
    descEn: "A glass-covered display stand — your proudest card on show, with a basketball beside it.",
    effect: { type: "furniture", furnitureId: "display-stand" },
  },
  {
    id: "furniture-rug",
    category: "home",
    kind: "cosmetic",
    price: 200,
    zh: "篮球地毯",
    en: "Basketball Rug",
    descZh: "一块深绿金边地毯铺在沙发前：踩上去像站在球场中央。",
    descEn: "A deep-green rug with gold trim in front of the sofa — feels like standing at center court.",
    effect: { type: "furniture", furnitureId: "rug" },
  },
  {
    id: "furniture-bookshelf",
    category: "home",
    kind: "cosmetic",
    price: 220,
    zh: "篮球书架",
    en: "Basketball Bookshelf",
    descZh: "一个木书架靠墙而立：战术书、传记和一颗小篮球，球迷的书房标配。",
    descEn: "A wooden bookshelf against the wall — playbooks, biographies and a small basketball. Every fan's study.",
    effect: { type: "furniture", furnitureId: "bookshelf" },
  },
  // ---- Style: new outfits are OUTFITS rows in js/data/avatarLook.js (data only,
  // flagged `shop` so the avatar editor locks them until owned — same as v1). ----
  {
    id: "outfit-midnight",
    category: "style",
    kind: "cosmetic",
    price: 120,
    zh: "午夜蓝球衣",
    en: "Midnight Navy Jersey",
    descZh: "午夜蓝上衣配金色长裤：低调，但金边一亮就知道是你的主场。穿上后 3D 形象和头像都会换上它；不加任何比赛属性。",
    descEn: "Midnight navy top with gold pants — quiet until the gold trim catches the light. Your 3D figure and portrait change into it; no match attributes.",
    effect: { type: "outfit", outfitId: "midnight" },
  },
  {
    id: "outfit-crimson",
    category: "style",
    kind: "cosmetic",
    price: 120,
    zh: "绯红球衣",
    en: "Crimson Jersey",
    descZh: "绯红上衣配经典白裤：一眼就能在球场上找到你。穿上后 3D 形象和头像都会换上它；不加任何比赛属性。",
    descEn: "Crimson top with classic white pants — easy to spot on the court. Your 3D figure and portrait change into it; no match attributes.",
    effect: { type: "outfit", outfitId: "crimson" },
  },
  {
    id: "outfit-street",
    category: "style",
    kind: "cosmetic",
    price: 150,
    zh: "街头黑橙球衣",
    en: "Street Black-Orange Jersey",
    descZh: "黑上衣配活力橙长裤：街头球场的配色，穿去打野球也合身。穿上后 3D 形象和头像都会换上它；不加任何比赛属性。",
    descEn: "Black top with vivid orange pants — streetball colours, at home on the blacktop too. Your 3D figure and portrait change into it; no match attributes.",
    effect: { type: "outfit", outfitId: "street" },
  },
  {
    id: "outfit-vintage",
    category: "style",
    kind: "cosmetic",
    price: 120,
    zh: "复古青绿球衣",
    en: "Vintage Teal Jersey",
    descZh: "复古青绿上衣配米白长裤：老派球衣的味道。穿上后 3D 形象和头像都会换上它；不加任何比赛属性。",
    descEn: "Vintage teal top with cream pants — old-school jersey flavour. Your 3D figure and portrait change into it; no match attributes.",
    effect: { type: "outfit", outfitId: "vintage" },
  },
  // ---- Collection: portrait frames. The class is generic — `mw-frame-<frameId>` on the
  // My World portrait (see myWorldView.js:81) — so new frames only need their CSS in css/shop.css. ----
  {
    id: "frame-silver",
    category: "collection",
    kind: "cosmetic",
    price: 60,
    zh: "银边头像框",
    en: "Silver Frame",
    descZh: "给 My World 个人资料头像加一圈银边和微光。只改外观，不加任何属性。",
    descEn: "A silver rim with a soft glow for your My World profile portrait. Looks only — no attributes.",
    effect: { type: "frame", frameId: "silver" },
  },
  {
    id: "frame-bronze",
    category: "collection",
    kind: "cosmetic",
    price: 50,
    zh: "铜边头像框",
    en: "Bronze Frame",
    descZh: "给 My World 个人资料头像加一圈铜边。只改外观，不加任何属性。",
    descEn: "A bronze rim for your My World profile portrait. Looks only — no attributes.",
    effect: { type: "frame", frameId: "bronze" },
  },
  {
    id: "frame-allstar",
    category: "collection",
    kind: "cosmetic",
    price: 100,
    zh: "全明星头像框",
    en: "All-Star Frame",
    descZh: "给 My World 个人资料头像加一圈金蓝双边和星光：全明星的待遇。只改外观，不加任何属性。",
    descEn: "A gold-and-blue double rim with starlight for your My World profile portrait — the All-Star treatment. Looks only — no attributes.",
    effect: { type: "frame", frameId: "allstar" },
  },
  // ---- Convenience: bulk Auto-Play pack. Same autoTickets effect as the 5/20 packs. ----
  {
    id: "ticket-auto-50",
    category: "convenience",
    kind: "convenience",
    price: 800,
    zh: "托管卡 ×50",
    en: "Auto-Play Ticket ×50",
    descZh: "托管 50 场常规赛：用现有比赛引擎模拟，胜负正常记录。每场托管 +5 账号经验，每天最多 20 场计经验；不加胜率、不加 OVR。整季托管，一次买够。",
    descEn: "Simulate 50 regular-season games with the normal engine (results count). +5 account XP per auto game, max 20 XP-paying auto games per day; no win-rate bonus, no OVR boost. A whole season in one pack.",
    effect: { type: "autoTickets", games: 50 },
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
