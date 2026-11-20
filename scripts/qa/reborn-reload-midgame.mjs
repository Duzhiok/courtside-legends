// Career 2.0 E2E: reloading in the MIDDLE of a Reborn game (also while the takeover dialog is open).
// Invariants after every interrupted game, and after replaying it:
//   * the season log has consecutive game numbers and NO duplicate gameId (an interrupted game is logged once or not at all);
//   * a reload never settles twice: the log grows by 0 or 1 across the reload, then by exactly 1 per finished click;
//   * the account's rivalry / legacy event ids stay unique, and no fragment is paid twice for one gameId.
// Reload delays vary (0.4s, 1.5s, 4s) so different phases of the game are hit. Schedule is seed-pinned; scores are live.
// Usage: node scripts/qa/reborn-reload-midgame.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reload-midgame";
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

const state = (page) => page.evaluate(async () => {
  const root = (await import("/js/data/saveRoot.js")).readRootSave(localStorage);
  const account = await import("/js/data/account.js");
  const acc = account.getAccount();
  const log = (root?.reborn?.player?.seasonLog || []).filter((e) => !e.po);
  return {
    log: log.map((e) => ({ game: e.game, gameId: e.gameId })),
    fragments: root?.reborn?.player?.fragments || null,
    legacy: (acc?.careerRelationships?.legacy || []).map((e) => e.id),
  };
});

async function enter(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector("[data-play]", { timeout: 20000 });
}

/** Finish the pending game (passing any takeover dialog); true when the log grew. */
async function finishGame(page, before) {
  if (await visible(page, "[data-train]")) await page.click('[data-train="defense"]');
  await page.click("[data-play]");
  const started = Date.now();
  while (Date.now() - started < 120000) {
    if (await visible(page, ".reborn-takeover-dialog")) await page.click('.reborn-takeover-option[data-option="pass"]');
    if ((await state(page)).log.length > before && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => false))) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

const unique = (xs) => new Set(xs).size === xs.length;
const consecutive = (log) => log.every((e, i) => e.game === i + 1);

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  localStorage.clear();
  const account = await import("/js/data/account.js");
  account.setActiveAccountId(account.createAccount("QA-reload").id);
});
await page.reload({ waitUntil: "domcontentloaded" });
await homeActive(page);
await page.click('.home-tab[data-category="career"]');
await page.click('[data-career-identity="player"]');
await page.waitForSelector(".reborn-create");
await page.click('[data-reborn-destiny="historical"]');
await page.click(".reborn-create-pick");
await page.click(".reborn-create-confirm");
await page.waitForSelector("[data-play]");
check("game 1 settles", await finishGame(page, 0));
// A rival makes the takeover window wider in his games, so the dialog really shows up later.
await (await page.$("[data-rival-challenge]"))?.click();

for (const delay of [400, 1500, 4000]) {
  const tag = `reload @${delay}ms`;
  const before = (await state(page)).log.length;
  if (await visible(page, "[data-train]")) await page.click('[data-train="defense"]');
  await page.click("[data-play]");
  await page.waitForTimeout(delay);
  const sawDialog = await visible(page, ".reborn-takeover-dialog");
  await enter(page); // the reload, in the middle of the game
  const mid = await state(page);
  console.log(`NOTE [${tag}] takeover dialog open at reload: ${sawDialog}; log ${before} -> ${mid.log.length}`);
  check(`[${tag}] the interrupted game is logged at most once`, mid.log.length === before || mid.log.length === before + 1, `${before} -> ${mid.log.length}`);
  check(`[${tag}] game numbers consecutive, no duplicate gameId`, consecutive(mid.log) && unique(mid.log.map((e) => e.gameId)));
  check(`[${tag}] page is playable again after the reload`, await visible(page, "[data-play]"));
  const ok = await finishGame(page, mid.log.length);
  const after = await state(page);
  check(`[${tag}] the next game settles exactly once`, ok && after.log.length === mid.log.length + 1, `${mid.log.length} -> ${after.log.length}`);
  check(`[${tag}] still consecutive, no duplicate gameId`, consecutive(after.log) && unique(after.log.map((e) => e.gameId)));
  check(`[${tag}] legacy event ids unique`, unique(after.legacy));
}

// The riskiest window: reload while the takeover dialog is OPEN (the game is paused waiting for the player).
let dialogReloaded = false;
for (let i = 0; i < 14 && !dialogReloaded; i += 1) {
  const before = (await state(page)).log.length;
  if (await visible(page, "[data-train]")) await page.click('[data-train="defense"]');
  await page.click("[data-play]");
  const started = Date.now();
  while (Date.now() - started < 120000) {
    if (await visible(page, ".reborn-takeover-dialog")) { dialogReloaded = true; break; }
    if ((await state(page)).log.length > before && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => false))) break;
    await page.waitForTimeout(250);
  }
  if (!dialogReloaded) continue;
  await enter(page);
  const mid = await state(page);
  check("[dialog open] reload: the paused game is logged at most once", mid.log.length === before || mid.log.length === before + 1, `${before} -> ${mid.log.length}`);
  check("[dialog open] reload: consecutive, no duplicate gameId", consecutive(mid.log) && unique(mid.log.map((e) => e.gameId)));
  check("[dialog open] reload: playable again", await visible(page, "[data-play]"));
  const ok = await finishGame(page, mid.log.length);
  const after = await state(page);
  check("[dialog open] the next game settles exactly once", ok && after.log.length === mid.log.length + 1, `${mid.log.length} -> ${after.log.length}`);
  check("[dialog open] still consecutive, no duplicate gameId", consecutive(after.log) && unique(after.log.map((e) => e.gameId)));
}
if (!dialogReloaded) console.log("NOT TESTED: no takeover dialog appeared in 14 games (schedule-dependent)");

const final = await state(page);
const paidIds = (final.fragments?.history || []).map((h) => h.gameId).filter(Boolean);
check("no fragment paid twice for one gameId", unique(paidIds), paidIds.join(" | "));
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
