// Season Awards 2.0 in a real browser: a 20-game My Team season played to the end, then the awards tab.
// Checks the cards and tables render real numbers out of 20 games, a card opens to its details and reasoning, nothing
// overflows the page, and the awards survive a reload. Desktop 1280 + mobile 390.
// Usage: node scripts/qa/season-awards.mjs /tmp/cls-qa/awards [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/awards";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const played = (page) => page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("cls_myteam_season_v1") || "null");
  const r = st?.standings?.[st.userTeamId];
  return r ? r.w + r.l : -1;
});

/** An account whose ten best distinct players make the lineup (same seed as my-team-season.mjs). */
const seed = (page) => page.evaluate(async () => {
  const { PLAYERS, overall } = await import("/js/data/players.js");
  const { createAccount, getAccount, saveAccount, setActiveAccountId } = await import("/js/data/account.js");
  const seen = new Set();
  const ids = [];
  for (const p of [...PLAYERS].sort((a, b) => overall(b) - overall(a))) { if (!seen.has(p.bref)) { seen.add(p.bref); ids.push(p.id); } if (ids.length === 10) break; }
  const acc = createAccount("QA 评奖");
  saveAccount({ ...getAccount(acc.id), playerIds: ids, coachId: null });
  setActiveAccountId(acc.id);
});

/** The clubhouse "Edit lineup" link: where a My Team season starts and resumes. */
async function openEditor(page) {
  await page.click('.home-tab[data-category="players"]');
  await page.click('.mtc-link[data-act="edit-lineup"]');
  await page.waitForSelector("#screen-my-team-lineup.active");
}

async function playSeason(page) {
  await openEditor(page);
  await page.click('#screen-my-team-lineup.active [data-act="start-quick"]');
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 8000 });
  await page.click("#app-confirm-accept");
  await page.waitForSelector("#screen-season.active #season-hub-panel:not([hidden])", { timeout: 15000 });
  for (let i = 0; i < 8 && (await played(page)) < 20; i++) {
    if (await page.$("#screen-result.active")) { await page.click("#btn-result-continue"); await page.waitForSelector("#screen-season.active"); }
    const wk = await page.$("#btn-season-sim-week");
    if (!wk || await wk.evaluate((b) => b.disabled || b.hidden)) break;
    const was = await played(page);
    await wk.click();
    await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 2500 }).then(() => page.click("#app-confirm-accept")).catch(() => {});
    await page.waitForFunction((n) => {
      const st = JSON.parse(localStorage.getItem("cls_myteam_season_v1") || "null");
      const r = st?.standings?.[st.userTeamId];
      return r && r.w + r.l > n;
    }, was, { timeout: 30000 }).catch(() => {});
  }
  if (await page.$("#screen-result.active")) { await page.click("#btn-result-continue"); await page.waitForSelector("#screen-season.active"); }
}

for (const [w, h, tag] of [[1280, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await reload(page);
  await seed(page);
  await reload(page);
  await playSeason(page);
  check(`[${tag}] the season ends at exactly 20 games`, (await played(page)) === 20);

  await page.click('[data-season-tab="awards"]');
  await page.waitForSelector("#season-awards .aw-board", { timeout: 8000 });
  const board = await text(page, "#season-awards");
  check(`[${tag}] five player awards + coach render as cards`, (await page.$$("#season-awards .aw-card")).length === 6, String((await page.$$("#season-awards .aw-card")).length));
  check(`[${tag}] All-NBA x3 + All-Defense x2 tables`, (await page.$$("#season-awards .aw-table")).length === 5);
  check(`[${tag}] games read out of 20, never 82`, /\d+\/20/.test(board) && !/\/82\b/.test(board));
  check(`[${tag}] no NaN / undefined anywhere`, !/NaN|undefined/.test(board));
  check(`[${tag}] nothing called PER`, !/\(PER\)/.test(board));
  check(`[${tag}] team panel shows a record and a rank`, /\d+-\d+/.test(await text(page, '.aw-card[data-award="mvp"] .aw-team')) && /第 \d+/.test(await text(page, '.aw-card[data-award="mvp"] .aw-team')));
  check(`[${tag}] portraits are real images`, await page.$$eval("#season-awards .aw-who img", (imgs) => imgs.length >= 5 && imgs.every((i) => i.getAttribute("src"))));
  const mipPrev = await text(page, '.aw-card[data-award="mip"] .aw-prev').catch(() => "");
  check(`[${tag}] the MIP card shows the two real seasons it compared`, /真实数据：\d{4} .*→ \d{4} /.test(mipPrev), mipPrev);
  const mipBox = await page.$eval('.aw-card[data-award="mip"] > summary', (el) => {
    const r = el.getBoundingClientRect();
    const kids = [...el.children].map((c) => c.getBoundingClientRect());
    return { w: r.width, overlap: kids.some((a, i) => kids.some((b, j) => j > i && a.width && b.width && a.height && b.height && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)) };
  });
  check(`[${tag}] the MIP summary row has no overlapping pieces`, !mipBox.overlap, JSON.stringify(mipBox));
  check(`[${tag}] page does not overflow sideways (tables scroll inside their box)`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-awards.png`);

  await page.click('.aw-card[data-award="mvp"] > summary');
  const mvpOpen = await page.$eval('.aw-card[data-award="mvp"]', (d) => d.open);
  const detail = await text(page, '.aw-card[data-award="mvp"] .aw-body');
  check(`[${tag}] opening the MVP card shows every stat and the reasoning`, mvpOpen && /依据/.test(detail) && /真实命中/.test(detail) && /出场门槛/.test(detail), detail.slice(0, 80));
  await page.click('.aw-card[data-award="mip"] > summary').catch(() => {});
  await page.$eval('.aw-card[data-award="mvp"]', (d) => d.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${OUT}/${tag}-awards-open.png` });

  await reload(page);
  await openEditor(page);
  await page.click('#screen-my-team-lineup.active [data-act="resume-season"]');
  await page.waitForSelector("#screen-season.active #season-hub-panel:not([hidden])", { timeout: 15000 }).catch(() => {});
  const tab = await page.$('[data-season-tab="awards"]');
  if (tab) {
    await tab.click();
    await page.waitForSelector("#season-awards .aw-board", { timeout: 8000 }).catch(() => {});
    check(`[${tag}] after a reload the saved awards still render the same cards`, (await page.$$("#season-awards .aw-card")).length === 6);
  } else {
    check(`[${tag}] after a reload the saved awards still render the same cards`, false, "could not get back to the season");
  }
  const toPlayoffs = await page.$("#btn-season-to-playoffs");
  check(`[${tag}] the enter-playoffs button is still there`, !!toPlayoffs);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" ; "));
  await page.close();
}

await browser.close();
const fails = out.filter((l) => l.startsWith("FAIL"));
console.log(`\n${fails.length} failing / ${out.length} total`);
process.exit(fails.length ? 1 : 0);
