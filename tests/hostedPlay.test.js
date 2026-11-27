import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { seasonToCard, overall } = await import("../js/data/players.js");
const play = await import("../js/data/hostedPlay.js");
const hosted = await import("../js/data/hostedLeague.js");

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
// A small but real pool: every team of five seasons.
const POOL = ROWS.filter((r) => [1996, 2001, 2008, 2014, 2022].includes(r.season) && r.gp >= 20).map(seasonToCard);
const teamIds = (code, season) => POOL.filter((c) => c.team === code && c.season === season).sort((a, b) => overall(b) - overall(a)).slice(0, 10).map((c) => c.id);
const account = (ids) => ({ id: "acc-play", playerIds: ids, cardMods: {}, gold: 0 });
const STRONG = account(teamIds("LAL", 2001));

test("opponents are real team-seasons from the pool, built once and in a stable order", () => {
  const a = play.hostedOpponents(POOL);
  assert.ok(a.length > 80, `a few seasons of real clubs (${a.length})`);
  assert.equal(play.hostedOpponents(POOL), a, "cached per pool");
  assert.ok(a.every((t) => t.players.length >= 7 && t.starterIds.length === 5));
  assert.deepEqual(a.map((t) => t.name), [...a.map((t) => t.name)].sort(), "stable order");
});

test("an in-place content swap at the same length rebuilds the opponents instead of serving the stale cache (B47 note b)", () => {
  const freshPool = POOL.filter((c) => c.season === 1996);
  const len = freshPool.length;
  const before = play.hostedOpponents(freshPool);
  assert.ok(before.some((t) => t.name === "CHI|1996"));
  assert.ok(!before.some((t) => t.name === "LAL|2001"));
  // Swap every 1996 Bulls card for a 2001 Lakers card, in place, without changing the pool's length.
  const lal2001 = ROWS.filter((r) => r.season === 2001 && r.team === "LAL" && r.gp >= 20).map(seasonToCard);
  let i = 0;
  for (let k = 0; k < freshPool.length; k++) {
    if (freshPool[k].team === "CHI" && freshPool[k].season === 1996) freshPool[k] = lal2001[i++ % lal2001.length];
  }
  assert.equal(freshPool.length, len, "same length, different contents");
  const after = play.hostedOpponents(freshPool);
  assert.notEqual(after, before, "same length must not mean the same cached teams");
  assert.ok(!after.some((t) => t.name === "CHI|1996"), "the swapped-out club is gone");
  assert.ok(after.some((t) => t.name === "LAL|2001"), "the swapped-in club is there");
  assert.ok(before.some((t) => t.name === "CHI|1996"), "the old list is untouched");
  assert.equal(play.hostedOpponents(freshPool), after, "the rebuilt list is cached again");
  freshPool.pop();
  assert.notEqual(play.hostedOpponents(freshPool), after, "a shorter pool rebuilds too");
});

test("an in-place reorder rebuilds too, with identical values (teams sort by name, players by overall)", () => {
  const freshPool = POOL.filter((c) => c.season === 2001);
  const before = play.hostedOpponents(freshPool);
  const beforeNames = before.map((t) => t.name);
  const beforePlayers = before.map((t) => t.players.map((p) => p.id));
  [freshPool[0], freshPool[1]] = [freshPool[1], freshPool[0]];
  const after = play.hostedOpponents(freshPool);
  assert.notEqual(after, before, "a reordered pool must not reuse the cached list");
  assert.deepEqual(after.map((t) => t.name), beforeNames, "same teams");
  assert.deepEqual(after.map((t) => t.players.map((p) => p.id)), beforePlayers, "same players in the same order");
});

test("the squad is the account's own best people, position-balanced; fewer than 5 distinct people cannot play", () => {
  const squad = play.hostedSquad(STRONG, POOL);
  assert.equal(squad.players.length, 10);
  assert.equal(squad.starterIds.length, 5);
  const brefs = squad.players.map((p) => p.bref);
  assert.equal(new Set(brefs).size, brefs.length);
  assert.equal(play.hostedSquad(account(teamIds("LAL", 2001).slice(0, 4)), POOL), null);
  assert.equal(play.hostedReady(account([]), POOL), false);
  assert.equal(play.hostedReady(STRONG, POOL), true);
  assert.throws(() => play.createHostedPlayGame(account([]), { pool: POOL }));
});

test("same seed, same game: score and opponent repeat exactly, other seeds differ", () => {
  const game = play.createHostedPlayGame(STRONG, { pool: POOL });
  const a = game({ seed: 12345 });
  assert.deepEqual(game({ seed: 12345 }), a);
  assert.deepEqual(play.createHostedPlayGame(STRONG, { pool: POOL })({ seed: 12345 }), a, "a fresh adapter agrees (reload-safe)");
  const results = new Set(Array.from({ length: 6 }, (_, i) => JSON.stringify(game({ seed: 777 + i }))));
  assert.ok(results.size >= 5, "different seeds are different games");
  const opponents = new Set(Array.from({ length: 10 }, (_, i) => game({ seed: 4000 + i * 977 }).opponent));
  assert.ok(opponents.size >= 6, `the opponent follows the seed (${opponents.size} different clubs in 10 games)`);
  assert.ok(a.score.me > 40 && a.score.opponent > 40 && a.score.me !== a.score.opponent);
});

test("a strong squad wins most of its hosted games, a weak one does not", () => {
  const wins = (acc, n = 40) => { const g = play.createHostedPlayGame(acc, { pool: POOL }); let w = 0; for (let i = 0; i < n; i++) w += g({ seed: 31 + i * 7919 }).won ? 1 : 0; return w / n; };
  const strong = account(teamIds("LAL", 2001).concat(teamIds("CHI", 1996)).slice(0, 10)); // two title teams' best
  const seen = new Set();
  const weak = account([...POOL].sort((a, b) => overall(a) - overall(b)).filter((c) => !seen.has(c.bref) && seen.add(c.bref)).slice(0, 10).map((c) => c.id));
  assert.ok(wins(strong) > wins(weak) + 0.2, "strength shows up in results");
});

test("end to end through settleHosted: one real day = 20 real games, settled once, paid by the taper", () => {
  const acc = account(STRONG.playerIds);
  const T0 = Date.UTC(2026, 10, 23, 12, 0);
  hosted.setHostedPlan(acc, { playerId: STRONG.playerIds[0], attr: "three" }, { now: T0, save: () => {} });
  const game = play.createHostedPlayGame(acc, { pool: POOL });
  const first = hosted.settleHosted(acc, { now: T0 + 2 * 86400000, playGame: game, pool: POOL, save: () => {} });
  assert.equal(first.days.length, 1);
  assert.equal(first.days[0].games, 20);
  assert.ok(first.days[0].wins > 5, `a 2001 Lakers core wins plenty (${first.days[0].wins}/20)`);
  assert.ok(acc.gold > 0 && acc.gold <= 5 * 20 + 5 * 10);
  const again = hosted.settleHosted(acc, { now: T0 + 2 * 86400000, playGame: game, pool: POOL, save: () => {} });
  assert.equal(again.days.length, 0);
});

test("an opponent's starters are worked out on first use, not for every team up front (eager, it froze the Training Center ~4 s on every cold open)", async () => {
  const { bestStarters } = await import("../js/engine/lineupSlots.js");
  const { performance } = await import("node:perf_hooks");
  // A fresh pool object, never handed to hostedOpponents before: the module caches per pool identity, so the
  // earlier tests (which read every starter of POOL) cannot have warmed these teams' closures. Without this,
  // this test could only prove "it is a getter", not "nothing was computed before first use" (B152 note b).
  const freshPool = POOL.filter((c) => c.season === 1996);
  const teams = play.hostedOpponents(freshPool);
  assert.ok(teams.length > 1, `a real slice of clubs (${teams.length})`);
  assert.equal(typeof Object.getOwnPropertyDescriptor(teams[0], "starterIds").get, "function", "a lazy getter, not a precomputed array");
  // The cold-open Training Center path only asks whether opponents exist; it must not trigger the computation.
  const chiIds = POOL.filter((c) => c.team === "CHI" && c.season === 1996).sort((a, b) => overall(b) - overall(a)).slice(0, 10).map((c) => c.id);
  assert.equal(play.hostedReady(account(chiIds), freshPool), true);
  const startedAt = performance.now();
  const first = teams[0].starterIds;
  const firstMs = performance.now() - startedAt;
  assert.ok(firstMs > 1, `first access really computes the five (${firstMs.toFixed(2)} ms)`);
  const reusedAt = performance.now();
  assert.equal(teams[0].starterIds, first, "computed once, then reused");
  const secondMs = performance.now() - reusedAt;
  assert.ok(secondMs < 1, `second access is just the cached array (${secondMs.toFixed(3)} ms)`);
  assert.deepEqual(first, bestStarters(teams[0].players, overall).map((p) => p.id), "the same five a precomputed list would have held");
});
