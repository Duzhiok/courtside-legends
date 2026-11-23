// Season market tab, real app + real buttons (B61 step 9): the markup comes from js/ui/seasonMarketView.js, the wiring from app.js.
// Goes into a single season, opens "自由市场", then lists / unlists a player, cuts one (confirm dialog), signs a free agent with the
// room that opened up, refreshes the pool, and flips tabs. Desktop 1440 and phone 390 (no sideways overflow).
// usage: node scripts/qa/season-market.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { openSingleSeason } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/season-market";
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
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.createAccount("QA 市场");
    const picked = []; const seen = new Set(); let budget = 0;
    for (const p of [...players.PLAYERS].sort((x, y) => players.overall(y) - players.overall(x))) {
      if (picked.length >= 12) break;
      const sal = market.playerSalary(p);
      if (sal > Math.floor(1950 / 12) || (p.bref && seen.has(p.bref)) || budget + sal > 1950) continue; // per-player cap, so 12 always fit
      picked.push(p.id); if (p.bref) seen.add(p.bref); budget += sal;
    }
    a.playerIds = picked; a.onboardingDone = true; a.gold = 500; a.fragments = 0;
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

  await page.click('[data-season-tab="market"]');
  await page.waitForSelector("#season-market .sm-cap-card", { timeout: 10000 });
  const counts = () => page.evaluate(() => ({
    cuts: document.querySelectorAll("#season-market .sm-cut").length,
    signs: document.querySelectorAll("#season-market .sm-sign").length,
    open: [...document.querySelectorAll("#season-market .sm-sign")].filter((b) => !b.disabled).length,
    listed: document.querySelectorAll("#season-market .sm-list-pref").length,
    cap: document.querySelector("#season-market .sm-cap-card p")?.textContent.replace(/\s+/g, " ").trim().slice(0, 60),
  }));
  const first = await counts();
  check(`[${tag}] the market tab renders its sections`, first.cuts >= 5 && first.signs > 0, JSON.stringify(first));
  await page.screenshot({ path: `${OUT}/${tag}-market.png` });

  await page.click(".sm-list-trade");
  await page.waitForSelector("#season-market .sm-list-pref", { timeout: 5000 });
  check(`[${tag}] list for trade: the chip and the sale-preference select appear`, (await counts()).listed === 1 && await page.locator("#season-market .chip", { hasText: "已挂牌" }).count() === 1);
  await page.click(".sm-list-trade");
  await page.waitForFunction(() => document.querySelectorAll("#season-market .sm-list-pref").length === 0, null, { timeout: 5000 });
  check(`[${tag}] unlist: both go away again`, (await counts()).listed === 0);

  const before = await counts();
  await page.click(".sm-cut");
  await page.waitForSelector("#app-confirm-accept", { state: "visible", timeout: 5000 });
  await page.click("#app-confirm-accept");
  await page.waitForFunction((n) => document.querySelectorAll("#season-market .sm-cut").length === n - 1, before.cuts, { timeout: 10000 });
  const afterCut = await counts();
  check(`[${tag}] cut (with the confirm dialog): the roster shrinks by one and the market re-renders`, afterCut.cuts === before.cuts - 1, `${before.cuts} -> ${afterCut.cuts}`);

  if (afterCut.open > 0) {
    await page.locator("#season-market .sm-sign:not([disabled])").first().click();
    await page.waitForFunction((n) => document.querySelectorAll("#season-market .sm-cut").length === n + 1, afterCut.cuts, { timeout: 10000 });
    check(`[${tag}] sign a free agent into the room the cut opened`, (await counts()).cuts === afterCut.cuts + 1);
  } else {
    check(`[${tag}] sign a free agent into the room the cut opened`, false, "no enabled Sign button after the cut");
  }

  await page.click("#btn-sm-refresh-fa");
  await page.waitForSelector("#season-market .sm-sign", { timeout: 5000 });
  check(`[${tag}] refresh the free-agent pool`, (await counts()).signs > 0);
  await page.click("#btn-sm-refresh-staff");
  await page.waitForSelector("#season-market .sm-hire-coach", { timeout: 5000 });
  check(`[${tag}] refresh the coach market`, true);
  await page.click('[data-season-tab="standings"]');
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector("#season-market .sm-cap-card");
  check(`[${tag}] flipping tabs keeps the market`, (await counts()).cuts >= 5);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`[${tag}] no sideways overflow`, overflow <= 1, `${overflow}px`);
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.screenshot({ path: `${OUT}/${tag}-market-after.png` });
  await page.close();
}

await run(1440, 900, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
const failed = report.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} checks passed`);
process.exit(failed ? 1 : 0);
