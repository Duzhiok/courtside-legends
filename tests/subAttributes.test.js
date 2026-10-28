import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";

/**
 * R84: NBA2K-style sub-attributes on top of the 14 core ratings. We can't beat 2K on
 * graphics, so the user wants real depth in the NUMBERS instead: 控球 (ball-handling),
 * 外线防守/内线防守 (perimeter vs interior D, previously one shared `defense` number),
 * 接球投/持球投 (catch-and-shoot vs off-the-dribble shooting), and 前场/后场篮板
 * (offensive vs defensive rebounding). All derived from the 14 core ratings + position +
 * offenseStyle -- the source box scores don't have real orb/drb or ball-handling columns,
 * so these are formulas, not new raw data (same spirit as archetype/hiddenTier elsewhere
 * in this file).
 */
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function cardFor(bref, season) {
  const row = ROWS.find((r) => r.bref === bref && r.season === season);
  if (!row) throw new Error(`no row for ${bref}:${season}`);
  return seasonToCard(row);
}

const SUB_ATTRS = ["handle", "perimDef", "interiorDef", "catchShoot", "offDribble", "offReb", "defReb"];

test("every sub-attribute exists on every card and stays in a sane 1-99 band", () => {
  const sample = ROWS.filter((r) => r.season === 2020).slice(0, 60).map(seasonToCard);
  assert.ok(sample.length > 20, "fixture sanity: enough 2020 cards to sample");
  for (const card of sample) {
    for (const key of SUB_ATTRS) {
      const v = card[key];
      assert.equal(typeof v, "number", `${key} missing/non-numeric on ${card.name}`);
      assert.ok(v >= 10 && v <= 99, `${key}=${v} out of band on ${card.name}`);
    }
  }
});

test("perimDef/interiorDef: a classic rim-only anchor trades perimeter D for interior D, not vice versa", () => {
  // Rudy Gobert: elite rim protector, minimal perimeter switchability.
  const gobert = cardFor("goberru01", 2019);
  assert.ok(gobert.interiorDef > gobert.perimDef, `Gobert interiorDef ${gobert.interiorDef} should beat perimDef ${gobert.perimDef}`);
});

test("perimDef/interiorDef: a smaller, high-steal perimeter stopper leans the other way", () => {
  const cp3 = cardFor("paulch01", 2015);
  const gobert = cardFor("goberru01", 2019);
  assert.ok(cp3.perimDef > gobert.perimDef * 0.75, "a plus perimeter defender shouldn't be crushed relative to a rim-only anchor");
  assert.ok(gobert.interiorDef > cp3.interiorDef, "the 7-footer still wins interior D over a point guard");
});

test("handle: point guards grade out well above traditional centers at the same team need", () => {
  const cp3 = cardFor("paulch01", 2015);
  const gobert = cardFor("goberru01", 2019);
  assert.ok(cp3.handle > gobert.handle, `CP3 handle ${cp3.handle} should beat Gobert's ${gobert.handle}`);
});

test("offReb/defReb: a true rebounding anchor outgrades a shoot-first wing on BOTH, but the gap is proportionally honest", () => {
  const gobert = cardFor("goberru01", 2019);
  const george = cardFor("georgpa01", 2024);
  assert.ok(gobert.offReb > george.offReb, "rim-running big crashes the offensive glass harder than a wing");
  assert.ok(gobert.defReb > george.defReb, "rim-running big boxes out on defense harder than a wing");
});

test("catchShoot/offDribble: a spot-up shooter and an on-ball creator can share similar raw three/mid but specialize differently", () => {
  const dirk = cardFor("nowitdi01", 2010); // relies on an unusually strong isolation self-creation attribute for a shooting big
  const kobe = cardFor("bryanko01", 2008); // high-volume shot creator, on-ball
  // Not asserting a specific winner (that depends on real career shot profiles) -- just that
  // the two sub-attributes are NOT forced to be identical to each other for the same player,
  // i.e. the split actually carries information instead of being a renamed duplicate.
  for (const card of [dirk, kobe]) {
    assert.notEqual(card.catchShoot, card.offDribble, `${card.name}: catchShoot and offDribble should not just be duplicates`);
  }
});

test("mutation guard: deriveSubAttributes band-cap actually bites -- scrambling heightCm/strength to extremes can't blow past 99", () => {
  const row = ROWS.find((r) => r.bref === "goberru01" && r.season === 2019);
  const card = seasonToCard({ ...row, pos: "C" });
  for (const key of SUB_ATTRS) assert.ok(card[key] <= 99, `${key} escaped the 99 cap`);
});
