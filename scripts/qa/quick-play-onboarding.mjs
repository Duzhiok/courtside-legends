// Browser E2E for M2a (P0B quick play + first-game tip).
// Guest path: home → Play Now → game, timed; the one-time tip shows on the first game only and
// stays dismissed after a reload; 再来一局 loops straight into a new Play Now game (no setup screen)
// three times; desktop + phone; no overflow, no page errors; EN mode tip has no Chinese.
// Usage: node scripts/qa/quick-play-onboarding.mjs [outDir] [baseUrl]
// NOTE: needs a Mac (the executablePath below is a Mac Playwright path).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot } from "./lib/page.mjs";
import { fastForwardToResult } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/quick-play-onboarding";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

const browser = await chromium.launch({ executablePath: EXE });
const isActive = (page, id) => page.evaluate((s) => !!document.querySelector(`#${s}`)?.classList.contains("active"), id);
const tipVisible = (page) => page.evaluate(() => {
  const el = document.querySelector("#play-now-tip");
  return !!el && !el.hidden && el.getBoundingClientRect().height > 0;
});

async function freshHome(width, height, lang = null) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => {
    localStorage.clear();
    sessionStorage.clear();
    if (l) localStorage.setItem("courtside.lang", l);
  }, lang);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  return { page, errors };
}

for (const [width, height, size] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const { page, errors } = await freshHome(width, height);
  await page.clock.install();

  const t0 = Date.now();
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active", { timeout: 15000 });
  const ms = Date.now() - t0;
  check(`[${size}] guest reaches a live game from home in ≤15s`, ms <= 15000, `${ms}ms, 1 click`);
  check(`[${size}] first Play Now game shows the one-time tip`, await tipVisible(page));
  check(`[${size}] game screen has no horizontal overflow with the tip`, await noOverflow(page));
  await shoot(page, `${OUT}/${size}-tip.png`);

  await page.click("#btn-play-now-tip-ok");
  check(`[${size}] 知道了 hides the tip`, !(await tipVisible(page)));

  for (let round = 1; round <= 3; round++) {
    const ended = await fastForwardToResult(page);
    check(`[${size}] game ${round} reaches the result screen`, ended);
    if (!ended) break;
    await page.click("#btn-again");
    await page.waitForFunction(
      () => ["screen-game", "screen-setup", "screen-home"].some((id) => document.querySelector(`#${id}`)?.classList.contains("active")),
      null,
      { timeout: 15000 },
    );
    const straight = await isActive(page, "screen-game");
    check(`[${size}] retry ${round}: 再来一局 goes straight into a new game (no setup/home detour)`, straight);
    if (!straight) break;
    check(`[${size}] retry ${round}: dismissed tip stays hidden`, !(await tipVisible(page)));
  }

  // Reload: dismissal must survive (it lives in localStorage, not just memory).
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active", { timeout: 15000 });
  check(`[${size}] after reload the dismissed tip does not come back`, !(await tipVisible(page)));

  // Another mode's game must never show the Play Now tip, even for a brand-new visitor.
  await page.evaluate(() => localStorage.removeItem("cls_tip_play_now_v1"));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="quick"]')?.click());
  await page.waitForSelector("#screen-setup.active", { timeout: 15000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 15000 });
  check(`[${size}] the Auto Match (setup) path never shows the Play Now tip`, !(await tipVisible(page)));

  check(`[${size}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

{
  const { page, errors } = await freshHome(390, 844, "en");
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active", { timeout: 15000 });
  const tipText = await page.$eval("#play-now-tip", (el) => el.textContent.replace(/\s+/g, " ").trim());
  check("[en] tip is visible on the first game", await tipVisible(page));
  check("[en] tip copy has no Chinese", !CJK.test(tipText), tipText);
  await shoot(page, `${OUT}/en-tip.png`);
  check("[en] no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join("\n") + "\n");
const fails = report.filter((r) => r.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - fails.length}/${report.length} passed`);
process.exit(fails.length ? 1 : 0);
