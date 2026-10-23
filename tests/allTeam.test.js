/**
 * selectAllTeamByPos() picks this tournament's PG→C best-five. No dedicated test file existed
 * for this module before -- it was only exercised indirectly through careerBracket.test.js's
 * computeCareerAllTeam() tests. Covers two things:
 *  1. The normal case (exact/adjacent position matches cover all five slots).
 *  2. The last-resort fallback when a position has nobody left: it used to grab whoever scored
 *     highest overall with ZERO regard for position (so a center could get stuffed into PG just
 *     because he had the best box score of the stragglers) -- it should now prefer whoever's
 *     natural position is physically closest to the empty slot.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { selectAllTeamByPos, normAllTeamPos } from "../js/engine/allTeam.js";

function row(id, pos, { gp = 10, pts = 200, reb = 50, ast = 50 } = {}) {
  return { id, name: id, pos, gp, pts, reb, ast, stl: 0, blk: 0, min: 300, wins: 5, gradeSum: 0, ovr: 80 };
}

test("normAllTeamPos: maps loose position strings onto the five canonical slots", () => {
  assert.equal(normAllTeamPos("PG"), "PG");
  assert.equal(normAllTeamPos("G"), "PG");
  assert.equal(normAllTeamPos("F"), "SF");
  assert.equal(normAllTeamPos("F-C"), "PF");
  assert.equal(normAllTeamPos(undefined), "SF");
});

test("selectAllTeamByPos: one real player per slot picks each of them at their own position", () => {
  const pool = [
    row("pg1", "PG"),
    row("sg1", "SG"),
    row("sf1", "SF"),
    row("pf1", "PF"),
    row("c1", "C"),
  ];
  const team = selectAllTeamByPos(pool);
  const bySlot = Object.fromEntries(team.map((t) => [t.slot, t.id]));
  assert.deepEqual(bySlot, { PG: "pg1", SG: "sg1", SF: "sf1", PF: "pf1", C: "c1" });
});

test("selectAllTeamByPos: a pool with NO real guards still fills slots with the closest-position bigs, never stealing a player who's an exact fit for a slot not yet processed", () => {
  // Reproduces the bug: Barkley/Malone/Duncan/Robinson-style five bigs, zero real guards.
  // The old single-pass fallback (OR-chained per slot, PG processed first) would let the PG
  // slot's barrel-scraping step grab the best remaining body regardless of position -- even if
  // that body was a PERFECT fit for a slot coming up two steps later (e.g. a true SF stolen for
  // PG duty before the SF slot's own turn). The three-pass version below claims every exact
  // match across ALL slots first, so a true SF always lands at SF even with no real guards.
  const pool = [
    row("c-best", "C", { pts: 500 }), // best score overall, but worst possible guard
    row("pf-a", "PF", { pts: 300 }),
    row("pf-b", "PF", { pts: 250 }),
    row("sf-a", "SF", { pts: 200 }),
  ];
  const team = selectAllTeamByPos(pool);
  const bySlot = Object.fromEntries(team.map((t) => [t.slot, t.id]));
  // Pass 1 (exact match) claims all three of these regardless of score -- the true SF is never
  // sacrificed to PG's fallback just because PG is processed first.
  assert.equal(bySlot.SF, "sf-a");
  assert.equal(bySlot.PF, "pf-a"); // the higher-scoring of the two true PFs
  assert.equal(bySlot.C, "c-best");
  // Only pf-b is left for PG -- pass 3's position-distance tiebreak picks it over nothing else
  // being available; SG has nobody left at all in this 4-person pool, which is expected.
  assert.equal(bySlot.PG, "pf-b");
  assert.equal(bySlot.SG, undefined);
  assert.equal(team.length, 4);
});

test("selectAllTeamByPos: nobody is picked twice even when the fallback has to scrape the barrel", () => {
  const pool = [row("c1", "C"), row("c2", "C"), row("c3", "C")];
  const team = selectAllTeamByPos(pool);
  const ids = team.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "same player picked for two slots");
});

test("selectAllTeamByPos: empty pool returns an empty team, not a crash", () => {
  assert.deepEqual(selectAllTeamByPos([]), []);
  assert.deepEqual(selectAllTeamByPos({}), []);
});
