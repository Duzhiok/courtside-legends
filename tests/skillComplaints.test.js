import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { seasonToCard } from "../js/data/players.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const cardsOf = (bref) => rows.filter((r) => r.bref === bref).map(seasonToCard);

test("Kevin Garnett never has 篮下暴君 or 传球魔术, in any of his seasons (they came back through a stale cache once)", () => {
  const cards = cardsOf("garneke01");
  assert.ok(cards.length >= 20);
  for (const card of cards) {
    assert.ok(!card.skills.includes("paint_bully"), `${card.season} has 篮下暴君`);
    assert.ok(!card.skills.includes("dime_dropper"), `${card.season} has 传球魔术`);
  }
  assert.ok(cardsOf("garneke01").every((card) => card.skills.includes("mid_maestro")), "he keeps 中投大师");
});

test("Larry Bird has no 传球魔术 in any season, and keeps 杀手时刻 / 三分雨 / 中投大师", () => {
  const cards = cardsOf("birdla01");
  assert.equal(cards.length, 13);
  for (const card of cards) {
    assert.ok(!card.skills.includes("dime_dropper"), `${card.season} has 传球魔术`);
    for (const id of ["clutch_killer", "rainmaker", "mid_maestro"]) assert.ok(card.skills.includes(id), `${card.season} lost ${id}`);
  }
});

test("Paul George keeps 三分雨, 中投大师 and 中投刺客 in every season", () => {
  const cards = cardsOf("georgpa01");
  assert.equal(cards.length, 15);
  for (const card of cards) for (const id of ["rainmaker", "mid_maestro", "midrange_assassin"]) assert.ok(card.skills.includes(id), `${card.season} lacks ${id}`);
});
