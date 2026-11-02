// C5: the tactician perk reaches the real engine -- season -> user team only -> GameSim -> calcMakeProb.
import test from "node:test";
import assert from "node:assert/strict";
import { COACHES } from "../js/data/coaches.js";
import { GameSim } from "../js/engine/sim.js";
import { liveTeam } from "../js/engine/season.js";
import { hiredRoot } from "./helpers/careerFixtures.js";
import { realTeam } from "./helpers/realGame.js";

const coached = (team) => ({ ...team, coach: structuredClone(COACHES[0]) });
const makeSim = (home) => new GameSim({ home, away: coached(realTeam("BOS", 2023)), youSide: "home", injuries: false, speed: 3, onEvent: () => {}, onTick: () => {}, onEnd: () => {} });

/** Run `fn` with Math.random replaced by a fixed stream, so two runs differ only by what we changed. */
function seeded(seed, fn) {
  const original = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = original; }
}

const homeMakes = (staffBonus) => {
  let made = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const snap = seeded(seed, () => makeSim({ ...coached(realTeam("DEN", 2023)), staffBonus }).runFast());
    made += snap.home.roster.reduce((sum, p) => sum + (p.stats?.fgm || 0), 0);
  }
  return made;
};

test("a team's staffBonus reaches its wrapped coach; the opponent's coach gets nothing", () => {
  const sim = makeSim({ ...coached(realTeam("DEN", 2023)), staffBonus: { shot: 0.01 } });
  assert.equal(sim.home.coach.staffShot, 0.01);
  assert.equal(sim.away.coach.staffShot, undefined);
  assert.equal(makeSim(coached(realTeam("DEN", 2023))).home.coach.staffShot, undefined, "no bonus, no field");
});

test("the shot bonus really moves made shots (exaggerated here so noise can't hide the wiring)", () => {
  const plain = homeMakes(null);
  const boosted = homeMakes({ shot: 0.25 });
  assert.ok(boosted > plain * 1.08, `boosted ${boosted} vs plain ${plain}`);
});

test("the season hands its coachPerkShot to the user's team only", () => {
  const st = structuredClone(hiredRoot(50).leagueCareer.season);
  const other = Object.keys(st.teams).find((id) => id !== st.userTeamId);
  assert.equal(liveTeam(st, st.userTeamId).staffBonus, null, "no perk, no bonus");
  st.coachPerkShot = 0.01;
  assert.deepEqual(liveTeam(st, st.userTeamId).staffBonus, { shot: 0.01 });
  assert.equal(liveTeam(st, other).staffBonus, null);
});
