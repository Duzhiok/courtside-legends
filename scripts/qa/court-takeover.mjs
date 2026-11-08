// M3 court visualization + tactical takeover (ROADMAP §6):
// takeover panel operable live-ball (focus + tempo), ball-holder halo,
// trails + pass-arc layer, effects toggle, reduced-motion respected.
// Animation on/off same final score is proven deterministically by the unit
// test (tests/courtRenderReadOnly.test.js, same seeded game); the browser
// cannot seed a game, so here the check is: toggling effects while paused
// never changes the live score, and both runs finish without errors.
// Desktop + mobile pass. Mac-only (needs the Playwright Chromium shell);
// FPS is recorded as data (the roadmap asks for a measurement, not a target).
// Usage: node scripts/qa/court-takeover.mjs /tmp/cls-qa/court-takeover [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/court-takeover";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });
const screen = (page) => page.evaluate(() => document.querySelector("main.screen.active")?.id);
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const count = (page, sel) => page.$$eval(sel, (els) => els.length).catch(() => 0);
const scoreLine = async (page) => `${await text(page, "#score-a")}-${await text(page, "#score-b")}`;

/** Sample the page's own rAF rate for ~3s while the game runs (data, not a gate). */
async function sampleFps(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames += 1;
          if (performance.now() - start < 3000) requestAnimationFrame(tick);
          else resolve(Math.round((frames / (performance.now() - start)) * 1000));
        };
        requestAnimationFrame(tick);
      })
  );
}

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);

  // A. Start a quick game; the takeover panel is in the coach panel.
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active", { timeout: 15000 });
  check(`[${tag}] game screen opens`, (await screen(page)) === "screen-game");
  check(`[${tag}] takeover panel is visible`, await visible(page, "#takeover-panel"));
  check(`[${tag}] takeover has 3 tempo buttons`, (await count(page, "#takeover-tempo-row [data-tempo]")) === 3);
  check(`[${tag}] takeover focus select has the 4 plays + clear`, (await page.$$eval("#takeover-focus-select option", (els) => els.length)) === 5);
  check(`[${tag}] takeover status line present`, (await text(page, "#takeover-status")).length > 0, await text(page, "#takeover-status"));
  check(`[${tag}] no horizontal overflow (game)`, await noOverflow(page));

  // B. Takeover is operable live-ball: tempo, then focus; status reflects both.
  await page.click('#takeover-tempo-row [data-tempo="push"]');
  await page.waitForFunction(
    () => document.querySelector("#takeover-status")?.textContent.includes("提速") || document.querySelector("#takeover-status")?.textContent.includes("Run"),
    null,
    { timeout: 5000 }
  );
  check(`[${tag}] tempo push updates the status`, (await text(page, "#takeover-status")).includes("提速") || (await text(page, "#takeover-status")).includes("Run"), await text(page, "#takeover-status"));
  await page.selectOption("#takeover-focus-select", "iso_star");
  await page.click("#btn-takeover-focus");
  await page.waitForFunction(
    () => document.querySelector("#takeover-status")?.textContent.includes("单打") || document.querySelector("#takeover-status")?.textContent.includes("ISO"),
    null,
    { timeout: 5000 }
  );
  check(`[${tag}] focus iso_star updates the status`, (await text(page, "#takeover-status")).includes("单打") || (await text(page, "#takeover-status")).includes("ISO"), await text(page, "#takeover-status"));
  await shoot(page, `${OUT}/${tag}-takeover.png`);

  // C. Hide/show: the panel is independently disableable and the sim is unaffected.
  const scoreBeforeHide = await scoreLine(page);
  await page.click("#btn-takeover-hide");
  check(`[${tag}] hide removes the panel`, !(await visible(page, "#takeover-panel")));
  check(`[${tag}] hide reveals the show button`, await visible(page, "#btn-takeover-show"));
  await page.click("#btn-takeover-show");
  check(`[${tag}] show brings the panel back`, await visible(page, "#takeover-panel"));
  check(`[${tag}] hiding the panel does not change the score`, (await scoreLine(page)) === scoreBeforeHide, `${scoreBeforeHide} -> ${await scoreLine(page)}`);

  // D. Court FX: ball-holder halo, FX layer present, effects toggle is score-neutral while paused.
  check(`[${tag}] ball-holder halo token exists`, (await count(page, ".court-token.ball-holder")) >= 1);
  check(`[${tag}] FX SVG layer exists`, (await count(page, ".court-fx")) === 1);
  check(`[${tag}] effects toggle says 开`, (await text(page, "#court-fx-btn")).includes("开"));
  if ((await text(page, "#btn-pause-sim")) === "暂停模拟") await page.click("#btn-pause-sim");
  await page.waitForFunction(() => !document.querySelector("#btn-pause-leave").hidden, null, { timeout: 10000 });
  const pausedScore = await scoreLine(page);
  await page.click("#court-fx-btn");
  check(`[${tag}] effects toggle switches to 关`, (await text(page, "#court-fx-btn")).includes("关"));
  check(`[${tag}] toggling effects while paused keeps the score`, (await scoreLine(page)) === pausedScore, `${pausedScore} -> ${await scoreLine(page)}`);
  await page.click("#court-fx-btn");
  await page.keyboard.press("Escape"); // resume from pause
  await page.waitForFunction(() => document.querySelector("#btn-pause-leave").hidden, null, { timeout: 10000 });

  // E. rAF rate while the game runs (data only — the roadmap asks for a measurement).
  const fps = await sampleFps(page);
  report.push(`DATA [${tag}] rAF rate during a live game: ${fps} fps`);

  // F. Quick-sim to the result: the game still finishes cleanly after takeover use.
  await page.click("#btn-quick-sim");
  await page.waitForSelector("#screen-result.active", { timeout: 30000 });
  check(`[${tag}] quick-sim finishes after takeover use`, (await screen(page)) === "screen-result");
  check(`[${tag}] no horizontal overflow (result)`, await noOverflow(page));

  // G. Reduced motion: a fresh page with the media feature forced degrades the court.
  const rm = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
  rm.on("pageerror", (e) => errors.push(`reduced-motion: ${e.message}`));
  rm.on("dialog", (d) => d.accept());
  await rm.goto(BASE, { waitUntil: "domcontentloaded" });
  await rm.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await rm.reload({ waitUntil: "domcontentloaded" });
  await homeActive(rm);
  await rm.click("#btn-play-now");
  await rm.waitForSelector("#screen-game.active", { timeout: 15000 });
  check(
    `[${tag}] reduced-motion is detected by the court`,
    await rm.evaluate(() => document.querySelector("#court-stage")?.dataset.reducedMotion === "1")
  );
  check(`[${tag}] reduced-motion page still shows the takeover panel`, await visible(rm, "#takeover-panel"));
  check(`[${tag}] no horizontal overflow (reduced motion)`, await noOverflow(rm));
  await rm.close();

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  await run(w, h, tag);
}
await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join("\n") + "\n");
console.log(report.join("\n"));
