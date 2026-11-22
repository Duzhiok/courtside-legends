// 3v3 player pool: tiered random deal, one season card per person, deterministic per seed.
import test from "node:test";
import assert from "node:assert/strict";
import { dealPlayerPool, PLAYER_POOL_SIZE, PLAYER_POOL_TIERS } from "../js/modes/playerPool.js";

const mk = (bref, ovr, season = 2000) => ({ id: `${bref}-${season}-xxx`, bref, name: bref, season, team: "XXX", pos: "SG", _ovr: ovr });
const ovrOf = (c) => c._ovr;

// 5 stars, 6 mids, 8 role players, plus a second season of one star (same person, other card).
const bigPool = [
  ...["s1", "s2", "s3", "s4", "s5"].map((b) => mk(b, 90)),
  ...["m1", "m2", "m3", "m4", "m5", "m6"].map((b) => mk(b, 80)),
  ...["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"].map((b) => mk(b, 70)),
  mk("s1", 88, 2001),
];

test("deal: 12 cards, tiered 3 stars / 4 mids / 5 role, one season per person", () => {
  const dealt = dealPlayerPool(bigPool, { seed: "t1", ovrOf });
  assert.equal(dealt.length, PLAYER_POOL_SIZE);
  assert.equal(new Set(dealt.map((c) => c.bref)).size, dealt.length, "no person twice in one pool");
  const tier = (c) => (c._ovr >= 85 ? "star" : c._ovr >= 75 ? "mid" : "role");
  const counts = dealt.reduce((acc, c) => ({ ...acc, [tier(c)]: (acc[tier(c)] || 0) + 1 }), {});
  assert.deepEqual(counts, { star: 3, mid: 4, role: 5 });
  assert.deepEqual(PLAYER_POOL_TIERS.map((t) => t.count), [3, 4, 5]);
});

test("deal: same seed deals the same pool, a different seed deals a different one", () => {
  const a = dealPlayerPool(bigPool, { seed: "same", ovrOf }).map((c) => c.id);
  const b = dealPlayerPool(bigPool, { seed: "same", ovrOf }).map((c) => c.id);
  assert.deepEqual(a, b);
  const c = dealPlayerPool(bigPool, { seed: "other", ovrOf }).map((x) => x.id);
  assert.notDeepEqual(a, c);
});

test("deal: excluded cards never deal; a tiny pool just deals everything it has", () => {
  const dealt = dealPlayerPool(bigPool, { seed: "t2", ovrOf, excludeIds: bigPool.slice(0, 5).map((c) => c.id) });
  assert.equal(dealt.some((c) => bigPool.slice(0, 5).some((x) => x.id === c.id)), false);
  assert.equal(dealt.length, PLAYER_POOL_SIZE);
  const tiny = dealPlayerPool(bigPool.slice(0, 4), { seed: "t3", ovrOf });
  assert.equal(tiny.length, 4);
  assert.equal(new Set(tiny.map((c) => c.bref)).size, 4);
});
