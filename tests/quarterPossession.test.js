import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { seededStream } from "../js/core/seededRandom.js";

function tiedSim() {
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
    onEnd() {},
  });
  sim.running = true;
  sim._quiet = true;
  sim.quarter = 1;
  sim.clock = 0;
  sim.score.home = 20;
  sim.score.away = 20;
  return sim;
}

test("the opening tip is the first possession, and it is what gets stored", () => {
  const sim = tiedSim();
  assert.ok(sim.tipWinner === "home" || sim.tipWinner === "away");
  assert.equal(sim.tipWinner, sim.possession);
  assert.equal(sim.exportState().tipWinner, sim.tipWinner);
});

test("an away tip gives the ball to the home team to start the second quarter, and back to the away team for the third", () => {
  const sim = tiedSim();
  sim.tipWinner = "away";
  sim.step();
  assert.equal(sim.quarter, 2);
  assert.equal(sim.possession, "home");
  sim.clock = 0;
  sim.step();
  assert.equal(sim.quarter, 3);
  assert.equal(sim.possession, "away");
  sim.clock = 0;
  sim.step();
  assert.equal(sim.quarter, 4);
  assert.equal(sim.possession, "home");
});

test("a home tip still opens the even quarters for the away team", () => {
  const sim = tiedSim();
  sim.tipWinner = "home";
  sim.step();
  assert.equal(sim.quarter, 2);
  assert.equal(sim.possession, "away");
});

test("a save remembers the tip winner; a save from before that field keeps odd periods with the home team", () => {
  const sim = tiedSim();
  sim.tipWinner = "away";
  const saved = sim.exportState();
  const revived = GameSim.fromSave(saved, { onEvent() {}, onTick() {}, onEnd() {} });
  assert.equal(revived.tipWinner, "away");
  revived.running = true;
  revived._quiet = true;
  revived.quarter = 1;
  revived.clock = 0;
  revived.score = { home: 20, away: 20 };
  revived.step();
  assert.equal(revived.possession, "home");

  delete saved.tipWinner;
  const legacy = GameSim.fromSave(saved, { onEvent() {}, onTick() {}, onEnd() {} });
  assert.equal(legacy.tipWinner, "home");
  legacy.running = true;
  legacy._quiet = true;
  legacy.quarter = 1;
  legacy.clock = 0;
  legacy.score = { home: 20, away: 20 };
  legacy.step();
  assert.equal(legacy.possession, "away");
});
