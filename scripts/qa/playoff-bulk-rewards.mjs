// Browser E2E: the bulk playoff buttons pay the user's games like hand-playing does.
// 一键打完季后赛 / 模拟下一轮 / 一键模拟整个季后赛 used to simulate the user's games inside the engine and
// throw every box score away: no XP, no epiphany, no buzz, no coach XP. The real engine builds the career
// (every young player armed 10 XP short of a level, so ONE settled game must level somebody up) and the real
// buttons are clicked -- nothing here fakes the app.
// Usage: node scripts/qa/playoff-bulk-rewards.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { openCareer } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/playoff-bulk";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/** What the saved career says has been paid so far: levels gained by players, and the coach's level/xp. */
const paid = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3"));
  const growth = Object.values(root.leagueCareer.management.growth || {});
  return {
    levels: growth.reduce((sum, g) => sum + (g.levels || 0), 0),
    coach: JSON.stringify([root.coach.level, root.coach.xp]),
    phase: root.leagueCareer.season.phase,
  };
});

/**
 * In the page, with the real engine: play out the regular season (engine only -- nothing settled) and open the
 * playoffs. This roster is no contender, so if it missed the bracket it is dropped in as the East's 8th seed
 * (the engine sims the series as usual). East on purpose: advancePlayoffs() only moves the East on its first call.
 */
const toPlayoffs = (page) => page.evaluate(async () => {
  const se = await import("/js/engine/season.js");
  const sr = await import("/js/data/saveRoot.js");
  const root = sr.readRootSave(localStorage);
  const st = root.leagueCareer.season;
  se.advanceToUserGame(st, { stopBeforeUser: false });
  se.startPlayoffs(st);
  if (!se.activeUserPlayoffSeries(st)) {
    const series = st.playoffs.east.series[0];
    series.low = { ...series.low, id: st.userTeamId, name: st.teams[st.userTeamId]?.name };
  }
  const inBracket = !!se.activeUserPlayoffSeries(st);
  sr.writeRootSave(root, localStorage);
  return { phase: st.phase, inBracket };
});

async function hubOnPlayoffsTab(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.click('[data-season-tab="playoffs"]');
}

async function newCareerPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openCareer(page, BASE, { growth: true });
  return { page, errors };
}

/** Click `button`, wait for the result card, and check the harvest is real. */
async function bulkClickAndCheck(page, errors, tag, button, { minGames = 4, mayMissPlayoffs = false, waitMs = 45000 } = {}) {
  const before = await paid(page);
  check(`[${tag}] precondition: nothing has been paid yet`, before.levels === 0, JSON.stringify(before));
  await page.click(button);
  // No result card means nobody was paid (the old behaviour: the sim ran, the hub redrew, the games vanished).
  const shown = await page.waitForFunction(() => document.querySelector("#screen-result")?.classList.contains("active"), null, { timeout: waitMs })
    .then(() => true, () => false);
  check(`[${tag}] the batch harvest card appears`, shown);
  if (!shown) return;
  const after = await paid(page);
  const card = await page.evaluate(() => ({
    rewards: document.querySelector("#result-rewards")?.textContent.replace(/\s+/g, " ").trim() || "",
    summary: document.querySelector("#result-summary")?.textContent.trim() || "",
  }));
  const games = Number(/已连续模拟 (\d+) 场/.exec(card.summary)?.[1] || 0);
  check(`[${tag}] the user's games were settled: players levelled up`, after.levels > 0, `levels ${before.levels} -> ${after.levels}`);
  check(`[${tag}] ...and the coach was paid`, after.coach !== before.coach, `${before.coach} -> ${after.coach}`);
  check(`[${tag}] the result card shows the batch harvest (本段收获)`, /本段收获/.test(card.rewards), card.rewards.slice(0, 90));
  check(`[${tag}] it covers the user's games (${games}, at least ${minGames})`, games >= minGames);
  // From the start of the season the roster may simply not make the playoffs (random). Then the last game the
  // user played is a regular-season one, the card says so, and the batch is exactly the 82 regular-season games.
  const aboutSeries = /淘汰|不敌|晋级|总冠军|战至/.test(card.summary);
  const aboutStandings = /常规赛战绩/.test(card.summary);
  check(`[${tag}] the summary is about the playoffs series, not regular-season standings${mayMissPlayoffs ? " (or, if the playoffs were missed, the 82-game regular season)" : ""}`,
    mayMissPlayoffs ? (aboutSeries && !aboutStandings) || (aboutStandings && !aboutSeries && games === 82) : aboutSeries && !aboutStandings,
    card.summary.slice(-70));
  check(`[${tag}] the sim was saved (the paid levels are in the stored career)`, after.levels > 0 && after.phase !== "regular", after.phase);
  check(`[${tag}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-playoffs", { timeout: 10000 });
  check(`[${tag}] 回到赛季主页 lands on the playoffs tab`, await page.evaluate(() => document.querySelector('[data-season-tab="playoffs"]')?.classList.contains("active") ?? true));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
}

for (const [tag, width, height] of [["desktop", 1280, 800], ["mobile", 390, 844]]) {
  // A. 一键打完季后赛, with the playoffs open and the user in them
  {
    const { page, errors } = await newCareerPage(width, height);
    const setup = await toPlayoffs(page);
    check(`[${tag} all-po] setup: playoffs are open and the user is in the bracket`, setup.phase === "playoffs" && setup.inBracket, JSON.stringify(setup));
    if (setup.inBracket) {
      await hubOnPlayoffsTab(page);
      await bulkClickAndCheck(page, errors, `${tag} all-po`, "#btn-season-sim-all-po");
    }
    await page.close();
  }
}

// B. 模拟下一轮 (one round at a time), desktop
{
  const { page, errors } = await newCareerPage(1280, 800);
  const setup = await toPlayoffs(page);
  check("[advance-po] setup: playoffs are open and the user is in the bracket", setup.phase === "playoffs" && setup.inBracket, JSON.stringify(setup));
  if (setup.inBracket) {
    await hubOnPlayoffsTab(page);
    await bulkClickAndCheck(page, errors, "advance-po", "#btn-season-advance-po");
  }
  await page.close();
}

// C. 一键模拟整个季后赛 from the START of the season: plays the user's remaining REGULAR-season games too
{
  const { page, errors } = await newCareerPage(1280, 800);
  await page.click('[data-season-tab="playoffs"]');
  await bulkClickAndCheck(page, errors, "from-regular-season", "#btn-season-sim-playoffs", { minGames: 82, mayMissPlayoffs: true, waitMs: 150000 });
  await page.close();
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
