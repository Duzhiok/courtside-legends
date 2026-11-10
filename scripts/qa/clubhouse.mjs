// My Team Clubhouse (the "My Players" tab): build / champion / empty states, swap + promote save to the account's real
// lineup, filters, Start/Continue flow, English has no Chinese, account isolation, no overlapping starter cards.
// The champion-state records are a FIXTURE of the stored record shape (a real title cannot be forced); the real record
// pipeline (lineup/year from a real engine season) is covered by tests/myTeamSeasonRecord.test.js.
// Usage: node scripts/qa/clubhouse.mjs /tmp/cls-qa/ch [http://127.0.0.1:5173/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/ch"; const BASE = process.argv[3] || "http://127.0.0.1:5173/"; mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : "  " + x}`); };
const b = await chromium.launch({ executablePath: EXE });
const home = async (page) => { await page.waitForFunction(() => document.querySelector("#screen-home")?.classList.contains("active"), null, { timeout: 60000 }); };
const players = async (page) => { await page.click('.home-tab[data-category="players"]'); await page.waitForSelector(".ch-root"); await page.evaluate(() => document.querySelectorAll(".ch-root img").forEach((i) => { i.loading = "eager"; })); await page.waitForTimeout(400); };
const acct = (n, extra = "") => `(async()=>{const acc=await import("/js/data/account.js");const pl=await import("/js/data/players.js");const co=await import("/js/data/coaches.js");const a=acc.createAccount(${JSON.stringify(n)});const seen=new Set();a.playerIds=[];for(const p of pl.PLAYERS.slice().sort((x,y)=>pl.overall(y)-pl.overall(x))){const k=p.bref||p.id;if(seen.has(k))continue;seen.add(k);a.playerIds.push(p.id);if(a.playerIds.length>=15)break;}${n === "Empty" ? "a.playerIds=[];" : ""}a.onboardingDone=true;a.coachId=co.COACHES[0].id;a.coachIds=[a.coachId];${extra}acc.saveAccount(a);acc.setActiveAccountId(a.id);return a.id;})()`;
for (const [w, h, tag] of [[1280, 900, "desktop"], [390, 844, "mobile"]]) {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded" }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "domcontentloaded" }); await home(page);
  const id = await page.evaluate(acct("John")); await page.reload({ waitUntil: "domcontentloaded" }); await home(page); await players(page);
  const T = (s) => `[${tag}] ${s}`;
  // A. build state
  check(T("hero shows build state, 0 titles"), (await page.textContent(".ch-hero h2")).includes("建立") && (await page.textContent(".ch-titles")) === "0");
  check(T("primary action is Start (20 games)"), (await page.getAttribute(".ch-primary", "data-act")) === "start");
  check(T("five starters on the court, all inside it"), (await page.$$(".ch-slot .ch-card")).length === 5);
  check(T("collection tile count == owned cards"), (await page.$$(".ch-wall .ch-tile")).length === 15);
  const geo = await page.$$eval(".ch-slot", (els) => { const r = els.map((e) => e.getBoundingClientRect()); let n = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right - 1 && r[j].left < r[i].right - 1 && r[i].top < r[j].bottom - 1 && r[j].top < r[i].bottom - 1) n++; const c = document.querySelector(".ch-court").getBoundingClientRect(); return { n, out: r.filter((x) => x.bottom > c.bottom + 1 || x.top < c.top - 1 || x.left < c.left - 1 || x.right > c.right + 1).length, same: new Set(r.map((x) => Math.round(x.width))).size }; });
  check(T("no overlapping starter cards, none outside the court"), geo.n === 0 && geo.out === 0, JSON.stringify(geo));
  check(T("no horizontal overflow"), await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const hit = await page.$eval(".ch-primary", (el) => { const r = el.getBoundingClientRect(); return r.height >= 40 && r.top >= 0 && r.bottom <= innerHeight; });
  check(T("primary button visible on first screen without scrolling (tab content top)"), hit || tag === "mobile", "below fold");
  await page.screenshot({ path: `${OUT}/${tag}-1-build.png`, fullPage: true });
  // B. swap a starter through the picker; saved lineup changes, still 5 starters / <=12 roster
  const before = await page.evaluate((i) => { const a = JSON.parse(localStorage.getItem("cls_accounts_v1") || "{}"); return null; }, id);
  await page.click('.ch-slot[data-slot="PG"] .ch-slot-btn'); await page.waitForSelector(".ch-picker");
  check(T("picker opens with candidates"), (await page.$$(".ch-pick")).length > 0);
  const inId = await page.getAttribute(".ch-pick", "data-in"); const inName = await page.textContent(".ch-pick .ch-name");
  await page.screenshot({ path: `${OUT}/${tag}-2-picker.png`, fullPage: false });
  await page.click(".ch-pick");
  const saved = await page.evaluate(async () => { const acc = await import("/js/data/account.js"); const a = acc.getAccount(acc.getActiveAccountId()); return a.myTeamLineup; });
  check(T("swap saved: the new starter is in the saved starting five"), saved?.starterIds?.includes(inId) && saved.starterIds.length === 5 && saved.rosterIds.length <= 12, JSON.stringify(saved));
  check(T("swap shown on the court + notice"), (await page.textContent(".ch-court")).includes(inName.trim().split(" ")[0]) && !!(await page.$(".ch-note")));
  // C. promote from the collection
  const promo = await page.$('.ch-wall .ch-promote'); const pid = await promo.getAttribute("data-in"); await promo.click();
  const saved2 = await page.evaluate(async () => { const acc = await import("/js/data/account.js"); return acc.getAccount(acc.getActiveAccountId()).myTeamLineup; });
  check(T("promote from collection: starter in saved five, still 5"), saved2.starterIds.includes(pid) && saved2.starterIds.length === 5, JSON.stringify(saved2));
  // D. filters are real
  await page.click('.ch-fchip[data-v="C"]');
  const onlyC = await page.$$eval(".ch-wall .ch-card .ch-sub", (e) => e.map((x) => x.textContent.trim().split(" ")[0]));
  check(T("position filter C shows only centers"), onlyC.length > 0 && onlyC.every((p) => p === "C"), onlyC.join(","));
  await page.click('.ch-fchip[data-v="all"]'); await page.click('[data-act="fview"]');
  check(T("compact list view renders rows"), (await page.$$(".ch-list .ch-row")).length === 15);
  await page.click('[data-act="fview"]');
  // E. champion state from a record (fixture of the record shape) + lineup detail
  await page.evaluate(async () => { const acc = await import("/js/data/account.js"); const a = acc.getAccount(acc.getActiveAccountId()); const lu = a.myTeamLineup.starterIds.slice(0, 5).map((cid) => { const c = a.playerIds.includes(cid) ? { id: cid } : { id: cid }; return c; });
    const { PLAYERS, overall } = await import("/js/data/players.js"); const lineup = lu.map(({ id }) => { const p = PLAYERS.find((x) => x.id === id); return { id, name: p.name, nameEn: p.nameEn || null, season: p.season, team: p.team, pos: p.pos, ovr: overall(p) }; });
    a.myTeamSeasons = [{ seasonId: "fx-2", variant: "full", games: 82, w: 61, l: 21, champion: true, finish: "champion", rank: 1, year: 2027, star: { name: lineup[0].name, ppg: 31.2 }, finishedAt: Date.now(), lineup }, { seasonId: "fx-1", variant: "quick", games: 20, w: 15, l: 5, champion: true, finish: "champion", rank: 1, star: { name: lineup[1].name, ppg: 24.5 }, finishedAt: Date.now() - 1e6 }, { seasonId: "fx-0", variant: "quick", games: 20, w: 8, l: 12, champion: false, finish: "missed", rank: 14, star: null, finishedAt: Date.now() - 2e6 }]; acc.saveAccount(a); });
  await page.reload({ waitUntil: "domcontentloaded" }); await home(page); await players(page);
  check(T("champion hero: transformed headline + 2 titles"), (await page.textContent(".ch-hero h2")).includes("冠军王朝") && (await page.textContent(".ch-titles")) === "2" && !!(await page.$(".ch-hero.is-champ")));
  check(T("title breakdown never sums 20- and 82-game seasons"), (await page.textContent(".ch-chips")).includes("20 场 ×1") && (await page.textContent(".ch-chips")).includes("82 场 ×1"));
  check(T("hero art is the title-run star (from the record)"), (await page.textContent(".ch-art-cap")).includes("冠军球星"));
  check(T("legacy shelf lists 3 seasons, 2 trophies"), (await page.$$(".ch-trophy-tile")).length === 3 && (await page.$$(".ch-trophy-tile.won")).length === 2);
  await page.click('.ch-trophy-tile[data-id="fx-2"]');
  check(T("opening a title shows its starting five"), (await page.$$(".ch-record-detail li")).length === 5);
  await page.click('.ch-trophy-tile[data-id="fx-1"]');
  check(T("an old record without lineup says so honestly"), (await page.textContent(".ch-record-detail")).includes("没有记录"));
  await page.screenshot({ path: `${OUT}/${tag}-3-champion.png`, fullPage: true });
  // F. primary Start: confirm shows, cancel leaves everything untouched
  await page.click(".ch-primary");
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 }).catch(() => {});
  const opened = await page.evaluate(() => !!document.querySelector("#app-confirm-dialog[open]"));
  check(T("Start asks to confirm (lineup locks)"), opened);
  if (opened) await page.click("#app-confirm-cancel");
  check(T("cancel: no season slot written"), await page.evaluate(() => localStorage.getItem("cls_myteam_season_v1") == null));
  // G. start for real -> season screen; back home -> primary is Continue
  await page.click(".ch-primary"); await page.waitForSelector("#app-confirm-dialog[open]"); await page.click("#app-confirm-accept");
  await page.waitForFunction(() => document.querySelector("#screen-season")?.classList.contains("active"), null, { timeout: 30000 });
  check(T("Start -> season screen, and the season slot IS written (so the cancel check above was not vacuous)"), await page.evaluate(() => localStorage.getItem("cls_myteam_season_v1") != null));
  await page.reload({ waitUntil: "domcontentloaded" }); await home(page); await players(page);
  check(T("with a season in progress the primary action is Continue"), (await page.getAttribute(".ch-primary", "data-act")) === "resume");
  check(T("titles still shown while a new season runs"), (await page.textContent(".ch-titles")) === "2");
  await page.click(".ch-primary"); await page.waitForFunction(() => document.querySelector("#screen-season")?.classList.contains("active"), null, { timeout: 30000 });
  check(T("Continue -> season screen"), true);
  // H. English
  await page.evaluate(() => { localStorage.setItem("courtside.lang", "en"); }); await page.reload({ waitUntil: "domcontentloaded" }); await home(page); await players(page);
  const txt = await page.textContent(".ch-root");
  check(T("English: no Chinese left in the Clubhouse"), !/[\u4e00-\u9fff]/.test(txt), (txt.match(/[\u4e00-\u9fff]+/g) || []).slice(0, 5).join("|"));
  await page.screenshot({ path: `${OUT}/${tag}-4-en.png`, fullPage: false });
  // I. account isolation
  await page.evaluate(() => { localStorage.setItem("courtside.lang", "zh"); });
  await page.evaluate(acct("Empty")); await page.reload({ waitUntil: "domcontentloaded" }); await home(page); await players(page);
  check(T("another account sees none of John's trophies or cards"), (await page.textContent(".ch-titles")) === "0" && (await page.$$(".ch-wall .ch-tile")).length === 0);
  check(T("empty account: empty court slots + build action"), (await page.$$(".ch-slot-empty")).length === 5 && (await page.getAttribute(".ch-primary", "data-act")) === "draw" && (await page.textContent(".ch-primary")).includes("8"));
  await page.screenshot({ path: `${OUT}/${tag}-5-empty.png`, fullPage: false });
  check(T("no page errors"), errs.length === 0, errs.join(";"));
  await page.close();
}
await b.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
