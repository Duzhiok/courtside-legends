// The standalone Clutch Challenge entry is gone from the home screen (owner decision 2026-11-26, B159): checked on EVERY home tab,
// desktop + mobile, with nothing left that links to it, no console errors, and the neighbouring mode cards still usable.
// Usage: node scripts/qa/clutch-entry-removed.mjs [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { homeActive, noOverflow } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = process.argv[2] || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ executablePath: EXE });
let failed = 0;
const check = (l, ok, d = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? ` — ${d}` : ""}`); };

for (const [tag, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("cls_guide_first_run_v1", "seen"));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  const tabs = await page.$$eval(".home-tab[data-category]", (els) => els.map((e) => e.dataset.category));
  check(`[${tag}] the four home spaces are all there`, tabs.length >= 4, tabs.join(","));
  for (const cat of tabs) {
    await page.click(`.home-tab[data-category="${cat}"]`);
    const found = await page.evaluate(() => {
      const hidden = (e) => e.closest("[hidden]") || !e.getClientRects().length;
      const cards = [...document.querySelectorAll("#screen-home .mode-card, #screen-home button, #screen-home a")].filter((e) => !hidden(e));
      return {
        id: !!document.querySelector("#btn-clutch-entry"),
        byText: cards.filter((e) => /绝杀挑战|Clutch Challenge/i.test(e.textContent)).length,
        links: cards.filter((e) => /clutch/i.test(e.id + e.className + (e.dataset.mode || ""))).length,
      };
    });
    check(`[${tag}] "${cat}": no clutch-challenge entry (id / text / mode link)`, !found.id && found.byText === 0 && found.links === 0, JSON.stringify(found));
    check(`[${tag}] "${cat}": no horizontal overflow`, await noOverflow(page));
  }
  await page.click('.home-tab[data-category="custom"]');
  const gold = page.locator('.mode-card[data-mode="career"]');
  check(`[${tag}] the Gold Challenge card next to it is still visible and enabled`, (await gold.isVisible()) && (await gold.isEnabled()));
  check(`[${tag}] the dormant clutch screens are not reachable (none is active)`, await page.evaluate(() => !document.querySelector("#screen-clutch.active, #screen-clutch-play.active, #screen-clutch-result.active")));
  check(`[${tag}] no console / page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
