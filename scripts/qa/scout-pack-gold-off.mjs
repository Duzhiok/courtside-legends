import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/scout-off";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#screen-market.active", { timeout: 20000 });
  await page.waitForTimeout(400);

  check(`[${tag}] no scout-pack buy button in Gold`, (await page.$("#btn-buy-scout-pack")) === null);
  check(`[${tag}] no A/B scout buy buttons in Gold`, (await page.$("[data-scout-buyer]")) === null);
  const offerText = await page.$eval("#scout-pack-offer", (e) => e.textContent.trim()).catch(() => "");
  check(`[${tag}] scout-pack-offer box says nothing about buying a report`, !/买|buy|球探包|scout pack/i.test(offerText), JSON.stringify(offerText));
  check(`[${tag}] market hint has no scout-pack mention`, !/球探包|scout pack/i.test(await page.$eval("#market-hint", (e) => e.textContent)));

  // Basic player info and the free roster-fit analyst tag must still be there.
  const row = await page.$eval("#free-agent-list .market-row", (e) => e.textContent.trim()).catch(() => "");
  check(`[${tag}] market still shows a player's OVR/price`, /OVR \d+/.test(row) && /¤\d+/.test(row), row.slice(0, 80));
  const fitBadges = await page.$$eval(".fit-badge", (n) => n.length);
  check(`[${tag}] at least one roster-fit "analyst" badge shows for free (no purchase)`, fitBadges > 0, `${fitBadges} badges`);

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-market.png`);
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
