import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
const PLAYERS = await loadSampleRoster();
const { overall } = await import("../js/data/players.js");
const { resolvePlayers } = await import("../js/data/account.js");
const { STAR_SKILL_RARITIES, performDailyDraw, starUpWithSouls } = await import("../js/data/accountGacha.js");
const { MAX_STARS, SOULS_PER_STAR } = await import("../js/data/gacha.js");
const { MAX_BOUGHT_SKILLS, boughtSkillCount, buyableSkills, buySkillWithFragments } = await import("../js/data/accountRecycle.js");
const { soulStarNotice } = await import("../js/ui/gachaView.js");

const DATE = new Date(Date.UTC(2026, 9, 21));
const playerRng = () => 0.5; // never the 20% coach roll

function account(extra = {}) {
  return { id: "acc-gift", playerIds: [], cardMods: {}, gold: 0, fragments: 0, lastDailyDraw: null, ...extra };
}

/** A real mid-tier card that can learn plenty of skills. */
function realCard() {
  assert.ok(PLAYERS.length > 100, "sample roster loaded");
  return PLAYERS.find((p) => overall(p) >= 60 && overall(p) < 78 && buyableSkills(resolvePlayers([p.id], null, PLAYERS)[0]).some((s) => STAR_SKILL_RARITIES.has(s.rarity)));
}

/** Owns the card at `stars` ★ with plenty of 球魂 to spend. */
function owning(card, stars, extra = {}) {
  return account({
    playerIds: [card.id],
    cardMods: { [card.id]: { merges: stars, skills: [], roll: 7, ...extra } },
    gacha: { souls: { [card.bref]: SOULS_PER_STAR * 10 } },
  });
}

const soulUp = (acc, card, rng = playerRng) => starUpWithSouls(acc, card.id, { pool: PLAYERS, rng });

test("only the 球魂 star-up that reaches ★5 gifts a skill; ★1–★4 do not", () => {
  const card = realCard();
  const acc = owning(card, 0);
  const results = [];
  for (let i = 0; i < MAX_STARS; i++) results.push(soulUp(acc, card));
  assert.deepEqual(results.map((r) => r.stars), [1, 2, 3, 4, 5]);
  for (const r of results.slice(0, 4)) assert.equal(r.skill, null, "no gift before ★5");
  assert.deepEqual(acc.cardMods[card.id].skills.length, 1, "exactly one skill, from the last star");
  const last = results[4];
  assert.ok(last.skill, "the ★5 star-up gifts a skill");
  assert.equal(acc.cardMods[card.id].starSkill, last.skill.id);
  assert.ok(resolvePlayers([card.id], acc, PLAYERS)[0].skills.includes(last.skill.id), "the card really has it");
});

test("reaching ★5 by DRAWING duplicates gifts nothing (the rule is about 球魂)", () => {
  const card = realCard();
  const acc = owning(card, MAX_STARS - 1);
  acc.lastDailyDraw = null;
  const result = performDailyDraw(acc, { pool: [card], rng: playerRng, date: DATE });
  assert.equal(result.outcome, "starUp");
  assert.equal(result.stars, MAX_STARS);
  assert.equal(result.starSkill, undefined);
  assert.equal(acc.cardMods[card.id].starSkill, undefined);
  assert.deepEqual(acc.cardMods[card.id].skills, []);
});

test("the gift is a skill the card could legally buy, below 传说 / 神话", () => {
  for (const card of PLAYERS.filter((p) => overall(p) < 85).slice(0, 60)) {
    // 0.3 / 0.5 / 0.999 pick the low, middle and LAST (priciest) option — the last is where a
    // missing rarity filter would hand out a 神话 skill.
    for (const roll of [0.3, 0.5, 0.999]) {
      const acc = owning(card, MAX_STARS - 1);
      const options = buyableSkills(resolvePlayers([card.id], acc, PLAYERS)[0]);
      const { skill } = soulUp(acc, card, () => roll);
      if (!skill) continue; // nothing eligible → nothing, never something illegal
      const chosen = options.find((s) => s.id === skill.id);
      assert.ok(chosen, `${card.name}: gift must pass the shop's own gates`);
      assert.ok(STAR_SKILL_RARITIES.has(chosen.rarity), `${card.name}: ${chosen.name} is ${chosen.rarity} (rng ${roll})`);
    }
  }
  assert.deepEqual([...STAR_SKILL_RARITIES].sort(), ["common", "epic", "rare"]);
});

test("once per card: ★5 cannot be bought again, and later duplicate draws turn into 球魂 only", () => {
  const card = realCard();
  const acc = owning(card, MAX_STARS - 1);
  const { skill } = soulUp(acc, card);
  assert.throws(() => soulUp(acc, card), /已满/);
  const skillsAtFive = [...acc.cardMods[card.id].skills];
  acc.lastDailyDraw = null;
  const dup = performDailyDraw(acc, { pool: [card], rng: playerRng, date: DATE });
  assert.equal(dup.outcome, "soulConvert");
  assert.deepEqual(acc.cardMods[card.id].skills, skillsAtFive);
  assert.equal(acc.cardMods[card.id].starSkill, skill.id);
});

test("the gift does not use up the 2 purchasable skill slots", () => {
  const card = realCard();
  const acc = owning(card, MAX_STARS - 1);
  soulUp(acc, card);
  assert.equal(boughtSkillCount(acc, card.id), 0);
  acc.fragments = 5000;
  const [first, second] = buyableSkills(resolvePlayers([card.id], acc, PLAYERS)[0]);
  buySkillWithFragments(acc, card.id, first.id);
  buySkillWithFragments(acc, card.id, second.id);
  assert.equal(boughtSkillCount(acc, card.id), MAX_BOUGHT_SKILLS);
  const third = buyableSkills(resolvePlayers([card.id], acc, PLAYERS)[0])[0];
  assert.throws(() => buySkillWithFragments(acc, card.id, third.id), /最多买 2 个/);
  const skills = resolvePlayers([card.id], acc, PLAYERS)[0].skills;
  assert.ok(skills.includes(acc.cardMods[card.id].starSkill), "gift + 2 bought coexist");
});

test("nothing eligible left: the star-up still succeeds, there is just no gift", () => {
  const card = realCard();
  const probe = owning(card, MAX_STARS - 1);
  const eligible = buyableSkills(resolvePlayers([card.id], probe, PLAYERS)[0]).filter((s) => STAR_SKILL_RARITIES.has(s.rarity));
  const acc = owning(card, MAX_STARS - 1, { skills: eligible.map((s) => s.id) });
  const result = soulUp(acc, card);
  assert.equal(result.stars, MAX_STARS);
  assert.equal(result.skill, null);
  assert.equal(acc.cardMods[card.id].starSkill, undefined);
});

test("a failed star-up (not enough 球魂) neither spends souls nor gifts", () => {
  const card = realCard();
  const acc = owning(card, MAX_STARS - 1);
  acc.gacha = { souls: { [card.bref]: SOULS_PER_STAR - 1 } };
  assert.throws(() => soulUp(acc, card), /球魂不足/);
  assert.equal(acc.cardMods[card.id].merges, MAX_STARS - 1);
  assert.equal(acc.cardMods[card.id].starSkill, undefined);
});

test("same rng, same gift (no hidden randomness)", () => {
  const card = realCard();
  const gifts = [1, 2].map(() => soulUp(owning(card, MAX_STARS - 1), card).skill?.id);
  assert.equal(gifts[0], gifts[1]);
});

test("the notice announces a gift, and stays silent for ordinary star-ups", () => {
  assert.equal(soulStarNotice({ stars: 5, skill: { name: "盗球鬼才" } }), "★5 满星！获得技能「盗球鬼才」");
  assert.equal(soulStarNotice({ stars: 3, skill: null }), null);
  assert.equal(soulStarNotice({ stars: 5, skill: null }), null);
  assert.equal(soulStarNotice(undefined), null);
});
