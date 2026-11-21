/* global localStorage */
// How long does "start a gold career" block the page? Cold home screen, tap the mode, wait for the market. The CPU profile that found
// the cost (js/engine/draft.js drawPack re-filtering the player library per pick, B77) is in docs/BACKLOG.md.
// Usage: node scripts/measure/career-start.mjs [baseUrl] [runs=3]
import { chromium } from "playwright-core";
import { homeActive } from "../qa/lib/page.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5419/";
const RUNS = Number(process.argv[3] || 3);
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const times = [];
for (let i = 0; i < RUNS; i++) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.waitForTimeout(2500);
  await page.click('.home-tab[data-category="custom"]');
  const t0 = Date.now();
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#btn-market-done", { state: "visible", timeout: 60000 });
  times.push(Date.now() - t0);
  await page.close();
}
const sorted = [...times].sort((a, b) => a - b);
console.log(`career start -> market visible (ms): ${times.join(", ")}  median ${sorted[Math.floor(sorted.length / 2)]}`);
await browser.close();
