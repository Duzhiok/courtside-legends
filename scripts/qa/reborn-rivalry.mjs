// Browser smoke for Career 2.0 decision 2: rivalries in Player Reborn.
// Real flow, real engine: create a historical identity -> play a game ->
// challenge someone you really faced -> rivals panel + timeline -> keep
// playing until his team comes up -> the pre-game rivalry card shows ->
// play it -> the head-to-head line appears. Desktop 1440 + mobile 390.
// The takeover dialog may pop mid-game; the script passes on it.
// Usage: node scripts/qa/reborn-rivalry.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-rivalry";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);

async function playOne(page) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  const started = Date.now();
  while (Date.now() - started < 60000) {
    if (await visible(page, ".reborn-takeover-overlay")) await page.click('.reborn-takeover-option[data-option="pass"]');
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    if (now && now !== before && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => false))) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

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
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector(".reborn-create", { timeout: 20000 });
  await page.click('[data-reborn-destiny="historical"]');
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  if (await visible(page, "[data-train]")) await page.click('[data-train="defense"]');

  check(`[${tag}] first game settles`, await playOne(page));
  const buttons = await page.$$eval("[data-rival-challenge]", (els) => els.map((el) => ({ bref: el.dataset.rivalChallenge, text: el.textContent.trim() })));
  check(`[${tag}] post-game offers challenges against real opponents`, buttons.length > 0 && buttons.length <= 3, buttons.map((b) => b.text).join(" | "));
  await shoot(page, `${OUT}/${tag}-challenge-offer.png`);
  const target = buttons[0];
  await page.click(`[data-rival-challenge="${target.bref}"]`);
  await page.waitForSelector('[data-testid="rivals-panel"]', { timeout: 5000 });
  const panel = await page.$eval('[data-testid="rivals-panel"]', (el) => el.textContent);
  check(`[${tag}] rivals panel lists the challenged player`, panel.includes("你下的战书"), panel.slice(0, 120));
  check(`[${tag}] timeline records the rivalry`, (await page.$eval(".reborn-timeline", (el) => el.textContent).catch(() => "")).includes("宿敌诞生"));
  check(`[${tag}] the challenged player is not offered again`, !(await page.$(`[data-rival-challenge="${target.bref}"]`)));

  // Keep playing until his team is next (the pre-game card), then play it.
  let pregame = false;
  let stopReason = "40 games without his team";
  for (let i = 0; i < 40 && !pregame; i += 1) {
    if (await visible(page, '[data-testid="rivalry-pregame"]')) { pregame = true; break; }
    if (await visible(page, "[data-train]")) await page.click('[data-train="defense"]');
    if (!(await visible(page, "[data-play]"))) { stopReason = `no play button after ${i} games`; break; }
    if (!(await playOne(page))) { stopReason = `game ${i + 2} did not settle`; break; }
  }
  check(`[${tag}] pre-game rivalry card appears before his team`, pregame, pregame ? "" : stopReason);
  if (pregame) {
    const card = await page.$eval('[data-testid="rivalry-pregame"]', (el) => el.textContent);
    check(`[${tag}] card shows H2H and the wider-window note, no rating promise`, /交手 \d+ 次/.test(card) && card.includes("接管窗口") && !/OVR|命中率\s*\+/.test(card), card.slice(0, 160));
    await shoot(page, `${OUT}/${tag}-pregame.png`);
    check(`[${tag}] rivalry game settles`, await playOne(page));
    const report = await page.$eval('[data-testid="rivalry-report"]', (el) => el.textContent).catch(() => "");
    // A meeting needs both of you on court; otherwise the report must say why (never silent).
    check(`[${tag}] after the game: an H2H line, or an explicit "not a meeting" reason`, /宿敌对决 vs|不算/.test(report), report.slice(0, 160));
    await shoot(page, `${OUT}/${tag}-after.png`);
  }
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
