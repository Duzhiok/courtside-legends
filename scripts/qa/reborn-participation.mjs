// Browser smoke for Player Agency PA2: the involvement modes are playable.
// Real flow: new historical Reborn -> the four modes are on the identity panel (Key possessions is the default) -> pick Full control ->
// play a game: the dialog opens on everyday possessions ("This possession") with the mode switch in its footer -> switch to Automatic
// FROM INSIDE the dialog (it stays open, nothing is answered) -> answer it -> no further question this game -> the setting survives
// a reload and the identity panel shows it. Desktop 1440 + mobile 390.
// Usage: node scripts/qa/reborn-participation.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-participation";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=participation-qa-2`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };
const pressed = (page) => page.$$eval(".reborn-identity .reborn-mode-chip[aria-pressed=true]", (els) => els.map((e) => e.dataset.mode));
const open = (page) => page.$(".reborn-agency").then((el) => !!el);

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("courtside.lang", "zh"); });
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

  check(`${tag}: four modes on the identity panel`, (await page.$$(".reborn-identity .reborn-mode-chip")).length === 4);
  check(`${tag}: Key possessions is the default`, (await pressed(page)).join() === "key", (await pressed(page)).join());
  await page.click('.reborn-identity [data-mode="full"]');
  check(`${tag}: choosing Full control sticks`, (await pressed(page)).join() === "full");

  await page.click("[data-play]");
  await page.waitForSelector(".reborn-agency", { timeout: 60000 });
  const first = await page.$eval(".reborn-agency", (el) => ({ title: el.querySelector("h2").textContent, bar: el.querySelectorAll(".reborn-mode-chip").length, on: el.querySelector('.reborn-mode-chip[aria-pressed=true]')?.dataset.mode }));
  check(`${tag}: everyday possessions get a dialog with the mode switch`, first.bar === 4 && first.on === "full", `${first.title} / ${first.on}`);
  await shoot(page, `${OUT}/${tag}-dialog-everyday.png`);
  check(`${tag}: the dialog fits the screen`, await noOverflow(page));

  // Answer a few, then switch to Automatic from inside the dialog.
  let answered = 0;
  while (answered < 3) { await page.click('.reborn-takeover-option[data-option="pass"]'); answered += 1; await page.waitForSelector(".reborn-agency", { timeout: 30000 }); }
  await page.click('.reborn-agency [data-mode="auto"]');
  check(`${tag}: switching mode does not answer the question`, await open(page));
  check(`${tag}: the switch shows Automatic as current`, await page.$eval('.reborn-agency [data-mode="auto"]', (el) => el.getAttribute("aria-pressed") === "true"));
  await shoot(page, `${OUT}/${tag}-dialog-after-switch.png`);
  await page.click('.reborn-takeover-option[data-option="pass"]');
  let extra = 0;
  const started = Date.now();
  while (Date.now() - started < 60000) {
    if (await open(page)) { extra += 1; await page.click('.reborn-takeover-option[data-option="pass"]'); }
    const done = await page.$eval("[data-play]", (el) => !el.disabled).catch(() => false);
    if (done && !(await open(page))) break;
    await page.waitForTimeout(250);
  }
  check(`${tag}: after switching to Automatic nothing else is asked this game`, extra === 0, `${extra} more`);
  check(`${tag}: the game finished and a report is shown`, !!(await page.$(".reborn-report")));
  check(`${tag}: identity panel now shows Automatic`, (await pressed(page)).join() === "auto");
  const feedback = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  check(`${tag}: the report counts the decisions you made`, /\d+ 个决定|decisions/.test(feedback), feedback.slice(0, 0));

  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  check(`${tag}: the setting survives a reload`, (await pressed(page)).join() === "auto");
  await shoot(page, `${OUT}/${tag}-identity-panel.png`);
  check(`${tag}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
