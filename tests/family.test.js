/**
 * 父子同心 / 兄弟同心 -- hidden chemistry bonus from real NBA family relationships on the floor
 * together. Not a visible badge (unlike js/data/skills.js's DUO_COMBOS), just quietly nudges
 * teamChemistry(). Every bref in FAMILY_GROUPS is checked against the real roster data so this
 * can't silently rot if roster.json ever changes a bref format.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAMILY_GROUPS, activeFamilyBonds, familyChemistryBonus } from "../js/data/family.js";
import { teamChemistry } from "../js/engine/chemistry.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const VALID_BREFS = new Set(ROWS.map((r) => r.bref));

function p(bref) {
  return { id: bref, bref, name: bref, pos: "SF", personality: {}, intangibles: {} };
}

test("every bref in FAMILY_GROUPS actually exists in the real roster (no typos, no made-up people)", () => {
  for (const fam of FAMILY_GROUPS) {
    for (const bref of [...(fam.parents || []), ...(fam.children || [])]) {
      assert.ok(VALID_BREFS.has(bref), `${fam.id}: ${bref} is not a real roster bref`);
    }
  }
});

test("every family group has at least 2 total members (nothing pointless)", () => {
  for (const fam of FAMILY_GROUPS) {
    const total = (fam.parents?.length || 0) + (fam.children?.length || 0);
    assert.ok(total >= 2, `${fam.id} only has ${total} member(s)`);
  }
});

test("no duplicate family ids", () => {
  const ids = FAMILY_GROUPS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate family id found");
});

test("activeFamilyBonds: father-son fires when parent AND child are both on court", () => {
  const onCourt = [p("curryde01"), p("curryst01"), p("random01")];
  const bonds = activeFamilyBonds(onCourt);
  assert.ok(bonds.some((b) => b.id === "curry" && b.type === "father_son"));
});

test("activeFamilyBonds: father-son does NOT fire with just the parent, or just one child, alone", () => {
  assert.deepEqual(activeFamilyBonds([p("curryde01")]), []);
  assert.deepEqual(activeFamilyBonds([p("curryst01")]), []);
});

test("activeFamilyBonds: brothers fires when 2+ siblings share the floor, with no parent required", () => {
  const onCourt = [p("grantha01"), p("grantho01")];
  const bonds = activeFamilyBonds(onCourt);
  assert.ok(bonds.some((b) => b.id === "grant_twins" && b.type === "brothers"));
});

test("activeFamilyBonds: a lone sibling with nobody else from the family does not trigger anything", () => {
  assert.deepEqual(activeFamilyBonds([p("grantha01")]), []);
});

test("activeFamilyBonds: a 3-person family (Antetokounmpo brothers) fires with just 2 of the 3 present, not requiring all 3", () => {
  const bonds = activeFamilyBonds([p("antetgi01"), p("antetth01")]);
  assert.ok(bonds.some((b) => b.id === "antetokounmpo" && b.type === "brothers"));
});

test("activeFamilyBonds: a family with BOTH a tracked parent and 2+ children fires BOTH father_son and brothers (Curry: Dell + Steph + Seth)", () => {
  const bonds = activeFamilyBonds([p("curryde01"), p("curryst01"), p("curryse01")]);
  const types = bonds.filter((b) => b.id === "curry").map((b) => b.type);
  assert.ok(types.includes("father_son"));
  assert.ok(types.includes("brothers"));
});

test("activeFamilyBonds: unrelated players never trigger a bond, even with a shared surname elsewhere in the league (e.g. Moses Malone vs Karl Malone are not family)", () => {
  const bonds = activeFamilyBonds([p("malonmo01"), p("malonka01")]);
  assert.deepEqual(bonds, []);
});

test("activeFamilyBonds: George Mikan can independently trigger his brother bond (with Ed) and his father-son bond (with Larry) -- same person, two different real relationships", () => {
  const withBrother = activeFamilyBonds([p("mikange01"), p("mikaned01")]);
  assert.ok(withBrother.some((b) => b.id === "mikan_brothers" && b.type === "brothers"));
  const withSon = activeFamilyBonds([p("mikange01"), p("mikanla01")]);
  assert.ok(withSon.some((b) => b.id === "mikan_father_son" && b.type === "father_son"));
});

test("activeFamilyBonds: empty or null input is a safe no-op", () => {
  assert.deepEqual(activeFamilyBonds([]), []);
  assert.deepEqual(activeFamilyBonds(null), []);
});

test("familyChemistryBonus: returns a positive number when a bond is active, zero otherwise", () => {
  assert.ok(familyChemistryBonus([p("curryde01"), p("curryst01")]) > 0);
  assert.equal(familyChemistryBonus([p("random01"), p("random02")]), 0);
});

test("familyChemistryBonus: is capped even if someone stacks an absurd number of families (sandbox/time-travel mode can mix any era)", () => {
  const onCourt = [
    p("curryde01"), p("curryst01"), p("curryse01"),
    p("barryri01"), p("barryjo01"), p("barrybr01"), p("barrydr01"),
    p("thompmy01"), p("thompkl01"), p("thompmy02"),
    p("antetgi01"), p("antetth01"), p("antetko01"),
    p("holidjr01"), p("holidju01"), p("holidaa01"),
  ];
  const bonus = familyChemistryBonus(onCourt);
  assert.ok(bonus <= 12, `expected a capped bonus, got ${bonus}`);
  assert.ok(bonus > 0);
});

test("teamChemistry: a real father-son pair on the floor scores higher than two unrelated strangers, all else equal", () => {
  const base = { pos: "SF", personality: { ego: 50, team: 50, fiery: 50 }, intangibles: {}, raw: {} };
  const family = [
    { ...base, id: "curryde01", bref: "curryde01", name: "Dell Curry", pos: "SG" },
    { ...base, id: "curryst01", bref: "curryst01", name: "Stephen Curry", pos: "PG" },
    { ...base, id: "fill1", bref: "fill01", name: "Filler One", pos: "SF" },
    { ...base, id: "fill2", bref: "fill02", name: "Filler Two", pos: "PF" },
    { ...base, id: "fill3", bref: "fill03", name: "Filler Three", pos: "C" },
  ];
  const strangers = family.map((p, i) => ({ ...p, id: `stranger${i}`, bref: `stranger${i}` }));
  const famChem = teamChemistry(family);
  const strangerChem = teamChemistry(strangers);
  assert.ok(famChem > strangerChem, `family lineup (${famChem}) should beat an otherwise-identical stranger lineup (${strangerChem})`);
});

test("teamChemistry: never crashes or goes out of [15,95] bounds with family bonuses stacked on top of everything else", () => {
  const base = { pos: "SF", personality: { ego: 90, team: 90, fiery: 90 }, intangibles: { chemistryMagnet: 99, leadership: 99 }, raw: {} };
  const stacked = [
    { ...base, id: "curryde01", bref: "curryde01", name: "Dell Curry" },
    { ...base, id: "curryst01", bref: "curryst01", name: "Stephen Curry" },
    { ...base, id: "curryse01", bref: "curryse01", name: "Seth Curry" },
    { ...base, id: "grantha01", bref: "grantha01", name: "Harvey Grant" },
    { ...base, id: "grantho01", bref: "grantho01", name: "Horace Grant" },
  ];
  const chem = teamChemistry(stacked);
  assert.ok(chem >= 15 && chem <= 95);
});
