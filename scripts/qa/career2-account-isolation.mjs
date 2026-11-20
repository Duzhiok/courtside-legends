// Career 2.0 E2E: account isolation + reload idempotence, through the real UI.
// Two registered accounts (A, B) and a guest share one browser origin. Invariants:
//   1. A's run (rivalry, legacy, honors, fragments) lands in A's account only.
//   2. Whatever B or the guest does afterwards, A's stored account is byte-identical.
//   3. A reload settles nothing twice: relationship + legacy game ids stay unique and unchanged.
// The run seed is pinned (schedule only; the game sim itself is live-random, so no score assertions).
// Usage: node scripts/qa/career2-account-isolation.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/account-isolation";
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

/** Play one Reborn game; the takeover dialog (if it pops) is passed. */
async function playOne(page) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  const started = Date.now();
  while (Date.now() - started < 120000) {
    if (await visible(page, ".reborn-takeover-dialog")) await page.click('.reborn-takeover-option[data-option="pass"]');
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    if (now && now !== before && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => false))) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

/** The raw account store, parsed: { accounts: [...] }. */
const readStore = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cls_accounts_v1") || "{\"accounts\":[]}"));
const byName = (store, name) => store.accounts.find((a) => a.name === name);
const relationshipsOf = (account) => account?.careerRelationships || { people: [], relationships: [], legacy: [] };
const rivalryEvents = (account) => (relationshipsOf(account).legacy || []).filter((e) => e.type === "rivalry" || e.type === "rivalry-game");
const rivalryRels = (account) => (relationshipsOf(account).relationships || []).filter((r) => r.kind === "rivalry");

async function openCareerRun(page, { create }) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  if (create) {
    await page.waitForSelector(".reborn-create", { timeout: 20000 });
    await page.click('[data-reborn-destiny="historical"]');
    await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
    await page.click(".reborn-create-pick");
    await page.click(".reborn-create-confirm");
  }
  await page.waitForSelector("[data-play], .reborn-create", { timeout: 20000 });
}

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });

// Two real accounts through the real account module (the same module instance the app uses).
await page.evaluate(async () => {
  const account = await import("/js/data/account.js");
  const a = account.createAccount("QA-A");
  account.createAccount("QA-B");
  account.setActiveAccountId(a.id);
});

// ---- A: new run, one game, challenge a real opponent
await openCareerRun(page, { create: true });
if (await visible(page, "[data-train]")) await page.click('[data-train="defense"]');
check("[A] first game settles", await playOne(page));
const challenge = await page.$("[data-rival-challenge]");
check("[A] a challenge is offered after the game", !!challenge);
if (challenge) {
  const bref = await challenge.getAttribute("data-rival-challenge");
  await challenge.click();
  await page.waitForSelector('[data-testid="rivals-panel"]', { timeout: 5000 });
  check("[A] challenged rival is not offered again", !(await page.$(`[data-rival-challenge="${bref}"]`)));
}
if (await visible(page, "[data-train]")) await page.click('[data-train="defense"]');
check("[A] second game settles", await playOne(page));

let store = await readStore(page);
const a1 = byName(store, "QA-A");
const b1 = byName(store, "QA-B");
check("[A] the rivalry is in A's account", rivalryRels(a1).length === 1, `rels=${rivalryRels(a1).length}`);
check("[A] A has rivalry legacy events", rivalryEvents(a1).length >= 1, `events=${rivalryEvents(a1).length}`);
const ids = rivalryEvents(a1).map((e) => e.id);
check("[A] no duplicate legacy event ids", new Set(ids).size === ids.length, ids.join(" | "));
const gameIds = rivalryEvents(a1).filter((e) => e.type === "rivalry-game").map((e) => e.data?.gameId);
check("[A] no duplicate rivalry gameId", new Set(gameIds).size === gameIds.length, gameIds.join(" | "));
check("[B] untouched: no rivalry, no legacy events", rivalryRels(b1).length === 0 && rivalryEvents(b1).length === 0);
const aSnapshot = JSON.stringify(a1);

// ---- reload as A: nothing settles twice
await openCareerRun(page, { create: false });
store = await readStore(page);
check("[A] reload: account byte-identical (no double settlement)", JSON.stringify(byName(store, "QA-A")) === aSnapshot);

// A foreign Reborn run is never shown: the Career entry answers with the existing "belongs to another" notice.
async function expectBlocked(tag, forbiddenPlayers) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForTimeout(1200);
  const playable = await visible(page, "[data-play]");
  const notice = await page.evaluate(() => {
    const dialog = document.querySelector("#app-confirm-dialog");
    return dialog?.open ? document.querySelector("#app-confirm-message")?.textContent.trim() || "" : "";
  });
  check(`[${tag}] A's run is not shown or playable`, !playable);
  check(`[${tag}] the player is told whose save it is`, /另一个账号|another account/i.test(notice), notice.slice(0, 80));
  await page.screenshot({ path: `${OUT}/${tag}-blocked.png`, timeout: 15000 }).catch(() => {});
  const now = await readStore(page);
  check(`[${tag}] A's account is byte-identical`, JSON.stringify(byName(now, "QA-A")) === aSnapshot);
  const bNow = byName(now, "QA-B");
  const bDiff = Object.keys({ ...b1, ...bNow }).filter((k) => JSON.stringify(b1?.[k]) !== JSON.stringify(bNow?.[k]));
  console.log(`NOTE [${tag}] B fields that changed: ${bDiff.join(",") || "none"}`);
  check(`[${tag}] B's account has no Career 2.0 data (no relationships, honors, jerseys, fragments)`, rivalryRels(bNow).length === 0 && rivalryEvents(bNow).length === 0 && !bDiff.some((k) => /relationship|honor|jersey|fragment|legacy|collection/i.test(k)), bDiff.join(","));
  check(`[${tag}] ${forbiddenPlayers}`, now.accounts.length === 2, `accounts=${now.accounts.length}`);
}

await page.evaluate(async () => {
  const account = await import("/js/data/account.js");
  account.setActiveAccountId(account.listAccounts().find((x) => x.name === "QA-B").id);
});
await expectBlocked("B", "no account was created");

await page.evaluate(() => localStorage.removeItem("cls_active_account"));
await expectBlocked("guest", "no account was created");

// ---- back to A: the run is still hers and resumable
await page.evaluate(async () => {
  const account = await import("/js/data/account.js");
  account.setActiveAccountId(account.listAccounts().find((x) => x.name === "QA-A").id);
});
await openCareerRun(page, { create: false });
check("[A] returns to her own run", await visible(page, "[data-play]"));
store = await readStore(page);
check("[A] account still byte-identical after the round trip", JSON.stringify(byName(store, "QA-A")) === aSnapshot);

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await page.screenshot({ path: `${OUT}/final.png`, timeout: 15000 }).catch(() => {});
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
