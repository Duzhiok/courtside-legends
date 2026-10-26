// Browser E2E for the five-year career ending: renewal offers, accept, decline, and being fired.
// The save is built with the REAL engine (acceptInterviewOffer + evaluateCareerEmployment), written
// to localStorage, and then read back by the real UI -- no hand-made DOM, no stubs.
// Usage: node scripts/qa/career-contract.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/contract";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/** Build a real save at the end of season five (or after two bad seasons) and load it in the UI. */
async function openScenario(width, height, records) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async (recs) => {
    const ttc = await import("/js/modes/timeTravelCareer.js");
    const cc = await import("/js/modes/careerContract.js");
    const sr = await import("/js/data/saveRoot.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
    let root = ttc.acceptInterviewOffer(prologue, prologue.offers[1].id);
    const team = root.leagueCareer.season.userTeamId;
    root.leagueCareer.management.seasonHistory = recs.map(([w, l], i) => ({
      year: 1995 + i, teamId: team, teamName: "QA Team", record: { w, l }, finish: "playoffs", championId: "OTHER",
    }));
    root = cc.evaluateCareerEmployment(root);
    sr.writeRootSave(root, localStorage);
  }, records);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  return { page, errors };
}

const rootStatus = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
  return { status: root?.story?.employment?.status, ending: root?.story?.ending?.id, offer: root?.story?.employment?.offer?.id };
});
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  // ---- A. five solid seasons -> renewal offers; accept one ----
  {
    const { page, errors } = await openScenario(width, height, [[50, 32], [52, 30], [48, 34], [55, 27], [51, 31]]);
    await page.waitForSelector("#time-travel-contract:not([hidden])", { timeout: 10000 });
    const offers = await page.$$eval("#time-travel-contract-options button", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ")));
    check(`[${tag}] renewal card shows two offers`, offers.length === 2, `${offers.length} offers`);
    check(`[${tag}] each offer shows years, salary and authority`, offers.every((t) => /\d+ 年/.test(t) && /薪资 \d+/.test(t) && /权限 \d+/.test(t)), offers.map((t) => t.slice(-30)).join(" | "));
    check(`[${tag}] both offers list their privileges`, offers.every((t) => /特权|训练|预算|优先|补强|额度/.test(t)), offers[0]?.slice(0, 90));
    check(`[${tag}] renewal card has no horizontal overflow`, await noOverflow(page));
    await page.screenshot({ path: `${OUT}/${tag}-renewal.png` });
    await page.click("#time-travel-contract-options button:first-child");
    await page.waitForFunction(() => document.querySelector("#time-travel-contract")?.hidden, null, { timeout: 5000 });
    const saved = await rootStatus(page);
    check(`[${tag}] accepting writes a renewed career to the save`, saved.status === "renewed" && !!saved.offer, JSON.stringify(saved));
    check(`[${tag}] status line confirms the signing`, /续约已签署/.test(await page.$eval("#time-travel-status", (e) => e.textContent)));
    check(`[${tag}] a renewed career can still Continue`, await page.$eval("#btn-time-travel-continue", (b) => !b.hidden));
    await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
    check(`[${tag}] re-entering a renewed career still offers Continue`, await page.$eval("#btn-time-travel-continue", (b) => !b.hidden));
    check(`[${tag}] no page errors (renewal)`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
  // ---- B. same situation, decline through the custom confirm dialog ----
  {
    const { page, errors } = await openScenario(width, height, [[50, 32], [52, 30], [48, 34], [55, 27], [51, 31]]);
    await page.waitForSelector("#time-travel-contract:not([hidden])", { timeout: 10000 });
    await page.click("#btn-time-travel-decline-contract");
    await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
    await page.screenshot({ path: `${OUT}/${tag}-decline-confirm.png` });
    await page.click("#app-confirm-cancel");
    await page.waitForFunction(() => !document.querySelector("#app-confirm-dialog").open);
    check(`[${tag}] cancelling the confirm keeps the offers on the table`, (await rootStatus(page)).status === "renewal");
    await page.click("#btn-time-travel-decline-contract");
    await page.waitForSelector("#app-confirm-dialog[open]");
    await page.click("#app-confirm-accept");
    await page.waitForFunction(() => document.querySelector("#time-travel-contract")?.hidden, null, { timeout: 5000 });
    const saved = await rootStatus(page);
    check(`[${tag}] confirming the exit records the decline`, saved.status !== "renewal" && saved.status !== "renewed", JSON.stringify(saved));
    check(`[${tag}] status line says the five-year chapter is over`, /五年篇章正式结束/.test(await page.$eval("#time-travel-status", (e) => e.textContent)));
    check(`[${tag}] a departed career offers no Continue button`, await page.$eval("#btn-time-travel-continue", (b) => b.hidden));
    check(`[${tag}] no page errors (decline)`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
  // ---- C. two bad seasons in a row -> fired before the finale ----
  {
    const { page, errors } = await openScenario(width, height, [[45, 37], [30, 52], [28, 54]]);
    const saved = await rootStatus(page);
    check(`[${tag}] two sub-.400 seasons in a row fire the coach`, saved.status === "fired" && saved.ending === "fired-before-finale", JSON.stringify(saved));
    check(`[${tag}] a fired coach is never shown renewal offers`, await page.$eval("#time-travel-contract", (e) => e.hidden));
    const statusText = await page.$eval("#time-travel-status", (e) => e.textContent);
    check(`[${tag}] the status line tells the player they were fired`, /被解雇/.test(statusText), statusText);
    check(`[${tag}] a fired career offers no Continue button`, await page.$eval("#btn-time-travel-continue", (b) => b.hidden));
    check(`[${tag}] the ending share card is shown for a fired career`, await page.$eval("#time-travel-share", (e) => !e.hidden && e.textContent.trim().length > 10));
    check(`[${tag}] fired screen has no horizontal overflow`, await noOverflow(page));
    await page.screenshot({ path: `${OUT}/${tag}-fired.png` });
    check(`[${tag}] no page errors (fired)`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}
await browser.close();
console.log(report.join("\n"));
console.log(`\n${report.filter((r) => r.startsWith("PASS")).length}/${report.length} passed`);
