// Browser QA for the roster-evaluation tab: it must show REAL season numbers, and its buttons
// must only navigate / compare -- never trade or cut anyone by themselves.
// Usage: node scripts/qa/roster-evaluation.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/roster-eval";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.createAccount("QA");
    a.playerIds = players.PLAYERS.filter((p) => players.overall(p) >= 55 && players.overall(p) <= 72)
      .map((p) => ({ id: p.id, sal: market.playerSalary(p) })).sort((x, y) => x.sal - y.sal).slice(0, 15).map((p) => p.id);
    a.onboardingDone = true; a.gold = 500; a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.click('.mode-card[data-mode="season"]');
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });

  // Play a few games so there are real per-player season numbers to evaluate.
  for (let i = 0; i < 4; i++) {
    await page.click("#btn-season-sim-one");
    await page.waitForSelector("#screen-result.active", { timeout: 15000 });
    await page.click("#btn-result-continue");
    await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 15000 });
  }

  const rosterIds = () => page.evaluate(() => [...document.querySelectorAll("#season-market .sm-row")].filter((r) => r.querySelector(".sm-cut")).map((r) => r.querySelector(".sm-cut").dataset.cut).sort());
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector(".sm-cut");
  const before = await rosterIds();

  await page.click('[data-season-tab="evaluation"]');
  await page.waitForSelector(".roster-evaluation-card", { timeout: 10000 });
  const cards = await page.$$eval(".roster-evaluation-card", (els) => els.map((el) => ({ id: el.dataset.playerId, text: el.textContent.replace(/\s+/g, " ") })));
  check(`[${tag}] one evaluation card per rostered player`, cards.length === before.length && cards.length >= 8, `${cards.length} cards vs ${before.length} players`);
  check(`[${tag}] every card shows OVR, age, potential and a recommendation`, cards.every((c) => /OVR \d+/.test(c.text) && /\d+岁/.test(c.text) && /潜力/.test(c.text) && /核心保留|轮换保留|可交易资产|裁员候选|观察/.test(c.text)));
  const withGames = cards.filter((c) => /GP[: ]*[1-9]|出场[: ]*[1-9]|[1-9]\d* ?场/.test(c.text)).length;
  check(`[${tag}] cards carry real games-played numbers after 4 games`, withGames > 0, `${withGames} of ${cards.length} show games played`);
  check(`[${tag}] no NaN / undefined / long float tails in the cards`, !cards.some((c) => /NaN|undefined|\d+\.\d{3,}/.test(c.text)), cards.find((c) => /NaN|undefined|\d+\.\d{3,}/.test(c.text))?.text.slice(0, 120) || "");
  check(`[${tag}] the advice says it never acts on its own`, /不会自动交易或裁掉任何人/.test(await page.$eval("#season-evaluation", (e) => e.textContent)));
  await page.screenshot({ path: `${OUT}/${tag}-evaluation.png` });
  check(`[${tag}] no horizontal overflow on the evaluation tab`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // Click every navigation / compare button: nobody may be traded or cut.
  for (const action of ["market", "cut"]) {
    await page.click('[data-season-tab="evaluation"]');
    await page.waitForSelector(".roster-evaluation-card");
    await page.click(`.roster-evaluation-card [data-eval-action="${action}"]`);
    const onMarket = await page.waitForFunction(() => !document.querySelector("#season-market")?.hidden, null, { timeout: 5000 }).then(() => true, () => false);
    check(`[${tag}] "${action}" button only navigates to the market tab`, onMarket);
  }
  await page.click('[data-season-tab="evaluation"]');
  await page.waitForSelector(".roster-evaluation-card");
  await page.click('.roster-evaluation-card [data-eval-action="compare"]');
  const panelShown = await page.waitForFunction(() => [...document.querySelectorAll(".trade-compare-panel")].some((p) => !p.hidden && p.textContent.trim().length > 20), null, { timeout: 5000 }).then(() => true, () => false);
  check(`[${tag}] "compare" opens a read-only comparison panel`, panelShown);
  await page.screenshot({ path: `${OUT}/${tag}-compare.png` });
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector(".sm-cut");
  const after = await rosterIds();
  check(`[${tag}] roster is identical after clicking every button`, JSON.stringify(before) === JSON.stringify(after), `${before.length} -> ${after.length}`);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("PASS")).length}/${report.length} passed`);
