// Browser smoke for the Gold Challenge result screen (handleCareerResult + js/ui/careerResultCopy.js).
// Real flow: Gold Challenge -> market -> setup -> live game -> quick sim -> result. Up to 6 rounds per viewport, so the run
// walks whichever outcomes the dice give (advance / another game in the group / Finals series game / knocked out / champions).
// Per round it checks: a title, a summary with no "undefined"/"NaN"/"[object", a continue button whose label is one of the
// known ones, and that pressing it goes where the label says (market for the next round, home for a finished run).
// Usage: node scripts/qa/gold-result.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/gold-result";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

const GOES_HOME = /^(回主页|捧杯回主页)$/;
const GOES_MARKET = /^(备战下一轮|备战总决赛|备战总决赛 G\d+（先进市场）|备战.+)$/;
const readResult = (page) => page.evaluate(() => ({
  title: document.querySelector("#result-title")?.textContent.trim(),
  summary: document.querySelector("#result-summary")?.textContent.trim(),
  label: document.querySelector("#btn-result-continue")?.textContent.trim(),
  continueShown: !!document.querySelector("#btn-result-continue") && !document.querySelector("#btn-result-continue").hidden,
}));

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="career"]');
  const seen = [];
  for (let round = 1; round <= 6; round += 1) {
    await page.waitForSelector("#screen-market.active", { timeout: 20000 });
    await page.waitForSelector("#btn-market-done", { state: "visible", timeout: 20000 });
    await page.click("#btn-market-done");
    await page.waitForSelector("#screen-setup.active", { timeout: 20000 });
    await page.click("#btn-setup-confirm");
    await page.waitForSelector("#screen-game.active", { timeout: 20000 });
    // The live game keeps the coach drawer shut; quick sim lives inside it, so open it the way a player does.
    if ((await page.getAttribute("#btn-coach-drawer", "aria-expanded")) !== "true") await page.click("#btn-coach-drawer");
    await page.click("#btn-quick-sim");
    await page.click("#app-confirm-accept");
    await page.waitForSelector("#screen-result.active", { timeout: 60000 });
    const r = await readResult(page);
    seen.push(r.title);
    const tagR = `[${tag} r${round}]`;
    check(`${tagR} a title`, !!r.title, r.title);
    check(`${tagR} a summary with no placeholder junk`, !!r.summary && !/undefined|NaN|\[object|null/.test(r.summary), r.summary?.slice(0, 90));
    check(`${tagR} a continue button with a known label`, r.continueShown && (GOES_HOME.test(r.label) || GOES_MARKET.test(r.label)), r.label);
    check(`${tagR} the result page does not overflow`, await noOverflow(page));
    if (round === 1) await shoot(page, `${OUT}/${tag}-result-1.png`);
    const home = GOES_HOME.test(r.label);
    await page.click("#btn-result-continue");
    if (home) {
      await page.waitForSelector("#screen-home.active", { timeout: 10000 });
      check(`${tagR} "${r.label}" goes home`, true);
      break;
    }
    await page.waitForSelector("#screen-market.active", { timeout: 10000 });
    check(`${tagR} "${r.label}" opens the market`, true);
  }
  check(`[${tag}] outcomes walked`, seen.length >= 1, seen.join(" | "));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join("; "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
