// My Team lineup editor (ADR-010 T1): guest guidance, read-only open, edit/save/reload/clear, twin replacement,
// ranked entry untouched, English, touch targets, contrast, no overflow. Desktop + mobile.
// Usage: node scripts/qa/my-team-lineup.mjs /tmp/cls-qa/mtl [http://127.0.0.1:5188/]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { CJK, homeActive, noOverflow, shoot, text, textContrast } from "./lib/page.mjs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = process.argv[2] || "/tmp/cls-qa/mtl";
const BASE = process.argv[3] || "http://127.0.0.1:5188/";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });
const out = [];
const check = (l, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`);
const ACC = () => localStorage.getItem("cls_accounts_v1");
const reload = async (page) => { await page.reload({ waitUntil: "domcontentloaded" }); await homeActive(page); };
const openEditor = async (page) => {
  await page.click('.home-tab[data-category="players"]');
  await page.click("#btn-open-my-lineup");
  await page.waitForSelector("#screen-my-team-lineup.active");
};
const counts = (page) => page.$eval(".mtl-counts", (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => "");

/** Seed an account with 10 distinct strong players plus a second card of the best one (a "twin"). */
const seed = (page) => page.evaluate(async () => {
  const { PLAYERS, overall } = await import("/js/data/players.js");
  const { createAccount, getAccount, saveAccount } = await import("/js/data/account.js");
  const sorted = [...PLAYERS].sort((a, b) => overall(b) - overall(a));
  const seen = new Set();
  const ids = [];
  for (const p of sorted) { if (!seen.has(p.bref)) { seen.add(p.bref); ids.push(p.id); } if (ids.length === 10) break; }
  const top = sorted[0];
  const twin = sorted.find((p) => p.bref === top.bref && p.id !== top.id);
  const acc = createAccount("QA 阵容");
  saveAccount({ ...getAccount(acc.id), playerIds: [...ids, twin.id], coachId: null });
  return { ids, twin: twin.id, topId: top.id };
});

for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await reload(page);

  // 1. Guest: guidance only
  await page.click('.home-tab[data-category="players"]');
  check(`[${tag}] entry button on the My Players tab`, await page.$eval("#btn-open-my-lineup", (el) => el.getBoundingClientRect().height > 0));
  check(`[${tag}] ranked entry untouched`, !!(await page.$('.mode-card[data-mode="ranked"]')));
  await openEditor(page);
  check(`[${tag}] guest sees guidance, no editor`, !!(await page.$(".mtl-guest")) && !(await page.$(".mtl-list")));
  check(`[${tag}] guest: create-account button`, !!(await page.$('.mtl-guest [data-act="accounts"]')));
  check(`[${tag}] guest: no overflow`, await noOverflow(page));
  await page.click("#btn-my-lineup-back");

  // 2. Account with cards: opening writes nothing
  const seeded = await seed(page);
  await reload(page);
  const before = await page.evaluate(ACC);
  await openEditor(page);
  const afterOpen = await page.evaluate(ACC);
  check(`[${tag}] opening the editor did not write the account`, before === afterOpen);
  const rows = await page.$$eval(".mtl-row", (els) => els.length);
  check(`[${tag}] one row per owned card (10 players + a twin)`, rows === 11, `${rows}`);
  const c0 = await counts(page);
  check(`[${tag}] auto lineup: 10 on roster, 5 starters`, /10\/12/.test(c0) && /5\/5/.test(c0), c0);
  check(`[${tag}] auto lineup is eligible`, (await text(page, ".mtl-status")).includes("可以开赛季"));
  check(`[${tag}] Save disabled while nothing changed`, await page.$eval('[data-act="save"]', (b) => b.disabled));
  check(`[${tag}] touch targets >= 44px`, await page.$$eval(".mtl-pick, .mtl-star", (els) => els.every((e) => e.getBoundingClientRect().height >= 44 && (e.getBoundingClientRect().width >= 44))));
  check(`[${tag}] no overflow`, await noOverflow(page));
  const under = await page.evaluate(() => {
    for (const el of [document.querySelector("#screen-my-team-lineup"), document.body, document.documentElement]) {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number);
      if (m.length < 4 || m[3] > 0) return m.slice(0, 3);
    }
    return [255, 255, 255];
  });
  const low = await textContrast(page, "#screen-my-team-lineup", { min: 4.5, under });
  check(`[${tag}] text contrast >= 4.5 (backdrop ${under.join(",")})`, low.length === 0, low.join(" | "));
  await shoot(page, `${OUT}/${tag}-editor.png`);

  // 3. Twin: tapping the second card of the same person replaces, never duplicates
  await page.click(`.mtl-row[data-card="${seeded.twin}"] [data-act="roster"]`);
  const afterTwin = await page.$$eval(".mtl-row.in", (els) => els.map((e) => e.dataset.card));
  check(`[${tag}] twin replaced the first card (roster still 10, one of the pair)`, afterTwin.length === 10 && afterTwin.includes(seeded.twin) && !afterTwin.includes(seeded.topId), afterTwin.length);
  check(`[${tag}] twin swap did not write`, (await page.evaluate(ACC)) === before);

  // 4. Edit to an incomplete lineup: explained, still editable and saveable
  const inRoster = await page.$$eval(".mtl-row.in", (els) => els.map((e) => e.dataset.card));
  for (const id of inRoster.slice(-3)) await page.click(`.mtl-row[data-card="${id}"] [data-act="roster"]`);
  check(`[${tag}] 7 on roster`, /7\/12/.test(await counts(page)), await counts(page));
  const status = await text(page, ".mtl-status");
  check(`[${tag}] says it is not ready but editable`, status.includes("还不能开赛季"), status);
  check(`[${tag}] explains what is missing`, (await text(page, ".mtl-issues")).includes("名单还差 1 人"));
  check(`[${tag}] Save enabled after an edit`, !(await page.$eval('[data-act="save"]', (b) => b.disabled)));

  // 5. Save persists only the new field, and survives a reload
  const pre = JSON.parse(await page.evaluate(ACC));
  await page.click('[data-act="save"]');
  const post = JSON.parse(await page.evaluate(ACC));
  const a0 = pre.accounts[0], a1 = post.accounts[0];
  check(`[${tag}] Save wrote myTeamLineup (7 cards)`, a1.myTeamLineup?.rosterIds?.length === 7);
  const { myTeamLineup: _m, ...rest1 } = a1;
  check(`[${tag}] cards / gold / coach untouched by Save`, JSON.stringify(rest1) === JSON.stringify(a0));
  await reload(page);
  await openEditor(page);
  check(`[${tag}] saved lineup restored after reload (7)`, /7\/12/.test(await counts(page)), await counts(page));
  check(`[${tag}] says it loaded the saved lineup`, (await text(page, ".mtl-note")).includes("已载入你保存的阵容"));

  // 6. Reset removes just that field
  await page.click('[data-act="reset"]');
  const cleared = JSON.parse(await page.evaluate(ACC)).accounts[0];
  check(`[${tag}] Clear removed myTeamLineup`, !("myTeamLineup" in cleared));
  check(`[${tag}] automatic lineup back (10)`, /10\/12/.test(await counts(page)));

  // 7. Ranked default unchanged by all of the above
  const rankedTeam = await page.evaluate(async () => {
    const { accountToTeam, getAccount } = await import("/js/data/account.js");
    return accountToTeam(getAccount()).players.length;
  });
  check(`[${tag}] ranked team still the auto best <= 12`, rankedTeam === 10, `${rankedTeam}`);

  // 8. English: flip the language while the editor is open (live refresh), the draft must survive
  const firstRow = await page.$eval(".mtl-row.in", (e) => e.dataset.card);
  await page.click(`.mtl-row[data-card="${firstRow}"] [data-act="roster"]`); // unsaved edit: 9 on roster
  await page.click("#btn-lang");
  const en = await text(page, "#screen-my-team-lineup");
  check(`[${tag}] English: no Chinese left on the screen`, !CJK.test(en), CJK.test(en) ? en.match(CJK.source + ".{0,20}")?.[0] : "");
  check(`[${tag}] language flip kept the unsaved draft (9 on roster)`, /9\/12/.test(await counts(page)), await counts(page));
  check(`[${tag}] English labels present`, en.includes("Save lineup") && en.includes("Roster") && en.includes("Starters"));
  await shoot(page, `${OUT}/${tag}-editor-en.png`);
  await page.click("#btn-lang");
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}

await browser.close();
console.log(out.join("\n"));
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
