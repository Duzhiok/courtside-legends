// Browser E2E: the League Manager's offseason, played with the real buttons, ends in the recap alert (js/ui/offseasonRecap.js).
// Regular season -> playoffs -> draft board (end the season, pass on every pick) -> "complete offseason" -> the alert.
// The alert is the one native dialog of the flow: its text is captured, checked, and the new season must be on the hub.
// Usage: [QA_VIEWPORT=desktop|mobile] node scripts/qa/offseason-recap.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { noOverflow, shoot } from "./lib/page.mjs";
import { openCareer } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/offseason-recap";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => {
  const line = `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`;
  report.push(line);
  console.log(line);
};
const ALL = [["desktop", 1280, 800], ["mobile", 390, 844]];
const SIZES = process.env.QA_VIEWPORT ? ALL.filter(([tag]) => tag === process.env.QA_VIEWPORT) : ALL;
const browser = await chromium.launch({ executablePath: EXE });

/** Press "simulate 5 games" until the regular season is over (the hub says so). */
async function playRegularSeason(page) {
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => { if (document.querySelector("#screen-result")?.classList.contains("active")) document.querySelector("#btn-result-continue")?.click(); });
    const over = await page.evaluate(() => /常规赛结束。/.test(document.querySelector("#season-hub-panel")?.textContent || ""));
    if (over) return true;
    await page.evaluate(() => document.querySelector("#btn-season-sim-week")?.click());
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector("dialog[open] [data-confirm-ok], dialog[open] .btn.primary")?.click());
  }
  return false;
}

for (const [tag, width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [], alerts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Native alerts are the recap; the app's own confirms are <dialog>s and are answered by clicking.
  page.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
  await openCareer(page, BASE, {});
  check(`[${tag}] the regular season gets played to the end`, await playRegularSeason(page));

  await page.click('[data-season-tab="awards"]');
  await page.click("#btn-season-to-playoffs");
  await page.click('[data-season-tab="playoffs"]');
  await page.waitForTimeout(400);
  check(`[${tag}] the one-click playoffs button is there`, !!(await page.$("#btn-season-sim-all-po:not([disabled])")));
  await page.click("#btn-season-sim-all-po");
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector("dialog[open] [data-confirm-ok], dialog[open] .btn.primary")?.click());
  await page.waitForFunction(() => { const b = document.querySelector("#btn-season-sim-all-po"); return !b || b.disabled || !b.offsetParent; }, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(() => { if (document.querySelector("#screen-result")?.classList.contains("active")) document.querySelector("#btn-result-continue")?.click(); });

  await page.click('[data-season-tab="draftBoard"]');
  await page.waitForTimeout(500);
  check(`[${tag}] the season is over: "enter the offseason draft" is offered`, !!(await page.$('#season-draft-board [data-action="prepare-draft"]:not([disabled])')));
  await page.click('#season-draft-board [data-action="prepare-draft"]');
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector("dialog[open] [data-confirm-ok], dialog[open] .btn.primary")?.click());
  await page.waitForTimeout(700);

  // Pass on every pick until the board offers the way out.
  let guard = 0;
  while (guard++ < 80 && !(await page.$('#season-draft-board [data-action="complete-offseason"]:not([disabled])'))) {
    const clicked = await page.evaluate(() => {
      const b = document.querySelector('#season-draft-board [data-action="forfeit"]:not([disabled])');
      b?.click();
      return !!b;
    });
    if (!clicked) break;
    await page.waitForTimeout(150);
  }
  const ready = !!(await page.$('#season-draft-board [data-action="complete-offseason"]:not([disabled])'));
  check(`[${tag}] the draft is passed through and "complete offseason" is offered`, ready, `${guard} picks`);
  await shoot(page, `${OUT}/${tag}-before-complete.png`);
  const before = alerts.length;
  if (ready) await page.click('#season-draft-board [data-action="complete-offseason"]');
  await page.waitForTimeout(1500);
  const recap = alerts.slice(before).find((m) => /已进入|Entered the/.test(m)) || "";
  check(`[${tag}] the recap alert appears`, !!recap, recap.replace(/\n/g, " ⏎ ").slice(0, 160));
  check(`[${tag}] it names the new season and the offseason notes`, /^已进入 \d{4} 赛季。\n\n休赛期亮点：\n/.test(recap), recap.slice(0, 40).replace(/\n/g, "⏎"));
  check(`[${tag}] it never prints undefined / NaN / [object`, !/undefined|NaN|\[object/.test(recap));
  check(`[${tag}] the new season is on the hub`, await page.evaluate(() => !!document.querySelector("#season-hub-panel")?.getClientRects().length));
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await shoot(page, `${OUT}/${tag}-after-complete.png`);
  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join("\n") + "\n");
const fails = report.filter((r) => r.startsWith("FAIL"));
console.log(`\n${report.length - fails.length}/${report.length} passed`);
process.exit(fails.length ? 1 : 0);
