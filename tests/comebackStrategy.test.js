// B4: a team that trails big in the second half changes its approach. Design goals only: how far behind, which
// quarters, who is affected, and that pace is a trade-off (a tired lineup gains nothing). Numbers are not pinned.
import test from "node:test";
import assert from "node:assert/strict";
import { realTeam } from "./helpers/realGame.js";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";

// One possession of GSW (home) vs CLE with the given situation. `youSide` decides who the live coach is.
function possession({ youSide = "away", quarter = 3, home = 40, away = 70, fatigue = null, quiet = false, speed = null } = {}) {
  const sim = new GameSim({ home: realTeam("GSW", 2016), away: realTeam("CLE", 2016), youSide, injuries: false, speed: 3, rng: seededStream(11), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  sim.running = true;
  sim._quiet = quiet;
  sim.quarter = quarter;
  sim.clock = 600;
  sim.score = { home, away };
  sim.possession = "home";
  for (const p of sim.home.onCourt) {
    if (fatigue != null) p.fatigue = fatigue;
    if (speed != null) p.speed = speed;
  }
  sim.step();
  return sim.home.temp.comeback || null;
}

test("down 20 in the 3rd quarter, a CPU team presses: pace up, hunting, a graded level", () => {
  const c = possession({ speed: 70, fatigue: 10 });
  assert.ok(c && c.level > 0 && c.level <= 1, JSON.stringify(c));
  assert.ok(c.paceMult > 1, "a fast, fresh lineup speeds up");
});

test("the effect grows with the deficit and is capped", () => {
  const small = possession({ home: 60, away: 72, speed: 70, fatigue: 10 })?.level ?? 0; // down 12
  const big = possession({ home: 40, away: 70, speed: 70, fatigue: 10 })?.level ?? 0; // down 30
  assert.ok(small > 0 && small < big, `${small} < ${big}`);
  assert.equal(big, 1);
});

test("no change when the game is close, when leading, or before the second half", () => {
  assert.equal(possession({ home: 60, away: 66 }), null, "down 6");
  assert.equal(possession({ home: 80, away: 60 }), null, "leading");
  assert.equal(possession({ quarter: 2 }), null, "2nd quarter");
  assert.equal(possession({ quarter: 1 }), null, "1st quarter");
});

test("a coach playing live keeps their own tactics: the player's side is not changed", () => {
  assert.equal(possession({ youSide: "home" }), null);
});

test("a quick-simmed side is auto-coached like the CPU", () => {
  assert.ok(possession({ youSide: "home", quiet: true, speed: 70, fatigue: 10 })?.level > 0);
});

test("pace is a trade-off: a tired or slow lineup presses for threes and shots but does not speed up", () => {
  const tired = possession({ speed: 70, fatigue: 95 });
  assert.ok(tired.level > 0 && tired.paceMult === 1, JSON.stringify(tired));
  const slow = possession({ speed: 30, fatigue: 10 });
  assert.ok(slow.level > 0 && slow.paceMult === 1, JSON.stringify(slow));
});
