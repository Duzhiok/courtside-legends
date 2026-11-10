// Clubhouse polish: the court places each starter by his own position, the champion season keeps its real starting five,
// the honours list never repeats or invents anything, and the hero offers the one sensible next step.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { installRealCards, realCards } = await import("./helpers/realGame.js");
const { overall } = await import("../js/data/players.js");
const { playerSlotPos } = await import("../js/engine/gameplan.js");
const court = await import("../js/myteam/courtSlots.js");
const rec = await import("../js/myteam/seasonRecord.js");
const view = await import("../js/ui/myTeamClubhouseView.js");
const { displayName } = await import("../js/ui/myTeamViewKit.js");

const STARS = ["curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01", "olajuha01", "garneke01"];
installRealCards(...STARS);
const peak = (bref) => realCards(bref).sort((a, b) => overall(b) - overall(a))[0];
const idsOf = (...brefs) => brefs.map((b) => peak(b).id);
const acct = (extra = {}) => ({ id: "acc-court", playerIds: idsOf(...STARS), cardMods: {}, gold: 5, ...extra });
const card = (pos, ovr = 80) => ({ id: `c-${pos}-${ovr}`, pos, playPos: pos, name: pos, _ovr: ovr });
const FIVE = [
  { id: "x1", bref: "a", name: "Aaa", nameEn: "Aaa", pos: "PG", ovr: 90, season: 1996, team: "CHI" },
  { id: "x2", bref: "b", name: "Bbb", nameEn: "Bbb", pos: "SG", ovr: 95, season: 1996, team: "CHI" },
  { id: "x3", bref: "c", name: "Ccc", nameEn: "Ccc", pos: "SF", ovr: 88, season: 1996, team: "CHI" },
  { id: "x4", bref: "d", name: "Ddd", nameEn: "Ddd", pos: "PF", ovr: 91, season: 1996, team: "CHI" },
  { id: "x5", bref: "e", name: "Eee", nameEn: "Eee", pos: "C", ovr: 93, season: 1996, team: "CHI" },
];
const record = (over = {}) => ({
  seasonId: `s-${Math.random()}`, variant: "quick", games: 20, w: 16, l: 4, champion: true, finish: "champion",
  rank: 1, star: { name: "Zed Star", ppg: 28.5 }, finishedAt: Date.now(), ...over,
});

test("court geometry: C under the rim, forwards on the elbows, guards out front, left/right as designed", () => {
  const { C, PF, SF, PG, SG } = court.COURT_SLOTS;
  assert.ok(C.top < PF.top && C.top < SF.top, "C is the closest to the basket (top)");
  assert.ok(PG.top > PF.top && SG.top > SF.top, "guards are farther from the basket than forwards");
  assert.ok(PF.left < SF.left && PG.left < SG.left, "PF/PG left, SF/SG right");
  assert.equal(C.left, 50);
});

test("assignCourtSlots: position decides the spot, never the order of the list", () => {
  const five = [card("PG"), card("SG"), card("SF"), card("PF"), card("C")];
  const pos = (c) => c.pos;
  const forward = court.assignCourtSlots(five, pos);
  const reversed = court.assignCourtSlots([...five].reverse(), pos);
  for (const p of court.SLOT_ORDER) {
    assert.equal(forward[p].pos, p);
    assert.equal(reversed[p].pos, p, "PG→C and C→PG input give the same court (the old bug swapped them)");
  }
});

test("assignCourtSlots: two claims on one spot — the stronger keeps it, the other takes the nearest free spot", () => {
  const strong = card("SG", 95); const weak = card("SG", 70);
  const placed = court.assignCourtSlots([weak, strong, card("PG"), card("PF"), card("C")], (c) => c.pos, (c) => c._ovr);
  assert.equal(placed.SG, strong);
  assert.equal(placed.SF, weak, "SG's nearest free neighbour is SF");
  assert.deepEqual(Object.values(placed).filter(Boolean).length, 5, "everyone is placed once");
});

test("assignCourtSlots: fewer than five leaves honest gaps and never mutates the input", () => {
  const three = Object.freeze([card("PG"), card("C"), card("SF")]);
  const placed = court.assignCourtSlots(three, (c) => c.pos);
  assert.equal(placed.SG, null);
  assert.equal(placed.PF, null);
  assert.equal(court.assignCourtSlots(null, (c) => c.pos).C, null);
});

test("the rendered court puts each real starter inside the slot of his own position", () => {
  const s = view.clubhouseSummary(acct());
  const html = view.clubhouseHtml({ summary: s, lang: "zh" });
  for (const m of html.matchAll(/data-slot="(\w+)"[^>]*>\s*<div class="mtc-court-card" data-card="([^"]+)" data-pos="(\w+)"/g)) {
    assert.equal(m[1], m[3], `starter ${m[2]} stands in the ${m[3]} slot`);
  }
  assert.equal((html.match(/mtc-court-card"/g) || []).length, 5);
});

test("startingFiveSnapshot copies the season's own five; a partial or missing five is null, never reconstructed", () => {
  const cards = idsOf(...STARS).map((id) => realCards(STARS.find((b) => peak(b).id === id)).find((c) => c.id === id));
  const st = { userTeamId: "LAS", teams: { LAS: { players: cards, starterIds: cards.slice(0, 5).map((c) => c.id) } }, myTeam: { start: { starterIds: [] } } };
  const snap = rec.startingFiveSnapshot(st);
  assert.equal(snap.length, 5);
  assert.deepEqual(snap.map((e) => e.id), st.teams.LAS.starterIds);
  for (const e of snap) {
    assert.ok(court.SLOT_ORDER.includes(e.pos));
    assert.equal(e.ovr, overall(cards.find((c) => c.id === e.id)));
    assert.equal(e.pos, playerSlotPos(cards.find((c) => c.id === e.id)));
  }
  assert.equal(rec.startingFiveSnapshot({ ...st, teams: { LAS: { players: cards.slice(0, 3), starterIds: st.teams.LAS.starterIds } } }), null, "only 3 of 5 resolvable → null");
  assert.equal(rec.startingFiveSnapshot({ userTeamId: "LAS", teams: {} }), null);
  assert.equal(rec.startingFiveSnapshot(null), null);
  const done = { ...st, phase: "done", standings: { LAS: { w: 15, l: 5 } }, playoffs: { championId: "LAS" }, myTeam: { seasonId: "s1", rules: { variant: "quick", seasonLength: 20 }, start: { starterIds: [] } } };
  assert.equal(rec.myTeamResult(done).lineup.length, 5, "the finished-season record carries the five");
});

test("recordLineup accepts a full valid five only; damaged data reads as 'no lineup'", () => {
  assert.equal(rec.recordLineup({ lineup: FIVE }).length, 5);
  assert.deepEqual(rec.recordLineup({}), []);
  assert.deepEqual(rec.recordLineup({ lineup: FIVE.slice(0, 4) }), []);
  assert.deepEqual(rec.recordLineup({ lineup: [...FIVE.slice(0, 4), { id: "x5", name: "E", pos: "XX", ovr: 9 }] }), []);
  assert.deepEqual(rec.recordLineup({ lineup: [...FIVE.slice(0, 4), { id: 5, name: "E", pos: "C", ovr: 9 }] }), []);
});

test("honours: each season once, no duplicated star line, champion opens to ITS saved five (even if no longer owned)", () => {
  const withFive = record({ lineup: FIVE });
  const legacy = record({ finishedAt: Date.now() - 1e9 });
  const miss = record({ champion: false, finish: "missed", w: 7, l: 13, star: { name: "Zed Star", ppg: 20 } });
  const s = view.clubhouseSummary(acct({ myTeamSeasons: [withFive, legacy, miss] }));
  const html = view.clubhouseHtml({ summary: s, lang: "zh" });
  assert.equal((html.match(/class="mtc-season[ "]/g) || []).length, 3, "three seasons, three rows — no second list");
  assert.doesNotMatch(html, /PTS/, "the star line is no longer printed twice");
  assert.equal((html.match(/<details>/g) || []).length, 1, "only the champion that saved a lineup is expandable");
  assert.equal((html.match(/mtc-five-card/g) || []).length, 5);
  for (const e of FIVE) assert.ok(html.includes(`>${e.name}<`) && html.includes(`data-card="${e.id}"`), `${e.name} comes from the record`);
  assert.match(html, /当年首发/);
  assert.doesNotMatch(html, /没有存档|not stored/);
});

test("honours: a champion without a saved lineup shows only its real result — no names, no 'lineup' control", () => {
  const html = view.clubhouseHtml({ summary: view.clubhouseSummary(acct({ myTeamSeasons: [record()] })), lang: "zh" });
  assert.match(html, /is-champion/);
  assert.doesNotMatch(html, /<details>|mtc-five|当年首发/);
});

test("hero: one context-sensitive primary action", () => {
  const act = (s, resume) => (view.clubhouseHtml({ summary: s, resume, lang: "zh" }).match(/class="btn primary mtc-hero-cta" data-act="([\w-]+)">([^<]+)</) || []).slice(1);
  assert.deepEqual(act(view.clubhouseSummary(acct())), ["start-quick", "开始我的第一个赛季 · 20 场"]);
  assert.deepEqual(act(view.clubhouseSummary(acct({ myTeamSeasons: [record({ variant: "full" })] }))), ["start-full", "再来一季 · 82 场"]);
  const live = view.clubhouseSummary(acct(), { season: { myTeam: {} }, report: null });
  assert.deepEqual(act(live, "第 8 场 · 5胜2负"), ["resume-season", "继续我的赛季"]);
  assert.deepEqual(act(view.clubhouseSummary(acct({ playerIds: idsOf("curryst01") }))), ["edit-lineup", "去补齐阵容"]);
});

test("hero: the featured player is the saved champion core, else today's best starter — labelled honestly", () => {
  const saved = view.clubhouseHtml({ summary: view.clubhouseSummary(acct({ myTeamSeasons: [record({ lineup: FIVE })] })), lang: "zh" });
  assert.match(saved, /冠军核心<\/small><strong>Bbb<\/strong><span>OVR 95/, "highest-OVR member of the saved five");
  const legacy = view.clubhouseHtml({ summary: view.clubhouseSummary(acct({ myTeamSeasons: [record()] })), lang: "zh" });
  assert.match(legacy, /当前头号球星/);
  assert.doesNotMatch(legacy, /冠军核心/, "no champion-core claim without a saved lineup");
  const none = view.clubhouseHtml({ summary: view.clubhouseSummary(acct()), lang: "zh" });
  assert.match(none, /头号球星/);
  assert.doesNotMatch(none, /🏆|<svg class="mtc-trophy"/, "no trophy before a title");
});

test("names are NFC-normalised (decomposed 'Jokic'+acute draws as one letter) and the English view stays Latin", () => {
  assert.equal(displayName({ name: "Jokic\u0301" }, "zh"), "Joki\u0107");
  assert.equal(displayName({ name: "x", nameEn: "Joki\u0107" }, "en"), "Joki\u0107");
  const en = view.clubhouseHtml({ summary: view.clubhouseSummary(acct({ myTeamSeasons: [record({ lineup: FIVE })] })), lang: "en" });
  assert.doesNotMatch(en, /[\u4e00-\u9fff]/);
});
