/**
 * B76: "low appetite" meant two things in the engine -- pass first, and take few shots -- and for a player with a REAL shot volume the second was
 * counted twice (his real volume is already in the touch weight). shotGateLevel() is the appetite the SHOT side uses; the pass-first side keeps
 * reading aggressionLevel() unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { aggressionLevel, shotGateLevel, shotOpenThreshold } from "../js/engine/gameplan.js";
import { GameSim } from "../js/engine/sim.js";
import { seededStream, hashSeed } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";

const shooter = (over = {}) => ({ raw: { mpg: 30, fga: 13, gp: 70 }, orders: { aggression: "low" }, ...over });

test("a real shooter on recommended low appetite is no longer gated, but he still passes first", () => {
  const p = shooter();
  assert.equal(aggressionLevel(p), 0.22, "the order itself (and the pass-first side) is untouched");
  assert.equal(shotGateLevel(p), 0.55, "the shot side sees a normal appetite");
  assert.ok(shotOpenThreshold(p) < shotOpenThreshold({ ...p, raw: { mpg: 30, fga: 2, gp: 70 } }), "so he no longer needs a wide-open look");
});

test("the gate stays for a coach's own order, a true non-shooter and players without real stats", () => {
  assert.equal(shotGateLevel(shooter({ ordersManual: true })), 0.22, "manual orders are the coach's word");
  assert.equal(shotGateLevel(shooter({ raw: { mpg: 30, fga: 2, gp: 70 } })), 0.22, "2 shots a game over 30 minutes is a real non-shooter");
  assert.equal(shotGateLevel({ orders: { aggression: "low" } }), 0.22, "custom players have no real volume to protect");
});

test("normal and high appetite are left alone", () => {
  for (const aggression of ["normal", "high"]) {
    const p = shooter({ orders: { aggression } });
    assert.equal(shotGateLevel(p), aggressionLevel(p), aggression);
  }
});

test("lock_d is lifted like any other recommended low appetite (the defence side is separate), but a coach's own lock_d is not", () => {
  const rec = shooter({ orders: { aggression: "lock_d" } });
  assert.equal(aggressionLevel(rec), 0.08);
  assert.equal(shotGateLevel(rec), 0.55);
  assert.equal(shotGateLevel({ ...rec, ordersManual: true }), 0.08);
});

test("in a real game the same man takes clearly more shots on a recommended order than on the same order given by the coach", () => {
  const fga36 = (manual) => {
    let fga = 0, min = 0;
    for (let i = 0; i < 24; i += 1) {
      const home = realTeam("CHI", 1996);
      const man = home.players.find((p) => p.bref === "kukocto01");
      man.orders = { ...(man.orders || {}), usage: "defend", aggression: "low" };
      man.ordersManual = manual;
      const sim = new GameSim({ home, away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`gate|${i}`)), onEvent() {}, onTick() {}, onEnd() {} });
      sim.runFast();
      const row = [...sim.home.onCourt, ...sim.home.bench].find((p) => p.bref === "kukocto01");
      fga += row.stats.fga; min += row.stats.min || 0;
    }
    return (fga / Math.max(1, min)) * 36;
  };
  const gated = fga36(true);
  const free = fga36(false);
  assert.ok(free > gated * 1.5, `${free.toFixed(1)} vs ${gated.toFixed(1)} shots per 36`);
});
