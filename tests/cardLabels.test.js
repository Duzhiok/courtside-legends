import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { seasonToCard } from "../js/data/players.js";

// User-reported label bugs (2026-11-01): Rondo 2020 showed 三分倾向99 +
// 空间射手, Iguodala 2023 showed 玻璃人. Both came from derivation rules,
// not bad source rows: Rondo's 2.6 threes of 6.8 shots is a 38% share but
// low absolute volume, and Iguodala's 8-game farewell season at 38 is not
// a glass body (15 prior seasons of 62+ games).
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const card = (bref, season) => {
  const row = rows.find((r) => r.bref === bref && r.season === season);
  assert.ok(row, `${bref} ${season} exists`);
  return seasonToCard(row);
};

test("card labels: Rondo 2020 is a playmaker, not a spacer with a 99 three tendency", () => {
  const rondo = card("rondora01", 2020);
  assert.equal(rondo.threeTend, 60);
  assert.equal(rondo.offenseStyle, "playmake");
});

test("card labels: high-volume sub-35% chuckers are not spacers", () => {
  const iverson = card("iversal01", 1997);
  assert.notEqual(iverson.offenseStyle, "stretch");
  assert.equal(iverson.offenseStyle, "playmake");
});

test("card labels: true spacers keep the stretch style", () => {
  assert.equal(card("thompkl01", 2016).offenseStyle, "stretch");
  assert.equal(card("korveky01", 2015).offenseStyle, "stretch");
});

test("card labels: Iguodala 2023 farewell season is not 玻璃人", () => {
  const iggy = card("iguodan01", 2023);
  assert.ok(!iggy.tags.includes("玻璃人"));
});

test("card labels: named glass bodies keep the 玻璃人 tag", () => {
  assert.ok(card("porzikr01", 2018).tags.includes("玻璃人"));
  assert.ok(card("embiijo01", 2018).tags.includes("玻璃人"));
});
