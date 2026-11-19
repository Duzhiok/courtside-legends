// Browser smoke for the fragment REDEMPTIONS (decision 4): a one-week skill specialisation, the season's legacy
// jersey and the career honours (a title + the portrait frame), through the real Reborn screen, then all of them in
// My World: the jersey worn on the 2D figure, the title under the name, the frame on the portrait.
// Seeds 30 fragments + awakened family skills through the app's own save module (earning them is covered elsewhere).
// Usage: node scripts/qa/reborn-fragments-redeem.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-fragments-redeem";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=career2-qa-rivalry-2`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => null);
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const balance = (page) => text(page, "[data-fragment-balance]");
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function openCareer(page) {
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.clear(); sessionStorage.clear();
    const acc = await import("/js/data/account.js");
    const a = acc.createAccount("John");
    a.onboardingDone = true;
    acc.saveAccount(a);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await openCareer(page);
  await page.waitForSelector(".reborn-create", { timeout: 20000 });
  await page.click('[data-reborn-destiny="historical"]');
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  await page.click('[data-train="defense"]');

  const seeded = await page.evaluate(async () => {
    const m = await import("/js/data/saveRoot.js");
    const root = m.readRootSave(localStorage);
    if (!root?.reborn?.player) return false;
    root.reborn.player.fragments = { balance: 30, history: [] };
    const season = root.reborn.player.seasonYear ?? root.reborn.identity.season;
    // family skills (shooter / rebounder / thief): whichever the card keeps under its own slot + retain gates
    root.reborn.player.awakening = { ...(root.reborn.player.awakening || {}), awakened: ["rainmaker", "glass_cleaner", "thief"].map((skillId) => ({ skillId, season })) };
    m.writeRootSave(root, localStorage);
    return true;
  });
  check(`[${tag}] seeded 30 fragments + awakened family skills in the real save`, seeded);
  await page.reload({ waitUntil: "domcontentloaded" });
  await openCareer(page);
  await page.waitForSelector("[data-play]", { timeout: 20000 }).catch(() => {});
  check(`[${tag}] resumed with the balance intact`, (await balance(page)) === "30", String(await balance(page)));

  const specials = await page.$$eval("[data-specialize]", (els) => els.map((el) => ({ id: el.dataset.specialize, on: !el.disabled })));
  check(`[${tag}] the panel offers a specialisation for an owned family skill`, specials.length > 0 && specials.every((s) => s.on), JSON.stringify(specials));
  const legacyOn = await page.$eval("[data-buy-legacy]", (el) => !el.disabled).catch(() => false);
  check(`[${tag}] the legacy jersey button is enabled (identity known, 30 >= 10)`, legacyOn);
  await shoot(page, `${OUT}/${tag}-before.png`);

  await page.click("[data-specialize]");
  await page.waitForTimeout(300);
  check(`[${tag}] specialising spends exactly 2`, (await balance(page)) === "28", String(await balance(page)));
  check(`[${tag}] the panel says which skill is specialised, no second one offered`, (await page.$("[data-specialty-on]")) !== null && (await page.$("[data-specialize]")) === null);

  await page.click("[data-buy-legacy]");
  await page.waitForTimeout(300);
  check(`[${tag}] the legacy jersey spends exactly 10`, (await balance(page)) === "18", String(await balance(page)));
  check(`[${tag}] the panel says the season's jersey is in the collection`, (await page.$("[data-legacy-owned]")) !== null);
  check(`[${tag}] a title without its evidence is locked (awakened needs an awakening; the seed has one, champion has none)`, await page.$eval('[data-buy-unlock="title:champion"]', (el) => el.disabled).catch(() => false));
  await page.click('[data-buy-unlock="title:reborn"]');
  await page.waitForTimeout(300);
  await page.click('[data-buy-unlock="frame:reborn"]');
  await page.waitForTimeout(300);
  check(`[${tag}] the title (4) and the frame (8) spend exactly 12`, (await balance(page)) === "6", String(await balance(page)));
  check(`[${tag}] both show as redeemed`, (await page.$('[data-unlock-owned="title:reborn"]')) !== null && (await page.$('[data-unlock-owned="frame:reborn"]')) !== null);
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-after.png`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await openCareer(page);
  await page.waitForSelector("[data-play]", { timeout: 20000 }).catch(() => {});
  check(`[${tag}] all purchases survive a reload`, (await balance(page)) === "6" && (await page.$('[data-unlock-owned="frame:reborn"]')) !== null && (await page.$("[data-specialty-on]")) !== null && (await page.$("[data-legacy-owned]")) !== null);

  await page.click("[data-play]");
  const started = Date.now();
  let settled = false;
  while (Date.now() - started < 60000 && !settled) {
    if (await visible(page, ".reborn-takeover-overlay")) await page.click('.reborn-takeover-option[data-option="pass"]');
    const dialog = await page.$(".shell-modal button, dialog[open] button");
    if (dialog && (await dialog.isVisible().catch(() => false))) await dialog.click().catch(() => {});
    settled = (await page.$(".reborn-report")) !== null && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => true));
    if (!settled) await page.waitForTimeout(300);
  }
  const report = (await text(page, ".reborn-report")) || "";
  check(`[${tag}] the game report says the training went to the specialised skill`, settled && /技能专精|[Ss]pecialisation/.test(report), report.slice(0, 140));

  // My World: the legacy jersey is in the account collection, labelled as such, and can be worn on the 2D figure
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="world"]');
  const card = '.mw-jersey-card[data-jersey-key^="legacy:"]';
  const inCollection = await page.waitForSelector(card, { timeout: 25000 }).then(() => true).catch(() => false);
  check(`[${tag}] My World's collection holds the legacy jersey`, inCollection);
  if (inCollection) {
    const cardText = (await text(page, card)) || "";
    check(`[${tag}] its card says legacy + fragments, not a swap`, /传承/.test(cardText) && /职业碎片/.test(cardText) && !/交换/.test(cardText), cardText.slice(0, 120));
    await page.click(`${card} [data-mw-action="equip-jersey"]`);
    await page.waitForTimeout(800);
    const worn = await page.$eval("#mw-showcase-stage canvas.avatar2d-canvas", (c) => (c.dataset.jersey ? JSON.parse(c.dataset.jersey) : null)).catch(() => null);
    check(`[${tag}] wearing it puts it on the 2D figure`, !!worn, JSON.stringify(worn)?.slice(0, 120));
    await shoot(page, `${OUT}/${tag}-my-world.png`);
  }
  const honours = await page.waitForSelector('.mw-honours [data-unlock="title:reborn"]', { timeout: 10000 }).then(() => true).catch(() => false);
  check(`[${tag}] My World lists the career honours`, honours);
  if (honours) {
    await page.click('.mw-honours [data-unlock="title:reborn"] [data-mw-action="equip-title"]');
    await page.waitForTimeout(400);
    check(`[${tag}] the worn title shows under the name`, ((await text(page, ".mw-title-badge")) || "").includes("重生者"), String(await text(page, ".mw-title-badge")));
    await page.click('.mw-honours [data-item="frame:reborn"] [data-mw-action="equip-owned"]');
    await page.waitForTimeout(400);
    check(`[${tag}] the frame goes on the portrait`, (await page.$(".mw-portrait.mw-frame-reborn")) !== null);
    await page.reload({ waitUntil: "domcontentloaded" });
    await homeActive(page);
    await page.click('.home-tab[data-category="world"]');
    await page.waitForSelector(".mw-honours", { timeout: 25000 }).catch(() => {});
    check(`[${tag}] title + frame survive a reload`, (await page.$(".mw-portrait.mw-frame-reborn")) !== null && ((await text(page, ".mw-title-badge")) || "").includes("重生者"));
    check(`[${tag}] My World has no horizontal overflow`, await noOverflow(page));
    await shoot(page, `${OUT}/${tag}-honours.png`);
  }
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
