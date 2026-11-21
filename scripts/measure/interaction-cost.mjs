/* global window, document, performance, requestAnimationFrame, PerformanceObserver, localStorage */
// Where does the app make the player wait? Drives the real pages and prints, per action, "click -> two frames later" (everything the
// handler does synchronously counts) plus every main-thread long task (>=50 ms) that happened during it. CPU is throttled (default 4x,
// a mid phone). Usage: node scripts/measure/interaction-cost.mjs [baseUrl] [cpuRate=4] [only=boot,home,season,rotation,game]
import { chromium } from "playwright-core";
import { homeActive } from "../qa/lib/page.mjs";
import { createCareerInPage } from "../qa/lib/career.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5420/";
const RATE = Number(process.argv[3] || 4);
const ONLY = new Set((process.argv[4] || "boot,home,season,rotation,game").split(","));
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const rows = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ at: e.startTime, dur: e.duration }); }).observe({ entryTypes: ["longtask"] }); } catch { /* none */ }
});
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const throttle = (rate) => cdp.send("Emulation.setCPUThrottlingRate", { rate });

/** Run one in-page action (a function body string clicking something) and time click -> 2 frames; collect long tasks inside the window. */
async function act(group, label, selector, { wait = null } = {}) {
  await page.evaluate(() => { window.__lt.length = 0; });
  const m0 = await metrics();
  const ms = await page.evaluate(async (sel) => {
    const el = typeof sel === "string" ? document.querySelector(sel) : null;
    if (!el) return -1;
    const t0 = performance.now();
    el.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t0;
  }, selector);
  if (wait) await page.waitForSelector(wait, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(250);
  const lt = await page.evaluate(() => window.__lt.map((e) => Math.round(e.dur)));
  const m1 = await metrics();
  const d = (k) => Math.round((m1[k] - m0[k]) * 1000);
  rows.push({ group, label, ms: Math.round(ms), longest: Math.max(0, ...lt), tasks: lt.length, note: `js ${d("ScriptDuration")} style ${d("RecalcStyleDuration")} layout ${d("LayoutDuration")} tasks ${d("TaskDuration")}` });
}

async function boot() {
  await throttle(RATE);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  const t1 = Date.now();
  await page.waitForFunction(() => window.__rosterBootOk === true, null, { timeout: 120000 });
  await homeActive(page);
  const lt = await page.evaluate(() => window.__lt.map((e) => Math.round(e.dur)).sort((a, b) => b - a));
  rows.push({ group: "boot", label: `cold boot (reload -> usable), ${RATE}x CPU`, ms: Date.now() - t1, longest: lt[0] || 0, tasks: lt.length });
  rows.push({ group: "boot", label: "  top long tasks (ms)", ms: 0, longest: 0, tasks: 0, note: lt.slice(0, 8).join(", ") });
  await page.waitForTimeout(12000); // let the deferred boot work (avatars, audio, cache writes) finish before measuring a tap
}

async function home() {
  const cats = await page.$$eval(".home-tab[data-category]", (els) => els.map((e) => e.dataset.category));
  for (const c of [...cats, ...cats]) await act("home", `home tab "${c}"`, `.home-tab[data-category="${c}"]`);
}

async function season() {
  await throttle(1);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.evaluate(createCareerInPage, {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await throttle(RATE);
  await page.waitForTimeout(12000); // quiet first: the deferred boot work competes with the tap otherwise
  await page.evaluate(() => { window.__lt.length = 0; });
  const t0 = Date.now();
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 60000 });
  rows.push({ group: "season", label: "resume league career -> hub visible", ms: Date.now() - t0, longest: Math.max(0, ...(await page.evaluate(() => window.__lt.map((e) => Math.round(e.dur))))), tasks: 0 });
  const tabs = await page.$$eval("[data-season-tab]", (els) => els.filter((e) => !e.disabled && e.offsetParent).map((e) => e.dataset.seasonTab));
  for (const t of tabs) await act("season", `season tab "${t}"`, `[data-season-tab="${t}"]`);
}

async function rotation() {
  await act("rotation", "open rotation board (1st)", '[data-season-tab="rotation"]', { wait: "#season-rotation .rot-row" });
  for (const n of [2, 3]) {
    await act("rotation", "  away to standings", '[data-season-tab="standings"]');
    await act("rotation", `open rotation board (${n}${n === 2 ? "nd" : "rd"})`, '[data-season-tab="rotation"]', { wait: "#season-rotation .rot-row" });
  }
  const n = await page.$$eval("#season-rotation .rot-start-cb", (els) => els.length);
  for (let i = 0; i < Math.min(n, 6); i++) {
    await page.evaluate((k) => { window.__cb = document.querySelectorAll("#season-rotation .rot-start-cb")[k]; window.__cb.id = `qa-cb-${k}`; }, i);
    await act("rotation", `toggle starter checkbox #${i}`, `#qa-cb-${i}`);
  }
  for (let i = 0; i < 3; i++) {
    await page.evaluate((k) => { const el = document.querySelectorAll("#season-rotation .rot-min")[k]; if (el) { el.id = `qa-min-${k}`; } }, i);
    const ms = await page.evaluate(async (k) => {
      const el = document.querySelector(`#qa-min-${k}`);
      if (!el) return -1;
      window.__lt.length = 0;
      const t0 = performance.now();
      el.value = String(Number(el.value) + 2);
      el.dispatchEvent(new window.Event("input", { bubbles: true }));
      el.dispatchEvent(new window.Event("change", { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t0;
    }, i);
    const lt = await page.evaluate(() => window.__lt.map((e) => Math.round(e.dur)));
    rows.push({ group: "rotation", label: `change minutes of row #${i}`, ms: Math.round(ms), longest: Math.max(0, ...lt), tasks: lt.length });
  }
}

async function game() {
  await page.evaluate(() => { window.__lt.length = 0; });
  const t0 = Date.now();
  await page.evaluate(() => document.querySelector("#btn-season-play")?.click());
  await page.waitForSelector("#screen-setup.active", { timeout: 30000 });
  rows.push({ group: "game", label: "season hub -> setup screen", ms: Date.now() - t0, longest: Math.max(0, ...(await page.evaluate(() => window.__lt.map((e) => Math.round(e.dur))))), tasks: 0 });
  await page.evaluate(() => { window.__lt.length = 0; });
  const t1 = Date.now();
  await page.evaluate(() => document.querySelector("#btn-setup-confirm").click());
  await page.waitForSelector("#screen-game.active", { timeout: 30000 });
  rows.push({ group: "game", label: "confirm lineup -> game screen", ms: Date.now() - t1, longest: Math.max(0, ...(await page.evaluate(() => window.__lt.map((e) => Math.round(e.dur))))), tasks: 0 });
  // frame pacing while the game runs for real
  for (const speed of ["1x", "3x"]) {
    const btn = await page.evaluate((s) => { const b = [...document.querySelectorAll("#screen-game button, #screen-game [data-speed]")].find((x) => (x.dataset.speed || x.textContent).trim().replace("×", "x") === s || x.dataset.speed === s.replace("x", "")); if (b) { b.click(); return true; } return false; }, speed);
    const frames = await page.evaluate(() => new Promise((resolve) => {
      window.__lt.length = 0;
      const gaps = []; let last = performance.now(); const end = last + 8000;
      const tick = (t) => { gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else resolve({ gaps, lt: window.__lt.map((e) => Math.round(e.dur)) }); };
      requestAnimationFrame(tick);
    }));
    const g = [...frames.gaps].sort((a, b) => a - b);
    const p = (q) => Math.round(g[Math.min(g.length - 1, Math.floor(g.length * q))]);
    rows.push({ group: "game", label: `live game ${speed}${btn ? "" : " (speed button not found)"}: frame gap p50/p95/max over 8 s`, ms: p(0.5), longest: Math.max(0, ...frames.lt), tasks: frames.lt.length, note: `p95 ${p(0.95)} ms, max ${Math.round(g[g.length - 1])} ms, frames ${g.length}` });
  }
}

if (ONLY.has("boot")) await boot();
if (ONLY.has("home")) await home();
if (ONLY.has("season") || ONLY.has("rotation") || ONLY.has("game")) await season();
if (ONLY.has("rotation")) await rotation();
if (ONLY.has("game")) await game();
console.log(`CPU ${RATE}x, 390x844. ms = click -> 2 frames (or the stated span); longest = longest main-thread task in it.`);
for (const r of rows) console.log(`${r.group.padEnd(8)} ${String(r.ms).padStart(6)} ms  long ${String(r.longest).padStart(5)} (${r.tasks})  ${r.label}${r.note ? `  [${r.note}]` : ""}`);
console.log("page errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
