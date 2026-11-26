// Hosted league smoke (B47): turn it on from the Training Center, "go offline" for 3 days (the settled day is shifted back and
// the page reloaded = game closed and reopened), come back to the welcome-back card, check gold / XP / the log, reopen (nothing
// is paid twice), then turn it off. Desktop + 390px. Shots in OUT.
// Usage: node scripts/qa/hosted-league.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/hosted";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cls_accounts_v1")).accounts[0]);

async function seed(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__rosterBootOk === true, null, { timeout: 90000 });
  await page.evaluate(async () => {
    const { players } = await (await fetch("/js/data/roster.json")).json();
    const ids = [...new Map(players.filter((p) => p.season >= 2000 && p.mpg >= 28).map((p) => [p.bref, p])).values()].slice(0, 14).map((p) => p.id);
    const account = { id: "qa-hosted", name: "QA", createdAt: 1, playerIds: ids, coachIds: [], cardMods: {}, coachId: "balanced", tacticId: "balanced", gold: 600, onboardingDone: true, rankedWins: 0, rankedLosses: 0 };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", account.id);
  });
}

async function openCenter(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="players"]');
  await page.click("#btn-training-entry");
  await page.waitForSelector("#screen-training.active [data-hosted] select", { timeout: 20000 });
}

const hostedText = (page) => page.$eval("[data-hosted]", (el) => el.textContent.replace(/\s+/g, " ").trim());

const browser = await chromium.launch({ executablePath: EXE });
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  console.log(`\n== ${name} ==`);
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await seed(page);
  await openCenter(page);

  check(`[${name}] the hosted league card is on the Training Center, off by default`, /托管联赛/.test(await hostedText(page)) && /未开启/.test(await hostedText(page)));
  check(`[${name}] nothing to report before the first day`, (await page.$("[data-hosted-report]")) === null);

  const firstId = await page.$eval("[data-hosted-player] option:not([value=''])", (o) => o.value);
  await page.selectOption("[data-hosted-player]", firstId);
  await page.waitForSelector("[data-hosted-attr]");
  await page.click('[data-hosted-attr="defense"]');
  check(`[${name}] picking the focus player shows attributes, the chosen one highlighted`, await page.$eval('[data-hosted-attr="defense"]', (b) => b.classList.contains("on")));
  await page.click("[data-hosted-save]");
  let acc = await store(page);
  check(`[${name}] turning it on saves the plan (focus + attribute)`, acc.hosted?.plan?.playerId === firstId && acc.hosted?.plan?.attr === "defense", JSON.stringify(acc.hosted?.plan));
  check(`[${name}] the card now reads "on" with the focus`, /托管中/.test(await hostedText(page)) && /防守/.test(await hostedText(page)));
  check(`[${name}] switching on pays nothing and plays nothing`, acc.gold === 600 && !(acc.hosted?.log || []).length, `gold=${acc.gold}`);

  // ---- 3 days away ----
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem("cls_accounts_v1"));
    const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    store.accounts[0].hosted.settledDay = today - 4; // days today-3 .. today-1 are owed
    localStorage.setItem("cls_accounts_v1", JSON.stringify(store));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="players"]');
  // The games block the page's thread, so poll-based waiting cannot see a line that is only up for a moment. Watch the DOM
  // from inside the page: when ".hl-settling" is inserted, ask whether it is STILL there at the next animation frame
  // (= it was drawn before the games started, not just inserted and then frozen behind them).
  await page.evaluate(() => {
    window.__settlingPainted = false;
    new MutationObserver(() => {
      if (document.querySelector(".hl-settling")) requestAnimationFrame(() => { if (document.querySelector(".hl-settling")) window.__settlingPainted = true; });
    }).observe(document.body, { subtree: true, childList: true });
  });
  await page.click("#btn-training-entry");
  await page.waitForSelector("[data-hosted-report]", { timeout: 60000 });
  const sawSettling = await page.evaluate(() => window.__settlingPainted);
  check(`[${name}] a "settling" line shows while the games run (so the screen never looks frozen)`, sawSettling);
  const report = await page.$eval("[data-hosted-report]", (el) => el.textContent.replace(/\s+/g, " ").trim());
  check(`[${name}] the welcome-back card tells the story first`, /欢迎回来/.test(report) && /离线打了 3 天/.test(report) && /\d+ 场 \d+ 胜 \d+ 负/.test(report) && /(最精彩|最接近)/.test(report), report.slice(0, 160));
  check(`[${name}] ...and the numbers after it`, /金币 \+¤\d+/.test(report) && /经验 \+\d+/.test(report));
  await shoot(page, `${OUT}/${name}-1-welcome-back.png`);

  acc = await store(page);
  check(`[${name}] 3 days settled and logged`, (acc.hosted.log || []).length === 3, `log=${(acc.hosted.log || []).length}`);
  check(`[${name}] gold was paid (taper + weekly cap respected)`, acc.gold > 600 && acc.gold <= 600 + 3 * 195 * 2, `gold=${acc.gold}`);
  const bank = acc.cardMods?.[firstId]?.training;
  check(`[${name}] the focus card's defense XP went through the Training Center bank`, !!bank && ((bank.xp?.defense || 0) > 0 || (bank.attrs?.defense || 0) > 0), JSON.stringify(bank)?.slice(0, 120));
  check(`[${name}] the Training Center header shows the new gold`, (await page.$eval("[data-tc-gold]", (e) => e.textContent)).includes(`¤${acc.gold}`), `${await page.$eval("[data-tc-gold]", (e) => e.textContent)} vs ${acc.gold}`);
  check(`[${name}] the recent-days list shows the days`, (await page.$$(".hl-log li")).length === 3);
  check(`[${name}] no horizontal overflow`, await noOverflow(page));

  // ---- reopen: nothing is paid twice ----
  const goldBefore = acc.gold;
  await openCenter(page);
  await page.waitForTimeout(800);
  acc = await store(page);
  check(`[${name}] reopening settles nothing more (same gold, same log)`, acc.gold === goldBefore && acc.hosted.log.length === 3 && (await page.$("[data-hosted-report]")) === null, `gold ${goldBefore} -> ${acc.gold}`);
  check(`[${name}] the log is still there after leaving the screen`, (await page.$$(".hl-log li")).length === 3);

  // ---- turn it off ----
  await page.click("[data-hosted-off]");
  acc = await store(page);
  check(`[${name}] turning it off clears the plan and the settled day (no retroactive games)`, acc.hosted.plan === null && acc.hosted.settledDay === null, JSON.stringify({ plan: acc.hosted.plan, settledDay: acc.hosted.settledDay }));
  check(`[${name}] the card reads off again`, /未开启/.test(await hostedText(page)));
  await shoot(page, `${OUT}/${name}-2-off.png`);
  check(`[${name}] no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
