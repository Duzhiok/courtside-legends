// Browser smoke for UI 3.0 Slice 1: the Gold pre-game tactics board, wired into the real setup screen.
// Real flow: Gold Challenge -> market -> finish prep -> setup. Checks the board renders the starting five, a preview does
// not touch the team, Apply writes + keeps the old advanced controls in step, "start" applies pending edits, other modes
// do not show the board. Desktop 1440 + mobile 390.
// Usage: node scripts/qa/gold-tactics-board.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/gold-tactics-board";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

async function toSetup(page, mode) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.click('.home-tab[data-category="custom"]');
  await page.click(`.mode-card[data-mode="${mode}"]`);
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await toSetup(page, "career");
  await page.waitForSelector("#screen-market.active", { timeout: 20000 });
  await page.waitForSelector("#btn-market-done", { state: "visible", timeout: 20000 });
  await page.click("#btn-market-done");
  await page.waitForSelector("#screen-setup.active", { timeout: 20000 });
  await page.waitForSelector("#setup-tactics-board .tb", { timeout: 10000 });

  const spots = () => page.$$eval("#setup-tactics-board .tb-spot:not(.is-empty)", (n) => n.length);
  check(`[${tag}] board shows the starting five`, (await spots()) === 5, `${await spots()}`);
  const seats = await page.evaluate(() => ({
    roster: [...document.querySelectorAll(".setup-slot.filled")].map((e) => `${e.querySelector(".slot-badge").textContent}:${e.dataset.id}`).join(" "),
    board: [...document.querySelectorAll("#setup-tactics-board .tb-spot:not(.is-empty)")].map((e) => `${e.querySelector(".tb-spot-pos").textContent}:${e.dataset.id}`).join(" "),
  }));
  check(`[${tag}] the court seats every starter in the same slot as the roster list`, seats.roster === seats.board, `${seats.roster} | ${seats.board}`);
  check(`[${tag}] every analysis row is tagged sim/advice`, await page.$$eval("#setup-tactics-board .tb-row", (r) => r.length > 0 && r.every((x) => x.querySelector(".tb-tag"))));
  check(`[${tag}] Apply is disabled while nothing changed`, await page.$eval('#setup-tactics-board [data-tb="apply"]', (b) => b.disabled));
  await shoot(page, `${OUT}/${tag}-board.png`);

  // Preview: pick a ball handler on the court; the team and the old control must not move yet.
  const oldFocusBefore = await page.$eval("#setup-offense-focus", (s) => s.value);
  const handlerId = await page.$eval('#setup-tactics-board [data-tb="handler"]', (b) => b.dataset.id);
  await page.click(`#setup-tactics-board [data-tb="handler"][data-id="${handlerId}"]`);
  check(`[${tag}] picking a handler shows his plays`, (await page.$$("#setup-tactics-board .tb-action")).length > 0);
  check(`[${tag}] board now says unapplied changes`, /未应用|Unapplied/.test(await page.textContent("#setup-tactics-board .tb-status").catch(() => "")));
  check(`[${tag}] preview left the old control untouched`, (await page.$eval("#setup-offense-focus", (s) => s.value)) === oldFocusBefore);

  // Apply: the old advanced control follows.
  await page.click('#setup-tactics-board [data-tb="apply"]');
  await page.waitForTimeout(300);
  check(`[${tag}] Apply moves the old ball-handler select to the same player`, (await page.$eval("#setup-offense-focus", (s) => s.value)) === handlerId);
  check(`[${tag}] after Apply the board is clean again`, await page.$eval('#setup-tactics-board [data-tb="apply"]', (b) => b.disabled));
  check(`[${tag}] the court still shows five`, (await spots()) === 5);

  // Unapplied edit + start: pending edits must not be lost.
  const otherId = await page.$$eval('#setup-tactics-board [data-tb="handler"]', (b, h) => b.map((x) => x.dataset.id).find((i) => i !== h), handlerId);
  await page.click(`#setup-tactics-board [data-tb="handler"][data-id="${otherId}"]`);
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 20000 });
  // The unapplied pick was applied by "start": the live game's own ball-handler control shows the player just picked.
  await page.waitForFunction((id) => document.querySelector("#offense-focus-select")?.value === id, otherId, { timeout: 8000 }).catch(() => {});
  const liveFocus = await page.$eval("#offense-focus-select", (el) => el.value).catch(() => null);
  check(`[${tag}] "start" applied the pending board edit (the live game's ball handler = the one just picked)`, liveFocus === otherId, String(liveFocus));
  check(`[${tag}] pressing start went to the game`, await page.$eval("#screen-game", (s) => s.classList.contains("active")));
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

// Other modes must not grow the board.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await toSetup(page, "quick");
  await page.waitForSelector("#btn-setup-confirm", { state: "visible", timeout: 20000 });
  check("[quick] no tactics board outside Gold", await page.$eval("#setup-tactics-board", (el) => el.hidden && el.innerHTML === ""));
  check("[quick] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
