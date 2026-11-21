import test from "node:test";
import assert from "node:assert/strict";
import { GameSim, turnoverHabit } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

const card = (tpg, mpg = 30) => ({ raw: { tpg, mpg } });

test("turnoverHabit: league-average habit is 1, careless is above, careful is below, always inside 0.75-1.35", () => {
  assert.ok(Math.abs(turnoverHabit(card(2.2 * (30 / 36))) - 1) < 1e-9, "2.2 per 36 = the league");
  assert.ok(turnoverHabit(card(4)) > 1 && turnoverHabit(card(1)) < 1);
  assert.equal(turnoverHabit(card(12)), 1.35);
  assert.equal(turnoverHabit(card(0)), 0.75);
  let last = 0;
  for (let tpg = 0.2; tpg <= 6; tpg += 0.2) { const h = turnoverHabit(card(tpg)); assert.ok(h >= last); assert.ok(h >= 0.75 && h <= 1.35); last = h; }
});

test("turnoverHabit: a player made without real stats (or with a tiny sample) is neutral, and junk never throws", () => {
  for (const p of [null, undefined, {}, { raw: {} }, { raw: { tpg: 3 } }, { raw: { tpg: 3, mpg: 5 } }, { raw: { tpg: -1, mpg: 30 } }, { raw: { tpg: "x", mpg: 30 } }]) assert.equal(turnoverHabit(p), 1);
});

// 48 games, not 24: sitting a fouled-out man moves who is on the floor, and the
// 24-game sample landed at 13.2 vs 15.0 (ratio 1.14). The same seeds over 48
// games are 12.6 vs 15.7 (ratio 1.25), still clear of the 1.15 bar.
test("the habit reaches the game: the same team turns the ball over more when its players' real turnover habit is worse", () => {
  const withTpg = (team, tpg) => ({ ...team, players: team.players.map((p) => ({ ...p, raw: { ...p.raw, tpg, mpg: 30 } })) });
  const base = { a: realTeam("CHI", 1996), b: realTeam("SEA", 1996) };
  const total = (tpg) => {
    let tov = 0;
    for (let i = 0; i < 48; i += 1) {
      const sim = new GameSim({ home: withTpg(structuredClone(base.a), tpg), away: structuredClone(base.b), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`habit|${i}`)) });
      sim.runFast();
      tov += sim.home.onCourt.concat(sim.home.bench).reduce((s, p) => s + p.stats.tov, 0);
    }
    return tov / 48;
  };
  const careful = total(1.0), careless = total(4.5);
  assert.ok(careless > careful * 1.15, `careful ${careful.toFixed(1)} vs careless ${careless.toFixed(1)} turnovers per game`);
});
