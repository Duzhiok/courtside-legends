import test from "node:test";
import assert from "node:assert/strict";
import { generateSchedule, generateBaseSchedule, seasonGames } from "../js/engine/season.js";
import { completeSchedule } from "../js/engine/scheduleRepair.js";
import { REBORN_TEAM_IDS, createRebornState } from "../js/reborn/identity.js";
import { leagueLayout } from "../js/reborn/franchises.js";
import { buildSeason } from "../js/reborn/season.js";
import { hashSeed } from "../js/core/seededRandom.js";
import { readFileSync } from "node:fs";

const RS = seasonGames({});
/** Arguments for generateSchedule exactly as buildSeason passes them: the league of that season. */
const reborn = (seed) => {
  const league = leagueLayout(Number(seed.split("|")[1]));
  return [league.teamIds, hashSeed(seed), { eastIds: league.eastIds, westIds: league.westIds, confById: league.confById }];
};
const teamsOf = (seed) => leagueLayout(Number(seed.split("|")[1])).teamIds;

/** Games per team + every structural problem of a schedule. */
function audit(days, teamIds) {
  const games = Object.fromEntries(teamIds.map((id) => [id, 0]));
  const problems = [];
  days.forEach((night, d) => {
    const seen = new Set();
    for (const g of night) {
      if (g.homeId === g.awayId) problems.push(`night ${d + 1}: ${g.homeId} plays itself`);
      for (const id of [g.homeId, g.awayId]) {
        if (!(id in games)) { problems.push(`unknown team ${id}`); continue; }
        if (seen.has(id)) problems.push(`night ${d + 1}: ${id} plays twice`);
        seen.add(id);
        games[id] += 1;
      }
    }
  });
  return { games, problems };
}

test("Reborn schedules: every team plays exactly 82, never twice a night, never itself (60 seeds x the years the league changed)", () => {
  for (let s = 0; s < 12; s += 1) for (const year of [1997, 1998, 2002, 2004, 2005]) {
    const days = generateSchedule(...reborn(`integrity-${s}|${year}`));
    const teams = teamsOf(`integrity-${s}|${year}`);
    assert.equal(teams.length, year >= 2005 ? 30 : 29);
    const { games, problems } = audit(days, teams);
    assert.deepEqual(problems, [], `s${s}/${year}`);
    for (const [id, n] of Object.entries(games)) assert.equal(n, RS, `s${s}/${year} ${id} has ${n} games`);
    assert.equal(days.flat().length, (teams.length * RS) / 2, "each game is listed once, so both teams see the same game");
    const hosted = Object.fromEntries(teams.map((id) => [id, 0]));
    for (const g of days.flat()) hosted[g.homeId] += 1;
    for (const [id, n] of Object.entries(hosted)) assert.ok(n >= 38 && n <= 44, `s${s}/${year} ${id} hosts ${n} of ${RS} (the base generator gives 39-43; completing must not make it worse)`);
  }
});

test("default league (My Team / GM): every team plays exactly 82 too", () => {
  const ids = [...new Set(generateSchedule(undefined, 1).flat().flatMap((g) => [g.homeId, g.awayId]))];
  for (let s = 0; s < 80; s += 1) {
    const { games, problems } = audit(generateSchedule(undefined, 5000 + s), ids);
    assert.deepEqual(problems, [], `seed ${s}`);
    for (const [id, n] of Object.entries(games)) assert.equal(n, RS, `seed ${s} ${id} has ${n}`);
  }
});

test("the base generator really does leave teams short (this is what completion fixes); a complete one is returned untouched, a short one only gains games at the end", () => {
  let shortSeen = 0, completeSeen = 0;
  for (let s = 0; s < 40; s += 1) {
    const base = generateBaseSchedule(...reborn(`integrity-${s}|1997`));
    const fixed = generateSchedule(...reborn(`integrity-${s}|1997`));
    const baseGames = audit(base, REBORN_TEAM_IDS).games;
    const isShort = Object.values(baseGames).some((n) => n < RS);
    if (!isShort) {
      completeSeen += 1;
      assert.deepEqual(fixed, base, `seed ${s}: a complete schedule must be unchanged`);
      continue;
    }
    shortSeen += 1;
    // every night of the base survives in order; the only thing that may disappear is the (at most a couple of) game(s) taken back by a rewire
    const baseCount = base.flat().length;
    let removed = 0;
    base.forEach((night, n) => {
      const kept = fixed[n].map((g) => `${g.homeId}-${g.awayId}`);
      const original = night.map((g) => `${g.homeId}-${g.awayId}`);
      let at = 0;
      for (const key of kept) { at = original.indexOf(key, at); assert.ok(at >= 0, `seed ${s} night ${n + 1}: ${key} moved or appeared`); at += 1; }
      removed += original.length - kept.length;
    });
    assert.ok(removed <= 2, `seed ${s}: ${removed} base games were taken back`);
    assert.equal(fixed.flat().length, (REBORN_TEAM_IDS.length * RS) / 2);
    assert.ok(fixed.length > base.length - 1, "the new games are in nights at the end");
    assert.ok(fixed.flat().length >= baseCount - removed);
  }
  assert.ok(shortSeen > 0 && completeSeen > 0, `the sample covers both cases (short ${shortSeen}, complete ${completeSeen})`);
});

test("completeSchedule: two short teams play each other; one lone short team gets its games by taking back the latest unrelated game; input is not mutated", () => {
  const ids = ["A", "B", "C", "D"];
  const g = (homeId, awayId) => ({ homeId, awayId, played: false, result: null });
  // target 3: A-B, C-D, A-C, B-D complete A,B,C,D at 2 each -> all need one more
  const twoShort = [[g("A", "B"), g("C", "D")], [g("A", "C"), g("B", "D")]];
  const snapshot = JSON.stringify(twoShort);
  const out = completeSchedule(twoShort, ids, 3);
  assert.equal(JSON.stringify(twoShort), snapshot, "input untouched");
  const { games, problems } = audit(out, ids);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.values(games), [3, 3, 3, 3]);
  // lone short team: A has 1, everyone else 2 -> A needs 1 more? use target 3 with A at 1: parity needs an even gap, so A at 1 vs target 3 (gap 2)
  const lone = [[g("A", "B"), g("C", "D")], [g("B", "C")], [g("B", "D")], [g("C", "D")]];
  const loneAudit = audit(lone, ids).games;
  assert.deepEqual(loneAudit, { A: 1, B: 3, C: 3, D: 3 });
  const fixed = completeSchedule(lone, ids, 3);
  const after = audit(fixed, ids);
  assert.deepEqual(after.problems, []);
  assert.deepEqual(after.games, { A: 3, B: 3, C: 3, D: 3 });
  assert.equal(fixed.flat().filter((x) => x.homeId === "C" && x.awayId === "D").length, 1, "the LATEST unrelated game (C-D in night 4) was taken back");
  assert.deepEqual(completeSchedule(fixed, ids, 3), fixed, "a complete schedule is returned as it is");
});

test("Player Reborn: every one of the 29 teams gets an 82-game season, one game a day, on a seed whose base schedule left teams short", () => {
  // the first seed (deterministic search) whose base schedule left some team short
  const seed = Array.from({ length: 60 }, (_, s) => `integrity-${s}`).find((sd) => Object.values(audit(generateBaseSchedule(...reborn(`${sd}|1997`)), REBORN_TEAM_IDS).games).some((n) => n < RS));
  assert.ok(seed, "the sample contains a seed that exercises the bug");
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  for (const id of REBORN_TEAM_IDS) {
    const r = createRebornState(seed, rows);
    r.player.teamId = id;
    r.player.seasonYear = 1997;
    const season = buildSeason(r, rows);
    assert.equal(season.games.length, RS, `${id} has ${season.games.length} games`);
    assert.equal(new Set(season.games.map((x) => x.day)).size, RS, `${id} plays one game a day`);
  }
});
