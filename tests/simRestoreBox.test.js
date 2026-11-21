import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { seededStream } from "../js/core/seededRandom.js";

function midGame() {
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
  for (let i = 0; i < 40; i += 1) sim.step();
  return sim;
}

test("reloading a game keeps the floor and the roster as the same players, so later points land on the box score", () => {
  const saved = JSON.parse(JSON.stringify(midGame().exportState()));
  const revived = GameSim.fromSave(saved, { onEvent() {}, onTick() {}, onEnd() {} });
  revived.running = true;
  revived.paused = false;
  revived._quiet = true;
  for (const side of [revived.home, revived.away]) {
    assert.equal(side.onCourt.length, 5);
    for (const p of [...side.onCourt, ...side.bench]) {
      assert.equal(side.roster.includes(p), true, `${p.name} on the floor is the roster player`);
    }
  }
  const id = revived.home.onCourt[0].id;
  const before = revived.home.roster.find((p) => p.id === id).stats.min;
  revived.step();
  const same = revived.home.roster.find((p) => p.id === id);
  if (revived.home.onCourt.includes(same)) assert.ok(same.stats.min > before, "minutes after the save reach the box score");
});
