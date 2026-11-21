import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { seededStream } from "../js/core/seededRandom.js";

function play(seed) {
  const events = [];
  const sim = new GameSim({
    home: realTeam("CHI", 1996),
    away: realTeam("SEA", 1996),
    youSide: "home",
    injuries: false,
    speed: 3,
    lang: "zh",
    rng: seededStream(seed),
    onEvent(e) { events.push(e); },
    onTick() {},
    onEnd() {},
  });
  sim.running = true;
  let guard = 0;
  while (sim.running && guard++ < 8000) sim.step();
  return events;
}

test("a loose-ball foul is only a foul: the offense keeps the ball and nobody shoots", () => {
  let foul = null;
  let next = null;
  for (let seed = 1; seed <= 40 && !foul; seed++) {
    const events = play(seed);
    const i = events.findIndex((e) => e.meta?.foul?.kind === "loose");
    if (i >= 0) {
      foul = events[i];
      next = events[i + 1];
    }
  }
  assert.ok(foul, "a loose-ball foul shows up inside 40 seeded games");
  assert.equal(foul.meta.turnover, undefined);
  assert.match(foul.text, /仍持球/);
  assert.doesNotMatch(foul.text, /失误/);
  assert.doesNotMatch(next?.text || "", /罚球/);
});
