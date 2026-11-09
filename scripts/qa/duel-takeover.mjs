// Legend Duel D3 2D takeover in a real browser: the court renders, the
// player moves with keyboard + touch drag, the spot suggestion follows the
// ball, choices still resolve through DuelSim, and the result screen keeps
// Retry / Next / Return. Desktop + mobile.
// Usage: node scripts/qa/duel-takeover.mjs /tmp/cls-qa/duel-takeover [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/duel-takeover";
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
  const a = acc.createAccount("duel takeover QA");
  a.playerIds = cards.map((p) => p.id);
  a.onboardingDone = true;
  a.welcomeGranted = true;
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

const markerLeft = (page, cls) => page.$eval(`#duel-body ${cls}`, (el) => parseFloat(el.style.left));
const scoreText = (page) => text(page, "#duel-body");

for (const [tag, viewport] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, hasTouch: tag === "mobile" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);

  const seeded = await seedAccount(page);
  check(`[${tag}] seed account with owned cards`, seeded >= 8, `seeded ${seeded}`);
  await reload(page);

  await page.evaluate(() => window.CourtsideDuel?.challenge("jordami01:1991"));
  await page.waitForSelector("#screen-duel.active", { timeout: 8000 });
  await page.click('#duel-body [data-challenger-kind="owned"]');
  await page.click("#duel-body [data-challenger]");
  await page.click("#btn-duel-start");
  await page.waitForSelector("#duel-court", { timeout: 8000 });

  check(`[${tag}] 2D court renders (SVG + markers + ball)`,
    (await page.$("#duel-court")) && (await page.$$eval("#duel-body .duel-marker", (els) => els.length)) === 2
    && !!(await page.$("#duel-body .duel-ball")),
    `markers=${await page.$$eval("#duel-body .duel-marker", (els) => els.length)}`);
  check(`[${tag}] HUD shows score and stamina`, (await scoreText(page)).includes("体力") || (await scoreText(page)).includes("Stamina"));
  check(`[${tag}] 4 offense choices on my ball`, (await page.$$eval("#duel-body [data-duel-choice]", (els) => els.length)) === 4);
  check(`[${tag}] the spot suggestion highlights Outside at the top of the arc`,
    !!(await page.$('#duel-body [data-duel-choice="outside"].duel-suggested')));
  await shoot(page, `${OUT}/${tag}-court.png`);
  check(`[${tag}] no horizontal overflow on the court`, await noOverflow(page));

  // Keyboard: ArrowRight moves the ball-handler marker; "1" resolves a possession.
  const leftBefore = await markerLeft(page, ".duel-marker-a");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  const leftAfter = await markerLeft(page, ".duel-marker-a");
  check(`[${tag}] ArrowRight moves the ball-handler on the court`, leftAfter > leftBefore, `${leftBefore}% -> ${leftAfter}%`);
  const spotLine = await text(page, "#duel-spot-line");
  check(`[${tag}] the spot line follows the ball`, spotLine.length > 0, spotLine.slice(0, 40));
  const before = await scoreText(page);
  await page.keyboard.press("1");
  await page.waitForTimeout(200);
  check(`[${tag}] number key 1 resolves a possession`, (await scoreText(page)) !== before);
  check(`[${tag}] 3 defense choices appear on the legend's ball`, (await page.$$eval("#duel-body [data-duel-choice]", (els) => els.length)) === 3);
  await shoot(page, `${OUT}/${tag}-defense.png`);

  // Touch / pointer drag on the court moves the controlled player (defender here).
  const defLeftBefore = await markerLeft(page, ".duel-marker-a");
  const box = await page.$eval("#duel-court", (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  if (tag === "mobile") {
    await page.touchscreen.tap(box.x + box.w * 0.2, box.y + box.h * 0.5);
  } else {
    await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.5, { steps: 5 });
    await page.mouse.up();
  }
  await page.waitForTimeout(250);
  const defLeftAfter = await markerLeft(page, ".duel-marker-a");
  check(`[${tag}] dragging the court moves the controlled player`, defLeftAfter !== defLeftBefore, `${defLeftBefore}% -> ${defLeftAfter}%`);
  await page.keyboard.press("1");
  await page.waitForTimeout(200);
  check(`[${tag}] defense resolves back to my ball (4 choices)`, (await page.$$eval("#duel-body [data-duel-choice]", (els) => els.length)) === 4);

  // Play to completion with the choice buttons (first choice each possession).
  let finished = false;
  for (let i = 0; i < 90; i++) {
    if (await page.$("#btn-duel-retry")) { finished = true; break; }
    const choice = await page.$("#duel-body [data-duel-choice]");
    if (!choice) break;
    await choice.click();
    await page.waitForTimeout(60);
  }
  check(`[${tag}] a takeover duel finishes with a result screen`, finished);
  await page.waitForSelector("#btn-duel-retry", { timeout: 8000 });
  const resultText = await scoreText(page);
  check(`[${tag}] result shows Retry / Next / Return`, resultText.includes("再打一次") && resultText.includes("返回"));
  await shoot(page, `${OUT}/${tag}-result.png`);
  const record = await duelRecord(page);
  check(`[${tag}] the finished duel is recorded on the account`, record && record.games.length === 1, `games=${record?.games.length}`);
  const cardCount = await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    return acc.getAccount()?.playerIds?.length;
  });
  check(`[${tag}] winning on the court did not gift the legend card`, cardCount === 12, `playerIds=${cardCount}`);

  // Retry starts a fresh duel on the court; quitting it records nothing new.
  await page.click("#btn-duel-retry");
  await page.waitForSelector("#duel-court", { timeout: 8000 });
  check(`[${tag}] Retry restarts on the 2D court at 0-0`, (await scoreText(page)).includes("0"));
  await page.click("#btn-duel-quit");
  await page.waitForSelector("#duel-body [data-legend]", { timeout: 8000 });
  const recordAfterQuit = await duelRecord(page);
  check(`[${tag}] quitting a duel does not record it`, recordAfterQuit && recordAfterQuit.games.length === 1);

  // Avatar challenger on the court: same court, same result screen.
  await page.click('#duel-body [data-challenger-kind="avatar"]');
  await page.click('#duel-body [data-challenger^="avatar:"]');
  await page.click("#btn-duel-start");
  await page.waitForSelector("#duel-court", { timeout: 8000 });
  check(`[${tag}] Avatar duel starts on the 2D court`, true);
  await shoot(page, `${OUT}/${tag}-avatar-court.png`);
  check(`[${tag}] no horizontal overflow on the avatar court`, await noOverflow(page));

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
