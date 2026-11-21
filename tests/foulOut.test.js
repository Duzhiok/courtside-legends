import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { seededStream } from "../js/core/seededRandom.js";

function liveSim() {
  const events = [];
  const sim = new GameSim({
    home: realTeam("CHI", 1996),
    away: realTeam("SEA", 1996),
    youSide: "home",
    injuries: false,
    speed: 3,
    lang: "en",
    rng: seededStream(5),
    onEvent: (e) => events.push(e),
    onTick() {},
    onEnd() {},
  });
  sim.running = true;
  sim.clock = 700;
  sim.quarter = 1;
  return { sim, events };
}

test("six fouls sends him to the bench, and he cannot come back or pick up a seventh", () => {
  const { sim, events } = liveSim();
  const star = sim.home.onCourt[0];
  star.stats.pf = 6;
  sim.step();
  assert.equal(sim.home.onCourt.some((p) => p.id === star.id), false);
  assert.equal(sim.home.onCourt.length, 5);
  assert.equal(sim.home.bench.some((p) => p.id === star.id), true);
  assert.ok(events.some((e) => /fouls out \(6\)/.test(e.text || "")));
  const stillIn = sim.home.onCourt[0];
  assert.equal(sim.substitute(stillIn.id, star.id, "home"), false);
  assert.equal(sim.home.onCourt.some((p) => p.id === star.id), false);
  for (let i = 0; i < 40; i++) {
    if (!sim.running) break;
    sim.step();
  }
  assert.equal(sim.home.onCourt.some((p) => p.id === star.id), false);
  assert.equal(sim.away.onCourt.some((p) => p.id === star.id), false);
  assert.equal(star.stats.pf, 6);
});

test("five fouls is not a disqualification", () => {
  const { sim } = liveSim();
  const star = sim.home.onCourt[0];
  star.stats.pf = 5;
  sim._quiet = true;
  sim.step();
  assert.equal(sim.home.onCourt.some((p) => p.id === star.id), true);
});

test("with nobody left who can check in, the fouled-out man stays so the floor is not emptied", () => {
  const { sim, events } = liveSim();
  const star = sim.home.onCourt[0];
  star.stats.pf = 6;
  for (const p of sim.home.bench) p.stats.pf = 6;
  sim.step();
  assert.equal(sim.home.onCourt.some((p) => p.id === star.id), true);
  assert.equal(sim.home.onCourt.length, 5);
  assert.ok(events.some((e) => /nobody on the bench can check in/.test(e.text || "")));
});
