// My Team Clubhouse view-model: real data in, honest page out. No DOM; the browser behaviour is covered by the QA script.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { PLAYERS, overall, seasonToCard } = await import("../js/data/players.js");
const { buildCareerSpanIndex } = await import("../js/data/careerArc.js");
const { playerSlotPos } = await import("../js/engine/gameplan.js");

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
PLAYERS.push(...ROWS.map(seasonToCard));

const { arrangeStarters, SLOTS, primaryAction, titleBreakdown, collectionTiles, skillNames, buildClubhouse, FILTER_DEFAULT } = await import("../js/ui/clubhouse/clubhouseModel.js");
const { clubhouseHtml, esc } = await import("../js/ui/clubhouse/clubhouseView.js");
const { createAccount, getAccount, saveAccount } = await import("../js/data/account.js");

const best = (n) => {
  const seen = new Set();
  return [...PLAYERS].sort((a, b) => overall(b) - overall(a)).filter((p) => (seen.has(p.bref) ? false : (seen.add(p.bref), true))).slice(0, n);
};
const mk = (name, n, extra = {}) => { const a = createAccount(name); saveAccount({ ...getAccount(a.id), playerIds: best(n).map((p) => p.id), ...extra }); return getAccount(a.id); };
const L = (zh) => zh;

test("arrangeStarters: natural slot first, leftovers fill empty slots, never drops or duplicates anyone", () => {
  const five = best(40).filter((p, i, a) => a.findIndex((q) => q.pos === p.pos) === i).slice(0, 3);
  const dupPos = [...five, { ...five[0], id: "twin-1" }, { ...five[1], id: "twin-2" }];
  const out = arrangeStarters(dupPos);
  assert.deepEqual(out.map((s) => s.slot), SLOTS);
  const placed = out.map((s) => s.card?.id).filter(Boolean);
  assert.equal(placed.length, 5, "all five placed");
  assert.equal(new Set(placed).size, 5, "none twice");
  assert.equal(arrangeStarters([]).every((s) => s.card === null), true);
});

test("primaryAction: signin / resume / again / start / build / draw", () => {
  assert.equal(primaryAction({ account: null }).kind, "signin");
  const acc = { id: "a" };
  assert.equal(primaryAction({ account: acc, season: { exists: true, done: false, label: "x" }, eligible: true, owned: 12 }).kind, "resume");
  assert.deepEqual(primaryAction({ account: acc, season: { exists: true, done: true, variant: "full" }, eligible: true, owned: 12 }), { kind: "again", variant: "full" });
  assert.equal(primaryAction({ account: acc, season: null, eligible: true, owned: 12 }).kind, "start");
  assert.equal(primaryAction({ account: acc, season: null, eligible: false, owned: 9 }).kind, "build", "enough cards but a broken lineup -> fix it");
  const d = primaryAction({ account: acc, season: null, eligible: false, owned: 3 });
  assert.equal(d.kind, "draw");
  assert.equal(d.needed, 5, "8 minimum - 3 owned");
});

test("titles are counted per variant and a 20-game title is never merged into an 82-game one", () => {
  const recs = [{ champion: true, variant: "quick" }, { champion: true, variant: "quick" }, { champion: true, variant: "full" }, { champion: false, variant: "full" }];
  assert.deepEqual(titleBreakdown(recs), { quick: 2, full: 1 });
});

test("a no-card account: zero everything, draw action, no invented hero data", () => {
  const acc = mk("None", 0);
  const m = buildClubhouse({ account: acc });
  assert.equal(m.owned, 0);
  assert.equal(m.hero.titles, 0);
  assert.equal(m.hero.featured, null);
  assert.equal(m.primary.kind, "draw");
  assert.equal(m.starters.every((s) => s.card === null), true);
});

test("hero reads ONLY this account's records: titles, latest, featured star come from them", () => {
  const acc = mk("Champ", 15);
  const star = best(1)[0];
  const rec = (id, champion, extra = {}) => ({ seasonId: id, variant: "quick", games: 20, w: 15, l: 5, champion, finish: champion ? "champion" : "playoffs", rank: 1, star: { name: star.name, ppg: 30.1 }, finishedAt: 1, ...extra });
  const withTitles = { ...acc, myTeamSeasons: [rec("s2", true, { year: 2027 }), rec("s1", false)] };
  const m = buildClubhouse({ account: withTitles });
  assert.equal(m.hero.titles, 1);
  assert.equal(m.hero.latest.seasonId, "s2");
  assert.equal(m.hero.featured?.name, star.name, "the title-run star is matched to a card the player actually owns");
  const other = buildClubhouse({ account: mk("Other", 15) });
  assert.equal(other.hero.titles, 0, "another account's records never leak in");
  // a star the player no longer owns is not conjured out of nowhere
  const gone = buildClubhouse({ account: { ...withTitles, myTeamSeasons: [rec("s3", true, { star: { name: "Nobody Atall", ppg: 9 } })] } });
  assert.equal(gone.hero.featured, null);
});

test("collection tiles: every owned card appears once; filters and sorts are real", () => {
  const acc = mk("Wall", 15);
  const m = buildClubhouse({ account: acc });
  assert.equal(m.tiles.length, 15);
  assert.equal(new Set(m.tiles.map((t) => t.card.id)).size, 15);
  assert.equal(m.tiles.filter((t) => t.starter).length, 5);
  assert.ok(m.tiles.filter((t) => t.onRoster).length <= 12);
  const ovrs = m.tiles.map((t) => overall(t.card));
  assert.deepEqual(ovrs, [...ovrs].sort((a, b) => b - a), "default sort is OVR high to low");
  const centers = collectionTiles(m.cards, m.draft, { ...FILTER_DEFAULT, pos: "C" });
  assert.ok(centers.length > 0 && centers.length < m.tiles.length, "the filter must actually remove cards");
  assert.ok(centers.every((t) => playerSlotPos(t.card) === "C"));
  const dec = m.decades[0];
  const inDec = collectionTiles(m.cards, m.draft, { ...FILTER_DEFAULT, decade: dec });
  assert.ok(inDec.length > 0 && inDec.every((t) => Math.floor(t.card.season / 10) * 10 === dec));
  const bySeason = collectionTiles(m.cards, m.draft, { ...FILTER_DEFAULT, sort: "season" }).map((t) => Number(t.card.season));
  assert.deepEqual(bySeason, [...bySeason].sort((a, b) => b - a));
});

test("skill names are real and bilingual: only skills the card has, English from SKILL_EN", () => {
  const card = best(1)[0];
  const zh = skillNames(card, "zh", 5);
  const en = skillNames(card, "en", 5);
  assert.equal(zh.length, en.length);
  assert.ok(en.every((n) => !/[\u4e00-\u9fff]/.test(n)), `English skill names must not contain Chinese: ${en}`);
  assert.deepEqual(skillNames({ skills: [] }, "zh"), []);
  assert.deepEqual(skillNames({ skills: ["not_a_skill"] }, "zh"), [], "unknown ids are dropped, never shown raw");
});

test("every skill in the game has an English name (no Chinese ever leaks into the English Clubhouse)", async () => {
  const { SKILL_PACKS } = await import("../js/data/skills.js");
  const { SKILL_EN } = await import("../js/i18n.js");
  const missing = Object.keys(SKILL_PACKS).filter((id) => !SKILL_EN[id]);
  assert.deepEqual(missing, []);
});

test("the page escapes user text and renders both languages without throwing", () => {
  const acc = { ...mk("<img src=x onerror=1>", 15) };
  const html = clubhouseHtml(buildClubhouse({ account: acc }), { pick: null, notice: "", openRecord: null, filter: FILTER_DEFAULT }, L);
  assert.ok(!html.includes("<img src=x onerror=1>"), "account name is escaped");
  assert.ok(html.includes("&lt;img src=x onerror=1&gt;"));
  assert.equal(esc(`"'<&>`), "&quot;&#39;&lt;&amp;&gt;");
  const en = clubhouseHtml(buildClubhouse({ account: acc, lang: "en" }), { pick: null, notice: "", openRecord: null, filter: FILTER_DEFAULT }, (zh, e) => e);
  assert.ok(!/[\u4e00-\u9fff]/.test(en.replace(/&#\d+;/g, "")), "English page has no Chinese");
});
