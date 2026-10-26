// Browser QA for the merge follow-ups: gacha reveal no longer crashes, onboarding star cap,
// harder daily tasks (progress + English board), and the trade-listing preference dropdown.
// Usage: node scripts/qa/merge-followups.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/merge-followups";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

const homeReady = (page) =>
  page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const ovrsIn = (page, sel) =>
  page.$$eval(`${sel} .player-card .meta`, (els) => els.map((e) => Number((e.textContent.match(/OVR (\d+)/) || [])[1])));

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeReady(page);

  // 1) Onboarding star cap, through the real account-creation UI.
  await page.evaluate(() => document.querySelector("#btn-account-create")?.closest("section, .screen")?.classList);
  await page.evaluate(() => { document.querySelector("#account-new-name").value = "QA"; document.querySelector("#btn-account-create").click(); });
  await page.waitForSelector("#screen-onboard.active", { timeout: 10000 });
  const seven = await ovrsIn(page, "#onboard-pool");
  await page.click("#btn-onboard-next");
  await page.waitForFunction(() => document.querySelectorAll("#onboard-pool [data-pick]").length >= 10, null, { timeout: 10000 });
  const offers = await ovrsIn(page, "#onboard-pool");
  const stars = (list) => list.filter((o) => o >= 85).length;
  check(`[${tag}] system seven holds <= 1 star`, seven.length === 7 && stars(seven) <= 1, `OVRs ${seven.join(",")}`);
  check(`[${tag}] seven + offers stay within the 2-star cap`, stars(seven) + stars(offers) <= 2, `${stars(seven)} + ${stars(offers)}`);
  check(`[${tag}] at least one star is on the table`, stars(seven) + stars(offers) >= 1);
  await page.screenshot({ path: `${OUT}/${tag}-onboard-offers.png` });

  // Finish onboarding with a seeded, cheap account so the remaining checks are deterministic.
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.activeAccount ? acc.activeAccount() : null;
    const target = a || acc.createAccount("QA2");
    target.playerIds = players.PLAYERS.filter((p) => players.overall(p) >= 55 && players.overall(p) <= 72)
      .map((p) => ({ id: p.id, sal: market.playerSalary(p) })).sort((x, y) => x.sal - y.sal).slice(0, 15).map((p) => p.id);
    target.onboardingDone = true; target.gold = 500; target.tickets = 3;
    target.coachId = coaches.COACHES[0].id; target.coachIds = [target.coachId];
    acc.saveAccount(target); acc.setActiveAccountId(target.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeReady(page);

  // 2) Gacha reveal renders (used to throw "getLang is not defined") + task board progress.
  await page.evaluate(() => document.querySelector("#btn-daily-draw").click());
  await page.waitForSelector("#screen-draw.active", { timeout: 10000 });
  const tasks = await page.$eval("#draw-tasks", (e) => e.textContent.replace(/\s+/g, " "));
  check(`[${tag}] task board shows the harder targets with progress`, /打 3 场排位 0\/3/.test(tasks) && /排位赢 2 场 0\/2/.test(tasks) && /金币挑战赛赢 3 场 0\/3/.test(tasks), tasks.slice(0, 120));
  const before = errors.length;
  await page.click("#btn-draw-pull");
  await page.waitForFunction(() => document.querySelector("#draw-stage .draw-reveal, #draw-stage .name"), null, { timeout: 10000 });
  check(`[${tag}] card reveal renders without a page error`, errors.length === before, errors.slice(before).join(" | "));
  await page.screenshot({ path: `${OUT}/${tag}-draw-reveal.png` });

  // 3) English task board.
  await page.evaluate(async () => { const i = await import("/js/i18n.js"); i.setLang("en"); });
  await page.evaluate(() => { document.querySelector("#btn-draw-back").click(); document.querySelector("#btn-collection-draw")?.click(); });
  await page.waitForSelector("#screen-draw.active", { timeout: 10000 });
  const tasksEn = await page.$eval("#draw-tasks", (e) => e.textContent);
  check(`[${tag}] English task board has no Chinese`, !/[\u4e00-\u9fff]/.test(tasksEn), tasksEn.replace(/\s+/g, " ").slice(0, 120));
  await page.evaluate(async () => { const i = await import("/js/i18n.js"); i.setLang("zh"); });
  check(`[${tag}] no horizontal overflow on draw screen`, await noOverflow(page));

  // 4) Season market: list a player, pick a sale preference, proposals follow it.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeReady(page);
  await page.click('.mode-card[data-mode="season"]');
  await page.waitForSelector("#screen-season.active");
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector(".sm-list-trade", { timeout: 10000 });
  await page.click(".sm-list-trade");
  await page.waitForSelector(".sm-list-pref", { timeout: 10000 });
  const options = await page.$$eval(".sm-list-pref option", (os) => os.map((o) => o.textContent));
  check(`[${tag}] listing preference dropdown offers 5 choices`, options.length === 5, options.join(" / "));
  await page.selectOption(".sm-list-pref", "picks");
  await page.waitForFunction(() => document.querySelector(".sm-list-pref")?.value === "picks", null, { timeout: 10000 });
  // Either an offer that cites the preference, or the explicit "no team can" note -- never silence.
  const feedback = await page.evaluate(() => document.querySelector("#season-market")?.textContent || "");
  check(`[${tag}] the preference is answered (offer citing it, or an explicit note)`, /按「选秀权优先」挂牌/.test(feedback) || /暂时没有球队能按「选秀权优先」/.test(feedback));
  check(`[${tag}] no horizontal overflow on market tab`, await noOverflow(page));
  await page.screenshot({ path: `${OUT}/${tag}-market-listing.png`, fullPage: false });

  check(`[${tag}] no page errors overall`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("PASS")).length}/${report.length} passed`);
