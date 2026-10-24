import test from "node:test";
import assert from "node:assert/strict";
import {
  SANDBOX_MAX,
  SANDBOX_MIN,
  addToSide,
  buildSandboxTeam,
  fillWithCopies,
  removeFromSide,
} from "../js/modes/sandboxDuel.js";
import { searchCards, searchPeople, parseQuery } from "../js/data/cardSearch.js";

const JORDAN_91 = { id: "jordami01-1991-chi", bref: "jordami01", name: "迈克尔·乔丹", nameEn: "Michael Jordan", season: 1991, team: "CHI", pos: "SG", ovr: 98, skills: [] };
const JORDAN_96 = { ...JORDAN_91, id: "jordami01-1996-chi", season: 1996, ovr: 97 };
const KOBE_06 = { id: "bryanko01-2006-lal", bref: "bryanko01", name: "科比·布莱恩特", nameEn: "Kobe Bryant", season: 2006, team: "LAL", pos: "SG", ovr: 96, skills: [] };
const POOL = [JORDAN_91, JORDAN_96, KOBE_06];
const ovrOf = (p) => p.ovr;

test("query parsing treats a 4-digit token as the season", () => {
  assert.deepEqual(parseQuery("乔丹 1991"), { terms: ["乔丹"], season: 1991 });
  assert.deepEqual(parseQuery("Michael  Jordan"), { terms: ["michael", "jordan"], season: null });
});

test("search matches Chinese, English, nickname and season", () => {
  assert.equal(searchCards(POOL, "乔丹", { ovrOf }).length, 2);
  assert.deepEqual(searchCards(POOL, "jordan 1996", { ovrOf }).map((c) => c.id), ["jordami01-1996-chi"]);
  assert.deepEqual(searchCards(POOL, "黑曼巴", { ovrOf }).map((c) => c.id), ["bryanko01-2006-lal"]);
  assert.deepEqual(searchCards(POOL, "", { ovrOf }), []);
});

test("searchPeople groups season cards by person", () => {
  const people = searchPeople(POOL, "乔丹", { ovrOf });
  assert.equal(people.length, 1);
  assert.equal(people[0].count, 2);
  assert.equal(people[0].best.id, "jordami01-1991-chi");
});

test("five Jordans is a legal team and every copy gets a unique id", () => {
  const team = buildSandboxTeam("五乔丹", fillWithCopies(JORDAN_91));
  assert.equal(team.players.length, SANDBOX_MIN);
  assert.equal(new Set(team.players.map((p) => p.id)).size, SANDBOX_MIN);
  assert.ok(team.players.every((p) => p.sandboxSourceId === JORDAN_91.id));
});

test("ids stay unique across both sides even with the same card", () => {
  const a = buildSandboxTeam("A", fillWithCopies(JORDAN_91), { slotOffset: 0 });
  const b = buildSandboxTeam("B", fillWithCopies(JORDAN_91), { slotOffset: 100 });
  const ids = [...a.players, ...b.players].map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("roster size limits are enforced", () => {
  assert.throws(() => buildSandboxTeam("小", [JORDAN_91]), /至少/);
  let side = [];
  for (let i = 0; i < SANDBOX_MAX; i++) side = addToSide(side, KOBE_06);
  assert.throws(() => addToSide(side, KOBE_06), /最多/);
  assert.equal(removeFromSide(side, 0).length, SANDBOX_MAX - 1);
});

test("building a team never mutates the source cards", () => {
  const before = structuredClone(JORDAN_91);
  buildSandboxTeam("A", fillWithCopies(JORDAN_91));
  assert.deepEqual(JORDAN_91, before);
});

test("roster cards are English-only, so Chinese search relies on aliases", () => {
  const english = { id: "jordami01-1991-chi", bref: "jordami01", name: "Michael Jordan", nameEn: "Michael Jordan", season: 1991, team: "CHI", pos: "SG", ovr: 98 };
  assert.equal(searchCards([english], "乔丹", { ovrOf }).length, 1);
  assert.equal(searchCards([english], "乔丹 1992", { ovrOf }).length, 0);
  const livingston = { ...english, id: "livinsh01-2016-gsw", bref: "livinsh01", name: "Shaun Livingston", nameEn: "Shaun Livingston" };
  assert.equal(searchPeople([livingston], "利文斯顿", { ovrOf })[0].bref, "livinsh01");
});
