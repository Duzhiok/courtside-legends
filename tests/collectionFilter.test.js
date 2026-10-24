import test from "node:test";
import assert from "node:assert/strict";
import { applyCollectionView, decadesOf, freshFilter, redundantIds } from "../js/ui/collectionFilter.js";

const ovrOf = (c) => c.ovr;
function card(id, bref, season, ovr, extra = {}) {
  return { id, bref, season, ovr, name: bref, nameEn: bref, hiddenRoll: { grade: "B", rating: 70 }, mergeLevel: 0, ...extra };
}
const CARDS = [
  card("a-1991", "jordami01", 1991, 100, { name: "Michael Jordan", hiddenRoll: { grade: "A", rating: 92 }, mergeLevel: 2 }),
  card("a-1996", "jordami01", 1996, 97, { name: "Michael Jordan" }),
  card("b-2006", "bryanko01", 2006, 94, { name: "Kobe Bryant", hiddenRoll: { grade: "S", rating: 88 } }),
  card("c-2015", "livinsh01", 2015, 76, { name: "Shaun Livingston", hiddenRoll: { grade: "S", rating: 90 } }),
  card("d-2020", "farieke01", 2020, 62, { name: "Kenneth Faried", hiddenRoll: { grade: "D", rating: 55 } }),
];
const ctx = {
  ovrOf,
  hiddenOf: (c) => c.hiddenRoll?.rating,
  redundant: redundantIds(CARDS, ovrOf),
  junk: new Set(["d-2020"]),
  order: new Map(CARDS.map((c, i) => [c.id, i])),
};
const ids = (list) => list.map((c) => c.id);

test("default view: OVR high to low", () => {
  assert.deepEqual(ids(applyCollectionView(CARDS, freshFilter(), ctx)), ["a-1991", "a-1996", "b-2006", "c-2015", "d-2020"]);
});

test("sorts: hidden rating, recent, season, stars", () => {
  const sort = (id) => ids(applyCollectionView(CARDS, { ...freshFilter(), sort: id }, ctx));
  assert.equal(sort("hidden")[0], "a-1991");
  assert.deepEqual(sort("hidden").slice(0, 3), ["a-1991", "c-2015", "b-2006"]);
  assert.equal(sort("recent")[0], "d-2020");
  assert.equal(sort("season")[0], "d-2020");
  assert.equal(sort("stars")[0], "a-1991");
});

test("a low-OVR 妖人 is easy to find: filter by 成色 S", () => {
  const view = applyCollectionView(CARDS, { ...freshFilter(), grade: "S" }, ctx);
  assert.deepEqual(ids(view), ["b-2006", "c-2015"]);
});

test("rarity groups and decade", () => {
  assert.deepEqual(ids(applyCollectionView(CARDS, { ...freshFilter(), band: "star" }, ctx)), ["a-1991", "a-1996", "b-2006"]);
  assert.deepEqual(ids(applyCollectionView(CARDS, { ...freshFilter(), band: "low" }, ctx)), ["d-2020"]);
  assert.deepEqual(ids(applyCollectionView(CARDS, { ...freshFilter(), decade: "1990" }, ctx)), ["a-1991", "a-1996"]);
  assert.deepEqual(decadesOf(CARDS), [2020, 2010, 2000, 1990]);
});

test("redundant-version and junk filters", () => {
  assert.deepEqual(ids(applyCollectionView(CARDS, { ...freshFilter(), redundantOnly: true }, ctx)), ["a-1996"]);
  assert.deepEqual(ids(applyCollectionView(CARDS, { ...freshFilter(), junkOnly: true }, ctx)), ["d-2020"]);
});

test("free-text search: Chinese alias, nickname and season", () => {
  const find = (query) => ids(applyCollectionView(CARDS, { ...freshFilter(), query }, ctx));
  assert.deepEqual(find("乔丹"), ["a-1991", "a-1996"]);
  assert.deepEqual(find("乔丹 1996"), ["a-1996"]);
  assert.deepEqual(find("黑曼巴"), ["b-2006"]);
  assert.deepEqual(find("zzz"), []);
});

test("filters combine, and the input list is never mutated", () => {
  const before = ids(CARDS);
  const view = applyCollectionView(CARDS, { ...freshFilter(), band: "star", grade: "A" }, ctx);
  assert.deepEqual(ids(view), ["a-1991"]);
  assert.deepEqual(ids(CARDS), before);
});
