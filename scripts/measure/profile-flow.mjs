/* global document, localStorage */
// CPU profile of one slow interaction, app functions only (CPU=4 env: throttled like a mid phone). Usage: node scripts/measure/profile-flow.mjs <scenario> [baseUrl] [rows=18]
//   scenarios: home-career | home-players | season-resume | rotation-open | setup-open
import { chromium } from "playwright-core";
import { homeActive } from "../qa/lib/page.mjs";
import { createCareerInPage } from "../qa/lib/career.mjs";

const SCENARIO = process.argv[2] || "home-career";
const BASE = process.argv[3] || "http://127.0.0.1:5420/";
const ROWS = Number(process.argv[4] || 18);
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload({ waitUntil: "domcontentloaded" });
await homeActive(page);
if (SCENARIO.startsWith("season") || SCENARIO.startsWith("rotation") || SCENARIO.startsWith("setup")) {
  await page.evaluate(createCareerInPage, {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
}
await page.waitForTimeout(3000);
const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
const hubUp = () => page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 60000 });

// get to the state just before the action to profile
let action;
if (SCENARIO === "home-career") { await click('.home-tab[data-category="custom"]'); await click('.home-tab[data-category="career"]'); await page.waitForTimeout(1500); await click('.home-tab[data-category="custom"]'); action = () => click('.home-tab[data-category="career"]'); }
else if (SCENARIO === "home-players") { await click('.home-tab[data-category="players"]'); await page.waitForTimeout(1500); await click('.home-tab[data-category="custom"]'); action = () => click('.home-tab[data-category="players"]'); }
else if (SCENARIO === "season-resume") action = async () => { await click("#btn-long-career-resume"); await hubUp(); };
else { await click("#btn-long-career-resume"); await hubUp(); await page.waitForTimeout(1500);
  if (SCENARIO === "rotation-open") action = async () => { await click('[data-season-tab="rotation"]'); await page.waitForSelector("#season-rotation .rot-row"); };
  else action = async () => { await click("#btn-season-play"); await page.waitForSelector("#screen-setup.active"); }; }

const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
if (process.env.CPU) await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU) }); // CPU=4 to profile as a slow phone
await cdp.send("Performance.enable");
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const m0 = await metrics();
await cdp.send("Profiler.start");
const t0 = Date.now();
await action();
await page.waitForTimeout(400);
const wall = Date.now() - t0;
const m1 = await metrics();
const ms = (k) => Math.round((m1[k] - m0[k]) * 1000);
const { profile } = await cdp.send("Profiler.stop");
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const keyOf = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-2).join("/").split("?")[0]}:${n.callFrame.lineNumber + 1}`;
const isApp = (n) => /\/js\/|app\.js/.test(n.callFrame.url);
const self = new Map(); const incl = new Map();
profile.samples.forEach((id, i) => {
  const dt = (profile.timeDeltas[i] || 0) / 1000;
  const n = nodes.get(id);
  if (isApp(n)) self.set(keyOf(n), (self.get(keyOf(n)) || 0) + dt);
  const seen = new Set();
  for (let cur = id; cur != null; cur = parent.get(cur)) { const m = nodes.get(cur); if (!isApp(m)) continue; const k = keyOf(m); if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); }
});
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join("\n");
console.log(`${SCENARIO}: ${wall} ms wall | browser time: script ${ms("ScriptDuration")}, style recalc ${ms("RecalcStyleDuration")} (${m1.RecalcStyleCount - m0.RecalcStyleCount}x), layout ${ms("LayoutDuration")} (${m1.LayoutCount - m0.LayoutCount}x), all tasks ${ms("TaskDuration")} ms; DOM nodes ${m1.Nodes}\n-- self (app code)\n${top(self, 8)}\n-- inclusive (app code)\n${top(incl, ROWS)}`);
await browser.close();
