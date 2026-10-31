// Browser E2E for B6 (poaching): a well-regarded coach gets an offer from another club; accepting
// archives the stint and starts a new one, declining raises front-office trust, and the offer
// lapses once the season's first game is played. Saves are built with the REAL engine and read back
// by the real UI -- no stubs.
// Usage: node scripts/qa/career-poach.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/poach";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/**
 * scenario: "offer"  -> a coach with an outstanding poach offer
 *           "none"   -> same coach, but a pre-B6-style save (no poachOffer field at all)
 *           "lapsed" -> the offer exists, but the season's first game has already been played
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
    const poach = await import("/js/modes/poaching.js");
    const coachMod = await import("/js/career/coachProfile.js");
    const sr = await import("/js/data/saveRoot.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7 });
    let root = ttc.acceptInterviewOffer(prologue, prologue.offers[1].id);
    const team = root.leagueCareer.season.userTeamId;
    root.coach = coachMod.createCoachProfile({ ...(root.coach || {}), reputation: 80, cash: 40 });
    root.story.pendingDecision = null;
    root.story.frontOfficeTrust = 60;
    root.leagueCareer.management.seasonHistory = [0, 1].map((i) => ({
      year: 1993 + i, teamId: team, teamName: "QA Team", record: { w: 58, l: 24 }, finish: "playoffs", championId: "OTHER",
    }));
    if (which !== "none") {
      // The roll is seeded by the story id: vary it until the coin lands (as the unit tests do).
      for (let i = 0; i < 200; i++) {
        const storyId = `${root.story.storyId}-qa${i}`;
        const candidate = { ...root, leagueCareer: { ...root.leagueCareer, storyId }, story: { ...root.story, storyId } };
        const rolled = poach.maybeCreatePoachOffer(candidate);
        if (rolled.story.poachOffer) { root = rolled; break; }
      }
      if (!root.story.poachOffer) throw new Error("no poach offer rolled");
    }
    if (which === "lapsed") {
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
    employer: root?.story?.employer,
    offer: root?.story?.poachOffer ?? null,
    trust: root?.story?.frontOfficeTrust,
    stints: root?.coach?.stints?.map((s) => s.reason) ?? [],
    reputation: root?.coach?.reputation,
    cash: root?.coach?.cash,
    salary: root?.story?.employment?.offer?.salary ?? null,
    pressure: root?.story?.mediaPressure,
    log: root?.story?.eventLog?.map((e) => e.type) ?? [],
  };
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

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  // ============================================================ the offer card
  {
    const { page, errors } = await openCareer(width, height, "offer");
    const before = await saved(page);
    const oldTeam = await text(page, ".tt-hq-name");
    check(`[${tag}] the poach card is shown`, await visible(page, "#tt-poach"));
    check(`[${tag}] it is the FIRST card in the main column (it can't be missed)`, await page.$eval(".tt-main", (el) => el.firstElementChild.id === "tt-poach"));
    const offerTeam = await page.$eval("#tt-poach-card .tt-offer-static", (el) => el.dataset.team);
    check(`[${tag}] it names a different club, a contender`, offerTeam && offerTeam !== oldTeam && (await page.$eval("#tt-poach-card .tt-offer-static", (el) => el.dataset.archetype)) === "contender", `${oldTeam} vs ${offerTeam}`);
    check(`[${tag}] the title names the club`, (await text(page, "#tt-poach-title")).includes(offerTeam));
    const stakes = await text(page, "#tt-poach-stakes");
    check(`[${tag}] stakes spell out the cost, the reward AND the decline, with the real numbers`,
      /接受的代价/.test(stakes) && /声望 -3/.test(stakes) && /接受的回报/.test(stakes) && /¤9（现在 ¤5）/.test(stakes) && /信任 \+15/.test(stakes) && /婉拒/.test(stakes) && /信任 \+5/.test(stakes),
      stakes.slice(0, 200));
    check(`[${tag}] the note says when the offer lapses`, /第一场比赛/.test(await text(page, "#tt-poach-note")));
    check(`[${tag}] the team card is not selectable`, (await page.$$("#tt-poach-card [role=radio], #tt-poach-card button")).length === 0);
    check(`[${tag}] accept + decline are real, enabled buttons`, (await page.$eval("#btn-poach-accept", (el) => !el.disabled && el.textContent.trim().length > 2)) && (await page.$eval("#btn-poach-decline", (el) => !el.disabled && el.textContent.trim().length > 2)));
    check(`[${tag}] the offer does NOT block play (Continue still there)`, await visible(page, "#btn-time-travel-continue"));
    check(`[${tag}] no coaching record yet, so no history strip`, !(await visible(page, "#tt-over")));
    check(`[${tag}] no horizontal overflow`, await noOverflow(page));
    await page.screenshot({ path: `${OUT}/${tag}-offer.png`, fullPage: true });

    // ---- English repaint ----
    await page.evaluate(() => document.querySelector("#btn-lang").click());
    await page.waitForTimeout(300);
    const en = await text(page, "#tt-poach");
    check(`[${tag}] English mode repaints the whole card`, /Poaching offer/.test(en) && /Accept and move/.test(en) && /Decline and stay/.test(en) && !/[\u4e00-\u9fff]/.test(en), en.slice(0, 140));
    check(`[${tag}] English aria-label on the section`, (await page.$eval("#tt-poach", (el) => el.getAttribute("aria-label"))) === "Poaching offer");
    await page.evaluate(() => document.querySelector("#btn-lang").click());
    await page.waitForTimeout(200);

    // ---- cancelling the confirm saves nothing ----
    await page.click("#btn-poach-accept");
    await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
    await page.screenshot({ path: `${OUT}/${tag}-accept-confirm.png` });
    await page.click("#app-confirm-cancel");
    await page.waitForFunction(() => !document.querySelector("#app-confirm-dialog").open);
    const stillThere = await saved(page);
    check(`[${tag}] cancelling the confirm changes nothing`, stillThere.employer === before.employer && stillThere.offer && stillThere.stints.length === 0 && (await visible(page, "#tt-poach")));

    // ---- accept ----
    await page.click("#btn-poach-accept");
    await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
    await page.click("#app-confirm-accept");
    await page.waitForFunction(() => document.querySelector("#tt-poach")?.hidden, null, { timeout: 8000 });
    const after = await saved(page);
    check(`[${tag}] now coaching the poaching club, still active`, after.status === "active" && after.employer !== before.employer && !after.offer, JSON.stringify({ status: after.status, employer: after.employer }));
    check(`[${tag}] old job archived as "poached"`, JSON.stringify(after.stints) === JSON.stringify(["poached"]), JSON.stringify(after.stints));
    check(`[${tag}] reputation paid the −3, cash came along`, after.reputation === before.reputation - 3 && after.cash === before.cash, `rep ${before.reputation}->${after.reputation}, cash ${before.cash}->${after.cash}`);
    check(`[${tag}] signing bonus: trust = the club's 45 + 15, salary ¤9 (was ¤5), pressure is the club's own 80`, after.trust === 60 && after.salary === 9 && after.pressure === 80, `trust ${after.trust}, salary ${after.salary}, pressure ${after.pressure}`);
    check(`[${tag}] new log starts with poached-in`, after.log[0] === "poached-in", JSON.stringify(after.log));
    const newTeam = await text(page, ".tt-hq-name");
    check(`[${tag}] HQ shows the new club`, newTeam === offerTeam && newTeam !== oldTeam, `${oldTeam} -> ${newTeam}`);
    check(`[${tag}] the coaching record now shows the old job (B5 used to hide it once re-hired)`, (await visible(page, "#tt-over")) && (await page.$$("#tt-stints .tt-stint")).length === 1);
    check(`[${tag}] ...labelled as poached, with no "you were fired" verdict`, /被挖角/.test(await text(page, "#tt-stints")) && (await page.$eval("#tt-verdict", (el) => el.innerHTML.trim())) === "");
    check(`[${tag}] Continue, goal and finance are all live for the new job`, (await visible(page, "#btn-time-travel-continue")) && (await visible(page, "#tt-goal")) && (await visible(page, "#time-travel-finance")));
    check(`[${tag}] finance card now shows the raise`, /年薪 ¤9/.test(await text(page, "#time-travel-finance-summary")), await text(page, "#time-travel-finance-summary"));
    check(`[${tag}] status line names the club`, (await text(page, "#time-travel-status")).includes(offerTeam));
    check(`[${tag}] no overflow after moving`, await noOverflow(page));
    await page.screenshot({ path: `${OUT}/${tag}-moved.png`, fullPage: true });

    await reload(page);
    check(`[${tag}] reload keeps the new club AND the record`, (await text(page, ".tt-hq-name")) === offerTeam && (await page.$$("#tt-stints .tt-stint")).length === 1);
    await page.evaluate(() => document.querySelector("#btn-lang").click());
    await page.waitForTimeout(300);
    check(`[${tag}] English stint label`, /Poached away/.test(await text(page, "#tt-stints")), (await text(page, "#tt-stints")).slice(0, 100));
    check(`[${tag}] no page errors (offer + accept)`, errors.length === 0, errors.join(" | "));
    await page.close();
  }

  // ============================================================ decline
  {
    const { page, errors } = await openCareer(width, height, "offer");
    const before = await saved(page);
    await page.click("#btn-poach-decline");
    await page.waitForFunction(() => document.querySelector("#tt-poach")?.hidden, null, { timeout: 8000 });
    const after = await saved(page);
    check(`[${tag}] declining keeps the same club and clears the offer`, after.employer === before.employer && after.offer === null && after.status === "active");
    check(`[${tag}] front-office trust +5`, after.trust === before.trust + 5, `${before.trust}->${after.trust}`);
    check(`[${tag}] the refusal is on record, no stint archived`, after.log.at(-1) === "poach-declined" && after.stints.length === 0, JSON.stringify(after.log.slice(-2)));
    check(`[${tag}] status line acknowledges it`, /婉拒/.test(await text(page, "#time-travel-status")));
    check(`[${tag}] still no history strip after staying`, !(await visible(page, "#tt-over")));
    await reload(page);
    check(`[${tag}] reload: the card does not come back`, !(await visible(page, "#tt-poach")) && (await saved(page)).offer === null);
    check(`[${tag}] no page errors (decline)`, errors.length === 0, errors.join(" | "));
    await page.close();
  }

  // ============================================================ no offer / lapsed offer
  for (const scenario of ["none", "lapsed"]) {
    const { page, errors } = await openCareer(width, height, scenario);
    check(`[${tag}] ${scenario}: no poach card`, !(await visible(page, "#tt-poach")));
    check(`[${tag}] ${scenario}: the screen still works (Continue present)`, await visible(page, "#btn-time-travel-continue"));
    if (scenario === "lapsed") {
      check(`[${tag}] lapsed: the stale offer is still in the save (it is cleaned up at the rollover, not by viewing)`, (await saved(page)).offer !== null);
    }
    check(`[${tag}] ${scenario}: no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
