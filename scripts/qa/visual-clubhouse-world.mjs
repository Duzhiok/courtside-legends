// My Team Clubhouse + My World Character Showcase in a real browser: the clubhouse hero
// counts a real championship, the court shows the saved starting five and swaps a bench
// player in for real (persisted), the wall shows owned cards, the season center and
// honours room read real records; My World shows the always-visible character showcase
// with a working Stylized/Bobblehead switch and the owned shop area with findable
// equip entries. Desktop + mobile. Usage: node scripts/qa/visual-clubhouse-world.mjs /tmp/cls-qa/visual [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, overflowers, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/visual";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };

/** A signed-in account with 10 real cards, one finished champion season, the three shop
 * cosmetics bought in a known order (frame -> outfit -> cabinet), and a saved lineup. */
const seed = (page) => page.evaluate(async () => {
  const { PLAYERS, overall } = await import("/js/data/players.js");
  const { createAccount, getAccount, saveAccount, setActiveAccountId } = await import("/js/data/account.js");
  const { autoLineup } = await import("/js/myteam/lineup.js");
  const { saveMyTeamLineup } = await import("/js/myteam/lineupStore.js");
  const { purchaseShopItem } = await import("/js/data/shop.js");
  const sorted = [...PLAYERS].sort((a, b) => overall(b) - overall(a));
  const seen = new Set();
  const ids = [];
  for (const p of sorted) { if (!seen.has(p.bref)) { seen.add(p.bref); ids.push(p.id); } if (ids.length === 10) break; }
  const a = createAccount("QA 视觉");
  const acc = getAccount(a.id);
  acc.playerIds = ids;
  acc.gold = 1000;
  acc.onboardingDone = true;
  acc.welcomeGranted = true;
  acc.myTeamSeasons = [{
    seasonId: "qa-champ-1", variant: "quick", games: 20, w: 16, l: 4, champion: true,
    finish: "champion", rank: 1, star: { name: "Stephen Curry", ppg: 28.5 }, finishedAt: Date.now(),
  }];
  saveAccount(acc);
  saveMyTeamLineup(a.id, autoLineup(acc));
  const bought = [];
  for (const id of ["frame-champion-gold", "outfit-champion-gold", "furniture-trophy-cabinet"]) {
    const r = purchaseShopItem(getAccount(a.id), id);
    bought.push(`${id}:${r.ok}`);
  }
  setActiveAccountId(a.id);
  return { cards: ids.length, bought: bought.join(",") };
});

const state = (page) => page.evaluate(async () => {
  const { getAccount } = await import("/js/data/account.js");
  const { getShop, equippedClothingItemId, equippedFrameId } = await import("/js/data/shop.js");
  const { readLook } = await import("/js/data/avatarLook.js");
  const a = getAccount();
  if (!a) return null;
  return {
    titles: (a.myTeamSeasons || []).filter((r) => r.champion).length,
    shop: getShop(a), outfit: readLook(a).outfit, figure: readLook(a).figure,
    clothing: equippedClothingItemId(a), frame: equippedFrameId(a),
    starters: a.myTeamLineup?.starterIds || [],
  };
});

const openWorld = async (page) => {
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("#my-world-root .mw-showcase");
};
const openClubhouse = async (page) => {
  await page.click('.home-tab[data-category="players"]');
  await page.waitForSelector("#my-team-clubhouse-root .mtc-hero", { state: "visible" }); // the clubhouse IS the My Players tab now
};

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await homeActive(page);

const seeded = await seed(page);
check("seed: 10 cards + 1 champion season + 3 shop items", seeded.cards === 10 && seeded.bought === "frame-champion-gold:true,outfit-champion-gold:true,furniture-trophy-cabinet:true", JSON.stringify(seeded));
await reload(page);

// ---- My World showcase + owned area (desktop) ----
await openWorld(page);
check("showcase: stage present", await page.$("#mw-showcase-stage") !== null);
check("showcase: figure or fallback portrait visible", await page.evaluate(() => {
  const stage = document.querySelector("#mw-showcase-stage");
  return !!stage.querySelector("canvas") || !!stage.querySelector(".mw-showcase-static:not([hidden])");
}));
check("showcase: both style buttons present", (await page.$$eval('[data-mw-action="showcase-figure"]', (els) => els.map((e) => e.dataset.figure).join(","))) === "stylized,bobblehead");
await page.click('[data-mw-action="showcase-figure"][data-figure="bobblehead"]');
await page.waitForFunction(async () => (await import("/js/data/avatarLook.js")).readLook((await import("/js/data/account.js")).getAccount()).figure === "bobblehead");
check("showcase: Bobblehead switch writes look.figure", (await state(page)).figure === "bobblehead");
check("showcase: Bobblehead button pressed", await page.$eval('[data-mw-action="showcase-figure"][data-figure="bobblehead"]', (el) => el.getAttribute("aria-pressed")) === "true");
await page.click('[data-mw-action="showcase-figure"][data-figure="stylized"]');
check("owned: recent order is cabinet, outfit, frame", await page.evaluate(() => {
  const names = [...document.querySelectorAll(".mw-owned .mw-owned-name")].map((el) => el.textContent);
  return names[0].includes("奖杯柜") && names[1].includes("球衣") && names[2].includes("头像框");
}));
check("owned: furniture shows placed in My Home", (await text(page, ".mw-owned")).includes("已摆放在 My Home"));
await page.click('.mw-owned [data-mw-action="equip-owned"]');
await page.waitForFunction(() => document.querySelector("#mw-owned-status")?.textContent.includes("已穿戴"));
check("owned: equip from My World wears the outfit", (await state(page)).clothing === "outfit-champion-gold");
await reload(page);
await openWorld(page);
check("owned: equipped outfit survives reload", (await state(page)).clothing === "outfit-champion-gold");
check("myworld: no horizontal overflow (desktop)", await noOverflow(page), (await overflowers(page)).join(" | "));
await shoot(page, `${OUT}/myworld-desktop.png`);

// ---- Clubhouse (desktop) ----
await openClubhouse(page);
check("clubhouse: hero shows 1 real title", (await text(page, ".mtc-hero")).includes("1") && (await state(page)).titles === 1);
check("clubhouse: court has 5 starters", (await page.$$eval(".mtc-court-card", (els) => els.length)) === 5);
check("clubhouse: wall shows 10 owned cards", (await page.$$eval(".mtc-wall-card", (els) => els.length)) === 10);
check("clubhouse: season center offers a new season", (await text(page, ".mtc")).includes("快速赛季"));
check("clubhouse: honours lists the champion season", (await text(page, ".mtc")).includes("16") && (await text(page, ".mtc")).includes("总冠军"));
await shoot(page, `${OUT}/clubhouse-desktop.png`);

// Swap: first starter out, first bench player in — persisted through reload.
const before = await page.$$eval(".mtc-court-card", (els) => els.map((el) => el.dataset.card));
await page.click(".mtc-court-card .mtc-swap-btn");
await page.waitForSelector(".mtc-picker");
const pickerCount = await page.$$eval(".mtc-pick", (els) => els.length);
check("clubhouse: swap picker lists the 5 bench players only", pickerCount === 5, `got ${pickerCount}`);
const picked = await page.$eval(".mtc-pick", (el) => el.dataset.card);
await page.click(".mtc-pick");
await page.waitForFunction(() => document.querySelector("#my-team-clubhouse-root .mtc-notice")?.textContent.includes("已换上"));
const after = await page.$$eval(".mtc-court-card", (els) => els.map((el) => el.dataset.card));
check("clubhouse: swap changes the court", before.join() !== after.join() && after.includes(picked) && !after.includes(before[0]), `${before[0]} -> ${picked}`);
check("clubhouse: swap saved to the lineup", (await state(page)).starters.includes(picked));
await reload(page);
await openClubhouse(page);
check("clubhouse: swapped starter survives reload", (await page.$$eval(".mtc-court-card", (els) => els.map((el) => el.dataset.card))).includes(picked));
check("clubhouse: no horizontal overflow (desktop)", await noOverflow(page), (await overflowers(page)).join(" | "));
await shoot(page, `${OUT}/clubhouse-desktop-swapped.png`);

// ---- Mobile ----
await page.setViewportSize({ width: 390, height: 844 });
await reload(page);
await openWorld(page);
check("myworld: no horizontal overflow (mobile)", await noOverflow(page), (await overflowers(page)).join(" | "));
await shoot(page, `${OUT}/myworld-mobile.png`);
await openClubhouse(page);
check("clubhouse: no horizontal overflow (mobile)", await noOverflow(page), (await overflowers(page)).join(" | "));
await shoot(page, `${OUT}/clubhouse-mobile.png`);

await browser.close();
const fails = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - fails}/${out.length} checks passed`);
process.exit(fails ? 1 : 0);
