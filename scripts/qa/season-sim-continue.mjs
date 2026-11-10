import { openSingleSeason } from "./lib/page.mjs";
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/sim-season";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag, { stopAfterPlay = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
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

  await openSingleSeason(page);
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
  // 亲自指挥下一场: the result screen must also offer to call the next game yourself, not only sim it.
  const playNext = await page.$eval("#btn-result-play-next", (b) => ({ shown: !b.hidden, text: b.textContent.trim(), primary: b.classList.contains("primary") }));
  check(`[${tag}] "亲自指挥下一场" button visible on result screen`, playNext.shown && playNext.text === "亲自指挥下一场", playNext.text);
  const order = await page.$$eval("#screen-result .actions button:not([hidden])", (bs) => bs.map((b) => b.id));
  check(`[${tag}] it sits before "模拟下一场" so calling the game is the first choice`, order.indexOf("btn-result-play-next") >= 0 && order.indexOf("btn-result-play-next") < order.indexOf("btn-again"), order.join(","));
  if (stopAfterPlay) {
    await page.click("#btn-result-play-next");
    await page.waitForSelector("#screen-setup.active", { timeout: 10000 });
    const pending = await page.evaluate(async () => {
      const raw = JSON.parse(localStorage.getItem("cls_root_v3") || "{}");
      const st = raw?.leagueCareer?.season || raw?.season;
      return { played: !!st, hasPending: !!document.querySelector("#screen-setup.active") };
    });
    check(`[${tag}] clicking it opens the live-game setup for the NEXT game (same entry as the hub's 亲自指挥)`, pending.hasPending);
    check(`[${tag}] no page errors after calling the next game`, errors.length === 0, errors.join(" ; "));
    await page.screenshot({ path: `${OUT}/${tag}-play-next-setup.png` });
    await page.close();
    return;
  }
  const contPrimary = await page.$eval("#btn-result-continue", (b) => b.classList.contains("primary"));
  const nextPrimary = await page.$eval("#btn-again", (b) => b.classList.contains("primary"));
  check(`[${tag}] exactly one primary action: 亲自指挥下一场 (sim and hub-return are secondary)`, playNext.primary && !nextPrimary && !contPrimary, `play=${playNext.primary} sim=${nextPrimary} cont=${contPrimary}`);

  // Click "模拟下一场" and confirm we stay on the result screen with a NEW game -- no forced
  // trip back to the hub just to trigger the next one.
  await page.click("#btn-again");
  await page.waitForTimeout(200);
  const stillOnResult = await page.evaluate(() => document.querySelector("#screen-result")?.classList.contains("active"));
  check(`[${tag}] "模拟下一场" stays on the result screen (no forced trip to hub)`, stillOnResult);

  // "模拟五场" sits between the two: confirm it's visible, and that it actually advances exactly
  // five games (not one, not "the rest of the season") by reading the played-count off the summary.
  const sim5Visible = await page.$eval("#btn-result-sim5", (b) => !b.hidden && b.textContent.trim());
  check(`[${tag}] "模拟五场" button visible on result screen`, sim5Visible === "模拟五场", sim5Visible);
  const playedBefore = Number(/已打 (\d+)\/82/.exec(await page.textContent("#result-summary"))?.[1]);
  await page.click("#btn-result-sim5");
  await page.waitForFunction(() => document.querySelector("#screen-result")?.classList.contains("active"), null, { timeout: 10000 });
  const sim5Summary = await page.textContent("#result-summary");
  const playedAfter = Number(/已打 (\d+)\/82/.exec(sim5Summary)?.[1]);
  check(`[${tag}] "模拟五场" advances exactly 5 games`, playedAfter - playedBefore === 5, `${playedBefore} -> ${playedAfter}`);
  check(`[${tag}] "模拟五场" summary says it ran 5 games`, /已连续模拟 5 场/.test(sim5Summary), sim5Summary);

  // These three labels used to be a raw Chinese literal set on every render; in en mode the result
  // screen would show e.g. "模拟五场" verbatim. Flip to en, force a fresh render by clicking "模拟五场"
  // again (selector-based, works under either label), and read the labels it just painted. Desktop
  // only -- same code path regardless of viewport, no need to pay for it twice.
  if (tag === "desktop") {
    await page.click("#btn-lang");
    await page.waitForTimeout(50);
    await page.click("#btn-result-sim5");
    await page.waitForFunction(() => document.querySelector("#screen-result")?.classList.contains("active"), null, { timeout: 10000 });
    const enLabels = await Promise.all(
      ["#btn-again", "#btn-result-sim5", "#btn-result-sim-season"].map((sel) => page.textContent(sel)),
    );
    check(`[${tag}] en mode: a fresh render of the sim buttons shows English, not raw Chinese`, enLabels.every((t) => !/[\u4e00-\u9fff]/.test(t)), enLabels.join(" | "));
    check(`[${tag}] en mode: "Sim 5 Games" reads correctly`, enLabels[1] === "Sim 5 Games", enLabels[1]);
    await page.click("#btn-lang");
    await page.waitForTimeout(50);
  }

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
  const sim5DisabledMidRun = await page.$eval("#btn-result-sim5", (b) => b.disabled).catch(() => false);
  check(`[${tag}] progress text shows mid-run (not a frozen tab)`, /正在模拟整个赛季/.test(midRunText), midRunText);
  check(`[${tag}] action buttons disabled mid-run`, midRunDisabled && sim5DisabledMidRun);
  await page.waitForFunction(
    () => document.querySelector("#result-summary")?.textContent?.includes("常规赛结束"),
    null,
    { timeout: 40000 },
  );
  const elapsedMs = Date.now() - t0;
  check(`[${tag}] "模拟整个赛季" runs to completion (regular season ends)`, true, `${elapsedMs}ms`);

  const nextHiddenAfter = await page.$eval("#btn-again", (b) => b.hidden);
  const simSeasonHiddenAfter = await page.$eval("#btn-result-sim-season", (b) => b.hidden);
  const sim5HiddenAfter = await page.$eval("#btn-result-sim5", (b) => b.hidden);
  const playHiddenAfter = await page.$eval("#btn-result-play-next", (b) => b.hidden);
  check(`[${tag}] sim buttons hide once season is over`, nextHiddenAfter && simSeasonHiddenAfter && sim5HiddenAfter);
  check(`[${tag}] "亲自指挥下一场" hides too once there is no next game`, playHiddenAfter);
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

await run(1280, 900, "desktop-play", { stopAfterPlay: true });
await run(390, 844, "mobile-play", { stopAfterPlay: true });
await run(1280, 900, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("FAIL")).length} failing / ${report.length} total`);
