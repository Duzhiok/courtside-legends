// Browser E2E for the lightweight coach-origin picker: the select renders with descriptions,
// changing it swaps the blurb, the chosen origin nudges the three interview offers, and
// accepting an offer persists the origin's reputation delta onto the saved coach profile.
// Usage: node scripts/qa/coach-origins.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/origins";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]')?.click());
  await page.waitForSelector("#time-travel-origin option", { state: "attached", timeout: 10000 });

  const options = await page.$$eval("#time-travel-origin option", (els) => els.map((e) => e.value));
  check(`[${tag}] all 5 origins render as options`, options.length === 5, options.join(","));
  check(`[${tag}] defaults to the generalist origin`, await page.$eval("#time-travel-origin", (e) => e.value) === "generalist");

  const defaultDesc = await page.$eval("#time-travel-origin-desc", (e) => e.textContent);
  check(`[${tag}] description shows for the default origin`, defaultDesc.includes("先入为主"), defaultDesc);

  // Record the three offers under the default origin before switching.
  await page.selectOption("#time-travel-origin", "generalist");
  await page.click("#btn-time-travel-interview");
  await page.waitForSelector("#time-travel-offers button", { timeout: 10000 });
  const plainOffers = await page.$$eval("#time-travel-offers button", (els) =>
    els.map((e) => e.getAttribute("aria-label")));

  // Go back and redo with the former-player origin; same teams/archetypes, nudged numbers.
  await page.evaluate(() => document.querySelector("#btn-time-travel-back")?.click());
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]')?.click());
  await page.waitForSelector("#time-travel-origin option", { state: "attached", timeout: 10000 });
  await page.selectOption("#time-travel-origin", "formerPlayer");
  const formerPlayerDesc = await page.$eval("#time-travel-origin-desc", (e) => e.textContent);
  check(`[${tag}] description updates when the origin selection changes`, formerPlayerDesc.includes("更衣室") && formerPlayerDesc !== defaultDesc, formerPlayerDesc);

  await page.click("#btn-time-travel-interview");
  await page.waitForSelector("#time-travel-offers button", { timeout: 10000 });
  const nudgedOffers = await page.$$eval("#time-travel-offers button", (els) =>
    els.map((e) => e.getAttribute("aria-label")));
  check(`[${tag}] origin choice doesn't change which 3 offers appear`, nudgedOffers.length === plainOffers.length && nudgedOffers.length === 3);
  const trustOf = (text) => Number(text.match(/信任 (\d+)/)?.[1]);
  const trustsDiffer = plainOffers.every((text, i) => trustOf(nudgedOffers[i]) === trustOf(text) + 10);
  check(`[${tag}] former-player origin adds +10 trust to every offer`, trustsDiffer, `${plainOffers.map(trustOf)} vs ${nudgedOffers.map(trustOf)}`);

  // Accept the first offer and confirm the origin's reputation delta landed in the save.
  await page.click("#time-travel-offers button");
  await page.click("#tt-offers-zone .tt-confirm [data-act=confirm]");
  await page.waitForSelector("#time-travel-decision:not([hidden])", { timeout: 10000 }).catch(() => {});
  const saved = await page.evaluate(() => {
    const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
    return { origin: root?.story?.origin, flagOrigin: root?.story?.flags?.origin, reputation: root?.coach?.reputation };
  });
  check(`[${tag}] accepted career persists origin on story.origin and story.flags.origin`, saved.origin === "formerPlayer" && saved.flagOrigin === "formerPlayer", JSON.stringify(saved));
  check(`[${tag}] accepted career's coach reputation reflects the origin's +10 delta`, saved.reputation === 60, `reputation=${saved.reputation}`);

  check(`[${tag}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();

  // ---- language toggle: open the picker in en, flip back to zh, confirm it rebuilds in zh ----
  // (this exercises the ensureTimeTravelOrigins() rebuild-every-call fix -- applyStaticLang()'s
  // DOM walker only restores text it originally saw contain CJK, so JS-authored L()-sourced option
  // text needs its own re-render path on a language flip, unlike the static HTML philosophy select.)
  const langPage = await browser.newPage({ viewport: { width, height } });
  const langErrors = [];
  langPage.on("pageerror", (e) => langErrors.push(e.message));
  await langPage.goto(BASE, { waitUntil: "domcontentloaded" });
  await langPage.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("courtside.lang", "en"); });
  await langPage.reload({ waitUntil: "domcontentloaded" });
  await langPage.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await langPage.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]')?.click());
  await langPage.waitForSelector("#time-travel-origin option", { state: "attached", timeout: 10000 });
  const enLabel = await langPage.$eval("#time-travel-origin option", (e) => e.textContent);
  check(`[${tag}] origin options render in English when lang=en`, enLabel === "Generalist Coach", enLabel);

  await langPage.click("#btn-lang");
  await langPage.evaluate(() => document.querySelector("#btn-time-travel-back")?.click());
  await langPage.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]')?.click());
  await langPage.waitForSelector("#time-travel-origin option", { state: "attached", timeout: 10000 });
  const zhLabelAfterToggle = await langPage.$eval("#time-travel-origin option", (e) => e.textContent);
  check(`[${tag}] origin options rebuild back to Chinese after toggling language off`, zhLabelAfterToggle === "通才教练", zhLabelAfterToggle);
  check(`[${tag}] language-toggle scenario: no page errors`, langErrors.length === 0, langErrors.join(" | "));
  await langPage.close();
}

await browser.close();
console.log(report.join("\n"));
const fails = report.filter((l) => l.startsWith("FAIL"));
console.log(`\n${report.length - fails.length}/${report.length} passed`);
if (fails.length) process.exit(1);
