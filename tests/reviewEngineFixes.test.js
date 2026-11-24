// 2026-11 code review, engine batch: late-game scripts only in the 4th/OT, the duel CPU rates its OWN moves,
// a threes-only shot profile no longer yields NaN weights, and skipped possessions still count as floor time.
import test from "node:test";
import assert from "node:assert/strict";
import { GameSim, chooseShot } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import { createDuel, playPossession, OFFENSE, OFFENSE_CHOICES, DEFENSE_CHOICES } from "../js/duel/duelSim.js";

function newSim(seed) {
  const events = [];
  const sim = new GameSim({
    home: realTeam("GSW", 2016),
    away: realTeam("CLE", 2016),
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(seed),
    onEvent: (e) => events.push(e),
    onTick: () => {},
    onEnd: () => {},
  });
  sim.running = true;
  return { sim, events };
}

const intentional = (events) => events.filter((e) => /Intentional foul|故意犯规/.test(e.text || ""));

test("late Q3 is not the endgame: no intentional fouls before the third-quarter buzzer", () => {
  let q3Fouls = 0;
  let q4Fouls = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const quarter of [3, 4]) {
      const { sim, events } = newSim(`late-${seed}`);
      sim.quarter = quarter;
      sim.clock = 20;
      sim.score = { home: 50, away: 52 }; // you trail by 2, CPU has the ball
      sim.possession = "away";
      sim.step();
      if (quarter === 3) q3Fouls += intentional(events).length;
      else q4Fouls += intentional(events).length;
    }
  }
  assert.equal(q3Fouls, 0, "trailing by 2 with 0:20 left in Q3 must not foul on purpose");
  assert.ok(q4Fouls > 0, "the same spot in Q4 still triggers the endgame foul (control)");
});

test("duel: the CPU legend picks its offense from ITS ratings, not the challenger's", () => {
  const legend = { id: "lg", name: "Legend", pos: "SG", ovr: 90, shooting: 99, finishing: 30, handles: 30, defense: 70, strength: 30, speed: 40, stamina: 90, skills: [] };
  const challenger = { id: "ch", name: "Me", pos: "C", ovr: 90, shooting: 30, finishing: 99, handles: 30, defense: 70, strength: 99, speed: 40, stamina: 90, skills: [] };
  const best = (d) => OFFENSE_CHOICES.reduce((a, c) => (OFFENSE[c].rating(d) > OFFENSE[a].rating(d) ? c : a), OFFENSE_CHOICES[0]);
  assert.notEqual(best(legend), best(challenger), "fixture: the two players' best moves differ");
  const counts = {};
  let n = 0;
  for (let seed = 0; n < 200 && seed < 200; seed++) {
    const state = createDuel({ challenger, legend, difficulty: "legend", seed: `duel-cpu-${seed}` });
    while (!state.over && n < 200) {
      const ev = state.possession === "a" ? playPossession(state, { offense: OFFENSE_CHOICES[0] }) : playPossession(state, { defense: DEFENSE_CHOICES[0] });
      if (ev?.shooter === "b") {
        counts[ev.offense] = (counts[ev.offense] || 0) + 1;
        n += 1;
      }
    }
  }
  const legendBest = best(legend);
  assert.ok((counts[legendBest] || 0) / n > 0.6, `legend's own best move dominates: ${JSON.stringify(counts)}`);
});

test("chooseShot: a threes-only profile still returns a three (no NaN weights)", () => {
  const p = { id: "s", name: "Shooter", three: 95, mid: 0, paint: 0, threeTend: 95, midTend: 0, paintTend: 0, shotTend: 80, offenseStyle: "balanced" };
  const off = { coach: { playerAutonomy: 40 }, temp: {}, onCourt: [p] };
  let threes = 0;
  for (let i = 0; i < 50; i++) if (chooseShot(p, off)?.zone === "three") threes += 1;
  assert.equal(threes, 50);
});

test("a skipped possession still counts its clock as elapsed time and minutes", () => {
  const { sim } = newSim("idle-1");
  const minutes = (side) => side.onCourt.reduce((s, p) => s + p.stats.min, 0);
  const before = { clock: sim.clock, elapsed: sim.elapsedSec || 0, home: minutes(sim.home), away: minutes(sim.away) };
  sim._burnIdle(10);
  assert.equal(before.clock - sim.clock, 10);
  assert.equal((sim.elapsedSec || 0) - before.elapsed, 10);
  assert.ok(Math.abs(minutes(sim.home) - before.home - (5 * 10) / 60) < 1e-9);
  assert.ok(Math.abs(minutes(sim.away) - before.away - (5 * 10) / 60) < 1e-9);
  sim.clock = 4;
  sim._burnIdle(10); // never credits more than the clock that was left
  assert.equal(sim.clock, 0);
  assert.equal((sim.elapsedSec || 0) - before.elapsed, 14);
});
