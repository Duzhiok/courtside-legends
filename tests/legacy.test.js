// B7: the whole-career legacy rating. Pure functions over root.coach, so plain objects are enough.
import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_TIER_MIN } from "../js/career/balance.js";
import { buildLegacy, LEGACY_TIERS, legacyScore, legacyTierId } from "../js/career/legacy.js";

const stint = (over = {}) => ({
  teamId: "LAL", startYear: 1995, endYear: 2000, seasons: 5, wins: 300, losses: 110, championships: 0, reason: "departed", ...over,
});
const coach = (stints, over = {}) => ({ age: 60, reputation: 70, stints, ...over });

test("worked examples: the score is the sum you can do by hand, and lands in the intended tier", () => {
  // score = titles*12 + (winPct-.5)*100 + min(seasons,30)*.5 + reputation*.25, rounded
  const table = [
    // 3 titles, .650, 20 seasons, rep 90 -> 36 + 15 + 10 + 22.5 = 83.5 -> 84
    { name: "dynasty", stints: [stint({ seasons: 20, wins: 1040, losses: 560, championships: 3 })], reputation: 90, score: 84, tier: "hall-of-fame" },
    // 2 titles, .620, 15 seasons, rep 85 -> 24 + 12 + 7.5 + 21.25 = 64.75 -> 65
    { name: "great", stints: [stint({ seasons: 15, wins: 930, losses: 570, championships: 2 })], reputation: 85, score: 65, tier: "great" },
    // 1 title, .600, 10 seasons, rep 75 -> 12 + 10 + 5 + 18.75 = 45.75 -> 46
    { name: "solid", stints: [stint({ seasons: 10, wins: 492, losses: 328, championships: 1 })], reputation: 75, score: 46, tier: "solid" },
    // no title, .550, 8 seasons, rep 60 -> 0 + 5 + 4 + 15 = 24
    { name: "journeyman", stints: [stint({ seasons: 8, wins: 361, losses: 295 })], reputation: 60, score: 24, tier: "journeyman" },
    // no title, .400, 2 seasons, rep 40 -> 0 + 0 + 1 + 10 = 11
    { name: "brief", stints: [stint({ seasons: 2, wins: 66, losses: 98 })], reputation: 40, score: 11, tier: "brief" },
  ];
  for (const row of table) {
    const legacy = buildLegacy(coach(row.stints, { reputation: row.reputation }));
    assert.equal(legacy.score, row.score, `${row.name}: score`);
    assert.equal(legacy.tier, row.tier, `${row.name}: tier`);
  }
});

test("tier boundaries: each threshold belongs to the tier it opens, one point less to the one below", () => {
  const { hallOfFame, great, solid, journeyman } = LEGACY_TIER_MIN;
  const edges = [[hallOfFame, "hall-of-fame"], [hallOfFame - 1, "great"], [great, "great"], [great - 1, "solid"],
    [solid, "solid"], [solid - 1, "journeyman"], [journeyman, "journeyman"], [journeyman - 1, "brief"], [0, "brief"]];
  for (const [score, tier] of edges) assert.equal(legacyTierId(score), tier, `score ${score}`);
});

test("no single stat buys the plaque: titles alone, or a perfect record alone, fall short of the Hall", () => {
  const titlesOnly = buildLegacy(coach([stint({ seasons: 1, wins: 41, losses: 41, championships: 6 })], { reputation: 0 }));
  assert.equal(titlesOnly.score, 73, "6 titles = 72, plus half a point for the one season");
  assert.notEqual(titlesOnly.tier, "hall-of-fame");
  const perfect = buildLegacy(coach([stint({ seasons: 30, wins: 2460 * 0.8, losses: 2460 * 0.2 })], { reputation: 100 }));
  assert.ok(perfect.score < LEGACY_TIER_MIN.hallOfFame, `a title-less .800 career scored ${perfect.score}`);
});

test("win rate below .500 is worth zero, not a penalty; longevity stops paying at the cap", () => {
  const rate = (w, l) => legacyScore({ titles: 0, winPct: w / (w + l), seasons: 10, reputation: 50 });
  assert.equal(rate(30, 70), rate(50, 50), "a losing record is 0 points, never negative");
  const longevity = (seasons) => legacyScore({ titles: 0, winPct: 0.5, seasons, reputation: 0 });
  assert.equal(longevity(30), longevity(60));
  assert.ok(longevity(30) > longevity(28), "(29 vs 30 is a half point, which rounds away)");
});

test("several jobs add up: totals, how many clubs (a return counts once), and the span of years", () => {
  const legacy = buildLegacy(coach([
    stint({ teamId: "LAL", startYear: 1995, seasons: 3, wins: 150, losses: 96, championships: 1 }),
    stint({ teamId: "BOS", startYear: 1998, seasons: 2, wins: 100, losses: 64 }),
    stint({ teamId: "LAL", startYear: 2000, seasons: 4, wins: 200, losses: 128, championships: 1 }),
  ]));
  assert.equal(legacy.seasons, 9);
  assert.equal(legacy.wins, 450);
  assert.equal(legacy.losses, 288);
  assert.equal(legacy.titles, 2);
  assert.equal(legacy.stints, 3);
  assert.equal(legacy.teams, 2);
  assert.equal(legacy.firstYear, 1995);
  assert.equal(legacy.lastYear, 2003, "the last COACHED year: 2000 + 4 seasons - 1");
  assert.equal(legacy.age, 60);
});

test("a job that never finished a season counts for nothing (and not as a club)", () => {
  const legacy = buildLegacy(coach([
    stint({ teamId: "LAL", seasons: 3, wins: 150, losses: 96 }),
    stint({ teamId: "NYK", seasons: 0, wins: 0, losses: 0, reason: "poached" }),
  ]));
  assert.equal(legacy.stints, 1);
  assert.equal(legacy.teams, 1);
});

test("empty or malformed careers degrade to a zeroed 'brief chapter', never a crash or NaN", () => {
  for (const input of [null, undefined, {}, { stints: "nope" }, coach([], { reputation: 0 })]) {
    const legacy = buildLegacy(input);
    assert.equal(legacy.seasons, 0);
    assert.equal(legacy.winPct, 0);
    assert.equal(legacy.firstYear, null);
    assert.equal(legacy.tier, "brief");
    assert.ok(Number.isFinite(legacy.score), JSON.stringify(input));
  }
});

test("hallOfFame flag matches the tier, and every tier has both languages and a valid tone", () => {
  const hof = buildLegacy(coach([stint({ seasons: 20, wins: 1040, losses: 560, championships: 3 })], { reputation: 90 }));
  assert.equal(hof.hallOfFame, true);
  assert.equal(buildLegacy(coach([])).hallOfFame, false);
  assert.deepEqual(Object.keys(LEGACY_TIERS).sort(), ["brief", "great", "hall-of-fame", "journeyman", "solid"]);
  for (const [id, tier] of Object.entries(LEGACY_TIERS)) {
    assert.ok(tier.label && tier.labelEn, `${id} needs zh + en`);
    assert.ok(["success", "neutral"].includes(tier.tone), `${id} tone ${tier.tone}`);
  }
});
