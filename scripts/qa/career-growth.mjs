// Browser E2E for C2 (player XP + in-season growth). A REAL managed career (built by the real engine,
// read back by the real UI), played through the real buttons: sim one, view an old game, sim a week,
// hand-coach one, reload mid-career, English. Every claim on the card is reconciled against the SAVE:
// the "+N XP" must equal what the ledger really gained, every "三分 60→61" must be what the roster
// really went from/to, and no attribute may change that the ledger doesn't account for.
// The ledger is seeded one hair below a level so the first game reliably levels people up -- we are
// testing the plumbing, not waiting 27 games for luck.
// Usage: [QA_VIEWPORT=desktop|mobile] node scripts/qa/career-growth.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, noOverflow, onResult, overflowers, shoot, unbroken } from "./lib/page.mjs";
import { openCareer, playLive, resumeToHub } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/growth";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });
const COST = 1200; // GROWTH_XP_PER_LEVEL, read back from the app below and asserted equal

/** Re-arm every bar to 10 XP short of a level, so the next game reliably levels people up. */
async function reseed(page) {
  await page.evaluate((cost) => {
    const root = JSON.parse(localStorage.getItem("cls_root_v3"));
    for (const entry of Object.values(root.leagueCareer.management.growth)) entry.xp = cost - 10;
    localStorage.setItem("cls_root_v3", JSON.stringify(root));
  }, COST);
  await page.reload({ waitUntil: "domcontentloaded" });
  await resumeToHub(page);
}

/** A real 1995 career, ledger seeded 10 XP short of a level for every player young enough to grow. */
async function openGrowthCareer(page) {
  await openCareer(page, BASE, { growth: true });
  const cost = await page.evaluate(async () => (await import("/js/career/balance.js")).GROWTH_XP_PER_LEVEL);
  check("the QA's level cost matches the app's", cost === COST, `${cost}`);
}

/** What the SAVE says: the ledger and every attribute of every player on my roster, by display name. */
const saved = (page) => page.evaluate(async () => {
  const { ATTRIBUTE_LABELS } = await import("/js/ui/careerPostGameView.js");
  const root = JSON.parse(localStorage.getItem("cls_root_v3") || "null");
  const st = root.leagueCareer.season;
  const attrs = Object.keys(ATTRIBUTE_LABELS);
  return {
    growth: root.leagueCareer.management.growth || {},
    labels: Object.fromEntries(Object.entries(ATTRIBUTE_LABELS).map(([k, [zh, en]]) => [zh, k]).concat(Object.entries(ATTRIBUTE_LABELS).map(([k, [zh, en]]) => [en, k]))),
    players: Object.fromEntries(st.teams[st.userTeamId].players.map((p) => [p.name, { bref: p.bref, ...Object.fromEntries(attrs.map((a) => [a, p[a]])) }])),
  };
});

/** The growth section as the player sees it. */
const section = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll("#result-rewards .pg-grow")].map((row) => {
    const segs = [...row.querySelectorAll(".pg-nowrap")].map((el) => el.textContent.trim());
    return {
      name: row.querySelector("strong")?.textContent.trim(),
      xp: Number((segs.find((s) => /^\+\d+ XP$/.test(s)) || "").match(/\d+/)?.[0] || NaN),
      ups: segs.map((s) => s.match(/^(.+) (\d+)→(\d+)$/)).filter(Boolean).map((m) => ({ label: m[1], from: +m[2], to: +m[3] })),
      capped: /本季不再成长|No more growth/.test(row.textContent),
      bar: row.querySelector(".pg-bar")?.getAttribute("aria-label"),
    };
  });
  const box = document.querySelector("#result-rewards");
  return { // the card has other sections too (C4 highlights sit above this one): find ours by what it says, not by position
    title: [...(box?.querySelectorAll(".pg-section-title") || [])].map((el) => el.textContent.trim()).find((t) => /球员成长|Player growth/.test(t)) || "", rows, all: (box?.textContent || "").replace(/\s+/g, " ") };
});

const earned = (entry) => (entry ? entry.xp + COST * entry.levels : 0);

/** Nobody on the roster has more levels this season than his age allows (22yo: 3, 27yo: 2, 33yo: 0 ...). */
const capsHold = (page) => page.evaluate(async () => {
  const { ageRow } = await import("/js/career/playerGrowth.js");
  const { resolvedAge } = await import("/js/modes/playerDevelopment.js");
  const root = JSON.parse(localStorage.getItem("cls_root_v3"));
  const st = root.leagueCareer.season;
  const growth = root.leagueCareer.management.growth;
  const over = st.teams[st.userTeamId].players
    .filter((p) => growth[p.bref] && growth[p.bref].levels > ageRow(resolvedAge(p)).levels)
    .map((p) => `${p.name} age ${resolvedAge(p)}: ${growth[p.bref].levels} levels`);
  const used = Object.values(growth).reduce((n, e) => n + e.levels, 0);
  return { over, used };
});

/** Reconcile what the card claims with what the save says changed between two snapshots. */
async function reconcile(page, tag, label, before, after, { expectLevelUp = true } = {}) {
  const sec = await section(page);
  check(`[${tag}] ${label}: the card has a growth section with rows`, /球员成长|Player growth/.test(sec.title) && sec.rows.length >= 1 && sec.rows.length <= 4, `${sec.rows.length} rows`);
  // Late in a season nobody has room left (see capsHold), so only the early steps can demand a level-up.
  if (expectLevelUp) check(`[${tag}] ${label}: somebody levelled up (the seed makes it certain)`, sec.rows.some((r) => r.ups.length > 0), JSON.stringify(sec.rows.map((r) => [r.name, r.ups.length])));
  // 1. every row's XP is exactly what the ledger gained (a capped player's bar is clipped, so only "> 0")
  const bad = [];
  for (const row of sec.rows) {
    const p = after.players[row.name];
    if (!p) { bad.push(`${row.name} not on the saved roster`); continue; }
    const gained = earned(after.growth[p.bref]) - earned(before.growth[p.bref]);
    if (!(row.xp > 0)) bad.push(`${row.name} shows ${row.xp} XP`);
    else if (!row.capped && gained !== row.xp) bad.push(`${row.name}: card +${row.xp} but ledger +${gained}`);
  }
  check(`[${tag}] ${label}: every row's "+N XP" is exactly what the saved ledger gained`, bad.length === 0, bad.join(" | "));
  // 2. every "attribute from→to" is what that player really went from/to
  const badUps = [];
  for (const row of sec.rows) for (const up of row.ups) {
    const key = after.labels[up.label];
    const b = before.players[row.name]?.[key];
    const a = after.players[row.name]?.[key];
    if (!key || b !== up.from || a !== up.to) badUps.push(`${row.name} ${up.label} card ${up.from}→${up.to} save ${b}→${a}`);
  }
  check(`[${tag}] ${label}: every "attribute from→to" matches the roster before/after`, badUps.length === 0, badUps.join(" | "));
  // 3. nothing on the roster changed without a ledger entry (+1 per level, no more, no other attributes)
  const unaccounted = [];
  for (const [name, now] of Object.entries(after.players)) {
    const was = before.players[name];
    const delta = Object.fromEntries(Object.keys(after.labels).map((l) => after.labels[l]).filter((k, i, arr) => arr.indexOf(k) === i)
      .map((k) => [k, (now[k] ?? 0) - (was?.[k] ?? 0)]).filter(([, d]) => d !== 0));
    const ledgerNow = after.growth[now.bref]?.deltas || {};
    const ledgerWas = before.growth[now.bref]?.deltas || {};
    const ledgerDelta = Object.fromEntries(Object.keys({ ...ledgerNow, ...ledgerWas }).map((k) => [k, (ledgerNow[k] || 0) - (ledgerWas[k] || 0)]).filter(([, d]) => d !== 0));
    if (JSON.stringify(delta) !== JSON.stringify(ledgerDelta)) unaccounted.push(`${name}: roster ${JSON.stringify(delta)} vs ledger ${JSON.stringify(ledgerDelta)}`);
  }
  check(`[${tag}] ${label}: roster attribute changes == ledger changes, for the WHOLE roster`, unaccounted.length === 0, unaccounted.slice(0, 3).join(" | "));
  return sec;
}

// QA_VIEWPORT=desktop|mobile runs one viewport only (the mutation checks use it to stay fast).
const VIEWPORTS = [[1280, 800, "desktop"], [390, 844, "mobile"]].filter(([, , tag]) => !process.env.QA_VIEWPORT || process.env.QA_VIEWPORT === tag);
for (const [width, height, tag] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openGrowthCareer(page);
  const backToHub = async () => {
    await page.click("#btn-result-continue");
    await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
  };

  // ---- one simulated game
  let before = await saved(page);
  check(`[${tag}] a managed career starts with a seeded ledger`, Object.keys(before.growth).length >= 5, `${Object.keys(before.growth).length} players`);
  await page.click("#btn-season-sim-one");
  await onResult(page);
  let after = await saved(page);
  await reconcile(page, tag, "sim one", before, after);
  check(`[${tag}] sim one: this is the single-game card with the growth section inside it`, await page.$eval("#result-rewards .pg-card .pg-kicker", (el) => /赛后结算/.test(el.textContent)));
  check(`[${tag}] sim one: no stat figure is split from its unit across lines`, await unbroken(page));
  check(`[${tag}] sim one: no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-single.png`);

  // ---- viewing an old game must NOT pay its XP again, and shows no growth section
  await backToHub();
  const beforeView = await saved(page);
  await page.click('[data-season-tab="schedule"]');
  const viewBtn = await page.$("#season-schedule .btn-view-box");
  check(`[${tag}] view: the finished game is listed with a box-score button`, !!viewBtn);
  if (viewBtn) {
    await viewBtn.click();
    await onResult(page);
    const viewed = await section(page);
    const afterView = await saved(page);
    check(`[${tag}] view: re-opening a finished game pays nothing: the ledger is untouched`, JSON.stringify(afterView.growth) === JSON.stringify(beforeView.growth) && JSON.stringify(afterView.players) === JSON.stringify(beforeView.players));
    check(`[${tag}] view: and the re-opened game shows no growth section`, viewed.rows.length === 0 && !/球员成长/.test(viewed.all), viewed.all.slice(0, 80));
    await backToHub();
  }

  // ---- a stretch: ONE card whose growth is the whole stretch
  await reseed(page);
  before = await saved(page);
  await page.click("#btn-season-sim-week");
  await onResult(page);
  after = await saved(page);
  const kicker = await page.$eval("#result-rewards .pg-card .pg-kicker", (el) => el.textContent.trim());
  check(`[${tag}] sim week: the stretch card (not a game card) carries the growth`, /本段收获/.test(kicker), kicker);
  await reconcile(page, tag, "sim week", before, after);
  check(`[${tag}] sim week: no stat figure is split from its unit across lines`, await unbroken(page));
  check(`[${tag}] sim week: no horizontal overflow`, await noOverflow(page));
  await shoot(page, `${OUT}/${tag}-batch.png`);
  await backToHub();

  // ---- reload mid-career: the ledger survives, and the next game continues it (not restarts it)
  const preReload = await saved(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await resumeToHub(page);
  const postReload = await saved(page);
  check(`[${tag}] reload: the ledger and the levelled attributes are exactly as left`, JSON.stringify(postReload.growth) === JSON.stringify(preReload.growth) && JSON.stringify(postReload.players) === JSON.stringify(preReload.players));
  const valid = await page.evaluate(async () => {
    const { validGrowth } = await import("/js/career/growthShape.js");
    const root = JSON.parse(localStorage.getItem("cls_root_v3"));
    return validGrowth(root.leagueCareer.management.growth);
  });
  check(`[${tag}] reload: the saved ledger passes the save validator`, valid === true);

  await reseed(page); // the earlier games spent the seed; arm the hand-coached game too

  // ---- a hand-coached regular-season game
  const clock = { clockInstalled: false };
  before = await saved(page);
  const liveDone = await playLive(page, clock);
  check(`[${tag}] live: the hand-coached game reached the result screen`, liveDone);
  if (liveDone) {
    after = await saved(page);
    await reconcile(page, tag, "live game", before, after);
    check(`[${tag}] live: no horizontal overflow`, await noOverflow(page));
    await shoot(page, `${OUT}/${tag}-live.png`);
    await backToHub();
  }

  // ---- the whole rest of the season in one go: the ASYNC path (a different function from "sim a week")
  await reseed(page);
  await page.click("#btn-season-sim-one");
  await onResult(page);
  before = await saved(page);
  await page.click("#btn-result-sim-season");
  await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
  await page.click("#app-confirm-accept");
  await page.waitForFunction(() => /正在模拟/.test(document.querySelector("#result-summary")?.textContent || ""), null, { timeout: 10000 });
  await page.waitForFunction(() => !/正在模拟/.test(document.querySelector("#result-summary")?.textContent || ""), null, { timeout: 120000 });
  after = await saved(page);
  const rest = await page.$eval("#result-rewards .pg-card .pg-kicker", (el) => el.textContent.trim());
  check(`[${tag}] rest of season: one stretch card carries the growth of the whole run`, /本段收获/.test(rest), rest);
  await reconcile(page, tag, "rest of season", before, after, { expectLevelUp: false });
  const caps = await capsHold(page);
  check(`[${tag}] after a full season of games nobody is above his age's level cap, and the cap was really used`, caps.over.length === 0 && caps.used > 0, caps.over.join(" | ") || `${caps.used} levels in total`);
  check(`[${tag}] rest of season: no horizontal overflow`, await noOverflow(page));
  await backToHub();

  // ---- playoffs. Make the user a clear #1 seed in the SAVE (the sim might not earn one), then load it
  // like a player would; everything from here is real UI and real engine.
  await page.evaluate(() => {
    const root = JSON.parse(localStorage.getItem("cls_root_v3"));
    const st = root.leagueCareer.season;
    st.standings[st.userTeamId] = { w: 70, l: 12, pf: 9200, pa: 7600, streak: 6, last10: Array(10).fill("W") };
    localStorage.setItem("cls_root_v3", JSON.stringify(root));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await resumeToHub(page);
  await page.click('[data-season-tab="awards"]');
  await page.waitForSelector("#btn-season-to-playoffs", { timeout: 10000 });
  await page.click("#btn-season-to-playoffs");
  await page.waitForSelector("#season-playoffs .season-series-row", { timeout: 10000 });

  await reseed(page);
  await page.click('[data-season-tab="playoffs"]');
  before = await saved(page);
  await page.click("#btn-season-sim-one");
  await onResult(page);
  after = await saved(page);
  await reconcile(page, tag, "playoff quick sim", before, after, { expectLevelUp: false });
  check(`[${tag}] playoff quick sim: no horizontal overflow`, await noOverflow(page));
  await backToHub();

  await reseed(page);
  await page.click('[data-season-tab="playoffs"]');
  before = await saved(page);
  const playoffLive = await playLive(page, clock);
  check(`[${tag}] playoff live: the hand-coached playoff game reached the result screen`, playoffLive);
  if (playoffLive) {
    after = await saved(page);
    await reconcile(page, tag, "playoff live game", before, after, { expectLevelUp: false });
    check(`[${tag}] playoff live: no horizontal overflow`, await noOverflow(page));
    await shoot(page, `${OUT}/${tag}-playoff-live.png`);
    await backToHub();
  }

  // ---- English: the growth section is English through and through
  await reseed(page);
  await page.evaluate(() => document.querySelector("#btn-lang").click());
  await page.waitForTimeout(300);
  await page.click('[data-season-tab="playoffs"]');
  before = await saved(page);
  await page.click("#btn-season-sim-one");
  await onResult(page);
  after = await saved(page);
  const en = await section(page);
  const enText = en.all.slice(en.all.indexOf("Player growth"));
  check(`[${tag}] English: the growth section is English, no Chinese`, /Player growth/.test(en.title) && en.rows.length >= 1 && !CJK.test(enText), enText.slice(0, 140));
  check(`[${tag}] English: XP rows still reconcile with the save`, en.rows.every((r) => {
    const p = after.players[r.name];
    return p && (r.capped || earned(after.growth[p.bref]) - earned(before.growth[p.bref]) === r.xp);
  }));
  check(`[${tag}] English: no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  await shoot(page, `${OUT}/${tag}-english.png`);

  // The ledger only ever moves forward within a season: levels and per-attribute gains never go down.
  const finalSave = await saved(page);
  const regressions = [];
  for (const [bref, was] of Object.entries(postReload.growth)) {
    const now = finalSave.growth[bref];
    if (!now) { regressions.push(`${bref} vanished`); continue; }
    if (now.levels < was.levels) regressions.push(`${bref} levels ${was.levels}->${now.levels}`);
    for (const [attribute, n] of Object.entries(was.deltas)) if ((now.deltas[attribute] || 0) < n) regressions.push(`${bref}.${attribute} ${n}->${now.deltas[attribute] || 0}`);
  }
  check(`[${tag}] across the whole season (reloads, reseeds, playoffs) the ledger only moves forward`, regressions.length === 0, regressions.join(" | "));

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
