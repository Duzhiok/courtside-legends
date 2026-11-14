// Browser E2E for C3 (skill epiphany). A REAL managed career, played through the real buttons: sim one,
// sim a week, hand-coach one, the whole rest of the season, view an old game, reload, English.
// Every claim on the card is reconciled against the SAVE: a "learned" row must be a skill that really
// appeared on that player (and in the ledger, and not as a bought skill), "heating up" must equal the
// streak the ledger really holds, and nothing may change on the roster that the card doesn't announce.
//
// Real thresholds (3 games of 9+ assists...) can't be conjured on demand, so the plumbing is proven with
// the SAME app code against a relaxed copy of js/engine/epiphany.js (every rule: 1+ of its stat, 1+
// minute, a sure roll), served by intercepting that one module. The real thresholds are covered by the
// unit tests and by the "real thresholds" pass here (no false claims, no silent changes).
// Usage: [QA_VIEWPORT=desktop|mobile] node scripts/qa/career-epiphany.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { CJK, noOverflow, onResult, overflowers, settled, shoot, unbroken } from "./lib/page.mjs";
import { openCareer, playLive, resumeToHub } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/epiphany";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });

// ---- the relaxed copy of the rule module (and a loud failure if the module stops looking as expected)
const SRC = readFileSync(new URL("../../js/engine/epiphany.js", import.meta.url), "utf8");
const RELAXED = SRC.replace("MIN_MINUTES = 18", "MIN_MINUTES = 1").replace("EPIPHANY_BASE_CHANCE = 0.4", "EPIPHANY_BASE_CHANCE = 1").replace("EPIPHANY_MAX_CHANCE = 0.75", "EPIPHANY_MAX_CHANCE = 1").replace(/min: \d+, skills/g, "min: 1, skills");
check("the relaxed rule module was built from the real one", RELAXED !== SRC && /MIN_MINUTES = 1\b/.test(RELAXED) && /EPIPHANY_BASE_CHANCE = 1\b/.test(RELAXED) && /EPIPHANY_MAX_CHANCE = 1\b/.test(RELAXED) && (RELAXED.match(/min: 1, skills/g) || []).length === 7);
const relax = (page) => page.route(/\/js\/engine\/epiphany\.js/, (route) => route.fulfill({ contentType: "text/javascript", body: RELAXED }));

/** What the SAVE says: the ledger, games played, and every skill of every player on my roster. */
const saved = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3"));
  const st = root.leagueCareer.season;
  const rec = st.standings[st.userTeamId] || { w: 0, l: 0 };
  return {
    ledger: root.leagueCareer.management.epiphany || {},
    games: rec.w + rec.l,
    players: Object.fromEntries(st.teams[st.userTeamId].players.map((p) => [p.name, { bref: p.bref, skills: [...(p.skills || [])], bought: [...(p.purchasedSkills || [])] }])),
  };
});

/** The rule module the PAGE is using (real or relaxed) and the card's unit/skill tables. */
const config = (page) => page.evaluate(async () => {
  const ep = await import("/js/engine/epiphany.js");
  const view = await import("/js/ui/careerPostGameView.js");
  const sk = await import("/js/data/skills.js");
  const i18n = await import("/js/i18n.js");
  const names = {};
  for (const pack of Object.values(sk.SKILL_PACKS)) { names[pack.name] = pack.id; names[i18n.skillNameL(pack.name, "en")] = pack.id; }
  return { minMinutes: ep.MIN_MINUTES, streak: ep.STREAK, cap: ep.MAX_EPIPHANY, slots: sk.MAX_SKILL_SLOTS, units: view.STREAK_UNITS, names };
});

/** The two C3 sections as the player sees them, plus layout facts. */
/** (The card fades/slides in: read it only after it settled, or opacity and gaps are mid-flight.) */
const card = async (page) => {
  await settled(page);
  return page.evaluate(readCard);
};
function readCard() {
  const box = document.querySelector("#result-rewards");
  const rowOf = (el) => ({ name: el.querySelector("strong")?.textContent.trim(), why: el.querySelector(".pg-who span")?.textContent.trim() });
  const learned = [...box.querySelectorAll(".pg-learn")].map((li) => ({ ...rowOf(li), skill: li.querySelector(".pg-skill")?.textContent.trim() }));
  const heat = [...box.querySelectorAll(".pg-dots")].map((dots) => ({
    ...rowOf(dots.closest(".pg-heat")), lit: dots.querySelectorAll("i.on").length, total: dots.querySelectorAll("i").length, label: dots.getAttribute("aria-label"),
  }));
  const rgb = (css) => css.match(/[\d.]+/g).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length < 4 || c[3] > 0.9) return c.slice(0, 3); } return [255, 255, 255]; };
  const contrast = (el) => { const a = lum(rgb(getComputedStyle(el).color).slice(0, 3)); const b = lum(bgOf(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const lows = [".pg-skill", ".pg-epiphany-title", ".pg-epiphany .pg-who span", ".pg-note", ".pg-section-title"]
    .flatMap((sel) => [...box.querySelectorAll(sel)].map((el) => [sel, contrast(el)])).filter(([, c]) => c < 4.5).map(([sel, c]) => `${sel} ${c.toFixed(2)}`);
  const titles = [...box.querySelectorAll(".pg-section-title")];
  const gaps = titles.map((t) => (t.previousElementSibling ? t.getBoundingClientRect().top - t.previousElementSibling.getBoundingClientRect().bottom : 99));
  const epi = box.querySelector(".pg-epiphany");
  const star = box.querySelector(".pg-star");
  const growthRow = [...box.querySelectorAll(".pg-grow")].pop();
  const heatTitle = titles.find((t) => /手感正热|Heating up/.test(t.textContent));
  const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  return {
    learned, heat, lows, gaps,
    more: Number(box.querySelector(".pg-more")?.textContent.match(/\d+/)?.[0] || 0),
    epiphanyFirst: !epi || !star || follows(epi, star),
    heatLast: !heatTitle || !growthRow || follows(growthRow, heatTitle),
    opacity: epi ? getComputedStyle(epi).opacity : "1",
    border: epi ? getComputedStyle(epi).borderLeftColor : "",
    anim: epi ? getComputedStyle(epi).animationName : "",
    text: (box.textContent || "").replace(/\s+/g, " "),
  };
}

const trailing = (form, stat, min, minMinutes) => {
  let n = 0;
  for (let i = form.length - 1; i >= 0 && form[i].min >= minMinutes && form[i][stat] >= min; i -= 1) n += 1;
  return n;
};

/** Everything the card says about epiphanies, reconciled with the save. */
function reconcile(tag, label, before, after, c, cfg, games) {
  const gained = Object.fromEntries(Object.entries(after.players).map(([name, p]) => [name, p.skills.filter((id) => !before.players[name].skills.includes(id))]));
  const totalGained = Object.values(gained).flat().length;
  const claimed = c.learned.length + c.more;
  check(`[${tag}] ${label}: skills that appeared on the roster == skills the card announces`, totalGained === claimed, `roster +${totalGained}, card ${claimed}`);

  const bad = [];
  for (const row of c.learned) {
    const id = cfg.names[row.skill];
    const p = after.players[row.name];
    if (!id || !p) { bad.push(`${row.name} / ${row.skill}: unknown`); continue; }
    if (!gained[row.name].includes(id)) bad.push(`${row.name}: ${id} did not appear on the card`);
    if (!(after.ledger[p.bref]?.learned || []).includes(id)) bad.push(`${row.name}: ${id} missing from the ledger`);
    if (p.bought.includes(id)) bad.push(`${row.name}: ${id} counts as BOUGHT (it could be unequipped for a refund)`);
    // On a one-game card the streak is spent; over a stretch he kept playing and the window refilled.
    if (games === 1 && after.ledger[p.bref]?.form.length) bad.push(`${row.name}: streak not spent (${after.ledger[p.bref].form.length} games left)`);
  }
  check(`[${tag}] ${label}: every learned row is really on the player, in the ledger, not bought${games === 1 ? ", streak spent" : ""}`, bad.length === 0, bad.join(" | "));

  const overCap = Object.entries(after.ledger).filter(([, e]) => e.learned.length > cfg.cap).map(([b]) => b);
  const fat = Object.entries(after.players).filter(([name, p]) => p.skills.length > Math.max(cfg.slots, before.players[name].skills.length)).map(([n]) => n);
  check(`[${tag}] ${label}: nobody above ${cfg.cap} epiphanies or ${cfg.slots} skills`, overCap.length === 0 && fat.length === 0, [...overCap, ...fat].join(","));

  // every "heating up" row is exactly the streak the ledger holds, and never shows someone who just learned
  const unitStat = Object.fromEntries(Object.entries(cfg.units).flatMap(([stat, names]) => names.map((n) => [n, stat])));
  const badHeat = [];
  for (const row of c.heat) {
    const m = row.why.match(/^连续 (\d+) 场 (\d+)\+ (.+)$/) || row.why.match(/^(\d+) straight games with (\d+)\+ (.+)$/);
    const p = after.players[row.name];
    const stat = m && unitStat[m[3]];
    if (!m || !p || !stat) { badHeat.push(`${row.name}: unreadable "${row.why}"`); continue; }
    const real = trailing(after.ledger[p.bref]?.form || [], stat, Number(m[2]), cfg.minMinutes);
    if (real !== Number(m[1])) badHeat.push(`${row.name}: card ${m[1]} games, ledger ${real}`);
    if (row.lit !== Math.min(real, cfg.streak) || row.total !== cfg.streak || row.label !== `${row.lit}/${cfg.streak}`) badHeat.push(`${row.name}: dots ${row.lit}/${row.total} (${row.label})`);
    if (games === 1 && gained[row.name]?.length) badHeat.push(`${row.name}: heating up right after learning`);
  }
  check(`[${tag}] ${label}: every "heating up" row equals the streak the ledger really holds`, badHeat.length === 0, badHeat.join(" | "));
  check(`[${tag}] ${label}: at most 4 learned rows and 3 heat rows`, c.learned.length <= 4 && c.heat.length <= 3, `${c.learned.length}/${c.heat.length}`);

  // each game is settled exactly once: a tracked player's window grew by one per game (or reset on learning)
  const twice = [];
  for (const [name, p] of Object.entries(after.players)) {
    const was = before.ledger[p.bref];
    const now = after.ledger[p.bref];
    if (!was || !now || gained[name].length) continue;
    const want = Math.min(5, was.form.length + games);
    if (now.form.length !== want) twice.push(`${name}: ${was.form.length}+${games} games -> ${now.form.length}, expected ${want}`);
  }
  check(`[${tag}] ${label}: every game settled exactly once (streak window grew by exactly the games played)`, twice.length === 0, twice.slice(0, 3).join(" | "));
}

/** Layout and style facts of the card, for either language. */
async function looks(page, tag, label, c) {
  check(`[${tag}] ${label}: no stat figure is split from its unit across lines`, await unbroken(page));
  check(`[${tag}] ${label}: no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  check(`[${tag}] ${label}: epiphany above the stars, heating up below growth`, c.epiphanyFirst && c.heatLast);
  check(`[${tag}] ${label}: every section title has air above it (>= 8px)`, c.gaps.every((g) => g >= 8), c.gaps.map((g) => Math.round(g)).join(","));
  check(`[${tag}] ${label}: text in the new blocks is AA contrast (>= 4.5)`, c.lows.length === 0, c.lows.join(" | "));
  check(`[${tag}] ${label}: the reveal animation settled fully visible`, c.opacity === "1", c.opacity);
}

const backToHub = async (page) => {
  await page.click("#btn-result-continue");
  await page.waitForSelector("#season-hub-panel:not([hidden])", { timeout: 20000 });
};
const reseed = async (page, games) => {
  await page.evaluate((n) => {
    const root = JSON.parse(localStorage.getItem("cls_root_v3"));
    const season = root.leagueCareer.season;
    const big = { min: 30, pts: 30, reb: 12, ast: 10, stl: 3, blk: 3, tpm: 4, twoPm: 8 };
    root.leagueCareer.management.epiphany = Object.fromEntries(season.teams[season.userTeamId].players.filter((p) => p.bref).map((p) => [p.bref, { form: Array(n).fill(big), learned: [] }]));
    localStorage.setItem("cls_root_v3", JSON.stringify(root));
  }, games);
  await page.reload({ waitUntil: "domcontentloaded" });
  await resumeToHub(page);
};

const VIEWPORTS = [[1280, 800, "desktop"], [390, 844, "mobile"]].filter(([, , tag]) => !process.env.QA_VIEWPORT || process.env.QA_VIEWPORT === tag);
for (const [width, height, vp] of VIEWPORTS) {
  // A step that throws (a result screen that never comes) becomes a red line, not a lost report.
  try {
    const newPage = async (relaxed, errors) => {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on("pageerror", (e) => errors.push(e.message));
      if (relaxed) await relax(page);
      return page;
    };

    // ============================================================ real thresholds: no false claims, no silent changes
    {
      const tag = `${vp}/real`;
      const errors = [];
      const page = await newPage(false, errors);
      await openCareer(page, BASE, { epiphanyGames: 2 });
      const cfg = await config(page);
      check(`[${tag}] the page runs the REAL rule module`, cfg.minMinutes === 18 && cfg.streak === 3 && cfg.cap === 2, JSON.stringify([cfg.minMinutes, cfg.streak, cfg.cap]));
      let before = await saved(page);
      check(`[${tag}] a managed career starts with a seeded ledger`, Object.keys(before.ledger).length >= 8, `${Object.keys(before.ledger).length} players`);
      await page.click("#btn-season-sim-one");
      await onResult(page);
      let after = await saved(page);
      let c = await card(page);
      reconcile(tag, "sim one", before, after, c, cfg, 1);
      await looks(page, tag, "sim one", c);
      await shoot(page, `${OUT}/${tag}-single.png`);
      await backToHub(page);

      before = await saved(page);
      await page.click("#btn-season-sim-week");
      await onResult(page);
      after = await saved(page);
      c = await card(page);
      reconcile(tag, "sim week", before, after, c, cfg, after.games - before.games);
      check(`[${tag}] sim week: this is the stretch card`, /本段收获/.test(await page.$eval("#result-rewards .pg-card .pg-kicker", (el) => el.textContent)));
      await looks(page, tag, "sim week", c);
      await backToHub(page);
      check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
      await page.close();
    }

    // ============================================================ relaxed rules: heat first, then the epiphany it promised
    relaxedScenario: {
      const tag = `${vp}/relaxed`;
      const errors = [];
      const page = await newPage(true, errors);
      await openCareer(page, BASE, { epiphanyGames: 1 });
      const cfg = await config(page);
      check(`[${tag}] the page runs the RELAXED rule module`, cfg.minMinutes === 1, String(cfg.minMinutes));

      let before = await saved(page);
      await page.click("#btn-season-sim-one");
      await onResult(page);
      let after = await saved(page);
      let c = await card(page);
      check(`[${tag}] game 1 (one game banked): people are heating up, nobody has learned anything`, c.heat.length >= 1 && c.learned.length === 0, `heat ${c.heat.length}, learned ${c.learned.length}`);
      check(`[${tag}] game 1: every heating-up row is 2 of 3 dots`, c.heat.every((r) => r.lit === 2 && r.total === 3), JSON.stringify(c.heat.map((r) => r.label)));
      check(`[${tag}] game 1: the explanation line is there, and the skill itself is not named`, /再来一场达标，就有机会领悟新技能/.test(c.text) && !/传球魔术|三分雨|盖帽|抢断/.test(c.text.split("手感正热")[1] || ""));
      reconcile(tag, "game 1", before, after, c, cfg, 1);
      await looks(page, tag, "game 1", c);
      await shoot(page, `${OUT}/${tag}-heat.png`);
      await backToHub(page);

      before = await saved(page);
      await page.click("#btn-season-sim-one");
      await onResult(page);
      after = await saved(page);
      c = await card(page);
      check(`[${tag}] game 2 (the third in a row): the promised epiphany happens`, c.learned.length >= 1, `learned ${c.learned.length}`);
      check(`[${tag}] game 2: the block is warm amber and the skill chip is shown`, c.learned.length > 0 && c.border === "rgb(217, 119, 6)" && c.learned.every((r) => r.skill), c.border);
      check(`[${tag}] game 2: the reason names the streak ("连续 3 场 …")`, c.learned.every((r) => /^连续 3 场 \d+\+ /.test(r.why)), JSON.stringify(c.learned.map((r) => r.why)));
      reconcile(tag, "game 2", before, after, c, cfg, 1);
      await looks(page, tag, "game 2", c);
      await shoot(page, `${OUT}/${tag}-learned.png`);
      const learnedNames = c.learned.map((r) => r.name);
      await backToHub(page);

      // viewing an old game must not roll again
      const beforeView = await saved(page);
      await page.click('[data-season-tab="schedule"]');
      const viewBtn = await page.$("#season-schedule .btn-view-box");
      check(`[${tag}] view: the finished game is listed with a box-score button`, !!viewBtn);
      if (viewBtn) {
        await viewBtn.click();
        await onResult(page);
        const viewed = await card(page);
        const afterView = await saved(page);
        check(`[${tag}] view: re-opening a game rolls nothing: ledger and skills are untouched`, JSON.stringify(afterView.ledger) === JSON.stringify(beforeView.ledger) && JSON.stringify(afterView.players) === JSON.stringify(beforeView.players));
        check(`[${tag}] view: and shows no epiphany or heating-up section`, viewed.learned.length === 0 && viewed.heat.length === 0 && !/手感正热|领悟新技能/.test(viewed.text), viewed.text.slice(0, 60));
        await backToHub(page);
      }

      // hand-coached game (another call site)
      const clock = { clockInstalled: false };
      before = await saved(page);
      const liveDone = await playLive(page, clock);
      check(`[${tag}] live: the hand-coached game reached the result screen`, liveDone);
      if (liveDone) {
        after = await saved(page);
        c = await card(page);
        reconcile(tag, "live game", before, after, c, cfg, 1);
        await looks(page, tag, "live game", c);
        await backToHub(page);
      }

      // reload: what was learned is still learned, and still the player's
      const preReload = await saved(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await resumeToHub(page);
      const postReload = await saved(page);
      check(`[${tag}] reload: the ledger and every player's skills are exactly as left`, JSON.stringify(postReload.ledger) === JSON.stringify(preReload.ledger) && JSON.stringify(postReload.players) === JSON.stringify(preReload.players));
      check(`[${tag}] reload: the ledger passes the save validator`, await page.evaluate(async () => {
        const { validEpiphany } = await import("/js/career/growthShape.js");
        return validEpiphany(JSON.parse(localStorage.getItem("cls_root_v3")).leagueCareer.management.epiphany);
      }));
      check(`[${tag}] reload: the players who learned in game 2 still have it`, learnedNames.every((n) => (postReload.ledger[postReload.players[n].bref]?.learned || []).length >= 1));

      // the whole rest of the season in one go (the async path), then the caps
      await page.click("#btn-season-sim-one");
      await onResult(page);
      before = await saved(page);
      await page.click("#btn-result-sim-season");
      await page.waitForSelector("#app-confirm-dialog[open]", { timeout: 5000 });
      await page.click("#app-confirm-accept");
      await page.waitForFunction(() => /正在模拟/.test(document.querySelector("#result-summary")?.textContent || ""), null, { timeout: 10000 });
      // A hang must be a red line, not a crash that throws the whole report away (a ledger the save validator
      // refuses makes the async loop's save throw, and the progress text never goes away).
      const finished = await page.waitForFunction(() => !/正在模拟/.test(document.querySelector("#result-summary")?.textContent || ""), null, { timeout: 120000 }).then(() => true, () => false);
      check(`[${tag}] rest of season: the whole-season simulation finishes`, finished);
      if (!finished) { check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | ")); await page.close(); break relaxedScenario; }
      after = await saved(page);
      c = await card(page);
      check(`[${tag}] rest of season: one stretch card`, /本段收获/.test(await page.$eval("#result-rewards .pg-card .pg-kicker", (el) => el.textContent)));
      reconcile(tag, "rest of season", before, after, c, cfg, after.games - before.games);
      const everyone = Object.values(after.ledger).filter((e) => e.learned.length);
      check(`[${tag}] rest of season: the cap was really reached by someone (relaxed rules, 70+ games)`, everyone.some((e) => e.learned.length === cfg.cap), JSON.stringify(everyone.map((e) => e.learned.length)));
      await looks(page, tag, "rest of season", c);
      await shoot(page, `${OUT}/${tag}-rest.png`);
      await backToHub(page);
      check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
      await page.close();
    }

    // ============================================================ relaxed rules, a stretch, reduced motion, English
    {
      const tag = `${vp}/stretch`;
      const errors = [];
      const page = await newPage(true, errors);
      await openCareer(page, BASE, { epiphanyGames: 2 });
      const cfg = await config(page);
      let before = await saved(page);
      await page.click("#btn-season-sim-week");
      await onResult(page);
      let after = await saved(page);
      let c = await card(page);
      check(`[${tag}] a stretch with two games banked: several people learned a skill`, c.learned.length + c.more >= 2, `${c.learned.length} shown + ${c.more} more`);
      reconcile(tag, "sim week", before, after, c, cfg, after.games - before.games);
      await looks(page, tag, "sim week", c);
      await shoot(page, `${OUT}/${tag}-batch.png`);
      await page.emulateMedia({ reducedMotion: "reduce" });
      check(`[${tag}] reduced motion: the reveal animation is off`, (await card(page)).anim === "none");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await backToHub(page);

      await reseed(page, 2);
      await page.evaluate(() => document.querySelector("#btn-lang").click());
      await page.waitForTimeout(300);
      before = await saved(page);
      await page.click("#btn-season-sim-one");
      await onResult(page);
      after = await saved(page);
      c = await card(page);
      const cfgEn = await config(page);
      reconcile(tag, "English sim one", before, after, c, cfgEn, 1);
      const enText = c.text.slice(c.text.search(/New skill learned|Heating up|Stars of the game/));
      check(`[${tag}] English: the card is English through and through, skill names included`, c.learned.length >= 1 && !CJK.test(enText), enText.slice(0, 140));
      check(`[${tag}] English: the epiphany reads "N straight games with M+ …"`, c.learned.every((r) => /^3 straight games with \d+\+ /.test(r.why)), JSON.stringify(c.learned.map((r) => r.why)));
      await looks(page, tag, "English", c);
      await shoot(page, `${OUT}/${tag}-english.png`);
      check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | "));
      await page.close();
    }
  } catch (error) {
    check(`[${vp}] the run did not crash`, false, String(error.message).split("\n")[0]);
  }
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
