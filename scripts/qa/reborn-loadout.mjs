// Browser smoke for Skills M1c: the signature-move collection and its three slots, played the way a player does it.
// Real flow: signed-in account -> new historical Reborn -> the run is given three AWAKENED moves (what M1a awards) -> resume ->
// REAL clicks on Unequip / Equip (not DOM shortcuts) -> the panel and the slot count follow -> reload keeps the loadout ->
// in Full control every signature offer names only what is still equipped -> with nothing equipped no signature option appears.
// Desktop 1440 + mobile 390. Usage: node scripts/qa/reborn-loadout.mjs [outDir] [baseUrl] [zh|en]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-loadout";
const BASE = process.argv[3] || "http://127.0.0.1:5191/";
const LANG = process.argv[4] === "en" ? "en" : "zh";
const urlFor = (n) => `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=loadout-qa-${n}`;
const NAME = { dream_shake: LANG === "en" ? "Dream Shake" : "梦幻脚步", fadeaway: LANG === "en" ? "Fadeaway Killer" : "后仰杀手", stepback: LANG === "en" ? "Step-Back" : "后撤步" };
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const panel = (page) => page.$eval("[data-testid=loadout]", (el) => ({
  head: el.querySelector("h3").textContent,
  rows: [...el.querySelectorAll("li[data-skill]")].map((li) => ({ id: li.dataset.skill, on: li.dataset.equipped === "true", text: li.textContent, disabled: !!li.querySelector("button")?.disabled })),
  empty: el.querySelectorAll("[data-empty]").length,
})).catch(() => null);

/** Answer whatever is asked; report what the signature option said, if it was offered. Returns { offered: [moveName...], lines }. */
async function playOne(page) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  const offered = [];
  const started = Date.now();
  while (Date.now() - started < 120000) {
    const seen = await page.evaluate(() => {
      const opts = [...document.querySelectorAll("[data-option]")].filter((o) => !o.hidden && o.getClientRects().length > 0);
      if (!opts.length) return null;
      const sig = opts.find((o) => o.dataset.option === "signature");
      const root = (sig || opts[0]).closest(".reborn-agency, .reborn-bubble, .reborn-takeover-dialog") || (sig || opts[0]).parentElement;
      const out = { signature: !!sig, text: root.textContent };
      (opts.find((o) => o.dataset.option !== "signature") || opts[0]).click();
      return out;
    });
    if (seen?.signature) offered.push(seen.text);
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    const playBtn = await page.$("[data-play]");
    if (now && now !== before && (!playBtn || !(await playBtn.isDisabled()))) {
      return { offered, lines: await page.$$eval("[data-testid=signature-feedback]", (els) => els.map((e) => e.textContent)) };
    }
    await page.waitForTimeout(150);
  }
  throw new Error("game did not finish");
}

const browser = await chromium.launch({ executablePath: EXE });

async function resume(page, seedNo) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  return seedNo;
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
    const account = { id: "qa-loadout", name: "QA", createdAt: Date.now(), playerIds: [], coachIds: [], cardMods: {}, coachId: null, tacticId: "balanced", lastDailyDraw: null, drawHistory: [] };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", "qa-loadout");
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
    r.player.awakening = { version: 1, season: year, form: [], ready: [], awakened: ["dream_shake", "fadeaway", "stepback"].map((skillId, i) => ({ skillId, source: "awakened", game: i + 1, season: year, evidence: {} })) };
    localStorage.setItem("cls_root_v3", JSON.stringify(root));
  });
  await resume(page, seedNo);
  const out = { errors };

  out.start = await panel(page);
  if (out.start) { await page.locator("[data-testid=loadout]").scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/${tag}-start.png`, fullPage: false }); out.overflowStart = await noOverflow(page); }

  // REAL clicks: take off two, keep stepback.
  await page.click('[data-loadout="unequip"][data-skill="dream_shake"]');
  await page.click('[data-loadout="unequip"][data-skill="fadeaway"]');
  out.afterUnequip = await panel(page);
  await page.screenshot({ path: `${OUT}/${tag}-two-off.png`, fullPage: false });
  await resume(page, seedNo); // a reload keeps the choice
  out.afterReload = await panel(page);

  // Full control: every signature offer names only stepback.
  await page.click('.reborn-identity [data-mode="full"]');
  out.offers = [];
  out.reportLines = [];
  for (let g = 0; g < 40 && out.offers.length < 2; g++) {
    if (!(await page.$("[data-play]:not([disabled])"))) break;
    const one = await playOne(page);
    out.offers.push(...one.offered);
    out.reportLines.push(...one.lines);
  }

  // Put one back, then take everything off: no signature option may appear.
  await page.click('[data-loadout="equip"][data-skill="dream_shake"]');
  out.afterEquip = await panel(page);
  for (const id of ["dream_shake", "stepback"]) await page.click(`[data-loadout="unequip"][data-skill="${id}"]`);
  out.none = await panel(page);
  out.noneOffers = [];
  out.noneLines = [];
  for (let g = 0; g < 8 && !(await page.$("[data-play][disabled]")); g++) {
    if (!(await page.$("[data-play]:not([disabled])"))) break;
    const one = await playOne(page);
    out.noneOffers.push(...one.offered);
    out.noneLines.push(...one.lines);
  }
  await page.close();
  return out;
}

for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  let r = null;
  let seedNo = 3;
  for (; seedNo < 8; seedNo++) {
    r = await session(width, height, tag, seedNo);
    if (r.offers.length >= 1) break;
    console.log(`note ${tag}: seed ${seedNo} never offered the move (a bench rookie may not play) - trying the next seed`);
  }
  const heads = (p) => (p ? p.head.replace(/\s+/g, " ") : "none");
  check(`${tag}: the collection panel shows 3 owned moves and 3/3 equipped`, r.start?.rows.length === 3 && /3\/3/.test(r.start.head) && r.start.rows.every((x) => x.on), heads(r.start));
  check(`${tag}: it names each move, its type, its source and a status (no panel text in the wrong language)`, r.start && r.start.rows.every((x) => x.text.includes(NAME[x.id])) && (LANG === "en" ? !/[\u4e00-\u9fff]/.test(r.start.rows.map((x) => x.text).join("")) : true), r.start?.rows[0]?.text.replace(/\s+/g, " ").slice(0, 110));
  check(`${tag}: a never-used move says "no uses on record", not zero`, r.start?.rows.every((x) => (LANG === "en" ? /No uses on record yet/ : /还没有使用记录/).test(x.text)) ?? false);
  check(`${tag}: panel fits the screen`, r.overflowStart === true);
  check(`${tag}: real clicks on Unequip: 1/3 equipped and two free slots`, /1\/3/.test(r.afterUnequip?.head || "") && r.afterUnequip.empty === 2 && r.afterUnequip.rows.filter((x) => x.on).map((x) => x.id).join() === "stepback", heads(r.afterUnequip));
  check(`${tag}: a reload keeps the loadout`, /1\/3/.test(r.afterReload?.head || "") && r.afterReload.rows.find((x) => x.id === "stepback")?.on === true, heads(r.afterReload));
  check(`${tag}: in Full control the move offered is only the equipped one`, r.offers.length >= 1 && r.offers.every((t) => t.includes(NAME.stepback) && !t.includes(NAME.dream_shake) && !t.includes(NAME.fadeaway)), `${r.offers.length} offers`);
  check(`${tag}: re-equipping by click fills a slot (2/3)`, /2\/3/.test(r.afterEquip?.head || ""), heads(r.afterEquip));
  check(`${tag}: nothing equipped: 0/3 and three empty slots`, /0\/3/.test(r.none?.head || "") && r.none.empty === 3, heads(r.none));
  check(`${tag}: nothing equipped: no signature option is offered in a game`, r.noneOffers.length === 0, `${r.noneOffers.length} offers`);
  check(`${tag}: nothing equipped: the report has no signature line`, r.noneLines.length === 0, r.noneLines.join(" | ").slice(0, 100));
  check(`${tag}: no page errors`, r.errors.length === 0, r.errors.join(" | "));
}
await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
