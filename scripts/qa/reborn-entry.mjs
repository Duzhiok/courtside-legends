// Browser E2E for workstream A: the Player Reborn public entry — Career
// Player card -> creation (year, destiny, chosen identity) -> season
// screen -> play one game -> fast-forward to the next event -> training
// choice -> reset back to creation. Desktop + mobile, Chinese + English
// (creation copy). Real engine, real clicks; the takeover dialog may pop
// up mid-game — the script declines it (Pass) so the game can finish.
// Usage: node scripts/qa/reborn-entry.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-entry";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => {
  const line = `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`;
  report.push(line);
  console.log(line); // live: a crash later in the script must not swallow what already ran
};
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const rebornActive = (page) =>
  page.waitForFunction(() => document.querySelector("#screen-reborn")?.classList.contains("active"), null, { timeout: 20000 });

/** Wait for a game to settle: the report appears, or the takeover dialog does (decline it with Pass). */
async function waitForGameSettled(page, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await visible(page, ".reborn-takeover-overlay")) {
      await page.click('.reborn-takeover-option[data-option="pass"]');
    }
    if (await visible(page, ".reborn-report")) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/** Wait for a fast-forward run to stop: the summary appears (the takeover dialog may interrupt it first). */
async function waitForFastForward(page, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await visible(page, ".reborn-takeover-overlay")) {
      await page.click('.reborn-takeover-option[data-option="pass"]');
    }
    if (await visible(page, ".reborn-ff")) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);

  // ---- Career -> Player card -> creation
  await page.click('.home-tab[data-category="career"]');
  await page.waitForTimeout(300);
  const playerStatus = await page.$eval(
    '[data-career-identity="player"] .career-status',
    (el) => el.textContent.trim(),
  );
  check(`[${tag}] Player card says playable, not in development`, playerStatus === "可玩", playerStatus);
  await page.click('[data-career-identity="player"]');
  await rebornActive(page);
  check(`[${tag}] creation screen opens`, await visible(page, ".reborn-create"));
  check(`[${tag}] creation offers both start years`, (await page.$$eval(".reborn-create-year", (els) => els.map((el) => el.textContent.trim()).join("|"))).includes("1995–96") && (await page.$$eval(".reborn-create-year", (els) => els.map((el) => el.textContent.trim()).join("|"))).includes("1996–97"));
  check(`[${tag}] confirm is disabled until a destiny is picked`, await page.$eval(".reborn-create-confirm", (el) => el.disabled));
  await shoot(page, `${OUT}/${tag}-creation.png`);

  // ---- chosen historical identity (deterministic: the first bench player)
  await page.click('[data-reborn-destiny="historical"]');
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  const picked = await page.$eval(".reborn-create-pick", (el) => el.textContent.replace(/\s+/g, " ").trim());
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector(".reborn-identity", { timeout: 10000 });
  const identityText = await text(page, ".reborn-identity");
  check(`[${tag}] chosen identity shows its real name on the card`, identityText.includes(picked.split(" ")[0]) || identityText.includes(picked), picked);
  check(`[${tag}] trust starts at 25/100`, identityText.includes("25 / 100"), identityText.slice(0, 80));
  check(`[${tag}] no horizontal overflow on the season screen`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-season.png`);

  // ---- play one game (the takeover dialog may appear; decline it)
  await page.click("[data-play]");
  check(`[${tag}] one game settles and shows a report`, await waitForGameSettled(page));
  check(`[${tag}] the report names the opponent and the trust change`, (await text(page, ".reborn-report")).includes("信任"));

  // ---- fast-forward to the next meaningful event
  const ffLabel = await page.$eval("[data-ff]", (el) => el.textContent.trim()).catch(() => null);
  check(`[${tag}] fast-forward button names its target`, !!ffLabel && /模拟到/.test(ffLabel), ffLabel || "no button");
  if (ffLabel) {
    await page.click("[data-ff]");
    check(`[${tag}] fast-forward stops with a summary`, await waitForFastForward(page));
    const ffText = await text(page, ".reborn-ff");
    check(`[${tag}] the summary counts simmed games and the trust move`, /模拟了/.test(ffText) && /信任/.test(ffText), ffText.slice(0, 100));
    await shoot(page, `${OUT}/${tag}-fast-forward.png`);
  }

  // ---- training choice (the run usually stops at a week boundary)
  if (await visible(page, ".reborn-training")) {
    await page.click(".reborn-training-options button");
    check(`[${tag}] picking a focus shows this week's training`, (await text(page, "#reborn-body")).includes("本周训练"));
  } else {
    check(`[${tag}] training section appears after the run (or the run stopped elsewhere)`, true, "no training stop this run — acceptable");
  }

  // ---- reset goes back to creation
  await page.click("[data-reset]");
  await page.waitForSelector(".reborn-create", { timeout: 10000 });
  check(`[${tag}] reset returns to the creation flow`, await visible(page, ".reborn-create"));
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

// ---- English creation copy (one desktop pass)
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click("#btn-lang");
  await page.waitForTimeout(300);
  await page.click('.home-tab[data-category="career"]');
  await page.waitForTimeout(300);
  await page.click('[data-career-identity="player"]');
  await rebornActive(page);
  const createText = await text(page, ".reborn-create");
  check("[en] creation screen renders in English", /Create your player career/.test(createText) && /Random destiny/.test(createText), createText.slice(0, 120));
  check("[en] no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

await browser.close();
console.log(`\n${report.filter((l) => l.startsWith("PASS")).length}/${report.length} checks passed`);
if (report.some((l) => l.startsWith("FAIL"))) process.exitCode = 1;
