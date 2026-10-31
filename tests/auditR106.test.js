import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { seasonToCard } from "../js/data/players.js";
import { RATING_ANCHORS_2K } from "../js/data/ratings2k.js";
import { signatureBrefForName, assignSkillPacks } from "../js/data/skills.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const cardsOf = (bref) => rows.filter((r) => r.bref === bref).map(seasonToCard);
const cardOf = (bref, season) => {
  const row = rows.find((r) => r.bref === bref && r.season === season);
  return row ? seasonToCard(row) : null;
};

// ---- Names: split-bref merges + normalization (R106 audit P0/P1) ----
test("R106: Ginobili is one bref, 2003–2018, and keeps his 2K anchor", () => {
  assert.equal(rows.filter((r) => r.bref === "ginobma01").length, 0);
  const cards = cardsOf("ginobem01");
  assert.equal(cards.length, 16);
  assert.deepEqual(
    cards.map((c) => c.season).sort((a, b) => a - b),
    Array.from({ length: 16 }, (_, i) => 2003 + i)
  );
  const c2015 = cardOf("ginobem01", 2015);
  assert.equal(c2015.ovr2k, 78);
  assert.equal(c2015.ratingSource, "anchor");
  assert.ok(c2015.skills.includes("euro_step"));
});

test("R106: Ewing Jr., Moore and N'Diaye merges land", () => {
  assert.equal(cardOf("ewingpa02", 2011).nameEn, "Patrick Ewing Jr.");
  assert.equal(rows.filter((r) => r.bref === "mooree_01").length, 0);
  assert.equal(cardsOf("mooreet01").length, 10);
  assert.deepEqual(
    cardsOf("ndiayha01").map((c) => c.season).sort((a, b) => a - b),
    [2011, 2014]
  );
  const ajinca = cardOf("ajincal01", 2009);
  assert.equal(ajinca.nameEn, "Alexis Ajinça");
});

// ---- Skills: name-fallback tightening (R106 audit P0) ----
test("R106: name fallback hits the star and misses the namesakes", () => {
  const hit = (nameEn, name, bref) => assert.equal(signatureBrefForName({ nameEn, name }), bref, nameEn);
  const miss = (nameEn, name) => assert.equal(signatureBrefForName({ nameEn, name }), null, nameEn);
  hit("Stephen Curry", "斯蒂芬·库里", "curryst01");
  hit("Tim Duncan", "蒂姆·邓肯", "duncati01");
  hit("Manu Ginóbili", "马努·吉诺比利", "ginobem01");
  hit("Shaquille O'Neal", "沙奎尔·奥尼尔", "onealsh01");
  miss("Seth Curry", "塞斯·库里");
  miss("Duncan Robinson", "邓肯·罗宾逊");
  miss("Immanuel Quickley", "伊曼纽尔·奎克利");
  miss("Kobe Bufkin", "科比·巴夫金");
  miss("Wade Baldwin", "韦德·鲍德温");
  miss("Georgios Papagiannis", "乔治奥斯·帕帕扬尼斯");
  miss("Luka Garza", "卢卡·加尔扎");
  miss("Dirk Minniefield", "德克·米尼菲尔德");
  miss("Jermaine O'Neal", "杰梅因·奥尼尔");
  miss("John Williamson", "约翰·威廉姆森");
  miss("Meyers Leonard", "迈尔斯·伦纳德");
});

test("R106: Kidd gains dime_dropper, Anderson loses it, Iguodala keeps it", () => {
  assert.ok(cardsOf("kiddja01").every((c) => c.skills.includes("dime_dropper")));
  assert.ok(cardsOf("anderky01").every((c) => !c.skills.includes("dime_dropper")));
  assert.ok(cardsOf("anderky01").every((c) => c.skills.includes("slowmo")));
  assert.ok(cardsOf("iguodan01").every((c) => c.skills.includes("dime_dropper")));
});

// ---- Positions: P0 + P1 overrides (R106 audit) ----
test("R106: corrected positions land, excluded swingmen stay put", () => {
  assert.equal(cardOf("davisba01", 2000).pos, "PG");
  assert.equal(cardOf("willide01", 2006).pos, "PG");
  assert.equal(cardOf("nashst01", 2005).pos, "PG");
  assert.equal(cardOf("paulch01", 2008).pos, "PG");
  assert.equal(cardOf("kiddja01", 2003).pos, "PG");
  assert.equal(cardOf("howardw01", 2005).pos, "C");
  assert.equal(cardOf("gasolpa01", 2005).pos, "PF");
  assert.equal(cardOf("brandel01", 2003).pos, "PF");
  assert.equal(cardOf("onealje01", 2001).pos, "C");
  assert.equal(cardOf("hardeja01", 2010).pos, "SG");
  assert.equal(cardOf("birdla01", 1985).pos, "SF");
});

// ---- Ratings: anchor merge, era baseline, speed clamp, three cap, strength floor ----
test("R106: anchor merge is per-attribute, not per-card", () => {
  const anchor = RATING_ANCHORS_2K["jamesle01:2013"];
  assert.equal(anchor.ovr, 99);
  assert.equal(anchor.rebound, 78);
});

test("R106: volume scorers no longer floor out", () => {
  assert.equal(cardOf("bayloel01", 1962).scoring, 80);
  assert.equal(cardOf("iversal01", 2002).scoring, 80);
  assert.ok(cardOf("chambwi01", 1960).scoring >= 80);
  assert.ok(cardOf("jordami01", 1988).scoring >= 90);
});

test("R106: anchored-card speed stays within anchor ±5", () => {
  for (const season of [2015, 2016]) {
    const speed = cardOf("wiggian01", season).speed;
    assert.ok(speed >= 79 && speed <= 89, `Wiggins ${season} speed ${speed}`);
  }
});

test("R106: tiny-sample three-point cap catches tpa exactly 0.4", () => {
  assert.equal(cardOf("lichtto01", 1994).three, 42);
});

test("R106: double-digit-rebound centers keep strength >= 60", () => {
  for (const row of rows) {
    if (row.pos !== "C") continue;
    const card = seasonToCard(row);
    if (card.raw.rpg >= 10) assert.ok(card.strength >= 60, `${row.bref} ${row.season} strength ${card.strength}`);
  }
});

// ---- Skills: roll-pool gates (R106 audit P1) ----
function syntheticStar(id, over) {
  return assignSkillPacks({
    id,
    bref: "testzz01",
    nameEn: "Test Player",
    name: "测试球员",
    hiddenTier: "star",
    age: 27,
    pos: "C",
    archetype: "pest",
    defense: 90,
    block: 50,
    steal: 50,
    three: 50,
    mid: 50,
    scoring: 50,
    stamina: 65,
    speed: 50,
    strength: 50,
    clutch: 50,
    raw: { ppg: 5, spg: 0.5, bpg: 1.0 },
    intangibles: {},
    personality: { fiery: 50, calm: 50 },
    ...over,
  });
}

test("R106: bigs never roll lockdown; empty pool falls back to motor_engine only", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `r106-lock-${i}`);
  const rolled = ids.map((id) => syntheticStar(id));
  assert.ok(rolled.every((c) => !c.skills.includes("lockdown")));
  assert.ok(rolled.some((c) => c.skills.includes("motor_engine")), "at least one roll should trigger");
  const blank = ids.map((id) => syntheticStar(`${id}-blank`, { archetype: "bench", defense: 50 }));
  assert.ok(blank.every((c) => !c.skills.includes("clutch_killer")));
});
