// Gold-challenge market: the coach card (price, hire button) still renders and hiring still works after the B61 move
// (careerCoachPrice / rollCareerCoachShop / coachMarketCardHtml now live in js/career/coachMarket.js + js/ui/careerMarketCards.js).
// Usage: node scripts/qa/career-coach-hire.mjs /tmp/cls-qa/coach-hire [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/coach-hire";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };
const browser = await chromium.launch({ executablePath: EXE });

for (const [w, h, tag] of [[1280, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  const alerts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const a = acc.createAccount("QA 教练");
    a.playerIds = players.PLAYERS.slice(0, 2).map((p) => p.id);
    a.onboardingDone = true;
    acc.saveAccount(a);
    acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#screen-market.active #free-agent-list .market-row", { timeout: 15000 });

  const card = await page.$("#free-agent-list .career-coach-card");
  check(`[${tag}] the market lists a coach card`, !!card);
  const text = card ? await card.evaluate((el) => el.textContent.replace(/\s+/g, " ").trim()) : "";
  check(`[${tag}] it shows the coach, their tactics and a price`, /擅长/.test(text) && /战术板/.test(text) && /¤\d+/.test(text), text.slice(0, 100));
  const price = Number(text.match(/聘请 ¤(\d+)/)?.[1] ?? NaN);
  const btn = await page.$("#free-agent-list [data-hire-career-coach]");
  check(`[${tag}] the hire button exists`, !!btn);
  const disabled = btn ? await btn.evaluate((b) => b.disabled) : true;
  if (btn && !disabled && Number.isFinite(price)) {
    await btn.click();
    await page.waitForTimeout(400);
    check(`[${tag}] hiring ends in a confirmation, not an error`, alerts.some((m) => /已聘请/.test(m)), alerts.join(" | "));
    check(`[${tag}] the board refilled or emptied without a broken card`, !(await page.$eval("#free-agent-list", (el) => /undefined|NaN/.test(el.textContent))));
  } else {
    check(`[${tag}] the coach is too expensive for the starting gold: the button is disabled with a shortfall label`, disabled && /差|缺|¤/.test(text), `${text.slice(-40)}`);
  }
  check(`[${tag}] no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await page.screenshot({ path: `${OUT}/${tag}-market.png`, fullPage: false });
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}
await browser.close();
const fails = out.filter((l) => l.startsWith("FAIL"));
console.log(`\n${fails.length} failing / ${out.length} total`);
process.exit(fails.length ? 1 : 0);
