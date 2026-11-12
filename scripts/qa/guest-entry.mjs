// Guest-first account entry (M1): compact status bar, My Profile panel, non-blocking account gate,
// Back from account creation returns to the page you came from. One desktop + one mobile pass.
// Usage: node scripts/qa/guest-entry.mjs /tmp/cls-qa/guest [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text, openSingleSeason } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/guest";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const screen = (page) => page.evaluate(() => document.querySelector("main.screen.active")?.id);
const accountCount = (page) => page.evaluate(async () => (await import("/js/data/account.js")).listAccounts().length);
const gateShown = (page) => page.$eval("#account-gate", (el) => !el.hidden);

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const fresh = async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await homeActive(page);
  };

  // 1. Guest home: one compact bar, Quick Play still the main action on the first screen
  await fresh();
  const bar = await page.$eval("#account-home-bar", (el) => ({ guest: el.classList.contains("is-guest"), h: Math.round(el.getBoundingClientRect().height) }));
  check(`[${tag}] guest bar is marked guest`, bar.guest);
  check(`[${tag}] guest bar is compact`, bar.h <= (tag === "mobile" ? 96 : 60), `${bar.h}px`);
  check(`[${tag}] guest bar says Guest`, (await text(page, "#account-home-name")) === "访客");
  check(`[${tag}] profile panel starts closed`, await page.$eval("#profile-panel", (el) => el.hidden));
  const cta = await page.$eval("#btn-play-now", (el) => el.getBoundingClientRect().bottom);
  check(`[${tag}] Quick Play is above the fold`, cta <= h, `${Math.round(cta)} <= ${h}`);
  check(`[${tag}] no horizontal overflow (guest)`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-guest-home.png`);

  // 2. Guest Quick Play needs no account
  await page.click("#btn-play-now");
  await page.waitForFunction(() => !document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 15000 });
  check(`[${tag}] guest Quick Play leaves home`, (await screen(page)) !== "screen-home", await screen(page));
  check(`[${tag}] Quick Play created no account`, (await accountCount(page)) === 0);

  // 3. Guest taps Ranked: told why, stays on home, nothing cleared, no account made
  await fresh();
  await page.click('.home-tab[data-category="players"]');
  await page.click('.mode-card[data-mode="ranked"]');
  check(`[${tag}] Ranked shows the account gate`, await gateShown(page));
  check(`[${tag}] gate names the feature`, (await text(page, "#account-gate-text")).includes("排位赛"), await text(page, "#account-gate-text"));
  check(`[${tag}] still on home after the gate`, (await screen(page)) === "screen-home");
  check(`[${tag}] gate created no account`, (await accountCount(page)) === 0);
  await shoot(page, `${OUT}/${tag}-guest-gate.png`);
  await page.click("#btn-account-gate-dismiss");
  check(`[${tag}] Not now hides the gate`, !(await gateShown(page)));

  // 4. Profile panel: daily draw as guest -> gate -> create -> Back returns home
  await page.click("#btn-profile-toggle");
  check(`[${tag}] profile toggle opens the panel`, (await page.getAttribute("#btn-profile-toggle", "aria-expanded")) === "true");
  await page.click("#btn-daily-draw");
  check(`[${tag}] guest Daily Draw shows the gate`, (await gateShown(page)) && (await text(page, "#account-gate-text")).includes("每日抽卡"));
  await page.click("#btn-account-gate-create");
  check(`[${tag}] Create opens the existing account screen`, (await screen(page)) === "screen-account");
  await page.click("#btn-account-back");
  check(`[${tag}] Back returns to home`, (await screen(page)) === "screen-home");

  // 5. Back returns to the page you came from, with its state intact (season setup)
  await page.click('.home-tab[data-category="career"]');
  await openSingleSeason(page);
  await page.waitForSelector("#screen-season.active");
  await page.fill("#season-team-name", "QA 留住我");
  await page.click("#btn-season-roster-account");
  check(`[${tag}] account roster on season setup shows the gate`, await gateShown(page));
  await page.click("#btn-account-gate-create");
  await page.click("#btn-account-back");
  check(`[${tag}] Back returns to season setup, not home`, (await screen(page)) === "screen-season", await screen(page));
  check(`[${tag}] season setup kept its input`, (await page.inputValue("#season-team-name")) === "QA 留住我");
  check(`[${tag}] cancelling created no account`, (await accountCount(page)) === 0);

  // 6. Existing accounts keep cards / daily draw / switch; switching updates the bar
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const pl = await import("/js/data/players.js");
    const co = await import("/js/data/coaches.js");
    const top = [...pl.PLAYERS].sort((a, b) => pl.overall(b) - pl.overall(a));
    for (const [name, offset] of [["阿尔法", 0], ["贝塔", 40]]) {
      const a = acc.createAccount(name);
      a.playerIds = top.slice(offset, offset + 12).map((p) => p.id);
      a.onboardingDone = true;
      a.welcomeGranted = true;
      a.coachId = co.COACHES[0].id;
      a.coachIds = [a.coachId];
      acc.saveAccount(a);
    }
    // createAccount makes each new account active, so pick the first one explicitly afterwards.
    acc.setActiveAccountId(acc.listAccounts().find((x) => x.name === "阿尔法").id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  const before = await page.evaluate(async () => (await import("/js/data/account.js")).listAccounts().map((a) => `${a.name}:${a.cardCount}`).join(","));
  check(`[${tag}] account bar is not guest`, !(await page.$eval("#account-home-bar", (el) => el.classList.contains("is-guest"))));
  check(`[${tag}] account bar shows the active account`, (await text(page, "#account-home-name")).startsWith("阿尔法"));
  await page.click("#btn-profile-toggle");
  await shoot(page, `${OUT}/${tag}-account-profile.png`);
  await page.click("#btn-open-collection");
  check(`[${tag}] account opens My Player Cards`, (await screen(page)) === "screen-collection");
  check(`[${tag}] account gets no gate`, !(await gateShown(page)));
  await page.click("#btn-collection-back");
  await homeActive(page);
  if (await page.$eval("#profile-panel", (el) => el.hidden)) await page.click("#btn-profile-toggle");
  await page.click("#btn-daily-draw");
  check(`[${tag}] account opens Daily Draw`, (await screen(page)) === "screen-draw");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click("#btn-profile-toggle");
  await page.click("#btn-switch-account");
  check(`[${tag}] Switch Account opens the account list`, (await screen(page)) === "screen-account");
  const betaId = await page.evaluate(async () => (await import("/js/data/account.js")).listAccounts().find((a) => a.name === "贝塔").id);
  await page.click(`[data-acc-login="${betaId}"]`);
  await homeActive(page);
  check(`[${tag}] switching updates the bar`, (await text(page, "#account-home-name")).startsWith("贝塔"), await text(page, "#account-home-name"));
  check(`[${tag}] the top menu shows the new account's level`, /Lv\.\d+/.test(await text(page, "#account-home-lv")), await text(page, "#account-home-lv"));
  const after = await page.evaluate(async () => (await import("/js/data/account.js")).listAccounts().map((a) => `${a.name}:${a.cardCount}`).join(","));
  check(`[${tag}] both collections intact after switching`, after === before, after);
  check(`[${tag}] no horizontal overflow (account)`, await noOverflow(page));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(out.join("\n"));
const fails = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`${out.length - fails}/${out.length} passed`);
process.exit(fails ? 1 : 0);
