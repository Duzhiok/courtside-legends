/**
 * Player Reborn PR2 — season loop. The schedule and trust math are pinned
 * exactly; game RESULTS are never asserted (policy: no assertions on random
 * game outcomes). One game costs a few hundred ms, so integration tests use
 * a 2-game override schedule.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameSim } from "../js/engine/sim.js";
import {
  rosterCards,
  buildSeason,
  playGame,
  playSeason,
  takeoverEligible,
  attemptTakeover,
  driveGame,
} from "../js/reborn/season.js";
import { createRebornState, buildPlayerCard, REBORN_TEAM_IDS } from "../js/reborn/identity.js";
import { roleForTrust } from "../js/reborn/trust.js";
import { overall } from "../js/data/players.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

test("rosterCards returns a team's season, best first", () => {
  const cards = rosterCards(ROWS, "LAL", 1997);
  const rows = ROWS.filter((r) => r.team === "LAL" && r.season === 1997);
  assert.equal(cards.length, rows.length);
  assert.ok(cards.length >= 10, "a real 1996-97 roster");
  const ovrs = cards.map(overall);
  assert.deepEqual(ovrs, [...ovrs].sort((a, b) => b - a));
});

test("buildSeason gives the team an 82-game schedule, one game per day", () => {
  const reborn = createRebornState("reborn-sched-1", ROWS);
  const season = buildSeason(reborn, ROWS);
  assert.equal(season.games.length, 82);
  assert.equal(season.year, 1997);
  assert.equal(season.teamId, reborn.player.teamId);
  const opps = new Set();
  let prevDay = 0;
  for (const g of season.games) {
    assert.ok(g.homeId === season.teamId || g.awayId === season.teamId);
    assert.ok(g.homeId !== g.awayId);
    opps.add(g.homeId === season.teamId ? g.awayId : g.homeId);
    assert.ok(g.day >= prevDay, "days in order");
    prevDay = g.day;
  }
  assert.equal(opps.size, 28, "every other 1996-97 team");
});

function eligibleSim(seed = "reborn-elig-1", { onCourt = true } = {}) {
  const reborn = createRebornState(seed, ROWS);
  const teamId = reborn.player.teamId;
  const clone = buildPlayerCard(reborn.identity, ROWS);
  const rest = rosterCards(ROWS, teamId, 1997).filter((p) => p.bref !== reborn.identity.bref);
  const homeCards = [clone, ...rest.slice(0, 9)];
  const oppId = REBORN_TEAM_IDS.find((t) => t !== teamId);
  const awayCards = rosterCards(ROWS, oppId, 1997).slice(0, 10);
  const starters = onCourt
    ? homeCards.slice(0, 5).map((p) => p.id)
    : homeCards.slice(1, 6).map((p) => p.id);
  const sim = new GameSim({
    home: { name: teamId, players: homeCards, starterIds: starters },
    away: { name: oppId, players: awayCards, starterIds: awayCards.slice(0, 5).map((p) => p.id) },
    youSide: "home",
    injuries: false,
    speed: 3,
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  sim.running = true;
  sim.quarter = 4;
  sim.clock = 100;
  sim.score = { home: 98, away: 100 };
  sim.possession = "home";
  return { sim, reborn, clone };
}

test("takeoverEligible needs Q4/OT, last 2:00, close game, your ball, you on court", () => {
  const { sim, clone } = eligibleSim();
  assert.equal(takeoverEligible(sim, clone.id), true);

  const q3 = eligibleSim("reborn-elig-2");
  q3.sim.quarter = 3;
  assert.equal(takeoverEligible(q3.sim, q3.clone.id), false);

  const early = eligibleSim("reborn-elig-3");
  early.sim.clock = 300;
  assert.equal(takeoverEligible(early.sim, early.clone.id), false);

  const blowout = eligibleSim("reborn-elig-4");
  blowout.sim.score = { home: 80, away: 100 };
  assert.equal(takeoverEligible(blowout.sim, blowout.clone.id), false);

  const theirBall = eligibleSim("reborn-elig-5");
  theirBall.sim.possession = "away";
  assert.equal(takeoverEligible(theirBall.sim, theirBall.clone.id), false);

  const bench = eligibleSim("reborn-elig-6", { onCourt: false });
  assert.equal(takeoverEligible(bench.sim, bench.clone.id), false);

  const armed = eligibleSim("reborn-elig-7");
  armed.sim.clutchDecision = { attemptId: "x", shooterId: armed.clone.id };
  assert.equal(takeoverEligible(armed.sim, armed.clone.id), false);
});

test("attemptTakeover submits through the M2b interface and the outcome lands in clutchLog", async () => {
  const { sim, clone } = eligibleSim("reborn-elig-8");
  const decision = { shooterId: clone.id, actionHint: "attack" };
  const out = await attemptTakeover(sim, clone.id, async () => decision);
  assert.equal(out.accepted, true);
  assert.ok(out.attemptId);
  assert.ok(sim.clutchDecision, "armed for the next possession");
  for (let i = 0; i < 20 && sim.clutchLog.length === 0; i++) sim.step();
  assert.equal(sim.clutchLog.length, 1);
  assert.equal(sim.clutchLog[0].attemptId, out.attemptId);
  assert.equal(sim.clutchLog[0].shooterId, clone.id);
});

test("attemptTakeover returns null when the hook skips or the window is closed", async () => {
  const { sim, clone } = eligibleSim("reborn-elig-9");
  assert.equal(await attemptTakeover(sim, clone.id, async () => null), null);
  assert.equal(sim.clutchDecision, null);
  const q3 = eligibleSim("reborn-elig-10");
  q3.sim.quarter = 2;
  assert.equal(
    await attemptTakeover(q3.sim, q3.clone.id, async () => ({ shooterId: q3.clone.id, actionHint: "attack" })),
    null,
  );
});

test("driveGame runs a full game with no hook and no takeover", async () => {
  const { sim, clone } = eligibleSim("reborn-elig-11");
  sim.quarter = 1;
  sim.clock = 720;
  sim.score = { home: 0, away: 0 };
  const { takeover } = await driveGame(sim, clone.id, {});
  assert.equal(takeover, null);
  assert.equal(sim.running, false, "game finished");
});

function twoGameSeason(reborn) {
  const teamId = reborn.player.teamId;
  const [opp1, opp2] = REBORN_TEAM_IDS.filter((t) => t !== teamId).slice(0, 2);
  return buildSeason(reborn, ROWS, {
    games: [
      { homeId: teamId, awayId: opp1, day: 1, played: false },
      { homeId: opp2, awayId: teamId, day: 2, played: false },
    ],
  });
}

test("playGame settles one game: line, trust, role, season log — never the random result", async () => {
  const reborn = createRebornState("reborn-game-1", ROWS);
  const season = twoGameSeason(reborn);
  const out = await playGame(reborn, season, ROWS, {});
  assert.ok(out, "first game played");
  const { report } = out;
  assert.equal(typeof report.won, "boolean");
  assert.ok(Number.isFinite(report.gameScore));
  assert.equal(report.line.id, buildPlayerCard(reborn.identity, ROWS).id);
  assert.ok(report.line.min >= 0);
  assert.equal(report.trustAfter - report.trustBefore, report.trustDelta);
  assert.equal(report.roleAfter, roleForTrust(report.trustAfter));
  assert.equal(report.weekBoundary, false, "game 1 of 4 is not a week boundary");
  assert.equal(season.index, 1);
  assert.equal(out.reborn.player.seasonLog.length, 1);
  assert.equal(out.reborn.player.seasonLog[0].game, 1);
  assert.equal(reborn.player.seasonLog.length, 0, "input reborn is never mutated");

  const out2 = await playGame(out.reborn, season, ROWS, {});
  assert.ok(out2, "second game played");
  assert.equal(season.index, 2);
  assert.equal(await playGame(out2.reborn, season, ROWS, {}), null, "schedule exhausted");
});

test("a week boundary lands every 4th game", async () => {
  const reborn = createRebornState("reborn-game-2", ROWS);
  const teamId = reborn.player.teamId;
  const opps = REBORN_TEAM_IDS.filter((t) => t !== teamId).slice(0, 4);
  const season = buildSeason(reborn, ROWS, {
    games: opps.map((opp, i) => ({ homeId: teamId, awayId: opp, day: i + 1, played: false })),
  });
  let current = reborn;
  const boundaries = [];
  for (let i = 0; i < 4; i++) {
    const out = await playGame(current, season, ROWS, {});
    boundaries.push(out.report.weekBoundary);
    current = out.reborn;
  }
  assert.deepEqual(boundaries, [false, false, false, true]);
});

test("playSeason plays the schedule and summarizes without asserting results", async () => {
  const reborn = createRebornState("reborn-game-3", ROWS);
  const season = twoGameSeason(reborn);
  const { reborn: final, reports, summary } = await playSeason(reborn, season, ROWS, {});
  assert.equal(reports.length, 2);
  assert.equal(summary.games, 2);
  assert.equal(summary.finalTrust, final.player.coachTrust);
  assert.equal(summary.finalRole, final.player.rotationRole);
  assert.equal(final.player.seasonLog.length, 2);
});
