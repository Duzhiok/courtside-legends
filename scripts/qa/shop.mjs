// Gold Lifestyle Shop in a real browser: the top-bar gold chip opens the shop,
// all twenty items buy and apply for real (furniture in the My Home room,
// clothing on the avatar, frame on the portrait, tickets simulate real games),
// the Owned tab shows the room preview + recent purchases, purchases persist
// across reload, and guests can browse but not buy.
// Desktop + mobile. Usage: node scripts/qa/shop.mjs /tmp/cls-qa/shop [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/shop";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };

const seed = (page) => page.evaluate(async () => {
  const { PLAYERS, overall } = await import("/js/data/players.js");
  const { createAccount, getAccount, saveAccount, setActiveAccountId } = await import("/js/data/account.js");
  const sorted = [...PLAYERS].sort((a, b) => overall(b) - overall(a));
  const seen = new Set();
  const ids = [];
  for (const p of sorted) { if (!seen.has(p.bref)) { seen.add(p.bref); ids.push(p.id); } if (ids.length === 10) break; }
  const a = createAccount("QA 商城");
  saveAccount({ ...getAccount(a.id), playerIds: ids, coachId: null, gold: 2000, onboardingDone: true, welcomeGranted: true });
  setActiveAccountId(a.id);
  return ids.length;
});

const shopState = (page) => page.evaluate(async () => {
  const { getAccount } = await import("/js/data/account.js");
  const { getShop, equippedClothingItemId, equippedFrameId } = await import("/js/data/shop.js");
  const { readLook } = await import("/js/data/avatarLook.js");
  const { getAxp } = await import("/js/data/accountLevel.js");
  const a = getAccount();
  return a ? { gold: a.gold || 0, shop: getShop(a), outfit: readLook(a).outfit, clothing: equippedClothingItemId(a), frame: equippedFrameId(a), totalXp: getAxp(a).totalXp } : null;
});

const played = async (page) => page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("cls_myteam_season_v1") || "null");
  const r = st?.standings?.[st.userTeamId];
  return r ? r.w + r.l : -1;
});

const openEditor = async (page) => {
  await page.click('.home-tab[data-category="players"]');
  await page.click("#btn-open-my-lineup");
  await page.waitForSelector("#screen-my-team-lineup.active");
};
const confirmDialog = async (page, accept = true) => {
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 8000 });
  const msg = await text(page, "#app-confirm-message");
  await page.click(accept ? "#app-confirm-accept" : "#app-confirm-cancel");
  await page.waitForFunction(() => !document.querySelector("#app-confirm-dialog").open);
  return msg;
};
const openShop = async (page) => {
  await page.click("#btn-gold-chip");
  await page.waitForSelector("#shop-dialog[open]", { timeout: 8000 });
};
const closeShop = async (page) => {
  await page.click('#shop-dialog [data-shop-action="close"]');
  await page.waitForFunction(() => !document.querySelector("#shop-dialog").open);
};
const buySelected = async (page) => {
  await page.click('#shop-dialog [data-shop-action="buy"]');
  await page.click('#shop-dialog [data-shop-action="buy"]'); // two-step: arm, then confirm
};

for (const [tag, viewport] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, hasTouch: tag === "mobile" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await reload(page);
  const seeded = await seed(page);
  check(`[${tag}] seed account with 10 cards + ¤2000`, seeded === 10, `seeded ${seeded}`);
  await reload(page);

  // Top-bar gold chip.
  check(`[${tag}] gold chip shows ¤2000`, (await text(page, "#gold-chip-amt")) === "2000");
  await openShop(page);
  check(`[${tag}] shop dialog opens with 5 tabs (4 categories + owned)`, (await page.$$("#shop-dialog .shop-tab")).length === 5);
  check(`[${tag}] home tab lists 8 furniture items`, (await page.$$("#shop-dialog .shop-card")).length === 8);
  check(`[${tag}] dialog states the no-power rule`, (await text(page, "#shop-dialog")).includes("金币不买球员卡"));
  check(`[${tag}] dialog: no overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-shop-open.png`);

  // 1) Furniture: buy the trophy cabinet, it appears in the My Home room.
  await page.click('#shop-dialog [data-item-id="furniture-trophy-cabinet"]');
  await buySelected(page);
  let st = await shopState(page);
  check(`[${tag}] furniture: gold 2000 → 1700, cabinet owned`, st.gold === 1700 && st.shop.owned["furniture-trophy-cabinet"] === true, `gold ${st.gold}`);
  check(`[${tag}] furniture: detail says it is placed`, (await text(page, "#shop-dialog")).includes("已摆进 My Home"));
  // 1b) Furniture: the sofa from the expanded catalog.
  await page.click('#shop-dialog [data-item-id="furniture-sofa"]');
  await buySelected(page);
  st = await shopState(page);
  check(`[${tag}] furniture: sofa ¤250, gold 1700 → 1450`, st.gold === 1450 && st.shop.owned["furniture-sofa"] === true, `gold ${st.gold}`);
  await closeShop(page);
  await page.click('.home-tab[data-category="world"]');
  check(`[${tag}] furniture: cabinet renders in the My Home room`, !!(await page.$('#my-world-root [data-furniture="trophy-cabinet"]')));
  check(`[${tag}] furniture: room note names the cabinet`, (await text(page, "#my-world-root")).includes("已摆放冠军奖杯柜"));
  await shoot(page, `${OUT}/${tag}-shop-cabinet.png`);

  // 2) Clothing: buy the champion jersey, wear it — the avatar look really changes.
  await openShop(page);
  await page.click('#shop-dialog [data-shop-action="select-category"][data-category="style"]');
  check(`[${tag}] style tab lists 5 outfits`, (await page.$$("#shop-dialog .shop-card")).length === 5);
  await page.click('#shop-dialog [data-item-id="outfit-champion-gold"]');
  await buySelected(page);
  st = await shopState(page);
  check(`[${tag}] clothing: gold 1450 → 1300`, st.gold === 1300, `gold ${st.gold}`);
  await page.click('#shop-dialog [data-shop-action="equip"]');
  st = await shopState(page);
  check(`[${tag}] clothing: avatar wears the champion outfit`, st.outfit === "champion" && st.clothing === "outfit-champion-gold", `outfit ${st.outfit}`);
  // 2b) Clothing: a new outfit from the expanded catalog (midnight).
  await page.click('#shop-dialog [data-item-id="outfit-midnight"]');
  await buySelected(page);
  st = await shopState(page);
  check(`[${tag}] clothing: midnight ¤120, gold 1300 → 1180`, st.gold === 1180, `gold ${st.gold}`);
  await page.click('#shop-dialog [data-shop-action="equip"]');
  st = await shopState(page);
  check(`[${tag}] clothing: avatar wears the midnight outfit`, st.outfit === "midnight" && st.clothing === "outfit-midnight", `outfit ${st.outfit}`);
  await closeShop(page);
  const championLocked = await page.$eval('#mw-look input[value="champion"]', (el) => el.disabled).catch(() => null);
  check(`[${tag}] clothing: editor no longer locks the champion outfit`, championLocked === false, `disabled=${championLocked}`);
  const midnightLocked = await page.$eval('#mw-look input[value="midnight"]', (el) => el.disabled).catch(() => null);
  check(`[${tag}] clothing: editor no longer locks the midnight outfit`, midnightLocked === false, `disabled=${midnightLocked}`);

  // 3) Frame: buy and apply — the portrait really gets the gold ring.
  await openShop(page);
  await page.click('#shop-dialog [data-shop-action="select-category"][data-category="collection"]');
  check(`[${tag}] collection tab lists 4 frames`, (await page.$$("#shop-dialog .shop-card")).length === 4);
  await page.click('#shop-dialog [data-item-id="frame-champion-gold"]');
  await buySelected(page);
  st = await shopState(page);
  check(`[${tag}] frame: gold 1180 → 1100`, st.gold === 1100, `gold ${st.gold}`);
  await page.click('#shop-dialog [data-shop-action="equip"]');
  st = await shopState(page);
  check(`[${tag}] frame: equipped on the account`, st.frame === "frame-champion-gold");
  await closeShop(page);
  check(`[${tag}] frame: portrait carries the gold ring`, !!(await page.$("#my-world-root .mw-portrait.mw-frame-gold")));
  await shoot(page, `${OUT}/${tag}-shop-frame.png`);

  // 3b) Owned tab: room preview + owned states + recent purchases, newest first.
  await openShop(page);
  await page.click('#shop-dialog [data-shop-action="select-inventory"]');
  check(`[${tag}] owned: room preview shows cabinet + sofa`, !!(await page.$('#shop-dialog [data-furniture="trophy-cabinet"]')) && !!(await page.$('#shop-dialog [data-furniture="sofa"]')));
  const ownedText = await text(page, "#shop-dialog");
  check(`[${tag}] owned: sofa placed, midnight wearing`, ownedText.includes("已摆进房间") && ownedText.includes("穿着中"));
  const recentNames = await page.$$eval("#shop-dialog .shop-recent-list li", (els) => els.map((el) => el.textContent));
  check(`[${tag}] owned: recent purchases newest first (frame → cabinet)`, recentNames[0]?.includes("冠军金边头像框") && recentNames[recentNames.length - 1]?.includes("冠军奖杯柜"), recentNames.join(" | "));

  // 4) Tickets: buy both bundles, then use 5 inside a real 20-game season.
  await openShop(page);
  await page.click('#shop-dialog [data-shop-action="select-category"][data-category="convenience"]');
  check(`[${tag}] convenience tab lists 3 ticket packs`, (await page.$$("#shop-dialog .shop-card")).length === 3);
  check(`[${tag}] convenience: bulk x50 pack listed at ¤800`, (await text(page, "#shop-dialog")).includes("800"));
  await page.click('#shop-dialog [data-item-id="ticket-auto-5"]');
  await buySelected(page);
  await page.click('#shop-dialog [data-item-id="ticket-auto-20"]');
  await buySelected(page);
  st = await shopState(page);
  check(`[${tag}] tickets: gold 1100 → 650, 25 credits held`, st.gold === 650 && st.shop.tickets === 25, `gold ${st.gold}, tickets ${st.shop.tickets}`);
  await page.click('#shop-dialog [data-shop-action="select-category"][data-category="home"]');
  check(`[${tag}] no duplicate buy: owned cabinet card says 已拥有`, (await text(page, "#shop-dialog")).includes("已拥有"));
  await closeShop(page);

  await openEditor(page);
  await page.click('[data-act="start-quick"]');
  await confirmDialog(page, true);
  await page.waitForSelector("#screen-season.active #season-hub-panel:not([hidden])", { timeout: 15000 });
  check(`[${tag}] season hub opens for the ticket use`, /0\/20/.test(await text(page, "#season-hub-meta")));
  const xpBefore = (await shopState(page)).totalXp;
  await page.click("#btn-season-shop");
  await page.waitForSelector("#shop-dialog[open]", { timeout: 8000 });
  check(`[${tag}] season hub shop button opens at 便利`, (await text(page, "#shop-dialog")).includes("便利"));
  check(`[${tag}] tickets: use-all offers all 20 remaining games`, !!(await page.$('#shop-dialog [data-shop-action="use-tickets"][data-games="20"]')));
  await page.click('#shop-dialog [data-shop-action="use-tickets"][data-games="5"]');
  await page.waitForFunction(() => document.querySelector("#shop-dialog")?.textContent.includes("已托管 5 场"), null, { timeout: 15000 });
  const useText = await text(page, "#shop-dialog");
  check(`[${tag}] tickets: use reports real W-L and +25 XP`, /已托管 5 场：\d+ 胜 \d+ 负/.test(useText) && useText.includes("账号经验 +25"), useText.slice(0, 120));
  st = await shopState(page);
  check(`[${tag}] tickets: 5 credits consumed, 20 left, gold untouched`, st.shop.tickets === 20 && st.gold === 650, `tickets ${st.shop.tickets}, gold ${st.gold}`);
  check(`[${tag}] tickets: XP delta is exactly +25 (5 × 5)`, st.totalXp - xpBefore === 25, `${xpBefore} → ${st.totalXp}`);
  check(`[${tag}] tickets: season really advanced 5 games`, (await played(page)) === 5, `played ${await played(page)}`);
  await closeShop(page);
  await shoot(page, `${OUT}/${tag}-shop-tickets.png`);

  // Persistence across reload.
  await reload(page);
  await page.click('.home-tab[data-category="world"]');
  st = await shopState(page);
  check(`[${tag}] reload: cabinet + outfit + frame + 20 tickets survive`, !!(await page.$('#my-world-root [data-furniture="trophy-cabinet"]')) && st.outfit === "midnight" && st.frame === "frame-champion-gold" && st.shop.tickets === 20, JSON.stringify(st.shop));
  check(`[${tag}] reload: gold still ¤650`, st.gold === 650);
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

// Guests browse but cannot buy.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await reload(page);
  check("[guest] gold chip shows ¤0", (await text(page, "#gold-chip-amt")) === "0");
  await openShop(page);
  check("[guest] dialog opens and offers sign-in, no buy button", (await text(page, "#shop-dialog")).includes("登录账号后购买") && !(await page.$('#shop-dialog [data-shop-action="buy"]')));
  check("[guest] no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

await browser.close();
const fails = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\nshop QA: ${out.length - fails}/${out.length} pass`);
if (fails) process.exit(1);
