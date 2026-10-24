import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { rollGrade, rollOffsets } = await import("../js/data/cardRoll.js");
const {
  MAX_BOUGHT_SKILLS,
  MAX_CARDS,
  MIN_KEEP,
  boughtSkillCount,
  buyableSkills,
  buySkillWithFragments,
  cardRoom,
  codexProgress,
  junkIds,
  recycleCards,
  recycleValue,
} = await import("../js/data/accountRecycle.js");
const { performDailyDraw } = await import("../js/data/accountGacha.js");
const { resolvePlayers } = await import("../js/data/account.js");

/** First seed that rolls the wanted grade (deterministic scan). */
function seedFor(grade) {
  for (let seed = 1; seed < 100000; seed++) if (rollGrade(rollOffsets(seed).quality) === grade) return seed;
  throw new Error(`no seed for ${grade}`);
}
const SEEDS = { S: seedFor("S"), A: seedFor("A"), B: seedFor("B") };

function card(bref, season, ovr) {
  return {
    id: `${bref}-${season}`, bref, season, name: bref, team: "DEN", pos: "SF", age: 27, heightCm: 201,
    ovr2k: ovr, ratingSource: "anchor", skills: [], speed: 70, strength: 65, stamina: 70, block: 60,
    three: 60, mid: 62, paint: 62, pass: 65, iq: 65, rebound: 55, defense: 60, steal: 55, scoring: 65, clutch: 60,
    intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 },
  };
}

// 12 lineup cards (ovr 95..84), 4 low cards, and a redundant 2nd version of p01.
const POOL = [
  ...Array.from({ length: 12 }, (_, i) => card(`p${String(i + 1).padStart(2, "0")}`, 2000, 95 - i)),
  card("p13", 2000, 70), card("p14", 2000, 69), card("p15", 2000, 68), card("p16", 2000, 67),
  card("p01", 2001, 82),
];

function account(extra = {}) {
  const ids = POOL.map((p) => p.id);
  const cardMods = Object.fromEntries(ids.map((id) => [id, { merges: 0, skills: [], roll: SEEDS.B }]));
  return { id: "acc", playerIds: ids, cardMods, gold: 0, fragments: 0, ...extra };
}

test("value scales with band, 成色 and stars", () => {
  const plain = { ovr2k: 60, ratingSource: "anchor", hiddenRoll: { grade: "B" }, mergeLevel: 0 };
  const gem = { ...plain, hiddenRoll: { grade: "S" } };
  const starred = { ...plain, mergeLevel: 2 };
  const star = { ...plain, ovr2k: 94 };
  assert.deepEqual(recycleValue(plain), { gold: 15, fragments: 5 });
  assert.equal(recycleValue(gem).gold, 30);
  assert.equal(recycleValue(starred).gold, Math.round(15 * 1.5));
  assert.ok(recycleValue(star).fragments > recycleValue(plain).fragments * 20);
});

test("junk = low OVR or redundant version; never lineup, 本命, starred or S/A", () => {
  const acc = account({ favoriteId: "p14-2000" });
  acc.cardMods["p15-2000"].roll = SEEDS.S; // a plain-OVR gem
  acc.cardMods["p16-2000"].merges = 1;
  const junk = new Set(junkIds(acc, { pool: POOL }));
  assert.ok(junk.has("p13-2000"));
  assert.ok(junk.has("p01-2001"), "second version of a person never plays");
  assert.ok(!junk.has("p14-2000"), "本命 protected");
  assert.ok(!junk.has("p15-2000"), "high 成色 protected");
  assert.ok(!junk.has("p16-2000"), "starred protected");
  assert.ok(![...junk].some((id) => /^p(0[2-9]|1[0-2])-2000$/.test(id)), "lineup protected");
});

test("a 全明星+ card needs the extra confirmation even when it is not in the lineup", () => {
  const pool = [...POOL, card("p02", 2001, 92)];
  const acc = account();
  acc.playerIds.push("p02-2001");
  acc.cardMods["p02-2001"] = { merges: 0, skills: [], roll: SEEDS.B };
  assert.throws(
    () => recycleCards(acc, ["p02-2001"], { pool }),
    (error) => error.needsConfirm?.[0].why.includes("全明星以上")
  );
  assert.ok(acc.playerIds.includes("p02-2001"));
});

test("one-tap junk never includes a 全明星+ card, even as a redundant version", () => {
  const pool = [...POOL, card("p02", 2001, 92)];
  const acc = account();
  acc.playerIds.push("p02-2001");
  acc.cardMods["p02-2001"] = { merges: 0, skills: [], roll: SEEDS.B };
  assert.ok(!junkIds(acc, { pool }).includes("p02-2001"));
});

test("recycling pays gold + 技能碎片, removes mods, keeps the 图鉴", () => {
  const acc = account();
  const result = recycleCards(acc, ["p13-2000", "p14-2000"], { pool: POOL });
  assert.deepEqual(result, { count: 2, gold: 30, fragments: 10 });
  assert.equal(acc.playerIds.length, POOL.length - 2);
  assert.equal(acc.cardMods["p13-2000"], undefined);
  assert.equal(acc.gold, 30);
  assert.equal(acc.fragments, 10);
});

test("hard rules: 本命, unsettled 成色, and the 12-card floor", () => {
  const acc = account({ favoriteId: "p13-2000" });
  assert.throws(() => recycleCards(acc, ["p13-2000"], { pool: POOL }), /本命/);
  acc.pendingRoll = { playerId: "p14-2000", seed: 1 };
  assert.throws(() => recycleCards(acc, ["p14-2000"], { pool: POOL }), /成色没选/);
  acc.pendingRoll = null;
  acc.favoriteId = null;
  // 17 cards − 6 = 11 < MIN_KEEP (confirmed, so only the floor can stop it)
  const six = ["p13-2000", "p14-2000", "p15-2000", "p16-2000", "p01-2001", "p12-2000"];
  assert.throws(() => recycleCards(acc, six, { pool: POOL, confirmed: true }), new RegExp(`至少保留 ${MIN_KEEP}`));
  assert.equal(acc.playerIds.length, POOL.length);
});

test("lineup / high 成色 / starred cards need confirmation", () => {
  const acc = account();
  acc.cardMods["p15-2000"].roll = SEEDS.A;
  assert.throws(
    () => recycleCards(acc, ["p15-2000"], { pool: POOL }),
    (error) => error.needsConfirm?.[0].why.includes("成色 A")
  );
  assert.equal(acc.playerIds.includes("p15-2000"), true, "nothing removed before confirming");
  assert.equal(recycleCards(acc, ["p15-2000"], { pool: POOL, confirmed: true }).count, 1);
});

test("技能碎片 buy a legal skill, capped per card", () => {
  const acc = account({ fragments: 5000 });
  const [resolved] = resolvePlayers(["p01-2000"], acc, POOL);
  const options = buyableSkills(resolved);
  assert.ok(options.length > 2, "a normal card has skills to buy");
  buySkillWithFragments(acc, "p01-2000", options[0].id, POOL);
  buySkillWithFragments(acc, "p01-2000", options[1].id, POOL);
  assert.equal(boughtSkillCount(acc, "p01-2000"), MAX_BOUGHT_SKILLS);
  assert.equal(acc.fragments, 5000 - options[0].cost - options[1].cost);
  assert.throws(() => buySkillWithFragments(acc, "p01-2000", options[2].id, POOL), /最多买/);
  const [after] = resolvePlayers(["p01-2000"], acc, POOL);
  assert.ok(after.skills.includes(options[0].id));
});

test("not enough fragments → refuse, nothing spent", () => {
  const acc = account({ fragments: 1 });
  const [resolved] = resolvePlayers(["p01-2000"], acc, POOL);
  assert.throws(() => buySkillWithFragments(acc, "p01-2000", buyableSkills(resolved)[0].id, POOL), /碎片不足/);
  assert.equal(acc.fragments, 1);
});

test("a full binder blocks pulls before any gold is spent", () => {
  const ids = Array.from({ length: MAX_CARDS }, (_, i) => `x${i}-2000`);
  const acc = account({ playerIds: ids, gold: 500, lastDailyDraw: "2000-01-01" });
  assert.equal(cardRoom(acc), 0);
  assert.throws(() => performDailyDraw(acc, { pool: POOL, rng: () => 0.5 }), /卡库已满/);
  assert.equal(acc.gold, 500);
  assert.equal(acc.lastDailyDraw, "2000-01-01", "free pull not consumed");
});

test("图鉴 counts people ever owned, including recycled ones", () => {
  const acc = account({ codex: ["p13-2000"] });
  acc.playerIds = acc.playerIds.filter((id) => id !== "p13-2000");
  const progress = codexProgress(acc, POOL);
  assert.equal(progress.total, 16);
  assert.equal(progress.people, 16);
});
