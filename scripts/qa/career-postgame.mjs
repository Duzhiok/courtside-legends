// Browser E2E for C1 (post-game settlement card). Real season, real engine, real buttons.
// Roadmap acceptance: a card after simulated AND hand-coached games; a bulk sim shows ONE summary card.
// The batch card is checked against the saved standings (before/after), not against itself.
// Usage: node scripts/qa/career-postgame.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, onResult, shoot, text, unbroken } from "./lib/page.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/postgame";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/** The saved season (quick season keeps it under its own key; a long career inside the root save). */
const savedSeason = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
  const st = root?.leagueCareer?.season || JSON.parse(localStorage.getItem("cls_season_v1") || "null");
  const me = st?.teams?.[st.userTeamId];
  return {
    record: st?.standings?.[st.userTeamId] ? { w: st.standings[st.userTeamId].w, l: st.standings[st.userTeamId].l, pf: st.standings[st.userTeamId].pf, pa: st.standings[st.userTeamId].pa } : null,
    roster: (me?.players || []).map((p) => p.name),
  };
});

/** What the card says, parsed out of the DOM. */
const card = (page) => page.evaluate(() => {
  const box = document.querySelector("#result-rewards");
  const cards = box ? box.querySelectorAll(".pg-card") : [];
  const first = cards[0];
  return {
    visible: !!box && !box.hidden && box.getClientRects().length > 0,
    count: cards.length,
    kicker: first?.querySelector(".pg-kicker")?.textContent.trim() || "",
    verdict: first?.querySelector(".pg-verdict strong")?.textContent.trim() || "",
    tone: first ? [...first.classList].find((c) => /^pg-(win|loss|even)$/.test(c)) : "",
    stars: [...(first?.querySelectorAll(".pg-star .pg-who strong") || [])].map((el) => el.textContent.trim()),
    all: (first?.textContent || "").replace(/\s+/g, " ").trim(),
  };
});

/** Checks every single-game card must pass, against the score line and the saved roster. */
async function checkSingle(page, tag, label) {
  const c = await card(page);
  const { roster } = await savedSeason(page);
  const title = await text(page, "#result-title").catch(() => "");
  const scoreNums = (await text(page, "#result-score")).match(/\d+/g)?.map(Number) || [];
  const m = c.verdict.match(/^(胜|负|战平|Win|Loss|Tie) (\d+)-(\d+)$/);
  check(`[${tag}] ${label}: exactly one settlement card, under the result`, c.visible && c.count === 1, JSON.stringify({ v: c.visible, n: c.count }));
  check(`[${tag}] ${label}: it is the single-game card`, /赛后结算|Post-game/.test(c.kicker), c.kicker);
  check(`[${tag}] ${label}: its score is the game's score, from MY side`, !!m && [+m[2], +m[3]].sort().join() === [...scoreNums].sort().join(), `${c.verdict} vs ${scoreNums}`);
  const won = m && +m[2] > +m[3];
  if (/我方胜|我方负|You win|You lose/.test(title)) {
    check(`[${tag}] ${label}: win/loss agrees with the result title`, won === /我方胜|You win/.test(title), `${c.verdict} | ${title}`);
  }
  check(`[${tag}] ${label}: tone matches the result`, c.tone === (won ? "pg-win" : "pg-loss"), c.tone);
  check(`[${tag}] ${label}: 1-3 stars, all of them MY players`, c.stars.length >= 1 && c.stars.length <= 3 && c.stars.every((name) => roster.includes(name)), `${c.stars.join(", ")}`);
  check(`[${tag}] ${label}: every star is in the box score on screen`, c.stars.length > 0 && (await page.$eval("#box-score", (el, names) => names.every((n) => el.textContent.includes(n)), c.stars)), c.stars.join(", "));
  check(`[${tag}] ${label}: no stat figure is split from its unit across lines`, await unbroken(page));
  check(`[${tag}] ${label}: no horizontal overflow`, await noOverflow(page));
}

for (const [width, height, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  // Cheap role players only, so the account roster fits under the season salary cap.
  await page.evaluate(async () => {
    const acc = await import("/js/data/account.js");
    const players = await import("/js/data/players.js");
    const coaches = await import("/js/data/coaches.js");
    const market = await import("/js/engine/seasonMarket.js");
    const a = acc.createAccount("QA 教练");
    a.playerIds = players.PLAYERS.filter((p) => players.overall(p) >= 55 && players.overall(p) <= 70)
      .map((p) => ({ id: p.id, sal: market.playerSalary(p) })).sort((x, y) => x.sal - y.sal).slice(0, 15).map((p) => p.id);
    a.onboardingDone = true; a.gold = 500; a.fragments = 200;
    a.coachId = coaches.COACHES[0].id; a.coachIds = [a.coachId];
    acc.saveAccount(a); acc.setActiveAccountId(a.id);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await homeActive(page);
  await page.click('.mode-card[data-mode="season"]');
  await page.waitForSelector("#screen-season.active");
  await page.click("#btn-season-roster-account");
  await page.waitForFunction(() => !document.querySelector("#btn-season-start").disabled, null, { timeout: 10000 });
  await page.click("#btn-season-start");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  const backToHub = async () => {
    await page.click("#btn-result-continue");
    await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  };

  // ---- one simulated game from the hub
  await page.click("#btn-season-sim-one");
  await onResult(page);
  await checkSingle(page, tag, "sim one");
  await shoot(page, `${OUT}/${tag}-single.png`);

  // ---- "模拟下一场" from the result screen: still a single-game card, freshly painted
  const before = (await card(page)).all;
  await page.click("#btn-again");
  await page.waitForFunction((prev) => {
    const el = document.querySelector("#result-rewards .pg-card");
    return el && el.textContent.replace(/\s+/g, " ").trim() !== prev;
  }, before, { timeout: 20000 }).catch(() => {});
  await checkSingle(page, tag, "sim next (from the result screen)");

  // ---- a stretch: "模拟一周" -> ONE summary card, matching the standings it produced
  await backToHub();
  const recBefore = (await savedSeason(page)).record;
  await page.click("#btn-season-sim-week");
  await onResult(page);
  const recAfter = (await savedSeason(page)).record;
  const batch = await card(page);
  const bm = batch.verdict.match(/^(\d+) 场 · (\d+) 胜 (\d+) 负$/);
  const dW = recAfter.w - recBefore.w;
  const dL = recAfter.l - recBefore.l;
  check(`[${tag}] sim week: ONE card for the whole stretch, and it's the summary card`, batch.visible && batch.count === 1 && /本段收获/.test(batch.kicker), JSON.stringify({ n: batch.count, k: batch.kicker }));
  check(`[${tag}] sim week: more than one game was folded`, !!bm && +bm[1] > 1, batch.verdict);
  check(`[${tag}] sim week: the card's record is exactly what the standings gained`, !!bm && +bm[2] === dW && +bm[3] === dL && +bm[1] === dW + dL, `${batch.verdict} vs standings +${dW}-${dL}`);
  const diffText = batch.all.match(/净胜分 ([+-]?\d+)/);
  check(`[${tag}] sim week: the point differential is exactly what the standings gained (points for - against)`,
    !!diffText && +diffText[1] === (recAfter.pf - recBefore.pf) - (recAfter.pa - recBefore.pa), `${diffText?.[1]} vs ${(recAfter.pf - recBefore.pf) - (recAfter.pa - recBefore.pa)}`);
  check(`[${tag}] sim week: tone follows the stretch's record`, batch.tone === (dW >= dL ? "pg-win" : "pg-loss"), batch.tone);
  const rosterNow = (await savedSeason(page)).roster;
  check(`[${tag}] sim week: 1-3 leaders, all MY players, with per-game lines`, batch.stars.length >= 1 && batch.stars.length <= 3 && batch.stars.every((name) => rosterNow.includes(name)) && /场均/.test(batch.all), batch.stars.join(", "));
  // Measure the layout itself (an HTML-string test can't see a line break): "出场 5 场" is ONE line box.
  const gp = await page.$$eval("#result-rewards .pg-star", (rows) => rows.map((row) => {
    const chunk = row.querySelector(".pg-nowrap");
    if (!chunk) return { ok: false, why: `no .pg-nowrap in ${row.querySelector(".pg-who span")?.outerHTML.slice(0, 120)}` };
    const range = document.createRange();
    range.selectNodeContents(chunk);
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    return { ok: lines === 1, why: `${lines} lines, white-space=${getComputedStyle(chunk).whiteSpace}` };
  }));
  check(`[${tag}] sim week: "出场 N 场" never breaks across lines`, gp.length > 0 && gp.every((g) => g.ok), gp.map((g) => g.why).join(" | "));
  check(`[${tag}] sim week: best night is named`, /单场最佳：/.test(batch.all), batch.all.slice(0, 120));
  check(`[${tag}] sim week: no stat figure is split from its unit across lines`, await unbroken(page));
  check(`[${tag}] sim week: no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-batch.png`);

  // ---- a hand-coached game (autopilot on so breaks don't wait for a click; a fake clock fast-forwards it)
  await backToHub();
  await page.click("#btn-season-play");
  await page.waitForSelector("#screen-setup.active", { timeout: 10000 });
  await page.clock.install();
  await page.click("#btn-setup-confirm");
  await page.waitForSelector("#screen-game.active", { timeout: 10000 });
  for (const sel of ["#btn-auto-offense", "#btn-auto-defense"]) await page.click(sel);
  for (let i = 0; i < 2; i++) await page.click("#btn-speed");
  // Pause it once ourselves, so the resume path below runs EVERY time (injuries only hit sometimes).
  await page.click("#btn-pause-sim");
  // Autopilot only covers quarter/half breaks BY DESIGN: an injury or a called timeout stops the game
  // until the coach presses "继续模拟". So do what a coach would: press it whenever the game has stopped.
  const resumes = [];
  const resultUp = () => page.evaluate(() => document.querySelector("#screen-result")?.classList.contains("active"));
  for (let i = 0; i < 60 && !(await resultUp()); i++) {
    await page.clock.runFor(30_000);
    const stopped = await page.evaluate(() => {
      const btn = document.querySelector("#btn-pause-sim");
      return btn && !btn.hidden && btn.textContent.trim() === "继续模拟" ? (document.querySelector("#pause-hint")?.textContent || "paused").trim().slice(0, 30) : null;
    });
    if (stopped) { resumes.push(stopped); await page.click("#btn-pause-sim"); }
  }
  const liveDone = await resultUp();
  check(`[${tag}] live: a stopped game was resumed (our own pause at least)`, resumes.length >= 1, resumes.join(" | "));
  check(`[${tag}] live: the hand-coached game reached the result screen`, liveDone,
    liveDone ? (resumes.length ? `resumed ${resumes.length}x: ${resumes.join(" | ")}` : "") : await page.evaluate(() => `screens=${[...document.querySelectorAll(".screen.active")].map((el) => el.id)} pauseBtn=${document.querySelector("#btn-pause-sim")?.textContent} dialog=${!!document.querySelector("dialog[open]")}`));
  if (!liveDone) {
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
    continue;
  }
  await checkSingle(page, tag, "live game");
  await shoot(page, `${OUT}/${tag}-live.png`);

  // ---- English: the next card is English through and through
  await backToHub();
  await page.evaluate(() => document.querySelector("#btn-lang").click());
  await page.waitForTimeout(300);
  await page.click("#btn-season-sim-one");
  await onResult(page);
  const en = await card(page);
  check(`[${tag}] English: the card is English, no Chinese`, /Post-game/.test(en.kicker) && /Stars of the game/.test(en.all) && !CJK.test(en.all), en.all.slice(0, 160));
  check(`[${tag}] English: verdict reads Win/Loss`, /^(Win|Loss) \d+-\d+$/.test(en.verdict), en.verdict);

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
