import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { seasonToCard } from "../js/data/players.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const cardsOf = (bref) => rows.filter((r) => r.bref === bref).map(seasonToCard);
const cardOf = (bref, season) => {
  const row = rows.find((r) => r.bref === bref && r.season === season);
  return row ? seasonToCard(row) : null;
};

// R108: 1995 森林狼无控卫——三人现实里全是正牌控卫，老数据 "G" 一律被归成 SG，
// 且都在 2012 换数据源前退役，R106 的跨源对照抓不到他们，改整生涯 blanket PG。
test("R108: Garland, Martin and Eisley are PG for every season of their careers", () => {
  for (const bref of ["garlawi01", "martida01", "eisleho01"]) {
    const cards = cardsOf(bref);
    assert.ok(cards.length > 0, bref);
    assert.ok(cards.every((c) => c.pos === "PG"), `${bref} should be all PG`);
  }
  assert.equal(cardOf("garlawi01", 1995).pos, "PG");
  assert.equal(cardOf("martida01", 1995).pos, "PG");
  assert.equal(cardOf("eisleho01", 1995).pos, "PG");
});

test("R108: no collateral — neighboring 1995 Timberwolves guards stay SG", () => {
  assert.equal(cardOf("smithch03", 1995).pos, "SG");
  assert.equal(cardOf("westdo01", 1995).pos, "SG");
  assert.equal(cardOf("rideris01", 1995).pos, "SG");
});
