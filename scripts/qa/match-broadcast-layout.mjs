// Broadcast-first match layout QA (real browser). Run against any build; layout assertions are skipped with --baseline so the
// same script produces the before/after court-size numbers.
//   node scripts/qa/match-broadcast-layout.mjs <baseUrl> <outDir> [--baseline]
import { enterLiveGame as enterLive } from "./lib/liveGame.mjs";
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:5173/";
const OUT = process.argv[3] || "/tmp/cls-qa/match-broadcast";
const BASELINE = process.argv.includes("--baseline");
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed++; report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };
const browser = await chromium.launch({ executablePath: EXE });

const enterLiveGame = (page) => enterLive(page, BASE);

const measure = (page) => page.evaluate(() => {
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); const vis = !el.hidden && getComputedStyle(el).display !== "none" && b.width > 0; return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom), vis }; };
  const court2d = r("#court-root"); const court3d = r("#court-3d-root");
  const court = court3d?.vis ? court3d : court2d;
  return {
    court, feed: r("#play-feed"), panel: r(".coach-panel"), body: r("#coach-body"), bar: r(".coach-panel .live-only-row"),
    resume: r("#btn-resume"), timeout: r("#btn-timeout"), toggle: r("#btn-coach-drawer"), wrap: r(".court-wrap"),
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    smallTargets: [...document.querySelectorAll(".coach-panel .live-only-row .btn")].filter((b) => { const x = b.getBoundingClientRect(); return x.width > 0 && x.height < 43; }).map((b) => b.id),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterLiveGame(page);
  await page.waitForTimeout(2500);
  const live = await measure(page);
  await page.screenshot({ path: `${OUT}/${tag}-live.png` });
  const area = live.court ? live.court.w * live.court.h : 0;
  console.log(`[${tag}] LIVE court ${live.court?.w}x${live.court?.h} (${Math.round((area / (width * height)) * 100)}% of viewport) feed ${live.feed?.w}x${live.feed?.h} panel h ${live.panel?.h}`);
  if (BASELINE) { await page.close(); return { live }; }

  const desktop = width > 800;
  check(`[${tag}] no horizontal overflow`, live.overflowX <= 0, `overflowX ${live.overflowX}`);
  check(`[${tag}] court is ${width > 800 ? "~16:9 or wider" : "at least 4:3 (not shorter than before)"}`, live.court.w / live.court.h >= (width > 800 ? 1.7 : 1.3), `${live.court.w}x${live.court.h}`);
  check(`[${tag}] the whole court + action bar row fits the first screen`, (live.bar?.bottom ?? 9999) <= height, `bar.bottom ${live.bar?.bottom} of ${height}`);
  check(`[${tag}] live: coach body is collapsed, only the action bar shows`, live.body && !live.body.vis && live.bar?.vis, JSON.stringify({ body: live.body?.vis, bar: live.bar?.vis }));
  check(`[${tag}] action bar buttons are >=44px tall`, live.smallTargets.length === 0, live.smallTargets.join(","));
  check(`[${tag}] drawer toggle is visible and starts collapsed`, live.toggle?.vis);
  if (desktop) {
    check(`[${tag}] court is ~72% of the row (68-76%)`, live.court.w / live.wrap.w > 0.68 && live.court.w / live.wrap.w < 0.76, `${(live.court.w / live.wrap.w * 100).toFixed(1)}%`);
    check(`[${tag}] feed sits to the right of the court at full row height`, live.feed.x >= live.court.right && live.feed.h >= live.wrap.h - 4, `feed.x ${live.feed.x} court.right ${live.court.right} feed.h ${live.feed.h} wrap.h ${live.wrap.h}`);
    check(`[${tag}] action bar is directly under the court`, live.bar.y >= live.court.bottom - 2 && live.bar.y - live.court.bottom < 80, `bar.y ${live.bar.y} court.bottom ${live.court.bottom}`);
  } else {
    check(`[${tag}] mobile: court first, action bar next, feed after`, live.court.y < live.bar.y && live.bar.y < live.feed.y, `${live.court.y} / ${live.bar.y} / ${live.feed.y}`);
    check(`[${tag}] mobile: court and action bar are on the first screen`, live.bar.bottom <= height, `bar.bottom ${live.bar.bottom} of ${height}`);
  }

  // manual open while live
  await page.click("#btn-coach-drawer");
  const manual = await measure(page);
  check(`[${tag}] drawer opens by hand during live play and the court stays visible`, manual.body.vis && manual.court.h > 120, `court ${manual.court.w}x${manual.court.h}`);
  await page.screenshot({ path: `${OUT}/${tag}-drawer-open.png` });
  await page.click("#btn-coach-drawer");

  // timeout: the panel opens by itself, the court shrinks but stays
  await page.click("#btn-timeout");
  await page.waitForFunction(() => !document.querySelector("#btn-resume").hidden, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const paused = await measure(page);
  check(`[${tag}] timeout: coach body opens by itself`, paused.body.vis);
  // On a phone the court is already below the shrink limit, so it only has to stay put; on desktop it must give room to the panel.
  check(`[${tag}] timeout: court stays visible${desktop ? " and shrinks to make room" : ""}`, paused.court.h > 120 && (desktop ? paused.court.h < live.court.h : paused.court.h <= live.court.h), `${live.court.h} -> ${paused.court.h}`);
  check(`[${tag}] timeout: resume button is reachable`, paused.resume.vis);
  check(`[${tag}] timeout: no horizontal overflow`, paused.overflowX <= 0, `overflowX ${paused.overflowX}`);
  await page.screenshot({ path: `${OUT}/${tag}-timeout.png` });

  // the tempo/focus controls are still wired: tactic select is enabled during the window
  const ctl = await page.evaluate(() => ({ tactic: !document.querySelector("#tactic-select").disabled, sub: !!document.querySelector("#sub-out-list"), speed: !!document.querySelector("#btn-speed") }));
  check(`[${tag}] timeout: tactic select is enabled and speed/sub controls still exist`, ctl.tactic && ctl.sub && ctl.speed);

  await page.click("#btn-resume");
  await page.waitForTimeout(600);
  const resumed = await measure(page);
  check(`[${tag}] resume: collapses again`, !resumed.body.vis && (desktop ? resumed.court.h > paused.court.h : resumed.court.h >= paused.court.h), `${paused.court.h} -> ${resumed.court.h}`);

  // 3D switch
  if (live.toggle) {
    const has3d = await page.evaluate(() => { const b = document.querySelector("#btn-court-3d"); return !!b && !b.hidden; });
    if (has3d) {
      await page.click("#btn-court-3d");
      await page.waitForTimeout(2500);
      const three = await measure(page);
      const canvas = await page.evaluate(() => { const c = document.querySelector("#court-3d-root canvas"); if (!c) return null; const b = c.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; });
      check(`[${tag}] 3D: canvas fills the 16:9 court box`, canvas && Math.abs(canvas.w - three.court.w) <= 2 && Math.abs(canvas.h - three.court.h) <= 2, JSON.stringify({ canvas, court: three.court && { w: three.court.w, h: three.court.h } }));
      await page.screenshot({ path: `${OUT}/${tag}-3d.png` });
      await page.click("#btn-court-3d");
    } else report.push(`SKIP [${tag}] 3D toggle is Gold-only (hidden in season mode); covered by match-3d-gold.mjs`);
  }
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
  return { live, paused };
}

for (const [w, h, tag] of [[1440, 900, "desktop1440"], [1280, 800, "desktop1280"], [390, 844, "mobile390"]]) await run(w, h, tag);
await browser.close();
console.log(report.join("\n"));
console.log(BASELINE ? "(baseline: measurements only)" : failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
