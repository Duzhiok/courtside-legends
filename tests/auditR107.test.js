import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { BIRTH_YEAR } from "../js/data/careerArc.js";
import { seasonToCard } from "../js/data/players.js";
import { NICKNAMES } from "../js/data/nicknames.js";
import {
  BALL_HOG_BREF,
  OFF_BALL_BREF,
  BARGAIN_BREF,
  OVERPAID_BREF,
  GLASS_CANNON_BREF,
} from "../js/data/intangibles.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const cardsOf = (bref) => rows.filter((r) => r.bref === bref).map(seasonToCard);
const cardOf = (bref, season) => {
  const row = rows.find((r) => r.bref === bref && r.season === season);
  return row ? seasonToCard(row) : null;
};

// ---- Split-bref merges (R107 follow-up from R106) ----
test("R107: Ed Davis is one bref, 2011–2022, with the 2011 season patched to PF", () => {
  assert.equal(rows.filter((r) => r.bref === "davised02").length, 0);
  const cards = cardsOf("davised01");
  assert.equal(cards.length, 12);
  assert.deepEqual(
    cards.map((c) => c.season).sort((a, b) => a - b),
    Array.from({ length: 12 }, (_, i) => 2011 + i)
  );
  assert.equal(cardOf("davised01", 2011).pos, "PF");
  assert.equal(cardOf("davised01", 2012).pos, "PF");
});

test("R107: Mbah a Moute is one bref, 2009–2018, name unified, early seasons PF", () => {
  assert.equal(rows.filter((r) => r.bref === "mbahlu01").length, 0);
  const cards = cardsOf("mbahalu01");
  assert.equal(cards.length, 10);
  assert.deepEqual(
    cards.map((c) => c.season).sort((a, b) => a - b),
    Array.from({ length: 10 }, (_, i) => 2009 + i)
  );
  for (const season of [2009, 2010, 2011, 2012]) {
    assert.equal(cardOf("mbahalu01", season).pos, "PF", `Mbah ${season}`);
    assert.equal(cardOf("mbahalu01", season).nameEn, "Luc Mbah a Moute");
  }
});

// ---- Stale keys fixed: birth years (R107) ----
test("R107: birth years live under the real brefs", () => {
  assert.equal(BIRTH_YEAR.hardeja01, 1989);
  assert.equal(BIRTH_YEAR.leonaka01, 1991);
  assert.equal(BIRTH_YEAR.embiijo01, 1994);
  assert.equal(BIRTH_YEAR.hardeti01, undefined);
  assert.equal(BIRTH_YEAR.leonard01, undefined);
  assert.equal(BIRTH_YEAR.embiiijo01, undefined);
});

// ---- Stale keys fixed: nicknames (R107) ----
test("R107: nicknames live under the real brefs, stale keys gone", () => {
  assert.equal(NICKNAMES.curryst01, "萌神");
  assert.equal(NICKNAMES.hardeja01, "大胡子");
  assert.equal(NICKNAMES.stephcu01, undefined);
  assert.equal(NICKNAMES.hardeti01, undefined);
});

// ---- Stale keys fixed: intangibles tables (R107) ----
test("R107: intangibles tables use real brefs", () => {
  assert.equal(BALL_HOG_BREF.hardeja01, 24);
  assert.equal(BALL_HOG_BREF.bryanko01, 14);
  assert.equal(BALL_HOG_BREF.rosede01, 18);
  assert.equal(OFF_BALL_BREF.harrito02, 11);
  assert.equal(BARGAIN_BREF.crowdja01, 11);
  assert.equal(BARGAIN_BREF.fishede01, 10);
  assert.equal(BARGAIN_BREF.conlemi01, 10);
  assert.equal(BARGAIN_BREF.dragigo01, 9);
  assert.equal(OVERPAID_BREF.wisemja01, 19);
  assert.equal(OVERPAID_BREF.bambamo01, 14);
  assert.equal(GLASS_CANNON_BREF.willizi01, 19);
  assert.equal(GLASS_CANNON_BREF.wembavi01, 15);
  assert.equal(GLASS_CANNON_BREF.leonaka01, 14);
  assert.equal(GLASS_CANNON_BREF.ilyaser01, 16);
  assert.equal(GLASS_CANNON_BREF.livinsh01, 11);
  for (const table of [BALL_HOG_BREF, OFF_BALL_BREF, BARGAIN_BREF, OVERPAID_BREF, GLASS_CANNON_BREF]) {
    for (const stale of [
      "hardeti01", "leonard01", "stephcu01", "embiiijo01", "roseede01", "bryantko01",
      "harruto01", "crowdae01", "crowdda01", "fisherde01", "conleymi01", "dragicg01",
      "wisemde01", "bamba01", "yao01", "ballzi01", "wembyvi01", "wembany01",
      "leonardk01", "ilyasbe01", "bargoke01", "shaunli01", "ginobili",
    ]) {
      assert.equal(table[stale], undefined, `stale key ${stale} still in table`);
    }
  }
});
