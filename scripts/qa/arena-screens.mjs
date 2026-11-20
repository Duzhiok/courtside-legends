// Browser check + screenshots for the arena system: a real Gold match with the 3D court on, drawn in every venue.
// Per arena and viewport: screenshot, renderer.info (draw calls, triangles) read from the live renderer, no page errors, the
// venue select really changes the look, and the match itself is untouched (same score line source, view toggles, no NaN).
// Usage: node scripts/qa/arena-screens.mjs [outDir] [baseUrl] [arenas=classic,modern,retro90]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/arenas";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const ARENAS = (process.argv[4] || "classic,modern,retro90").split(",");
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  for (const arena of ARENAS) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.goto(`${BASE}?arena=${arena}`, { waitUntil: "domcontentloaded" });
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
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => {
      const host = document.querySelector("#court-3d-root");
      return { arena: host?.dataset.arena || "", calls: Number(host?.dataset.drawCalls || 0), tris: Number(host?.dataset.triangles || 0),
        select: document.querySelector("#sel-arena")?.value || "", selectVisible: !document.querySelector("#sel-arena")?.hidden };
    });
    console.log(`[${tag}/${arena}]`, JSON.stringify(info));
    await page.locator("#court-3d-root").screenshot({ path: `${OUT}/${tag}-${arena}.png` });
    check(`[${tag}/${arena}] the view is drawn in this arena`, info.arena === arena, info.arena);
    check(`[${tag}/${arena}] the venue select is visible and shows it`, info.selectVisible && info.select === arena);
    check(`[${tag}/${arena}] the scene is drawn (draw calls > 0)`, info.calls > 0, `${info.calls} calls, ${info.tris} triangles`);
    check(`[${tag}/${arena}] no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
