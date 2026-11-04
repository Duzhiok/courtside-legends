import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ROLE_SCENARIOS,
  SKILL_PACKS,
  assignSkillPacks,
  skillChipsHtml,
  skillMakeBonus,
  skillPassCareTov,
  skillPassWeight,
  skillReboundMult,
} from "../js/data/skills.js";
import { overall, seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { playerPrice } from "../js/data/intangibles.js";

/**
 * Role layer (non-star, no named kit): style-derived specialties at lowered
 * thresholds, max 2, narrow/situational only. The star layer (28% roll,
 * candidateSkills gates) and the OVR/price formulas are untouched.
 */

// Baseline deliberately below every traitHeuristics gate (def<78, three<78,
// iq<78, str<86, no fiery/composure extremes) so the synthetic player falls
// through to the role branch instead of the named branch.
function rolePlayer(extra = {}) {
  return {
    id: "role-test-player",
    bref: "zzzz_unknown",
    name: "Test Player",
    nameEn: "Test Player",
    season: 2000,
    age: 26,
    archetype: "",
    defense: 70,
    steal: 60,
    three: 60,
    threeTend: 30,
    scoring: 70,
    paint: 60,
    mid: 60,
    block: 60,
    stamina: 70,
    rebound: 60,
    pass: 60,
    iq: 60,
    strength: 78,
    speed: 70,
    raw: { ppg: 8, rpg: 3, apg: 2, spg: 0.8, bpg: 0.5 },
    personality: {},
    intangibles: {},
    ...extra,
  };
}

test("role layer: perimeter lock (def>=74, stl>=65) earns sticky_wrap", () => {
  const p = rolePlayer({ defense: 76, steal: 66 });
  assignSkillPacks(p);
  assert.deepEqual(p.skills, ["sticky_wrap"]);
  assert.deepEqual(p.roleSkills, ["sticky_wrap"]);
});

test("role layer: 3&D (three>=72, def>=72, low threeTend) earns stopper_3d only", () => {
  const p = rolePlayer({ defense: 75, three: 75, threeTend: 30 });
  assignSkillPacks(p);
  assert.deepEqual(p.skills, ["stopper_3d"]);
});

test("role layer: charge taker (iq>=72, def>=74) earns charge_taker", () => {
  const p = rolePlayer({ defense: 76, iq: 75 });
  assignSkillPacks(p);
  assert.deepEqual(p.skills, ["charge_taker"]);
});

test("role layer: rim protector (block>=78) earns rim_protector", () => {
  const p = rolePlayer({ block: 80 });
  assignSkillPacks(p);
  assert.deepEqual(p.skills, ["rim_protector"]);
});

test("role layer: stamina (stamina>=80) earns motor_engine", () => {
  const p = rolePlayer({ stamina: 85 });
  assignSkillPacks(p);
  assert.deepEqual(p.skills, ["motor_engine"]);
});

test("role layer: corner camper (three>=72, threeTend>=40, not a first option)", () => {
  const p = rolePlayer({ three: 75, threeTend: 50, defense: 60 });
  assignSkillPacks(p);
  assert.deepEqual(p.skills, ["corner_camp"]);
});

test("role layer: second-unit engine (pass>=72, not a first option)", () => {
  const p = rolePlayer({ pass: 75 });
  assignSkillPacks(p);
  assert.deepEqual(p.skills, ["second_unit_engine"]);
});

test("role layer: crash-board rebounder (rebound>=78) earns crash_board", () => {
  const p = rolePlayer({ rebound: 80 });
  assignSkillPacks(p);
  assert.deepEqual(p.skills, ["crash_board"]);
});

test("role layer: oversubscription caps at 2 and is deterministic", () => {
  const mk = () =>
    rolePlayer({
      defense: 76,
      steal: 66,
      three: 75,
      threeTend: 50,
      iq: 75,
      block: 80,
      stamina: 85,
      rebound: 80,
      pass: 75,
    });
  const a = mk();
  const b = mk();
  assignSkillPacks(a);
  assignSkillPacks(b);
  assert.ok(a.skills.length <= 2, `expected at most 2 role skills, got ${a.skills}`);
  assert.deepEqual(a.skills, b.skills);
  assert.deepEqual(a.roleSkills, a.skills);
});

test("star layer untouched: same profile at star tier gets no role skills", () => {
  const p = rolePlayer({ defense: 76, steal: 66, hiddenTier: "star" });
  assignSkillPacks(p);
  assert.deepEqual(p.roleSkills, []);
  const roleIds = new Set(["sticky_wrap", "stopper_3d", "charge_taker", "rim_protector", "motor_engine", "corner_camp", "second_unit_engine", "crash_board"]);
  assert.ok(!p.skills.some((id) => roleIds.has(id)), `star branch leaked role skills: ${p.skills}`);
});

test("role skills do not move OVR or price on a real card", () => {
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  const row = rows.find((r) => r.season === 2020);
  const card = seasonToCard(row);
  const ovrBefore = overall(card);
  const priceBefore = playerPrice(card);
  assignSkillPacks(card);
  assert.equal(overall(card), ovrBefore);
  assert.equal(playerPrice(card), priceBefore);
});

test("role layer across the 2020 pool: at most 2 each, at least one player gains", () => {
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  const cards = rows.filter((r) => r.season === 2020).map(seasonToCard);
  let gained = 0;
  for (const c of cards) {
    assert.ok((c.roleSkills || []).length <= 2, `${c.name} has ${(c.roleSkills || []).length} role skills`);
    for (const id of c.roleSkills || []) assert.ok(SKILL_PACKS[id], `unknown role skill ${id}`);
    if ((c.roleSkills || []).length) gained++;
  }
  assert.ok(gained > 0, "expected at least one 2020 card to gain a role skill");
});

test("new skill magnitudes sit at the low end", () => {
  const camper = { skills: ["corner_camp"] };
  assert.equal(skillMakeBonus(camper, { zone: "three" }, { open: 0.6 }), 0.018);
  assert.equal(skillMakeBonus(camper, { zone: "three" }, { open: 0.4 }), 0);
  assert.equal(skillMakeBonus(camper, { zone: "mid" }, { open: 0.6 }), 0);
  assert.equal(skillPassWeight({ skills: ["second_unit_engine"] }), 1.15);
  assert.equal(skillPassCareTov({ skills: ["second_unit_engine"] }), -0.005);
  const mults = new Set();
  for (let i = 0; i < 200; i++) mults.add(skillReboundMult({ skills: ["crash_board"] }, {}));
  assert.ok([...mults].every((m) => m === 1 || m === 1.2), `unexpected rebound mults: ${[...mults]}`);
  assert.ok(mults.has(1.2), "crash_board never triggered in 200 trials");
});

test("card shows one scenario line per role skill, none for star skills", () => {
  const zh = skillChipsHtml({ skills: ["corner_camp"], roleSkills: ["corner_camp"] }, "zh");
  assert.ok(zh.includes(ROLE_SCENARIOS.corner_camp.zh), zh);
  const en = skillChipsHtml({ skills: ["corner_camp"], roleSkills: ["corner_camp"] }, "en");
  assert.ok(en.includes(ROLE_SCENARIOS.corner_camp.en), en);
  const star = skillChipsHtml({ skills: ["rainmaker"], roleSkills: [] }, "zh");
  assert.ok(!star.includes("role-scenario"), star);
});
