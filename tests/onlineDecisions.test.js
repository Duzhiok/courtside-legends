import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { TACTICS } from "../js/data/coaches.js";
import { validateDecision, describeDecision } from "../server/online-decisions.mjs";

/** Synthetic rosters, same shape as onlineSideKey.test.js. */
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
  return { name, players, starterIds: players.slice(0, 5).map((p) => p.id) };
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

function applyOk(sim, side, d) {
  const v = validateDecision(sim, side, d);
  assert.equal(v.ok, true, `expected ok, got: ${v.reason}`);
  const r = v.apply();
  assert.notEqual(r, false, "apply returned false");
  return v;
}

test("sub validates own side only and applies", () => {
  const sim = freshSim();
  // Away's bench player is not home's bench player.
  const bad = validateDecision(sim, "home", { kind: "sub", outId: "h0", inId: "a5" });
  assert.equal(bad.ok, false);
  applyOk(sim, "home", { kind: "sub", outId: "h0", inId: "h5" });
  assert.equal(sim.home.onCourt.some((p) => p.id === "h5"), true);
});

test("sub rejects an injured inbound", () => {
  const sim = freshSim();
  sim.home.bench[0].injuredGames = 2;
  const v = validateDecision(sim, "home", {
    kind: "sub",
    outId: "h0",
    inId: sim.home.bench[0].id,
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /伤停/);
});

test("tactic rejects unknown ids and applies known ones", () => {
  const sim = freshSim();
  assert.equal(validateDecision(sim, "away", { kind: "tactic", tacticId: "nope" }).ok, false);
  const id = Object.keys(TACTICS).find((k) => k !== "balanced");
  applyOk(sim, "away", { kind: "tactic", tacticId: id });
  assert.equal(sim.away.tactic?.id, id);
});

test("focus rejects bench players, accepts on-court and clear", () => {
  const sim = freshSim();
  assert.equal(validateDecision(sim, "away", { kind: "focus", playerId: "a9" }).ok, false);
  applyOk(sim, "away", { kind: "focus", playerId: "a0" });
  assert.equal(sim.away.gameplan?.offenseFocusId, "a0");
  applyOk(sim, "away", { kind: "focus", playerId: null });
  assert.equal(sim.away.gameplan?.offenseFocusId, null);
});

test("playpos rejects bad positions and other-side players", () => {
  const sim = freshSim();
  assert.equal(validateDecision(sim, "home", { kind: "playpos", playerId: "h1", pos: "XX" }).ok, false);
  assert.equal(validateDecision(sim, "home", { kind: "playpos", playerId: "a1", pos: "SG" }).ok, false);
  applyOk(sim, "home", { kind: "playpos", playerId: "h1", pos: "SG" });
  assert.equal(sim.home.roster.find((p) => p.id === "h1").playPos, "SG");
});

test("timeout rejects when out of timeouts, resume rejects when running", () => {
  const sim = freshSim();
  assert.equal(validateDecision(sim, "home", { kind: "resume" }).ok, false);
  sim.timeouts.away = 0;
  assert.equal(validateDecision(sim, "away", { kind: "timeout" }).ok, false);
  applyOk(sim, "home", { kind: "timeout" });
  assert.equal(sim.paused, true);
  assert.equal(sim.timeouts.home, 6);
  applyOk(sim, "home", { kind: "resume" });
  assert.equal(sim.paused, false);
  // resume re-arms the sim loop; stop it so the test process can exit.
  sim.stop();
});

test("unknown kinds and malformed decisions are rejected, never applied", () => {
  const sim = freshSim();
  assert.equal(validateDecision(sim, "home", { kind: "hack" }).ok, false);
  assert.equal(validateDecision(sim, "home", null).ok, false);
  assert.equal(validateDecision(sim, "middle", { kind: "timeout" }).ok, false);
});

test("describeDecision names the acting side before applying", () => {
  const sim = freshSim();
  const line = describeDecision(sim, "away", { kind: "sub", outId: "a0", inId: "a5" });
  assert.match(line, /Away/);
  assert.match(line, /a0/);
  assert.match(line, /a5/);
});
