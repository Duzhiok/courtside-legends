import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard, overall } from "../js/data/players.js";
import { SKILL_PACKS, assignSkillPacks, skillOpennessDelta } from "../js/data/skills.js";

const roster = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"));
const rows = Array.isArray(roster) ? roster : Object.values(roster).find(Array.isArray);
const peak = (bref) =>
  rows.filter((r) => r.bref === bref).map(seasonToCard).sort((a, b) => overall(b) - overall(a))[0];

test("Embiid has no 篮下暴君 and shows 玻璃人 instead", () => {
  const embiid = peak("embiijo01");
  assert.ok(!embiid.skills.includes("paint_bully"));
  assert.ok(embiid.tags.includes("玻璃人"), `tags were: ${embiid.tags}`);
});

test("Luka and Harden get 节奏大师, a skill with no speed gate", () => {
  for (const bref of ["doncilu01", "hardeja01"]) {
    const card = peak(bref);
    assert.ok(card.skills.includes("rhythm_master"), `${bref} should have rhythm_master`);
  }
  assert.equal(SKILL_PACKS.rhythm_master.name, "节奏大师");
});

test("节奏大师 still creates openness for a slow player (no speed requirement)", () => {
  const slowCreator = { speed: 48, skills: ["rhythm_master"] };
  const plain = { speed: 48, skills: [] };
  const delta = skillOpennessDelta(slowCreator, { speed: 90 }, { onCourt: [] });
  const base = skillOpennessDelta(plain, { speed: 90 }, { onCourt: [] });
  assert.ok(delta > base);
});

test("rhythm_master survives aging (no athletic gate to fail)", () => {
  const oldLuka = assignSkillPacks({ bref: "doncilu01", season: 2025, age: 40, speed: 40 });
  assert.ok(oldLuka.skills.includes("rhythm_master"));
});
