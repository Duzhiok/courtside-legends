// Browser E2E: the season hub's tabs AFTER the regular season is over, measured for legible text.
// The awards / playoffs / draft cards only exist once the season has been played, so a QA that opens them
// mid-season measures an empty tab and passes (that is how white-on-white award cards got through).
// A real career, played through the real "simulate 5 games" button; then every visible text in every tab is
// contrast-checked against what is actually behind it. Guards make sure the tabs are not vacuously empty.
// Usage: [QA_VIEWPORT=desktop|mobile] node scripts/qa/season-end-contrast.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { noOverflow, SEASON_HUB_BASE, shoot, textContrast } from "./lib/page.mjs";
import { openCareer } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/season-end-contrast";
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
const TABS = ["standings", "rotation", "market", "evaluation", "schedule", "awards", "playoffs", "draftBoard", "development", "history"];
/** Tab id -> panel id, where they differ. */
const PANEL = { draftBoard: "season-draft-board" };
const browser = await chromium.launch({ executablePath: EXE });

/** Press "simulate 5 games" until the regular season is over (the hub says so). */
async function playRegularSeason(page) {
  for (let i = 0; i < 40; i++) {
    // a simulated game can land on the result screen: go back to the hub like a player would
    await page.evaluate(() => { if (document.querySelector("#screen-result")?.classList.contains("active")) document.querySelector("#btn-result-continue")?.click(); });
    const over = await page.evaluate(() => /常规赛结束。/.test(document.querySelector("#season-hub-panel")?.textContent || ""));
    const onHub = await page.evaluate(() => !!document.querySelector("#season-hub-panel")?.getClientRects().length);
    if (over && onHub) return true;
    await page.evaluate(() => document.querySelector("#btn-season-sim-week")?.click());
    await page.waitForTimeout(250);
    // a custom confirm dialog may sit in the way of a bulk sim
    await page.evaluate(() => document.querySelector("dialog[open] [data-confirm-ok], dialog[open] .btn.primary")?.click());
  }
  return false;
}

async function measureAllTabs(page, tag, stage) {
  for (const tab of TABS) {
    await page.click(`[data-season-tab="${tab}"]`);
    await page.waitForTimeout(350);
    const bad = await textContrast(page, `#${PANEL[tab] || `season-${tab}`}`, { under: SEASON_HUB_BASE });
    check(`[${tag}] ${stage} · ${tab} tab: every visible text is AA`, bad.length === 0, bad.slice(0, 4).join(" | "));
  }
}

for (const [tag, width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await openCareer(page, BASE, {});
  check(`[${tag}] the regular season gets played to the end`, await playRegularSeason(page));

  await page.click('[data-season-tab="awards"]');
  await page.waitForTimeout(400);
  const cards = await page.$$eval("#season-awards .season-award-card", (els) => els.length);
  check(`[${tag}] the awards tab is not empty (so the contrast check below can't pass vacuously)`, cards >= 6, `${cards} cards`);
  await shoot(page, `${OUT}/${tag}-awards.png`);

  await measureAllTabs(page, tag, "after the regular season");
  check(`[${tag}] no horizontal overflow on the awards tab`, await (async () => { await page.click('[data-season-tab="awards"]'); return noOverflow(page); })());
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join("\n") + "\n");
const fails = report.filter((r) => r.startsWith("FAIL"));
console.log(`\n${report.length - fails.length}/${report.length} passed`);
process.exit(fails.length ? 1 : 0);
