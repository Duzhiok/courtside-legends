/**
 * T2: 父子局 / 兄弟局 (js/modes/familyDuel.js).
 *
 * Two layers of tests, same split used by careerEconomy.test.js:
 *  - fast synthetic-data tests for the pure algorithm (uniqueness, balance, no cross-side overlap,
 *    best-card selection, buy/auto-fill/ready-to-start mechanics) -- no roster.json needed;
 *  - one integration pass against the REAL roster.json + the REAL FAMILY_GROUPS data, since the
 *    whole point of this mode is real, recognizable NBA families, not synthetic fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import {
  FAMILY_DUEL_GOLD,
  FAMILY_DUEL_MIN_TO_START,
  FAMILY_DUEL_ROSTER_SIZE,
  autoFillFamilySide,
  brotherPools,
  buyIntoFamilySide,
  familyDuelPool,
  familyDuelReadyToStart,
  familyDuelShop,
  fatherSonPools,
  freshFamilySide,
} from "../js/modes/familyDuel.js";

function card(bref, ovr, season = 2020) {
  return seasonToCard({
    bref,
    id: `${bref}-${season}-syn`,
    name: bref,
    season,
    team: "SYN",
    pos: "SF",
    gp: 70,
    mpg: 28,
    ppg: Math.max(2, ovr - 60),
    rpg: 5,
    apg: 4,
    spg: 1,
    bpg: 0.5,
    tpg: 2,
    fg: 0.46,
    tp: 0.35,
    ft: 0.8,
    fga: 12,
    tpa: 4,
    src: "test",
  });
}

test("fatherSonPools: every tracked father/son resolves, nobody plays both sides", () => {
  // curry/barry/thompson etc have real brefs; feed a tiny synthetic source covering just enough
  // of them to exercise resolution + best-card-by-OVR without needing the full roster.
  const source = [
    card("curryde01", 72),
    card("curryst01", 80, 2016),
    card("curryst01", 96, 2022), // higher OVR season should win
    card("curryse01", 74),
  ];
  const { fathers, sons } = fatherSonPools(source);
  assert.ok(fathers.some((p) => p.bref === "curryde01"));
  assert.ok(sons.some((p) => p.bref === "curryst01"));
  assert.ok(sons.some((p) => p.bref === "curryse01"));
  const steph = sons.find((p) => p.bref === "curryst01");
  assert.equal(steph.season, 2022, "picks the highest-OVR season, not just the first match");
  const overlap = fathers.filter((f) => sons.some((s) => s.bref === f.bref));
  assert.deepEqual(overlap, [], "a father must never also appear in the sons pool");
});

test("fatherSonPools: a bref with no matching card in the source is silently skipped, not a crash", () => {
  const { fathers, sons } = fatherSonPools([]);
  assert.deepEqual(fathers, []);
  assert.deepEqual(sons, []);
});

test("brotherPools: nobody ends up on both sides, even with a synthetic source covering real sibling brefs", () => {
  const source = [
    card("grantha01", 78),
    card("grantho01", 76),
    card("gasolma01", 82),
    card("gasolpa01", 88),
  ];
  const { sideA, sideB } = brotherPools(source);
  const overlap = sideA.filter((a) => sideB.some((b) => b.bref === a.bref));
  assert.deepEqual(overlap, []);
  // both Grant twins and both Gasol brothers should show up SOMEWHERE across the two sides
  for (const bref of ["grantha01", "grantho01", "gasolma01", "gasolpa01"]) {
    assert.ok(
      sideA.some((p) => p.bref === bref) || sideB.some((p) => p.bref === bref),
      `${bref} should land on one side or the other`,
    );
  }
});

test("familyDuelPool: routes to the right pool for each theme/side, empty for an unknown theme", () => {
  const source = [card("curryde01", 72), card("curryst01", 90)];
  assert.ok(familyDuelPool("fatherSon", "A", source).some((p) => p.bref === "curryde01"));
  assert.ok(familyDuelPool("fatherSon", "B", source).some((p) => p.bref === "curryst01"));
  assert.deepEqual(familyDuelPool("not-a-theme", "A", source), []);
});

test("freshFamilySide: starts empty with the standard gold budget", () => {
  const side = freshFamilySide("老爹军团");
  assert.equal(side.name, "老爹军团");
  assert.deepEqual(side.players, []);
  assert.equal(side.gold, FAMILY_DUEL_GOLD);
});

test("familyDuelShop: never includes already-owned ids or players outside this side's pool", () => {
  const pool = Array.from({ length: 20 }, (_, i) => card(`pool${i}`, 65 + i));
  const owned = new Set([pool[0].id, pool[1].id]);
  const shop = familyDuelShop(pool, owned, 400, 8);
  assert.ok(shop.length > 0);
  assert.ok(!shop.some((p) => owned.has(p.id)));
  assert.ok(shop.every((p) => pool.some((q) => q.id === p.id)));
});

// Regression: a real browser click on 父子局 crashed with "Cannot read properties of undefined
// (reading 'id')" inside familyDuelShop. Root cause: the cheap/mid/stretch picks work on {p, price}
// tuples and unwrap .p internally, but once those three buckets came up short, the size-topup
// fallback passed already-UNWRAPPED player objects into that same .p-unwrapping helper -- reading
// .p off a plain player object (no such field) produced `undefined` entries sitting right in the
// shop array, which then blew up the very next line (shop.filter(p => p.id)). A small pool with a
// requested size bigger than any single price band can supply forces that exact topup path.
test("familyDuelShop: a small pool that forces the size-topup fallback never produces undefined/NaN holes", () => {
  const pool = [card("only1", 70), card("only2", 71), card("only3", 72)];
  const shop = familyDuelShop(pool, new Set(), 400, 10); // asking for 10 out of a 3-person pool
  assert.ok(shop.length > 0 && shop.length <= 3, "can't invent players that don't exist in the pool");
  assert.ok(
    shop.every((p) => p && typeof p.id === "string"),
    "every shop entry must be a real player object, never undefined",
  );
  assert.ok(shop.every((p) => pool.some((q) => q.id === p.id)));
});

test("buyIntoFamilySide: deducts gold, adds the player, enforces the roster cap and pool membership", () => {
  const pool = [card("a", 80), card("b", 70)];
  const side = freshFamilySide("Test");
  const before = side.gold;
  const result = buyIntoFamilySide(side, pool[0], pool);
  assert.equal(result.ok, true);
  assert.equal(side.players.length, 1);
  assert.ok(side.gold < before, "gold must actually be spent");

  // can't buy the same person twice
  const dupe = buyIntoFamilySide(side, pool[0], pool);
  assert.equal(dupe.ok, false);

  // can't buy someone who isn't in this side's pool (e.g. a player from the OTHER side's pool)
  const outsider = card("intruder", 90);
  const blocked = buyIntoFamilySide(side, outsider, pool);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /候选池/);
});

test("buyIntoFamilySide: refuses a purchase the side can't afford", () => {
  const pool = [card("expensive", 99)];
  const side = freshFamilySide("Test");
  side.gold = 1; // nowhere near enough for a 99 OVR card
  const result = buyIntoFamilySide(side, pool[0], pool);
  assert.equal(result.ok, false);
  assert.match(result.reason, /金币/);
  assert.equal(side.players.length, 0);
});

test("buyIntoFamilySide: refuses once the roster is already at FAMILY_DUEL_ROSTER_SIZE", () => {
  const pool = Array.from({ length: FAMILY_DUEL_ROSTER_SIZE + 1 }, (_, i) => card(`p${i}`, 60));
  const side = freshFamilySide("Test");
  side.gold = 99999;
  for (let i = 0; i < FAMILY_DUEL_ROSTER_SIZE; i++) buyIntoFamilySide(side, pool[i], pool);
  assert.equal(side.players.length, FAMILY_DUEL_ROSTER_SIZE);
  const overflow = buyIntoFamilySide(side, pool[FAMILY_DUEL_ROSTER_SIZE], pool);
  assert.equal(overflow.ok, false);
  assert.match(overflow.reason, /已满/);
});

test("autoFillFamilySide: fills up to the cap without ever going over budget", () => {
  const pool = Array.from({ length: 15 }, (_, i) => card(`auto${i}`, 70 + i));
  const side = freshFamilySide("Test");
  side.gold = 500;
  autoFillFamilySide(side, pool);
  assert.ok(side.players.length > 0);
  assert.ok(side.players.length <= FAMILY_DUEL_ROSTER_SIZE);
  assert.ok(side.gold >= 0, "must never spend into negative gold");
  const ids = side.players.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate players from auto-fill");
});

test("autoFillFamilySide: zero gold left means zero additional purchases", () => {
  const pool = [card("costly", 90)];
  const side = freshFamilySide("Test");
  side.gold = 0;
  autoFillFamilySide(side, pool);
  assert.equal(side.players.length, 0);
});

test("familyDuelReadyToStart: both sides need at least FAMILY_DUEL_MIN_TO_START players", () => {
  const empty = freshFamilySide("A");
  const full = freshFamilySide("B");
  full.players = Array.from({ length: FAMILY_DUEL_MIN_TO_START }, (_, i) => card(`r${i}`, 70));
  assert.equal(familyDuelReadyToStart(empty, full), false);
  assert.equal(familyDuelReadyToStart(full, full), true);
  const oneShort = freshFamilySide("C");
  oneShort.players = Array.from({ length: FAMILY_DUEL_MIN_TO_START - 1 }, (_, i) => card(`s${i}`, 70));
  assert.equal(familyDuelReadyToStart(oneShort, full), false);
});

// ---- Integration pass against the REAL roster + the REAL FAMILY_GROUPS data ----
test("REAL DATA: father/son and brother pools resolve against the actual roster with no cross-side overlap", () => {
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  const cards = rows.map(seasonToCard);

  const { fathers, sons } = fatherSonPools(cards);
  assert.ok(fathers.length >= FAMILY_DUEL_MIN_TO_START, `only ${fathers.length} fathers resolved`);
  assert.ok(sons.length >= FAMILY_DUEL_MIN_TO_START, `only ${sons.length} sons resolved`);
  assert.deepEqual(
    fathers.filter((f) => sons.some((s) => s.bref === f.bref)),
    [],
  );

  const { sideA, sideB } = brotherPools(cards);
  assert.ok(sideA.length >= FAMILY_DUEL_MIN_TO_START, `only ${sideA.length} on brothers side A`);
  assert.ok(sideB.length >= FAMILY_DUEL_MIN_TO_START, `only ${sideB.length} on brothers side B`);
  assert.deepEqual(
    sideA.filter((a) => sideB.some((b) => b.bref === a.bref)),
    [],
  );
  // The split shouldn't be wildly lopsided -- a 10x imbalance would mean the global-counter
  // balancing (vs the old per-family i%2 reset, which produced a lopsided 43-vs-18 split) broke.
  const ratio = Math.max(sideA.length, sideB.length) / Math.min(sideA.length, sideB.length);
  assert.ok(ratio < 2, `brother sides are too lopsided: ${sideA.length} vs ${sideB.length}`);
});
