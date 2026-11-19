// Browser smoke for Player Reborn Playoffs v1 (P2): standings -> enter the playoffs -> real playoff games one at a time -> out or champion
// -> reload keeps the series -> settle the contract -> next season starts clean. Desktop 1440 + mobile 390.
//
// Playing 82 real games through the UI would take minutes, so the save is put at "regular season over": the identity is created through the real UI,
// then the real modules write 82 logged games (the player's club always wins, so it is a top seed) and the league's other games (a controlled
// stand-in for GameSim, 27 s otherwise) into the save and the page is reloaded. Everything from "Enter the playoffs" on is the real flow:
// the player's games are real GameSim games, the other series are real GameSim games too.
// The takeover dialog may pop mid-game; the script passes on it.
// Usage: node scripts/qa/reborn-playoffs.mjs [outDir] [baseUrl]   (a static server must be serving the repo, default http://127.0.0.1:5173/)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-playoffs";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=playoffs-qa-1`;
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
let takeovers = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const textOf = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => "");

/** Put the save at the end of the regular season with real modules (see the header). */
async function seedEndOfSeason(page) {
  return page.evaluate(async () => {
    const { readRootSave, writeRootSave } = await import("/js/data/saveRoot.js");
    const { leagueSchedule, advanceLeague } = await import("/js/reborn/league.js");
    const rows = (await (await fetch("/js/data/roster.json")).json()).players;
    const root = readRootSave();
    const r = root.reborn;
    const year = r.player.seasonYear ?? r.startYear + 1;
    const me = r.player.teamId;
    const log = [];
    for (const g of leagueSchedule(r.seed, year).games) {
      if (g.homeId !== me && g.awayId !== me) continue;
      const home = g.homeId === me;
      log.push({ year, game: log.length + 1, opp: home ? g.awayId : g.homeId, home, won: true, ptsFor: 100, ptsAgainst: 90, min: 20, pts: 10, gameId: `game:${r.seed}:${year}:${log.length + 1}` });
    }
    r.player.seasonLog = log;
    r.player.coachTrust = 80;
    const coin = ({ game }) => ((game.ordinal + game.homeId.charCodeAt(0)) % 2 ? { home: 100, away: 90 } : { home: 90, away: 100 });
    advanceLeague(r, rows, { year, simulate: coin });
    writeRootSave(root);
    return { year, me, games: log.length };
  });
}

async function openReborn(page) {
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector(".reborn-playoffs, [data-play]", { timeout: 20000 });
}

async function playPlayoffGame(page) {
  const before = await textOf(page, ".reborn-report");
  await page.click("[data-po-play]");
  const started = Date.now();
  while (Date.now() - started < 90000) {
    // The takeover question is a modal on the Shell (no overlay class of its own): look for its option buttons.
    if (await visible(page, '.reborn-takeover-option[data-option="pass"]')) { takeovers += 1; await page.click('.reborn-takeover-option[data-option="pass"]'); }
    const now = await textOf(page, ".reborn-report");
    if (now && now !== before && !(await page.$eval("[data-po-play]", (el) => el.disabled).catch(() => false))) return true;
    if (now && now !== before && !(await page.$("[data-po-play]"))) return true;   // the run just ended: the button is gone
    await page.waitForTimeout(300);
  }
  return false;
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]].filter(([, , t]) => !process.env.ONLY || t === process.env.ONLY)) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  // A guest has no account store (nothing to copy honours into), so the run belongs to a real account.
  await page.evaluate(async () => { const { createAccount } = await import("/js/data/account.js"); createAccount("Playoffs QA"); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector(".reborn-create", { timeout: 20000 });
  await page.click('[data-reborn-destiny="historical"]');
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector("[data-play]", { timeout: 20000 });

  const seeded = await seedEndOfSeason(page);
  check(`[${tag}] the save is at the end of the regular season`, seeded.games === 82, JSON.stringify(seeded));
  await page.reload({ waitUntil: "domcontentloaded" });
  await openReborn(page);

  check(`[${tag}] 82/82 is done: no regular-season play button, the playoff entry is offered`, !(await page.$("[data-play]")) && !!(await page.$("[data-po-enter]")));
  check(`[${tag}] the contract is NOT offered yet (the season is not over)`, !(await page.$("[data-settle]")));
  const standings = await page.$$eval(".reborn-standings .reborn-standing-conf", (els) => els.map((el) => el.querySelectorAll("tbody tr").length));
  check(`[${tag}] the standings show the top eight of each conference`, standings.length === 2 && standings.every((n) => n >= 8 && n <= 9), JSON.stringify(standings));
  await page.click(".reborn-standings summary");
  await shoot(page, `${OUT}/${tag}-1-regular-season-over.png`);

  await page.click("[data-po-enter]");
  await page.waitForSelector("[data-po-play], [data-settle]", { timeout: 60000 });
  const panel = await textOf(page, ".reborn-playoffs");
  check(`[${tag}] playoffs start: first round, series 0–0, a play button`, panel.includes("首轮") && /0–0/.test(panel) && !!(await page.$("[data-po-play]")), panel.slice(0, 140));
  check(`[${tag}] the player is the better seed in round one (he won every game)`, /\(1\)|\(2\)|\(3\)|\(4\)/.test(panel), panel.slice(0, 100));
  await shoot(page, `${OUT}/${tag}-2-playoffs-start.png`);

  check(`[${tag}] first playoff game settles`, await playPlayoffGame(page));
  const report = await textOf(page, ".reborn-report");
  check(`[${tag}] the report says it is a playoff game with the series score`, report.includes("季后赛") && report.includes("系列赛") && /第 1 场/.test(report), report.slice(0, 120));
  const seriesText = await textOf(page, ".reborn-playoffs");
  const summary = await textOf(page, "#reborn-body");
  check(`[${tag}] the regular season still reads 82/82`, /82\/82/.test(summary) || /第 82\/82/.test(summary) || summary.includes("82/82"), "");
  await shoot(page, `${OUT}/${tag}-3-after-game-1.png`);

  // reload in the middle of the series: the same series score comes back
  await page.reload({ waitUntil: "domcontentloaded" });
  await openReborn(page);
  check(`[${tag}] after a reload the series is exactly where it was`, (await textOf(page, ".reborn-playoffs")) === seriesText, `${seriesText.slice(0, 90)} || ${(await textOf(page, ".reborn-playoffs")).slice(0, 90)}`);

  let games = 1;
  while ((await page.$("[data-po-play]")) && games < 30) {
    if (!(await playPlayoffGame(page))) break;
    games += 1;
  }
  const end = await textOf(page, ".reborn-playoffs");
  const over = !(await page.$("[data-po-play]"));
  check(`[${tag}] the run ends (eliminated or champion) within a legal number of games`, over && games >= 3 && games <= 28, `${games} games: ${end.slice(0, 110)}`);
  check(`[${tag}] the end screen names where it ended, and who won it all`, /被淘汰|总冠军/.test(end), end.slice(0, 140));
  check(`[${tag}] only now is the contract offered`, !!(await page.$("[data-settle]")));
  const timeline = await textOf(page, ".reborn-timeline");
  check(`[${tag}] the career timeline has this season's playoff line`, /1997 赛季：(夺得总冠军|打进总决赛，惜败|季后赛出局)/.test(timeline), (timeline.match(/1997 赛季：[^。]{0,60}/) || [""])[0]);
  if (/总冠军！/.test(end)) {
    check(`[${tag}] the champion panel states what he did in the Finals (his real minutes)`, /总决赛 \d–\d \w+ · (你出场 \d+ 场，共 \d+ 分钟|你一分钟都没打上)/.test(end), (end.match(/总决赛 \d–\d[^季]{0,70}/) || [""])[0]);
    const legacy = await page.evaluate(async () => {
      const { getAccount } = await import("/js/data/account.js");
      const { legacyOf } = await import("/js/career/careerRelationships.js");
      return legacyOf(getAccount()).filter((e) => e.type === "championship").map((e) => e.summary);
    });
    check(`[${tag}] the account's legacy log has the title, once`, legacy.length === 1, JSON.stringify(legacy));
  }
  await shoot(page, `${OUT}/${tag}-4-run-over.png`);

  await page.click("[data-settle]");
  await page.waitForSelector("[data-rollover]", { timeout: 10000 });
  await page.click("[data-rollover]");
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  const next = await textOf(page, "#reborn-body");
  check(`[${tag}] next season opens at game 1 of 82`, /第\s*1\/82/.test(next), (next.match(/赛季 \d+[^。]{0,40}/) || [""])[0]);
  check(`[${tag}] no leftover playoffs panel from the season that ended`, !(await page.$(".reborn-playoffs")));
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(`takeover dialogs passed on: ${takeovers}`);
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
