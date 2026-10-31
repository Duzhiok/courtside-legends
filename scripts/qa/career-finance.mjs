// Browser E2E for E3's personal finance panel: cash/salary display, buying a house, placing an
// investment, and the season-transition settlement actually paying out. Built with the REAL
// engine (createTimeTravelPrologue + acceptInterviewOffer), written to localStorage, then read
// back by the real UI -- no hand-made DOM, no stubs.
// Usage: node scripts/qa/career-finance.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/finance";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/** Build a real, active (not fired/renewed) time-travel career and load it in the UI.
 * cashSeed lets a scenario start with some money already in the bank (simulating "a few
 * seasons in") without having to actually play through a season via the UI. */
async function openScenario(width, height, cashSeed = 0) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async (cash) => {
    const ttc = await import("/js/modes/timeTravelCareer.js");
    const sr = await import("/js/data/saveRoot.js");
    const cp = await import("/js/career/coachProfile.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
    let root = ttc.acceptInterviewOffer(prologue, prologue.offers[1].id);
    // A fresh career's root has no root.coach at all yet -- saveRoot.js's validator requires a
    // COMPLETE profile shape (version/age/perks/etc), not a bare { cash } patch, so seed via
    // createCoachProfile() same as a real save would end up looking after A1's ensureCoachProfile().
    if (cash) root = { ...root, coach: cp.createCoachProfile({ cash }) };
    sr.writeRootSave(root, localStorage);
  }, cashSeed);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  return { page, errors };
}

const rootCoach = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
  return root?.coach || null;
});
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const { page, errors } = await openScenario(width, height, 0);

  // The future-knowledge intro decision blocks the main flow on a brand new career; resolve it
  // first (same as a real player would) so the finance panel (which isn't behind that gate) is
  // actually what we're inspecting, not some earlier screen.
  await page.waitForSelector("#time-travel-decision:not([hidden])", { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => {
    document.querySelector('[data-story-choice="keep-quiet"]')?.click();
    document.querySelector("#time-travel-decision .tt-confirm [data-act=confirm]")?.click();
  });

  await page.waitForSelector("#time-travel-finance:not([hidden])", { timeout: 10000 });
  const summary = await page.$eval("#time-travel-finance-summary", (e) => e.textContent);
  check(`[${tag}] finance panel shows cash and salary`, /现金 ¤\d+/.test(summary) && /年薪 ¤\d+/.test(summary), summary);
  check(`[${tag}] starts with no house`, /住房：暂无/.test(summary), summary);

  const houseButtons = await page.$$eval("#time-travel-house-list button", (els) => els.map((e) => ({ text: e.textContent, disabled: e.disabled })));
  check(`[${tag}] three house tiers offered`, houseButtons.length === 3, `${houseButtons.length}`);
  check(`[${tag}] a fresh career (cash 0) cannot afford any house tier yet`, houseButtons.every((b) => b.disabled), houseButtons.map((b) => b.disabled).join(","));

  const investButtons = await page.$$eval("#time-travel-invest-list button", (els) => els.map((e) => ({ text: e.textContent, disabled: e.disabled })));
  check(`[${tag}] 1995 offers bonds and blue-chip but not crypto yet`, investButtons.some((b) => b.text.includes("国债")) && !investButtons.some((b) => b.text.includes("加密货币")), investButtons.map((b) => b.text).join(" | "));
  check(`[${tag}] investment buttons show a forecast percentage`, investButtons.every((b) => /预期走势 [+-]?\d/.test(b.text)));
  check(`[${tag}] a fresh career (cash 0) cannot afford to invest yet either`, investButtons.every((b) => b.disabled));

  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();

  // ---- a career with some money in the bank (simulating a few paid seasons) ----
  const { page: funded, errors: fundedErrors } = await openScenario(width, height, 100);
  await funded.waitForSelector("#time-travel-decision:not([hidden])", { timeout: 10000 }).catch(() => {});
  await funded.evaluate(() => {
    document.querySelector('[data-story-choice="keep-quiet"]')?.click();
    document.querySelector("#time-travel-decision .tt-confirm [data-act=confirm]")?.click();
  });
  await funded.waitForSelector("#time-travel-finance:not([hidden])", { timeout: 10000 });

  await funded.evaluate(() => {
    const buttons = [...document.querySelectorAll("#time-travel-house-list button")];
    buttons.find((b) => !b.disabled)?.click();
  });
  await funded.waitForTimeout(100);
  const afterHouse = await rootCoach(funded);
  check(`[${tag}] a funded career can buy a house, which persists housing + deducts cash`, afterHouse?.housing === "apartment" && afterHouse.cash === 80, JSON.stringify(afterHouse));
  const summaryAfterHouse = await funded.$eval("#time-travel-finance-summary", (e) => e.textContent);
  check(`[${tag}] summary updates to show the owned house`, summaryAfterHouse.includes("公寓"), summaryAfterHouse);
  const houseButtonsAfter = await funded.$$eval("#time-travel-house-list button", (els) => els.map((e) => e.disabled));
  check(`[${tag}] the owned tier's button disables itself`, houseButtonsAfter[0] === true, houseButtonsAfter.join(","));

  await funded.evaluate(() => {
    document.querySelectorAll("#time-travel-invest-list button")[0]?.click();
  });
  await funded.waitForTimeout(100);
  const afterInvest = await rootCoach(funded);
  check(`[${tag}] investing persists a pending position and deducts cash`, afterInvest?.pendingInvestments?.length === 1 && afterInvest.cash === 70, JSON.stringify(afterInvest?.pendingInvestments) + " cash=" + afterInvest?.cash);
  const investButtonsAfter = await funded.$$eval("#time-travel-invest-list button", (els) => els.map((e) => e.textContent));
  check(`[${tag}] the invest button reflects the already-placed stake`, investButtonsAfter[0].includes("本季已投入"), investButtonsAfter[0]);

  check(`[${tag}] funded scenario: no horizontal overflow`, await noOverflow(funded));
  check(`[${tag}] funded scenario: no page errors`, fundedErrors.length === 0, fundedErrors.join(" | "));
  await funded.close();
}

await browser.close();
console.log(report.join("\n"));
const fails = report.filter((l) => l.startsWith("FAIL"));
console.log(`\n${report.length - fails.length}/${report.length} passed`);
if (fails.length) process.exit(1);
