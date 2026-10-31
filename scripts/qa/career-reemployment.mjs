// Browser E2E for B5 (re-employment): after being fired, the UI shows a reputation-gated job board;
// picking a team takes the two-step confirm and starts a NEW stint that keeps reputation + history.
// The fired save is built with the REAL engine and read back by the real UI -- no stubs.
// Usage: node scripts/qa/career-reemployment.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/reemployment";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

async function openFiredCareer(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const ttc = await import("/js/modes/timeTravelCareer.js");
    const cc = await import("/js/modes/careerContract.js");
    const sr = await import("/js/data/saveRoot.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
    let root = ttc.acceptInterviewOffer(prologue, prologue.offers[1].id);
    const team = root.leagueCareer.season.userTeamId;
    root.leagueCareer.management.seasonHistory = [[28, 54], [27, 55]].map(([w, l], i) => ({
      year: 1995 + i, teamId: team, teamName: "QA Team", record: { w, l }, finish: "lottery", championId: "OTHER",
    }));
    root = cc.evaluateCareerEmployment(root);
    sr.writeRootSave(root, localStorage);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  await page.waitForSelector("#tt-jobs:not([hidden])", { timeout: 10000 });
  return { page, errors };
}

const saved = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
  return {
    status: root?.story?.employment?.status,
    employer: root?.story?.employer,
    stints: root?.coach?.stints?.length ?? 0,
    reputation: root?.coach?.reputation,
    log: root?.story?.eventLog?.map((e) => e.type),
  };
});
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const visible = (page, selector) => page.$eval(selector, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const { page, errors } = await openFiredCareer(width, height);
  const before = await saved(page);
  const oldTeam = await page.$eval(".tt-hq-name", (el) => el.textContent.trim());

  // ---- the fired state itself ----
  check(`[${tag}] verdict + job board are shown`, (await visible(page, "#tt-over")) && (await visible(page, "#tt-jobs")));
  check(`[${tag}] no Continue button while unemployed`, !(await visible(page, "#btn-time-travel-continue")));
  check(`[${tag}] finance/goal cards are hidden while unemployed`, !(await visible(page, "#time-travel-finance")) && !(await visible(page, "#tt-goal")));
  check(`[${tag}] stint history lists the finished job`, (await page.$$("#tt-stints .tt-stint")).length === 1);
  const reasonText = await page.$eval("#tt-stints .tt-stint", (el) => el.textContent);
  check(`[${tag}] stint reason is human text, not a raw id`, !/two-bad-seasons|trust-collapsed|missed-goals/.test(reasonText) && /被解雇/.test(reasonText), reasonText.replace(/\s+/g, " "));

  // ---- the board ----
  const cards = await page.$$eval("#tt-jobs-board .tt-offer", (els) => els.map((el) => ({
    locked: el.classList.contains("tt-offer-locked"),
    team: el.dataset.team || null,
    archetype: el.dataset.archetype,
  })));
  check(`[${tag}] board always shows the 3 job tiers`, cards.length === 3 && new Set(cards.map((c) => c.archetype)).size === 3, JSON.stringify(cards.map((c) => c.archetype)));
  check(`[${tag}] at least one real offer, and the contender tier is locked at rep 50`, cards.some((c) => !c.locked) && cards.find((c) => c.archetype === "contender")?.locked === true);
  check(`[${tag}] the team that fired you is not on the board`, cards.every((c) => c.team !== oldTeam), `${oldTeam} vs ${cards.map((c) => c.team)}`);
  const lockedText = await page.$eval("#tt-jobs-board .tt-offer-locked", (el) => el.textContent);
  check(`[${tag}] locked card explains the reputation gate`, /声望/.test(lockedText) && /\d+/.test(lockedText), lockedText.replace(/\s+/g, " "));
  check(`[${tag}] board has no horizontal overflow`, await noOverflow(page));
  await page.screenshot({ path: `${OUT}/${tag}-board.png`, fullPage: true });

  // ---- two-step commit ----
  await page.click("#tt-jobs-board .tt-offer-locked", { force: true }).catch(() => {});
  check(`[${tag}] clicking a locked card selects nothing`, !(await visible(page, "#tt-jobs .tt-confirm")));
  await page.click("#tt-jobs-board .tt-offer:not(.tt-offer-locked)");
  check(`[${tag}] picking a team only arms the confirm bar (nothing saved yet)`, (await visible(page, "#tt-jobs .tt-confirm")) && (await saved(page)).status === "fired");
  const confirmText = await page.$eval("#tt-jobs .tt-confirm-text", (el) => el.textContent);
  check(`[${tag}] confirm bar names the team`, cards.some((c) => c.team && confirmText.includes(c.team)), confirmText);
  await page.click("#tt-jobs .tt-confirm [data-act=cancel]");
  check(`[${tag}] "pick again" disarms it and still saves nothing`, !(await visible(page, "#tt-jobs .tt-confirm")) && (await saved(page)).status === "fired");
  await page.click("#tt-jobs-board .tt-offer:not(.tt-offer-locked)");
  const pickedTeam = await page.$eval("#tt-jobs-board .tt-offer[aria-checked=true]", (el) => el.dataset.team);
  await page.click("#tt-jobs .tt-confirm [data-act=confirm]");
  await page.waitForFunction(() => document.querySelector("#tt-jobs")?.hidden, null, { timeout: 8000 });

  // ---- the new stint ----
  const after = await saved(page);
  check(`[${tag}] new stint is active at a different team`, after.status === "active" && after.employer !== before.employer, JSON.stringify(after));
  check(`[${tag}] the finished stint was kept and reputation survived`, after.stints === 1 && after.reputation === before.reputation, `stints=${after.stints} rep ${before.reputation}->${after.reputation}`);
  check(`[${tag}] event log was reset for the new job`, after.log?.[0] === "re-employed", JSON.stringify(after.log));
  const newTeam = await page.$eval(".tt-hq-name", (el) => el.textContent.trim());
  check(`[${tag}] HQ now shows the new team`, newTeam === pickedTeam && newTeam !== oldTeam, `${oldTeam} -> ${newTeam} (picked ${pickedTeam})`);
  // B6 changed this on purpose: the coaching RECORD now stays after a re-hire (it used to vanish with
  // the verdict). Only the "how it ended" banner and the job board go away.
  check(`[${tag}] job board + verdict banner are gone, Continue is back`, !(await visible(page, "#tt-jobs")) && (await page.$eval("#tt-verdict", (el) => el.innerHTML.trim())) === "" && (await visible(page, "#btn-time-travel-continue")));
  check(`[${tag}] ...but the finished job stays on the coaching record`, (await visible(page, "#tt-over")) && (await page.$$("#tt-stints .tt-stint")).length === 1 && /被解雇/.test(await page.$eval("#tt-stints", (el) => el.textContent)));
  check(`[${tag}] goal + finance cards are back (cash/house carry over)`, (await visible(page, "#tt-goal")) && (await visible(page, "#time-travel-finance")));
  const goalText = await page.$eval("#tt-goal", (el) => el.textContent);
  check(`[${tag}] goal card shows "−8" for a miss, not a doubled sign`, /落空.*−8/.test(goalText) && !/[−-]{2}\d/.test(goalText), goalText.replace(/\s+/g, " ").slice(0, 90));
  check(`[${tag}] status line mentions the new team`, (await page.$eval("#time-travel-status", (el) => el.textContent)).includes(pickedTeam));
  check(`[${tag}] no horizontal overflow after hiring`, await noOverflow(page));
  await page.screenshot({ path: `${OUT}/${tag}-rehired.png`, fullPage: true });

  // ---- survives a reload ----
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  await page.waitForSelector(".tt-hq-name", { timeout: 10000 });
  check(`[${tag}] reload keeps the new team`, (await page.$eval(".tt-hq-name", (el) => el.textContent.trim())) === pickedTeam);

  // ---- language toggle repaints JS-rendered copy ----
  await page.evaluate(() => document.querySelector("#btn-lang").click());
  await page.waitForTimeout(300);
  const english = await page.$eval("#tt-goal", (el) => el.textContent);
  check(`[${tag}] English mode repaints the goal card`, /Board goal/.test(english) && !/董事会目标/.test(english), english.replace(/\s+/g, " ").slice(0, 80));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
