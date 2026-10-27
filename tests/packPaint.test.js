/**
 * Regression tests for the "pack the paint" balance fix (user complaint 2026-10-26:
 * five centers beat a five-out team 150-110, and packing the paint did nothing):
 *
 * 1. A new "pack_paint" tactic: defending with it cuts paint make probability by
 *    0.07 and boosts paint blocks, but concedes +0.08 openness on kick-out
 *    non-paint shots — free against teams with no shooting, punished by spacing.
 * 2. Paint finishes cost 1.25x finisher fatigue regardless of orders (before,
 *    the iso/post surcharge only applied when the player had iso/post orders set;
 *    under auto orders a post-up cost the same as a jumper).
 * 3. Rim-protection depth: each additional big (C/PF) on the floor cuts paint
 *    make probability by 0.01, capped at 0.03.
 *
 * Internals aren't exported, so like jumboLineupSpacing.test.js this drives full
 * fast-forwarded games and checks realized outcomes instead of formula constants.
 * Bands are wide because this is a genuinely random system.
 *
 * Honest limits of this file:
 * - The 0.01/step stacking effect is below full-game noise, so its game test is
 *   a smoke test only (branch runs, scores sane); its magnitude is by
 *   construction in sim.js, not proven here.
 * - The paint-finish fatigue tax has no game-level test: rotation (sit at 70,
 *   starters return only at 0) compresses end-of-game fatigue so hard that any
 *   game-level fatigue assertion would be noise. It is one isolated multiplier
 *   on the finisher's CREATE tax, verified by inspection.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { TACTICS, availableTactics } from "../js/data/coaches.js";
import { GameSim } from "../js/engine/sim.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function cardFor(bref, season) {
  const row = ROWS.find((r) => r.bref === bref && r.season === season);
  if (!row) throw new Error(`no row for ${bref}:${season}`);
  return seasonToCard(row);
}

// Paint-heavy offense: four true centers plus a guard.
const CENTERS = [
  ["duncati01", 2003],
  ["robinda01", 1995],
  ["townska01", 2019],
  ["goberru01", 2019],
  ["parketo01", 2013],
].map(([b, s]) => cardFor(b, s));

// Spacing offense: good-but-not-cap-saturating shooters at every spot.
const SPACING = [
  ["paulch01", 2015],
  ["greenda02", 2017],
  ["georgpa01", 2024],
  ["nowitdi01", 2010],
  ["lopezbr01", 2023],
].map(([b, s]) => cardFor(b, s));

// Same elite defenders spread across the normal five positions.
const BALANCED_D = [
  ["duncati01", 2003],
  ["garneke01", 2004],
  ["leonaka01", 2016],
  ["wadedw01", 2009],
  ["paytoga01", 1996],
].map(([b, s]) => cardFor(b, s));

function coachWith(tacticId) {
  return { id: `t-${tacticId}`, name: "T", specialTactics: [tacticId], preferred: [], buffs: {} };
}

function simulateGames(home, away, games, awayTacticId = "balanced") {
  let homePts = 0;
  let tpa = 0;
  let tpm = 0;
  for (let i = 0; i < games; i++) {
    const sim = new GameSim({
      home: { players: home, starterIds: home.map((p) => p.id), coach: coachWith("balanced") },
      away: { players: away, starterIds: away.map((p) => p.id), coach: coachWith(awayTacticId) },
      youSide: "home",
      injuries: false,
      speed: 3,
      onEvent: () => {},
      onTick: () => {},
      onEnd: () => {},
    });
    const snap = sim.runFast();
    homePts += snap.score.home;
    for (const p of [...snap.home.onCourt, ...snap.home.bench]) {
      tpa += p.stats?.tpa || 0;
      tpm += p.stats?.tpm || 0;
    }
  }
  return { pts: homePts / games, threeRate: tpm / tpa };
}

test("pack_paint is a real, selectable tactic (not just a formula flag)", () => {
  assert.equal(TACTICS.pack_paint?.packPaint, true);
  assert.ok(availableTactics({ specialTactics: ["balanced"] }).some((t) => t.id === "pack_paint"));
});

test("packing the paint suppresses a paint-heavy offense", () => {
  const balanced = simulateGames(CENTERS, BALANCED_D, 120, "balanced");
  const packed = simulateGames(CENTERS, BALANCED_D, 120, "pack_paint");
  // -0.07 paint make + boosted paint blocks on ~60 paint shots/game is worth
  // roughly 4-7 points (measured over repeated 120-game runs); the band only
  // demands 3 so ordinary game noise can't fake a pass.
  assert.ok(
    packed.pts < balanced.pts - 3,
    `expected paint-heavy offense to score >=3 fewer vs pack_paint (${packed.pts.toFixed(1)}) than vs balanced (${balanced.pts.toFixed(1)})`
  );
});

test("packing the paint does not plug a spacing team's three-point shooting", () => {
  const balanced = simulateGames(SPACING, BALANCED_D, 120, "balanced");
  const packed = simulateGames(SPACING, BALANCED_D, 120, "pack_paint");
  // Kick-out shooters get +0.08 openness when the ball moves, so a spacing team
  // should not shoot worse against a packed paint; the guard band mirrors the
  // jumbo test (tolerate noise, catch a real regression). Band history: at
  // 60 games/condition the measured gaps were -1.0% and -2.2% (pure noise —
  // the bonus only touches the kicked-out subset of threes), so this runs
  // 120 games and tolerates 3 points.
  assert.ok(
    packed.threeRate > balanced.threeRate - 0.03,
    `expected spacing 3P% vs pack_paint (${(packed.threeRate * 100).toFixed(1)}%) to not trail balanced (${(balanced.threeRate * 100).toFixed(1)}%) by more than noise`
  );
});

test("rim-protection depth branch runs for 5-big and 2-big defenses (smoke)", () => {
  // Identical-attribute clones, only position differs, so the stacking count
  // (5 bigs -> -0.03, 2 bigs -> -0.01) is the intended difference; the loose
  // band below is deliberate — see the file header for why this can't prove 0.01.
  const base = JSON.parse(JSON.stringify(cardFor("goberru01", 2019)));
  const clone = (id, pos) => ({ ...JSON.parse(JSON.stringify(base)), id, pos, playPos: pos });
  const fiveBig = [0, 1, 2, 3, 4].map((i) => clone(`gob-c${i}`, "C"));
  const twoBig = [clone("gob-c0", "C"), clone("gob-c1", "C"), clone("gob-s0", "SF"), clone("gob-s1", "SF"), clone("gob-s2", "SF")];
  const a = simulateGames(CENTERS, fiveBig, 60);
  const b = simulateGames(CENTERS, twoBig, 60);
  assert.ok(a.pts > 60 && a.pts < 170, `5-big defense game out of sane range: ${a.pts}`);
  assert.ok(b.pts > 60 && b.pts < 170, `2-big defense game out of sane range: ${b.pts}`);
});
