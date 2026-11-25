// Training Camp smoke: pick a player, pay gold, start, "go offline" for a day+ (stored timestamps shifted back,
// page reloaded = game closed and reopened), claim. Desktop + 390px. Shots in OUT.
// Usage: node scripts/qa/training-camp.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/training";
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
  await page.waitForFunction(() => window.__rosterBootOk === true, null, { timeout: 90000 });
  await page.evaluate(async () => {
    const { players } = await (await fetch("/js/data/roster.json")).json();
    const ids = [...new Map(players.filter((p) => p.season >= 2000 && p.mpg >= 28).map((p) => [p.bref, p])).values()].slice(0, 14).map((p) => p.id);
    const account = { id: "qa-train", name: "QA", createdAt: 1, playerIds: ids, coachIds: [], cardMods: {}, coachId: "balanced", tacticId: "balanced", gold: 600, onboardingDone: true, rankedWins: 0, rankedLosses: 0 };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", account.id);
  });
}

async function openCenter(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="players"]');
  await page.click("#btn-training-entry");
  await page.waitForSelector("#screen-training.active [data-tc-form] select", { timeout: 20000 });
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  console.log(`\n== ${name} ==`);
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await seed(page);
  await openCenter(page);
  check("center opens with 2 free slots", (await page.$$(".tc-slot.empty")).length === 2);
  const firstId = await page.$eval("[data-tc-player] option:not([value=''])", (o) => o.value);
  await page.selectOption("[data-tc-player]", firstId);
  await page.click('[data-tc-camp="shooting"]');
  await page.click('[data-tc-dur="fullDay"]');
  await shoot(page, `${OUT}/${name}-1-form.png`);
  await page.click("[data-tc-start]");
  await page.waitForSelector(".tc-slot.active");
  let acc = await store(page);
  check("gold paid (600 -> 450)", acc.gold === 450, `gold=${acc.gold}`);
  check("session persisted", acc.training?.sessions?.length === 1);
  await shoot(page, `${OUT}/${name}-2-training.png`);

  // "close the game", come back 25h later
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem("cls_accounts_v1"));
    for (const s of store.training?.sessions || store.accounts[0].training.sessions) { s.startedAt -= 25 * 3600e3; s.completesAt -= 25 * 3600e3; }
    localStorage.setItem("cls_accounts_v1", JSON.stringify(store));
  });
  await openCenter(page);
  check("after reopening the session is ready", (await page.$$(".tc-slot.ready")).length === 1);
  await shoot(page, `${OUT}/${name}-3-ready.png`);
  await page.click("[data-tc-claim]");
  await page.waitForSelector(".tc-slot.empty");
  acc = await store(page);
  const mod = acc.cardMods[firstId];
  check("claimed: bonus/xp stored, slot freed, log written", !!mod?.training && acc.training.sessions.length === 0 && acc.training.log.length === 1, JSON.stringify(mod?.training));
  await page.reload({ waitUntil: "domcontentloaded" });
  check("refresh cannot re-claim (stored xp unchanged)", JSON.stringify((await store(page)).cardMods[firstId]) === JSON.stringify(mod));
  await openCenter(page);
  await shoot(page, `${OUT}/${name}-4-claimed.png`);
  check("no horizontal overflow", await noOverflow(page));
  check("no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
