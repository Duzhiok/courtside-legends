// All-Defense / All-NBA teams: one player per position, not "the ten highest scores" (which was ~8 centres).
import test from "node:test";
import assert from "node:assert/strict";
import { positionalTeams } from "../js/engine/season.js";
import { normalizePos } from "../js/data/positions.js";

const entry = (id, pos, rank, bref) => ({ row: { playerId: id, bref, name: id, teamId: "T", pos, stats: { gp: 20, pts: 100, reb: 100, ast: 50, stl: 20, blk: 20 } }, rank });
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

test("one person once: two season cards of the same player (same bref) never share the teams", () => {
  const pool = [
    entry("gobert-2019", "C", 0, "goberru01"), entry("gobert-2022", "C", 1, "goberru01"), entry("c3", "C", 2, "c3x"),
    entry("pg1", "PG", 3, "pg1x"), entry("sg1", "SG", 4, "sg1x"), entry("sf1", "SF", 5, "sf1x"), entry("pf1", "PF", 6, "pf1x"),
    entry("pg2", "PG", 7, "pg2x"), entry("sg2", "SG", 8, "sg2x"), entry("sf2", "SF", 9, "sf2x"), entry("pf2", "PF", 10, "pf2x"),
  ];
  const [first, second] = positionalTeams(pool, 2);
  const people = [...first, ...second].map((p) => p.bref ?? p.playerId);
  const ids = [...first, ...second].map((p) => p.playerId);
  assert.equal(ids.filter((id) => id.startsWith("gobert")).length, 1, "Gobert once, not once per card");
  assert.equal(first.at(-1).playerId, "gobert-2019", "the better-ranked card is the one that stays");
  assert.equal(second.at(-1).playerId, "c3", "the second team's centre is somebody else");
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(people.length >= 10);
});

test("an empty pool gives empty teams and does not throw", () => {
  assert.deepEqual(positionalTeams([], 2), [[], []]);
});
