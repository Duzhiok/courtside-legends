// Front-facing close-ups of both baseline LED boards + one normal broadcast frame, from the REAL 3D canvas (a Gold match, modern arena).
// The camera is parked in front of each board, a frame is rendered and read back in the same task (so the canvas is not blank), then the
// page's own camera is left alone. Usage: node scripts/qa/arena-led-closeup.mjs [outDir] [baseUrl] [arena=modern]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homeActive } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/led-closeup";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const ARENA = process.argv[4] || "modern";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}?arena=${ARENA}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#btn-market-done", { state: "visible", timeout: 20000 });
  await page.click("#btn-market-done");
  await page.waitForSelector("#screen-setup.active", { timeout: 20000 });
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 20000 });
  await page.click("#btn-court-3d");
  await page.waitForSelector("#court-3d-root canvas", { timeout: 30000 });
  await page.evaluate(async () => {
    const { CourtView3D } = await import("/js/engine/court3d.js");
    const o = CourtView3D.prototype._updatePlates;
    CourtView3D.prototype._updatePlates = function () { window.__view = this; return o.apply(this, arguments); };
  });
  await page.waitForFunction(() => !!window.__view, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const calls = await page.evaluate(() => Number(document.querySelector("#court-3d-root")?.dataset.drawCalls || 0));
  await page.locator("#court-3d-root").screenshot({ path: `${OUT}/${tag}-broadcast.png` });
  for (const [end, s] of [["z-plus", 1], ["z-minus", -1]]) {
    const png = await page.evaluate(async (sign) => {
      const v = window.__view;
      const { FLOOR_HALF_L } = await import("/js/engine/arena/arenaLayout.js");
      v._layoutCamera = () => {}; // park the camera: the frame loop must not move it back before we read the canvas
      const zBoard = sign * (FLOOR_HALF_L + 0.35);
      v._camera.position.set(0, 1.4, zBoard - sign * 8);
      v._camera.lookAt(0, 0.8, zBoard);
      v._camera.updateMatrixWorld?.();
      v._renderer.render(v._scene, v._camera);
      return v._renderer.domElement.toDataURL("image/png");
    }, s);
    writeFileSync(`${OUT}/${tag}-led-${end}.png`, Buffer.from(png.split(",")[1], "base64"));
  }
  console.log(`[${tag}] draw calls ${calls}, page errors ${errors.length}${errors.length ? ` — ${errors.join(" | ")}` : ""}`);
  await page.close();
}
await browser.close();
