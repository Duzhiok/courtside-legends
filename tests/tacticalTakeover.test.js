import test from "node:test";
import assert from "node:assert/strict";
import { createTacticalTakeover } from "../js/engine/tacticalTakeover.js";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";

function liveGame() {
  const sim = new GameSim({
    home: realTeam("GSW", 2016),
    away: realTeam("CLE", 2016),
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(11),
  });
  // Drive synchronously: start() would use the async _loop.
  sim.running = true;
  return sim;
}

test("takeover: setFocus applies an existing focus play and reports the id", () => {
  const sim = liveGame();
  const takeover = createTacticalTakeover({ sim });
  const res = takeover.setFocus("iso_star");
  assert.deepEqual(res, { ok: true, focusId: "iso_star" });
  assert.equal(sim.focusPlay?.id, "iso_star");
  assert.equal(takeover.current().focusPlay?.id, "iso_star");
});

test("takeover: empty focus clears the play", () => {
  const sim = liveGame();
  sim.setFocusPlay("post_up");
  const takeover = createTacticalTakeover({ sim });
  assert.deepEqual(takeover.setFocus(""), { ok: true, focusId: null });
  assert.equal(sim.focusPlay, null);
});

test("takeover: unknown focus id is rejected and the old play survives", () => {
  const sim = liveGame();
  sim.setFocusPlay("post_up");
  const takeover = createTacticalTakeover({ sim });
  assert.deepEqual(takeover.setFocus("nope"), { ok: false, reason: "invalid" });
  assert.equal(sim.focusPlay?.id, "post_up", "rejection must not clobber the live play");
});

test("takeover: setTempo applies a tempo and current() reflects it", () => {
  const sim = liveGame();
  const takeover = createTacticalTakeover({ sim });
  assert.deepEqual(takeover.setTempo("push"), { ok: true, tempoId: "push" });
  assert.equal(sim.youTempo().id, "push");
  assert.equal(takeover.current().tempo, "push");
});

test("takeover: an unknown tempo normalizes to normal (same rule as the dead-ball panel)", () => {
  const sim = liveGame();
  const takeover = createTacticalTakeover({ sim });
  assert.deepEqual(takeover.setTempo("warp_drive"), { ok: true, tempoId: "normal" });
  assert.equal(sim.youTempo().id, "normal");
});

test("takeover: no sim at all is a no-op rejection, not a throw", () => {
  const takeover = createTacticalTakeover({});
  assert.deepEqual(takeover.setFocus("iso_star"), { ok: false, reason: "no_sim" });
  assert.deepEqual(takeover.setTempo("push"), { ok: false, reason: "no_sim" });
  assert.deepEqual(takeover.current(), { focusPlay: null, tempo: "normal" });
});

test("takeover: after the game ends, both operations are game_over", () => {
  const sim = liveGame();
  sim.runFast();
  assert.equal(sim.running, false, "runFast finishes the game");
  const takeover = createTacticalTakeover({ sim });
  assert.deepEqual(takeover.setFocus("iso_star"), { ok: false, reason: "game_over" });
  assert.deepEqual(takeover.setTempo("push"), { ok: false, reason: "game_over" });
});

test("takeover: setting focus/tempo never rolls dice or changes the score", () => {
  const sim = liveGame();
  const takeover = createTacticalTakeover({ sim });
  const before = JSON.stringify(sim.snapshot());
  takeover.setFocus("post_up");
  takeover.setTempo("push");
  takeover.setTempo("grind");
  takeover.setFocus("");
  const after = JSON.stringify(sim.snapshot());
  assert.equal(after, before, "takeover is a plain state write, like the dead-ball panel");
});
