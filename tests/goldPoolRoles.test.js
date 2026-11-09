/**
 * Gold-challenge pool roles (design 8da1494, §8 user decisions):
 * role line on pool cards, role-diverse filler packs, Custom Duel toggle,
 * recommendation marker. Prices are untouched here — v1 keeps prices and a
 * pricing experiment needs measurement first.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  clearPeakPoolCache,
  customPriceOf,
  dealRoleDiverse,
  drawZeroCostPack,
  getPeakPool,
  readDuelFillerMode,
  recommendRolePick,
  writeDuelFillerMode,
} from "../js/data/customPool.js";
import { ROLE_FAMILIES, poolRoleLine, roleFamilyOf } from "../js/data/skills.js";
import { drawPack } from "../js/engine/draft.js";
import { loadSampleRoster } from "./helpers/sampleRoster.js";

function rolePlayer(overrides = {}) {
  return {
    id: "role-test",
    bref: "zzzz_role",
    name: "Role Test",
    season: 2020,
    three: 75,
    threeTend: 50,
    defense: 76,
    rebound: 50,
    pass: 50,
    stamina: 70,
    scoring: 70,
    roleSkills: ["corner_camp"],
    ...overrides,
  };
}

test("roleFamilyOf: role skills map to families", () => {
  const cases = {
    corner_camp: "shooter",
    stopper_3d: "shooter",
    crash_board: "rebounder",
    sticky_wrap: "defender",
    charge_taker: "defender",
    rim_protector: "defender",
    second_unit_engine: "playmaker",
    motor_engine: "energy",
  };
  for (const [skill, family] of Object.entries(cases)) {
    assert.equal(roleFamilyOf({ roleSkills: [skill] }), family, skill);
  }
  // First role skill wins when a card carries two.
  assert.equal(roleFamilyOf({ roleSkills: ["crash_board", "corner_camp"] }), "rebounder");
});

test("roleFamilyOf: attribute fallback is the strongest attribute", () => {
  assert.equal(roleFamilyOf({ three: 90, rebound: 50, defense: 50, pass: 50, stamina: 50 }), "shooter");
  assert.equal(roleFamilyOf({ three: 40, rebound: 90, defense: 50, pass: 50, stamina: 50 }), "rebounder");
  assert.equal(roleFamilyOf({ three: 40, rebound: 50, defense: 90, pass: 50, stamina: 50 }), "defender");
  assert.equal(roleFamilyOf({ three: 40, rebound: 50, defense: 50, pass: 90, stamina: 50 }), "playmaker");
  assert.equal(roleFamilyOf({ three: 40, rebound: 50, defense: 50, pass: 50, stamina: 90 }), "energy");
});

test("poolRoleLine: role player shows skill labels + scenario fit line (zh/en)", () => {
  const p = rolePlayer({ roleSkills: ["corner_camp", "sticky_wrap"] });
  const zh = poolRoleLine(p, "zh");
  assert.equal(zh.label, "角色球员 · 底角射手 / 外线锁");
  assert.equal(zh.fit, "底角蹲坑拉开空间，等球就投");
  assert.equal(zh.family, "shooter");
  const en = poolRoleLine(p, "en");
  assert.equal(en.label, "Role player · Corner Shooter / Perimeter Lock");
  assert.equal(en.fit, "Camps in the corner to space the floor, shoots when the ball finds him");
  assert.equal(en.family, "shooter");
});

test("poolRoleLine: star without role skills falls back to archetype, else empty", () => {
  assert.equal(poolRoleLine({ archetype: "iso_creator" }, "zh").label, "持球核心");
  assert.equal(poolRoleLine({ archetype: "iso_creator" }, "en").label, "Ball-Dominant Creator");
  assert.equal(poolRoleLine({ archetype: "no_such_key" }, "zh").label, "");
  assert.equal(poolRoleLine({}, "zh").label, "");
});

test("dealRoleDiverse: one card per family first, no duplicates, exhaustion safe", () => {
  const mk = (id, familyAttrs) => ({ id, bref: id, ...familyAttrs });
  const cards = [
    mk("s1", { three: 90, rebound: 40, defense: 40, pass: 40, stamina: 40 }),
    mk("s2", { three: 85, rebound: 40, defense: 40, pass: 40, stamina: 40 }),
    mk("r1", { three: 40, rebound: 90, defense: 40, pass: 40, stamina: 40 }),
    mk("d1", { three: 40, rebound: 40, defense: 90, pass: 40, stamina: 40 }),
    mk("p1", { three: 40, rebound: 40, defense: 40, pass: 90, stamina: 40 }),
    mk("e1", { three: 40, rebound: 40, defense: 40, pass: 40, stamina: 90 }),
  ];
  const dealt = dealRoleDiverse(cards, 5);
  assert.equal(dealt.length, 5);
  assert.equal(new Set(dealt.map(roleFamilyOf)).size, 5);
  assert.equal(new Set(dealt.map((c) => c.id)).size, 5);
  // Asking for more than the pool holds returns the whole pool, no crash.
  assert.equal(dealRoleDiverse(cards, 99).length, 6);
  assert.equal(dealRoleDiverse([], 5).length, 0);
  // Same person (bref) is never dealt twice, even across families.
  const dupes = [
    mk("a-2020", { bref: "same_guy", three: 90, rebound: 40, defense: 40, pass: 40, stamina: 40 }),
    mk("a-2021", { bref: "same_guy", three: 40, rebound: 90, defense: 40, pass: 40, stamina: 40 }),
  ];
  const dealtDupes = dealRoleDiverse(dupes, 2, { keyOf: (c) => c.bref });
  assert.equal(dealtDupes.length, 1);
});

test("drawZeroCostPack balanced: 5 distinct families, all 0-price, no duplicates (real sample)", async () => {
  await loadSampleRoster();
  clearPeakPoolCache();
  for (let t = 0; t < 3; t++) {
    const pack = drawZeroCostPack(5, new Set());
    assert.equal(pack.length, 5);
    assert.ok(pack.every((c) => c.kind === "player" && customPriceOf(c.data) === 0));
    assert.equal(new Set(pack.map((c) => c.data.id)).size, 5);
    assert.equal(new Set(pack.map((c) => roleFamilyOf(c.data))).size, 5);
  }
});

test("drawZeroCostPack random: still uniform, all 0-price, no duplicates", async () => {
  await loadSampleRoster();
  clearPeakPoolCache();
  const pack = drawZeroCostPack(5, new Set(), { mode: "random" });
  assert.equal(pack.length, 5);
  assert.ok(pack.every((c) => c.kind === "player" && customPriceOf(c.data) === 0));
  assert.equal(new Set(pack.map((c) => c.data.id)).size, 5);
});

test("drawZeroCostPack exhaustion: nearly-excluded pool returns what remains, no crash", async () => {
  await loadSampleRoster();
  clearPeakPoolCache();
  const pool = getPeakPool().filter((p) => customPriceOf(p) === 0);
  assert.ok(pool.length > 2);
  const keep = new Set(pool.slice(0, 2).map((p) => p.id));
  const exclude = new Set(pool.filter((p) => !keep.has(p.id)).map((p) => p.id));
  const pack = drawZeroCostPack(5, exclude);
  assert.equal(pack.length, 2);
  assert.ok(pack.every((c) => keep.has(c.data.id)));
});

test("recommendRolePick: recommends the missing family, prefers a real role player", () => {
  const shooter = rolePlayer({ id: "sh", roleSkills: ["corner_camp"] });
  const plainShooter = rolePlayer({ id: "ps", roleSkills: [], three: 90 });
  const roster = [
    rolePlayer({ id: "r1", roleSkills: ["crash_board"], rebound: 90 }),
    rolePlayer({ id: "r2", roleSkills: ["sticky_wrap"], defense: 90 }),
    rolePlayer({ id: "r3", roleSkills: ["second_unit_engine"], pass: 90 }),
    rolePlayer({ id: "r4", roleSkills: ["motor_engine"], stamina: 90 }),
  ];
  // Roster covers rebounder/defender/playmaker/energy; only shooter is missing.
  const rec = recommendRolePick(
    [{ kind: "player", data: plainShooter }, { kind: "player", data: shooter }],
    roster,
    "zh"
  );
  assert.ok(rec, "expected a recommendation for the missing shooter family");
  assert.equal(rec.playerId, "sh", "prefers the card with a real role skill");
  assert.equal(rec.family, "shooter");
  assert.match(rec.reason, /射手/);
  assert.match(rec.reason, /（\d+ OVR）/);
  const en = recommendRolePick([{ kind: "player", data: shooter }], roster, "en");
  assert.match(en.reason, /Shooter/);
  assert.match(en.reason, /\(\d+ OVR\)/);
  // Full coverage: nothing to recommend.
  const full = [...roster, rolePlayer({ id: "r5", roleSkills: ["corner_camp"] })];
  assert.equal(recommendRolePick([{ kind: "player", data: shooter }], full, "zh"), null);
  assert.equal(recommendRolePick([], roster, "zh"), null);
});

test("recommendRolePick reason: names the surplus family, the missing families, and the pick's OVR (zh/en)", () => {
  const defender = rolePlayer({ id: "df", name: "Defender Dan", roleSkills: ["sticky_wrap"] });
  const shooter1 = rolePlayer({ id: "s1", roleSkills: ["corner_camp"] });
  const shooter2 = rolePlayer({ id: "s2", roleSkills: ["corner_camp"] });
  // Roster is heavy on shooters (2) and also lacks rebounder/defender/playmaker/energy.
  const roster = [shooter1, shooter2];
  const rec = recommendRolePick([{ kind: "player", data: defender }], roster, "zh");
  assert.ok(rec, "expected a recommendation");
  assert.equal(rec.family, "defender");
  // The pick's family is named first among the missing ones, at most two named.
  assert.match(rec.reason, /已有 2 名射手，缺防守、篮板等/);
  assert.match(rec.reason, /Defender Dan（\d+ OVR）能补上/);
  const en = recommendRolePick([{ kind: "player", data: defender }], roster, "en");
  assert.match(en.reason, /Heavy on Shooter \(2\), needs Defender and Rebounder…/);
  assert.match(en.reason, /Defender Dan \(\d+ OVR\) fills it/);
  // Empty roster: the reason just says which family to start with.
  const fresh = recommendRolePick([{ kind: "player", data: defender }], [], "zh");
  assert.match(fresh.reason, /先拿防守打底——Defender Dan（\d+ OVR）/);
  const freshEn = recommendRolePick([{ kind: "player", data: defender }], [], "en");
  assert.match(freshEn.reason, /Start with a Defender — Defender Dan \(\d+ OVR\)/);
});

test("drawPack roleDiverse: 5 players, 5 distinct families, no duplicate people (real sample)", async () => {
  await loadSampleRoster();
  const pack = drawPack(5, { roleDiverse: true });
  const players = pack.filter((c) => c.kind === "player").map((c) => c.data);
  assert.equal(players.length, 5);
  assert.equal(new Set(players.map((p) => p.id)).size, 5);
  assert.equal(new Set(players.map((p) => p.bref)).size, 5);
  assert.equal(new Set(players.map(roleFamilyOf)).size, 5);
});

test("drawPack default is unchanged: plain random deal still works", async () => {
  await loadSampleRoster();
  const pack = drawPack(5, {});
  assert.equal(pack.length, 5);
  assert.ok(pack.every((c) => c.kind === "player" || c.kind === "coach" || c.kind === "assistant"));
});

test("duel filler mode storage: balanced by default, persists, tolerates bad storage", () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
  };
  assert.equal(readDuelFillerMode(storage), "balanced");
  assert.equal(readDuelFillerMode(undefined), "balanced");
  assert.equal(readDuelFillerMode(null), "balanced");
  writeDuelFillerMode(storage, "random");
  assert.equal(readDuelFillerMode(storage), "random");
  writeDuelFillerMode(storage, "balanced");
  assert.equal(readDuelFillerMode(storage), "balanced");
  writeDuelFillerMode(storage, "bogus");
  assert.equal(readDuelFillerMode(storage), "balanced");
  const throwing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  assert.equal(readDuelFillerMode(throwing), "balanced");
  assert.doesNotThrow(() => writeDuelFillerMode(throwing, "random"));
});
