// Browser E2E for B7 (retirement + legacy). Saves are built with the REAL engine (including the real
// season rollover for the forced case) and read back by the real UI -- no stubs.
// Usage: node scripts/qa/career-retire.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/retire";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });
const CJK = /[\u4e00-\u9fff]/;

/**
 * scenario: "ready"    -> two jobs on the CV (an earlier one + this one), clear desk, pre-season
 *           "underway" -> same, but the season's first game has been played
 *           "fired"    -> just fired (two bad seasons): job board is up
 *           "fresh"    -> hired, but no season finished yet
 *           "forced"   -> 69 and finishing a season: the REAL rollover retires him at 70
 */
async function openCareer(width, height, scenario) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(async (which) => {
    const ttc = await import("/js/modes/timeTravelCareer.js");
    const contract = await import("/js/modes/careerContract.js");
    const rollover = await import("/js/modes/seasonRollover.js");
    const coachMod = await import("/js/career/coachProfile.js");
    const sr = await import("/js/data/saveRoot.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
    let root = ttc.acceptInterviewOffer(prologue, prologue.offers[1].id);
    const team = root.leagueCareer.season.userTeamId;
    const earlier = { teamId: "BOS", startYear: 1988, endYear: 1993, seasons: 5, wins: 230, losses: 180, championships: 1, reason: "departed" };
    const withEarlier = which === "ready" || which === "underway" || which === "forced";
    root.coach = coachMod.createCoachProfile({
      ...(root.coach || {}), reputation: 80, cash: 40, age: which === "forced" ? 69 : 52, stints: withEarlier ? [earlier] : [],
    });
    root.story.pendingDecision = null;
    root.story.frontOfficeTrust = 60;
    // A real career has made story choices by now (the report card only shows once there is one).
    root.story.eventLog = [...root.story.eventLog, ...[0, 1].map((i) => ({ type: "story-choice", eventId: `qa-event-${i}`, choiceId: "qa-choice", year: 1993 + i, at: 0 }))];
    const good = (i) => ({ year: 1993 + i, teamId: team, teamName: "QA Team", record: { w: 58, l: 24 }, finish: i === 0 ? "champion" : "playoffs", championId: i === 0 ? team : "OTHER" });
    const bad = (i) => ({ year: 1993 + i, teamId: team, teamName: "QA Team", record: { w: 28 - i, l: 54 + i }, finish: "lottery", championId: "OTHER" });
    if (which === "fresh") root.leagueCareer.management.seasonHistory = [];
    else if (which === "fired") root.leagueCareer.management.seasonHistory = [bad(0), bad(1)];
    else root.leagueCareer.management.seasonHistory = [good(0), good(1)];
    if (which === "fired") root = contract.evaluateCareerEmployment(root);
    if (which === "forced") {
      const settled = rollover.settleSeasonRollover(root, { year: 1995 });
      root = settled.root;
    }
    if (which === "underway") {
      const season = root.leagueCareer.season;
      root.leagueCareer.season = { ...season, schedule: [[{ homeId: season.userTeamId, awayId: "OPP", played: true }], ...season.schedule] };
    }
    sr.writeRootSave(root, localStorage);
  }, scenario);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  await page.waitForSelector(".tt-hq-name", { timeout: 10000 });
  return { page, errors };
}

const saved = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
  return {
    status: root?.story?.employment?.status,
    reason: root?.story?.employment?.reason,
    age: root?.coach?.age,
    stints: root?.coach?.stints?.map((s) => s.reason) ?? [],
    ending: root?.story?.ending ?? null,
    log: root?.story?.eventLog?.map((e) => e.type) ?? [],
    cash: root?.coach?.cash,
  };
});
/** What the engine says the career is worth right now -- the UI must agree with this, not with itself. */
const engineLegacy = (page) => page.evaluate(async () => {
  const sr = await import("/js/data/saveRoot.js");
  const ret = await import("/js/modes/retirement.js");
  const legacy = await import("/js/career/legacy.js");
  const root = sr.readRootSave(localStorage);
  return root.story.employment?.status === "retired" ? legacy.buildLegacy(root.coach) : ret.previewLegacy(root);
});
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const visible = (page, selector) => page.$eval(selector, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);
const text = (page, selector) => page.$eval(selector, (el) => el.textContent.replace(/\s+/g, " ").trim());
const reload = async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#btn-long-career-resume").click());
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  await page.waitForSelector(".tt-hq-name", { timeout: 10000 });
};
const toggleLang = async (page) => { await page.evaluate(() => document.querySelector("#btn-lang").click()); await page.waitForTimeout(300); };
const confirmDialog = async (page, button) => {
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
  await page.click(button);
  await page.waitForFunction(() => !document.querySelector("#app-confirm-dialog").open);
};

/** Everything that must be true once a career is retired, wherever it came from. */
async function checkRetiredScreen(page, tag, label, expected) {
  const legacy = await engineLegacy(page);
  check(`[${tag}] ${label}: the verdict banner says Retired`, /已退休/.test(await text(page, "#tt-verdict")), await text(page, "#tt-verdict"));
  const tiles = await text(page, "#tt-legacy");
  check(`[${tag}] ${label}: lifetime tiles match the engine (record, titles, clubs, score)`,
    tiles.includes(`${legacy.wins}-${legacy.losses}`) && tiles.includes(`生涯评分 ${legacy.score}`) && tiles.includes(`${legacy.age} 岁`),
    `${tiles} vs ${JSON.stringify({ w: legacy.wins, l: legacy.losses, s: legacy.score })}`);
  check(`[${tag}] ${label}: the rating is shown as the headline`, (await text(page, "#tt-verdict")).includes((await page.evaluate(async (tier) => (await import("/js/career/legacy.js")).LEGACY_TIERS[tier].label, legacy.tier))));
  check(`[${tag}] ${label}: one stint card per job on the CV`, (await page.$$("#tt-stints .tt-stint")).length === legacy.stints, `${(await page.$$("#tt-stints .tt-stint")).length} vs ${legacy.stints}`);
  check(`[${tag}] ${label}: the last job is labelled retired`, (await page.$eval("#tt-stints .tt-stint:last-child", (el) => el.dataset.reason).catch(() => "")) === "retired" || (await page.$$('#tt-stints .tt-stint[data-reason="retired"]')).length === 1);
  check(`[${tag}] ${label}: no job board, no retire card, no poach, no Continue, no goal`,
    !(await visible(page, "#tt-jobs")) && !(await visible(page, "#tt-retire")) && !(await visible(page, "#tt-poach")) && !(await visible(page, "#btn-time-travel-continue")) && !(await visible(page, "#tt-goal")));
  check(`[${tag}] ${label}: the report line speaks of the whole career`, /生涯已结束/.test(await text(page, "#time-travel-report-status")), await text(page, "#time-travel-report-status"));
  check(`[${tag}] ${label}: share card is the whole-career card, one row per job`,
    (await visible(page, "#time-travel-share")) && /逐段履历/.test(await text(page, "#time-travel-share-card")) && (await page.$$("#time-travel-share-card .share-card-seasons li")).length === legacy.stints,
    (await text(page, "#time-travel-share-card")).slice(0, 160));
  check(`[${tag}] ${label}: status line says you retired`, /挂靴|退休/.test(await text(page, "#time-travel-status")), await text(page, "#time-travel-status"));
  check(`[${tag}] ${label}: the HQ badge is gold, not the red of a firing`, await page.$$eval(".tt-hq .tt-pill-gold, #tt-hq .tt-pill-gold, .tt-pill-gold", (els) => els.some((el) => /已退休/.test(el.textContent))) && !(await page.$$eval(".tt-pill-alert", (els) => els.some((el) => /已退休/.test(el.textContent)))));
  // A year span like "1988–1992" must stay on one line. (Grid cells are stretched to the row height,
  // so comparing cell heights proves nothing: count the line boxes the TEXT actually occupies.)
  const rowsOk = await page.$$eval("#time-travel-share-card .share-card-jobs li", (rows) => rows.length > 0 && rows.every((row) => {
    const lines = (cell) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    };
    // ...and, because nowrap would swap a wrapped span for one spilling into the next column, that the
    // text also fits inside its own cell.
    const fits = (cell) => cell.scrollWidth <= cell.clientWidth + 1;
    return [row.firstElementChild, row.lastElementChild].every((cell) => lines(cell) === 1 && fits(cell));
  }));
  check(`[${tag}] ${label}: share-card job rows don't wrap (year span and record: one line, inside their cell)`, rowsOk);
  const seasonsText = await text(page, "#time-travel-report-seasons");
  check(`[${tag}] ${label}: season tiles show Chinese finish labels, never a raw id`, !/lottery|playoffs|finals|champion/i.test(seasonsText), seasonsText);
  check(`[${tag}] ${label}: no horizontal overflow`, await noOverflow(page));
  if (expected?.note) check(`[${tag}] ${label}: the age note`, (await text(page, "#tt-verdict")).includes(expected.note), await text(page, "#tt-verdict"));
}

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  // ============================================================ voluntary retirement, start to finish
  {
    const { page, errors } = await openCareer(width, height, "ready");
    const before = await saved(page);
    const exp = await engineLegacy(page);
    check(`[${tag}] ready: the retire card is shown, with the career so far`, await visible(page, "#tt-retire"));
    const preview = await text(page, "#tt-retire-preview");
    check(`[${tag}] ready: the preview matches the engine's numbers`, preview.includes(`${exp.wins}-${exp.losses}`) && preview.includes(`生涯评分 ${exp.score}`) && preview.includes("如果今天挂靴"), preview);
    check(`[${tag}] ready: the preview already counts BOTH jobs (the earlier one + this one)`, exp.stints === 2 && exp.titles >= 1, JSON.stringify({ stints: exp.stints, titles: exp.titles }));
    check(`[${tag}] ready: it does not take over the screen (Continue + goal still live)`, (await visible(page, "#btn-time-travel-continue")) && (await visible(page, "#tt-goal")));
    check(`[${tag}] ready: the button is a real, enabled button`, await page.$eval("#btn-retire", (el) => !el.disabled && el.textContent.trim().length > 1));
    check(`[${tag}] ready: no overflow`, await noOverflow(page));
    await page.screenshot({ path: `${OUT}/${tag}-retire-card.png`, fullPage: true });

    await toggleLang(page);
    const en = await text(page, "#tt-retire");
    check(`[${tag}] ready: English repaints the card with no Chinese`, /Hang up the whistle/.test(en) && /If you retired today/.test(en) && /Retire/.test(en) && !CJK.test(en), en.slice(0, 150));
    check(`[${tag}] ready: English aria-label`, (await page.$eval("#tt-retire", (el) => el.getAttribute("aria-label"))) === "Retirement");
    await toggleLang(page);

    await page.click("#btn-retire");
    await confirmDialog(page, "#app-confirm-cancel");
    const cancelled = await saved(page);
    check(`[${tag}] ready: cancelling the confirm changes nothing`, cancelled.status !== "retired" && cancelled.stints.length === before.stints.length && (await visible(page, "#tt-retire")));

    await page.click("#btn-retire");
    await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
    check(`[${tag}] ready: the confirm warns it is final and names the rating`, /不能撤销/.test(await text(page, "#app-confirm-dialog")) && (await text(page, "#app-confirm-dialog")).includes(`评分 ${exp.score}`), (await text(page, "#app-confirm-dialog")).slice(0, 120));
    await page.click("#app-confirm-accept");
    await page.waitForFunction(() => document.querySelector("#tt-retire")?.hidden, null, { timeout: 8000 });
    const after = await saved(page);
    check(`[${tag}] ready: saved as retired, by choice, at his age`, after.status === "retired" && after.reason === "voluntary" && after.age === before.age, JSON.stringify({ s: after.status, r: after.reason, a: after.age }));
    check(`[${tag}] ready: this job archived exactly once, as "retired"; the earlier one untouched`, JSON.stringify(after.stints) === JSON.stringify(["departed", "retired"]), JSON.stringify(after.stints));
    check(`[${tag}] ready: ending + log recorded, cash untouched`, after.ending?.id === "retired" && after.log.at(-1) === "retired" && after.cash === before.cash);
    await checkRetiredScreen(page, tag, "voluntary", { note: `${before.age} 岁，自己决定挂靴` });
    await page.screenshot({ path: `${OUT}/${tag}-retired.png`, fullPage: true });

    await reload(page);
    await checkRetiredScreen(page, tag, "after reload", { note: `${before.age} 岁，自己决定挂靴` });

    await toggleLang(page);
    const enVerdict = await text(page, "#tt-verdict");
    check(`[${tag}] retired, English: banner + tiles + stints + share card contain no Chinese`,
      /Retired/.test(enVerdict) && !CJK.test(enVerdict) && !CJK.test(await text(page, "#tt-legacy")) && !CJK.test(await text(page, "#tt-stints")) && !CJK.test(await text(page, "#time-travel-share-card")),
      [enVerdict, await text(page, "#tt-legacy"), await text(page, "#time-travel-share-card")].filter((t) => CJK.test(t)).map((t) => t.slice(0, 90)).join(" | "));
    check(`[${tag}] retired, English: season tiles are English labels, no Chinese`, !CJK.test(await text(page, "#time-travel-report-seasons")) && !/lottery|playoffs/.test(await text(page, "#time-travel-report-seasons")), await text(page, "#time-travel-report-seasons"));
    check(`[${tag}] retired, English: the note and labels`, /your call to hang up the whistle/.test(enVerdict) && /Retired/.test(await text(page, "#tt-stints")), enVerdict);
    check(`[${tag}] no page errors (voluntary retirement)`, errors.length === 0, errors.join(" | "));
    await page.close();
  }

  // ============================================================ forced retirement (real rollover at 70)
  {
    const { page, errors } = await openCareer(width, height, "forced");
    const state = await saved(page);
    check(`[${tag}] forced: the real rollover aged him to 70 and retired him by the age rule`, state.status === "retired" && state.reason === "forced" && state.age === 70, JSON.stringify({ s: state.status, r: state.reason, a: state.age }));
    check(`[${tag}] forced: the age was logged before the retirement`, state.log.indexOf("coach-aged") !== -1 && state.log.indexOf("coach-aged") < state.log.indexOf("retired"), JSON.stringify(state.log.slice(-4)));
    await checkRetiredScreen(page, tag, "forced", { note: "70 岁，到了退休年龄，依规挂靴" });
    await toggleLang(page);
    check(`[${tag}] forced, English: the age-limit note`, /the retirement age/.test(await text(page, "#tt-verdict")) && !CJK.test(await text(page, "#tt-verdict")), await text(page, "#tt-verdict"));
    check(`[${tag}] no page errors (forced)`, errors.length === 0, errors.join(" | "));
    await page.close();
  }

  // ============================================================ retiring instead of job-hunting
  {
    const { page, errors } = await openCareer(width, height, "fired");
    const before = await saved(page);
    check(`[${tag}] fired: both the job board and the retire card are offered`, (await visible(page, "#tt-jobs")) && (await visible(page, "#tt-retire")));
    await page.click("#btn-retire");
    await confirmDialog(page, "#app-confirm-accept");
    await page.waitForFunction(() => document.querySelector("#tt-retire")?.hidden, null, { timeout: 8000 });
    const after = await saved(page);
    check(`[${tag}] fired: retiring does not archive the lost job a second time`, after.status === "retired" && after.stints.length === before.stints.length && !after.stints.includes("retired"), JSON.stringify(after.stints));
    check(`[${tag}] fired: the job board is gone for good`, !(await visible(page, "#tt-jobs")));
    check(`[${tag}] fired: the verdict reads Retired, not Fired`, /已退休/.test(await text(page, "#tt-verdict")) && !/被解雇/.test(await text(page, "#tt-verdict")), await text(page, "#tt-verdict"));
    check(`[${tag}] fired: no horizontal overflow`, await noOverflow(page));
    check(`[${tag}] no page errors (retire after firing)`, errors.length === 0, errors.join(" | "));
    await page.close();
  }

  // ============================================================ when it must NOT be offered
  for (const scenario of ["underway", "fresh"]) {
    const { page, errors } = await openCareer(width, height, scenario);
    check(`[${tag}] ${scenario}: no retire card (${scenario === "underway" ? "a half-played season isn't thrown away" : "nothing to retire from yet"})`, !(await visible(page, "#tt-retire")));
    check(`[${tag}] ${scenario}: the screen still works (Continue present)`, await visible(page, "#btn-time-travel-continue"));
    check(`[${tag}] ${scenario}: no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
