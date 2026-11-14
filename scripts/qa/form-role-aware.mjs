// Smoke: Gold Challenge -> play one real game (timers fast-forwarded) -> back
// in the market, every rostered player's form block renders, the verdict is
// consistent with the role-aware rating (no 近况不佳 on a positive-rated game),
// and no page errors. Full E2E is Muse's.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/form-role";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload({ waitUntil: "domcontentloaded" });
const until = async (fn, label, step = 2000, max = 60) => {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(fn)) { console.log("ok", label, i); return true; }
    await page.waitForTimeout(500);
  }
  check(label, false, "timed out"); console.log("TIMEOUT", label); await page.screenshot({ path: `${OUT}/timeout.png` }).catch(() => {});
  return false;
};
await until(() => document.querySelector("#screen-home")?.classList.contains("active"), "home");
await page.click('.home-tab[data-category="custom"]');
await page.click('.mode-card[data-mode="career"]');
await until(() => document.querySelector("#screen-market.active #your-roster .market-row, #screen-market.active .market-row"), "market");
await page.click("#btn-market-done");
await until(() => document.querySelector("#screen-setup.active"), "setup");
await page.click("#btn-setup-confirm");
await until(() => document.querySelector("#screen-game.active"), "game");
check("game started", true);
await page.click("#btn-quick-sim");
await until(() => document.querySelector("#screen-result.active"), "game finished", 1000, 60);
check("game reached result screen", await page.evaluate(() => !!document.querySelector("#screen-result.active")));
await page.screenshot({ path: `${OUT}/result.png` });
// Continue back into the market (gold challenge advance).
const next = await page.$("#screen-result.active button.primary:not([hidden])");
if (next) await next.click();
await until(() => document.querySelector("#screen-market.active .market-form"), "market form after game");
const forms = await page.$$eval("#screen-market.active .market-form", (els) =>
  els.map((el) => ({
    text: el.textContent.replace(/\s+/g, " ").trim(),
    poor: !!el.querySelector(".market-form-tip.warn"),
  }))
);
const played = forms.filter((f) => /上场/.test(f.text));
check("market shows recent-form blocks for players who played", played.length >= 5, `${played.length} blocks`);
const positiveButPoor = played.filter((f) => f.poor && /篮板统治|护框统治|组织统治|防守尽责|攻弱守强|防守锁死/.test(f.text));
check("no 近况不佳 on a positive role-aware night", positiveButPoor.length === 0, positiveButPoor.map((f) => f.text.slice(0, 80)).join(" | "));
check("no page errors", errors.length === 0, errors.join(" | "));
await page.screenshot({ path: `${OUT}/market.png`, fullPage: true });
console.log(played.slice(0, 8).map((f) => f.text.slice(0, 140)).join("\n"));
console.log(report.join("\n"));
await browser.close();
process.exit(report.some((r) => r.startsWith("FAIL")) ? 1 : 0);
