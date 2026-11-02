// Browser E2E for the 排兵布阵 board (default rotation) and its "已领悟" badge. A REAL managed career, driven
// through the real buttons; every claim on the board is reconciled against what the page / the SAVE says:
// the minute budget equals the sum of the inputs, starters in the top section are exactly the ticked boxes,
// a saved rotation survives a reload, and the learned badge matches the C3 ledger skill for skill.
// Usage: [QA_VIEWPORT=desktop|mobile] node scripts/qa/career-rotation.mjs [outDir] [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, lowContrast, noOverflow, overflowers, SEASON_HUB_BASE, shoot, textContrast } from "./lib/page.mjs";
import { openCareer, resumeToHub } from "./lib/career.mjs";

const OUT = process.argv[2] || "/tmp/cls-qa/rotation";
const BASE = process.argv[3] || "http://127.0.0.1:5173/";
mkdirSync(OUT, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const report = [];
const check = (label, ok, detail = "") => report.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ executablePath: EXE });
const ALL = [["desktop", 1280, 800], ["mobile", 390, 844]];
const SIZES = process.env.QA_VIEWPORT ? ALL.filter(([tag]) => tag === process.env.QA_VIEWPORT) : ALL;

const openBoard = async (page) => {
  await page.click('[data-season-tab="rotation"]');
  await page.waitForSelector("#season-rotation .rot-row", { timeout: 15000 });
};
const reopen = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await resumeToHub(page); await openBoard(page); };

/** Everything the board shows, in one read. */
const board = (page) => page.evaluate(() => {
  const q = (sel) => document.querySelector(`#season-rotation ${sel}`);
  const rows = [...document.querySelectorAll("#season-rotation .rot-row")];
  const idsIn = (sel) => [...document.querySelectorAll(`#season-rotation ${sel} .rot-row`)].map((r) => r.dataset.id);
  const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
  const mins = rows.map((r) => ({ id: r.dataset.id, min: Number(r.querySelector(".rot-min").value), bar: r.querySelector(".rot-bar").style.getPropertyValue("--m"), ovr: Number(text(r.querySelector(".rot-ovr"))) }));
  return {
    rows: rows.length,
    starters: idsIn(".rot-section-starters"),
    bench: idsIn(".rot-section-bench"),
    startersHead: text(q(".rot-section-starters h5")),
    startersFull: !!q(".rot-section-starters h5 em.full"),
    benchHead: text(q(".rot-section-bench h5")),
    empty: !!q(".rot-empty"),
    ticked: rows.filter((r) => r.querySelector(".rot-start-cb").checked).map((r) => r.dataset.id),
    mins,
    sum: mins.reduce((s, m) => s + m.min, 0),
    budgetTotal: Number(q(".rot-budget-top strong")?.firstChild?.textContent),
    budgetText: text(q(".rot-budget-top span")),
    budgetClass: q(".rot-budget")?.className || "",
    fit: text(q(".rot-stat strong")),
    tired: rows.filter((r) => r.querySelector(".rot-tired")).length,
  };
});

const saved = (page) => page.evaluate(() => {
  const root = JSON.parse(localStorage.getItem("cls_root_v3"));
  const season = root.leagueCareer.season;
  const team = season.teams[season.userTeamId];
  return {
    roster: team.players.length,
    starterIds: team.starterIds || team.rotation?.starterIds || [],
    rotation: team.rotation ? { starterIds: team.rotation.starterIds, minutes: Object.fromEntries(team.players.map((p) => [p.id, p.targetMinutes])) } : null,
    ledger: root.leagueCareer.management.epiphany || {},
    brefs: Object.fromEntries(team.players.map((p) => [p.id, p.bref])),
  };
});

/** One line box only: a number and its unit never wrap apart. */
const unbrokenAll = (page, sel, root = "#season-rotation") => page.$$eval(`${root} ${sel}`, (els) => els.length > 0 && els.every((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size === 1));

const setMinutes = async (page, id, value) => {
  const input = page.locator(`#season-rotation .rot-row[data-id="${id}"] .rot-min`);
  await input.fill(String(value));
  await input.blur(); // `change` fires on blur; the board then re-renders
  await page.waitForTimeout(80);
};

for (const [tag, width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  const dialogs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });

  // ------------------------------------------------------------------ a fresh career: nobody picked yet
  await openCareer(page, BASE, {});
  await openBoard(page);
  let b = await board(page);
  const s0 = await saved(page);
  check(`[${tag}] one row per rostered player`, b.rows === s0.roster && b.rows > 5, `${b.rows} rows, roster ${s0.roster}`);
  check(`[${tag}] nobody is a starter yet: 0/5, the empty-state tells you what to do`, b.starters.length === 0 && /0\/5/.test(b.startersHead) && b.empty, b.startersHead);
  check(`[${tag}] with no starters the list is "全部球员", not a bench`, /全部球员/.test(b.benchHead) && b.bench.length === b.rows, b.benchHead);
  check(`[${tag}] lineup fit is a dash, not a number computed from nobody`, b.fit === "—", b.fit);
  check(`[${tag}] the minute budget total equals the sum of the inputs`, b.budgetTotal === b.sum, `${b.budgetTotal} vs ${b.sum}`);
  const gap = 240 - b.sum;
  check(`[${tag}] the budget says what is missing (or over, or exact)`, gap === 0 ? /刚好 240/.test(b.budgetText) : gap > 0 ? new RegExp(`还有 ${gap} 分钟没分配`).test(b.budgetText) && /short/.test(b.budgetClass) : new RegExp(`多排了 ${-gap} 分钟`).test(b.budgetText) && /over/.test(b.budgetClass), `${b.budgetText} (gap ${gap})`);
  check(`[${tag}] every minutes bar is drawn against 48`, b.mins.every((m) => Math.abs(parseFloat(m.bar) - Math.min(100, (m.min / 48) * 100)) < 0.2), b.mins.slice(0, 3).map((m) => `${m.min}→${m.bar}`).join(" "));
  check(`[${tag}] the stamina warning is not on every row (it only shows where it matters)`, b.tired < b.rows, `${b.tired}/${b.rows} rows warn`);
  const scrolls = await page.evaluate(() => [document.querySelector("#season-rotation"), ...document.querySelectorAll("#season-rotation .rot-list")].filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY)).length);
  check(`[${tag}] no scroll box inside the page (the page scrolls, the list never does)`, scrolls === 0, `${scrolls} nested scroll boxes`);
  check(`[${tag}] no horizontal overflow`, await noOverflow(page), (await overflowers(page)).join(" | "));
  for (const sel of [".rot-attr", ".rot-ovr", ".rot-min-box", ".rot-stat", ".rot-budget-top strong"]) {
    check(`[${tag}] ${sel} never wraps`, await unbrokenAll(page, sel));
  }
  check(`[${tag}] the season header's save / abandon buttons never break (保存赛 / 季)`, await page.$$eval(".season-hub-head .btn", (els) => els.length > 0 && els.every((el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size === 1 && el.getBoundingClientRect().height < 40)));
  if (width <= 900) {
    const sameRow = await page.$$eval("#season-rotation .rot-row", (rows) => rows.every((r) => Math.abs(r.querySelector(".rot-starter").getBoundingClientRect().top - r.querySelector(".rot-min-wrap").getBoundingClientRect().top) < 14));
    check(`[${tag}] on a phone the 首发 toggle sits beside the minutes (one row less per player)`, sameRow);
  }
  const low = await lowContrast(page, "#season-rotation", [".rot-attr", ".rot-attr b", ".rot-attr.hi", ".rot-year", ".rot-sub", ".rot-tired", ".rot-budget-top span", ".rot-budget-top small", ".rot-budget-key span", ".rot-section h5 em", ".rot-empty", ".rot-stat em", ".rot-card h4 small", ".rot-card .tiny", ".rot-field", ".rot-min-box"]);
  check(`[${tag}] every text on the board is AA (4.5:1)`, low.length === 0, low.slice(0, 4).join(" | "));
  await shoot(page, `${OUT}/${tag}-fresh.png`);

  // ------------------------------------------------------------------ picking the five
  await page.click("#btn-rot-top5");
  b = await board(page);
  check(`[${tag}] "OVR 前五当首发": five starters on top, the header says 5/5 and marks it full`, b.starters.length === 5 && /5\/5/.test(b.startersHead) && b.startersFull && !b.empty, b.startersHead);
  check(`[${tag}] the section heading becomes 替补轮换 once someone starts`, /替补轮换/.test(b.benchHead) && b.bench.length === b.rows - 5, b.benchHead);
  check(`[${tag}] the ticked boxes are exactly the rows in the starters section`, [...b.ticked].sort().join() === [...b.starters].sort().join());
  const ovrOf = Object.fromEntries(b.mins.map((m) => [m.id, m.ovr]));
  check(`[${tag}] the five are the five best by OVR`, Math.min(...b.starters.map((id) => ovrOf[id])) >= Math.max(...b.bench.map((id) => ovrOf[id])), `starters ${b.starters.map((id) => ovrOf[id]).join(",")}`);
  const minOf = Object.fromEntries(b.mins.map((m) => [m.id, m.min]));
  check(`[${tag}] within a section the most-minutes player comes first`, [b.starters, b.bench].every((ids) => ids.every((id, i) => i === 0 || minOf[ids[i - 1]] >= minOf[id])));
  check(`[${tag}] with a full five the lineup fit is a real number`, /^\d+$/.test(b.fit), b.fit);
  check(`[${tag}] top 5 is only a draft: nothing is saved until 保存`, JSON.stringify((await saved(page)).starterIds) === JSON.stringify(s0.starterIds));

  const first = b.starters[0];
  await page.click(`#season-rotation .rot-row[data-id="${first}"] .rot-start-cb`);
  b = await board(page);
  check(`[${tag}] un-ticking a starter moves his row to the bench and drops the count to 4/5`, b.starters.length === 4 && b.bench.includes(first) && /4\/5/.test(b.startersHead) && !b.startersFull);
  check(`[${tag}] with only four starters the fit is a dash again`, b.fit === "—", b.fit);
  await page.click(`#season-rotation .rot-row[data-id="${first}"] .rot-start-cb`);
  b = await board(page);
  check(`[${tag}] ticking him back restores 5/5`, b.starters.length === 5 && b.starters.includes(first));

  // ------------------------------------------------------------------ a starter who plays less than a bench player
  const clashState = () => page.evaluate(() => ({
    rows: [...document.querySelectorAll("#season-rotation .rot-row .rot-clash")].map((el) => ({ id: el.closest(".rot-row").dataset.id, text: el.textContent.trim(), inStarters: !!el.closest(".rot-section-starters") })),
    head: document.querySelector("#season-rotation .rot-section-starters h5 em.warn")?.textContent.trim() || "",
    names: Object.fromEntries([...document.querySelectorAll("#season-rotation .rot-row")].map((r) => [r.dataset.id, r.querySelector(".rot-name strong").textContent])),
  }));
  // The rule, recomputed here from the inputs on the page: a starter strictly below the busiest bench player.
  const expectedClash = (rows) => {
    const top = Math.max(...rows.filter((m) => rows.bench.includes(m.id)).map((m) => m.min));
    return rows.filter((m) => rows.starters.includes(m.id) && m.min < top).map((m) => m.id).sort();
  };
  const readRows = async () => { const cur = await board(page); const rows = [...cur.mins]; rows.starters = cur.starters; rows.bench = cur.bench; return rows; };
  const flagged = async () => (await clashState()).rows.map((r) => r.id).sort();
  let rows = await readRows();
  // After "OVR top 5" the new starters can carry less than a bench player's default minutes: that is a TRUE warning.
  check(`[${tag}] the warning matches the rule exactly on the board as it stands (${expectedClash(rows).length} flagged)`, JSON.stringify(await flagged()) === JSON.stringify(expectedClash(rows)), `page ${await flagged()} vs rule ${expectedClash(rows)}`);
  const benchTop = rows.filter((m) => rows.bench.includes(m.id)).reduce((best, m) => (m.min > best.min ? m : best));
  for (const id of rows.starters) await setMinutes(page, id, benchTop.min); // every starter exactly level with the best bench player
  let cs = await clashState();
  check(`[${tag}] starters level with the best bench player (${benchTop.min} min): a tie is not a conflict, no warning anywhere`, cs.rows.length === 0 && cs.head === "", `${cs.rows.length} flagged, heading "${cs.head}"`);
  const victim = rows.starters[0];
  await setMinutes(page, victim, 8);
  rows = await readRows();
  cs = await clashState();
  check(`[${tag}] one starter set to 8 min is flagged, and only he is`, JSON.stringify(cs.rows.map((r) => r.id)) === JSON.stringify([victim]) && cs.rows[0].inStarters, `flagged ${cs.rows.map((r) => r.id)}`);
  const benchNow = rows.filter((m) => rows.bench.includes(m.id)).reduce((best, m) => (m.min > best.min ? m : best));
  check(`[${tag}] the row says who out-minutes him: 首发只排 8 分钟，替补 <name> 排了 ${benchNow.min}`, cs.rows[0]?.text === `首发只排 8 分钟，替补 ${cs.names[benchNow.id]} 排了 ${benchNow.min}`, cs.rows[0]?.text);
  check(`[${tag}] the starters heading counts them: 1 人分钟低于替补`, cs.head.includes("1 人分钟低于替补"), cs.head);
  const lowClash = await lowContrast(page, "#season-rotation", [".rot-clash", ".rot-section-starters h5 em.warn"]);
  check(`[${tag}] the warning text is AA, its heading chip never wraps, no horizontal overflow`, lowClash.length === 0 && (await unbrokenAll(page, ".rot-section-starters h5 em.warn")) && (await noOverflow(page)), lowClash.join(" | "));
  await shoot(page, `${OUT}/${tag}-clash.png`);
  await setMinutes(page, victim, benchTop.min);
  cs = await clashState();
  check(`[${tag}] putting his minutes back clears every warning`, cs.rows.length === 0 && cs.head === "", `${cs.rows.length} rows, heading "${cs.head}"`);
  dialogs.length = 0;
  const sixth = b.bench[0];
  await page.click(`#season-rotation .rot-row[data-id="${sixth}"] .rot-start-cb`);
  b = await board(page);
  check(`[${tag}] a sixth starter is refused, with a message, and the box un-ticks`, b.starters.length === 5 && !b.ticked.includes(sixth) && dialogs.some((m) => /最多 5 人/.test(m)), dialogs.join("|"));

  // ------------------------------------------------------------------ minutes
  const target = b.bench[0];
  const before = b.sum;
  const old = b.mins.find((m) => m.id === target).min;
  await setMinutes(page, target, 48);
  b = await board(page);
  const now = b.mins.find((m) => m.id === target);
  check(`[${tag}] typing 48 minutes: the input, the bar and the budget all follow`, now.min === 48 && parseFloat(now.bar) === 100 && b.budgetTotal === before - old + 48 && b.budgetTotal === b.sum, `${old}→${now.min}, bar ${now.bar}, total ${b.budgetTotal}`);
  // walk the total to exactly 240, then one over
  let diff = 240 - b.sum;
  for (const m of b.mins) {
    if (!diff) break;
    const delta = Math.max(8 - m.min, Math.min(48 - m.min, diff));
    if (delta) { await setMinutes(page, m.id, m.min + delta); diff -= delta; }
  }
  b = await board(page);
  check(`[${tag}] exactly 240 minutes reads "刚好 240" in the OK colour`, b.sum === 240 && /刚好 240/.test(b.budgetText) && /rot-budget-ok/.test(b.budgetClass), `${b.sum}: ${b.budgetText}`);
  const bump = b.mins.find((m) => m.min < 48);
  await setMinutes(page, bump.id, bump.min + 1);
  b = await board(page);
  check(`[${tag}] one minute too many says so, in the warning colour`, b.sum === 241 && /多排了 1 分钟/.test(b.budgetText) && /rot-budget-over/.test(b.budgetClass), b.budgetText);
  await setMinutes(page, bump.id, bump.min);
  b = await board(page);
  const expectMins = Object.fromEntries(b.mins.map((m) => [m.id, m.min]));
  const expectStarters = [...b.starters].sort();

  // ------------------------------------------------------------------ save, reload, it is still there
  dialogs.length = 0;
  await page.click("#btn-rot-save");
  check(`[${tag}] 保存默认轮换 confirms`, dialogs.some((m) => /已保存/.test(m)), dialogs.join("|"));
  const s1 = await saved(page);
  check(`[${tag}] the save holds the five and the minutes the board showed`, s1.rotation && [...s1.rotation.starterIds].sort().join() === expectStarters.join() && Object.entries(expectMins).every(([id, m]) => s1.rotation.minutes[id] === m));
  await reopen(page);
  b = await board(page);
  check(`[${tag}] after a reload the same five start`, [...b.starters].sort().join() === expectStarters.join() && b.starters.length === 5);
  check(`[${tag}] after a reload every player has the same minutes`, b.mins.every((m) => m.min === expectMins[m.id]) && b.sum === 240);
  await shoot(page, `${OUT}/${tag}-picked.png`);
  check(`[${tag}] no page errors so far`, errors.length === 0, errors.join(" | "));
  await page.close();

  // ------------------------------------------------------------------ the learned badge (C3 ledger)
  const p2 = await browser.newPage({ viewport: { width, height } });
  const errors2 = [];
  p2.on("pageerror", (e) => errors2.push(e.message));
  p2.on("dialog", (d) => d.accept());
  await openCareer(p2, BASE, { learnedSkills: true });
  await openBoard(p2);
  const s2 = await saved(p2);
  const expected = Object.fromEntries(Object.entries(s2.ledger).filter(([, v]) => v.learned.length).map(([bref, v]) => [bref, v.learned]));
  const shown = await p2.evaluate(() => [...document.querySelectorAll("#season-rotation .rot-row")].map((r) => ({
    id: r.dataset.id,
    badge: r.querySelector(".learned-badge")?.textContent.replace(/\s+/g, " ").trim() || "",
    title: r.querySelector(".learned-badge")?.getAttribute("title") || "",
    line: r.querySelector(".learned-line")?.textContent.replace(/\s+/g, " ").trim() || "",
  })));
  const names = await p2.evaluate(async () => {
    const { SKILL_PACKS } = await import("/js/data/skills.js");
    const { skillNameL } = await import("/js/i18n.js");
    return Object.keys(SKILL_PACKS).slice(0, 3).map((id) => skillNameL(SKILL_PACKS[id].name, "zh")); // the ids createCareerInPage seeded
  });
  const withBadge = shown.filter((r) => r.badge);
  check(`[${tag}] exactly the players with learned skills carry a badge`, withBadge.length === Object.keys(expected).length && withBadge.every((r) => expected[s2.brefs[r.id]]), `${withBadge.length} badges, ledger has ${Object.keys(expected).length}`);
  const two = shown.find((r) => s2.brefs[r.id] && expected[s2.brefs[r.id]]?.length === 2);
  const one = shown.find((r) => s2.brefs[r.id] && expected[s2.brefs[r.id]]?.length === 1);
  check(`[${tag}] two learned skills reads 已领悟 2/2, one reads 已领悟 1/2`, /已领悟 2\/2/.test(two?.badge || "") && /已领悟 1\/2/.test(one?.badge || ""), `${two?.badge} / ${one?.badge}`);
  check(`[${tag}] the badge and the line name the real skills, in the ledger's order`, names.slice(0, 2).every((n) => two.title.includes(n) && two.line.includes(n)) && one.title.includes(names[2]) && one.line.includes(names[2]), `${two?.title} | ${one?.title}`);
  check(`[${tag}] players without learned skills show nothing (no "0/2" clutter)`, shown.filter((r) => !withBadge.includes(r)).every((r) => !r.line));
  check(`[${tag}] the badge never wraps`, await unbrokenAll(p2, ".learned-badge"));
  const lowL = await lowContrast(p2, "#season-rotation", [".learned-badge", ".learned-line"]);
  check(`[${tag}] the badge text is AA`, lowL.length === 0, lowL.join(" | "));
  check(`[${tag}] no horizontal overflow with badges`, await noOverflow(p2), (await overflowers(p2)).join(" | "));
  await shoot(p2, `${OUT}/${tag}-learned.png`);

  // ---- the same badge on the other two pages that list the user's players
  const boardBadge = Object.fromEntries(shown.filter((r) => r.badge).map((r) => [r.id, r.badge]));
  const openTab = async (tabName, readySel) => { await p2.click(`[data-season-tab="${tabName}"]`); await p2.waitForSelector(readySel, { timeout: 15000 }); };
  // evaluation: one card per player, data-player-id; market: the roster rows carry a data-cut button with the id
  const evalRows = async () => p2.evaluate(() => [...document.querySelectorAll("#season-evaluation .roster-evaluation-card")].map((c) => ({ id: c.dataset.playerId, badge: c.querySelector(".learned-badge")?.textContent.replace(/\s+/g, " ").trim() || "", line: c.querySelector(".learned-line")?.textContent.replace(/\s+/g, " ").trim() || "" })));
  const marketRows = async () => p2.evaluate(() => [...document.querySelectorAll("#season-market .sm-row")].filter((r) => r.querySelector("[data-cut]")).map((r) => ({ id: r.querySelector("[data-cut]").dataset.cut, badge: r.querySelector(".learned-badge")?.textContent.replace(/\s+/g, " ").trim() || "", line: r.querySelector(".learned-line")?.textContent.replace(/\s+/g, " ").trim() || "" })));
  for (const [tabName, box, read] of [["evaluation", "#season-evaluation", evalRows], ["market", "#season-market", marketRows]]) {
    await openTab(tabName, `${box} .${tabName === "evaluation" ? "roster-evaluation-card" : "sm-row"}`);
    const rows = await read();
    const got = Object.fromEntries(rows.filter((r) => r.badge).map((r) => [r.id, r.badge]));
    check(`[${tag}] ${tabName}: exactly the players with learned skills carry the badge`, JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(boardBadge).sort()) && rows.length === shown.length, `${Object.keys(got).length} badges vs ${Object.keys(boardBadge).length} on the board; ${rows.length} rows vs ${shown.length}`);
    check(`[${tag}] ${tabName}: each badge reads exactly like the rotation board's`, Object.entries(got).every(([id, text]) => boardBadge[id] === text), Object.entries(got).filter(([id, text]) => boardBadge[id] !== text).map(([id, text]) => `${text} vs ${boardBadge[id]}`).join(" | "));
    check(`[${tag}] ${tabName}: the skills line names the same skills as the board's`, rows.filter((r) => r.badge).every((r) => r.line === shown.find((b) => b.id === r.id).line), "");
    check(`[${tag}] ${tabName}: badge never wraps, text is AA, no overflow`, (await unbrokenAll(p2, ".learned-badge", box)) && (await lowContrast(p2, box, [".learned-badge", ".learned-line"])).length === 0 && (await noOverflow(p2)), (await overflowers(p2)).join(" | "));
    if (tabName === "evaluation") {
      check(`[${tag}] evaluation: the recommendation label stays on one line`, await unbrokenAll(p2, ".roster-evaluation-card header > b", box));
    }
    await shoot(p2, `${OUT}/${tag}-learned-${tabName}.png`);
  }

  // ---- every visible text on every season tab, measured (no selector list that can forget an element)
  for (const tabName of ["standings", "rotation", "market", "evaluation", "schedule", "awards", "playoffs", "development", "history"]) {
    await p2.click(`[data-season-tab="${tabName}"]`);
    await p2.waitForTimeout(400);
    const bad = await textContrast(p2, `#season-${tabName}`, { under: SEASON_HUB_BASE });
    check(`[${tag}] ${tabName} tab: every visible text is AA (light cards must not inherit the dark hub's light ink)`, bad.length === 0, bad.slice(0, 4).join(" | "));
  }

  // ------------------------------------------------------------------ English
  await p2.evaluate(() => document.querySelector("#btn-lang").click());
  await openBoard(p2);
  const en = await p2.evaluate(() => {
    const box = document.querySelector("#season-rotation");
    const clone = box.cloneNode(true);
    clone.querySelectorAll(".rot-name strong, .photo-wrap, .rot-field select#rot-focus, #rot-tactic").forEach((el) => el.remove()); // names and tactic names are data
    const t = (sel) => (box.querySelector(sel)?.textContent || "").replace(/\s+/g, " ").trim();
    return { all: clone.textContent.replace(/\s+/g, " ").trim(), head: t(".rot-card h4"), sections: [...box.querySelectorAll(".rot-section h5")].map((h) => h.textContent.replace(/\s+/g, " ").trim()), badge: t(".learned-badge") };
  });
  check(`[${tag}] English: the board has no Chinese left (names aside)`, !CJK.test(en.all), (en.all.match(/.{0,12}[\u4e00-\u9fff]+.{0,12}/) || [""])[0]);
  check(`[${tag}] English: titles and badge read right`, /Rotation board/.test(en.head) && en.sections.some((s) => /Starting five/.test(s)) && /Learned [12]\/2/.test(en.badge), `${en.head} | ${en.sections.join(" / ")} | ${en.badge}`);
  check(`[${tag}] English: no horizontal overflow`, await noOverflow(p2), (await overflowers(p2)).join(" | "));
  for (const [tabName, box, read] of [["evaluation", "#season-evaluation", evalRows], ["market", "#season-market", marketRows]]) {
    await openTab(tabName, `${box} .${tabName === "evaluation" ? "roster-evaluation-card" : "sm-row"}`);
    const rows = (await read()).filter((r) => r.badge);
    check(`[${tag}] English ${tabName}: badge and line read in English`, rows.length > 0 && rows.every((r) => /^✦ ?Learned [12]\/2$/.test(r.badge) && /^Learned in play:/.test(r.line) && !CJK.test(r.badge)), rows.map((r) => r.badge).join(" | "));
  }
  await shoot(p2, `${OUT}/${tag}-english.png`);
  check(`[${tag}] no page errors on the learned / English pass`, errors2.length === 0, errors2.join(" | "));
  await p2.close();
}

await browser.close();
console.log(report.join("\n"));
const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
