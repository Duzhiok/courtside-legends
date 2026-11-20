// Browser smoke for Career 2.0 decision 4: Reborn career fragments (panel, gated intensive training, report line).
// Usage: node scripts/qa/reborn-fragments.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-fragments";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=career2-qa-rivalry-2`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };
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

  check(`[${tag}] fragments panel shows a zero balance`, (await page.$eval("[data-fragment-balance]", (el) => el.textContent).catch(() => null)) === "0");
  check(`[${tag}] intensive training is gated with no fragments`, await page.$eval("[data-buy-intensive]", (el) => el.disabled).catch(() => false));
  await page.click('[data-train="defense"]');
  check(`[${tag}] still gated after picking a focus (balance short)`, await page.$eval("[data-buy-intensive]", (el) => el.disabled).catch(() => false));
  await shoot(page, `${OUT}/${tag}-panel.png`);

  await page.click("[data-play]");
  const started = Date.now();
  let settled = false;
  while (Date.now() - started < 60000 && !settled) {
    if (await visible(page, ".reborn-takeover-dialog")) await page.click('.reborn-takeover-option[data-option="pass"]');
    settled = await page.$(".reborn-report") !== null && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => true));
    if (!settled) await page.waitForTimeout(300);
  }
  check(`[${tag}] a game settles with the panel still rendered`, settled && (await page.$("[data-fragment-balance]")) !== null);
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-after-game.png`);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
