import test from "node:test";
import assert from "node:assert/strict";
import { removeSkillFromPlayer, removableSkills, SKILL_PACKS } from "../js/data/skills.js";

function makePlayer(skills, purchasedSkills = [], purchasedSkillCosts = {}) {
  return { name: "Test Player", skills: [...skills], purchasedSkills: [...purchasedSkills], purchasedSkillCosts: { ...purchasedSkillCosts } };
}

// Two ordinary, non-combo, non-exclusive skill ids to use across the tests.
const [SKILL_A, SKILL_B] = Object.values(SKILL_PACKS)
  .filter((s) => s && !s.duo && !s.exclusive)
  .slice(0, 2)
  .map((s) => s.id);

test("a bought skill can be unequipped and comes back as a skill-inventory item", () => {
  const p = makePlayer([SKILL_A], [SKILL_A], { [SKILL_A]: 130 });
  const res = removeSkillFromPlayer(p, SKILL_A);
  assert.equal(res.ok, true);
  assert.equal(res.returnToInv.id, SKILL_A);
  assert.equal(res.returnToInv.cost, 130);
  assert.ok(!p.skills.includes(SKILL_A), "removed from the card");
  assert.ok(!p.purchasedSkills.includes(SKILL_A), "removed from the purchased ledger");
});

test("a player's own skill (never bought) cannot be unequipped — it just vanished with no refund before this fix", () => {
  const p = makePlayer([SKILL_A], []); // in skills, NOT in purchasedSkills: this is an innate/signature skill
  const res = removeSkillFromPlayer(p, SKILL_A);
  assert.equal(res.ok, false);
  assert.match(res.reason, /自带/);
  assert.ok(p.skills.includes(SKILL_A), "still on the card — nothing was removed");
  assert.equal(res.returnToInv, undefined, "nothing to refund for a skill that was never bought");
});

test("removableSkills() only lists bought skills — innate ones never show up as droppable", () => {
  const p = makePlayer([SKILL_A, SKILL_B], [SKILL_B]); // A is innate, B was bought
  assert.deepEqual(removableSkills(p), [SKILL_B]);
});

test("unequipping one bought skill doesn't touch an innate skill sitting right next to it", () => {
  const p = makePlayer([SKILL_A, SKILL_B], [SKILL_B], { [SKILL_B]: 70 });
  const res = removeSkillFromPlayer(p, SKILL_B);
  assert.equal(res.ok, true);
  assert.deepEqual(p.skills, [SKILL_A]);
});
