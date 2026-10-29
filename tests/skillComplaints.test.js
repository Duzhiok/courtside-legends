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

test("Draymond Green's three rating tracks his real season-by-season accuracy, not a flat scraped-NBA2K number that never drops even in his worst shooting years", () => {
  const rawOf = (season) => rows.find((r) => r.bref === "greendr01" && r.season === season);
  const cardOf = (season) => seasonToCard(rawOf(season));
  // 2019 and 2021 were genuinely bad shooting years (28.5% and 27.0% from three) -- the old
  // scraped-NBA2K anchor rated him 73 and 66 those seasons anyway (2K apparently never
  // downgrades his jumper). He should read as a mediocre, streaky shooter in his bad years...
  for (const season of [2019, 2020, 2021, 2022, 2023]) {
    const card = cardOf(season);
    assert.ok(card.three <= 60, `${season}: three=${card.three} should read as a below-average shooter (real tp was ${rawOf(season).tp})`);
  }
  // ...but still look like a real threat in the two years he actually earned it (2016 at
  // 38.8%, 2024 at 39.5%) -- this isn't "nerf Draymond", it's "make the rating follow the box
  // score like everyone else's does".
  for (const season of [2016, 2024]) {
    const card = cardOf(season);
    assert.ok(card.three >= 70, `${season}: three=${card.three} should still read as a real shooting threat (real tp was ${rawOf(season).tp})`);
  }
  // His defense/playmaking-hub identity (the actual reason he's a star) must be untouched --
  // this fix only targets the specific inflated attribute, not his whole card.
  for (const id of ["lockdown", "thief", "rim_protector", "dime_dropper"]) {
    assert.ok(cardOf(2019).skills.includes(id), `2019 should keep ${id}`);
  }
  assert.ok(!cardOf(2019).skills.some((id) => ["rainmaker", "splash_spot"].includes(id)), "still no shooter skills tacked on");
});

test("Tony Parker has 中投刺客 in every season", () => {
  const cards = cardsOf("parketo01");
  assert.equal(cards.length, 18);
  for (const card of cards) {
    assert.ok(card.skills.includes("midrange_assassin"), `${card.season} lacks 中投刺客`);
  }
});

test("Reggie Jackson never has 传球魔术 (his 2016/2018/2019 cards rolled it from the generic pool)", () => {
  const cards = cardsOf("jacksre01");
  assert.equal(cards.length, 14);
  for (const card of cards) {
    assert.ok(!card.skills.includes("dime_dropper"), `${card.season} has 传球魔术`);
  }
});

test("传球魔术 stays scarce: no name-bleed kits, no generic roll holders", () => {
  // Luka Garza / Luka Samanic must not inherit Doncic's kit via the /luka/
  // alias, Scottie Pippen Jr. must not inherit Pippen Sr.'s, Gary Payton II
  // must not inherit Payton Sr.'s — same name-bleed class as the Thomas
  // brothers above, fixed with the alias table's exclude mechanism.
  for (const bref of ["garzalu01", "samanlu01", "pippesc02", "paytoga02"]) {
    for (const card of cardsOf(bref)) {
      assert.ok(!card.skills.includes("dime_dropper"), `${bref} ${card.season} has 传球魔术`);
    }
  }
  // Holder count pins the principle: only manual holders remain (was 225
  // players / 548 cards from the generic roll pool). The bound leaves room
  // for future manual additions but catches any pool regression.
  const holders = new Set();
  for (const row of rows) {
    if (seasonToCard(row).skills.includes("dime_dropper")) holders.add(row.bref);
  }
  assert.ok(holders.size <= 24, `dime_dropper holders blew up to ${holders.size}: ${[...holders].join(", ")}`);
});

test("Tony Parker has 挡拆高手 in every season, and it stays his alone", () => {
  const cards = cardsOf("parketo01");
  assert.equal(cards.length, 18);
  for (const card of cards) {
    assert.ok(card.skills.includes("pnr_master"), `${card.season} lacks 挡拆高手`);
  }
  // signature-only: nobody rolls it, nobody inherits it via an alias.
  for (const row of rows) {
    const card = seasonToCard(row);
    if (card.skills.includes("pnr_master")) {
      assert.equal(row.bref, "parketo01", `${row.bref} ${card.season} should not hold 挡拆高手`);
    }
  }
});
