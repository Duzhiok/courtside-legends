import test from "node:test";
import assert from "node:assert/strict";
import { GameSim, foulDrawHabit } from "../js/engine/sim.js";
import { realTeam } from "./helpers/realGame.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

// ppg is built from the parts so the derived free throws are exactly `ftm` per game.
const card = ({ fga = 12, fg = 0.45, tp = 0.3, tpa = 2, ft = 0.8, ftm = 3, gp = 70 } = {}) => ({
  raw: { fga, fg, tp, tpa, ft, gp, ppg: 2 * fg * fga + tp * tpa + ftm },
});

test("foulDrawHabit: a player who lives at the line is above 1, one who never goes is below, and it stays inside 0.4-2.6", () => {
  const league = foulDrawHabit(card({ ftm: 0.33 * 0.8 * 12 })); // 0.33 FTA per shot at 80%
  assert.ok(Math.abs(league - 1) < 0.01, String(league));
  assert.ok(foulDrawHabit(card({ ftm: 6 })) > 1.3);
  assert.ok(foulDrawHabit(card({ ftm: 0.6 })) < 0.5);
  assert.equal(foulDrawHabit(card({ ftm: 40 })), 2.6);
  assert.equal(foulDrawHabit(card({ ftm: 0.05 })), 0.4);
});

test("foulDrawHabit: no real stats, a tiny sample, a non-shooter or junk is neutral and never throws", () => {
  for (const p of [null, undefined, {}, { raw: {} }, card({ gp: 4 }), card({ fga: 1 }), card({ ft: 0 }), card({ ftm: 0 }), { raw: { fga: "x", ft: 0.8, gp: 70, ppg: 10 } }]) assert.equal(foulDrawHabit(p), 1);
});

test("the habit reaches the game: the same team takes more free throws when its players really live at the line", () => {
  const withFt = (team, ftm) => ({ ...team, players: team.players.map((p) => ({ ...p, raw: { ...p.raw, ppg: 2 * p.raw.fg * p.raw.fga + (p.raw.tp || 0) * (p.raw.tpa || 0) + ftm, ft: 0.8, gp: 70 } })) });
  const a = realTeam("CHI", 1996), b = realTeam("SEA", 1996);
  const fta = (ftm) => {
    let n = 0;
    for (let i = 0; i < 20; i += 1) {
      const sim = new GameSim({ home: withFt(structuredClone(a), ftm), away: structuredClone(b), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`ftr|${i}`)) });
      sim.runFast();
      n += [...sim.home.onCourt, ...sim.home.bench].reduce((s, p) => s + p.stats.fta, 0);
    }
    return n / 20;
  };
  const rare = fta(0.8), often = fta(5);
  assert.ok(often > rare * 1.5, `rare ${rare.toFixed(1)} vs often ${often.toFixed(1)} free throws per game`);
});
