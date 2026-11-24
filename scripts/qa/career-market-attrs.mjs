// Browser QA: the gold-tournament market (and the shared free-agent market template) must show
// every candidate's core attributes BEFORE you spend any gold on them -- not just OVR/price/salary.
// Gold sells no scout pack (2026-11): the analyst fit tag is free, the hidden value badge (妖人 / 板凳匪徒) stays hidden.
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
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
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
      hasValueBadge: !!el.querySelector(".value-badge"),
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
  check(`[${tag}] no scout -> the hidden value badge never leaks`, rows.every((r) => !r.hasValueBadge));
  check(`[${tag}] Gold sells no scout pack: no offer card, no "球探包" anywhere on the market`,
    await page.evaluate(() => document.querySelector("#scout-pack-offer")?.hidden !== false && !/球探包|Scout pack/i.test(document.querySelector("#screen-market").innerText)));
  for (let i = 0; i < 6; i++) { await page.click("#btn-refresh-market").catch(() => {}); await page.waitForTimeout(150); }
  check(`[${tag}] still no scout pack after 6 refreshes (it used to show on ~30% of them)`,
    await page.evaluate(() => document.querySelector("#scout-pack-offer")?.hidden !== false && !/球探包/.test(document.querySelector("#screen-market").innerText)));

  // An old Gold save that already paid for this batch's report keeps it (and the label) until the next batch.
  // An old Gold save that already paid for this batch's report keeps it (and the label) until the next batch.
  // Patch the save before the app boots: the page saves itself on the way out, so a patch-then-reload is overwritten.
  await page.click("#btn-save-market");
  await page.waitForTimeout(300);
  const old = await ctx.newPage();
  old.on("pageerror", (e) => errors.push(e.message));
  old.on("dialog", (d) => d.accept());
  await page.close();
  await old.addInitScript(() => {
    if (sessionStorage.getItem("qaPatched")) return;
    sessionStorage.setItem("qaPatched", "1");
    const data = JSON.parse(localStorage.getItem("cls_savegame_v1") || "null");
    if (!data?.app?.career) return;
    Object.assign(data.app.career, { scoutActive: true, scoutBuyer: null, scoutOffer: { cost: 80, bought: true, reason: "round" } });
    localStorage.setItem("cls_savegame_v1", JSON.stringify(data));
  });
  await old.goto(BASE, { waitUntil: "domcontentloaded" });
  await old.waitForFunction(() => window.__rosterBootOk === true, null, { timeout: 60000 });
  await old.click("#btn-continue-save");
  await old.waitForSelector("#screen-market.active", { timeout: 15000 });
  check(`[${tag}] old save with a paid scout report: it still shows`, await old.evaluate(() => /球探已启用/.test(document.querySelector("#scout-pack-offer")?.innerText || "")));
  await old.screenshot({ path: `${OUT}/${tag}-market.png` });
  check(`[${tag}] no horizontal overflow on the market screen`, await old.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await run(1280, 800, "desktop");
await run(390, 844, "mobile");
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("PASS")).length}/${report.length} passed`);
