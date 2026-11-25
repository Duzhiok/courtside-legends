// Browser smoke for Player Agency PA1: the clutch takeover is a real decision.
// Real flow, real engine: create a historical identity -> play games until the takeover dialog opens ->
// it shows the coach's call (or says there is none), your read and the choices -> pick (the coach's call when
// there is one, else the pull-up) -> after the game the coach's feedback line and the autonomy line show.
// Desktop 1440 + mobile 390.
// Plays on until a dialog WITH a coach's call comes up and runs it (the follow branch). With lang=en the dialog and
// feedback must be English. On the first dialog of the desktop zh pass the page is reloaded mid-dialog.
// Usage: node scripts/qa/reborn-agency.mjs [outDir] [baseUrl] [zh|en]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-agency";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
// Seed picked in Node (historical destiny, first pick, 1996): a dialog with a coach's call in game 1 there. The live
// page's game stream is not byte-identical to Node's, so in the browser it showed up between game 2 and 38 across
// runs; the 60-game cap leaves room. A bench player is rarely on the floor late: random seeds can go 40+ without one.
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=agency-qa-9`;
const LANG = process.argv[4] === "en" ? "en" : "zh";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);

const readDialog = (page) => page.$eval(".reborn-agency", (el) => ({
  coach: el.querySelector(".reborn-agency-coach")?.textContent || "",
  read: el.querySelector(".reborn-agency-read")?.textContent || "",
  text: el.textContent,
  options: [...el.querySelectorAll("[data-option]")].map((b) => b.dataset.option),
}));

/** Play one game; a dialog with a coach's call is recorded and followed, any other is passed. Returns that dialog (or null). */
async function playOne(page, tag, state) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  let seen = null;
  const started = Date.now();
  while (Date.now() - started < 60000) {
    if (await visible(page, ".reborn-agency")) {
      const d = await readDialog(page);
      if (!state.first) { state.first = d; await shoot(page, `${OUT}/${tag}-dialog-first.png`); }
      if (state.reloadOnFirst) return "reload";
      if (d.options.includes("follow") && !seen) {
        seen = { ...d, overflow: await noOverflow(page), choice: "follow" };
        await shoot(page, `${OUT}/${tag}-dialog-follow.png`);
      }
      await page.click(`.reborn-takeover-option[data-option="${seen && d.options.includes("follow") ? "follow" : "pass"}"]`);
    } else if (await visible(page, ".reborn-takeover-dialog")) {
      await page.click('.reborn-takeover-option[data-option="pass"]');
    }
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    if (now && now !== before && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => false))) return seen;
    await page.waitForTimeout(300);
  }
  throw new Error("game did not finish");
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("courtside.lang", l); }, LANG);
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
  check(`${tag}: autonomy line on the identity panel`, /战术自主权|Tactical autonomy/.test(await page.$eval("[data-testid=autonomy]", (el) => el.textContent).catch(() => "")));

  const state = { first: null, reloadOnFirst: tag === "desktop" && LANG === "zh" };
  let dialog = null;
  let games = 0;
  while (!dialog && games < 60) {
    const out = await playOne(page, tag, state);
    if (out === "reload") {
      const played = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
      await page.reload({ waitUntil: "domcontentloaded" });
      await homeActive(page);
      await page.click('.home-tab[data-category="career"]');
      await page.click('[data-career-identity="player"]');
      await page.waitForSelector("[data-play]", { timeout: 20000 });
      check(`${tag}: reload mid-dialog comes back to the run`, !(await visible(page, ".reborn-takeover-dialog")) && !(await page.$eval("[data-play]", (el) => el.disabled)), played.slice(0, 40));
      state.reloadOnFirst = false;
      continue;
    }
    dialog = out;
    games += 1;
  }
  const f = state.first;
  check(`${tag}: an agency dialog opened`, !!f);
  if (f) {
    check(`${tag}: drive / pull-up / keep reading are offered`, ["drive", "pullup", "pass"].every((o) => f.options.includes(o)), f.options.join(","));
    check(`${tag}: the call is offered exactly when there is one`, f.options.includes("follow") === !/没有新的指令|No new call/.test(f.coach));
    if (LANG === "en") check(`${tag}: dialog is English`, !/[\u4e00-\u9fff]/.test(f.text.replace(/[A-Z][a-z]+ [A-Z][a-z]+/g, "")), f.text.slice(0, 120));
  }
  check(`${tag}: a dialog with the coach's call came up and was followed`, !!dialog, `after ${games} games`);
  if (dialog) {
    check(`${tag}: the call names a teammate`, /「.+」|Feed|Find|Clear out/.test(dialog.coach), dialog.coach.slice(0, 90));
    check(`${tag}: your read is shown`, /你的观察|Your read/.test(dialog.read), dialog.read.slice(0, 80));
    check(`${tag}: dialog fits the screen`, dialog.overflow);
    const feedback = await page.$eval("[data-testid=agency-feedback]", (el) => el.textContent).catch(() => "");
    check(`${tag}: coach feedback for running the call`, LANG === "en" ? /^Coach: You ran the call/.test(feedback) : /^教练点评：你执行了战术/.test(feedback), feedback);
    await shoot(page, `${OUT}/${tag}-report.png`);
  }
  check(`${tag}: no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
