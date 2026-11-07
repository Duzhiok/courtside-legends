// 3D avatar spike (ADR-008a N-1f step 1): loads, draws, idles, rotates on drag, falls back cleanly,
// and the real game never downloads Three.js or the model. Desktop + mobile viewport.
// Usage: node scripts/qa/avatar3d-spike.mjs /tmp/cls-qa/avatar [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/avatar";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const SPIKE = `${BASE}scripts/spike/avatar3d.html`;

const open = async (viewport, { noWebgl = false, query = "" } = {}) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  if (noWebgl) {
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(type) ? null : real.call(this, type, ...rest); };
    });
  }
  await page.goto(SPIKE + query, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__avatar || window.__avatarError, null, { timeout: 15000 }).catch(() => {});
  return { page, errors, requests };
};
const litPixels = async (page, path) => {
  const buf = await page.locator("#stage").screenshot({ path });
  return buf;
};

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  // 1. happy path
  const { page, errors, requests } = await open({ width: w, height: h });
  const ready = await page.evaluate(() => !!window.__avatar);
  check(`[${tag}] avatar mounts`, ready, await page.evaluate(() => window.__avatarError || ""));
  if (ready) {
    const ms = await page.evaluate(() => window.__firstFrameMs);
    check(`[${tag}] first frame under the 4s budget`, ms < 4000, `${ms}ms (software GL, headless)`);
    const sizes = await Promise.all(requests.filter((u) => /three-avatar|\.glb/.test(u)).map(async (u) => [u.split("/").pop(), await page.evaluate((url) => fetch(url).then((r) => r.arrayBuffer()).then((b) => b.byteLength), u)]));
    const total = sizes.reduce((s, [, n]) => s + n, 0);
    check(`[${tag}] library + model under 1.5 MB raw`, sizes.length === 2 && total < 1.5 * 1024 * 1024, `${sizes.map(([n, b]) => `${n}=${Math.round(b / 1024)}KB`).join(" ")}`);
    const a = await litPixels(page, `${OUT}/${tag}-idle-a.png`);
    await page.waitForTimeout(400);
    const b = await litPixels(page, `${OUT}/${tag}-idle-b.png`);
    // The backdrop gradient alone is a big PNG, so compare the stage with and without the canvas instead.
    await page.evaluate(() => { window.__avatar.canvas.style.visibility = "hidden"; });
    const bare = await litPixels(page, `${OUT}/${tag}-bare.png`);
    await page.evaluate(() => { window.__avatar.canvas.style.visibility = ""; });
    check(`[${tag}] the canvas really paints a figure`, !bare.equals(a) && Math.abs(a.length - bare.length) > 3000, `${a.length} vs ${bare.length} bytes`);
    check(`[${tag}] idle animation is moving`, !a.equals(b));
    const r0 = await page.evaluate(() => window.__avatar.rotationY());
    const box = await page.locator("#stage").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const r1 = await page.evaluate(() => window.__avatar.rotationY());
    check(`[${tag}] drag rotates the avatar`, Math.abs(r1 - r0) > 0.5, `${r0.toFixed(2)} -> ${r1.toFixed(2)}`);
    await litPixels(page, `${OUT}/${tag}-rotated.png`);
    const frames = await page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; performance.now() - t < 1500 ? requestAnimationFrame(f) : res(n / 1.5); }; f(); }));
    out.push(`INFO [${tag}] ~${frames.toFixed(0)} fps in headless software GL (not a device measurement)`);
    await page.evaluate(() => window.__avatar.dispose());
    check(`[${tag}] dispose removes the canvas`, (await page.locator("#stage canvas").count()) === 0);
  }
  check(`[${tag}] no page errors`, !errors.length, errors.join(" | ").slice(0, 160));
  await page.close();

  // 2. model 404 -> clean failure, no leftover canvas
  const bad = await open({ width: w, height: h }, { query: "?src=/assets/avatar3d/missing.glb" });
  check(`[${tag}] missing model rejects`, !!(await bad.page.evaluate(() => window.__avatarError)));
  check(`[${tag}] missing model leaves no canvas`, (await bad.page.locator("#stage canvas").count()) === 0);
  await bad.page.close();

  // 3. no WebGL -> rejects without even downloading Three.js
  const nogl = await open({ width: w, height: h }, { noWebgl: true });
  check(`[${tag}] no WebGL rejects`, (await nogl.page.evaluate(() => window.__avatarError)) === "WebGL unavailable");
  check(`[${tag}] no WebGL downloads nothing heavy`, !nogl.requests.some((u) => /three-avatar|\.glb/.test(u)));
  await nogl.page.close();

  // 4. the real game never loads it
  const game = await browser.newPage({ viewport: { width: w, height: h } });
  const gameReq = [];
  game.on("request", (r) => gameReq.push(r.url()));
  await game.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(game);
  for (const id of ["world", "players", "career", "custom"]) await game.click(`.home-tab[data-category="${id}"]`);
  check(`[${tag}] game home (all tabs) loads no Three.js / model`, !gameReq.some((u) => /three|\.glb/.test(u)), gameReq.filter((u) => /three|\.glb/.test(u)).join(","));
  await game.close();
}
await browser.close();
console.log(out.join("\n"));
console.log(`${out.filter((l) => l.startsWith("PASS")).length}/${out.filter((l) => !l.startsWith("INFO")).length} passed`);
