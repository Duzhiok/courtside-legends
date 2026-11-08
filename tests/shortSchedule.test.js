import test from "node:test";
import assert from "node:assert/strict";
import { generateShortSchedule, scaleGames, seasonGames } from "../js/engine/season.js";

const TEAMS = Array.from({ length: 32 }, (_, i) => `T${i}`);

test("20-game schedule: every team plays exactly 20 games vs 20 DIFFERENT opponents, once a day", () => {
  for (const seed of [1, 7, 42, 99, 2024]) {
    const days = generateShortSchedule(TEAMS, seed, 20);
    assert.equal(days.length, 20);
    const opp = Object.fromEntries(TEAMS.map((t) => [t, new Set()]));
    const home = Object.fromEntries(TEAMS.map((t) => [t, 0]));
    for (const day of days) {
      const today = new Set();
      for (const g of day) {
        assert.ok(!today.has(g.homeId) && !today.has(g.awayId), "a team plays at most once per day");
        today.add(g.homeId).add(g.awayId);
        opp[g.homeId].add(g.awayId);
        opp[g.awayId].add(g.homeId);
        home[g.homeId]++;
        assert.equal(g.played, false);
      }
      assert.equal(today.size, 32, "every team plays every day");
    }
    for (const t of TEAMS) {
      assert.equal(opp[t].size, 20, `${t} meets 20 different opponents`);
      assert.ok(home[t] >= 8 && home[t] <= 12, `${t} hosts ${home[t]} of 20`);
    }
  }
});

test("short schedule is deterministic per seed and differs across seeds", () => {
  const a = JSON.stringify(generateShortSchedule(TEAMS, 5, 20));
  assert.equal(a, JSON.stringify(generateShortSchedule(TEAMS, 5, 20)));
  assert.notEqual(a, JSON.stringify(generateShortSchedule(TEAMS, 6, 20)));
});

test("short schedule rejects what it cannot do (odd team count, too many games)", () => {
  assert.throws(() => generateShortSchedule(TEAMS.slice(0, 31), 1, 20), /even/);
  assert.throws(() => generateShortSchedule(TEAMS, 1, 32), /1\.\.31/);
});

test("season length helpers: identity at 82, scaled for a short year", () => {
  assert.equal(seasonGames({}), 82);
  assert.equal(seasonGames({ rsGames: 20 }), 20);
  for (const n of [20, 25, 40, 65]) assert.equal(scaleGames(n, {}), n);
  assert.deepEqual([20, 25, 40, 65].map((n) => scaleGames(n, { rsGames: 20 })), [5, 6, 10, 16]);
});
