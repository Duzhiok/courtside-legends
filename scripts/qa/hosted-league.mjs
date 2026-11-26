// Hosted league smoke: set a plan in the Training Center, "come back" 3 days later (stored settledDay shifted back,
// page reloaded), see the settlement line, gold/XP changed, and a second open owes nothing (idempotent).
// Usage: node scripts/qa/hosted-league.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, shoot } from "./lib/page.mjs";

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

async function open(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="players"]');
  await page.click("#btn-training-entry");
  await page.waitForSelector("#screen-training.active [data-hosted-save]", { timeout: 60000 });
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  console.log(`\n== ${name} ==`);
  const page = await (await browser.newContext({ viewport })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__rosterBootOk === true, null, { timeout: 90000 });
  await page.evaluate(async () => {
    const { players } = await (await fetch("/js/data/roster.json")).json();
    const ids = [...new Map(players.filter((p) => p.season >= 2000 && p.mpg >= 28).map((p) => [p.bref, p])).values()].slice(0, 14).map((p) => p.id);
    const account = { id: "qa-host", name: "QA", createdAt: 1, playerIds: ids, coachIds: [], cardMods: {}, coachId: "balanced", tacticId: "balanced", gold: 100, onboardingDone: true, rankedWins: 0, rankedLosses: 0 };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", account.id);
  });
  await open(page);
  check("panel renders and save is enabled", await page.$eval("[data-hosted-save]", (b) => !b.disabled));
  const pid = await page.$eval("[data-hosted-player] option:not([value=''])", (o) => o.value);
  await page.selectOption("[data-hosted-player]", pid);
  await page.selectOption("[data-hosted-attr]", "three");
  await page.click("[data-hosted-save]");
  await page.waitForFunction(() => /托管/.test(document.querySelector("[data-tc-toast]")?.textContent || ""));
  let acc = await store(page);
  check("plan saved, nothing settled on day one", acc.hosted?.plan?.playerId === pid && acc.gold === 100, `gold=${acc.gold}`);
  await shoot(page, `${OUT}/${name}-1-plan.png`);

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("cls_accounts_v1"));
    s.accounts[0].hosted.settledDay -= 4;
    localStorage.setItem("cls_accounts_v1", JSON.stringify(s));
  });
  await open(page);
  await page.waitForSelector(".tc-hosted-report", { timeout: 120000 });
  acc = await store(page);
  const line = await page.$eval(".tc-hosted-report", (e) => e.textContent);
  check("3 days settled with real totals and gold paid", /3 天 60 场/.test(line) && acc.gold > 100, `${line} | gold=${acc.gold}`);
  check("XP reached the chosen card's bank", !!acc.cardMods?.[pid]?.training, JSON.stringify(acc.cardMods?.[pid]?.training || null).slice(0, 80));
  await shoot(page, `${OUT}/${name}-2-settled.png`);

  const goldAfter = acc.gold;
  await open(page);
  acc = await store(page);
  check("second open owes nothing (idempotent)", acc.gold === goldAfter && !(await page.$(".tc-hosted-report")));
  check("no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check("no page errors", errors.length === 0, errors.join(" | "));
}
await browser.close();
console.log(failed ? `\nFAILED ${failed}` : "\nALL PASS");
process.exit(failed ? 1 : 0);
