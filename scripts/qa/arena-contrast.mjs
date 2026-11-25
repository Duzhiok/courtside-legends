// Arena (dark) theme audit: every themed screen reached through the real flow, EVERY visible piece of text measured
// with lib/page.mjs textContrast (no selector list to forget an element from -- B133 hid player names at 1.05 behind a
// hand-written list), plus a full-page screenshot to look at. Desktop 1440 and phone 390.
// Screens: home, season hub (every tab), setup, live game, result, Reborn. Not covered: #screen-market (the between-rounds
// shop of a run; needs a finished round to reach).
// usage: node scripts/qa/arena-contrast.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, shoot, textContrast } from "./lib/page.mjs";
import { fastForwardToResult, openCareer } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/arena-contrast";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
// The arena page colour (--arena-page) under everything; gradients count as their LIGHTEST stop (--arena-3), the worst case for light text.
const ARENA = { under: [6, 17, 11], gradient: [29, 74, 49] };
let failed = 0;
const check = (label, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); };

// Known false positives, each checked on the screenshot (textContrast cannot see what is painted behind them):
//   SVG <text> -- the My Home room illustration draws its label on the beige wall, not on the card colour.
//   button.btn.primary -- gold gradient with dark ink ("快速开打"); a gradient is measured as the dark arena stop.
const FALSE_POSITIVE = [/^text\./, /^button\.btn\.primary /];

async function audit(page, tag, name, root) {
  const themed = await page.$eval(root, (el) => el.classList.contains("arena")).catch(() => false);
  const lows = (await textContrast(page, root, ARENA)).filter((line) => !FALSE_POSITIVE.some((re) => re.test(line)));
  check(`[${tag}] ${name}: every visible text is AA contrast${themed ? "" : " (screen not arena-themed)"}`, lows.length === 0, lows.slice(0, 6).join(" | "));
  await shoot(page, `${OUT}/${tag}-${name}.png`);
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
  page.on("dialog", (d) => d.accept());

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  await audit(page, tag, "home", "#screen-home");

  await openCareer(page, BASE);
  const tabs = await page.$$eval("[data-season-tab]", (els) => els.filter((b) => b.getClientRects().length).map((b) => b.dataset.seasonTab));
  for (const tab of tabs) {
    await page.click(`[data-season-tab="${tab}"]`);
    await page.waitForTimeout(400);
    await audit(page, tag, `season-${tab}`, "#screen-season");
  }

  await page.click("#btn-season-play");
  await page.waitForSelector("#screen-setup.active", { timeout: 10000 });
  await audit(page, tag, "setup", "#screen-setup");
  await page.clock.install();
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 10000 });
  let sampled = false;
  const ended = await fastForwardToResult(page, { onStep: async () => { if (!sampled) { sampled = true; await audit(page, tag, "game", "#screen-game"); } } });
  check(`[${tag}] the game reached the result screen`, ended);
  if (ended) await audit(page, tag, "result", "#screen-result");
  check(`[${tag}] no page errors (home/season/setup/game/result)`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();

  const reborn = await browser.newPage({ viewport: { width, height } });
  const rebornErrors = [];
  reborn.on("pageerror", (e) => rebornErrors.push(e.message.slice(0, 120)));
  await reborn.goto(`${BASE}?reborn=1`, { waitUntil: "domcontentloaded" });
  const up = await reborn.waitForSelector("#screen-reborn.active", { timeout: 30000 }).then(() => true, () => false);
  check(`[${tag}] Reborn dev entry opens`, up);
  if (up) await audit(reborn, tag, "reborn", "#screen-reborn");
  check(`[${tag}] no page errors (Reborn)`, rebornErrors.length === 0, rebornErrors.slice(0, 2).join(" | "));
  await reborn.close();
}
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nALL PASS");
process.exit(failed ? 1 : 0);
