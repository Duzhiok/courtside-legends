/**
 * Regression test for the "quad-tower" exploit: stacking 3-4 true centers/power forwards
 * (Duncan + Robinson + Towns + Gobert-style frontcourts) is good individual defensive talent,
 * but pickDefender() in sim.js weighs raw `defense` rating so heavily that these bigs still end
 * up switched onto perimeter shooters most of the game (see the audit below) -- and until this
 * fix, that specific mismatch barely mattered, because calcMakeProb()/calcOpenness() treated a
 * dominant post defender's `defense` rating as equally good at a 25-foot closeout as it is at
 * guarding the rim. A real jumbo frontcourt should leak three-point efficiency; it mostly didn't.
 *
 * Internals (perimeterDefenseRating, the big-mismatch bonus in calcMakeProb) aren't exported, so
 * like blockRate.test.js this drives full fast-forwarded games and checks realized outcomes
 * instead of asserting on formula constants. Bands are wide because this is a genuinely random
 * system -- the point is to catch "the mismatch bonus got deleted/neutered again", not to pin an
 * exact number.
 *
 * That one fix (opening up the perimeter-defense discount and the three-point ceiling for a
 * mismatched big) turned out to not be enough on its own: a shooting team could hit a better 3P%
 * against four centers and still lose by 40, because the same lineup's PAINT and MID-RANGE shots
 * were untouched -- a defense that is entirely non-shooting bigs should also clog the paint it's
 * standing in, which nothing modeled. paintCrowdPenalty() (sim.js) covers that half: it costs
 * every shot except a three a flat penalty per non-shooting big beyond the two a normal lineup
 * carries, applied on offense (who's shooting into a crowd) rather than on D (who's crowding it).
 * See tests/paintCrowding.test.js for the unit-level coverage of that function in isolation; the
 * scenario test below is the "does this actually fix the user's five-center blowout" check.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { GameSim } from "../js/engine/sim.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function cardFor(bref, season) {
  const row = ROWS.find((r) => r.bref === bref && r.season === season);
  if (!row) throw new Error(`no row for ${bref}:${season}`);
  return seasonToCard(row);
}

// Good-but-not-cap-saturating shooters at every spot (real 3P% 37-42%) so the shot-make ceiling
// has headroom left -- using a historically unrealistic volume shooter (peak Curry) would already
// sit at the engine's baseline 45% three-point cap and make any matchup bonus invisible by
// construction, which is exactly the trap the first few iterations of this fix fell into.
const SPACING_TEAM = [
  ["paulch01", 2015],
  ["greenda02", 2017],
  ["georgpa01", 2024],
  ["nowitdi01", 2010],
  ["lopezbr01", 2023],
].map(([b, s]) => cardFor(b, s));

// The exact lineup from the bug report: four true centers plus one guard, nobody else to switch
// onto a shooter.
const QUAD_TOWER = [
  ["duncati01", 2003],
  ["robinda01", 1995],
  ["townska01", 2019],
  ["goberru01", 2019],
  ["parketo01", 2013],
].map(([b, s]) => cardFor(b, s));

// The follow-up complaint: FIVE true centers, not four-plus-a-guard -- no perimeter defender on
// the floor at all. A composite roughly as strong individually as QUAD_TOWER (peak-ish seasons),
// stacked at the position that does the least against a team that never shoots from the paint.
const QUINT_TOWER = [
  ["abdulka01", 1981],
  ["olajuha01", 1990],
  ["robinda01", 1993],
  ["onealsh01", 1996],
  ["duncati01", 2002],
].map(([b, s]) => cardFor(b, s));

// Same four elite defenders' overall quality, but spread across the normal five positions
// instead of stacked at center -- isolates the POSITION/SCHEME effect from raw talent, since both
// rosters are otherwise comparably strong defensively.
const BALANCED_D = [
  ["duncati01", 2003], // C
  ["garneke01", 2004], // PF
  ["leonaka01", 2016], // SF, elite wing defender
  ["wadedw01", 2009], // SG, playmaking two-way wing
  ["paytoga01", 1996], // PG, lockdown point-of-attack
].map(([b, s]) => cardFor(b, s));

function simulateGames(home, away, games) {
  const shootersCoach = { id: "t-spacing", name: "T", specialTactics: ["five_out"], preferred: [], buffs: {} };
  const defCoach = { id: "t-def", name: "T", specialTactics: ["twin_towers"], preferred: [], buffs: {} };
  let tpa = 0;
  let tpm = 0;
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const sim = new GameSim({
      home: { players: home, starterIds: home.map((p) => p.id), coach: shootersCoach },
      away: { players: away, starterIds: away.map((p) => p.id), coach: defCoach },
      youSide: "home",
      injuries: false,
      speed: 3,
      onEvent: () => {},
      onTick: () => {},
      onEnd: () => {},
    });
    const snap = sim.runFast();
    if (snap.score.home > snap.score.away) wins++;
    for (const p of [...snap.home.onCourt, ...snap.home.bench]) {
      tpa += p.stats?.tpa || 0;
      tpm += p.stats?.tpm || 0;
    }
  }
  return { tpa, tpm, rate: tpm / tpa, wins, winRate: wins / games };
}

function playFullGames(home, away, homeTactic, awayTactic, games) {
  const homeCoach = { id: "t-h", name: "T", specialTactics: [homeTactic], preferred: [], buffs: {} };
  const awayCoach = { id: "t-a", name: "T", specialTactics: [awayTactic], preferred: [], buffs: {} };
  let wins = 0;
  let margin = 0;
  for (let i = 0; i < games; i++) {
    const sim = new GameSim({
      home: { players: structuredClone(home), starterIds: home.map((p) => p.id), coach: homeCoach },
      away: { players: structuredClone(away), starterIds: away.map((p) => p.id), coach: awayCoach },
      youSide: "home",
      injuries: false,
      speed: 3,
      onEvent: () => {},
      onTick: () => {},
      onEnd: () => {},
    });
    sim.setTactic(homeTactic, "home");
    sim.setTactic(awayTactic, "away");
    const snap = sim.runFast();
    wins += snap.score.home > snap.score.away ? 1 : 0;
    margin += snap.score.home - snap.score.away;
  }
  return { winRate: wins / games, avgMargin: margin / games };
}

test("five real centers playing their best defense cannot blow out a comparable shooting team by 30+", () => {
  // This is the user-reported scene itself: a five-out shooting team should not get run off the
  // floor 117-155 by a defense that is five true centers and nothing else. "Comparable" matters --
  // this isn't claiming a jumbo lineup can never lose badly, only that the loss has to come from
  // being out-talented, not from a spacing exploit the game never modeled.
  const { winRate, avgMargin } = playFullGames(SPACING_TEAM, QUINT_TOWER, "five_out", "twin_towers", 80);
  assert.ok(winRate > 0.35, `expected the shooting team to win more than 35% of the time, got ${(winRate * 100).toFixed(0)}% -- five centers are still steamrolling five-out`);
  assert.ok(avgMargin > -15, `expected an average margin no worse than -15, got ${avgMargin.toFixed(1)} -- still a blowout-level exploit`);
});

test("a real shooting lineup's 3P% against a stacked quad-center defense lands in a realistic exploited-mismatch band", () => {
  const { rate } = simulateGames(SPACING_TEAM, QUAD_TOWER, 60);
  // Team composite real-season 3P% here is ~37-42%; a genuinely exploitable jumbo mismatch should
  // push the realized rate clearly above that, without being absurd (not a 60%+ fantasy number).
  assert.ok(rate > 0.43, `expected 3P% > 43% against a stacked quad-center D, got ${(rate * 100).toFixed(1)}% -- the big-mismatch bonus looks neutered`);
  assert.ok(rate < 0.58, `expected 3P% < 58%, got ${(rate * 100).toFixed(1)}% -- the mismatch bonus looks way too strong now`);
});

test("the same shooting lineup does worse against a balanced defense than against a stacked quad-center one", () => {
  const stacked = simulateGames(SPACING_TEAM, QUAD_TOWER, 60);
  const balanced = simulateGames(SPACING_TEAM, BALANCED_D, 60);
  // Not guaranteed every single run (shared randomness), but over 60 games the gap should be
  // real: four true centers who are individually great post defenders should still leak more
  // three-point efficiency than the same overall defensive quality spread across real positions.
  assert.ok(
    stacked.rate > balanced.rate - 0.02,
    `expected stacked-centers 3P% allowed (${(stacked.rate * 100).toFixed(1)}%) to not trail a balanced defense (${(balanced.rate * 100).toFixed(1)}%) by more than noise -- jumbo lineups should leak perimeter shooting, not plug it`
  );
});
