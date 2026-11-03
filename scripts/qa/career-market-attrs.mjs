// Browser QA: the gold-tournament market (and the shared free-agent market template) must show
// every candidate's core attributes BEFORE you spend any gold on them -- not just OVR/price/salary.
// Fit/value badges stay gated behind a scout pack (hidden info by design); raw attributes don't.
// Usage: node scripts/qa/career-market-attrs.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/career-market-attrs";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function run(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  await page.click('.home-tab[data-category="custom"]');
  await page.click('.mode-card[data-mode="career"]');
  await page.waitForSelector("#screen-market.active", { timeout: 15000 });
  await page.waitForSelector("#free-agent-list .market-row", { timeout: 15000 });

  const rows = await page.$$eval("#free-agent-list .market-row", (els) =>
    els.map((el) => ({
      hasAttrs: !!el.querySelector(".rot-attrs"),
      chipCount: el.querySelectorAll(".rot-attrs .rot-attr").length,
      chipText: el.querySelector(".rot-attrs")?.textContent.replace(/\s+/g, " ").trim() || "",
      hasFitBadge: !!el.querySelector(".fit-badge"),
      buyable: !!el.querySelector("[data-buy], [data-hire-career-coach], [data-buy-skill]"),
    }))
  );
  const withAttrRow = rows.filter((r) => r.hasAttrs); // coach/skill offer cards have no .rot-attrs
  check(`[${tag}] market has rows at all`, rows.length >= 5, `${rows.length} rows`);
  check(
    `[${tag}] every player row shows an attribute chip row before buying`,
    withAttrRow.length > 0 && withAttrRow.every((r) => r.chipCount >= 6),
    `${withAttrRow.length} rows with chips, min chip count ${Math.min(...withAttrRow.map((r) => r.chipCount))}`
  );
  check(
    `[${tag}] attribute chips carry real numbers, not placeholders`,
    withAttrRow.every((r) => /\d/.test(r.chipText) && !/undefined|NaN/.test(r.chipText)),
    withAttrRow.find((r) => !/\d/.test(r.chipText) || /undefined|NaN/.test(r.chipText))?.chipText || ""
  );
  check(
    `[${tag}] no scout pack bought yet -> no fit badge leaks (that's still gated)`,
    rows.every((r) => !r.hasFitBadge)
  );

  await page.screenshot({ path: `${OUT}/${tag}-market.png` });
  check(`[${tag}] no horizontal overflow on the market screen`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("PASS")).length}/${report.length} passed`);
