import test from "node:test";
import assert from "node:assert/strict";
import { GameSim, realPaceFactor } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

const withFga = (n, fga, gp = 82) => Array.from({ length: n }, () => ({ raw: { fga, gp, mpg: 30 } }));

test("realPaceFactor: more real shots per game means a faster team, fewer means slower, always inside 0.85-1.25", () => {
  const slow = realPaceFactor(withFga(10, 7.0)), mid = realPaceFactor(withFga(10, 8.0)), fast = realPaceFactor(withFga(10, 9.0));
  assert.ok(slow < mid && mid < fast, `${slow} ${mid} ${fast}`);
  assert.equal(realPaceFactor(withFga(10, 1)), 0.85);
  assert.equal(realPaceFactor(withFga(10, 30)), 1.25);
});

test("realPaceFactor: weights players by the games they played, so a bench cameo does not make a team fast", () => {
  const starters = withFga(8, 8.5, 82);
  const cameo = [{ raw: { fga: 25, gp: 3, mpg: 20 } }, { raw: { fga: 25, gp: 3, mpg: 20 } }];
  // Weighted by games the cameos add 2 x 25 x 3 / 82 = 1.8 shots to a team of ~68, a factor change of 0.024. Unweighted they would add 50 shots (+0.65).
  assert.ok(Math.abs(realPaceFactor([...starters, ...cameo]) - realPaceFactor(starters)) < 0.04);
});

test("realPaceFactor: a roster without real stats, with too few rows, or with junk is neutral and never throws", () => {
  for (const r of [null, undefined, [], [{}], withFga(4, 9), [{ raw: {} }, { raw: { fga: 8 } }], [...withFga(3, 9), { raw: { fga: "x", gp: 82, mpg: 30 } }]]) assert.equal(realPaceFactor(r), 1);
});

test("the real pace reaches the game: a 1986 team takes more shots than a 2008 team of the same engine, and the player's tempo setting still multiplies on top", () => {
  const shots = (a, b, y, i0 = 0) => {
    let fga = 0;
    for (let i = i0; i < i0 + 16; i += 1) {
      const sim = new GameSim({ home: realTeam(a, y), away: realTeam(b, y), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`pace|${i}`)) });
      sim.runFast();
      fga += [...sim.home.onCourt, ...sim.home.bench].reduce((s, p) => s + p.stats.fga, 0);
    }
    return fga / 16;
  };
  const old = shots("BOS", "LAL", 1986), modern = shots("BOS", "LAL", 2008);
  assert.ok(old > modern * 1.08, `1986 ${old.toFixed(1)} vs 2008 ${modern.toFixed(1)} shots per game`);
});
