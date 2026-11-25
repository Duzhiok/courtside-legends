// Browser smoke for Player Agency PA1: the clutch takeover is a real decision.
// Real flow, real engine: create a historical identity -> play games until the takeover dialog opens ->
// it shows the coach's call (or says there is none), your read and the choices -> pick (the coach's call when
// there is one, else the pull-up) -> after the game the coach's feedback line and the autonomy line show.
// Desktop 1440 + mobile 390. Seed pinned so the schedule is the same every run.
// Usage: node scripts/qa/reborn-agency.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-agency";
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

/** Play one game; on the agency dialog, record it and choose. Returns the dialog facts (or null) once the game is done. */
async function playOne(page, tag) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  let seen = null;
  const started = Date.now();
  while (Date.now() - started < 60000) {
    if (await visible(page, ".reborn-takeover-dialog")) {
      if (!seen && (await visible(page, ".reborn-agency"))) {
        seen = await page.$eval(".reborn-agency", (el) => ({
          coach: el.querySelector(".reborn-agency-coach")?.textContent || "",
          read: el.querySelector(".reborn-agency-read")?.textContent || "",
          options: [...el.querySelectorAll("[data-option]")].map((b) => b.dataset.option),
        }));
        await shoot(page, `${OUT}/${tag}-dialog.png`);
        seen.overflow = await noOverflow(page);
        seen.choice = seen.options.includes("follow") ? "follow" : "pullup";
        await page.click(`.reborn-takeover-option[data-option="${seen.choice}"]`);
      } else {
        await page.click('.reborn-takeover-option[data-option="pass"]');
      }
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
  check(`${tag}: autonomy line on the identity panel`, /战术自主权|Tactical autonomy/.test(await page.$eval("[data-testid=autonomy]", (el) => el.textContent).catch(() => "")));

  let dialog = null;
  let games = 0;
  while (!dialog && games < 30) {
    dialog = await playOne(page, tag);
    games += 1;
  }
  check(`${tag}: an agency dialog opened`, !!dialog, `after ${games} games`);
  if (dialog) {
    check(`${tag}: coach card says the call or that there is none`, /教练指令|Coach's call/.test(dialog.coach) && dialog.coach.length > 10, dialog.coach.slice(0, 80));
    check(`${tag}: your read is shown`, /你的观察|Your read/.test(dialog.read), dialog.read.slice(0, 80));
    check(`${tag}: drive / pull-up / keep reading are offered`, ["drive", "pullup", "pass"].every((o) => dialog.options.includes(o)), dialog.options.join(","));
    check(`${tag}: the call is offered exactly when there is one`, dialog.options.includes("follow") === !/没有新的指令|No new call/.test(dialog.coach));
    check(`${tag}: dialog fits the screen`, dialog.overflow);
    const feedback = await page.$eval("[data-testid=agency-feedback]", (el) => el.textContent).catch(() => "");
    check(`${tag}: coach feedback after the game`, /教练点评|Coach:/.test(feedback) && /自主权|autonomy/.test(feedback), feedback);
    await shoot(page, `${OUT}/${tag}-report.png`);
  }
  check(`${tag}: no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
