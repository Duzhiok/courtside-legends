import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/playoff-manual";
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

  // A strong roster, not a cheap one: the whole point of this run is reaching the playoffs, so
  // greedily pack the highest-OVR players the salary cap allows instead of the cheapest ones.
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.createAccount("QA 教练");
    const maxPlayers = 12;
    const perPlayerCap = Math.floor(1950 / maxPlayers);
    const sorted = players.PLAYERS
      .map((p) => ({ id: p.id, bref: p.bref, ovr: players.overall(p), sal: market.playerSalary(p) }))
      .filter((p) => p.sal <= perPlayerCap)
      .sort((x, y) => y.ovr - x.ovr);
    const picked = [];
    const seenPeople = new Set(); // normal-mode rosters only allow ONE card per real player (uniqueByPerson)
    let budget = 0;
    for (const p of sorted) {
      if (picked.length >= maxPlayers) break;
      if (p.bref && seenPeople.has(p.bref)) continue;
      if (budget + p.sal > 1950) continue;
      picked.push(p.id);
      if (p.bref) seenPeople.add(p.bref);
      budget += p.sal;
    }
    a.playerIds = picked;
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

  // Blast through the whole regular season (already battle-tested, R46) to reach 常规赛结束.
  await page.click("#btn-season-sim-one");
  await page.waitForSelector("#screen-result.active", { timeout: 10000 });
  await page.click("#btn-result-sim-season");
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
  await page.click("#app-confirm-accept");
  await page.waitForFunction(
    () => document.querySelector("#result-summary")?.textContent?.includes("常规赛结束"),
    null,
    { timeout: 40000 },
  );
  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 10000 });

  // A real 82-game sim against a league of other decent teams is NOT guaranteed to land the user
  // a playoff spot (that's the whole point of a season -- the actual top-8-seed logic is already
  // covered by engine tests). To deterministically exercise the NEW manual-play UI every run,
  // patch the saved record to a clear #1 seed, then resume the save -- everything from here on
  // (entering playoffs, the hub buttons, the result screen, the series) is 100% real UI/engine.
  await page.evaluate(() => {
    const raw = localStorage.getItem("cls_season_v1");
    if (!raw) return;
    const st = JSON.parse(raw);
    st.standings[st.userTeamId] = { w: 70, l: 12, pf: 9200, pa: 7600, streak: 6, last10: Array(10).fill("W") };
    localStorage.setItem("cls_season_v1", JSON.stringify(st));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.click('.mode-card[data-mode="season"]');
  await page.waitForSelector("#btn-season-resume:not([hidden])", { timeout: 10000 });
  await page.click("#btn-season-resume");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 10000 });

  // Enter the playoffs bracket (round 1, nothing decided yet) via the awards tab's 进入季后赛.
  await page.click('[data-season-tab="awards"]');
  await page.waitForSelector("#btn-season-to-playoffs");
  await page.click("#btn-season-to-playoffs");
  await page.waitForSelector("#season-playoffs .season-series-row", { timeout: 10000 });

  // THE BUG: these two used to be hard-disabled for the entire playoffs, with zero personal
  // control over a single playoff game (user report: "季后赛我不能手动打吗？？？").
  const seriesText = await page.textContent("#season-next-match").catch(() => "");
  const playDisabled = await page.$eval("#btn-season-play", (b) => b.disabled).catch(() => true);
  const simOneDisabled = await page.$eval("#btn-season-sim-one", (b) => b.disabled).catch(() => true);
  check(`[${tag}] "亲自指挥" is enabled once in the playoffs with a pending series game`, !playDisabled, seriesText);
  check(`[${tag}] "快速模拟本场" is enabled too`, !simOneDisabled);
  check(`[${tag}] hub shows which playoff game is next (series score + home/away)`, /R\d|总决赛/.test(seriesText) && /\d-\d/.test(seriesText), seriesText);

  // 亲自指挥: the headline feature. Click it, confirm it actually opens the SAME live-game setup
  // flow regular-season games use (not a dead button), and that starting the game lands on the
  // real live court -- i.e. the full openSetup()->live court wiring works for a playoff game too.
  await page.click("#btn-season-play");
  await page.waitForSelector("#screen-setup.active", { timeout: 10000 });
  const confirmReady = await page.$eval("#btn-setup-confirm", (b) => !b.disabled).catch(() => false);
  check(`[${tag}] "亲自指挥" opens the live-game setup screen with 5 starters already picked`, confirmReady);
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 10000 });
  check(`[${tag}] confirming the setup actually starts the live court for a playoff game`, true);
  // Don't play the whole game out possession-by-possession here (that's pre-existing, unchanged
  // live-court machinery, not this feature). The season was already saved right before openSetup()
  // opened this game (state.seasonPendingPlayoffGame only becomes a real series result once the
  // live game finishes and reports back), so reloading cleanly abandons this attempt and resumes
  // at the same still-0-0 series -- the series-progression checks below then fall back to the
  // already-covered quick-sim path to stay fast and deterministic.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.click('.mode-card[data-mode="season"]');
  await page.waitForSelector("#btn-season-resume:not([hidden])", { timeout: 10000 });
  await page.click("#btn-season-resume");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 10000 });
  await page.click('[data-season-tab="playoffs"]');

  // Quick-sim exactly one playoff game from the hub.
  await page.click("#btn-season-sim-one");
  await page.waitForSelector("#screen-result.active", { timeout: 10000 });
  const resultSummary1 = await page.textContent("#result-summary");
  check(`[${tag}] result screen after one playoff game mentions the series (not the 82-game regular season line)`, !/已打 \d+\/82/.test(resultSummary1), resultSummary1);

  const nextBtnText = await page.textContent("#btn-again").catch(() => "");
  const nextBtnHidden = await page.$eval("#btn-again", (b) => b.hidden).catch(() => true);
  const bulkSeasonBtnHidden = await page.$eval("#btn-result-sim-season", (b) => b.hidden).catch(() => true);
  check(`[${tag}] "模拟下一场" still offered mid-series from the result screen`, !nextBtnHidden && nextBtnText.trim() === "模拟下一场", nextBtnText);
  check(`[${tag}] "模拟整个赛季" is NOT offered during playoffs (that's a regular-season-only bulk action)`, bulkSeasonBtnHidden);

  // Keep quick-simming the series to completion via the result-screen "模拟下一场" loop.
  let guard = 0;
  while (!(await page.$eval("#btn-again", (b) => b.hidden).catch(() => true)) && guard++ < 10) {
    await page.click("#btn-again");
    await page.waitForTimeout(80);
  }
  check(`[${tag}] series resolves within a legal best-of-7 (<=7 more clicks)`, guard <= 7, `guard=${guard}`);

  const finalSummary = await page.textContent("#result-summary");
  check(`[${tag}] final result summary announces a series outcome (晋级 win, 不敌 loss, or 夺得总冠军 title)`, /(晋级|不敌|夺得总冠军)/.test(finalSummary), finalSummary);
  const contPrimary = await page.$eval("#btn-result-continue", (b) => b.classList.contains("primary"));
  check(`[${tag}] "回到赛季主页" becomes primary again once the series is decided`, contPrimary);

  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-playoffs", { timeout: 10000 });
  const activeTab = await page.evaluate(() => document.querySelector('[data-season-tab].active')?.dataset.seasonTab);
  check(`[${tag}] returning to the hub after a playoff game lands on the 季后赛 tab, not 积分榜`, activeTab === "playoffs", activeTab);

  const userWonTheSeries = /晋级|夺得总冠军/.test(finalSummary);
  const playDisabledAfter = await page.$eval("#btn-season-play", (b) => b.disabled).catch(() => true);
  if (userWonTheSeries) {
    // Advancing should open up the NEXT round's series for the user -- same 亲自指挥/快速模拟本场
    // controls should still be live, just pointed at a new opponent.
    check(`[${tag}] winning round 1 keeps 亲自指挥 enabled for the next round (not stuck disabled)`, !playDisabledAfter);
  } else {
    // Eliminated: no more games of the user's own to play this postseason.
    check(`[${tag}] losing the series correctly disables 亲自指挥 (no more games left for the user)`, playDisabledAfter);
  }

  await page.screenshot({ path: `${OUT}/${tag}-playoff-result.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`[${tag}] no horizontal overflow`, !overflow);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}

await run(1280, 900, "desktop").catch((e) => check("[desktop] run() crashed", false, e.message));
await run(390, 844, "mobile").catch((e) => check("[mobile] run() crashed", false, e.message));
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("FAIL")).length} failing / ${report.length} total`);
