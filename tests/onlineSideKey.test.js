import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { TACTICS } from "../js/data/coaches.js";

/**
 * T6 P0: the sim's coach setters were youSide-bound. Online play needs them
 * addressable per side, with the no-sideKey call keeping exact single-player
 * behavior. Synthetic rosters keep this test independent of roster.json.
 */
function mk(id) {
  return {
    id,
    name: id,
    pos: "PG",
    scoring: 70,
    defense: 70,
    pass: 70,
    rebound: 70,
    steal: 70,
    block: 70,
    speed: 70,
    strength: 70,
  };
}

function team(name, prefix) {
  const players = Array.from({ length: 12 }, (_, i) => mk(`${prefix}${i}`));
  return {
    name,
    players,
    starterIds: players.slice(0, 5).map((p) => p.id),
  };
}

function freshSim() {
  return new GameSim({
    home: team("Home", "h"),
    away: team("Away", "a"),
    youSide: "home",
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
}

test("setTactic with sideKey changes only that side", () => {
  const sim = freshSim();
  const id = Object.keys(TACTICS).find((k) => k !== "balanced");
  sim.setTactic(id, "away");
  assert.equal(sim.away.tactic?.id, id);
  assert.equal(sim.home.tactic?.id, "balanced");
});

test("setTactic without sideKey keeps single-player behavior", () => {
  const sim = freshSim();
  const id = Object.keys(TACTICS).find((k) => k !== "balanced");
  sim.setTactic(id);
  assert.equal(sim.home.tactic?.id, id);
  assert.equal(sim.away.tactic?.id, "balanced");
});

test("setOffenseFocus with sideKey sets only that side's gameplan focus", () => {
  const sim = freshSim();
  assert.equal(sim.setOffenseFocus("a0", { sideKey: "away" }), true);
  assert.equal(sim.away.gameplan?.offenseFocusId, "a0");
  assert.equal(sim.offenseFocusId, null);
  assert.equal(sim.ballOpts(sim.away).primaryId, "a0");
  assert.equal(sim.ballOpts(sim.home).primaryId, null);
});

test("setOffenseFocus without sideKey keeps single-player behavior", () => {
  const sim = freshSim();
  assert.equal(sim.setOffenseFocus("h1"), true);
  assert.equal(sim.offenseFocusId, "h1");
  assert.equal(sim.home.gameplan?.offenseFocusId, "h1");
  assert.equal(sim.ballOpts(sim.home).primaryId, "h1");
});

test("setOffenseFocus rejects a bench player on either side", () => {
  const sim = freshSim();
  assert.equal(sim.setOffenseFocus("a7", { sideKey: "away" }), false);
  assert.equal(sim.away.gameplan?.offenseFocusId, undefined);
});

test("setPlayPos with sideKey moves only that side's player", () => {
  const sim = freshSim();
  assert.equal(sim.setPlayPos("a1", "SG", "away"), true);
  assert.equal(sim.away.roster.find((p) => p.id === "a1").playPos, "SG");
  assert.equal(sim.home.roster.find((p) => p.id === "h1").playPos, "PG");
});

test("substituting the focused player clears that side's gameplan focus", () => {
  const sim = freshSim();
  sim.setOffenseFocus("a0", { sideKey: "away" });
  const benchId = sim.away.bench[0].id;
  assert.equal(sim.substitute("a0", benchId, "away"), true);
  assert.equal(sim.away.gameplan?.offenseFocusId, null);
  assert.equal(sim.away.onCourt.some((p) => p.id === benchId), true);
});
