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
