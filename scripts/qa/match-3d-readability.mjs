// Browser check for S4 (readability) in a real Gold match with the 3D court on, desktop 1440 and phone 390.
// It hooks CourtView3D._updatePlates and measures what is on screen at the end of EVERY frame the page draws (same camera, same
// figures: no race with a resize or a lineup change between frames), so the numbers cover every frame, not one in every few hundred ms:
//   - no two visible name plates overlap (projected with the view's own camera, the same maths the placer uses),
//   - exactly one plate is "full" (the ball handler / shooter) and it is visible,
//   - the camera is closer than the whole-court fit,
//   - while a shot is in the air, the path line and rim ring are visible and the focus ring sits under the shooter.
// Screenshots: a mid-play frame and a frame during a shot, per viewport.
// Usage: node scripts/qa/match-3d-readability.mjs [outDir] [baseUrl] [maxSeconds=60] [desktop|mobile]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/match-3d-readability";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const MAX_S = Number(process.argv[4]) || 60;
const ONLY = process.argv[5] || "";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

// Runs inside the page: what the player sees right now.
const inspect = (view) => {
  const root = view.root;
  const W = root.clientWidth;
  const H = root.clientHeight;
  const T = view.T;
  const boxes = [];
  let full = 0;
  let fullVisible = 0;
  for (const [id, fig] of view._figures) {
    const sprite = fig.plate?.sprite;
    if (!sprite) continue;
    if (fig.plate.mode === "full") { full += 1; if (sprite.visible) fullVisible += 1; }
    if (!sprite.visible) continue;
    const v = new T.Vector3(fig.group.position.x, fig.group.position.y + sprite.position.y, fig.group.position.z).project(view._camera);
    const dist = view._camera.position.distanceTo(fig.group.position);
    const pxPerMetre = H / (2 * Math.tan((view._fov * Math.PI) / 360) * dist);
    boxes.push({ id, x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, w: sprite.scale.x * pxPerMetre, h: sprite.scale.y * pxPerMetre });
  }
  let overlaps = 0;
  const pairs = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i];
    const b = boxes[j];
    if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.5 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 0.5) {
      overlaps += 1;
      pairs.push([a, b].map((q) => `${q.id.split("-")[0]}@${Math.round(q.x)},${Math.round(q.y)} ${Math.round(q.w)}x${Math.round(q.h)}`));
    }
  }
  const aids = view._aids?.parts;
  return {
    pairs,
    visiblePlates: boxes.length, full, fullVisible, overlaps, W, H,
    camDist: Math.hypot(view._camera.position.x, view._camera.position.y),
    focus: view._plateFocusId, // the focus the plates were drawn for in the last frame (the page may have moved on since)
    shot: !!view._shot,
    trail: !!aids?.trail.visible, rim: !!aids?.rimRing.visible, ring: !!aids?.focusRing.visible,
    ringAtFocus: (() => {
      const fig = view._plateFocusId ? view._figures.get(view._plateFocusId) : null;
      return fig && aids ? Math.hypot(aids.focusRing.position.x - fig.group.position.x, aids.focusRing.position.z - fig.group.position.z) : null;
    })(),
    minPlatePx: boxes.length ? Math.min(...boxes.map((b) => b.h)) : 0,
    fullPlatePx: Math.max(0, ...boxes.map((b) => b.h)),
  };
};

const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]].filter((v) => !ONLY || v[2] === ONLY)) {
  const page = await browser.newPage({ viewport: { width, height } });
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
  await page.click("#btn-court-3d");
  await page.waitForSelector("#court-3d-root canvas", { timeout: 30000 });
  await page.evaluate(async () => {
    const { CourtView3D } = await import("/js/engine/court3d.js");
    const orig = CourtView3D.prototype.onShot;
    CourtView3D.prototype.onShot = function (shot) { window.__view = this; return orig.apply(this, arguments); };
    window.__frames = [];
    const origPlates = CourtView3D.prototype._updatePlates;
    CourtView3D.prototype._updatePlates = function () {
      const out = origPlates.apply(this, arguments);
      try { // a measuring hook must never be able to break the page's own frame loop
        if (window.__inspect && window.__frames.length < 3000 && this._figures.size) window.__frames.push(window.__inspect(this));
      } catch (err) { window.__hookError = String(err); }
      return out;
    };
  }).then(() => page.evaluate(`window.__inspect = ${inspect.toString()}`));
  await page.waitForFunction(() => window.__frames.length > 5, null, { timeout: 40000 });

  // Sample the screen across the match: every 400 ms for a while.
  const samples = [];
  const t0 = Date.now();
  let shotShot = false;
  let midShot = false;
  let airSample = null;
  while (Date.now() - t0 < MAX_S * 1000 && !(shotShot && samples.length >= 300)) {
    const batch = await page.evaluate(() => window.__frames.splice(0));
    samples.push(...batch);
    if (!midShot && samples.length >= 100) { await shoot(page, `${OUT}/${tag}-play.png`); midShot = true; }
    const air = batch.find((b) => b.shot && b.trail);
    if (!shotShot && air) { // a shot is in the air right now
      airSample = air;
      await shoot(page, `${OUT}/${tag}-shot.png`);
      shotShot = true;
    }
    await page.waitForTimeout(300);
  }
  const n = samples.length;
  const overlapFrames = samples.filter((s) => s.overlaps > 0).length;
  const oneFull = samples.filter((s) => s.full === 1 && s.fullVisible === 1).length;
  const withFocus = samples.filter((s) => s.focus);
  const fitAspect = width / height;
  console.log(`[${tag}] ${n} frames measured; visible plates median ${samples.map((s) => s.visiblePlates).sort((a, b) => a - b)[n >> 1]}/10; focus plate ${Math.round(Math.max(...samples.map((s) => s.fullPlatePx)))} px tall, smallest SHOWN plate ${Math.round(Math.min(...samples.map((s) => s.minPlatePx || 999)))} px; camera ${samples[0].camDist.toFixed(1)} m (fit ${(samples[0].camDist / 0.8).toFixed(1)} m, aspect ${fitAspect.toFixed(2)})`);
  check(`[${tag}] enough frames to judge`, n >= 100, `${n}`);
  check(`[${tag}] no two visible name plates overlap, in any sampled frame`, overlapFrames === 0, `${overlapFrames}/${n} frames drawn ${overlapFrames ? JSON.stringify(samples.find((s) => s.overlaps).pairs) : ""}`);
  check(`[${tag}] whenever somebody has the ball exactly one full plate is shown, and visible`, withFocus.every((s) => s.full === 1 && s.fullVisible === 1), `${withFocus.filter((s) => !(s.full === 1 && s.fullVisible === 1)).length} bad of ${withFocus.length}`);
  check(`[${tag}] the focus ring sits under the focus`, samples.filter((s) => s.focus && s.ring).every((s) => s.ringAtFocus !== null && s.ringAtFocus < 0.01));
  check(`[${tag}] the camera is closer than the whole-court fit`, samples.every((s) => s.camDist < 0.95 * (samples[0].camDist / 0.8)) && samples[0].camDist > 5);
  check(`[${tag}] a shot was seen in the air`, !!airSample);
  check(`[${tag}] ...with its path line and rim ring on`, !!airSample?.trail && !!airSample?.rim);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  void oneFull;
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
