// Browser E2E for Career Role Permissions (ADR-006 R4): the Coach and GM
// flows through the real UI, desktop + mobile, Chinese + English.
// Coach (?career=coach -> Time Travel, role COACH): market trade / FA /
// cut are refused with a readable reason, rotation save and commanding
// a game work. GM (League Manager setup, role GM): trade opens, rotation
// save and commanding a game are refused. GM+Coach (default Time Travel
// career): everything works. Real engine, real clicks; the draft
// suggest path and the development field split are unit-tested (the
// draft needs an offseason, so it is not reachable in a fresh-season
// browser run).
// Usage: node scripts/qa/career-roles.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot } from "./lib/page.mjs";
import { openInterview, skipInterview } from "./lib/interview.mjs";
import { openCareer, resumeToHub } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/career-roles";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => {
  const line = `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`;
  report.push(line);
  console.log(line); // live: a crash later in the script must not swallow what already ran
};
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cls_root_v3") || "null"));
const roleOf = (root) => ({ identity: root?.identity?.currentRole, career: root?.leagueCareer?.role, kind: root?.leagueCareer?.kind });
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);

/** A fresh page with dialog capture: every alert/confirm lands in `dialogs`. */
async function newPage(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  const dialogs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  return { page, errors, dialogs, takeDialogs: () => dialogs.splice(0) };
}
const fresh = async (page, query = "") => {
  await page.goto(BASE + query, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
};

/** Coach: ?career=coach -> Time Travel creation -> skip the interview -> load management -> hub. */
async function createCoachCareer(page) {
  await fresh(page, "?career=coach");
  await page.waitForSelector("#time-travel-year option", { state: "attached", timeout: 15000 });
  await page.evaluate(() => { const y = document.querySelector("#time-travel-year"); y.value = "1995"; y.dispatchEvent(new Event("change")); });
  await page.click("#btn-time-travel-interview");
  await page.waitForSelector("#time-travel-offers .tt-offer", { timeout: 10000 });
  await openInterview(page, "middle");
  await page.waitForSelector("#tt-interview:not([hidden])");
  await skipInterview(page);
  await page.waitForSelector("#time-travel-decision:not([hidden])", { timeout: 15000 });
  await page.click('[data-story-choice="introduce-load-management"]');
  await page.click("#time-travel-decision > .tt-confirm-slot [data-act=confirm]");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 }).catch(async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await resumeToHub(page);
  });
}

/** GM: League Manager setup (franchise) with an account roster, straight to the hub. */
async function createGmCareer(page) {
  await fresh(page);
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js"); const pl = await import("/js/data/players.js"); const co = await import("/js/data/coaches.js");
    const a = acc.createAccount("权限QA"); const seen = new Set(); a.playerIds = [...pl.PLAYERS].filter((p) => pl.overall(p) >= 55 && pl.overall(p) <= 72).filter((p) => !seen.has(p.bref) && seen.add(p.bref)).slice(0, 15).map((p) => p.id); // one card per person (the builder dedupes); mid OVR so the salary cap fits
    a.onboardingDone = true; a.welcomeGranted = true; a.coachId = co.COACHES[0].id; a.coachIds = [a.coachId]; acc.saveAccount(a);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.mode-card[data-mode="franchise"]');
  await page.waitForSelector("#screen-season.active");
  await page.click("#btn-career-length-franchise");
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
}

const openMarket = async (page) => {
  await page.click('[data-season-tab="market"]');
  await page.waitForSelector("#season-market:not([hidden])");
};
const openRotation = async (page) => {
  await page.click('[data-season-tab="rotation"]');
  await page.waitForSelector("#season-rotation:not([hidden])");
};

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  // ---- Coach (Chinese)
  const { page, errors, takeDialogs } = await newPage(browser, width, height);
  await createCoachCareer(page);
  const coachRoot = await saved(page);
  check(`[${tag}] Coach: ?career=coach stamps COACH on identity and career`, coachRoot?.identity?.currentRole === "COACH" && coachRoot?.leagueCareer?.role === "COACH", JSON.stringify(roleOf(coachRoot)));
  await openMarket(page);
  takeDialogs();
  await page.click("#btn-sm-trade");
  check(`[${tag}] Coach: trade is refused, and the reason names the coach's job`, takeDialogs().some((m) => m.includes("教练")), "no refusal dialog");
  const signBtn = await page.$(".sm-sign");
  if (signBtn) {
    takeDialogs();
    await signBtn.click();
    check(`[${tag}] Coach: signing a free agent is refused`, takeDialogs().some((m) => m.includes("教练")), "no refusal dialog");
  } else {
    check(`[${tag}] Coach: a free-agent sign button exists to test`, false, "no .sm-sign on the market");
  }
  const cutBtn = await page.$(".sm-cut");
  if (cutBtn) {
    takeDialogs();
    await cutBtn.click();
    check(`[${tag}] Coach: cutting a player is refused before the confirm`, takeDialogs().some((m) => m.includes("教练")), "no refusal dialog");
  } else {
    check(`[${tag}] Coach: a cut button exists to test`, false, "no .sm-cut on the market");
  }
  await openRotation(page);
  takeDialogs();
  await page.click("#btn-rot-save");
  const afterRot = await saved(page);
  const rot = afterRot?.leagueCareer?.season?.teams?.[afterRot.leagueCareer.season.userTeamId]?.rotation;
  check(`[${tag}] Coach: rotation save runs (no refusal) and persists 5 starters`, takeDialogs().length === 0 && rot?.starterIds?.length === 5, JSON.stringify({ dialogs: takeDialogs(), starters: rot?.starterIds?.length }));
  takeDialogs();
  await page.click("#btn-season-play");
  await page.waitForSelector("#screen-setup.active", { timeout: 10000 });
  check(`[${tag}] Coach: commanding the game opens the setup screen`, takeDialogs().length === 0);
  await shoot(page, `${OUT}/${tag}-1-coach-setup.png`);
  await page.click("#btn-setup-back").catch(() => {});
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 10000 }).catch(async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await resumeToHub(page);
  });
  check(`[${tag}] Coach: no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] Coach: no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();

  // ---- GM (Chinese)
  const gm = await newPage(browser, width, height);
  await createGmCareer(gm.page);
  const gmRoot = await saved(gm.page);
  check(`[${tag}] GM: franchise setup stamps GM on the career`, gmRoot?.leagueCareer?.kind === "franchise" && gmRoot?.leagueCareer?.role === "GM", JSON.stringify(roleOf(gmRoot)));
  await openMarket(gm.page);
  gm.takeDialogs();
  await gm.page.click("#btn-sm-trade");
  check(`[${tag}] GM: trade runs (no refusal dialog)`, gm.takeDialogs().length === 0, "trade was refused");
  check(`[${tag}] GM: the trade panel still offers both sides`, (await gm.page.$$("#sm-trade-you input[type=checkbox]")).length > 0 && (await gm.page.$$("#sm-trade-cpu input[type=checkbox]")).length > 0);
  await openRotation(gm.page);
  gm.takeDialogs();
  await gm.page.click("#btn-rot-save");
  check(`[${tag}] GM: rotation save is refused, and the reason names the GM's job`, gm.takeDialogs().some((m) => m.includes("总经理")), "no refusal dialog");
  gm.takeDialogs();
  await gm.page.click("#btn-season-play");
  check(`[${tag}] GM: commanding the game is refused and the hub stays put`, gm.takeDialogs().some((m) => m.includes("总经理")) && (await visible(gm.page, "#season-hub-panel")), "no refusal dialog or left the hub");
  await shoot(gm.page, `${OUT}/${tag}-2-gm-hub.png`);
  check(`[${tag}] GM: no horizontal overflow`, await noOverflow(gm.page));
  check(`[${tag}] GM: no page errors`, gm.errors.length === 0, gm.errors.join(" | "));
  await gm.page.close();

  // ---- GM+Coach regression (Chinese): the default Time Travel career keeps full control
  const dual = await newPage(browser, width, height);
  await openCareer(dual.page, BASE);
  const dualRoot = await saved(dual.page);
  check(`[${tag}] GM+Coach: default career keeps the GM_COACH role`, dualRoot?.leagueCareer?.role === "GM_COACH", JSON.stringify(roleOf(dualRoot)));
  await openMarket(dual.page);
  dual.takeDialogs();
  await dual.page.click("#btn-sm-trade");
  check(`[${tag}] GM+Coach: trade runs`, dual.takeDialogs().length === 0, "trade was refused");
  await openRotation(dual.page);
  dual.takeDialogs();
  await dual.page.click("#btn-rot-save");
  check(`[${tag}] GM+Coach: rotation save runs`, dual.takeDialogs().length === 0, "rotation was refused");
  dual.takeDialogs();
  await dual.page.click("#btn-season-play");
  await dual.page.waitForSelector("#screen-setup.active", { timeout: 10000 });
  check(`[${tag}] GM+Coach: commanding the game opens the setup screen`, dual.takeDialogs().length === 0);
  check(`[${tag}] GM+Coach: no page errors`, dual.errors.length === 0, dual.errors.join(" | "));
  await dual.page.close();

  // ---- English: the Coach refusal reads in English, no Chinese left
  const en = await newPage(browser, width, height);
  await en.page.goto(BASE, { waitUntil: "domcontentloaded" });
  await en.page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("courtside.lang", "en"); });
  await en.page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(en.page);
  await en.page.evaluate(async () => {
    const ttc = await import("/js/modes/timeTravelCareer.js");
    const sr = await import("/js/data/saveRoot.js");
    const prologue = ttc.createTimeTravelPrologue({ year: 1995, philosophy: "analytics", seed: 7, role: "COACH" });
    const root = ttc.resolveFutureKnowledgeChoice(ttc.acceptInterviewOffer(prologue, prologue.offers[1].id), "introduce-load-management");
    sr.writeRootSave(root, localStorage);
  });
  await en.page.reload({ waitUntil: "domcontentloaded" });
  await resumeToHub(en.page);
  await openMarket(en.page);
  en.takeDialogs();
  await en.page.click("#btn-sm-trade");
  const enDialogs = en.takeDialogs();
  check(`[${tag}] EN Coach: trade refusal is in English`, enDialogs.some((m) => /coach/i.test(m)) && !enDialogs.some((m) => CJK.test(m)), JSON.stringify(enDialogs));
  await shoot(en.page, `${OUT}/${tag}-3-en-refusal.png`);
  await en.page.close();
}
await browser.close();
const failed = report.filter((line) => line.startsWith("FAIL"));
console.log(report.join("\n"));
console.log(`\n${report.length - failed.length}/${report.length} passed`);
process.exit(failed.length ? 1 : 0);
