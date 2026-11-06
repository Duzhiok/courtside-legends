// Single Season folded into Franchise setup: no home card, both lengths start the right mode,
// an old season-only save and a franchise save both still resume. Desktop + mobile.
// Usage: node scripts/qa/career-length.mjs /tmp/cls-qa/length [url]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/length"; const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = []; const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const saved = (page) => page.evaluate(() => { const r = JSON.parse(localStorage.getItem("cls_root_v3") || "null"); return r ? { kind: r.leagueCareer?.kind, mode: r.leagueCareer?.mode, hasCareer: !!r.leagueCareer } : null; });
for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
  const fresh = async () => { await page.goto(BASE, { waitUntil: "domcontentloaded" }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
  await fresh();
  check(`[${tag}] home has no Single Season card`, (await page.$$('.mode-card[data-mode="season"]')).length === 0);
  check(`[${tag}] home keeps Reborn + Franchise cards`, (await page.$$('.mode-card[data-mode="timeTravel"], .mode-card[data-mode="franchise"]')).length === 2);
  await page.click('.mode-card[data-mode="franchise"]'); await page.waitForSelector("#screen-season.active");
  const pressed = () => page.$$eval("[data-career-length]", (b) => b.map((x) => `${x.dataset.careerLength}:${x.getAttribute("aria-pressed")}`).join(","));
  check(`[${tag}] opening via Franchise preselects Dynasty`, (await pressed()) === "season:false,franchise:true", await pressed());
  await page.click("#btn-career-length-season");
  check(`[${tag}] picking Single Season flips the choice`, (await pressed()) === "season:true,franchise:false", await pressed());
  const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
  check(`[${tag}] setup title follows the length (single season)`, /单赛季/.test(await text("#season-screen-title")), await text("#season-screen-title"));
  check(`[${tag}] start button follows the length (single season)`, /单赛季/.test(await text("#btn-season-start")), await text("#btn-season-start"));
  await page.click("#btn-career-length-franchise");
  check(`[${tag}] setup title follows the length (dynasty)`, /王朝/.test(await text("#season-screen-title")), await text("#season-screen-title"));
  check(`[${tag}] start button follows the length (dynasty)`, /王朝/.test(await text("#btn-season-start")), await text("#btn-season-start"));
  await page.click("#btn-career-length-season");
  check(`[${tag}] no horizontal overflow on setup`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-setup.png`);
  for (const len of ["season", "franchise"]) {
    await fresh();
    await page.evaluate(async () => {
      const acc = await import("/js/data/account.js"); const pl = await import("/js/data/players.js"); const co = await import("/js/data/coaches.js");
      const a = acc.createAccount("长度QA"); const seen = new Set(); a.playerIds = [...pl.PLAYERS].filter((p) => pl.overall(p) >= 55 && pl.overall(p) <= 72).filter((p) => !seen.has(p.bref) && seen.add(p.bref)).slice(0, 15).map((p) => p.id); // one card per person (the builder dedupes); mid OVR so the salary cap fits
      a.onboardingDone = true; a.welcomeGranted = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId]; acc.saveAccount(a);
    });
    await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page);
    await page.click('.mode-card[data-mode="franchise"]'); await page.waitForSelector("#screen-season.active");
    await page.click(`#btn-career-length-${len}`);
    await page.click("#btn-season-roster-account");
    await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
    await page.click("#btn-season-start"); await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
    const s = await saved(page); const legacy = await page.evaluate(() => !!localStorage.getItem("cls_season_v1"));
    check(`[${tag}] ${len} start writes a ${len === "franchise" ? "franchise" : "season"} career`, len === "franchise" ? s?.kind === "franchise" : (legacy && s?.kind !== "franchise"), JSON.stringify({ s, legacy })); // a fresh single season lives in the legacy key until the first reload migrates it
    await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page);
    await page.click("#btn-long-career-resume").catch(() => {});
    const back = await page.evaluate(() => document.querySelector("main.screen.active")?.id);
    check(`[${tag}] ${len} save resumes after reload`, back === "screen-season", back);
  }
  // Onboarding Cancel: an account that never finished team setup is sent there when a feature needs it;
  // Cancel must put the player back where they were, mid-form, instead of trapping them.
  await fresh();
  await page.evaluate(async () => { const acc = await import("/js/data/account.js"); const a = acc.createAccount("取消QA"); acc.saveAccount(a); acc.setActiveAccountId(a.id); });
  await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page);
  await page.click('.mode-card[data-mode="franchise"]'); await page.waitForSelector("#screen-season.active");
  await page.click("#btn-career-length-season");
  await page.fill("#season-team-name", "取消后还在");
  await page.click("#btn-season-roster-account");
  await page.waitForSelector("#screen-onboard.active", { timeout: 10000 });
  check(`[${tag}] onboarding shows a Cancel button`, await page.isVisible("#btn-onboard-cancel"));
  check(`[${tag}] no overflow on onboarding`, await noOverflow(page));
  await page.click("#btn-onboard-cancel");
  await page.waitForSelector("#screen-season.active", { timeout: 10000 });
  check(`[${tag}] Cancel returns to the page it came from, form intact`, (await page.inputValue("#season-team-name")) === "取消后还在" && /单赛季/.test(await text("#season-screen-title")));
  await page.click("#btn-season-roster-account");
  await page.waitForSelector("#screen-onboard.active", { timeout: 10000 });
  check(`[${tag}] after Cancel the next attempt restarts at step 1`, /^1\//.test(await text("#onboard-step-label")), await text("#onboard-step-label"));
  await page.click("#btn-onboard-cancel");
  await page.waitForSelector("#screen-season.active");
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(out.join("\n")); const f = out.filter((l) => l.startsWith("FAIL")).length; console.log(`${out.length - f}/${out.length} passed`); process.exit(f ? 1 : 0);
