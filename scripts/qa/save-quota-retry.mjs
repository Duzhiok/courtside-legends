// Browser E2E for the long-career save retry: when the browser's storage is completely full and an old
// build left a legacy save behind, signing a renewal must free that orphan and still save.
// The failure case is the control: full storage with NOTHING to free must fail honestly (the contract is
// not signed, the player is told) and must not delete anything it doesn't own.
// Real engine builds the save, real UI signs the contract -- no stubs.
// Usage: node scripts/qa/save-quota-retry.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/quota";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/** A real five-season save sitting on the renewal decision, loaded into the real UI. */
async function openRenewal() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const dialogs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const ttc = await import("/js/modes/timeTravelCareer.js");
    const cc = await import("/js/modes/careerContract.js");
    const sr = await import("/js/data/saveRoot.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
    let root = ttc.acceptInterviewOffer(prologue, prologue.offers[1].id);
    const team = root.leagueCareer.season.userTeamId;
    root.leagueCareer.management.seasonHistory = [[50, 32], [52, 30], [48, 34], [55, 27], [51, 31]].map(([w, l], i) => ({
      year: 1995 + i, teamId: team, teamName: "QA Team", record: { w, l }, finish: "playoffs", championId: "OTHER",
    }));
    root = cc.evaluateCareerEmployment(root);
    sr.writeRootSave(root, localStorage);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  await page.waitForSelector("#time-travel-contract:not([hidden])", { timeout: 10000 });
  return { page, errors, dialogs };
}

/**
 * Make the next save need MORE room than the browser has. Storage being full is not enough: a save that is
 * no bigger than the stored one replaces it in place and fits (the first version of this script found that
 * out -- it signed without ever retrying). So the stored root is swapped for a tiny valid one first, then
 * localStorage is filled under `key` until not one more character fits.
 */
const makeTight = (page, key) => page.evaluate(async (junkKey) => {
  const sr = await import("/js/data/saveRoot.js");
  const fullLen = localStorage.getItem("cls_root_v3").length;
  localStorage.setItem("cls_root_v3", JSON.stringify(sr.createRootState()));
  const smallLen = localStorage.getItem("cls_root_v3").length;
  let value = "";
  for (let chunk = 1 << 19; chunk >= 1; chunk >>= 1) {
    for (;;) {
      try { localStorage.setItem(junkKey, value + "x".repeat(chunk)); value += "x".repeat(chunk); } catch { break; }
    }
  }
  let free = 0;
  try { localStorage.setItem("__probe", "x"); localStorage.removeItem("__probe"); free = 1; } catch { /* full */ }
  return { fullLen, smallLen, filled: value.length, free };
}, key);

const signFirstOffer = async (page) => {
  await page.click("#time-travel-contract-options button:first-child");
  await page.click("#time-travel-contract .tt-confirm [data-act=confirm]");
  await page.waitForTimeout(1500);
};
const saved = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
  return { status: root?.story?.employment?.status, offer: root?.story?.employment?.offer?.id };
});

// ---- A. full storage, an orphaned legacy save to free -> the contract is signed ----
{
  const { page, errors, dialogs } = await openRenewal();
  const { fullLen, smallLen, filled, free } = await makeTight(page, "cls_season_v1");
  check("[A] precondition: storage is full, the legacy save hogs it, and the career needs more room than is stored",
    free === 0 && filled > 100000 && smallLen < fullLen, `filled ${filled}, free ${free}, stored ${smallLen} vs career ${fullLen}`);
  await signFirstOffer(page);
  const after = await saved(page);
  check("[A] the renewal was signed and saved despite full storage", after.status === "active" && !!after.offer, JSON.stringify(after));
  check("[A] the orphaned legacy save was freed to make room", await page.evaluate(() => localStorage.getItem("cls_season_v1") === null));
  check("[A] no save-failure dialog was shown", !dialogs.some((m) => /保存失败/.test(m)), dialogs.join(" | "));
  check("[A] the contract card closed", await page.$eval("#time-travel-contract", (e) => e.hidden));
  check("[A] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---- B. control: full storage, nothing legacy to free -> an honest failure, nothing else touched ----
{
  const { page, errors } = await openRenewal();
  const { fullLen, smallLen, free } = await makeTight(page, "someone_elses_data");
  check("[B] precondition: storage is full, holds no legacy save, and the career needs more room than is stored",
    free === 0 && smallLen < fullLen && await page.evaluate(() => localStorage.getItem("cls_season_v1") === null));
  await signFirstOffer(page);
  const after = await saved(page);
  check("[B] with nothing to free, the contract is NOT signed (honest failure)", after.status !== "active" && !after.offer, JSON.stringify(after));
  // The time-travel screen rolls back and says so in its status line (the export dialog is the import path's).
  const status = await page.$eval("#time-travel-status", (e) => e.textContent.trim());
  check("[B] the player is told the save failed (status line), and nothing pretends it worked", /失败/.test(status) && !/续约已签署/.test(status), status);
  check("[B] unrelated data in storage was not deleted", await page.evaluate(() => (localStorage.getItem("someone_elses_data") || "").length > 100000));
  check("[B] the offers are still on the table to retry", await page.$eval("#time-travel-contract", (e) => !e.hidden));
  check("[B] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
