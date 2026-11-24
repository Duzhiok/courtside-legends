// Browser check for the experimental GLB court players (?players3d=1) vs the capsule baseline.
// Per viewport and mode: real career match with the 3D court on, screenshots at several moments, renderer.info (draw calls,
// triangles), rAF frame rate over a 4 s window, page errors, and which figure set is really in use (data-players).
// Usage: node scripts/qa/players3d.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/players3d";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

// QA_GL=gpu tries the Mac GPU (ANGLE/Metal) for meaningful fps; the default is software GL (draw calls / tris only are comparable).
const GL_ARGS = process.env.QA_GL === "gpu" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"];
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  for (const mode of ["capsule", "glb"]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.goto(`${BASE}${mode === "glb" ? "?players3d=1" : ""}`, { waitUntil: "domcontentloaded" });
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
    const root = page.locator("#court-3d-root");
    for (let i = 0; i < 3; i++) {
      await root.screenshot({ path: `${OUT}/${tag}-${mode}-${i}.png` });
      await page.waitForTimeout(900);
    }
    const perf = await page.evaluate(() => new Promise((resolve) => {
      let frames = 0;
      let worst = 0;
      let last = performance.now();
      const t0 = last;
      const f = (now) => {
        frames += 1;
        worst = Math.max(worst, now - last);
        last = now;
        if (now - t0 < 4000) requestAnimationFrame(f);
        else {
          const host = document.querySelector("#court-3d-root");
          resolve({ fps: +(frames / ((now - t0) / 1000)).toFixed(1), worstFrameMs: +worst.toFixed(1), calls: Number(host?.dataset.drawCalls || 0), tris: Number(host?.dataset.triangles || 0), players: host?.dataset.players || "" });
        }
      };
      requestAnimationFrame(f);
    }));
    console.log(`[${tag}/${mode}]`, JSON.stringify(perf));
    check(`[${tag}/${mode}] figure set in use`, perf.players === mode, perf.players);
    check(`[${tag}/${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
    await page.close();
  }
}
await browser.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
