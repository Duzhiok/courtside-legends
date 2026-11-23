// B22 coach bench simple / advanced - real browser smoke.
//   node scripts/qa/coach-bench-modes.mjs <outDir> [baseUrl]
// Desktop 1440 + phone 390: fresh device starts simple (three tactics, no advanced panels, nothing overflows) -> Advanced shows everything again ->
// the choice survives a reload -> back to simple keeps the pending tactic -> a simple-mode tactic is really applied (GameSim's own feed line) -> English label.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { enterLiveGame } from "./lib/liveGame.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/coach-bench-modes";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed++; report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };
const browser = await chromium.launch({ executablePath: EXE });

const SIMPLE_HIDDEN = ["#defense-panel", "#player-orders-panel", "#live-phil-panel", ".pos-live-panel", ".coach-panel .meter", "#btn-talk", "#btn-auto-offense", "#btn-auto-defense", "#btn-auto-rotation",
  "#btn-tier-balanced", "#managed-hint", "#tempo-select", "#focus-play-select", "#takeover-focus-select"];
const ALWAYS_VISIBLE = ["#btn-resume", "#btn-speed", "#btn-quick-sim", "#btn-save-game", "#btn-save-leave", "#tactic-select", "#btn-set-tactic", "#takeover-tempo-row", "#bench-you", "#btn-coach-mode"];

// Visible means rendered AND not clipped away by a scrolling/hidden ancestor (the first version of this check ignored clipping and reported a panel PASS
// while the desktop coach box was hiding the tactic dropdown behind its own scrollbar).
const seen = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s); if (!el) return false;
  const b = el.getBoundingClientRect();
  if (el.hidden || getComputedStyle(el).display === "none" || b.width <= 0 || b.height <= 0) return false;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (!/(hidden|auto|scroll|clip)/.test(getComputedStyle(p).overflowY)) continue;
    const q = p.getBoundingClientRect();
    if (b.bottom > q.bottom + 1 || b.top < q.top - 1) return false;
  }
  return true;
}, sel);
// Rendered: not display:none (advanced mode is a tall box that scrolls inside the desktop coach panel, by design, so "back" only has to mean rendered).
const rendered = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const b = el.getBoundingClientRect(); return !el.hidden && getComputedStyle(el).display !== "none" && b.width > 0 && b.height > 0; }, sel);
const options = (page) => page.$$eval("#tactic-select option", (os) => os.map((o) => ({ v: o.value, t: o.textContent.replace(/\s+/g, " ").trim() })));

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterLiveGame(page, BASE, "Coach Bench QA");
  await page.waitForTimeout(1200);

  // the toggle only shows with the drawer: live play keeps the slim bar, a timeout opens the panel
  await page.click("#btn-timeout");
  await page.waitForFunction(() => !document.querySelector("#btn-resume").hidden, null, { timeout: 15000 });
  await page.waitForTimeout(300);

  check(`[${tag}] a fresh device starts in simple mode`, (await page.getAttribute(".coach-panel", "data-coach-mode")) === "simple");
  check(`[${tag}] the toggle says Advanced and is not pressed`, (await page.getAttribute("#btn-coach-mode", "aria-pressed")) === "false" && (await page.textContent("#btn-coach-mode")).trim() === "高级");
  const box = await page.$eval("#btn-coach-mode", (el) => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height }; });
  check(`[${tag}] the toggle is a 44px touch target`, box.h >= 43 && box.w >= 43, `${box.w}x${box.h}`);
  for (const sel of ALWAYS_VISIBLE) check(`[${tag}] simple: ${sel} stays visible`, await seen(page, sel));
  for (const sel of SIMPLE_HIDDEN) check(`[${tag}] simple: ${sel} is hidden`, !(await seen(page, sel)));
  const three = await options(page);
  check(`[${tag}] simple: the tactic dropdown offers three tactics (flat, no groups)`, three.length === 3 && (await page.$$eval("#tactic-select optgroup", (g) => g.length)) === 0, three.map((o) => o.t).join(" / "));
  const fit = await page.$eval(".coach-panel", (el) => ({ need: el.scrollHeight, have: el.clientHeight }));
  check(`[${tag}] simple: the open panel needs no scrolling`, fit.need - fit.have <= 2, `content ${fit.need}px in ${fit.have}px`);
  check(`[${tag}] simple: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: `${OUT}/${tag}-simple.png`, fullPage: true });

  // a simple-mode tactic is a real GameSim tactic: pick one that is not the current one and apply it
  const current = await page.$eval("#tactic-select", (s) => s.value);
  const pick = three.find((o) => o.v !== current);
  await page.selectOption("#tactic-select", pick.v);
  await page.click("#btn-set-tactic");
  await page.waitForTimeout(250);
  const feed = await page.$eval("#play-feed", (el) => el.textContent);
  check(`[${tag}] simple: applying "${pick.t}" reaches GameSim (its own feed line)`, feed.includes(`「${pick.t.replace(/ ★$/, "")}」`) || feed.includes(`"${pick.t.replace(/ ★$/, "")}"`), feed.slice(0, 120));
  const same = await options(page);
  check(`[${tag}] simple: picking one does not reshuffle the other two`, same.map((o) => o.v).sort().join() === three.map((o) => o.v).sort().join());

  // advanced
  await page.click("#btn-coach-mode");
  await page.waitForTimeout(200);
  check(`[${tag}] Advanced: attribute, pressed state and stored preference`, (await page.getAttribute(".coach-panel", "data-coach-mode")) === "advanced" && (await page.getAttribute("#btn-coach-mode", "aria-pressed")) === "true" && (await page.evaluate(() => localStorage.getItem("cls_coach_mode_v1"))) === "advanced");
  for (const sel of SIMPLE_HIDDEN) check(`[${tag}] advanced: ${sel} is back`, await rendered(page, sel));
  const all = await options(page);
  check(`[${tag}] advanced: the full, grouped tactic list is back and keeps the pick`, all.length > 10 && (await page.$$eval("#tactic-select optgroup", (g) => g.length)) > 1 && (await page.$eval("#tactic-select", (s) => s.value)) === pick.v, `${all.length} options`);
  await page.screenshot({ path: `${OUT}/${tag}-advanced.png`, fullPage: true });

  // remembered across a reload (the real boot code sets the attribute)
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 90000 });
  check(`[${tag}] the choice survives a reload`, (await page.getAttribute("#screen-game .coach-panel", "data-coach-mode")) === "advanced");
  check(`[${tag}] ...and is not part of any save (a plain device preference)`, (await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== "cls_coach_mode_v1" && (localStorage.getItem(k) || "").includes("coachMode")))).length === 0);

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

async function english() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterLiveGame(page, BASE, "Coach Bench EN");
  await page.click("#btn-timeout");
  await page.waitForFunction(() => !document.querySelector("#btn-resume").hidden, null, { timeout: 15000 });
  await page.evaluate(() => document.querySelector("#btn-lang")?.click());
  await page.waitForTimeout(300);
  const label = (await page.textContent("#btn-coach-mode")).trim();
  check("[en] the toggle reads Advanced", label === "Advanced", label);
  check("[en] no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

try {
  await run(1440, 900, "desktop");
  await run(1280, 800, "laptop");
  await run(1366, 768, "small-laptop");
  await run(390, 844, "mobile");
  await english();
} finally {
  await browser.close();
}
console.log(report.join("\n"));
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
