import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);

/**
 * roster.json comes from a build script whose normalize_pos() collapses the ambiguous raw "F"
 * tag to "SF". That's wrong for anyone who was actually a power forward, and it was wrong for
 * every single season of these Hall-of-Famers. See POS_OVERRIDES in js/data/players.js.
 */
const KNOWN_PF = {
  garneke01: "Kevin Garnett",
  malonka01: "Karl Malone",
  barklch01: "Charles Barkley",
  rodmade01: "Dennis Rodman",
  hayesel01: "Elvin Hayes",
  pettibo01: "Bob Pettit",
  haywosp01: "Spencer Haywood",
  willibu01: "Buck Williams",
  silaspa01: "Paul Silas",
  debusda01: "Dave DeBusschere",
  schaydo01: "Dolph Schayes",
};

test("historical power forwards misfiled as SF in roster.json show up as PF on every card", () => {
  for (const [bref, name] of Object.entries(KNOWN_PF)) {
    const cards = rows.filter((r) => r.bref === bref).map(seasonToCard);
    assert.ok(cards.length > 0, `no rows for ${name} (${bref})`);
    for (const card of cards) {
      assert.equal(card.pos, "PF", `${name} ${card.season} should read PF, not ${card.pos}`);
    }
  }
});

test("the override doesn't leak onto unrelated players sharing no bref with the list", () => {
  const duncan = rows.filter((r) => r.bref === "duncati01").map(seasonToCard);
  assert.ok(duncan.length > 0);
  for (const card of duncan) assert.equal(card.pos, "C", "Duncan's own C tag is untouched");
});

test("Kevin McHale, Charles Oakley, Kevin Willis and Shawn Kemp — same bug, same fix — read PF, not SF", () => {
  for (const bref of ["mchalke01", "oaklech01", "willike02", "kempsh01"]) {
    const cards = rows.filter((r) => r.bref === bref).map(seasonToCard);
    assert.ok(cards.length > 0, bref);
    for (const card of cards) assert.equal(card.pos, "PF", `${bref} ${card.season}`);
  }
});

test("Khris Middleton reads a believable 198cm/101kg, not the formula's 210cm \"瘦高\" guess", () => {
  const card = rows.filter((r) => r.bref === "middlkh01").map(seasonToCard)[0];
  assert.ok(card, "no Middleton card");
  assert.equal(card.heightCm, 198);
  assert.equal(card.weightKg, 101);
});

/**
 * Same normalize_pos() bug class, but for guards: the ambiguous raw "G" tag collapses to "SG",
 * which quietly turned every single season of these universally-recognized Hall-of-Fame/All-Star
 * point guards into shooting guards. John Stockton -- the NBA's all-time assists leader -- was
 * tagged SG for all 19 of his seasons before this fix.
 */
const KNOWN_PG = {
  stockjo01: "John Stockton",
  cousybo01: "Bob Cousy",
  rodgegu01: "Guy Rodgers",
  roberos01: "Oscar Robertson",
  wilkele01: "Lenny Wilkens",
  vanlino01: "Norm Van Lier",
  archina01: "Nate Archibald",
  porteke01: "Kevin Porter",
  lucasjo01: "John Lucas",
  nixonno01: "Norm Nixon",
  cheekma01: "Maurice Cheeks",
  johnsma02: "Magic Johnson",
  moorejo01: "Johnny Moore",
  thomais01: "Isiah Thomas",
  pricema01: "Mark Price",
  jacksma01: "Mark Jackson",
  johnske02: "Kevin Johnson",
  boguemu01: "Muggsy Bogues",
  stricro02: "Rod Strickland",
  hardati01: "Tim Hardaway",
  paytoga01: "Gary Payton",
  brandte01: "Terrell Brandon",
  vanexni01: "Nick Van Exel",
  marbust01: "Stephon Marbury",
};

test("historical point guards misfiled as SG in roster.json show up as PG on every card", () => {
  for (const [bref, name] of Object.entries(KNOWN_PG)) {
    const cards = rows.filter((r) => r.bref === bref).map(seasonToCard);
    assert.ok(cards.length > 0, `no rows for ${name} (${bref})`);
    for (const card of cards) {
      assert.equal(card.pos, "PG", `${name} ${card.season} should read PG, not ${card.pos}`);
    }
  }
});

test("genuinely disputed combo guards (Jerry West) are left alone -- not swept up by a blanket fix", () => {
  const west = rows.filter((r) => r.bref === "westje01").map(seasonToCard);
  assert.ok(west.length > 0);
  for (const card of west) assert.equal(card.pos, "SG", "West's own SG tag is untouched, by design");
});

/**
 * Vince Carter's final two Atlanta seasons (42-43 years old, bench minutes) got tagged PF in
 * roster.json, but he never played a true power forward snap in his 22-year career. Unlike the
 * whole-career PF/PG overrides above, this is a season-specific patch (POS_OVERRIDES_BY_SEASON):
 * his other 20 seasons are already correctly SF/SG and must not be touched.
 */
test("Vince Carter's 2019/2020 Hawks seasons read SF, not the bogus PF tag -- his other 20 seasons are untouched", () => {
  const cards = rows.filter((r) => r.bref === "cartevi01").map(seasonToCard);
  assert.ok(cards.length >= 20, "expected Carter's full 22-season career");
  for (const card of cards) {
    if (card.season === 2019 || card.season === 2020) {
      assert.equal(card.pos, "SF", `${card.season} should be patched to SF, not ${card.pos}`);
    } else {
      assert.ok(["SF", "SG"].includes(card.pos), `${card.season} should keep its original SF/SG tag, got ${card.pos}`);
    }
  }
});

test("Ben Simmons reads a believable 208cm, not the generic 'PG' height-bucket guess", () => {
  const cards = rows.filter((r) => r.bref === "simmobe01").map(seasonToCard);
  assert.ok(cards.length > 0, "no Simmons card");
  for (const card of cards) {
    assert.equal(card.heightCm, 208, `${card.season} should read 208cm, not ${card.heightCm}`);
    assert.equal(card.weightKg, 109);
  }
});

/**
 * Zaza Pachulia was a bruising screen-setting center his entire career -- he never played small
 * forward. roster.json's 2004-11 rows (the "talldata" source, pre-dating the real bref scrape)
 * got swept up by the same ambiguous-"F"-collapses-to-"SF" normalize_pos() bug; his 2012+ rows
 * (the "bref" source) already correctly say C. Unlike Vince Carter's season-specific patch, this
 * is a whole-career override (POS_OVERRIDES) because EVERY season should read C, including the
 * ones that were already right -- a blanket "C" can't make an already-correct C wrong.
 */
test("Zaza Pachulia reads C on every season, including the early ones roster.json mistagged SF", () => {
  const cards = rows.filter((r) => r.bref === "pachuza01").map(seasonToCard);
  assert.ok(cards.length >= 15, "expected Pachulia's full career span");
  const earlySeasons = cards.filter((c) => c.season <= 2011);
  assert.ok(earlySeasons.length > 0, "should include the mistagged talldata-era seasons");
  for (const card of cards) {
    assert.equal(card.pos, "C", `${card.season} should read C, not ${card.pos}`);
  }
});
