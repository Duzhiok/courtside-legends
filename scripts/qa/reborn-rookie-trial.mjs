// Alpha Playability smoke (one real player workflow, desktop + mobile):
//  A. a HISTORICAL bench rookie (gets ~0 minutes) trains for a week -> the header shows the coach's ladder, a game he
//     did not play says so and takes no trust, and the week's last game pays a visible practice-day XP line.
//  B. a FICTIONAL (generated) rookie gets shots up AND some go in (regression: they used to be 0-for-everything).
// Scores are live-random, so only the rules are asserted, never a score. Seed pins identity + schedule.
// Usage: node scripts/qa/reborn-rookie-trial.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-rookie-trial";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=career2-qa-rivalry-2`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => "");

async function playOne(page) {
  const before = await text(page, ".reborn-report");
  await page.click("[data-play]");
  const started = Date.now();
  while (Date.now() - started < 120000) {
    if (await visible(page, ".reborn-takeover-dialog")) await page.click('.reborn-takeover-option[data-option="pass"]');
    const now = await text(page, ".reborn-report");
    if (now && now !== before && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => false))) return now;
    await page.waitForTimeout(300);
  }
  return null;
}

async function start(page, destiny) {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector(".reborn-create", { timeout: 20000 });
  await page.click(`[data-reborn-destiny="${destiny}"]`);
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector("[data-play]", { timeout: 20000 });
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  // ---------------- A. historical bench rookie
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await start(page, "historical");
  const ladder = await text(page, '[data-testid="trust-ladder"]');
  check(`[${tag}] header shows the coach's ladder: next role, gap, what moves it`, /下一档「.+」：信任 \d+（还差 \d+）.*每周完成训练 \+\d/.test(ladder), ladder);
  await page.screenshot({ path: `${OUT}/${tag}-A-start.png`, timeout: 20000 }).catch(() => {});
  await page.click('[data-train="defense"]');
  const trust0 = Number((await text(page, ".reborn-identity")).match(/教练信任 (\d+)/)?.[1]);
  let sawUnplayed = false;
  let sawPractice = false;
  let trustMin = trust0;
  let games = 0;
  for (let i = 0; i < 4; i += 1) {
    const report = await playOne(page);
    if (!report) break;
    games += 1;
    const minutes = Number(report.match(/你的数据：([\d.]+) 分钟/)?.[1]);
    if (minutes < 3) {
      sawUnplayed = true;
      check(`[${tag}] game ${i + 1} (${minutes} min): says he wasn't judged, no trust lost`, /没有上场，教练没法评价你，信任不扣/.test(report) && !/表现 .*分.*预期/.test(report), report.slice(0, 150));
    }
    if (/训练日：不上场也在进步，本周训练 \+\d+ 经验/.test(report)) sawPractice = true;
    trustMin = Math.min(trustMin, Number((await text(page, ".reborn-identity")).match(/教练信任 (\d+)/)?.[1]));
  }
  check(`[${tag}] four games settled`, games === 4, String(games));
  check(`[${tag}] at least one game he barely played was explained`, sawUnplayed);
  check(`[${tag}] the week's last game showed the practice-day XP line`, sawPractice);
  check(`[${tag}] trust never dropped below where he started (a diligent unused rookie is not punished)`, trustMin >= trust0, `start ${trust0}, min ${trustMin}`);
  const trust1 = Number((await text(page, ".reborn-identity")).match(/教练信任 (\d+)/)?.[1]);
  check(`[${tag}] after a trained week trust moved UP (+2)`, trust1 > trust0, `${trust0} -> ${trust1}`);
  await page.screenshot({ path: `${OUT}/${tag}-A-after.png`, timeout: 20000 }).catch(() => {});
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();

  // ---------------- B. fictional (generated) rookie scores
  const page2 = await browser.newPage({ viewport: { width, height } });
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(e.message));
  page2.on("dialog", (d) => d.accept());
  await start(page2, "fictional");
  await page2.click('[data-train="defense"]').catch(() => {});
  let pts = 0;
  let mins = 0;
  for (let i = 0; i < 4; i += 1) {
    const report = await playOne(page2);
    if (!report) break;
    pts += Number(report.match(/分钟 · (\d+) 分/)?.[1] || 0);
    mins += Number(report.match(/你的数据：([\d.]+) 分钟/)?.[1] || 0);
  }
  check(`[${tag}] fictional rookie: gets minutes and scores in 4 games`, mins > 0 && pts > 0, `${mins} min, ${pts} pts`);
  check(`[${tag}] fictional: no page errors`, errors2.length === 0, errors2.slice(0, 2).join(" | "));
  await page2.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
