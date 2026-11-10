// Playoffs are parallel and the Finals can be stepped game by game; the Finals awards agree with each other.
// Real UI, real engine: awards -> playoffs tab -> step one playoff night at a time.
//   node scripts/qa/playoffs-parallel.mjs [outDir] [baseUrl]
import { openSingleSeason, noOverflow } from "./lib/page.mjs";
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/playoffs-parallel";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

const chips = (page, h4) =>
  page.$$eval(".season-playoffs .season-award-card", (cards, title) => {
    const card = cards.find((c) => c.querySelector("h4")?.textContent.trim().startsWith(title));
    return card ? card.querySelectorAll(".series-game").length : -1;
  }, h4);
const backToPlayoffs = async (page) => {
  // A night that includes the user's own game lands on the result screen; come back to the tab.
  if (await page.$eval("#screen-result", (el) => el.classList.contains("active")).catch(() => false)) await page.click("#btn-result-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 10000 });
  await page.click('[data-season-tab="playoffs"]');
  await page.waitForSelector("#season-playoffs:not([hidden])");
};
const night = async (page) => {
  await page.click("#btn-season-night-po");
  await backToPlayoffs(page);
};

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.createAccount("QA 教练");
    a.playerIds = players.PLAYERS.filter((p) => players.overall(p) >= 55 && players.overall(p) <= 70)
      .map((p) => ({ id: p.id, sal: market.playerSalary(p) })).sort((x, y) => x.sal - y.sal).slice(0, 15).map((p) => p.id);
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

  // Sim the whole regular season, then enter the playoffs from the awards page.
  await page.click("#btn-season-sim-one");
  await page.waitForSelector("#screen-result.active", { timeout: 10000 });
  await page.click("#btn-result-sim-season");
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
  await page.click("#app-confirm-accept");
  await page.waitForFunction(() => document.querySelector("#btn-result-sim-season")?.hidden, null, { timeout: 120000 });
  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 10000 });
  await page.click('[data-season-tab="awards"]');
  await page.click("#btn-season-to-playoffs");
  await page.waitForSelector("#season-playoffs:not([hidden])");

  const nightLabel = await page.textContent("#btn-season-night-po");
  check(`[${tag}] the playoffs page offers a one-night step as the main action`, /比赛日/.test(nightLabel), nightLabel.trim());

  // ONE night: both conferences play game 1 together.
  await night(page);
  const east1 = await chips(page, "东部");
  const west1 = await chips(page, "西部");
  check(`[${tag}] after one night BOTH conferences have games on the board (West no longer waits for East)`, east1 >= 4 && west1 >= 4, `east chips ${east1}, west chips ${west1}`);

  // Step nights until the Finals is set up.
  let guard = 0;
  while (guard++ < 40 && (await page.$(".finals-card")) === null) await night(page);
  check(`[${tag}] both conferences reached the Finals together`, (await page.$(".finals-card")) !== null);
  const board0 = await page.textContent(".finals-board strong");
  check(`[${tag}] the Finals is set up at 0 – 0, NOT auto-played`, /0\s*–\s*0/.test(board0) && (await chips(page, "总决赛")) === 0, board0.trim());
  const stepLabel = await page.textContent("#btn-season-night-po");
  check(`[${tag}] the Finals can be stepped one game at a time`, /总决赛下一场/.test(stepLabel), stepLabel.trim());
  check(`[${tag}] the Finals names where the next game is`, /下一场：第 1 场 · 主场/.test(await page.textContent(".finals-card")));
  await page.screenshot({ path: `${OUT}/${tag}-finals-before.png`, fullPage: true });

  await night(page);
  const board1 = (await page.textContent(".finals-board strong")).replace(/\s/g, "");
  check(`[${tag}] one click plays exactly one Finals game`, (await chips(page, "总决赛")) === 1 && ["1–0", "0–1"].includes(board1), board1);
  await page.screenshot({ path: `${OUT}/${tag}-finals-game1.png`, fullPage: true });

  guard = 0;
  while (guard++ < 10 && (await page.$("#btn-season-night-po")) !== null) await night(page);
  const champ = await page.textContent(".finals-card");
  check(`[${tag}] the Finals ends in a champion after at most 7 games`, /总冠军/.test(champ) && (await chips(page, "总决赛")) <= 7 && (await chips(page, "总决赛")) >= 4);

  // The Finals awards must agree with each other.
  const names = await page.$$eval(".all-team-slot strong", (els) => els.map((e) => e.textContent.trim()));
  const mvp = await page.$$eval(".season-playoffs .season-award-card", (cards) => cards.find((c) => c.querySelector("h4")?.textContent.includes("总决赛 MVP"))?.querySelector("strong")?.textContent.trim());
  check(`[${tag}] the Finals MVP is on the Finals All-Team`, !!mvp && names.includes(mvp), `${mvp} in ${names.join(", ")}`);
  const lines = await page.$$eval(".all-team-slot .tiny:last-child", (els) => els.map((e) => e.textContent));
  const gp = await page.$eval(".season-playoffs", (el) => el.textContent.match(/（(\d)场）/)?.[1]);
  check(`[${tag}] the MVP line is a Finals line (<= 7 games)`, Number(gp) >= 4 && Number(gp) <= 7, `gp=${gp}`);
  check(`[${tag}] All-Team numbers are per-game Finals numbers, not season totals`, lines.every((l) => { const m = l.match(/([\d.]+)分/); return m && Number(m[1]) < 70; }), lines.join(" | "));
  check(`[${tag}] no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.screenshot({ path: `${OUT}/${tag}-finals-done.png`, fullPage: true });
  await page.close();
}

await run(1280, 900, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
const failing = report.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${failing} failing / ${report.length} total`);
process.exit(failing ? 1 : 0);
