// Browser QA: GM Executive Dynasty (From Employee to Empire, workstream F).
// Drives the ?gm-business=1 dev entry end to end: the 1996 Vancouver scenario,
// ticket pricing, a sponsorship signing, a future-knowledge clue reveal, three
// settled seasons with fixture results, and the minority-ownership opportunity.
// The season results are entered through the dev-entry form (labelled as such in
// the UI); the production wiring will feed real season-engine results instead.
// Usage: node scripts/qa/gm-business.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/cls-qa/gm-business";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

function businessState(page) {
  return page.evaluate(() => {
    const body = document.querySelector("#gm-business-body")?.textContent || "";
    return {
      active: document.querySelector("#screen-gm-business")?.classList.contains("active"),
      text: body,
      ticketButtons: [...document.querySelectorAll('[data-gm-action="ticket"]')].length,
      sponsorButtons: [...document.querySelectorAll('[data-gm-action="sponsor"]')].length,
      eventChoices: [...document.querySelectorAll('[data-gm-action="event-choice"]')].length,
      clueButtons: [...document.querySelectorAll('[data-gm-action="reveal-clue"]')].length,
    };
  });
}

async function settleSeason(page, wins, losses, playoffs = "", champion = false) {
  await page.fill("#gm-sim-wins", String(wins));
  await page.fill("#gm-sim-losses", String(losses));
  await page.selectOption("#gm-sim-playoffs", playoffs);
  await page.setChecked("#gm-sim-champion", champion);
  await page.click('[data-gm-action="advance-season"]');
  await page.waitForTimeout(300);
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}?gm-business=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#screen-gm-business")?.classList.contains("active"), null, { timeout: 60000 });
  let s = await businessState(page);
  check("dev entry opens the business screen", s.active);
  check("stage banner shows employed GM", s.text.includes("球队雇员"));
  check("scenario team is Vancouver 1996", s.text.includes("灰熊") && s.text.includes("1996"));
  check("personal and franchise money are separate panels", s.text.includes("球队经营") && s.text.includes("个人财富") && s.text.includes("分开的"));
  check("empty state fabricates no result", s.text.includes("还没有打完的赛季"));
  check("ticket price buttons render", s.ticketButtons === 5);
  check("sponsorship offers render", s.sponsorButtons === 3);
  check("business events render with choices", s.eventChoices > 0);
  check("draft-board clue hides until revealed", s.clueButtons === 1 && !s.text.includes("Sleeper"));
  await page.screenshot({ path: `${OUT}/01-empty-desktop.png` });

  // Ticket pricing: $30 -> $45.
  await page.click('[data-gm-action="ticket"][data-price="45"]');
  s = await businessState(page);
  check("ticket price changes to $45", s.text.includes("平均票价 $45"));

  // Sponsorship: sign the first offer; the list shrinks by one.
  await page.click('[data-gm-action="sponsor"]');
  s = await businessState(page);
  check("sponsorship signs (one fewer offer)", s.sponsorButtons === 2);
  check("signed sponsor shows in deep management", s.text.includes("已签赞助"));

  // Future knowledge: reveal the draft-board clue (3 -> 2 points).
  await page.click('[data-gm-action="reveal-clue"]');
  s = await businessState(page);
  check("clue reveals after spending 1 knowledge point", s.clueButtons === 0 && s.text.includes("2 点"));
  check("clue content names candidates without leaking the sleeper", s.text.includes("记忆中的巅峰") || s.text.includes("记忆巅峰"));

  // Season 1: a losing year for a weak team.
  await settleSeason(page, 20, 62);
  s = await businessState(page);
  check("season 1 settles: last-season panel appears", s.text.includes("上赛季") && s.text.includes("20"));
  check("board report appears", s.text.includes("董事会报告"));

  // Season 2: a winning year + first-round playoff run.
  await settleSeason(page, 45, 37, "first-round");
  s = await businessState(page);
  check("season 2 settles: valuation moves", s.text.includes("球队估值"));

  // Season 3: a title run.
  await settleSeason(page, 58, 24, "finals", true);
  s = await businessState(page);
  check("title run promotes the GM to president", s.text.includes("篮球商业操盘手"));
  check("three seasons are recorded", (s.text.match(/上赛季/g) || []).length >= 1);
  await page.screenshot({ path: `${OUT}/02-three-seasons-desktop.png` });

  // Mobile: the dashboard stays usable at phone width.
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.goto(`${BASE}?gm-business=1`, { waitUntil: "domcontentloaded" });
  await mob.waitForFunction(() => document.querySelector("#screen-gm-business")?.classList.contains("active"), null, { timeout: 60000 });
  const m = await businessState(mob);
  check("mobile: business screen opens", m.active);
  check("mobile: decisions render", m.ticketButtons === 5 && m.sponsorButtons === 3);
  await mob.screenshot({ path: `${OUT}/03-empty-mobile.png` });
  await mob.close();
  await page.close();
} finally {
  await browser.close();
}
console.log(report.join("\n"));
const failed = report.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} checks passed`);
process.exit(failed ? 1 : 0);
