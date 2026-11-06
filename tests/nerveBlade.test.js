/**
 * 神经刀 (nerve_blade, "Live Wire"): a boom-or-bust gunner. It reuses the engine's existing hand-feel
 * streak (`p.hot`, -3..3) instead of inventing a new one, and amplifies it two ways:
 *   - registerShotFeel: each make/miss moves `hot` by 2 instead of 1 (skillHotSwingMult)
 *   - calcMakeProb: the hot/cold make-probability nudge is 3x as strong (skillHotEffectMult)
 *
 * Why not assert on per-game FG%? With ~5 FGA a game, binomial noise drowns any streak effect —
 * that metric flipped sign between runs while tuning. So the real-engine test reads the live `hot`
 * value while the player is on the floor (runFast()'s own loop, stepped by hand) and checks the
 * signature directly: a wider streak distribution with a much fatter ice-cold tail, while average
 * shooting stays put (it's variance, not a buff or a nerf).
 *
 * Both arms run PAIRED: game g of each arm gets the same seed (seededStream, via GameSim's `rng`
 * option), so a pair of games differs only by the skill itself. Unpaired runs flaked in CI
 * (2026-11-06: cold-share ratio 1.2 vs the 1.6 bar; FG% gap 0.057 vs the 0.05 bar — both marginal
 * misses on independent random draws, while a docs-only commit on identical engine code passed).
 * Paired, the statistics are far cleaner: measured across seed bases 1/11/21/31/41, cold-share
 * ratio 2.82–3.81, FG% gap 0.000–0.001, spread ratio 1.22–1.28. Seed base 1 is the fixed choice.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { skillHotEffectMult, skillHotSwingMult } from "../js/data/skills.js";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const SUBJECT = "smithjr01-2013-nyk";

function teamOf(code, season) {
  return ROWS.filter((r) => r.team === code && r.season === season)
    .map(seasonToCard)
    .sort((a, b) => (b.ovr || 0) - (a.ovr || 0))
    .slice(0, 10);
}

const TEAM_WITH = teamOf("NYK", 2013);
const TEAM_WITHOUT = TEAM_WITH.map((p) =>
  p.id === SUBJECT ? { ...p, skills: p.skills.filter((s) => s !== "nerve_blade") } : p
);
const OPPONENT = { players: teamOf("DEN", 2023), name: "DEN" };

function newSim(players, seed) {
  return new GameSim({
    home: { players, name: "NYK" },
    away: OPPONENT,
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(seed),
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
}

/** Same loop as GameSim.runFast(), but samples the subject's live `hot` after every step he's on the floor. */
function onCourtHotSamples(players, games, seedBase) {
  const xs = [];
  for (let g = 0; g < games; g++) {
    const sim = newSim(players, seedBase + g);
    sim._quiet = true;
    sim.running = true;
    sim.paused = false;
    let guard = 0;
    while (sim.running && guard++ < 8000) {
      sim.step();
      const me = sim.home.onCourt.find((p) => p.id === SUBJECT);
      if (me) xs.push(me.hot || 0);
    }
  }
  return xs;
}

function spread(xs) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

function fgPct(players, games, seedBase) {
  let fgm = 0;
  let fga = 0;
  for (let g = 0; g < games; g++) {
    const snap = newSim(players, seedBase + g).runFast();
    const me = [...snap.home.onCourt, ...snap.home.bench].find((p) => p.id === SUBJECT);
    fgm += me.stats.fgm;
    fga += me.stats.fga;
  }
  return fgm / fga;
}

test("神经刀 amplifiers only fire for the skill holder", () => {
  const gunner = { skills: ["nerve_blade"] };
  const plain = { skills: ["rainmaker"] };
  assert.equal(skillHotSwingMult(gunner), 2);
  assert.equal(skillHotEffectMult(gunner), 3);
  assert.equal(skillHotSwingMult(plain), 1);
  assert.equal(skillHotEffectMult(plain), 1);
});

test("神经刀 in a real game: wider hot/cold streaks, a much fatter ice-cold tail", () => {
  assert.ok(
    TEAM_WITH.some((p) => p.id === SUBJECT && p.skills.includes("nerve_blade")),
    "the 2013 J.R. Smith card lost 神经刀 -- did SIGNATURE_SKILLS regress?"
  );
  const withSkill = onCourtHotSamples(TEAM_WITH, 50, 1);
  const without = onCourtHotSamples(TEAM_WITHOUT, 50, 1);

  const sdWith = spread(withSkill);
  const sdWithout = spread(without);
  assert.ok(sdWith > sdWithout * 1.05, `streak spread should widen: with=${sdWith.toFixed(2)} without=${sdWithout.toFixed(2)}`);

  const coldShare = (xs) => xs.filter((h) => h <= -2).length / xs.length;
  const coldWith = coldShare(withSkill);
  const coldWithout = coldShare(without);
  assert.ok(
    coldWith > coldWithout * 1.6,
    `ice-cold stretches should be far more common: with=${(coldWith * 100).toFixed(0)}% without=${(coldWithout * 100).toFixed(0)}%`
  );

  // What a shot actually feels: the make-probability nudge is hot * 0.008 * effectMult.
  const nudgeWith = sdWith * skillHotEffectMult({ skills: ["nerve_blade"] });
  assert.ok(nudgeWith > sdWithout * 2.5, `per-shot make-prob swing should be much wider: ${nudgeWith.toFixed(2)} vs ${sdWithout.toFixed(2)}`);
});

test("神经刀 is variance, not a buff or a nerf: average FG% barely moves", () => {
  const a = fgPct(TEAM_WITH, 150, 1);
  const b = fgPct(TEAM_WITHOUT, 150, 1);
  assert.ok(Math.abs(a - b) < 0.05, `average FG% should stay about the same: with=${a.toFixed(3)} without=${b.toFixed(3)}`);
});
