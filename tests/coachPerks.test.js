import test from "node:test";
import assert from "node:assert/strict";
import {
  COACH_PERK_LINES,
  COACH_PERK_MAX_LEVEL,
  COACH_XP_LOSS,
  COACH_XP_PLAYOFF_MULTIPLIER,
  COACH_XP_UPSET,
  COACH_XP_UPSET_GAP,
  COACH_XP_WIN,
  PERK_DEVELOPMENT_XP,
  PERK_MEDIA_SOFTEN,
  PERK_NEGOTIATION_SALARY,
  PERK_TACTICS_SHOT,
} from "../js/career/balance.js";
import { createCoachProfile, xpToNextLevel } from "../js/career/coachProfile.js";
import {
  PERK_LINE_INFO,
  awardCoachXp,
  developmentXpMultiplier,
  gameCoachXp,
  negotiationSalaryBonus,
  perkEffectText,
  perkLevel,
  softenReputationLoss,
  tacticsShotBonus,
} from "../js/career/coachPerks.js";

const CJK = /[\u3400-\u9fff]/;
const withPerks = (perks) => createCoachProfile({ perks: { tactics: 0, development: 0, negotiation: 0, media: 0, ...perks } });

test("gameCoachXp: a win teaches more than a loss, and a tie counts as a loss", () => {
  assert.deepEqual(gameCoachXp({ won: true }), { xp: COACH_XP_WIN, parts: [{ id: "win", xp: COACH_XP_WIN }], playoff: false, multiplier: 1 });
  assert.deepEqual(gameCoachXp({ won: false }), { xp: COACH_XP_LOSS, parts: [{ id: "loss", xp: COACH_XP_LOSS }], playoff: false, multiplier: 1 });
  assert.equal(gameCoachXp({ won: false, tied: true }).xp, COACH_XP_LOSS);
});

test("gameCoachXp: an upset needs a win AND a real strength gap", () => {
  const upset = { youStrength: 70, oppStrength: 70 + COACH_XP_UPSET_GAP };
  assert.equal(gameCoachXp({ won: true, ...upset }).xp, COACH_XP_WIN + COACH_XP_UPSET);
  assert.deepEqual(gameCoachXp({ won: true, ...upset }).parts.map((part) => part.id), ["win", "upset"]);
  assert.equal(gameCoachXp({ won: false, ...upset }).xp, COACH_XP_LOSS, "losing to a better team is no upset");
  assert.equal(gameCoachXp({ won: true, youStrength: 70, oppStrength: 70 + COACH_XP_UPSET_GAP - 0.5 }).xp, COACH_XP_WIN, "just under the gap");
  assert.equal(gameCoachXp({ won: true, youStrength: NaN, oppStrength: 90 }).xp, COACH_XP_WIN, "unknown strength is never an upset");
});

test("gameCoachXp: playoff games count double, upset included", () => {
  const result = gameCoachXp({ won: true, playoff: true, youStrength: 60, oppStrength: 80 });
  assert.equal(result.xp, (COACH_XP_WIN + COACH_XP_UPSET) * COACH_XP_PLAYOFF_MULTIPLIER);
  assert.equal(result.playoff, true);
  assert.equal(gameCoachXp({ won: false, playoff: true }).xp, COACH_XP_LOSS * COACH_XP_PLAYOFF_MULTIPLIER);
});

test("awardCoachXp: pays the game, levels up, grants perk points, never mutates the coach", () => {
  const coach = createCoachProfile({ xp: xpToNextLevel(1) - 1 });
  const frozen = JSON.stringify(coach);
  const { coach: next, entry } = awardCoachXp(coach, { won: true });
  assert.equal(JSON.stringify(coach), frozen);
  assert.equal(next.level, 2);
  assert.equal(next.perkPoints, 1);
  assert.equal(next.xp, COACH_XP_WIN - 1);
  assert.equal(entry.xp, COACH_XP_WIN);
  assert.equal(entry.leveledUp, 1);
  assert.equal(entry.level, 2);
  assert.equal(entry.perkPoints, 1);
  assert.ok(Math.abs(entry.progress - (COACH_XP_WIN - 1) / xpToNextLevel(2)) < 1e-9);
});

test("awardCoachXp: a whole regular season is worth a couple of levels, not the whole tree", () => {
  let coach = createCoachProfile();
  for (let game = 0; game < 82; game++) coach = awardCoachXp(coach, { won: game % 2 === 0 }).coach;
  const allPoints = COACH_PERK_LINES.length * COACH_PERK_MAX_LEVEL;
  assert.ok(coach.perkPoints >= 1, `a .500 season earns at least one point (got ${coach.perkPoints})`);
  assert.ok(coach.perkPoints <= 3, `but nowhere near all ${allPoints} (got ${coach.perkPoints})`);
});

test("perks at level 0 change nothing", () => {
  const coach = createCoachProfile();
  assert.equal(tacticsShotBonus(coach), 0);
  assert.equal(developmentXpMultiplier(coach), 1);
  assert.equal(negotiationSalaryBonus(coach), 0);
  assert.equal(softenReputationLoss(-5, coach), -5);
  assert.equal(softenReputationLoss(4, coach), 4);
  assert.equal(tacticsShotBonus(undefined), 0, "no coach at all reads as no perks");
});

test("each perk line scales per level", () => {
  const coach = withPerks({ tactics: 2, development: 3, negotiation: 1, media: 2 });
  assert.ok(Math.abs(tacticsShotBonus(coach) - 2 * PERK_TACTICS_SHOT) < 1e-12);
  assert.ok(Math.abs(developmentXpMultiplier(coach) - (1 + 3 * PERK_DEVELOPMENT_XP)) < 1e-9);
  assert.equal(negotiationSalaryBonus(coach), PERK_NEGOTIATION_SALARY);
  assert.equal(softenReputationLoss(-5, coach), -5 + 2 * PERK_MEDIA_SOFTEN);
});

test("media savvy softens a loss but never turns it into a gain, and leaves gains alone", () => {
  const coach = withPerks({ media: 3 });
  assert.equal(softenReputationLoss(-2, coach), 0);
  assert.equal(softenReputationLoss(-1, coach), 0);
  assert.equal(softenReputationLoss(6, coach), 6);
  assert.equal(softenReputationLoss(0, coach), 0);
});

test("perkLevel reads junk as 0 and never exceeds the cap", () => {
  assert.equal(perkLevel(withPerks({ tactics: 99 }), "tactics"), COACH_PERK_MAX_LEVEL);
  assert.equal(perkLevel(withPerks({ tactics: -4 }), "tactics"), 0);
  assert.equal(perkLevel({ perks: { tactics: "x" } }, "tactics"), 0);
  assert.equal(perkLevel(createCoachProfile(), "nope"), 0);
});

test("every perk line has a name and an effect line in both languages, for every level", () => {
  assert.deepEqual(Object.keys(PERK_LINE_INFO).sort(), [...COACH_PERK_LINES].sort());
  for (const line of COACH_PERK_LINES) {
    const [zh, en] = PERK_LINE_INFO[line].label;
    assert.ok(CJK.test(zh), `${line} zh label`);
    assert.ok(en && !CJK.test(en), `${line} en label`);
    for (let level = 1; level <= COACH_PERK_MAX_LEVEL; level++) {
      assert.ok(CJK.test(perkEffectText(line, level, "zh")), `${line} Lv${level} zh`);
      const english = perkEffectText(line, level, "en");
      assert.ok(english && !CJK.test(english), `${line} Lv${level} en: ${english}`);
    }
  }
});

test("effect text quotes the real numbers it applies", () => {
  assert.match(perkEffectText("tactics", 2, "zh"), new RegExp(`\\+${(2 * PERK_TACTICS_SHOT * 100).toFixed(0)}%`), "2 x 0.5% reads as +1%, not +1.0%");
  assert.match(perkEffectText("development", 1, "en"), new RegExp(`\\+${Math.round(PERK_DEVELOPMENT_XP * 100)}%`));
  assert.match(perkEffectText("negotiation", 3, "en"), new RegExp(`\\+¤${3 * PERK_NEGOTIATION_SALARY}`));
  assert.match(perkEffectText("media", 1, "zh"), new RegExp(`${PERK_MEDIA_SOFTEN}`));
});
