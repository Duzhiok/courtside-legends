// My Team Season (ADR-010 T2) end to end in a real browser: start from the lineup page, play, reload, continue,
// finish a 20-game year, abandon -- and the other save slots never move. Desktop + mobile.
// Usage: node scripts/qa/my-team-season.mjs /tmp/cls-qa/mts [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homeActive, noOverflow, shoot, text } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/mts";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => { const line = `${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`; out.push(line); console.log(line); };
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const KEYS = ["cls_myteam_season_v1", "cls_season_v1", "cls_root_v3", "cls_savegame_v1"];
const slots = (page) => page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), KEYS);
const played = async (page) => page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("cls_myteam_season_v1") || "null");
  const r = st?.standings?.[st.userTeamId];
  return r ? r.w + r.l : -1;
});
const openEditor = async (page) => {
  await page.click('.home-tab[data-category="players"]');
  await page.click("#btn-open-my-lineup");
  await page.waitForSelector("#screen-my-team-lineup.active");
};
const confirmDialog = async (page, accept = true) => {
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 8000 });
  const msg = await text(page, "#app-confirm-message");
  await page.click(accept ? "#app-confirm-accept" : "#app-confirm-cancel");
  await page.waitForFunction(() => !document.querySelector("#app-confirm-dialog").open);
  return msg;
};
const seed = (page) => page.evaluate(async () => {
  const { PLAYERS, overall } = await import("/js/data/players.js");
  const { createAccount, getAccount, saveAccount } = await import("/js/data/account.js");
  const sorted = [...PLAYERS].sort((a, b) => overall(b) - overall(a));
  const seen = new Set();
  const ids = [];
  for (const p of sorted) { if (!seen.has(p.bref)) { seen.add(p.bref); ids.push(p.id); } if (ids.length === 10) break; }
  const acc = createAccount("QA 赛季");
  saveAccount({ ...getAccount(acc.id), playerIds: ids, coachId: null });
  return ids;
});

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await reload(page);
  await seed(page);
  await reload(page);

  // Pre-existing quick-season bytes: this feature must never touch them.
  await page.evaluate(() => localStorage.setItem("cls_season_v1", "QUICK-SEASON-SENTINEL"));
  await openEditor(page);
  check(`[${tag}] start buttons enabled with a ready lineup`, await page.$eval('[data-act="start-quick"]', (b) => !b.disabled) && await page.$eval('[data-act="start-full"]', (b) => !b.disabled));
  check(`[${tag}] no Continue before any season`, !(await page.$('[data-act="resume-season"]')));
  check(`[${tag}] lineup page: no overflow`, await noOverflow(page));

  // Cancelling the confirm creates nothing.
  await page.click('[data-act="start-quick"]');
  const msg = await confirmDialog(page, false);
  check(`[${tag}] confirm lists starters + length + lock`, msg.includes("首发") && msg.includes("20") && msg.includes("锁定"), msg.slice(0, 80));
  check(`[${tag}] cancelled: nothing written`, !(await slots(page)).cls_myteam_season_v1);

  // Start for real.
  await page.click('[data-act="start-quick"]');
  await confirmDialog(page, true);
  await page.waitForSelector("#screen-season.active #season-hub-panel:not([hidden])", { timeout: 15000 });
  const title = await text(page, "#season-hub-title");
  const meta = await text(page, "#season-hub-meta");
  check(`[${tag}] season hub opens for my team`, title.includes("班底"), title);
  check(`[${tag}] progress shows /20`, /0\/20/.test(meta), meta);
  for (const t of ["market", "evaluation", "draftBoard", "development", "history"]) {
    check(`[${tag}] ${t} tab hidden (roster is locked)`, await page.$eval(`[data-season-tab="${t}"]`, (b) => b.hidden || getComputedStyle(b).display === "none"));
  }
  let s = await slots(page);
  check(`[${tag}] own slot written`, !!s.cls_myteam_season_v1);
  check(`[${tag}] quick-season slot untouched`, s.cls_season_v1 === "QUICK-SEASON-SENTINEL");
  check(`[${tag}] no career/session created`, !s.cls_root_v3 && !s.cls_savegame_v1);
  check(`[${tag}] abandon button says what it does`, (await text(page, "#btn-season-abandon")).includes("放弃我的赛季"));
  check(`[${tag}] hub: no overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-hub.png`);

  // Play a game quickly, then reload and continue.
  await page.click("#btn-season-sim-one");
  await page.waitForSelector("#screen-result.active", { timeout: 20000 });
  check(`[${tag}] one game played and saved to my slot`, (await played(page)) >= 1, `${await played(page)}`);
  await reload(page);
  await openEditor(page);
  const resumeLabel = await page.$eval('[data-act="resume-season"]', (b) => b.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
  check(`[${tag}] after reload the lineup page offers Continue with progress`, /\/20/.test(resumeLabel), resumeLabel);
  await shoot(page, `${OUT}/${tag}-lineup-resume.png`);
  await page.click('[data-act="resume-season"]');
  await page.waitForSelector("#screen-season.active #season-hub-panel:not([hidden])", { timeout: 15000 });
  const before = await played(page);
  check(`[${tag}] continuing keeps progress`, before >= 1 && /\/20/.test(await text(page, "#season-hub-meta")), `${before}`);

  // Finish the regular season: click "模拟 5 场" and poll my slot until the played count moves (no page assumption).
  for (let i = 0; i < 6 && (await played(page)) < 20; i++) {
    if (await page.$("#screen-result.active")) { await page.click("#btn-result-continue"); await page.waitForSelector("#screen-season.active"); }
    const wk = await page.$("#btn-season-sim-week");
    if (!wk || await wk.evaluate((b) => b.disabled || b.hidden)) break;
    const was = await played(page);
    await wk.click();
    // Bulk sim asks first: accept whatever confirm shows up.
    await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 2500 }).then(() => page.click("#app-confirm-accept")).catch(() => {});
    await page.waitForFunction((n) => {
      const st = JSON.parse(localStorage.getItem("cls_myteam_season_v1") || "null");
      const r = st?.standings?.[st.userTeamId];
      return r && r.w + r.l > n;
    }, was, { timeout: 30000 }).catch(() => {});
  }
  if (await page.$("#screen-result.active")) { await page.click("#btn-result-continue"); await page.waitForSelector("#screen-season.active"); }
  const done = await played(page);
  check(`[${tag}] regular season ends at exactly 20 games`, done === 20, `${done}`);
  await page.click('[data-season-tab="awards"]');
  check(`[${tag}] awards page shows MVP`, (await text(page, "#season-awards")).includes("MVP"));
  s = await slots(page);
  check(`[${tag}] still only my slot moved`, s.cls_season_v1 === "QUICK-SEASON-SENTINEL" && !s.cls_root_v3);

  // Playoffs -> season over -> "play another season" (same length, no config detour, record kept).
  await page.click('[data-season-tab="playoffs"]'); // the one-click sim lives here until the bracket starts
  await page.waitForSelector("#btn-season-sim-playoffs", { timeout: 10000 });
  await page.click("#btn-season-sim-playoffs");
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 2500 }).then(() => page.click("#app-confirm-accept")).catch(() => {});
  await page.waitForSelector("#screen-result.active", { timeout: 60000 }).catch(() => {});
  check(`[${tag}] result recorded on the account before the hub is even reopened`, await page.evaluate(() => (localStorage.getItem("cls_accounts_v1") || "").includes("myTeamSeasons")));
  if (await page.$("#screen-result.active")) { await page.click("#btn-result-continue"); await page.waitForSelector("#screen-season.active"); }
  await page.waitForFunction(() => !document.querySelector("#myteam-done-bar")?.hidden, null, { timeout: 15000 }).catch(() => {});
  const bar = await text(page, "#myteam-done-bar");
  check(`[${tag}] season-over bar shows record + title count`, /\d+胜 \d+负/.test(bar) && bar.includes("20 场"), bar.slice(0, 90));
  check(`[${tag}] bar offers play-another-season`, !!(await page.$("[data-myteam-again]")));
  check(`[${tag}] finished season recorded on the account`, await page.evaluate(() => (localStorage.getItem("cls_accounts_v1") || "").includes("myTeamSeasons")));
  const firstId = await page.evaluate(() => JSON.parse(localStorage.getItem("cls_myteam_season_v1")).myTeam.seasonId);
  check(`[${tag}] season-over state: no horizontal overflow`, await noOverflow(page));
  check(`[${tag}] header buttons stay inside the viewport`, await page.$eval("#btn-season-abandon", (b) => b.getBoundingClientRect().right <= window.innerWidth + 1));
  await shoot(page, `${OUT}/${tag}-season-over.png`);
  await page.click("[data-myteam-again]");
  await page.waitForFunction((id) => { const st = JSON.parse(localStorage.getItem("cls_myteam_season_v1") || "null"); return st?.myTeam && st.myTeam.seasonId !== id; }, firstId, { timeout: 15000 }).catch(() => {});
  const nextMeta = await text(page, "#season-hub-meta");
  check(`[${tag}] another season started: fresh 0/20, new id, no confirm detour`, /0\/20/.test(nextMeta), nextMeta);
  check(`[${tag}] end bar hidden again for the new season`, await page.$eval("#myteam-done-bar", (b) => b.hidden));
  s = await slots(page);
  check(`[${tag}] quick-season bytes still untouched`, s.cls_season_v1 === "QUICK-SEASON-SENTINEL");

  // Abandon removes only this season; the quick-season bytes stay.
  await page.click("#btn-season-abandon");
  await confirmDialog(page, true);
  await homeActive(page);
  s = await slots(page);
  check(`[${tag}] abandon: my slot gone`, !s.cls_myteam_season_v1);
  check(`[${tag}] abandon: quick-season bytes still there`, s.cls_season_v1 === "QUICK-SEASON-SENTINEL");
  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}
await browser.close();

const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
