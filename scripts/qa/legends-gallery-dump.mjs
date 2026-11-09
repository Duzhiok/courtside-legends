// Dump the My World legends gallery: one row per legend (name, photo load state, src).
// The marquee duplicates the set for a seamless loop, so only the first 40 cards are listed.
// Usage: node scripts/qa/legends-gallery-dump.mjs /tmp/cls-qa/gallery.png
import { chromium } from "playwright-core";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("#mw-legends-gallery .lg-card");
await page.waitForTimeout(7000);
const rows = await page.$$eval("#mw-legends-gallery .lg-card", (n) => n.slice(0, 40).map((t) => { const i = t.querySelector(".lg-photo img"); return `${t.querySelector(".lg-name").textContent.padEnd(8)} ${i.complete && i.naturalWidth ? "loaded " + i.naturalWidth + "px" : "NOT LOADED"}  ${decodeURIComponent(i.src).split("/").pop().slice(0, 62)}`; }));
console.log(rows.join("\n"));
await (await page.$("#mw-legends-gallery")).screenshot({ path: process.argv[2] });
await browser.close();
