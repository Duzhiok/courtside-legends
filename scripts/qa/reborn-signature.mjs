// Browser smoke for Skills M1b: a move a Reborn player owns is a real option in his decisions, shares ONE budget of 2 per game, and the
// post-game report says honestly what happened. Real flow, real engine: signed-in account -> new historical Reborn -> the saved run is
// given an AWAKENED dream_shake (what M1a awards; the earning itself is covered by tests/skillsM1.test.js on real games) -> resume ->
// Full control: wait for the option, take it by CLICK, later by KEY, never more than 2 per game -> report line -> Auto mode: the game
// still finishes with no question and the report still accounts for the move. Desktop 1440 + mobile 390.
// Usage: node scripts/qa/reborn-signature.mjs [outDir] [baseUrl] [zh|en]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-signature";
const BASE = process.argv[3] || "http://127.0.0.1:5191/";
const urlFor = (n) => `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=signature-qa-${n}`;
const LANG = process.argv[4] === "en" ? "en" : "zh";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

/**
 * One atomic look-and-answer inside the page (a bubble can time out between a find and a click). Returns what it saw.
 * Takes the signature option when `take`, otherwise the first option that is not it (a defensive question has no "pass").
 */
const answerOnce = (page, take, key) => page.evaluate(({ take, key }) => {
  const shown = (el) => !el.hidden && el.getClientRects().length > 0;
  const opts = [...document.querySelectorAll("[data-option]")].filter(shown);
  if (!opts.length) return null;
  const sig = opts.find((o) => o.dataset.option === "signature");
  const root = (sig || opts[0]).closest(".reborn-agency, .reborn-bubble, .reborn-takeover-dialog") || (sig || opts[0]).parentElement;
  const seen = { signature: !!sig, text: root.textContent, card: root.querySelector("[data-testid=signature-offer]")?.textContent || "", keyIndex: sig?.dataset.key || null };
  if (sig) {
    // Can a finger reach it? Scroll it into view the way a user would, then hit-test its centre: the element under the finger must be the button.
    const dlg = sig.closest(".reborn-takeover-dialog, .reborn-agency, .reborn-bubble") || root;
    const style = getComputedStyle(dlg);
    const before = dlg.getBoundingClientRect();
    sig.scrollIntoView({ block: "nearest" });
    const r = sig.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    seen.reach = {
      reachable: !!hit && (hit === sig || sig.contains(hit)) && r.top >= 0 && r.bottom <= innerHeight,
      vh: innerHeight, dialogTop: Math.round(before.top), dialogBottom: Math.round(before.bottom), dialogScrollable: dlg.scrollHeight > dlg.clientHeight + 1,
      overflowY: style.overflowY, position: style.position, optTop: Math.round(r.top), optBottom: Math.round(r.bottom), hit: hit ? `${hit.tagName}.${String(hit.className).slice(0, 40)}` : null,
    };
  }
  if (sig && take && !key) { sig.click(); return { ...seen, took: "click" }; }
  if (sig && take && key) return { ...seen, took: "key" };
  (opts.find((o) => o.dataset.option !== "signature") || opts[0]).click();
  return { ...seen, took: null };
}, { take, key });

/** Play one game. Takes the signature option whenever it is offered (click the first time, key the second); answers everything else. */
async function playOne(page, tag, state, { take }) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  let asked = 0;
  const started = Date.now();
  while (Date.now() - started < 120000) {
    const seen = await answerOnce(page, take, take && state.taken === 1);
    if (seen) {
      if (seen.signature) {
        state.reach.push(seen.reach);
        if (seen.reach && !seen.reach.reachable && !state.shotBad) { state.shotBad = true; await page.screenshot({ path: `${OUT}/${tag}-unreachable.png`, fullPage: false }); }
        if (!state.first) { state.first = { text: seen.text, card: seen.card, overflow: await noOverflow(page) }; await page.waitForTimeout(900); /* the panel fades in; the game is waiting for the answer */ await page.screenshot({ path: `${OUT}/${tag}-offer.png`, fullPage: false }); } // the real viewport: a full-page shot re-lays-out a bottom-docked panel
        if (take && seen.took === "key") { await page.keyboard.press(seen.keyIndex); await page.waitForTimeout(500); }
        if (take && seen.took) { state.taken += 1; asked += 1; state.picks.push(seen.took); }
      } else state.questions += 1;
    }
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    const playBtn = await page.$("[data-play]");
    if (now && now !== before && (!playBtn || !(await playBtn.isDisabled()))) return { offers: asked, asked };
    await page.waitForTimeout(150);
  }
  throw new Error("game did not finish");
}

const browser = await chromium.launch({ executablePath: EXE });

async function session(width, height, tag, seedNo) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (route) => route.abort());
  await page.goto(urlFor(seedNo), { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("courtside.lang", l);
    localStorage.setItem("cls_guide_first_run_v1", "seen"); // the first-run guide would sit on top of every click
    const account = { id: "qa-signature", name: "QA", createdAt: Date.now(), playerIds: [], coachIds: [], cardMods: {}, coachId: null, tacticId: "balanced", lastDailyDraw: null, drawHistory: [] };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", "qa-signature");
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
  // Give the saved run what M1a awards (an awakened dream_shake), then resume it through the real UI.
  const armed = await page.evaluate(() => {
    const root = JSON.parse(localStorage.getItem("cls_root_v3"));
    const r = root.reborn;
    r.player.awakening = { version: 1, season: r.season?.year || 1997, form: [], ready: [], awakened: [{ skillId: "dream_shake", source: "awakened", game: 1, season: r.season?.year || 1997, evidence: {} }] };
    localStorage.setItem("cls_root_v3", JSON.stringify(root));
    return true;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.home-tab[data-category="career"]');
  await page.click('[data-career-identity="player"]');
  await page.waitForSelector("[data-play]", { timeout: 20000 });
  await page.click('.reborn-identity [data-mode="full"]');

  const state = { first: null, taken: 0, picks: [], budgets: [], questions: 0, reach: [] };
  const perGame = [];
  const lines = [];
  const firedLines = []; // the report of a game where he really took the move: it must say so
  for (let g = 0; g < 60 && !(state.taken >= 2 && firedLines.length >= 1); g++) {
    if (!(await page.$("[data-play]:not([disabled])"))) break;
    const one = await playOne(page, tag, state, { take: true });
    const got = await page.$$eval("[data-testid=signature-feedback]", (els) => els.map((e) => e.textContent));
    perGame.push({ ...one, lines: got });
    lines.push(...got);
    if (one.asked > 0) firedLines.push(...got);
  }
  // Auto mode: no question may block the game, and the report still accounts for the move.
  let auto = null;
  if (await page.$("[data-play]:not([disabled])")) {
    await page.click('.reborn-identity [data-mode="auto"]').catch(() => {});
    const s2 = { first: null, taken: 0, picks: [], budgets: [], questions: 0, reach: [] };
    const r = await playOne(page, tag, s2, { take: false });
    auto = { offers: r.offers, questions: s2.questions, lines: await page.$$eval("[data-testid=signature-feedback]", (els) => els.map((e) => e.textContent)) };
  }
  await page.close();
  return { state, perGame, lines, firedLines, auto, errors, armed };
}

for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  let r = null;
  let seedNo = 3;
  for (; seedNo < 8; seedNo++) {
    r = await session(width, height, tag, seedNo);
    if (r.state.taken >= 2 && r.firedLines.length >= 1) break;
    console.log(`note ${tag}: seed ${seedNo} offered the move ${r.state.taken} time(s) in ${r.perGame.length} games (a bench rookie may never play) - trying the next seed`);
  }
  const { state, perGame, lines, firedLines, auto, errors } = r;
  const f = state.first;
  check(`${tag}: the owned move was offered as a decision option`, !!f, `${state.taken} taken over ${perGame.length} games (seed ${seedNo})`);
  if (f) {
    check(`${tag}: it names the move and the shared budget (n/2)`, LANG === "en" ? /Dream Shake/.test(f.text) && /\/\s*2/.test(f.text) : /梦幻脚步/.test(f.text) && /\/\s*2/.test(f.text), f.text.replace(/\s+/g, " ").slice(0, 120));
    check(`${tag}: it says it is no promise and a miss still costs a use (full panel)`, !f.card || (LANG === "en" ? /no promise/.test(f.card) && /spends the use/.test(f.card) : /不保证进球，投丢也算一次/.test(f.card)), f.card.slice(0, 80));
    check(`${tag}: offer fits the screen`, f.overflow);
    if (LANG === "en") check(`${tag}: offer is English`, !/[\u4e00-\u9fff]/.test(f.text), f.text.slice(0, 80));
  }
  const unreachable = state.reach.filter((x) => x && !x.reachable);
  check(`${tag}: a finger can actually reach the signature option every time (scroll into view, hit-test its centre)`, state.reach.length > 0 && unreachable.length === 0, unreachable.length ? `${unreachable.length} of ${state.reach.length}: ${JSON.stringify(unreachable[0])}` : `${state.reach.length} offers, e.g. ${JSON.stringify(state.reach[0])}`);
  check(`${tag}: took one by click and one by key`, state.picks.includes("click") && state.picks.includes("key"), state.picks.join(" "));
  const fires = (lines) => lines.filter((l) => /你发动了|自动用了|You fired|autopilot used/.test(l)).length;
  const worst = Math.max(0, ...perGame.map((p) => fires(p.lines)));
  check(`${tag}: never more than the shared budget of 2 fired in one game (the engine's own report, not our click count)`, worst <= 2, `fired per game: ${perGame.map((p) => fires(p.lines)).join(",")}; our clicks: ${perGame.map((p) => p.asked).join(",")}`);
  const flat = firedLines.join(" | ");
  check(`${tag}: the report of a game where he took the move says so (not the "no move used" line)`, firedLines.length > 0 && !/没有用招牌动作|No signature move/.test(flat), flat.slice(0, 150));
  check(`${tag}: it is honest about the outcome (fell / the use is spent / refused)`, LANG === "en" ? /You fired .* (and it fell|and the use is spent|, it did not fall)|could not be fired/.test(flat) : /你发动了「.*」，(打成了|没有投进，次数照扣)|没能发动/.test(flat));
  check(`${tag}: games where it was never offered say so plainly`, lines.some((l) => /没有用招牌动作|No signature move/.test(l)) || perGame.every((p) => p.asked > 0));
  if (auto) {
    check(`${tag}: Auto mode finished the game with no question`, auto.questions === 0 && auto.offers === 0, `questions ${auto.questions}, offers ${auto.offers}`);
    check(`${tag}: Auto mode report still accounts for the move`, auto.lines.length > 0, auto.lines.join(" | ").slice(0, 120));
  }
  check(`${tag}: no page errors`, errors.length === 0, errors.join(" | "));
}
await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
