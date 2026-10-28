import test from "node:test";
import assert from "node:assert/strict";
import { seasonToCard } from "../js/data/players.js";
import { rosterFitDelta, rosterFitTier } from "../js/engine/careerEconomy.js";

/**
 * 「战术契合/缺位补强」两个标签太鸡肋(只看位置计数/archetype字符串，跟这支队到底
 * 好不好用没关系)。换成真正的「数据分析师」适配分:把候选人换进现有主力里，
 * 比较换前换后的化学反应+阵容适配，只有真的会让球队变强才标注。
 */
function synthCard(i, pos, overrides = {}) {
  return seasonToCard({
    bref: `fitref${pos}${i}`,
    id: `fitref${pos}${i}-2020-syn`,
    name: `Fit Ref ${pos} ${i}`,
    season: 2020,
    team: "SYN",
    pos,
    gp: 70,
    mpg: 28,
    ppg: 14,
    rpg: 5,
    apg: 3,
    spg: 1,
    bpg: 0.5,
    tpg: 2,
    fg: 0.45,
    tp: 0.35,
    ft: 0.8,
    fga: 12,
    tpa: 4,
    src: "test",
    ...overrides,
  });
}

function fiveMan() {
  return [
    synthCard(1, "PG"),
    synthCard(2, "SG"),
    synthCard(3, "SF"),
    synthCard(4, "PF"),
    synthCard(5, "C"),
  ];
}

test("rosterFitDelta: fewer than 5 players on the roster → 0, no claim made from thin air", () => {
  const candidate = synthCard(9, "C");
  assert.equal(rosterFitDelta(candidate, [], null, null), 0);
  assert.equal(rosterFitDelta(candidate, fiveMan().slice(0, 3), null, null), 0);
  assert.equal(rosterFitDelta(null, fiveMan(), null, null), 0);
});

test("rosterFitDelta: swaps the candidate in for the weakest same-position starter, not just appends him", () => {
  const roster = fiveMan();
  const weakC = roster.find((p) => p.pos === "C");
  const candidate = synthCard(9, "C");
  // Should not throw and should be a finite number either way.
  const delta = rosterFitDelta(candidate, roster, null, null);
  assert.equal(typeof delta, "number");
  assert.ok(Number.isFinite(delta));
  assert.ok(weakC, "fixture sanity: there is a C to be displaced");
});

test("rosterFitTier: only calls out genuinely good fits, not everything", () => {
  assert.equal(rosterFitTier(0), null);
  assert.equal(rosterFitTier(5), null);
  assert.equal(rosterFitTier(6), "good");
  assert.equal(rosterFitTier(13), "good");
  assert.equal(rosterFitTier(14), "great");
  assert.equal(rosterFitTier(40), "great");
  assert.equal(rosterFitTier(-20), null);
});

test("rosterFitDelta: a star-stacking roster with zero connectors gets measurably worse from adding ANOTHER ball-dominant star at the weak slot", () => {
  const stackedStars = [
    synthCard(1, "PG", { ppg: 28, apg: 9 }),
    synthCard(2, "SG", { ppg: 26 }),
    synthCard(3, "SF", { ppg: 25 }),
    synthCard(4, "PF", { ppg: 10 }),
    synthCard(5, "C", { ppg: 8 }),
  ];
  // Force the three "stars" into iso archetypes so lineupFit's star-stacking-without-connectors
  // penalty actually fires -- that penalty is what should make piling on a 4th iso star a bad fit.
  stackedStars[0].archetype = "iso_creator";
  stackedStars[1].archetype = "iso_scorer";
  stackedStars[2].archetype = "iso_scorer";
  const anotherIsoStar = synthCard(9, "PF", { ppg: 27 });
  anotherIsoStar.archetype = "iso_scorer";
  const boringRoleBig = synthCard(10, "PF", { ppg: 6, rpg: 9 });
  const deltaStar = rosterFitDelta(anotherIsoStar, stackedStars, null, null);
  const deltaRole = rosterFitDelta(boringRoleBig, stackedStars, null, null);
  assert.ok(
    deltaRole > deltaStar,
    `a connector-less role big (${deltaRole}) should fit this roster better than a 4th iso star (${deltaStar})`
  );
});
