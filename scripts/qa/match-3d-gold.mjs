// Browser smoke for 3D-S1B: the optional 3D court on the Gold game screen.
// Real flow: Gold -> market -> finish prep -> setup -> start. Checks: the 3D button is offered in Gold only, 2D is the
// default, switching shows a real WebGL canvas while the 2D scoreboard keeps following GameSim, pause freezes the match,
// switching back restores 2D, 3D survives a speed change, and nothing throws. Desktop 1440 + mobile 390.
// Usage: node scripts/qa/match-3d-gold.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/match-3d-gold";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

async function open(page, mode) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="custom"]');
  await page.click(`.mode-card[data-mode="${mode}"]`);
}
const score = (page) => page.evaluate(() => `${document.querySelector("#score-a").textContent}-${document.querySelector("#score-b").textContent}|${document.querySelector("#game-clock").textContent}`);
const visible = (page, sel) => page.$eval(sel, (e) => !e.hidden && e.getClientRects().length > 0).catch(() => false);

const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await open(page, "career");
  await page.waitForSelector("#btn-market-done", { state: "visible", timeout: 20000 });
  await page.click("#btn-market-done");
  await page.waitForSelector("#screen-setup.active", { timeout: 20000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 20000 });

  check(`[${tag}] Gold offers the 3D button`, await visible(page, "#btn-court-3d"));
  check(`[${tag}] the match starts in 2D`, (await visible(page, "#court-root")) && !(await visible(page, "#court-3d-root")));

  await page.click("#btn-court-3d");
  await page.waitForSelector("#court-3d-root canvas", { timeout: 30000 }).catch(() => {});
  const canvas = await page.$("#court-3d-root canvas");
  check(`[${tag}] switching to 3D mounts a WebGL canvas`, !!canvas);
  check(`[${tag}] 2D court is hidden while 3D is on, button now offers 2D`, !(await visible(page, "#court-root")) && /2D/.test(await page.textContent("#btn-court-3d")));
  const box = canvas ? await canvas.boundingBox() : null;
  check(`[${tag}] the canvas has real size`, !!box && box.width > 200 && box.height > 150, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "none");
  await shoot(page, `${OUT}/${tag}-3d.png`);

  const s0 = await score(page);
  await page.waitForTimeout(5000);
  const s1 = await score(page);
  check(`[${tag}] the 2D scoreboard keeps following GameSim while 3D is on`, s0 !== s1, `${s0} -> ${s1}`);

  await page.click("#btn-pause-sim");
  await page.waitForTimeout(400);
  const p0 = await score(page);
  await page.waitForTimeout(2500);
  check(`[${tag}] pause freezes the match with 3D on`, (await score(page)) === p0, p0);
  await page.click("#btn-pause-sim");

  if (await visible(page, "#btn-speed")) {
    await page.click("#btn-speed");
    await page.waitForTimeout(1500);
    check(`[${tag}] changing speed keeps 3D alive`, await visible(page, "#court-3d-root"));
  }

  await page.click("#btn-court-3d");
  await page.waitForTimeout(300);
  check(`[${tag}] switching back restores 2D and frees the canvas`, (await visible(page, "#court-root")) && !(await page.$("#court-3d-root canvas")));
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "quick");
  await page.waitForSelector("#btn-setup-confirm", { state: "visible", timeout: 20000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 20000 });
  check("[quick] no 3D button outside Gold", !(await visible(page, "#btn-court-3d")));
  check("[quick] 2D court as before", await visible(page, "#court-root"));
  check("[quick] no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
