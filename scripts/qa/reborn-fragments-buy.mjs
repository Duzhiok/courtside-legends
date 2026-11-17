// Browser smoke for the REAL purchase path of Reborn career fragments (the base smoke only checks the gated button).
// Seeds 6 fragments through the app's own save module, resumes the career, buys intensive training, plays a game.
// Usage: node scripts/qa/reborn-fragments-buy.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-fragments-buy";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=career2-qa-rivalry-2`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => null);
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector(".reborn-create", { timeout: 20000 });
  await page.click('[data-reborn-destiny="historical"]');
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  await page.click('[data-train="defense"]');

  // Give the career 6 fragments through the app's own save module (same module instance, same storage).
  const seeded = await page.evaluate(async () => {
    const m = await import("/js/data/saveRoot.js");
    const root = m.readRootSave(localStorage);
    if (!root?.reborn?.player) return false;
    root.reborn.player.fragments = { balance: 6, intensiveWeek: null, history: [] };
    m.writeRootSave(root, localStorage);
    return true;
  });
  check(`[${tag}] seeded 6 fragments in the real save`, seeded);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector("[data-play]", { timeout: 20000 }).catch(() => {});
  check(`[${tag}] resumed the career with the balance intact`, (await text(page, "[data-fragment-balance]")) === "6", String(await text(page, "[data-fragment-balance]")));

  const enabled = await page.$eval("[data-buy-intensive]", (el) => !el.disabled).catch(() => false);
  check(`[${tag}] with 6 fragments and a focus the button is enabled`, enabled);
  await shoot(page, `${OUT}/${tag}-before-buy.png`);
  await page.click("[data-buy-intensive]");
  await page.waitForTimeout(400);
  check(`[${tag}] buying spends exactly 3`, (await text(page, "[data-fragment-balance]")) === "3", String(await text(page, "[data-fragment-balance]")));
  check(`[${tag}] panel says intensive training is on, no second buy offered`, (await page.$("[data-buy-intensive]")) === null && /×1\.5|x1\.5/.test((await text(page, ".reborn-fragments")) || ""), (await text(page, ".reborn-fragments"))?.slice(0, 100));
  await shoot(page, `${OUT}/${tag}-after-buy.png`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector("[data-play]", { timeout: 20000 }).catch(() => {});
  check(`[${tag}] the purchase survives a reload`, (await text(page, "[data-fragment-balance]")) === "3" && (await page.$("[data-buy-intensive]")) === null);

  await page.click("[data-play]");
  const started = Date.now();
  let settled = false;
  while (Date.now() - started < 60000 && !settled) {
    if (await visible(page, ".reborn-takeover-overlay")) await page.click('.reborn-takeover-option[data-option="pass"]');
    settled = (await page.$(".reborn-report")) !== null && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => true));
    if (!settled) await page.waitForTimeout(300);
  }
  const report = (await text(page, ".reborn-report")) || "";
  check(`[${tag}] the game report mentions intensive training`, settled && /强化训练|[Ii]ntensive/.test(report), report.slice(0, 120));
  check(`[${tag}] playing never spends fragments (balance still >= 3)`, Number(await text(page, "[data-fragment-balance]")) >= 3);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
