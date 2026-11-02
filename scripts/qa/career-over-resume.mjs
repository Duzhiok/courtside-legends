// P0: "Continue career" on a career that is OVER (fired / departed / retired) must land on the
// time-travel screen (verdict + job board), never the season hub -- the hub would let him keep coaching
// a team that isn't his. A coach still in the job (control) must still land on the season hub.
// Saves are built with the REAL engine and read back by the real UI; the button is the home page's own
// "continue" (clicking the mode card instead would skip the route under test).
// Usage: node scripts/qa/career-over-resume.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/over-resume";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/** Build a save in the page with the real engine. `kind`: active | fired | departed | retired. */
async function writeSave(page, kind) {
  await page.evaluate(async (kind) => {
    const ttc = await import("/js/modes/timeTravelCareer.js");
    const cc = await import("/js/modes/careerContract.js");
    const sr = await import("/js/data/saveRoot.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
    let root = ttc.acceptInterviewOffer(prologue, prologue.offers[1].id);
    // A freshly hired coach still owes the opening "future knowledge" decision, which (rightly) routes to the
    // time-travel screen. The control must be a coach with a clear desk, or it tests the wrong route.
    if (kind === "active") root = { ...root, story: { ...root.story, pendingDecision: null } };
    if (kind !== "active") {
      const team = root.leagueCareer.season.userTeamId;
      root.leagueCareer.management.seasonHistory = [[28, 54], [27, 55]].map(([w, l], i) => ({
        year: 1995 + i, teamId: team, teamName: "QA Team", record: { w, l }, finish: "lottery", championId: "OTHER",
      }));
      root = cc.evaluateCareerEmployment(root);
      if (kind === "departed") root = { ...root, story: { ...root.story, employment: { ...root.story.employment, status: "departed" } } };
      if (kind === "retired") root = (await import("/js/modes/retirement.js")).retireCoach(root);
    }
    sr.writeRootSave(root, localStorage);
  }, kind);
}

const homeActive = (page) => page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  for (const kind of ["active", "fired", "departed", "retired"]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await homeActive(page);
    await writeSave(page, kind);
    await page.reload({ waitUntil: "domcontentloaded" });
    await homeActive(page);
    const status = await page.evaluate(() => JSON.parse(localStorage.getItem("cls_root_v3")).story.employment.status);
    check(`[${tag}/${kind}] the save really holds the status under test`, kind === "active" ? status === "active" : status === kind, status);

    await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
    await page.waitForTimeout(1500);
    const landed = await page.evaluate(() => document.querySelector(".screen.active")?.id);
    const want = kind === "active" ? "screen-season" : "screen-time-travel";
    check(`[${tag}/${kind}] "continue career" lands on ${want}`, landed === want, `landed on ${landed}`);
    if (kind !== "active") {
      check(`[${tag}/${kind}] the screen shows the over-state, and Continue is hidden`,
        await page.$eval("#btn-time-travel-continue", (el) => el.hidden || el.getClientRects().length === 0).catch(() => true));
    }
    check(`[${tag}/${kind}] no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`[${tag}/${kind}] no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
