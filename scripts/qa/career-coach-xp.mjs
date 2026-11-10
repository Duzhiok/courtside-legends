// Browser E2E for C5 (coach XP and perks). A REAL time-travel career, played through the real buttons.
// Every number on screen is reconciled against the SAVE:
//   * the post-game "教练成长" XP must equal what root.coach really gained (levels included);
//   * the stretch card must equal the whole stretch's gain;
//   * spending a perk point on HQ must land in the save, repaint the card, and move the salary line;
//   * the tactician perk must reach the season the engine plays (season.coachPerkShot).
// Usage: [QA_VIEWPORT=desktop|mobile] node scripts/qa/career-coach-xp.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, onResult, overflowers, settled, shoot } from "./lib/page.mjs";
import { openCareer, resumeToHub } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/coach-xp";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

/** Lifetime XP of a coach: every finished level (level N costs N * 100) plus the bar. */
const lifetime = (coach) => {
  let total = coach.xp;
  for (let level = 1; level < coach.level; level++) total += level * 100;
  return total;
};
const savedRoot = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cls_root_v3")));
const coachCard = async (page) => {
  await settled(page);
  return page.evaluate(() => {
    const box = document.querySelector("#result-rewards");
    const titles = [...box.querySelectorAll(".pg-section-title")].map((el) => el.textContent.trim());
    const line = box.querySelector(".pg-coach-xp")?.textContent.replace(/\s+/g, " ").trim() || "";
    return { titles, line, xp: Number((line.match(/\+(\d+) XP/) || [])[1]), kicker: box.querySelector(".pg-kicker")?.textContent.trim() };
  });
};
const backToHub = async (page) => {
  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
};
const openHq = async (page) => {
  await page.evaluate(() => document.querySelector("#btn-season-back")?.click());
  await homeActive(page);
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="timeTravel"]').click());
  await page.click('[data-career-era="historical"]');
  await page.waitForSelector("#tt-perks:not([hidden])", { timeout: 20000 });
  await settled(page);
};
const perkCard = (page) => page.evaluate(() => {
  const body = document.querySelector("#tt-perks-body");
  return {
    text: body.textContent.replace(/\s+/g, " ").trim(),
    rows: [...body.querySelectorAll("[data-perk]")].map((b) => ({ id: b.dataset.perk, state: b.dataset.state, disabled: b.disabled })),
    salary: document.querySelector("#time-travel-finance-summary")?.textContent || "",
  };
});

for (const viewport of (process.env.QA_VIEWPORT ? [process.env.QA_VIEWPORT] : ["desktop", "mobile"])) {
  const size = viewport === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 };
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const tag = viewport;

  await openCareer(page, BASE, {});
  let before = await savedRoot(page);
  check(`[${tag}] a new career starts at Lv.1 with no XP`, before.coach.level === 1 && before.coach.xp === 0, JSON.stringify({ level: before.coach.level, xp: before.coach.xp }));

  // one game: the card's XP is exactly what the save gained
  await page.click("#btn-season-sim-one");
  await onResult(page);
  let after = await savedRoot(page);
  let card = await coachCard(page);
  const gained = lifetime(after.coach) - lifetime(before.coach);
  check(`[${tag}] one game: the card has a 教练成长 section`, card.titles.includes("教练成长"), JSON.stringify(card.titles));
  check(`[${tag}] one game: the card's XP equals the save's gain`, card.xp === gained && gained > 0, `card ${card.xp}, save ${gained}`);
  check(`[${tag}] one game: the card says why (赢球 or 输球也有收获)`, /赢球 \+\d+|输球也有收获 \+\d+/.test(card.line), card.line);
  check(`[${tag}] one game: no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  await page.$eval("#result-rewards", (el) => el.scrollIntoView());
  await shoot(page, `${OUT}/${tag}-postgame.png`);

  // a week: one stretch card, the whole stretch's XP
  await backToHub(page);
  before = after;
  await page.click("#btn-season-sim-week");
  await onResult(page);
  after = await savedRoot(page);
  card = await coachCard(page);
  const week = lifetime(after.coach) - lifetime(before.coach);
  check(`[${tag}] sim week: the stretch card sums the coach's XP`, /本段收获/.test(card.kicker || "") && card.xp === week && week > 0, `card ${card.xp}, save ${week}`);

  // HQ: two points to spend (seeded), spend them, the save and the screen follow
  await page.evaluate(async () => {
    const sr = await import("/js/data/saveRoot.js");
    const root = JSON.parse(localStorage.getItem("cls_root_v3"));
    sr.writeRootSave({ ...root, coach: { ...root.coach, perkPoints: 2 } }, localStorage);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await resumeToHub(page);
  await openHq(page);
  let perks = await perkCard(page);
  check(`[${tag}] HQ: four perk lines, all spendable, points announced`, perks.rows.length === 4 && perks.rows.every((r) => r.state === "ready" && !r.disabled) && /2 点天赋点可分配/.test(perks.text), JSON.stringify(perks.rows));
  // The header badge is how a player with points in hand finds out: the card itself is far down the page.
  const badge = () => page.$eval(".tt-perk-full", (el) => el.textContent.trim()).catch(() => null);
  check(`[${tag}] HQ header: a badge announces the 2 points`, (await badge()) === "2 点可用", `${await badge()}`);
  const salaryBefore = Number((perks.salary.match(/年薪 ¤(\d+)/) || [])[1]);
  await page.click('[data-perk="tactics"]');
  await page.click('[data-perk="negotiation"]');
  const root = await savedRoot(page);
  perks = await perkCard(page);
  check(`[${tag}] HQ: both points landed in the save`, root.coach.perkPoints === 0 && root.coach.perks.tactics === 1 && root.coach.perks.negotiation === 1, JSON.stringify(root.coach.perks));
  check(`[${tag}] HQ header: the badge is gone once the points are spent`, (await badge()) === null, `${await badge()}`);
  check(`[${tag}] HQ: with no points left nothing is clickable`, perks.rows.every((r) => r.disabled), JSON.stringify(perks.rows));
  check(`[${tag}] HQ: the card now quotes the level-1 effects`, /命中率 \+0\.5%/.test(perks.text) && /年薪 \+¤1/.test(perks.text), perks.text.slice(0, 160));
  const salaryAfter = Number((perks.salary.match(/年薪 ¤(\d+)/) || [])[1]);
  check(`[${tag}] HQ: negotiator moved the salary line by ¤1`, salaryAfter === salaryBefore + 1, `${salaryBefore} -> ${salaryAfter}`);
  check(`[${tag}] HQ: no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  await page.$eval("#tt-perks", (el) => el.scrollIntoView());
  await shoot(page, `${OUT}/${tag}-hq-perks.png`);

  // English HQ
  await page.click("#btn-lang");
  await settled(page);
  perks = await perkCard(page);
  check(`[${tag}] HQ in English has no Chinese in the perk card`, !CJK.test(perks.text), perks.text.slice(0, 120));
  await page.click("#btn-lang");

  // the tactician perk reaches the season the engine plays
  await page.click("#btn-time-travel-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  await page.click("#btn-season-sim-one");
  await onResult(page);
  const played = await savedRoot(page);
  check(`[${tag}] the season carries the tactician bonus into games`, played.leagueCareer.season.coachPerkShot === 0.005, String(played.leagueCareer.season.coachPerkShot));
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
