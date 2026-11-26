// Browser smoke for Player Agency PA3 slice 1: a teammate offers a screen and it is a real play.
// Real flow, real engine, no injected fixtures: signed-in account -> new historical Reborn -> Full control -> play games until a dialog
// carries the teammate's offer -> it shows who is speaking, a line, "take his screen" and "ask for another way (he may say no)" ->
// take one by CLICK, another by KEY -> after the game the report says what the screen really did and who your chemistry moved with ->
// the account's relationship ledger holds a 'teammate' record, once, as an integer.
// Desktop 1440 + mobile 390.
// Usage: node scripts/qa/reborn-teamplay.mjs [outDir] [baseUrl] [zh|en]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-teamplay";
const BASE = process.argv[3] || "http://127.0.0.1:5191/";
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=teamplay-qa-3`;
const LANG = process.argv[4] === "en" ? "en" : "zh";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);

const readDialog = (page) => page.$eval(".reborn-agency", (el) => ({
  text: el.textContent,
  mate: el.querySelector("[data-testid=teammate-offer]")?.textContent || "",
  options: [...el.querySelectorAll("[data-option]")].map((b) => b.dataset.option),
  labels: Object.fromEntries([...el.querySelectorAll("[data-option]")].map((b) => [b.dataset.option, b.textContent])),
}));

/** Play one game. Dialogs with an offer: the first is taken by click, the second asks for the other way by KEY, the rest take it. */
async function playOne(page, tag, state) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  const started = Date.now();
  while (Date.now() - started < 90000) {
    if (await visible(page, ".reborn-agency")) {
      const d = await readDialog(page);
      if (d.options.includes("screen")) {
        state.offers += 1;
        if (!state.first) { state.first = { ...d, overflow: await noOverflow(page) }; await shoot(page, `${OUT}/${tag}-dialog-offer.png`); }
        if (state.offers === 2) {
          state.keyed = d.options.indexOf("screenAlt") + 1;
          await page.keyboard.press(String(state.keyed));
          state.picks.push("screenAlt(key)");
        } else {
          await page.click('.reborn-takeover-option[data-option="screen"]');
          state.picks.push("screen(click)");
        }
      } else await page.click('.reborn-takeover-option[data-option="pass"]');
    } else if (await visible(page, ".reborn-takeover-dialog")) {
      await page.click('.reborn-takeover-option[data-option="pass"]');
    }
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    if (now && now !== before && !(await page.$eval("[data-play]", (el) => el.disabled).catch(() => false))) return;
    await page.waitForTimeout(250);
  }
  throw new Error("game did not finish");
}

const browser = await chromium.launch({ executablePath: EXE });
for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("courtside.lang", l);
    const account = { id: "qa-teamplay", name: "QA", createdAt: Date.now(), playerIds: [], coachIds: [], cardMods: {}, coachId: null, tacticId: "balanced", lastDailyDraw: null, drawHistory: [], gold: 0, rankedWins: 0, rankedLosses: 0 };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", "qa-teamplay");
  }, LANG);
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector(".reborn-create", { timeout: 20000 });
  await page.click('[data-reborn-destiny="historical"]');
  await page.waitForSelector(".reborn-create-pick", { timeout: 10000 });
  await page.click(".reborn-create-pick");
  await page.click(".reborn-create-confirm");
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  await page.click('.reborn-identity [data-mode="full"]');

  const state = { first: null, offers: 0, picks: [], keyed: 0, feedback: [] };
  for (let games = 0; games < 25 && !(state.offers >= 3 && state.feedback.length >= 2); games++) {
    await playOne(page, tag, state);
    const lines = await page.$$eval("[data-testid=teamplay-feedback]", (els) => els.map((e) => e.textContent));
    if (lines.length) { state.feedback.push(lines); if (state.feedback.length === 1) await shoot(page, `${OUT}/${tag}-report.png`); }
  }

  const f = state.first;
  check(`${tag}: a dialog carried a teammate's offer`, !!f, `${state.offers} offers`);
  if (f) {
    check(`${tag}: it says who is speaking, with a position and a line`, /队友交流|Teammate/.test(f.mate) && /「.+」/.test(f.mate), f.mate.slice(0, 70));
    check(`${tag}: both ways are offered, the request honestly says he may refuse`, f.options.includes("screen") && f.options.includes("screenAlt") && /不答应|may say no/.test(f.labels.screenAlt), f.labels.screenAlt?.slice(0, 70));
    check(`${tag}: the old options are still there`, ["drive", "pullup", "pass"].every((o) => f.options.includes(o)), f.options.join(","));
    check(`${tag}: dialog fits the screen`, f.overflow);
    if (LANG === "en") check(`${tag}: dialog is English`, !/[\u4e00-\u9fff]/.test(f.mate.replace(/[A-Z][a-z]+ [A-Z][a-z]+/g, "")), f.mate.slice(0, 100));
  }
  check(`${tag}: took one by click and one by key (${state.keyed ? `key ${state.keyed}` : "no key"})`, state.picks.some((p) => p.endsWith("(click)")) && state.picks.some((p) => p.endsWith("(key)")), state.picks.join(" "));
  check(`${tag}: after a game the report says what the screen did`, state.feedback.length > 0, state.feedback[0]?.join(" | ").slice(0, 120));
  if (state.feedback.length) {
    const flat = state.feedback.flat().join(" ");
    check(`${tag}: it is about a real result (scored / missed / turnover / the teammate declined)`, LANG === "en" ? /paid off|did not fall|turnover|did not go along/.test(flat) : /打成了|没投进|失误|没有接你的要求/.test(flat), flat.slice(0, 100));
  }
  await page.waitForTimeout(400);
  const ledger = await page.evaluate(() => {
    const accounts = JSON.parse(localStorage.getItem("cls_accounts_v1") || "{}").accounts || [];
    const store = (accounts.find((a) => a.id === "qa-teamplay") || {}).careerRelationships || {};
    return (store.relationships || []).filter((r) => r.kind === "teammate").map((r) => ({ pair: [r.aId, r.bId].sort().join("|"), strength: r.strength, int: Number.isInteger(r.strength) }));
  });
  const moved = state.feedback.flat().some((l) => /默契|Chemistry/.test(l));
  check(`${tag}: the account ledger holds the teammate record when chemistry moved`, moved ? ledger.length >= 1 && ledger.every((r) => r.int && r.strength >= 0 && r.strength <= 100) : true, `${ledger.length} record(s) ${JSON.stringify(ledger.slice(0, 2))}${moved ? "" : " (no chemistry moved in these games)"}`);
  check(`${tag}: one record per teammate, never a duplicate`, new Set(ledger.map((r) => r.pair)).size === ledger.length, `${ledger.length} record(s)`);
  check(`${tag}: no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
