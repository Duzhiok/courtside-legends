// Custom 3v3 Half-Court MVP smoke in a real browser: 自定义 tab -> 3v3 entry -> pick 3 v 3 -> tip off
// -> 2D playback -> skip -> result + box score -> Retry (new seed, same picks) -> back home.
// Checks: seeded reproducibility, 21 / win-by-2 on the page, no console errors, no horizontal
// overflow, and that localStorage (saves / account economy) is byte-identical before and after.
// Desktop 1280x800 + phone 390x844.
// Usage: node scripts/qa/halfcourt-3v3.mjs /tmp/cls-qa/3v3 [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, overflowers, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/3v3";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };

const PICKS = { A: ["Michael Jordan 1996", "Scottie Pippen 1996", "Dennis Rodman 1996"], B: ["Shaquille 2000", "Kobe 2001", "Derek Fisher 2001"] };
// The roster cache key is written asynchronously once the boot roster load finishes: not game state.
const storageDump = (page) => page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter((k) => !/roster-cache/.test(k)).sort().map((k) => [k, localStorage.getItem(k)])));

async function pick(page, side, query) {
  await page.fill(`[data-search="${side}"]`, query);
  await page.waitForSelector(`[data-add="${side}:0"]`, { timeout: 10000 });
  await page.click(`[data-add="${side}:0"]`);
}

async function scoreOnPage(page) {
  return page.$eval(".hc-final", (el) => {
    const m = el.textContent.match(/(\d+)\s*:\s*(\d+)/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  });
}

async function run(label, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.evaluate(() => { globalThis.__CLS_3V3_SEED = "qa3v3"; });
  const storageBefore = await storageDump(page);

  await page.click('.home-tab[data-category="custom"]');
  await page.click("#btn-halfcourt-entry");
  await page.waitForSelector("#screen-halfcourt.active");
  check(`${label}: entry opens the 3v3 screen from the 自定义 tab`, true);
  for (const side of ["A", "B"]) for (const q of PICKS[side]) await pick(page, side, q);
  check(`${label}: 3 + 3 picked`, (await text(page, '[data-count="A"]')).includes("3/3") && (await text(page, '[data-count="B"]')).includes("3/3"));
  // One copy per side: adding the first search hit again must be refused.
  await page.fill('[data-search="A"]', PICKS.A[0]);
  await page.waitForSelector('[data-add="A:0"]');
  await page.click('[data-add="A:0"]');
  check(`${label}: a 4th pick is refused`, (await text(page, "[data-hc-picker] [data-error]")).length > 0, await text(page, "[data-hc-picker] [data-error]"));
  check(`${label}: no ×N fill button in 3v3`, (await page.$$("[data-hc-picker] [data-fill]")).length === 0);
  await shoot(page, `${OUT}/${label}-1-pick.png`);

  await page.click("[data-hc-picker] [data-start]");
  await page.waitForSelector('[data-hc-panel="play"]:not([hidden])');
  await page.waitForFunction(() => document.querySelectorAll("[data-hc-log] li.hc-poss").length >= 3, null, { timeout: 10000 });
  check(`${label}: 2D playback runs (court, 6 players, log)`, (await page.$$(".hc-court .hc-player")).length === 6);
  await shoot(page, `${OUT}/${label}-2-play.png`);
  await page.click('[data-hc-action="skip"]');
  await page.waitForSelector('[data-hc-panel="result"]:not([hidden])');
  const first = await scoreOnPage(page);
  const ok21 = first && Math.max(...first) >= 21 && Math.abs(first[0] - first[1]) >= 2;
  check(`${label}: result 21+ with a 2-point lead`, !!ok21, JSON.stringify(first));
  check(`${label}: two box scores, 3 players + total each`, (await page.$$eval(".hc-box", (t) => t.map((x) => x.querySelectorAll("tbody tr").length))).join() === "4,4");
  const engineScore = await page.evaluate(async () => {
    const mod = await import("/js/modes/halfCourt3v3.js");
    return mod.HALF_COURT_RULES.target;
  });
  check(`${label}: rules module loaded`, engineScore === 21);
  check(`${label}: no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  await shoot(page, `${OUT}/${label}-3-result.png`);

  await page.click('[data-hc-action="retry"]');
  await page.waitForSelector('[data-hc-panel="play"]:not([hidden])');
  await page.click('[data-hc-action="skip"]');
  await page.waitForSelector('[data-hc-panel="result"]:not([hidden])');
  const second = await scoreOnPage(page);
  check(`${label}: Retry plays a new game (seed -r1)`, !!second && Math.max(...second) >= 21, `${JSON.stringify(first)} -> ${JSON.stringify(second)}`);

  // Same seed again from the picker: identical first game.
  await page.click('[data-hc-action="repick"]');
  await page.click("[data-hc-picker] [data-start]");
  await page.click('[data-hc-action="skip"]');
  const again = await scoreOnPage(page);
  check(`${label}: same picks + same seed -> same final score`, JSON.stringify(again) === JSON.stringify(first), `${JSON.stringify(first)} vs ${JSON.stringify(again)}`);

  await page.click('[data-hc-action="back"]');
  await homeActive(page);
  check(`${label}: back returns home`, true);
  const before = new Map(JSON.parse(storageBefore));
  const after = new Map(JSON.parse(await storageDump(page)));
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
  check(`${label}: localStorage (saves, account, economy) unchanged`, changed.length === 0, changed.map((k) => `${k}: ${String(before.get(k)).slice(0, 60)} -> ${String(after.get(k)).slice(0, 60)}`).join(" | "));
  check(`${label}: no console / page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

try {
  await run("desktop", { width: 1280, height: 800 });
  await run("mobile", { width: 390, height: 844 });
} finally {
  await browser.close();
}
const fails = out.filter((l) => l.startsWith("FAIL"));
console.log(`\n${out.length - fails.length}/${out.length} passed`);
process.exit(fails.length ? 1 : 0);
