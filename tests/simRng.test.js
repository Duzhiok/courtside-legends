import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rand, withRng } from "../js/core/rng.js";
import { seededStream } from "../js/core/seededRandom.js";
import { GameSim, SEEDED_ENTRY_POINTS } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { GOLDEN_SEEDS, run } from "../scripts/sim/golden-hash.mjs";

const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/simGolden.json", import.meta.url), "utf8"));

/** Run `fn` while Math.random is booby-trapped: any roll that escapes the injected source blows up. */
function withMathRandomBanned(fn) {
  const real = Math.random;
  Math.random = () => {
    throw new Error("Math.random escaped the injected rng");
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

test("rng: default forwards to the CURRENT Math.random (tests that swap it keep working)", () => {
  const real = Math.random;
  Math.random = () => 0.25;
  try {
    assert.equal(rand(), 0.25);
  } finally {
    Math.random = real;
  }
});

test("rng: withRng injects, nests, restores -- even when fn throws", () => {
  const a = () => 0.1;
  const b = () => 0.2;
  assert.equal(withRng(a, () => withRng(b, () => rand()) + rand()), 0.2 + 0.1);
  assert.throws(() => withRng(a, () => { throw new Error("boom"); }), /boom/);
  const real = Math.random;
  Math.random = () => 0.9;
  try {
    assert.equal(rand(), 0.9, "source restored after the throw");
  } finally {
    Math.random = real;
  }
  assert.equal(withRng(undefined, () => "ran"), "ran", "no rng -> just run");
});

test("golden: 20 seeded games hash identically when seeded via Math.random swap (legacy way)", () => {
  assert.deepEqual(run("global"), GOLDEN);
});

test("golden: 20/20 identical when seeded through GameSim({ rng }) -- and Math.random is never touched", () => {
  const got = withMathRandomBanned(() => run("injected"));
  assert.deepEqual(got, GOLDEN);
  assert.equal(Object.keys(got).length, GOLDEN_SEEDS.length);
});

test("every SEEDED_ENTRY_POINTS name is a real, wrapped GameSim method", () => {
  for (const n of SEEDED_ENTRY_POINTS) {
    assert.equal(typeof GameSim.prototype[n], "function", n);
    assert.equal(GameSim.prototype[n].seededEntry, true, `${n} is not wrapped with withRng`);
  }
});

test("autopilot switches roll dice too -- they must honour the injected rng", () => {
  withMathRandomBanned(() => {
    const sim = new GameSim({
      home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home",
      injuries: true, speed: 3, rng: seededStream(7), onEvent: () => {}, onTick: () => {}, onEnd: () => {},
    });
    sim.running = true;
    for (let i = 0; i < 15; i++) sim.step();
    sim.setAutoDefense(true);
    sim.setAutoOffense(true);
    sim.setAutoRotation(true);
    sim.setPaused(true);
    sim.setPaused(false);
    sim.runFast();
  });
});

test("same seed -> same game; different seed -> different game", () => {
  const play = (seed) => {
    const sim = new GameSim({ home: realTeam("LAL", 2001), away: realTeam("SAS", 2003), rng: seededStream(seed), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
    return JSON.stringify(sim.runFast().score);
  };
  assert.equal(play(5), play(5));
  const scores = new Set([1, 2, 3, 4, 5, 6].map(play));
  assert.ok(scores.size > 1, "different seeds should not all produce the same score");
});
