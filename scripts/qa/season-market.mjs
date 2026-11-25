// Season market tab, real app + real buttons (B61 step 9): the markup comes from js/ui/seasonMarketView.js, the wiring from app.js.
// Builds a real career (lib/career.mjs openCareer), opens "自由市场", then lists / unlists a player, cuts one (confirm dialog), signs a free agent with the
// room that opened up, refreshes the pool, and flips tabs. Desktop 1440 and phone 390 (no sideways overflow).
// usage: node scripts/qa/season-market.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { openCareer } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/season-market";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => {
  const line = `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`;
  report.push(line);
  console.log(line); // live: a crash later in the script must not swallow what already ran
};
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openCareer(page, BASE); // a real career built by the engine, driven to the season hub through the real buttons
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector("#season-market .sm-cap-card", { timeout: 10000 });
  const counts = () => page.evaluate(() => ({
    cuts: document.querySelectorAll("#season-market .sm-cut").length,
    signs: document.querySelectorAll("#season-market .sm-sign").length,
    open: [...document.querySelectorAll("#season-market .sm-sign")].filter((b) => !b.disabled).length,
    listed: document.querySelectorAll("#season-market .sm-list-pref").length,
    cap: document.querySelector("#season-market .sm-cap-card p")?.textContent.replace(/\s+/g, " ").trim().slice(0, 60),
  }));
  const first = await counts();
  check(`[${tag}] the market tab renders its sections`, first.cuts >= 5 && first.signs > 0, JSON.stringify(first));
  await page.screenshot({ path: `${OUT}/${tag}-market.png` });

  await page.click(".sm-list-trade");
  await page.waitForSelector("#season-market .sm-list-pref", { timeout: 5000 });
  check(`[${tag}] list for trade: the chip and the sale-preference select appear`, (await counts()).listed === 1 && await page.locator("#season-market .chip", { hasText: "已挂牌" }).count() === 1);
  await page.click(".sm-list-trade");
  await page.waitForFunction(() => document.querySelectorAll("#season-market .sm-list-pref").length === 0, null, { timeout: 5000 });
  check(`[${tag}] unlist: both go away again`, (await counts()).listed === 0);

  const before = await counts();
  await page.click(".sm-cut");
  await page.waitForSelector("#app-confirm-accept", { state: "visible", timeout: 5000 });
  await page.click("#app-confirm-accept");
  await page.waitForFunction((n) => document.querySelectorAll("#season-market .sm-cut").length === n - 1, before.cuts, { timeout: 10000 });
  const afterCut = await counts();
  check(`[${tag}] cut (with the confirm dialog): the roster shrinks by one and the market re-renders`, afterCut.cuts === before.cuts - 1, `${before.cuts} -> ${afterCut.cuts}`);

  if (afterCut.open > 0) {
    await page.locator("#season-market .sm-sign:not([disabled])").first().click();
    await page.waitForFunction((n) => document.querySelectorAll("#season-market .sm-cut").length === n + 1, afterCut.cuts, { timeout: 10000 });
    check(`[${tag}] sign a free agent into the room the cut opened`, (await counts()).cuts === afterCut.cuts + 1);
  } else {
    check(`[${tag}] sign a free agent into the room the cut opened`, false, "no enabled Sign button after the cut");
  }

  await page.click("#btn-sm-refresh-fa");
  await page.waitForSelector("#season-market .sm-sign", { timeout: 5000 });
  check(`[${tag}] refresh the free-agent pool`, (await counts()).signs > 0);
  await page.click("#btn-sm-refresh-staff");
  await page.waitForSelector("#season-market .sm-hire-coach", { timeout: 5000 });
  check(`[${tag}] refresh the coach market`, true);
  await page.click('[data-season-tab="standings"]');
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector("#season-market .sm-cap-card");
  check(`[${tag}] flipping tabs keeps the market`, (await counts()).cuts >= 5);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`[${tag}] no sideways overflow`, overflow <= 1, `${overflow}px`);
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.screenshot({ path: `${OUT}/${tag}-market-after.png` });
  await page.close();
}

await run(1440, 900, "desktop");
await run(390, 844, "mobile");
await browser.close();
const failed = report.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} checks passed`);
process.exit(failed ? 1 : 0);
