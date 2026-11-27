// Critical Moments in a REAL browser game (Play Now): the last-possession decision is part of the normal live game.
//  - desktop x2: the card appears in the coach panel and pauses the game; picking an ACTION resumes it and the game plays the
//    possession out (a "clutch outcome" feed line arrives with the play, the score tells the truth); ids never repeat after a reload
//  - top speed (x3): auto-resolves with the default as a toast, never a card, never a pause
//  - mobile 390: bottom sheet, no horizontal overflow
// The QA hook (tuning.critical) widens the crunch window to the whole fourth quarter so a normal game always has both an offensive
// and a defensive call to answer without the game ending first; production keeps 24 s and a 3-point margin. Usage: node scripts/qa/critical-moments.mjs /tmp/cls-qa/critical [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, textContrast } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/critical";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
let failed = 0;
const check = (l, ok, d = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? ` — ${d}` : ""}`); };

const HOOKS = { seed: "qa-critical", tuning: { chance: { takeover: 0, weakness: 0, foulTrouble: 0 }, critical: { clockMax: 700, margin: 99 } } };
const clock = (p) => p.evaluate(() => `${document.querySelector("#quarter")?.textContent} ${document.querySelector("#game-clock")?.textContent}`);
const score = (p) => p.evaluate(() => `${document.querySelector("#score-a")?.textContent}-${document.querySelector("#score-b")?.textContent}`);
const feedText = (p) => p.evaluate(() => document.querySelector("#play-feed")?.innerText || "");

/** Wait for a selector while keeping the game moving: quarter breaks stop the game until the player continues. */
async function waitPlaying(page, sel, timeout) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await page.$(sel)) return true;
    if (await page.isVisible("#btn-resume").catch(() => false)) await page.click("#btn-resume").catch(() => {});
    await page.waitForTimeout(400);
  }
  return false;
}

/**
 * "The DOM has it" is not "the player can use it". The decision card must sit fully inside the viewport AND inside every scrolling /
 * clipping ancestor, and every enabled option must be the element actually hit at its centre (nothing painted over it).
 */
async function reachable(page, boxSel) {
  return page.evaluate((sel) => {
    const card = document.querySelector(`${sel} [data-event-id]`);
    const r = card.getBoundingClientRect();
    const clippedBy = [];
    for (let e = card.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowY === "visible") continue;
      const a = e.getBoundingClientRect();
      if (r.top < a.top - 1 || r.bottom > a.bottom + 1) clippedBy.push(`${e.id || e.className.toString().slice(0, 24)} (${Math.round(a.top)}-${Math.round(a.bottom)} vs card ${Math.round(r.top)}-${Math.round(r.bottom)})`);
    }
    const blocked = [];
    const buttons = [...card.querySelectorAll("[data-choice]")].filter((b) => !b.disabled);
    for (const b of buttons) {
      const br = b.getBoundingClientRect();
      const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      if (!hit || !b.contains(hit)) blocked.push(b.dataset.choice);
    }
    return { inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, clippedBy, blocked, options: buttons.length, rect: `${Math.round(r.top)}-${Math.round(r.bottom)} of ${innerHeight}` };
  }, boxSel);
}
async function assertUsable(page, label, boxSel) {
  await page.waitForTimeout(500); // let the scroll-into-view settle
  const u = await reachable(page, boxSel);
  check(`${label}: the whole card is inside the viewport`, u.inViewport, u.rect);
  check(`${label}: nothing clips it (no scrolling/overflow ancestor cuts it off)`, u.clippedBy.length === 0, u.clippedBy.join(" | "));
  check(`${label}: every enabled option is the element actually hit at its centre`, u.blocked.length === 0 && u.options >= 3, `${u.options} options, blocked: ${u.blocked.join(",") || "none"}`);
  const low = await textContrast(page, boxSel, { min: 4.5 });
  check(`${label}: all text in it passes WCAG AA contrast`, low.length === 0, low.join(" | "));
}

async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  await page.addInitScript((h) => { localStorage.setItem("cls_guide_first_run_v1", "seen"); globalThis.__CLS_MATCH_EVENT_SEED = h.seed; globalThis.__CLS_MATCH_EVENT_TUNING = h.tuning; }, HOOKS);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active");
  return { page, errors };
}

async function desktop() {
  const { page, errors } = await newPage({ width: 1280, height: 800 });
  await page.click("#btn-speed"); // x2
  const card = "#match-event-card [data-event-id]";
  check("desktop: a card shows up in the late game of a normal game", await waitPlaying(page, card, 420000));
  const first = await page.$eval(card, (e) => e.dataset.eventId);
  check("desktop: it is a late-game call", /clutch/i.test(first), first);
  const labels = await page.$$eval("#match-event-card [data-choice]", (els) => els.map((e) => `${e.dataset.choice}${e.disabled ? "(off)" : ""}`));
  check("desktop: real actions plus a no-op default", labels.some((l) => /ignore/.test(l)) && labels.length >= 3, labels.join(","));
  const s1 = await score(page);
  await page.waitForTimeout(2500);
  check("desktop: the game is paused while it is open", (await score(page)) === s1 && (await page.$eval("#btn-resume", (b) => !b.hidden)), s1);
  await assertUsable(page, "desktop", "#match-event-card");
  await shoot(page, `${OUT}/desktop-1-card.png`);

  // Answer calls as they come: defence -> deny; offence -> a shooter action. Collect every id.
  const seen = [];
  let shot = null;
  for (let i = 0; i < 8 && !shot; i += 1) {
    if (!(await waitPlaying(page, card, 120000))) break;
    const id = await page.$eval(card, (e) => e.dataset.eventId);
    seen.push(id);
    const choices = await page.$$eval("#match-event-card [data-choice]", (els) => els.filter((e) => !e.disabled).map((e) => e.dataset.choice));
    const pick = /Offense/i.test(id) ? choices.find((c) => /^(three|attack)/.test(c)) : choices.find((c) => c !== "ignore");
    const before = await feedText(page);
    await page.click(`#match-event-card [data-choice="${pick}"]`);
    await page.waitForFunction((old) => document.querySelector("#match-event-card [data-event-id]")?.dataset.eventId !== old, id, { timeout: 8000 }).catch(() => {});
    if (/Offense/i.test(id)) shot = { id, pick, before };
  }
  check("desktop: the last-possession choices were answered one call at a time (ids never repeat)", seen.length >= 1 && new Set(seen).size === seen.length, seen.join(","));
  if (shot) {
    const outcome = await page.waitForFunction((b) => { const t = document.querySelector("#play-feed")?.innerText || ""; return t !== b && /绝杀结果|Clutch result/.test(t); }, shot.before, { timeout: 90000 }).then(() => true, () => false);
    const line = (await feedText(page)).split("\n").find((l) => /绝杀结果|Clutch result/.test(l));
    check(`desktop: picking "${shot.pick}" -> the sim plays it out and the result lands in the live feed`, outcome, line);
    check("desktop: that result was not sitting in the feed before the play ran", !/绝杀结果|Clutch result/.test(shot.before));
  } else check("desktop: an offensive last-possession call was offered", false, seen.join(","));
  await shoot(page, `${OUT}/desktop-2-after.png`);

  await page.click("#btn-pause-leave").catch(() => {});
  await homeActive(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  if (await page.isVisible("#btn-continue-save").catch(() => false)) {
    await page.click("#btn-continue-save");
    await page.waitForSelector("#screen-game.active");
    await page.waitForTimeout(1500);
    const again = await page.$eval(card, (e) => e.dataset.eventId).catch(() => null);
    check("desktop: after leave + reload no already-settled call comes back", !again || !seen.slice(0, -1).includes(again), `${seen.join(",")} -> ${again}`);
  } else console.log("SKIP reload check (no continue button)");
  check("desktop: no console / page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

async function topSpeed() {
  const { page, errors } = await newPage({ width: 1280, height: 800 });
  await page.click("#btn-speed"); await page.click("#btn-speed"); // x3
  const toast = await waitPlaying(page, "#match-event-toast [data-event-id]", 240000);
  check("top speed: the call auto-resolves as an info toast", toast);
  check("top speed: never a decision card", !(await page.$("#match-event-card [data-choice]")));
  const c1 = await clock(page);
  await page.waitForTimeout(2500);
  check("top speed: the game never stops for it", (await clock(page)) !== c1 || /终|End|Final/i.test(await clock(page)), `${c1} -> ${await clock(page)}`);
  check("top speed: no console / page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

async function mobile() {
  const { page, errors } = await newPage({ width: 390, height: 844 });
  await page.click("#btn-speed");
  check("mobile: opens as a bottom sheet", await waitPlaying(page, "#match-event-sheet [data-event-id]", 420000));
  check("mobile: no horizontal overflow with the sheet open", await noOverflow(page));
  await assertUsable(page, "mobile", "#match-event-sheet");
  const sheetBg = await page.$eval("#match-event-sheet .mev-sheet", (e) => getComputedStyle(e).backgroundColor);
  check("mobile: the sheet is opaque (the page cannot ghost through it)", !/rgba\(.*,\s*0?\.\d+\)$/.test(sheetBg) && sheetBg !== "rgba(0, 0, 0, 0)", sheetBg);
  await shoot(page, `${OUT}/mobile-sheet.png`);
  check("mobile: no console / page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

try {
  await desktop();
  await topSpeed();
  await mobile();
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
