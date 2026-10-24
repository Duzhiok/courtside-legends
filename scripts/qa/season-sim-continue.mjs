import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/sim-season";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  // Cheap role players only -- a few real superstars alone blow past the ¤2000 season salary
  // cap before 8 players are even seated, so "用账号班底" would reject the roster outright.
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.createAccount("QA 教练");
    const cheap = players.PLAYERS
      .filter((p) => players.overall(p) >= 55 && players.overall(p) <= 70)
      .map((p) => ({ id: p.id, sal: market.playerSalary(p) }))
      .sort((x, y) => x.sal - y.sal)
      .slice(0, 15)
      .map((p) => p.id);
    a.playerIds = cheap;
    a.onboardingDone = true; a.gold = 500; a.fragments = 200;
    a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  await page.click('.mode-card[data-mode="season"]');
  await page.waitForSelector("#screen-season.active");
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });

  // Quick-sim one game from the hub to land on the result screen -- this is the exact screen
  // a user reported as a dead end: a box score with only "回到赛季主页" / "回主页", no way to
  // keep going without a round trip back to the hub.
  await page.click("#btn-season-sim-one");
  await page.waitForSelector("#screen-result.active", { timeout: 10000 });

  const simNextVisible = await page.$eval("#btn-again", (b) => !b.hidden && b.textContent.trim());
  const simSeasonVisible = await page.$eval("#btn-result-sim-season", (b) => !b.hidden && b.textContent.trim());
  check(`[${tag}] "模拟下一场" button visible on result screen`, simNextVisible === "模拟下一场", simNextVisible);
  check(`[${tag}] "模拟整个赛季" button visible on result screen`, simSeasonVisible === "模拟整个赛季", simSeasonVisible);
  const contPrimary = await page.$eval("#btn-result-continue", (b) => b.classList.contains("primary"));
  const nextPrimary = await page.$eval("#btn-again", (b) => b.classList.contains("primary"));
  check(`[${tag}] continue-sim is primary, hub-return is not`, nextPrimary && !contPrimary, `next=${nextPrimary} cont=${contPrimary}`);

  // Click "模拟下一场" and confirm we stay on the result screen with a NEW game -- no forced
  // trip back to the hub just to trigger the next one.
  await page.click("#btn-again");
  await page.waitForTimeout(200);
  const stillOnResult = await page.evaluate(() => document.querySelector("#screen-result")?.classList.contains("active"));
  check(`[${tag}] "模拟下一场" stays on the result screen (no forced trip to hub)`, stillOnResult);

  // The big one: simulate the entire rest of the regular season. This takes ~15-20s of real
  // sim time (every user-game night also advances every other league game that night), so the
  // important thing to verify isn't just "it finishes" but that the tab stays responsive along
  // the way: a progress line painting and the action buttons disabled, not a frozen page.
  await page.click("#btn-result-sim-season");
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
  const t0 = Date.now();
  await page.click("#app-confirm-accept");
  await page.waitForTimeout(150);
  const midRunText = await page.textContent("#result-summary").catch(() => "");
  const midRunDisabled = await page.$eval("#btn-result-sim-season", (b) => b.disabled).catch(() => false);
  check(`[${tag}] progress text shows mid-run (not a frozen tab)`, /正在模拟整个赛季/.test(midRunText), midRunText);
  check(`[${tag}] action buttons disabled mid-run`, midRunDisabled);
  await page.waitForFunction(
    () => document.querySelector("#result-summary")?.textContent?.includes("常规赛结束"),
    null,
    { timeout: 40000 },
  );
  const elapsedMs = Date.now() - t0;
  check(`[${tag}] "模拟整个赛季" runs to completion (regular season ends)`, true, `${elapsedMs}ms`);

  const nextHiddenAfter = await page.$eval("#btn-again", (b) => b.hidden);
  const simSeasonHiddenAfter = await page.$eval("#btn-result-sim-season", (b) => b.hidden);
  check(`[${tag}] sim buttons hide once season is over`, nextHiddenAfter && simSeasonHiddenAfter);
  const contPrimaryAfter = await page.$eval("#btn-result-continue", (b) => b.classList.contains("primary"));
  check(`[${tag}] hub-return becomes primary again once season is over`, contPrimaryAfter);
  const contTextAfter = await page.textContent("#btn-result-continue");
  check(`[${tag}] hub-return button reads 回到赛季主页`, contTextAfter.trim() === "回到赛季主页", contTextAfter);

  await page.screenshot({ path: `${OUT}/${tag}-result-mid-season.png` });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`[${tag}] no horizontal overflow (box score table scrolls internally, not the page)`, !overflow);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}

await run(1280, 900, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("FAIL")).length} failing / ${report.length} total`);
