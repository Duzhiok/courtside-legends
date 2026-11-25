import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const camp = await import("../js/data/trainingCamp.js");
const rules = await import("../js/data/trainingRules.js");
const { applyCardMods } = await import("../js/data/account.js");
const { recycleCards } = await import("../js/data/accountRecycle.js");
const { EPIPHANY_RULES } = await import("../js/data/epiphany.js");

const HOUR = 3600 * 1000;
const T0 = Date.UTC(2026, 10, 24, 22, 0);
const noSave = () => {};

function card(id, over = {}) {
  return {
    id, bref: id, season: 2000, name: id, team: "DEN", pos: "SF", age: 27, heightCm: 201,
    ovr2k: 72, ratingSource: "anchor", skills: [], speed: 70, strength: 65, stamina: 70, block: 60,
    three: 70, mid: 62, paint: 62, pass: 65, iq: 65, rebound: 55, defense: 60, steal: 55, scoring: 65, clutch: 60,
    intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 },
    ...over,
  };
}
const POOL = Array.from({ length: 10 }, (_, i) => card(`c${i}`));
POOL.push(card("weak", { three: 40, mid: 40 }));
const opts = (now, extra = {}) => ({ now, pool: POOL, save: noSave, ...extra });
const account = (gold = 5000) => ({ id: "acc-1", playerIds: POOL.map((p) => p.id), cardMods: {}, gold });
const shoot = (playerId, durationId = "fullDay", attr = "three") => ({ playerId, campId: "shooting", attr, durationId });

test("start: pays gold, takes a slot, and refuses a second camp for the same card / a full house / not-owned / broke", () => {
  const acc = account(400);
  const s = camp.startTraining(acc, shoot("c0"), opts(T0));
  assert.equal(acc.gold, 250);
  assert.equal(camp.trainingState(acc).sessions.length, 1);
  assert.equal(s.completesAt, T0 + 24 * HOUR);
  assert.throws(() => camp.startTraining(acc, shoot("c0", "warmup"), opts(T0)), /已经在训练/);
  camp.startTraining(acc, shoot("c1", "warmup"), opts(T0));
  assert.throws(() => camp.startTraining(acc, shoot("c2", "warmup"), opts(T0)), /训练位已满/);
  assert.throws(() => camp.startTraining(account(), shoot("nobody"), opts(T0)), /永久拥有/);
  assert.throws(() => camp.startTraining(account(10), shoot("c3"), opts(T0)), /金币不足/);
});

test("offline: the session turns ready from the clock alone; claiming early is refused, claiming twice is refused", () => {
  const acc = account();
  const s = camp.startTraining(acc, shoot("c0"), opts(T0));
  assert.equal(camp.sessionStatus(s, T0 + 23 * HOUR), "active");
  assert.throws(() => camp.claimTraining(acc, s.id, opts(T0 + 23 * HOUR)), /还没完成/);
  const weekLater = T0 + 7 * 24 * HOUR; // rewards never expire
  assert.equal(camp.sessionStatus(s, weekLater), "ready");
  const r = camp.claimTraining(acc, s.id, opts(weekLater));
  assert.equal(r.xp, rules.DURATIONS.fullDay.xp);
  assert.ok(r.gained >= 1, "100 XP at three=70 is at least one point");
  assert.throws(() => camp.claimTraining(acc, s.id, opts(weekLater)), /不存在/);
  assert.equal(camp.trainingState(acc).sessions.length, 0, "the slot is free again");
});

test("growth is a layer: the trained card reads higher, the catalog card is untouched", () => {
  const acc = account();
  const s = camp.startTraining(acc, shoot("c0", "elite"), opts(T0));
  const r = camp.claimTraining(acc, s.id, opts(T0 + 8 * 24 * HOUR));
  const trained = applyCardMods(POOL[0], acc.cardMods.c0);
  assert.equal(trained.three, 70 + r.bonus);
  assert.equal(POOL[0].three, 70, "historical base never mutated");
});

test("bounded: per-attribute cap, total budget and the 99 ceiling all stop the climb", () => {
  const huge = 1e9;
  assert.equal(rules.xpRequired(95) > rules.xpRequired(80), true, "higher ratings cost more");
  assert.equal(camp.applyXp({ base: 60, bonus: 0, xp: 0, earned: huge, perAttr: 5, totalLeft: 25 }).bonus, 5);
  assert.equal(camp.applyXp({ base: 60, bonus: 0, xp: 0, earned: huge, perAttr: 5, totalLeft: 2 }).gained, 2);
  assert.equal(camp.applyXp({ base: 97, bonus: 0, xp: 0, earned: huge, perAttr: 5, totalLeft: 25 }).bonus, 2);
  // a capped attribute can't even be booked
  const acc = account();
  acc.cardMods.c0 = { training: { attrs: { three: 5 } } };
  assert.throws(() => camp.startTraining(acc, shoot("c0"), opts(T0)), /上限/);
});

test("tiers map the existing rarity badge; common cards get the most room", () => {
  assert.equal(rules.tierFromBadge("legend"), "legend");
  assert.equal(rules.tierFromBadge("myth"), "legend");
  assert.equal(rules.tierFromBadge("super"), "superstar");
  assert.equal(rules.tierFromBadge("allstar"), "allstar");
  assert.equal(rules.tierFromBadge("star"), "good");
  assert.equal(rules.tierFromBadge(""), "common");
  assert.equal(camp.trainingTier(POOL[0]), "common");
  const b = rules.TIER_BUDGETS;
  assert.ok(b.common.total > b.good.total && b.good.total > b.allstar.total && b.allstar.total > b.superstar.total && b.superstar.total > b.legend.total);
});

test("cancel (D2): refund by progress, no XP, cannot cancel a finished session or refund twice", () => {
  const cases = [[0.02, 150], [0.2, 112], [0.4, 75], [0.6, 0]];
  for (const [progress, refund] of cases) {
    const acc = account(150);
    const s = camp.startTraining(acc, shoot("c0"), opts(T0));
    const r = camp.cancelTraining(acc, s.id, opts(T0 + progress * 24 * HOUR));
    assert.equal(r.refund, refund, `progress ${progress}`);
    assert.equal(acc.gold, refund);
    assert.equal(acc.cardMods.c0, undefined, "no partial XP");
    assert.throws(() => camp.cancelTraining(acc, s.id, opts(T0)), /不存在/);
  }
  const acc = account();
  const s = camp.startTraining(acc, shoot("c0"), opts(T0));
  assert.throws(() => camp.cancelTraining(acc, s.id, opts(T0 + 25 * HOUR)), /只能领取/);
});

test("reward is fixed at start: the same session claimed twice from two copies of the save gives the same result", () => {
  const acc = account();
  const s = camp.startTraining(acc, shoot("c0", "elite"), opts(T0));
  s.skillChance = 0.5;
  const a = structuredClone(acc);
  const b = structuredClone(acc);
  const ra = camp.claimTraining(a, s.id, opts(T0 + 8 * 24 * HOUR));
  const rb = camp.claimTraining(b, s.id, opts(T0 + 9 * 24 * HOUR));
  assert.deepEqual({ ...ra, claimedAt: 0 }, { ...rb, claimedAt: 0 });
});

test("breakthrough: only skills of the camp's families, only with a real base, capped per tier", () => {
  const shootingSkills = new Set(EPIPHANY_RULES.filter((r) => ["shooter", "scorer"].includes(r.id)).flatMap((r) => r.skills));
  const learned = [];
  for (let i = 0; i < 4; i++) {
    const acc = account();
    acc.cardMods.c0 = { training: { skills: learned.slice() }, skills: learned.slice() };
    const s = camp.startTraining(acc, shoot("c0", "elite"), opts(T0));
    s.skillChance = 1;
    const r = camp.claimTraining(acc, s.id, opts(T0 + 8 * 24 * HOUR));
    if (r.skillId) {
      assert.ok(shootingSkills.has(r.skillId), r.skillId);
      learned.push(r.skillId);
    }
  }
  assert.equal(learned.length, rules.TIER_BUDGETS.common.skills, "stops at the tier's skill cap");
  assert.equal(new Set(learned).size, learned.length, "never the same skill twice");

  const acc = account();
  const s = camp.startTraining(acc, shoot("weak", "elite"), opts(T0));
  s.skillChance = 1;
  assert.equal(camp.claimTraining(acc, s.id, opts(T0 + 8 * 24 * HOUR)).skillId, null, "three=40 can't break through as a shooter");
});

test("a card in training can't be recycled", () => {
  const acc = account();
  camp.startTraining(acc, shoot("c0"), opts(T0));
  assert.throws(() => recycleCards(acc, ["c0"], { confirmed: true, pool: POOL }), /训练中/);
});

test("UI helpers: default attribute is the strongest open one; the gain preview matches what a claim really adds", () => {
  const acc = account();
  assert.equal(camp.bestAttr(acc, "c0", "shooting", POOL), "three", "three 70 > mid 62 > scoring 65? no: 70 is highest");
  acc.cardMods.c0 = { training: { attrs: { three: 5 } } }; // three is capped -> next best open one
  assert.equal(camp.bestAttr(acc, "c0", "shooting", POOL), "scoring");
  const fresh = account();
  const predicted = camp.previewGain(fresh, "c1", "three", rules.DURATIONS.elite.xp, POOL);
  const s = camp.startTraining(fresh, shoot("c1", "elite"), opts(T0));
  assert.equal(camp.claimTraining(fresh, s.id, opts(T0 + 8 * 24 * HOUR)).gained, predicted);
});
