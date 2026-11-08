// Clutch 3D replay (docs/3D_BROADCAST_PLAN.md Stages 0–3) in a real browser
// with real WebGL (swiftshader): entry from the clutch result page -> 3D
// replay screen renders the settled possession (push -> shot arc / dunk),
// "Replay again" replays, back returns to the 2D result, no WebGL falls
// back to 2D with a note, English. Desktop + mobile. Mac-only (needs the
// Playwright Chromium shell); the node tests (court3dReplay) are the ones
// that run on the VM.
// Usage: node scripts/qa/clutch-3d-replay.mjs /tmp/cls-qa/clutch-3d [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/clutch-3d";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? ` — ${d}` : ""}`);
const scratch = await browser.newPage();

/** Share of pixels that differ clearly between two PNG buffers (same size expected). */
const shotDiff = (a, b) => scratch.evaluate(async ([sa, sb]) => {
  const load = (s) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = s; });
  const [ia, ib] = await Promise.all([load(sa), load(sb)]);
  const c = document.createElement("canvas");
  c.width = ia.naturalWidth; c.height = ia.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(ia, 0, 0);
  const da = ctx.getImageData(0, 0, c.width, c.height).data;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(ib, 0, 0);
  const db = ctx.getImageData(0, 0, c.width, c.height).data;
  if (da.length !== db.length) return { share: 1, note: "different sizes" };
  let diff = 0;
  for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) diff++;
  return { share: diff / (da.length / 4) };
}, [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`]);

const fresh = async (viewport, { noWebgl = false } = {}) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  if (noWebgl) await page.addInitScript(() => { const real = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : real.call(this, t, ...a); }; });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  return { page, errors };
};

const screen = (page) => page.evaluate(() => document.querySelector("main.screen.active")?.id);
const replayState = (page) => page.$eval("#clutch-3d-root", (el) => el.dataset.replayState || "").catch(() => "");
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);

/** Home -> clutch entry -> start -> pick a shooter -> submit -> result page. */
const playToResult = async (page) => {
  await page.click('.home-tab[data-category="custom"]');
  await page.click("#btn-clutch-entry");
  await page.waitForSelector("#screen-clutch.active", { timeout: 10000 });
  await page.click("#btn-clutch-start");
  await page.waitForSelector("#screen-clutch-play.active", { timeout: 10000 });
  await page.click("#clutch-shooter-list .clutch-shooter >> nth=1");
  await page.click("#btn-clutch-submit");
  await page.waitForSelector("#screen-clutch-result.active", { timeout: 15000 });
};

async function run(w, h, tag) {
  const { page, errors } = await fresh({ width: w, height: h });
  await playToResult(page);
  check(`[${tag}] result screen opens`, (await screen(page)) === "screen-clutch-result");
  check(`[${tag}] 3D Replay button is on the result page`, await visible(page, "#btn-clutch-3d-replay"));

  // A. Open the replay: 3D scene renders, the possession plays out.
  await page.click("#btn-clutch-3d-replay");
  await page.waitForSelector("#screen-clutch-3d.active", { timeout: 15000 });
  check(`[${tag}] replay screen opens`, (await screen(page)) === "screen-clutch-3d");
  await page.waitForSelector("#clutch-3d-root canvas", { timeout: 20000 });
  check(`[${tag}] 3D canvas mounts in the replay root`, (await page.locator("#clutch-3d-root canvas").count()) === 1);
  const pushShot = await page.locator("#clutch-3d-root").screenshot();
  // The replay runs push (2.6s) -> shot/dunk (<=1s) -> done; a no-shot
  // outcome (turnover/foul) goes straight to done after the push.
  const arcState = await page.waitForFunction(
    () => ["shot", "dunk", "done"].includes(document.querySelector("#clutch-3d-root")?.dataset.replayState || ""),
    null, { timeout: 20000 },
  ).then(() => replayState(page)).catch(() => "timeout");
  check(`[${tag}] replay leaves the push phase (state: ${arcState})`, ["shot", "dunk", "done"].includes(arcState));
  let arcShot = null;
  if (arcState === "shot" || arcState === "dunk") {
    arcShot = await page.locator("#clutch-3d-root").screenshot();
    check(`[${tag}] shot/dunk arc is playing (state: ${arcState})`, true);
  }
  await page.waitForFunction(
    () => document.querySelector("#clutch-3d-root")?.dataset.replayState === "done",
    null, { timeout: 20000 },
  );
  check(`[${tag}] replay reaches done`, (await replayState(page)) === "done");
  const doneShot = await page.locator("#clutch-3d-root").screenshot();
  const moved = await shotDiff(pushShot, doneShot);
  check(`[${tag}] scene visibly moves during the replay`, moved.share > 0.002, `share ${moved.share.toFixed(4)}`);
  if (arcShot) {
    const arcMoved = await shotDiff(arcShot, doneShot);
    check(`[${tag}] ball/figures move between the arc and the end`, arcMoved.share > 0.0005, `share ${arcMoved.share.toFixed(4)}`);
  }
  check(`[${tag}] replay status text is set`, (await text(page, "#clutch-3d-status")).length > 0);
  check(`[${tag}] no horizontal overflow (replay)`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-replay-done.png`);

  // B. Replay again: the push runs a second time and reaches done again.
  await page.click("#btn-clutch-3d-again");
  await page.waitForFunction(
    () => document.querySelector("#clutch-3d-root")?.dataset.replayState === "done",
    null, { timeout: 20000 },
  );
  check(`[${tag}] Replay again reaches done`, (await replayState(page)) === "done");

  // C. Back: the 3D view is disposed and the 2D result returns.
  await page.click("#btn-clutch-3d-back");
  await page.waitForSelector("#screen-clutch-result.active", { timeout: 10000 });
  check(`[${tag}] replay back returns to the 2D result`, (await screen(page)) === "screen-clutch-result");
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();

  // D. No WebGL: the button stays on the 2D result with a note, no errors.
  const nog = await fresh({ width: w, height: h }, { noWebgl: true });
  await playToResult(nog.page);
  await nog.page.click("#btn-clutch-3d-replay");
  await nog.page.waitForTimeout(1500);
  check(`[${tag}] no WebGL: stays on the 2D result`, (await screen(nog.page)) === "screen-clutch-result");
  check(`[${tag}] no WebGL: fallback note shown`, await visible(nog.page, "#clutch-3d-note") && (await text(nog.page, "#clutch-3d-note")).length > 5);
  check(`[${tag}] no WebGL: no page errors`, nog.errors.length === 0, nog.errors.join(" | ").slice(0, 200));
  await nog.page.close();

  // E. English: replay labels translate, no Chinese on the replay screen.
  const en = await fresh({ width: w, height: h });
  await en.page.click("#btn-lang");
  await playToResult(en.page);
  check(`[${tag}] English: replay button reads 3D Replay`, (await text(en.page, "#btn-clutch-3d-replay")) === "3D Replay");
  await en.page.click("#btn-clutch-3d-replay");
  await en.page.waitForSelector("#screen-clutch-3d.active", { timeout: 15000 });
  await en.page.waitForFunction(
    () => document.querySelector("#clutch-3d-root")?.dataset.replayState === "done",
    null, { timeout: 20000 },
  );
  const txt = await en.page.$eval("#screen-clutch-3d", (n) => n.innerText);
  check(`[${tag}] English: no Chinese on the replay screen`, !CJK.test(txt), CJK.test(txt) ? txt.match(CJK.source + ".{0,20}")?.[0] : "");
  check(`[${tag}] English: heading is Clutch 3D Replay`, txt.includes("Clutch 3D Replay"));
  await en.page.close();
}

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  await run(w, h, tag);
}

await scratch.close();
await browser.close();
console.log(out.join("\n"));
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
