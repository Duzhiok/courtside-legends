// Dynamic In-Match Events MVP in a real browser (Play Now game, events forced via the QA hooks).
// Desktop: event card pauses the game -> pick -> resumes; save & leave with a decision open ->
// reload -> 继续进度 shows the SAME event again (not a new one) -> decide; ids never repeat.
// Top speed: events auto-resolve as an info toast, no pause. Mobile: bottom sheet.
// Usage: node scripts/qa/match-events.mjs /tmp/cls-qa/events [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/events";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };

// Every takeover candidate is eligible right away; one event at most every 4 boundaries.
const HOOKS = { seed: "qa-events", tuning: { warmupBoundaries: 2, minGapBoundaries: 6, takeoverHot: -3, chance: { takeover: 1, weakness: 0, foulTrouble: 0 } } };
const setHooks = (page) => page.addInitScript((h) => {
  globalThis.__CLS_MATCH_EVENT_SEED = h.seed;
  globalThis.__CLS_MATCH_EVENT_TUNING = h.tuning;
}, HOOKS);
const score = (page) => page.evaluate(() => `${document.querySelector("#score-a")?.textContent}-${document.querySelector("#score-b")?.textContent}`);
// "Is the game running" = the game clock moves (it ticks every possession); the score can stall for a dry spell.
const clock = (page) => page.evaluate(() => `${document.querySelector("#quarter")?.textContent} ${document.querySelector("#game-clock")?.textContent}`);
const decisionSel = "[data-event-id] [data-choice]";
const eventId = (page, root) => page.$eval(`${root} [data-event-id]`, (el) => el.dataset.eventId);
const saved = (page) => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem("cls_savegame_v1") || "null")?.matchEvents || null; } catch { return null; }
});

async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  await setHooks(page);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  return { page, errors };
}

async function desktop() {
  const { page, errors } = await newPage({ width: 1280, height: 800 });
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active");
  await page.waitForSelector(`#match-event-card ${decisionSel}`, { timeout: 60000 });
  const firstId = await eventId(page, "#match-event-card");
  check("desktop: a decision card appears in the coach panel", !!firstId, firstId);
  const s1 = await score(page);
  await page.waitForTimeout(3000);
  check("desktop: the game is paused while the decision is open", (await score(page)) === s1 && (await page.$eval("#btn-resume", (b) => !b.hidden)), s1);
  await shoot(page, `${OUT}/desktop-1-card.png`);
  await page.click(`#match-event-card [data-choice="feed"]`);
  await page.waitForFunction(() => !document.querySelector("#match-event-card [data-choice]"), null, { timeout: 5000 });
  const c1 = await clock(page);
  await page.waitForFunction((c) => `${document.querySelector("#quarter")?.textContent} ${document.querySelector("#game-clock")?.textContent}` !== c, c1, { timeout: 15000 }).catch(() => {});
  check("desktop: picking resumes the game", (await clock(page)) !== c1, `${c1} -> ${await clock(page)} (score ${s1} -> ${await score(page)})`);

  // Next decision: leave with it open, reload, continue -> the same event comes back.
  await page.waitForSelector(`#match-event-card ${decisionSel}`, { timeout: 90000 });
  const openId = await eventId(page, "#match-event-card");
  check("desktop: second event has a new id", openId !== firstId, `${firstId} / ${openId}`);
  await page.click("#btn-pause-leave");
  await homeActive(page);
  check("desktop: no event card or sheet left on the home screen", !(await page.$("#match-event-sheet [data-choice]")) && !(await page.isVisible(`#match-event-card ${decisionSel}`).catch(() => false)));
  const s = await saved(page);
  check("desktop: the save carries the open decision + the first decision in history", s?.pending?.id === openId && (s?.history || []).some((h) => h.id === firstId), JSON.stringify({ pending: s?.pending?.id, history: (s?.history || []).map((h) => h.id) }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click("#btn-continue-save");
  await page.waitForSelector("#screen-game.active");
  await page.waitForSelector(`#match-event-card ${decisionSel}`, { timeout: 10000 }).catch(() => {});
  const reshown = await page.$("#match-event-card [data-event-id]") ? await eventId(page, "#match-event-card") : null;
  check("desktop: after reload the SAME open decision is shown again", reshown === openId, `${openId} -> ${reshown}`);
  if (reshown) await page.click(`#match-event-card [data-choice="ignore"]`);
  // A restored game opens paused (the session did not pause it, so it does not resume it either).
  if (await page.isVisible("#btn-resume")) await page.click("#btn-resume");
  // Collect every event id from here on for a while: none may repeat an earlier one.
  const seen = [firstId, openId];
  // After the reload the game must keep running and nothing seen may repeat an earlier id. That the restored session
  // goes on to fire fresh events is proven deterministically in tests/matchEvents.test.js ("reload mid-game ...");
  // here it would hang on wall-clock pace (1x plays a quarter in ~90 s and the next takeover id is second-half).
  const sAfter = await clock(page);
  const until = Date.now() + 60000;
  while (Date.now() < until && (await clock(page)) === sAfter) {
    if (await page.$(`#match-event-card ${decisionSel}`)) {
      seen.push(await eventId(page, "#match-event-card"));
      await page.click(`#match-event-card [data-choice="ignore"]`);
    } else if (await page.isVisible("#btn-resume")) {
      await page.click("#btn-resume");
    }
    await page.waitForTimeout(500);
  }
  check("desktop: the restored game keeps running, and event ids never repeat", (await clock(page)) !== sAfter && new Set(seen).size === seen.length, `${sAfter} -> ${await clock(page)}; ${seen.join(", ")}`);
  check("desktop: no console / page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

async function topSpeed() {
  const { page, errors } = await newPage({ width: 1280, height: 800 });
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active");
  await page.click("#btn-speed");
  await page.click("#btn-speed"); // x3
  const label = await page.$eval("#btn-speed", (b) => b.textContent);
  const toast = await page.waitForSelector("#match-event-toast [data-event-id]", { timeout: 60000 }).catch(() => null);
  check("top speed: events auto-resolve as an info toast", !!toast, label);
  check("top speed: never shows a decision card", !(await page.$(`#match-event-card ${decisionSel}`)));
  const s1 = await score(page);
  await page.waitForTimeout(2500);
  check("top speed: the game keeps running", (await score(page)) !== s1);
  await shoot(page, `${OUT}/topspeed-toast.png`);
  check("top speed: no console / page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

async function mobile() {
  const { page, errors } = await newPage({ width: 390, height: 844 });
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active");
  await page.waitForSelector(`#match-event-sheet ${decisionSel}`, { timeout: 60000 });
  check("mobile: decision opens as a bottom sheet", true, await eventId(page, "#match-event-sheet"));
  check("mobile: no horizontal overflow with the sheet open", await noOverflow(page));
  await shoot(page, `${OUT}/mobile-sheet.png`);
  await page.click('#match-event-sheet [data-act="mev-dismiss"]').catch(async () => page.click('#match-event-sheet [data-choice="ignore"]'));
  await page.waitForFunction(() => !document.querySelector("#match-event-sheet [data-choice]"), null, { timeout: 5000 });
  const s1 = await score(page);
  await page.waitForFunction((s) => `${document.querySelector("#score-a")?.textContent}-${document.querySelector("#score-b")?.textContent}` !== s, s1, { timeout: 30000 }).catch(() => {});
  check("mobile: dismiss = default, game resumes", (await score(page)) !== s1);
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
const fails = out.filter((l) => l.startsWith("FAIL"));
console.log(`\n${out.length - fails.length}/${out.length} passed`);
process.exit(fails.length ? 1 : 0);
