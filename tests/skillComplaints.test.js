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

test("Paul George keeps 运球节奏大师 and 中投刺客 in every season, and no longer carries 三分雨/中投大师", () => {
  const cards = cardsOf("georgpa01");
  assert.equal(cards.length, 15);
  for (const card of cards) {
    for (const id of ["rhythm_master", "lockdown", "midrange_assassin"]) {
      assert.ok(card.skills.includes(id), `${card.season} lacks ${id}`);
    }
    for (const id of ["rainmaker", "mid_maestro"]) {
      assert.ok(!card.skills.includes(id), `${card.season} should have dropped ${id}`);
    }
  }
});

test("Matt Barnes has 场上恶汉 (enforcer) in every season", () => {
  const cards = cardsOf("barnema02");
  assert.ok(cards.length >= 5);
  for (const card of cards) assert.ok(card.skills.includes("enforcer"), `${card.season} lacks 场上恶汉`);
});

test("Isaiah Thomas (微笑刺客, thomais02) keeps 杀手时刻/抛投大师/节奏大师 always, and never gets Isiah Thomas's (thomais01, Pistons) card mixed in", () => {
  const cards = cardsOf("thomais02");
  assert.ok(cards.length >= 8);
  for (const card of cards) {
    for (const id of ["clutch_killer", "teardrop", "rhythm_master"]) assert.ok(card.skills.includes(id), `${card.season} lacks ${id}`);
    // 场上恶汉/场上打手 (enforcer) does not fit him at all -- he's the smallest guy on the
    // floor, not a hard-fouling physical bruiser. Make sure nobody adds it by mistake later.
    assert.ok(!card.skills.includes("enforcer"), `${card.season} should not have 场上打手`);
  }
  const pistonsThomas = cardsOf("thomais01");
  assert.ok(pistonsThomas.length > 0, "the other Thomas (Isiah, Pistons) should still exist as his own person");
  for (const card of pistonsThomas) {
    // teardrop/rhythm_master are specific to the Celtics Thomas's game (tiny-man floater over
    // size, change-of-pace shiftiness) -- the Pistons captain should never inherit them just
    // because they share (almost) a name. clutch_killer is NOT checked here: both men
    // legitimately earned it on their own merits (1988 Finals G6 on a busted ankle vs
    // "Fourth Quarter King"), so both having it independently is correct, not a name-bleed bug.
    for (const id of ["teardrop", "rhythm_master"]) {
      assert.ok(!card.skills.includes(id), `Isiah Thomas (Pistons) ${card.season} should not inherit Isaiah Thomas's (Celtics) kit`);
    }
  }
});

test("Isiah Thomas (活塞坏小子队长, thomais01) keeps 场上指挥家/传球魔术/杀手时刻 always; no 场上打手 (he's a 185cm playmaker, not a bruiser -- that's Laimbeer/Mahorn's job)", () => {
  const cards = cardsOf("thomais01");
  assert.equal(cards.length, 13);
  for (const card of cards) {
    for (const id of ["floor_commander", "dime_dropper", "clutch_killer"]) assert.ok(card.skills.includes(id), `${card.season} lacks ${id}`);
    assert.ok(!card.skills.includes("enforcer"), `${card.season} should not have 场上打手`);
  }
  // first_step (劲爆第一步, speed/athleticism gated) should still be present at his explosive
  // peak and correctly age out once his speed declines -- not a fixed lifetime skill.
  const peak = cards.find((c) => c.season === 1985);
  const late = cards.find((c) => c.season === 1994);
  assert.ok(peak.skills.includes("first_step"), "1985 peak should still have 劲爆第一步");
  assert.ok(!late.skills.includes("first_step"), "1994 (speed declined) should have aged out of 劲爆第一步");
});

test("Rajon Rondo has skills on every card, including low-ppg bench-tier seasons (he is 场上大脑, not a scorer)", () => {
  const cards = cardsOf("rondora01");
  assert.ok(cards.length >= 10);
  for (const card of cards) {
    assert.equal(card.pos, "PG", `${card.season} should read PG`);
    for (const id of ["floor_commander", "dime_dropper", "lockdown"]) assert.ok(card.skills.includes(id), `${card.season} lacks ${id}`);
  }
});

test("Jimmy Butler has skills on every card", () => {
  const cards = cardsOf("butleji01");
  assert.ok(cards.length >= 10);
  for (const card of cards) {
    for (const id of ["clutch_killer", "freeze_iso", "motor_engine"]) assert.ok(card.skills.includes(id), `${card.season} lacks ${id}`);
  }
});

test("a high-production, low-scoring season (Rondo 2012: 11.9ppg/11.7apg) reaches star-tier-or-above, not capped at starter by a scoring floor alone", () => {
  const card2012 = cardsOf("rondora01").find((c) => c.season === 2012);
  assert.ok(card2012, "2012 Rondo card missing");
  assert.ok(["star", "allstar", "superstar"].includes(card2012.hiddenTier), `tier was ${card2012.hiddenTier}`);
});
