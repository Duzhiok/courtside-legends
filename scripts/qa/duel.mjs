// Legend Duel D1 end to end in a real browser: Custom hub entry + Gallery
// challenge() entry, challenger/legend/difficulty select, play a full 1v1 to
// the result screen, Retry, and the record in My World. Desktop + mobile.
// D2 adds the My Avatar challenger: same select, same result screen, same
// record — the avatar's Duel Profile is derived from its body preset.
// Usage: node scripts/qa/duel.mjs /tmp/cls-qa/duel [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/duel";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };

const seedAccount = (page) => page.evaluate(async () => {
  const acc = await import("/js/data/account.js");
  const pl = await import("/js/data/players.js");
  const seen = new Set();
  const cards = [...pl.PLAYERS].filter((p) => pl.overall(p) >= 78).filter((p) => !seen.has(p.bref) && seen.add(p.bref)).slice(0, 12);
  const a = acc.createAccount("duel QA");
  a.playerIds = cards.map((p) => p.id);
  a.onboardingDone = true;
  a.welcomeGranted = true;
  // D2: the QA account has an avatar (slim build), so the Avatar tab is live.
  a.avatar = { skin: "warm", hair: "black", outfit: "forest", style: "short", body: "slim" };
  acc.saveAccount(a);
  acc.setActiveAccountId(a.id);
  return cards.length;
});

const duelRecord = (page) => page.evaluate(async () => {
  const acc = await import("/js/data/account.js");
  const a = acc.getAccount();
  return a?.duel || null;
});

const scoreText = (page) => text(page, "#duel-body");

for (const [tag, viewport] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);

  const seeded = await seedAccount(page);
  check(`[${tag}] seed account with owned cards`, seeded >= 8, `seeded ${seeded}`);
  await reload(page);

  // Gallery interface: window.CourtsideDuel.challenge("bref:season") opens the select.
  const challenged = await page.evaluate(() => window.CourtsideDuel?.challenge("jordami01:1991"));
  check(`[${tag}] window.CourtsideDuel.challenge opens the select`, challenged === true);
  await page.waitForSelector("#screen-duel.active", { timeout: 8000 });
  const jordanSelected = await page.evaluate(() => !!document.querySelector('#duel-body [data-legend="jordami01"]'));
  check(`[${tag}] Jordan preselected from the Gallery challenge`, jordanSelected);
  check(`[${tag}] select shows the 40-legend pool`, (await page.$$eval("#duel-body [data-legend]", (els) => els.length)) === 40);
  await shoot(page, `${OUT}/${tag}-select.png`);
  check(`[${tag}] no horizontal overflow on select`, await noOverflow(page));

  // Pick a challenger, start on Pro.
  await page.click('#duel-body [data-challenger-kind="owned"]');
  await page.click("#duel-body [data-challenger]");
  const startDisabledBefore = await page.$eval("#btn-duel-start", (el) => el.disabled);
  check(`[${tag}] Start enables once challenger + legend are picked`, startDisabledBefore === false);
  await page.click("#btn-duel-start");
  await page.waitForFunction(() => document.querySelector("#duel-body [data-duel-choice]"), null, { timeout: 8000 });
  check(`[${tag}] duel screen shows 4 offense choices on my ball`, (await page.$$eval("#duel-body [data-duel-choice]", (els) => els.length)) === 4);
  const before = await scoreText(page);
  await page.click("#duel-body [data-duel-choice]");
  await page.waitForTimeout(150);
  const after = await scoreText(page);
  check(`[${tag}] one possession updates the duel screen`, before !== after);
  check(`[${tag}] defense choices appear on the legend's ball`, (await page.$$eval("#duel-body [data-duel-choice]", (els) => els.length)) === 3);
  await shoot(page, `${OUT}/${tag}-duel.png`);
  check(`[${tag}] no horizontal overflow mid-duel`, await noOverflow(page));

  // Play to completion (first choice every possession).
  let finished = false;
  for (let i = 0; i < 90; i++) {
    if (await page.$("#btn-duel-retry")) { finished = true; break; }
    const choice = await page.$("#duel-body [data-duel-choice]");
    if (!choice) break;
    await choice.click();
    await page.waitForTimeout(60);
  }
  check(`[${tag}] a duel finishes with a result screen`, finished);
  await page.waitForSelector("#btn-duel-retry", { timeout: 8000 });
  const resultText = await scoreText(page);
  check(`[${tag}] result shows Retry / Next / Return`, resultText.includes("再打一次") && resultText.includes("返回"));
  await shoot(page, `${OUT}/${tag}-result.png`);
  const record = await duelRecord(page);
  check(`[${tag}] the finished duel is recorded on the account`, record && record.games.length === 1, `games=${record?.games.length}`);
  check(`[${tag}] wins+losses add up to games played`, record && record.wins + record.losses === 1);

  // Retry starts a fresh duel; quitting it does not record a second game.
  await page.click("#btn-duel-retry");
  await page.waitForFunction(() => document.querySelector("#duel-body [data-duel-choice]"), null, { timeout: 8000 });
  check(`[${tag}] Retry starts a fresh duel at 0-0`, (await scoreText(page)).includes("0"));
  await page.click("#btn-duel-quit");
  await page.waitForSelector("#duel-body [data-legend]", { timeout: 8000 });
  const recordAfterQuit = await duelRecord(page);
  check(`[${tag}] quitting a duel does not record it`, recordAfterQuit && recordAfterQuit.games.length === 1);

  // Legend vs Legend: challenger from the gallery pool, no owned card needed.
  await page.click('#duel-body [data-challenger-kind="legend"]');
  await page.click("#duel-body [data-challenger]");
  await page.click("#btn-duel-start");
  await page.waitForFunction(() => document.querySelector("#duel-body [data-duel-choice]"), null, { timeout: 8000 });
  check(`[${tag}] Legend vs Legend starts a duel`, true);
  await page.click("#btn-duel-quit");

  // My World shows the record (back to home first — the duel screen has no home tabs).
  await page.click("#btn-duel-back");
  await page.waitForSelector("#screen-home.active", { timeout: 8000 });
  await page.click('.home-tab[data-category="world"]');
  await page.waitForSelector("#duel-records", { timeout: 8000 });
  const worldText = await text(page, "#duel-records");
  check(`[${tag}] My World shows the duel record`, worldText.includes("传奇单挑") && /\d+ 胜/.test(worldText), worldText.slice(0, 80));
  await shoot(page, `${OUT}/${tag}-myworld.png`);
  check(`[${tag}] no horizontal overflow in My World`, await noOverflow(page));

  // D2: My Avatar challenger — same select, same result screen, same record.
  await page.click("#btn-duel-from-world");
  await page.waitForSelector("#screen-duel.active", { timeout: 8000 });
  await page.click('#duel-body [data-challenger-kind="avatar"]');
  const avatarCard = await page.$('#duel-body [data-challenger^="avatar:"]');
  check(`[${tag}] Avatar tab shows the avatar challenger`, !!avatarCard);
  const avatarStage = await page.$("#duel-avatar-stage");
  check(`[${tag}] Avatar tab shows the avatar preview stage`, !!avatarStage);
  await page.click('#duel-body [data-challenger^="avatar:"]');
  await page.click("#btn-duel-start");
  await page.waitForFunction(() => document.querySelector("#duel-body [data-duel-choice]"), null, { timeout: 8000 });
  check(`[${tag}] Avatar duel starts`, true);
  let avatarFinished = false;
  for (let i = 0; i < 90; i++) {
    if (await page.$("#btn-duel-retry")) { avatarFinished = true; break; }
    const choice = await page.$("#duel-body [data-duel-choice]");
    if (!choice) break;
    await choice.click();
    await page.waitForTimeout(60);
  }
  check(`[${tag}] Avatar duel finishes with a result screen`, avatarFinished);
  await shoot(page, `${OUT}/${tag}-avatar-result.png`);
  const recordAfterAvatar = await duelRecord(page);
  check(`[${tag}] Avatar duel is recorded as an avatar challenge`, recordAfterAvatar && recordAfterAvatar.games.length === 2 && recordAfterAvatar.games[0].challengerKind === "avatar", `games=${recordAfterAvatar?.games.length}`);
  const cardCountAfterAvatar = await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    return acc.getAccount()?.playerIds?.length;
  });
  check(`[${tag}] Avatar duel did not gift the legend card`, cardCountAfterAvatar === 12, `playerIds=${cardCountAfterAvatar}`);
  await page.click("#btn-duel-return");
  await page.waitForSelector("#screen-home.active", { timeout: 8000 });

  // Custom hub entry opens the select too (custom tab -> budget-draft card -> hub).
  await page.click('.home-tab[data-category="custom"]');
  await page.click('[data-mode="custom"]');
  await page.waitForSelector("#screen-custom-hub.active", { timeout: 8000 });
  const hasEntry = await page.$("#btn-custom-legend-duel");
  check(`[${tag}] Custom hub has the Legend Duel entry`, !!hasEntry);
  await page.click("#btn-custom-legend-duel");
  await page.waitForSelector("#screen-duel.active", { timeout: 8000 });
  check(`[${tag}] Custom hub entry opens the select`, true);

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
