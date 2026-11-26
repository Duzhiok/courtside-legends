// Browser smoke for Player Agency PA3 slice 3a: the defensive gamble is a real, honest, rare question.
// Real flow, real engine: signed-in account -> new historical Reborn -> Full control -> play games; on THEIR possession a compact
// panel asks "gamble for the steal or stay home" (real facts: fouls / stamina / steal skill; a plain warning that a gamble does
// not stop them scoring) -> take one by CLICK, one by KEY -> after the game the report says what the gamble did.
// Also counts how many defensive questions a game asks (fatigue guard). Desktop 1440 + mobile 390.
// Usage: node scripts/qa/reborn-defense.mjs [outDir] [baseUrl] [zh|en]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/reborn-defense";
const BASE = process.argv[3] || "http://127.0.0.1:5191/";
const urlFor = (n) => `${BASE}${BASE.includes("?") ? "&" : "?"}reborn-seed=defense-qa-${n}`;
const LANG = process.argv[4] === "en" ? "en" : "zh";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.getClientRects().length > 0).catch(() => false);

/** Play one game; returns how many defensive questions it asked. */
async function playOne(page, tag, state) {
  const before = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
  await page.click("[data-play]");
  let defenseAsks = 0;
  const started = Date.now();
  while (Date.now() - started < 120000) {
    if (await visible(page, ".reborn-agency")) {
      const d = await page.$eval(".reborn-agency", (el) => ({
        defense: el.classList.contains("reborn-agency-defense"),
        text: el.textContent,
        options: [...el.querySelectorAll("[data-option]")].map((b) => b.dataset.option),
        facts: el.querySelector("[data-testid=defense-facts]")?.textContent || "",
      }));
      if (d.defense) {
        defenseAsks += 1;
        state.asks += 1;
        if (!state.first) { state.first = { ...d, overflow: await noOverflow(page) }; await shoot(page, `${OUT}/${tag}-defense-panel.png`); }
        if (state.asks === 2) { await page.keyboard.press("2"); state.picks.push("stay(key)"); }
        else { await page.click('.reborn-takeover-option[data-option="gamble"]'); state.picks.push("gamble(click)"); }
      } else await page.click('.reborn-takeover-option[data-option="pass"]');
    } else if (await visible(page, ".reborn-takeover-dialog")) {
      await page.click('.reborn-takeover-option[data-option="pass"]');
    }
    const now = await page.$eval(".reborn-report", (el) => el.textContent).catch(() => "");
    // Finished = a new report AND the next-game button is back, or gone for good (the last game of the regular season removes it).
    const playBtn = await page.$("[data-play]");
    if (now && now !== before && (!playBtn || !(await playBtn.isDisabled()))) return defenseAsks;
    await page.waitForTimeout(200);
  }
  throw new Error("game did not finish");
}

const browser = await chromium.launch({ executablePath: EXE });

/** One career on one seed: play until both ways were taken and reported, or the season ends. A bench rookie may never get on the floor. */
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
    const account = { id: "qa-defense", name: "QA", createdAt: Date.now(), playerIds: [], coachIds: [], cardMods: {}, coachId: null, tacticId: "balanced", lastDailyDraw: null, drawHistory: [], gold: 0, rankedWins: 0, rankedLosses: 0 };
    localStorage.setItem("cls_accounts_v1", JSON.stringify({ accounts: [account] }));
    localStorage.setItem("cls_active_account", "qa-defense");
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

  const state = { first: null, asks: 0, picks: [] };
  const perGame = [];
  const feedback = [];
  for (let g = 0; g < 90 && !(state.asks >= 2 && feedback.length >= 1); g++) {
    if (!(await page.$("[data-play]:not([disabled])"))) break; // the regular season is over
    perGame.push(await playOne(page, tag, state));
    const lines = await page.$$eval("[data-testid=defense-feedback]", (els) => els.map((e) => e.textContent));
    if (lines.length) feedback.push(lines);
  }
  await page.close();
  return { state, perGame, feedback, errors };
}

for (const [width, height, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  let r = null;
  let seedNo = 3;
  for (; seedNo < 7; seedNo++) {
    r = await session(width, height, tag, seedNo);
    if (r.state.asks >= 2 && r.feedback.length >= 1) break;
    console.log(`note ${tag}: seed ${seedNo} gave ${r.state.asks} defensive question(s) in ${r.perGame.length} games (a bench rookie may never play) - trying the next seed`);
  }
  const { state, perGame, feedback, errors } = r;
  const f = state.first;
  check(`${tag}: a defensive panel opened on THEIR possession`, !!f, `${state.asks} asks over ${perGame.length} games (seed ${seedNo})`);
  if (f) {
    check(`${tag}: two options only - gamble / stay (no box-out, help or switch the engine cannot back)`, f.options.join() === "gamble,stay", f.options.join());
    check(`${tag}: it shows real facts (fouls, stamina, steal skill)`, LANG === "en" ? /Fouls \d+ · stamina \d+% · steal skill/.test(f.facts) : /你已犯规 \d+ 次 · 体力 \d+% · 抢断能力/.test(f.facts), f.facts);
    check(`${tag}: the warning says a gamble does not stop them scoring`, LANG === "en" ? /does not stop the other team scoring/.test(f.text) : /不会让对手少得分/.test(f.text));
    check(`${tag}: no coach card on a defensive question`, !/Coach's call|教练指令/.test(f.text));
    check(`${tag}: panel fits the screen`, f.overflow);
    if (LANG === "en") check(`${tag}: panel is English`, !/[\u4e00-\u9fff]/.test(f.text), f.text.slice(0, 90));
  }
  check(`${tag}: took one by click and one by key`, state.picks.some((p) => p.endsWith("(click)")) && state.picks.some((p) => p.endsWith("(key)")), state.picks.join(" "));
  const flat = feedback.flat().join(" | ");
  check(`${tag}: after a game the report says what the gamble did`, feedback.length > 0, flat.slice(0, 130));
  check(`${tag}: it is about a real outcome (steal / foul / forced turnover / nothing)`, !!flat && (LANG === "en" ? /took the ball|paid off|cost a foul|forced a turnover|came to nothing/.test(flat) : /断下了球|赌抢断成功|犯了一次规|逼出了对手的失误|没有结果/.test(flat)), flat.slice(0, 110));
  const worst = Math.max(0, ...perGame);
  check(`${tag}: not a wall of questions - at most ${worst} defensive asks in one Full-control game`, worst <= 8, `per game: ${perGame.join(",")}`);
  check(`${tag}: no page errors`, errors.length === 0, errors.join(" | "));
}
await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
