import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { todayKey, uniqueByPerson } = await import("../js/data/account.js");
const {
  craftWishCard,
  drawAvailability,
  performDailyDraw,
  resolvePendingRoll,
  setWishlist,
  starUpWithSouls,
} = await import("../js/data/accountGacha.js");
const { MAX_STARS, SOULS_PER_STAR } = await import("../js/data/gacha.js");

function card(id, ovr) {
  const [bref, season] = id.split("-");
  return { id, bref, season: Number(season), team: "DEN", ovr2k: ovr, ratingSource: "anchor", skills: [], intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 } };
}

const JOKIC_2020 = card("jokic-2020", 90);
const JOKIC_2021 = card("jokic-2021", 95);
const DATE = new Date(Date.UTC(2026, 9, 21));

function account(extra = {}) {
  return { id: "acc-test", playerIds: [], cardMods: {}, gold: 0, lastDailyDraw: null, ...extra };
}

/** First rng value skips the 20% coach roll; the rest just needs to be stable. */
const playerRng = () => 0.5;

/** rng that replays a script, then repeats the last value. */
function scripted(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test("a brand-new card joins the binder with its own 成色 roll", () => {
  const acc = account();
  const result = performDailyDraw(acc, { pool: [JOKIC_2020], rng: playerRng, date: DATE });
  assert.equal(result.outcome, "new");
  assert.deepEqual(acc.playerIds, ["jokic-2020"]);
  assert.ok(acc.cardMods["jokic-2020"].roll > 0);
  assert.ok(result.player.hiddenRoll.grade);
});

test("same season card → ★+1, no random skill, and a whole-roll 成色 choice", () => {
  const acc = account({ playerIds: ["jokic-2020"], cardMods: { "jokic-2020": { merges: 0, skills: [], roll: 77 } } });
  const result = performDailyDraw(acc, { pool: [JOKIC_2020], rng: playerRng, date: DATE });
  assert.equal(result.outcome, "starUp");
  assert.equal(result.stars, 1);
  assert.deepEqual(acc.cardMods["jokic-2020"].skills, []);
  assert.ok(result.rollChoice.current && result.rollChoice.candidate);
  assert.equal(result.rollChoice.current.seed, 77);

  resolvePendingRoll(acc, false);
  assert.equal(acc.cardMods["jokic-2020"].roll, 77);
  assert.equal(acc.pendingRoll, null);
});

test("taking the new 成色 swaps the whole roll", () => {
  const acc = account({ playerIds: ["jokic-2020"], cardMods: { "jokic-2020": { merges: 1, skills: [], roll: 77 } } });
  const result = performDailyDraw(acc, { pool: [JOKIC_2020], rng: playerRng, date: DATE });
  resolvePendingRoll(acc, true);
  assert.equal(acc.cardMods["jokic-2020"].roll, result.rollChoice.candidate.seed);
});

test("same card at ★5 converts into 球魂 instead of stacking", () => {
  const acc = account({ playerIds: ["jokic-2020"], cardMods: { "jokic-2020": { merges: MAX_STARS, skills: [], roll: 5 } } });
  const result = performDailyDraw(acc, { pool: [JOKIC_2020], rng: playerRng, date: DATE });
  assert.equal(result.outcome, "soulConvert");
  assert.equal(acc.gacha.souls.jokic, 2);
  assert.equal(acc.cardMods["jokic-2020"].merges, MAX_STARS);
});

test("same person, other season → new version + 1 球魂", () => {
  const acc = account({ playerIds: ["jokic-2020"], cardMods: { "jokic-2020": { merges: 0, skills: [], roll: 5 } } });
  // 0.5 skips the coach roll, 0.001 rolls the myth band → nearest lower = 2021 (95)
  const result = performDailyDraw(acc, { pool: [JOKIC_2020, JOKIC_2021], rng: scripted(0.5, 0.001, 0), date: DATE });
  assert.equal(result.player.id, "jokic-2021");
  assert.equal(result.outcome, "newVersion");
  assert.deepEqual(acc.playerIds, ["jokic-2020", "jokic-2021"]);
  assert.equal(acc.gacha.souls.jokic, 1);
});

test("球魂 buy ★ on any card of that person", () => {
  const acc = account({ playerIds: ["jokic-2021"], cardMods: {}, gacha: { souls: { jokic: SOULS_PER_STAR } } });
  assert.equal(starUpWithSouls(acc, "jokic-2021", { pool: [JOKIC_2021] }), 1);
  assert.equal(acc.gacha.souls.jokic, 0);
  assert.throws(() => starUpWithSouls(acc, "jokic-2021", { pool: [JOKIC_2021] }), /球魂不足/);
});

test("after the free pull, extra pulls cost gold and are capped", () => {
  const acc = account({ gold: 1000 });
  performDailyDraw(acc, { pool: [JOKIC_2020], rng: playerRng, date: DATE });
  assert.equal(drawAvailability(acc, todayKey(DATE)).free, false);
  const paid = performDailyDraw(acc, { pool: [JOKIC_2020], rng: playerRng, date: DATE });
  assert.equal(paid.paidGold, 200);
  performDailyDraw(acc, { pool: [JOKIC_2020], rng: playerRng, date: DATE });
  assert.throws(() => performDailyDraw(acc, { pool: [JOKIC_2020], rng: playerRng, date: DATE }), /金币也不够/);
});

test("crafting only works for the wishlist person and costs gold", () => {
  const acc = account({ gold: 5000 });
  assert.throws(() => craftWishCard(acc, "jokic-2021", { pool: [JOKIC_2021] }), /心愿单/);
  setWishlist(acc, "jokic");
  const { cost } = craftWishCard(acc, "jokic-2021", { pool: [JOKIC_2021] });
  assert.ok(cost > 0);
  assert.equal(acc.gold, 5000 - cost);
  assert.ok(acc.playerIds.includes("jokic-2021"));
  assert.throws(() => craftWishCard(acc, "jokic-2021", { pool: [JOKIC_2021] }), /已拥有/);
});

test("one real person per roster: keep the best copy", () => {
  const ovr = (p) => p.ovr2k;
  const lineup = uniqueByPerson([JOKIC_2020, JOKIC_2021, card("murray-2023", 84)], ovr);
  assert.equal(lineup.length, 2);
  assert.ok(lineup.some((p) => p.id === "jokic-2021"));
  assert.ok(!lineup.some((p) => p.id === "jokic-2020"));
});
