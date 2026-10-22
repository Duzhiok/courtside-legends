import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { loadSampleRoster } = await import("./helpers/sampleRoster.js");
const PLAYERS = await loadSampleRoster();
const { overall } = await import("../js/data/players.js");
const { resolvePlayers } = await import("../js/data/account.js");
const { STAR_SKILL_RARITIES, performDailyDraw, starUpWithSouls } = await import("../js/data/accountGacha.js");
const { MAX_STARS } = await import("../js/data/gacha.js");
const { MAX_BOUGHT_SKILLS, boughtSkillCount, buyableSkills, buySkillWithFragments } = await import("../js/data/accountRecycle.js");

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

/** Draw the same single-card pool again (a duplicate each time after the first). */
function draw(acc, card, rng = playerRng) {
  acc.lastDailyDraw = null; // a free pull every time
  return performDailyDraw(acc, { pool: [card], rng, date: DATE });
}

/** Account that owns the card at ★4, so the next duplicate is the 5th. */
function atFourStars(card, extra = {}) {
  return account({ playerIds: [card.id], cardMods: { [card.id]: { merges: MAX_STARS - 1, skills: [], roll: 7, ...extra } } });
}

test("only the 5th duplicate (★5) gifts a skill; the new card and duplicates 1–4 do not", () => {
  const card = realCard();
  const acc = account();
  const results = [draw(acc, card)];
  assert.equal(results[0].outcome, "new");
  for (let i = 1; i <= 4; i++) results.push(draw(acc, card));
  assert.deepEqual(results.map((r) => r.stars), [0, 1, 2, 3, 4]);
  for (const r of results) assert.ok(!r.starSkill, "no gift before ★5");
  assert.deepEqual(acc.cardMods[card.id].skills, []);

  const fifth = draw(acc, card);
  assert.equal(fifth.stars, MAX_STARS);
  assert.ok(fifth.starSkill, "the 5th duplicate gifts a skill");
  assert.ok(fifth.player.skills.includes(fifth.starSkill.id), "the revealed card already has it");
  assert.equal(acc.cardMods[card.id].starSkill, fifth.starSkill.id);
});

test("the gift is a skill the card could legally buy, below 传说 / 神话", () => {
  for (const card of PLAYERS.filter((p) => overall(p) < 85).slice(0, 60)) {
    // 0.3 / 0.5 / 0.999 pick the low, middle and LAST (priciest) option — the last is where a
    // missing rarity filter would hand out a 神话 skill.
    for (const roll of [0.3, 0.5, 0.999]) {
      const acc = atFourStars(card);
      const options = buyableSkills(resolvePlayers([card.id], acc, PLAYERS)[0]);
      const result = draw(acc, card, () => roll);
      if (!result.starSkill) continue; // a card with nothing eligible gets nothing, never something illegal
      const chosen = options.find((s) => s.id === result.starSkill.id);
      assert.ok(chosen, `${card.name}: gift must pass the shop's own gates`);
      assert.ok(STAR_SKILL_RARITIES.has(chosen.rarity), `${card.name}: ${chosen.name} is ${chosen.rarity} (rng ${roll})`);
    }
  }
  assert.deepEqual([...STAR_SKILL_RARITIES].sort(), ["common", "epic", "rare"]);
});

test("many different rolls never produce a 传说 or 神话 gift", () => {
  const card = realCard();
  let seed = 11;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    const acc = atFourStars(card);
    const result = draw(acc, card, () => rng());
    // rng also drives the coach roll; skip those draws
    if (result.kind !== "player" || !result.starSkill) continue;
    seen.add(result.starSkill.rarity);
  }
  assert.ok(seen.size > 0);
  for (const rarity of seen) assert.ok(STAR_SKILL_RARITIES.has(rarity), rarity);
});

test("once per card: the 6th duplicate converts to 球魂 and gifts nothing more", () => {
  const card = realCard();
  const acc = atFourStars(card);
  const fifth = draw(acc, card);
  const skillsAtFive = [...acc.cardMods[card.id].skills];
  const sixth = draw(acc, card);
  assert.equal(sixth.outcome, "soulConvert");
  assert.ok(!sixth.starSkill);
  assert.deepEqual(acc.cardMods[card.id].skills, skillsAtFive);
  assert.equal(acc.cardMods[card.id].starSkill, fifth.starSkill.id);
});

test("the gift does not use up the 2 purchasable skill slots", () => {
  const card = realCard();
  const acc = atFourStars(card);
  draw(acc, card);
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

test("a card with nothing eligible left simply gets no gift (no crash, no empty record)", () => {
  const card = realCard();
  const probe = atFourStars(card);
  const eligible = buyableSkills(resolvePlayers([card.id], probe, PLAYERS)[0]).filter((s) => STAR_SKILL_RARITIES.has(s.rarity));
  const acc = atFourStars(card, { skills: eligible.map((s) => s.id) });
  const result = draw(acc, card);
  assert.equal(result.stars, MAX_STARS);
  assert.ok(!result.starSkill);
  assert.equal(acc.cardMods[card.id].starSkill, undefined);
});

test("same rng, same gift (no hidden randomness)", () => {
  const card = realCard();
  const gifts = [1, 2].map(() => draw(atFourStars(card), card).starSkill?.id);
  assert.equal(gifts[0], gifts[1]);
});

test("reaching ★5 with 球魂 is not a draw: no gift (the rule is about drawing the 5th duplicate)", () => {
  const card = realCard();
  const acc = atFourStars(card, {});
  acc.gacha = { souls: { [card.bref]: 99 } };
  starUpWithSouls(acc, card.id);
  assert.equal(acc.cardMods[card.id].merges, MAX_STARS);
  assert.equal(acc.cardMods[card.id].starSkill, undefined);
});

test("the reveal tells the player about the gift (and says nothing when there is none)", async () => {
  const { drawRevealHtml } = await import("../js/ui/gachaView.js");
  const view = { esc: (x) => String(x), photoImg: () => "", rarityClass: () => "", skillChipsHtml: () => "" };
  const base = { kind: "player", outcome: "starUp", stars: MAX_STARS, ovr: 70, banner: { name: "常驻" }, player: { name: "X", season: 2000, pos: "SF" }, rollChoice: null };
  const withGift = drawRevealHtml({ ...base, starSkill: { id: "x", name: "盗球鬼才", rarity: "rare" } }, view);
  assert.match(withGift, /满星礼物：获得技能「盗球鬼才」/);
  const without = drawRevealHtml({ ...base, stars: 3, starSkill: null }, view);
  assert.doesNotMatch(without, /满星礼物/);
});
