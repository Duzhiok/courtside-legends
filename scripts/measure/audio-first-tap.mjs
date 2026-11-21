/* global window, document, requestAnimationFrame, performance, localStorage */
import { chromium } from "playwright-core";
// How long does the first tap on the home screen take, and when is the AudioContext built (the device start-up is 0.4-1 s)?
// Before audio.prewarm() it was inside the tap; now it is in the idle time after boot. The prewarm waits for a quiet moment (app >= 2.5 s old, no input for 1.5 s), so a tap sooner than that still pays for the build itself.
// Usage: node scripts/measure/audio-first-tap.mjs [baseUrl] [waitMsBeforeTap=5000]
import { homeActive } from "../qa/lib/page.mjs";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = process.argv[2] || "http://127.0.0.1:5419/";
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.addInitScript(() => {
  const AC = globalThis.AudioContext; window.__a = { ctor: [] };
  globalThis.AudioContext = class extends AC { constructor(...a) { const t = performance.now(); super(...a); window.__a.ctor.push({ at: Math.round(t), ms: Math.round(performance.now() - t) }); } };
});
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await homeActive(page);
await page.waitForTimeout(Number(process.argv[3] ?? 5000)); // quiet time after boot: the prewarm happens here
const before = await page.evaluate(() => JSON.stringify(window.__a.ctor));
const click = await page.evaluate(() => new Promise((res) => {
  const t0 = performance.now();
  const el = document.querySelector('.home-tab[data-category="custom"]');
  el.click();
  requestAnimationFrame(() => res({ clickToFrameMs: Math.round(performance.now() - t0), clickedAt: Math.round(t0) }));
}));
await page.waitForTimeout(500);
const after = await page.evaluate(() => ({ ctor: window.__a.ctor }));
console.log("ctor calls before the first click:", before);
console.log("first tap -> next frame:", JSON.stringify(click));
console.log("ctor calls in total:", JSON.stringify(after.ctor), "errors:", errs.join("|") || "none");
await browser.close();
