import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { seededStream } from "../js/core/seededRandom.js";

function otSim(clock = 240) {
  let ended = null;
  const sim = new GameSim({
    home: realTeam("CHI", 1996),
    away: realTeam("SEA", 1996),
    youSide: "home",
    injuries: false,
    speed: 3,
    lang: "en",
    rng: seededStream(5),
    onEvent() {},
    onTick() {},
    onEnd(snap) { ended = snap; },
  });
  sim.quarter = 5;
  sim.clock = clock;
  sim.score.home = 100;
  sim.score.away = 100;
  sim.running = true;
  sim._quiet = true;
  return { sim, ended: () => ended };
}

test("overtime keeps playing after the first lead while the period clock remains", () => {
  const { sim, ended } = otSim();
  sim.step();
  assert.equal(ended(), null, "a tied overtime possession is not the final buzzer");
  sim.score.home = 103;
  sim.step();
  assert.equal(ended(), null, "the first overtime basket does not end the period");
  assert.equal(sim.quarter, 5);
  assert.equal(sim.running, true);
  assert.ok(sim.clock > 0);
});

test("a tied overtime starts another 5:00 period; a lead when the clock expires ends the game", () => {
  const tied = otSim(0);
  tied.sim.step();
  assert.equal(tied.ended(), null);
  assert.equal(tied.sim.quarter, 6);
  assert.equal(tied.sim.clock, 5 * 60);

  const lead = otSim(0);
  lead.sim.score.home = 108;
  lead.sim.step();
  assert.ok(lead.ended(), "clock expired with a lead is the final buzzer");
  assert.equal(lead.ended().quarter, 5);
  assert.notEqual(lead.ended().score.home, lead.ended().score.away);
});
