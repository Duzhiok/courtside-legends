// Back-button standard (docs/implementation/back-button-layering-design.md):
// one top-left back control per non-home screen; back means "previous screen"
// via the nav stack; market has an exit at all; game exit lives in the pause
// overlay; result back is origin-aware; wizards step back; Escape = back.
// Desktop + mobile pass. Mac-only (needs the Playwright Chromium shell);
// the node test (tests/backButtons.test.js) is the one that runs on the VM.
// Usage: node scripts/qa/back-buttons.mjs /tmp/cls-qa/back-buttons [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { homeActive, noOverflow, shoot, text, openSingleSeason, clickProfile } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/back-buttons";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });
const screen = (page) => page.evaluate(() => document.querySelector("main.screen.active")?.id);
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const backLabel = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
const leftOfTitle = (page, btnSel) => page.evaluate((sel) => {
  const btn = document.querySelector(sel);
  const head = btn?.closest(".panel-head");
  const title = head?.querySelector("h2");
  if (!btn || !title) return false;
  const b = btn.getBoundingClientRect();
  const t = title.getBoundingClientRect();
  return b.right <= t.left + 1 && Math.abs(b.top - t.top) < 24;
}, btnSel);

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const fresh = async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await homeActive(page);
  };
  const customTab = async () => page.click('.home-tab[data-category="custom"]');
  await fresh();

  // A. Home is the root: no back control anywhere on it.
  check(`[${tag}] home has no back control`, !(await page.$("#screen-home .nav-back")));
  check(`[${tag}] no horizontal overflow (home)`, await noOverflow(page));

  // B. Market: the screen that had NO exit at all (soft-trapped).
  await customTab();
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#screen-market.active", { timeout: 15000 });
  await page.waitForSelector("#free-agent-list .market-row", { timeout: 15000 });
  check(`[${tag}] market back is visible`, await visible(page, "#btn-market-back"));
  check(`[${tag}] market back sits top-left of the title`, await leftOfTitle(page, "#btn-market-back"));
  check(`[${tag}] market back label is 返回`, (await backLabel(page, "#btn-market-back")) === "返回");
  await page.click("#btn-market-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] market back returns home`, (await screen(page)) === "screen-home");

  // C. Account: return-tracking is kept (guest gate -> create -> account -> back home).
  await clickProfile(page, "#btn-daily-draw");
  await page.waitForSelector("#account-gate:not([hidden])", { timeout: 10000 });
  await page.click("#btn-account-gate-create");
  await page.waitForSelector("#screen-account.active", { timeout: 10000 });
  check(`[${tag}] account back is top-left`, await leftOfTitle(page, "#btn-account-back"));
  await page.click("#btn-account-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] account back returns home`, (await screen(page)) === "screen-home");

  // D. Onboarding wizard step-back, then the account-gated screens.
  await clickProfile(page, "#btn-daily-draw");
  await page.click("#btn-account-gate-create");
  await page.waitForSelector("#screen-account.active", { timeout: 10000 });
  await page.fill("#account-new-name", "QABack");
  await page.click("#btn-account-create");
  await page.waitForSelector("#screen-onboard.active", { timeout: 10000 });
  check(`[${tag}] onboard step-back hidden on step 1`, !(await visible(page, "#btn-onboard-prev")));
  await page.click("#btn-onboard-next"); // step 1 -> 2
  await page.waitForFunction(() => document.querySelector("#onboard-step-label")?.textContent.includes("2/4"), null, { timeout: 10000 });
  for (let i = 0; i < 5; i++) await page.click("#onboard-pool [data-pick]:not(.selected)");
  await page.waitForFunction(() => !document.querySelector("#btn-onboard-next").disabled, null, { timeout: 10000 });
  await page.click("#btn-onboard-next"); // step 2 -> 3
  await page.waitForFunction(() => document.querySelector("#onboard-step-label")?.textContent.includes("3/4"), null, { timeout: 10000 });
  check(`[${tag}] onboard step-back visible on step 3`, await visible(page, "#btn-onboard-prev"));
  await page.click("#btn-onboard-prev"); // step 3 -> 2
  await page.waitForFunction(() => document.querySelector("#onboard-step-label")?.textContent.includes("2/4"), null, { timeout: 10000 });
  check(`[${tag}] step-back keeps the 5 picks`, (await text(page, "#onboard-step-label")).includes("5/5"), await text(page, "#onboard-step-label"));
  await page.click("#btn-onboard-next"); // step 2 -> 3
  await page.waitForFunction(() => document.querySelector("#onboard-step-label")?.textContent.includes("3/4"), null, { timeout: 10000 });
  await page.click("#onboard-pool [data-coach]");
  await page.click("#btn-onboard-next"); // step 3 -> 4
  await page.waitForFunction(() => document.querySelector("#onboard-step-label")?.textContent.includes("4/4"), null, { timeout: 10000 });
  await page.click("#onboard-pool [data-tactic]");
  await page.click("#btn-onboard-next"); // finish -> collection
  await page.waitForSelector("#screen-collection.active", { timeout: 15000 });
  check(`[${tag}] onboarding finishes on the collection`, (await screen(page)) === "screen-collection");
  await page.click("#btn-collection-draw");
  await page.waitForSelector("#screen-draw.active", { timeout: 10000 });
  check(`[${tag}] draw back names its parent`, (await backLabel(page, "#btn-draw-back")) === "返回收藏");
  await page.click("#btn-draw-back");
  await page.waitForSelector("#screen-collection.active", { timeout: 10000 });
  check(`[${tag}] draw back returns to the collection`, (await screen(page)) === "screen-collection");
  // Escape pops the same way as the back control.
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] Escape from collection returns home`, (await screen(page)) === "screen-home");
  await clickProfile(page, "#btn-open-collection");
  await page.waitForSelector("#screen-collection.active", { timeout: 10000 });
  await page.click("#btn-collection-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] collection back returns home`, (await screen(page)) === "screen-home");

  // E. Custom hub -> home.
  await customTab();
  await page.click('.mode-card[data-mode="custom"]');
  await page.waitForSelector("#screen-custom-hub.active", { timeout: 10000 });
  await page.click("#btn-custom-hub-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] custom hub back returns home`, (await screen(page)) === "screen-home");

  // F. Family duel -> custom hub (not home).
  await customTab();
  await page.click('.mode-card[data-mode="custom"]');
  await page.waitForSelector("#screen-custom-hub.active", { timeout: 10000 });
  await page.click("#btn-custom-father-son");
  await page.waitForSelector("#screen-family-duel.active", { timeout: 10000 });
  check(`[${tag}] family duel back names custom`, (await backLabel(page, "#btn-family-duel-back")) === "返回自定义");
  await page.click("#btn-family-duel-back");
  await page.waitForSelector("#screen-custom-hub.active", { timeout: 10000 });
  check(`[${tag}] family duel back returns to custom hub`, (await screen(page)) === "screen-custom-hub");

  // G. Legend -> custom hub (the old code wrongly returned home).
  await page.click("#btn-custom-legend");
  await page.waitForSelector("#screen-legend.active", { timeout: 10000 });
  check(`[${tag}] legend back names custom`, (await backLabel(page, "#btn-legend-back")) === "返回自定义");
  await page.click("#btn-legend-back");
  await page.waitForSelector("#screen-custom-hub.active", { timeout: 10000 });
  check(`[${tag}] legend back returns to custom hub`, (await screen(page)) === "screen-custom-hub");

  // H. Draft (custom) -> custom hub.
  await page.click("#btn-custom-budget");
  await page.waitForSelector("#screen-draft.active", { timeout: 10000 });
  await page.click("#btn-draft-back");
  await page.waitForSelector("#screen-custom-hub.active", { timeout: 10000 });
  check(`[${tag}] custom draft back returns to custom hub`, (await screen(page)) === "screen-custom-hub");
  await page.click("#btn-custom-hub-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });

  // I. Sandbox / tournament / credits -> home.
  await customTab();
  await page.click('.mode-card[data-mode="sandbox"]');
  await page.waitForSelector("#screen-sandbox.active", { timeout: 10000 });
  await page.click("#btn-sandbox-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] sandbox back returns home`, (await screen(page)) === "screen-home");
  await customTab();
  await page.click('.mode-card[data-mode="tournament"]');
  await page.waitForSelector("#screen-tournament.active", { timeout: 10000 });
  await page.click("#btn-tour-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] tournament back returns home`, (await screen(page)) === "screen-home");
  await page.click("#btn-open-credits");
  await page.waitForSelector("#screen-credits.active", { timeout: 10000 });
  await page.click("#btn-credits-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] credits back returns home`, (await screen(page)) === "screen-home");

  // J. Season hub -> home; season result back is origin-aware (season center).
  await openSingleSeason(page);
  await page.waitForSelector("#screen-season.active", { timeout: 10000 });
  await page.click("#btn-season-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] season back returns home`, (await screen(page)) === "screen-home");
  await openSingleSeason(page);
  await page.waitForSelector("#screen-season.active", { timeout: 10000 });
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.click("#btn-season-sim-one");
  await page.waitForSelector("#screen-result.active", { timeout: 15000 });
  check(`[${tag}] season result back says 回赛季主页`, (await backLabel(page, "#btn-home")) === "回赛季主页", await backLabel(page, "#btn-home"));
  await page.click("#btn-home");
  await page.waitForSelector("#screen-season.active", { timeout: 10000 });
  check(`[${tag}] season result back returns to the season center`, (await screen(page)) === "screen-season");

  // K. Game: pause overlay exit (save-first) + Escape pauses/resumes.
  // Section J left us on the season center; go home first.
  await page.click("#btn-season-back");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active", { timeout: 15000 });
  check(`[${tag}] pause-leave hidden while the game is live`, !(await visible(page, "#btn-pause-leave")));
  const pauseLabel = await text(page, "#btn-pause-sim");
  if (pauseLabel === "暂停模拟") await page.click("#btn-pause-sim");
  await page.waitForFunction(() => !document.querySelector("#btn-pause-leave").hidden, null, { timeout: 10000 });
  check(`[${tag}] pause-leave appears once paused`, await visible(page, "#btn-pause-leave"));
  check(`[${tag}] pause-leave says 保存并离开`, (await backLabel(page, "#btn-pause-leave")) === "保存并离开");
  await page.keyboard.press("Escape"); // back from pause = resume
  await page.waitForFunction(() => document.querySelector("#btn-pause-leave").hidden, null, { timeout: 10000 });
  check(`[${tag}] Escape while paused resumes the game`, !(await visible(page, "#btn-pause-leave")));
  await page.click("#btn-pause-sim");
  await page.waitForFunction(() => !document.querySelector("#btn-pause-leave").hidden, null, { timeout: 10000 });
  await page.click("#btn-pause-leave"); // save-first exit, no confirm
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] pause-leave saves and returns home`, (await screen(page)) === "screen-home");

  // L. Quick-game result back is origin-aware too (home).
  await page.click("#btn-play-now");
  await page.waitForSelector("#screen-game.active", { timeout: 15000 });
  await page.click("#btn-quick-sim");
  await page.waitForSelector("#screen-result.active", { timeout: 30000 });
  check(`[${tag}] quick-game result back says 回主页`, (await backLabel(page, "#btn-home")) === "回主页", await backLabel(page, "#btn-home"));
  await page.click("#btn-home");
  await page.waitForSelector("#screen-home.active", { timeout: 10000 });
  check(`[${tag}] quick-game result back returns home`, (await screen(page)) === "screen-home");

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await shoot(page, `${OUT}/${tag}-back-buttons.png`);
  await page.close();
}

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  await run(w, h, tag);
}
await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join("\n") + "\n");
console.log(report.join("\n"));
