// All-Defense / All-NBA teams: one player per position, not "the ten highest scores" (which was ~8 centres).
import test from "node:test";
import assert from "node:assert/strict";
import { positionalTeams } from "../js/engine/season.js";
import { normalizePos } from "../js/data/positions.js";

const entry = (id, pos, rank) => ({ row: { playerId: id, name: id, teamId: "T", pos, stats: { gp: 20, pts: 100, reb: 100, ast: 50, stl: 20, blk: 20 } }, rank });
// Best-ranked first, and the leaderboard is all big men with the guards far down: exactly the DPOY-score shape.
const bigManPool = () => [
  ...["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((id, i) => entry(id, "C", i)),
  entry("pf1", "PF", 8), entry("pf2", "PF", 9),
  entry("sf1", "SF", 10), entry("sf2", "SF", 11),
  entry("sg1", "SG", 12), entry("sg2", "SG", 13),
  entry("pg1", "PG", 14), entry("pg2", "PG", 15),
];
const slots = (team) => team.map((p) => normalizePos(p.pos));

test("two all-defense teams each get one PG, SG, SF, PF and C even when the ranking is all centres", () => {
  const [first, second] = positionalTeams(bigManPool(), 2);
  assert.deepEqual(slots(first), ["PG", "SG", "SF", "PF", "C"]);
  assert.deepEqual(slots(second), ["PG", "SG", "SF", "PF", "C"]);
});

test("within a position the best-ranked player goes to the first team", () => {
  const [first, second] = positionalTeams(bigManPool(), 2);
  assert.equal(first.at(-1).playerId, "c1");
  assert.equal(second.at(-1).playerId, "c2");
  assert.equal(first[0].playerId, "pg1");
  assert.equal(second[0].playerId, "pg2");
});

test("nobody is picked twice across teams", () => {
  const all = positionalTeams(bigManPool(), 3).flat().map((p) => p.playerId);
  assert.equal(new Set(all).size, all.length);
});

test("roster-style positions ('G', 'F-C', 'pg') still land in a slot instead of failing an exact match", () => {
  const pool = [entry("a", "G", 0), entry("b", "F-C", 1), entry("c", "pg", 2), entry("d", "SG", 3), entry("e", "SF", 4), entry("f", "PF", 5), entry("g", "C", 6)];
  const [team] = positionalTeams(pool, 1);
  assert.equal(team.length, 5);
  assert.deepEqual(slots(team).sort(), ["C", "PF", "PG", "SF", "SG"]);
});

test("a thin pool still fills the team: a position nobody plays falls back to the best remaining player", () => {
  const pool = [entry("c1", "C", 0), entry("c2", "C", 1), entry("c3", "C", 2), entry("c4", "C", 3), entry("c5", "C", 4)];
  const [team] = positionalTeams(pool, 1);
  assert.deepEqual(team.map((p) => p.playerId), ["c1", "c2", "c3", "c4", "c5"]);
});

test("an empty pool gives empty teams and does not throw", () => {
  assert.deepEqual(positionalTeams([], 2), [[], []]);
});
