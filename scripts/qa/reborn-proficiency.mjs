// Browser smoke for Skills M2: a move gains proficiency from REAL use, once per game, and the level shows on the career screen.
// Real flow: signed-in account -> new historical Reborn -> an awakened, equipped dream_shake with 98 XP (2 short of Lv.2) -> resume ->
// play a game in Auto mode (the autopilot fires the move) -> the screen shows more XP, Lv.2 and the +1% bonus -> a reload keeps the XP
// (nothing is settled twice) -> the XP rises by the engine's own count (uses/makes in the report), not by a guess.
// Desktop 1440 + mobile 390. Usage: node scripts/qa/reborn-proficiency.mjs [outDir] [baseUrl] [zh|en]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-proficiency";
const BASE = process.argv[3] || "http://127.0.0.1:5191/";
const LANG = process.argv[4] === "en" ? "en" : "zh";
const urlFor = (n) => `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=proficiency-qa-${n}`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const prof = (page) => page.$eval("[data-skill=dream_shake] [data-testid=proficiency]", (el) => ({ text: el.textContent.trim(), level: Number(el.dataset.level) })).catch(() => null);
const xpOf = (p) => Number((p?.text.match(/(\d+)\s*(?:经验|XP)/) || [])[1]);
const usage = (page) => page.$eval("[data-skill=dream_shake]", (el) => el.textContent).catch(() => "");

async function playOne(page) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  const started = Date.now();
  while (Date.now() - started < 120000) {
    await page.evaluate(() => {
      const o = [...document.querySelectorAll("[data-option]")].find((x) => !x.hidden && x.getClientRects().length > 0);
      o?.click();
    });
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    const btn = await page.$("[data-play]");
    if (now && now !== before && (!btn || !(await btn.isDisabled()))) return;
    await page.waitForTimeout(150);
  }
  throw new Error("game did not finish");
}

const browser = await chromium.launch({ executablePath: EXE });

async function resume(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector("[data-play]", { timeout: 20000 });
}

async function session(width, height, tag, seedNo) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(urlFor(seedNo), { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("courtside.lang", l);
    localStorage.setItem("cls_guide_first_run_v1", "seen");
    const account = { id: "qa-prof", name: "QA", createdAt: Date.now(), playerIds: [], coachIds: [], cardMods: {}, coachId: null, tacticId: "balanced", lastDailyDraw: null, drawHistory: [] };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", "qa-prof");
  }, LANG);
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
  await page.evaluate(() => {
    const root = JSON.parse(localStorage.getItem("cls_root_v3"));
    const r = root.reborn;
    const year = r.season?.year || 1997;
    r.player.awakening = { version: 1, season: year, form: [], ready: [], awakened: [{ skillId: "dream_shake", source: "awakened", game: 1, season: year, evidence: {} }] };
    r.player.loadout = { version: 1, equipped: ["dream_shake"], known: ["dream_shake"], stats: {}, xp: { dream_shake: 98 }, settled: [] };
    localStorage.setItem("cls_root_v3", JSON.stringify(root));
  });
  await resume(page);
  await page.click('.reborn-identity [data-mode="auto"]').catch(() => {});
  const out = { errors, start: await prof(page) };
  await page.locator("[data-testid=loadout]").scrollIntoViewIfNeeded();
  out.overflow = await noOverflow(page);
  for (let g = 0; g < 6; g++) {
    await playOne(page);
    const p = await prof(page);
    out.after = p;
    out.usage = await usage(page);
    if (xpOf(p) > 98) break;
  }
  await page.locator("[data-testid=loadout]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${tag}-leveled.png`, fullPage: false });
  await resume(page);
  out.reloaded = await prof(page);
  await page.close();
  return out;
}

for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  let r = null;
  let seedNo = 3;
  for (; seedNo < 8; seedNo++) {
    r = await session(width, height, tag, seedNo);
    if (xpOf(r.after) > 98) break;
    console.log(`note ${tag}: seed ${seedNo} never fired the move (a bench rookie may not play) - trying the next seed`);
  }
  check(`${tag}: starts at Lv.1 with 98 XP and the rule line`, r.start?.level === 1 && xpOf(r.start) === 98, r.start?.text);
  check(`${tag}: real use added XP`, xpOf(r.after) > 98, `${r.start?.text} -> ${r.after?.text}`);
  check(`${tag}: it crossed 100 XP so it is now Lv.2 (${LANG === "en" ? "Proficient" : "熟练"}) with the +1% bonus`, r.after?.level === 2 && (LANG === "en" ? /Proficient/.test(r.after.text) && /\+1% to make/.test(r.after.text) : /熟练/.test(r.after.text) && /命中 \+1%/.test(r.after.text)), r.after?.text);
  const counts = r.usage.match(LANG === "en" ? /Used (\d+)× · (\d+) made/ : /使用 (\d+) 次 · 命中 (\d+)/);
  const expected = counts ? Math.min(6, 2 * Number(counts[1]) + Number(counts[2])) : NaN;
  check(`${tag}: the XP gained is EXACTLY the engine's count (min(6, 2 x uses + makes))`, xpOf(r.after) - 98 === expected, `gained ${xpOf(r.after) - 98}, uses/makes on screen -> expected ${expected}: ${r.usage.replace(/\s+/g, " ").slice(0, 110)}`);
  check(`${tag}: a reload keeps the XP and settles nothing twice`, xpOf(r.reloaded) === xpOf(r.after) && r.reloaded?.level === r.after?.level, `${r.after?.text} / ${r.reloaded?.text}`);
  check(`${tag}: panel fits the screen`, r.overflow === true);
  if (LANG === "en") check(`${tag}: English shows no Chinese in the proficiency line`, !/[\u4e00-\u9fff]/.test(r.after?.text || ""));
  check(`${tag}: no page errors`, r.errors.length === 0, r.errors.join(" | "));
}
await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
