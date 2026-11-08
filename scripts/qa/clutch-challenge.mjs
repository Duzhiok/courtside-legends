// M2b-2 Clutch Challenge (docs/implementation/m2b-2-clutch-controller-design.md):
// entry from home (guest, no account gate) -> scenario -> pick shooter + action
// -> submit -> structured outcome rendering (from meta.clutchOutcome, never a
// score guess) -> retry (fresh GameSim) / entry / home; back navigation per
// the back-button standard. Desktop + mobile pass. Mac-only (needs the
// Playwright Chromium shell); the node tests (clutchController /
// initializeScenario / clutchDecisionAdapter) are the ones that run on the VM.
// Usage: node scripts/qa/clutch-challenge.mjs /tmp/cls-qa/clutch-challenge [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/clutch-challenge";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });
const screen = (page) => page.evaluate(() => document.querySelector("main.screen.active")?.id);
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const count = (page, sel) => page.$$eval(sel, (els) => els.length).catch(() => 0);

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);

  // A. Entry: reachable from home as a guest (no account gate), no catalog mode added.
  await page.click('.home-tab[data-category="custom"]');
  check(`[${tag}] clutch entry card is on home`, await visible(page, '#btn-clutch-entry'));
  await page.click('#btn-clutch-entry');
  await page.waitForSelector("#screen-clutch.active", { timeout: 10000 });
  check(`[${tag}] entry screen opens`, (await screen(page)) === "screen-clutch");
  check(`[${tag}] entry names the scenario (2016, down 3, 12s)`, (await text(page, "#clutch-scenario-card")).includes("12"), await text(page, "#clutch-scenario-card"));
  check(`[${tag}] no horizontal overflow (entry)`, await noOverflow(page));

  // B. Play: 5 on-court shooters, action toggle, submit disabled until a pick.
  await page.click("#btn-clutch-start");
  await page.waitForSelector("#screen-clutch-play.active", { timeout: 10000 });
  check(`[${tag}] play screen opens`, (await screen(page)) === "screen-clutch-play");
  check(`[${tag}] score line shows 97 — 100`, (await text(page, "#clutch-play-score")).includes("97"), await text(page, "#clutch-play-score"));
  check(`[${tag}] exactly 5 shooters on court`, (await count(page, "#clutch-shooter-list .clutch-shooter")) === 5);
  check(`[${tag}] submit disabled before a pick`, await page.$eval("#btn-clutch-submit", (el) => el.disabled));
  check(`[${tag}] default action is three`, await page.$eval('[data-clutch-action="three"]', (el) => el.classList.contains("selected")));
  await page.click("#clutch-shooter-list .clutch-shooter >> nth=1");
  check(`[${tag}] picking a shooter enables submit`, await page.$eval("#btn-clutch-submit", (el) => !el.disabled));
  // One change before submit: pick a different shooter, submit still works.
  await page.click("#clutch-shooter-list .clutch-shooter >> nth=2");
  check(`[${tag}] changing the pick once keeps submit enabled`, await page.$eval("#btn-clutch-submit", (el) => !el.disabled));

  // C. Result: structured outcome, not a score guess — explanation lines name
  // the ball, the shot, and the reason; final score + win/loss shown.
  await page.click("#btn-clutch-submit");
  await page.waitForSelector("#screen-clutch-result.active", { timeout: 15000 });
  check(`[${tag}] result screen opens`, (await screen(page)) === "screen-clutch-result");
  const body = await text(page, "#clutch-result-body");
  check(`[${tag}] result explains the ball (传到了/没能传到)`, body.includes("传到了") || body.includes("没能传到"), body.slice(0, 120));
  check(`[${tag}] result shows the final score`, /\d+\s*—\s*\d+/.test(body), body.slice(0, 120));
  check(`[${tag}] result has a win/loss verdict`, body.includes("赢下") || body.includes("没能赢下"), body.slice(0, 120));
  check(`[${tag}] no horizontal overflow (result)`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-clutch-result.png`);

  // D. Retry: a fresh GameSim (same scenario, play screen again, submit works).
  await page.click("#btn-clutch-retry");
  await page.waitForSelector("#screen-clutch-play.active", { timeout: 10000 });
  check(`[${tag}] retry re-opens the play screen`, (await screen(page)) === "screen-clutch-play");
  check(`[${tag}] retry resets the pick (submit disabled again)`, await page.$eval("#btn-clutch-submit", (el) => el.disabled));
  await page.click("#clutch-shooter-list .clutch-shooter >> nth=0");
  await page.click("#btn-clutch-submit");
  await page.waitForSelector("#screen-clutch-result.active", { timeout: 15000 });
  check(`[${tag}] retry resolves a second time`, (await screen(page)) === "screen-clutch-result");

  // E. Navigation: result back -> entry; entry back -> home; Escape from play -> entry.
  await page.click("#btn-clutch-result-back");
  await page.waitForSelector("#screen-clutch.active", { timeout: 10000 });
  check(`[${tag}] result back returns to the challenge entry`, (await screen(page)) === "screen-clutch");
  await page.click("#btn-clutch-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] entry back returns home`, (await screen(page)) === "screen-home");
  await page.click('#btn-clutch-entry');
  await page.waitForSelector("#screen-clutch.active", { timeout: 10000 });
  await page.click("#btn-clutch-start");
  await page.waitForSelector("#screen-clutch-play.active", { timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-clutch.active", { timeout: 10000 });
  check(`[${tag}] Escape from play returns to the entry`, (await screen(page)) === "screen-clutch");

  // F. The other two exits: Other Challenges -> entry, Return Home -> home.
  await page.click("#btn-clutch-start");
  await page.waitForSelector("#screen-clutch-play.active", { timeout: 10000 });
  await page.click("#clutch-shooter-list .clutch-shooter >> nth=0");
  await page.click("#btn-clutch-submit");
  await page.waitForSelector("#screen-clutch-result.active", { timeout: 15000 });
  await page.click("#btn-clutch-other");
  await page.waitForSelector("#screen-clutch.active", { timeout: 10000 });
  check(`[${tag}] Other Challenges returns to the entry`, (await screen(page)) === "screen-clutch");
  await page.click("#btn-clutch-start");
  await page.waitForSelector("#screen-clutch-play.active", { timeout: 10000 });
  await page.click("#clutch-shooter-list .clutch-shooter >> nth=0");
  await page.click("#btn-clutch-submit");
  await page.waitForSelector("#screen-clutch-result.active", { timeout: 15000 });
  await page.click("#btn-clutch-home");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] Return Home exits to home`, (await screen(page)) === "screen-home");

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  await run(w, h, tag);
}
await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join("\n") + "\n");
console.log(report.join("\n"));
