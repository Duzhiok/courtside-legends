// Opponent scouting + counter-plans in the season hub, real browser: panel renders for the next game, tabs only PREVIEW
// (nothing saved), "Apply plan" is the single write, no overflow, no page errors.
// Usage: node scripts/qa/matchup-scout.mjs /tmp/cls-qa/scout [http://127.0.0.1:5193/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/scout";
const BASE = process.argv[3] || "http://127.0.0.1:5193/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
let fails = 0;
const check = (l, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`); };
const BREFS = ["doncilu01", "hardati02", "dragigo01", "millspa01", "mutomdi01", "curryst01", "goberru01", "thompkl01", "duncati01", "jordami01"];
const seed = (page) => page.evaluate(async (brefs) => {
  const { PLAYERS, overall } = await import("/js/data/players.js");
  const { createAccount, getAccount, saveAccount, setActiveAccountId } = await import("/js/data/account.js");
  const ids = brefs.map((b) => PLAYERS.filter((p) => p.bref === b).sort((x, y) => overall(y) - overall(x))[0]?.id).filter(Boolean);
  const a = createAccount("QA Scout"); const acc = getAccount(a.id);
  acc.playerIds = ids; acc.gold = 500; acc.onboardingDone = true; acc.welcomeGranted = true; saveAccount(acc); setActiveAccountId(a.id);
}, BREFS);
const slot = (page) => page.evaluate(() => localStorage.getItem("cls_myteam_season_v1") || "");

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" }); await homeActive(page);
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page);
  await seed(page); await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page);
  await page.click('.home-tab[data-category="players"]');
  await page.waitForSelector("#my-team-clubhouse-root .mti", { state: "visible", timeout: 15000 });
  await page.getByText(/开始我的第一个赛季|Start my first season/).first().click();
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 8000 }); await page.click("#app-confirm-accept");
  await page.waitForSelector("#screen-season.active #season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.waitForSelector("#season-next-scout:not([hidden]) details", { timeout: 15000 });
  check(`[${label}] scouting panel appears under the next game`, true);
  await page.click("#season-next-scout summary");
  const threats = await page.$$eval(".msc-threats li", (l) => l.length);
  check(`[${label}] 1-2 named threats with a source`, threats >= 1 && threats <= 2 && (await page.$$eval(".msc-from", (n) => n.every((x) => x.textContent.length > 8))));
  const tabs = await page.$$eval('[data-act="scout-plan"]', (b) => b.map((x) => x.dataset.plan));
  check(`[${label}] four plan tabs`, tabs.join() === "contain,exhaust,spacing,outscore", tabs.join());
  const saved0 = await slot(page);
  const seen = new Set();
  for (const p of tabs) { await page.click(`[data-act="scout-plan"][data-plan="${p}"]`); seen.add(await page.$eval(".msc-plan", (e) => e.textContent.slice(0, 120))); }
  check(`[${label}] plans read differently`, seen.size >= 3, `${seen.size} distinct`);
  check(`[${label}] three separate readings, no win rate`, (await page.$$(".msc-chip")).length === 3 && !/胜率|win prob/i.test(await page.$eval(".msc-plan", (e) => e.textContent)));
  check(`[${label}] previewing every tab saved nothing`, (await slot(page)) === saved0);
  check(`[${label}] no horizontal overflow`, await noOverflow(page));
  const box = await page.$eval('[data-act="scout-keep"]', (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return { w: r.width, h: r.height, x: r.x, color: c.color, bg: c.backgroundColor }; });
  check(`[${label}] "Keep current" is visible and readable`, box.w > 40 && box.h >= 40 && box.x >= 0 && box.color === 'rgb(22, 58, 41)', JSON.stringify(box));
  await shoot(page, `${OUT}/${label}.png`);
  await page.click('[data-act="scout-plan"][data-plan="exhaust"]');
  await page.click('[data-act="scout-apply"]');
  await page.waitForFunction(() => /已应用|Applied/.test(document.querySelector(".msc")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] Apply writes (and says so)`, /已应用|Applied/.test(await page.$eval(".msc", (e) => e.textContent)) && (await slot(page)) !== saved0);
  check(`[${label}] no page errors`, errors.length === 0, errors.join("|").slice(0, 160));
  await page.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
