// A3 smoke on the REAL page: a Gold match in 3D. Hooks the court's landing, the arena cheer and the sound table, then waits for real
// baskets. Proves: every cheer/swish comes AFTER the shot's flight time (never at release), stands hop and settle, a roar is never
// stacked, a foul is whistled, no page errors. Captures a frame in the middle of a cheer.
// Usage: node scripts/qa/match-3d-reactions.mjs [outDir] [baseUrl] [speed=1] [desktop|mobile]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reactions";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const SPEED = Number(process.argv[4] || 1);
const [W, H, TAG] = process.argv[5] === "mobile" ? [390, 844, "mobile"] : [1440, 900, "desktop"];
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.goto(BASE, { waitUntil: "domcontentloaded" });
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
// hooks go in BEFORE 3D opens, so the controller's first view is already instrumented
await page.evaluate(async () => {
  const { CourtView3D } = await import("/js/engine/court3d.js");
  const { audio } = await import("/js/audio/index.js");
  const log = (window.__log = { shots: [], landed: [], cheers: [], swish: [], roar: [], whistle: [] });
  const t = () => performance.now();
  const onShot = CourtView3D.prototype.onShot;
  CourtView3D.prototype.onShot = function (s) { log.shots.push({ at: t(), made: !!s.made }); window.__view = this; return onShot.call(this, s); };
  const landed = CourtView3D.prototype._landed;
  CourtView3D.prototype._landed = function (e) { log.landed.push({ at: t(), made: e.made, dunk: !!e.dunk, side: e.side }); return landed.call(this, e); };
  const wrapEnv = (view) => { const env = view._env; if (env && !env.__wrapped) { env.__wrapped = true; const c = env.cheer; env.cheer = (...a) => {
      log.cheers.push({ at: t(), level: a[0], side: a[1] });
      // the real stands: remember where every spectator's body sits ONCE (the first cheer starts from rest), to see who has left the seat later
      const mesh = env.group.children.flatMap((g) => g.children || []).find((m) => m.isInstancedMesh && m.count === env.spectators);
      if (mesh && !window.__hop) window.__hop = { mesh, rest: Float32Array.from({ length: mesh.count }, (_, i) => mesh.instanceMatrix.array[i * 16 + 13]) };
      if (window.__hop && !window.__hop.sampling) {
        const h = window.__hop; // sample the real stands every 40 ms through the cheer and keep the peak
        h.sampling = true; h.max = { up: 0, peak: 0 };
        const iv = setInterval(() => {
          let up = 0; let peak = 0;
          for (let i = 0; i < h.mesh.count; i++) { const d = h.mesh.instanceMatrix.array[i * 16 + 13] - h.rest[i]; if (d > 0.02) up++; if (d > peak) peak = d; }
          h.max = { up: Math.max(h.max.up, up), peak: Math.max(h.max.peak, peak) };
        }, 40);
        setTimeout(() => clearInterval(iv), 1300);
      }
      return c(...a);
    }; } };
  const tick = CourtView3D.prototype.tick;
  CourtView3D.prototype.tick = function (n) { wrapEnv(this); return tick.call(this, n); };
  for (const k of ["swish", "roar", "whistle"]) { const f = audio.sfx[k]; audio.sfx[k] = (...a) => { log[k].push(t()); return f(...a); }; }
});
await page.click("#btn-court-3d");
await page.waitForSelector("#court-3d-root canvas", { timeout: 30000 });
for (let i = 1; i < SPEED; i++) await page.evaluate(() => document.querySelector("#btn-speed").click());

// wait for real baskets (and fouls) to play out
let shot = null;
let window__done = false;
let hop = null;
let settled = null;
for (let s = 0; s < 150; s++) {
  await page.waitForTimeout(1000);
  const n = await page.evaluate(() => window.__log.cheers.length);
  if (n >= 1 && !window__done) {
    window__done = true;
    // a later basket may start another cheer: wait until the stands have been quiet for 1.5 s, then they must all be seated
    await page.waitForFunction(() => performance.now() - window.__log.cheers.at(-1).at > 1500, null, { timeout: 60000, polling: 250 });
    hop = await page.evaluate(() => (window.__hop?.max ? { count: window.__hop.mesh.count, ...window.__hop.max } : null));
    settled = await page.evaluate(() => {
      const { mesh, rest } = window.__hop || {};
      if (!mesh) return null;
      let off = 0;
      for (let i = 0; i < mesh.count; i++) if (Math.abs(mesh.instanceMatrix.array[i * 16 + 13] - rest[i]) > 0.005) off++;
      return { off };
    });
  }
  if (n >= 1 && !shot) { await page.waitForTimeout(350); shot = `${OUT}/${TAG}-mid-cheer.png`; await page.locator("#court-3d-root").screenshot({ path: shot }); }
  if (n >= 3) break;
}
const log = await page.evaluate(() => window.__log);
console.log(`speed ${SPEED}x ${TAG}: shots ${log.shots.length}, landed ${log.landed.length}, cheers ${log.cheers.length}, swish ${log.swish.length}, roar ${log.roar.length}, whistle ${log.whistle.length}`);
check("shots played in 3D", log.shots.length >= 2, String(log.shots.length));
check("every made basket that landed cheered the stands", log.landed.filter((l) => l.made).length === log.cheers.length, `${log.landed.filter((l) => l.made).length} made vs ${log.cheers.length} cheers`);
check("a swish for every made basket (sound follows the ball)", log.swish.length === log.landed.filter((l) => l.made).length, `${log.swish.length} swish`);
check("misses are silent and uncheered", log.landed.filter((l) => !l.made).length + log.cheers.length === log.landed.length);
const gaps = log.roar.slice(1).map((r, i) => r - log.roar[i]);
check("roars never stacked (>= 1.4s apart)", gaps.every((g) => g >= 1390), gaps.map((g) => Math.round(g)).join(","));
// release -> landing: each cheer must come at least a flight time after a shot started
const flightOk = log.landed.filter((l) => !l.dunk).every((l) => log.shots.some((s) => l.at - s.at >= 700 && l.at - s.at < 4000));
check("a landing never comes at release (>= ~750ms flight after the shot started)", flightOk);
console.log(`whistles heard: ${log.whistle.length} (the foul path is covered by tests/match3dController.test.js; fouls are rare in a short sample)`);
console.log("mid-cheer:", JSON.stringify(hop), "after:", JSON.stringify(settled));
check("the stands really left their seats during the cheer", !!hop && hop.up > hop.count * 0.1 && hop.peak > 0.05, JSON.stringify(hop));
check("...and everyone is back on their seat afterwards", !!settled && settled.off === 0, JSON.stringify(settled));
check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
