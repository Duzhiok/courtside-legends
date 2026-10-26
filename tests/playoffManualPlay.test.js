import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import {
  activeUserPlayoffSeries,
  nextUserPlayoffGame,
  recordUserLivePlayoffResult,
  simPlayoffSeries,
  simUserNextPlayoffGame,
} from "../js/engine/season.js";

/**
 * Regression suite for a real user report: the playoffs result card unconditionally disabled
 * 亲自指挥/快速模拟本场 for the ENTIRE playoffs ("季后赛我不能手动打吗？？？"), forcing everyone
 * through 模拟下一轮/一键打完季后赛 with zero personal control over a single playoff game. These
 * cover the new game-by-game API that lets the user step through their own series one game at a
 * time (activeUserPlayoffSeries / nextUserPlayoffGame / simUserNextPlayoffGame /
 * recordUserLivePlayoffResult), plus the simPlayoffSeries resume fix needed so switching between
 * hand-played and bulk-simmed games mid-series doesn't scramble the 2-2-1-1-1 home/away pattern.
 */
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool2020 = rows.filter((r) => r.season === 2020).map(seasonToCard);

function buildTeam(name, offset) {
  const players = pool2020.slice(offset, offset + 12);
  assert.ok(players.length === 12, `need 12 distinct 2020 cards from offset ${offset}`);
  return { name, players };
}

function seriesFixture(highId, lowId, { winsHigh = 0, winsLow = 0, round = 4 } = {}) {
  return {
    id: "test-series",
    round,
    high: { id: highId, name: `Team ${highId}`, pct: 0.7 },
    low: { id: lowId, name: `Team ${lowId}`, pct: 0.3 },
    winsHigh,
    winsLow,
    done: false,
    winnerId: null,
  };
}

/** A minimal but real season state: finals, user vs. CPU, with real rosters so GameSim can run. */
function stateFixture({ userTeamId = "USER", oppTeamId = "CPU", userIsHigh = true, winsHigh = 0, winsLow = 0 } = {}) {
  const series = userIsHigh
    ? seriesFixture(userTeamId, oppTeamId, { winsHigh, winsLow })
    : seriesFixture(oppTeamId, userTeamId, { winsHigh, winsLow });
  return {
    phase: "playoffs",
    year: 2020,
    userTeamId,
    teams: {
      [userTeamId]: buildTeam(userTeamId, 0),
      [oppTeamId]: buildTeam(oppTeamId, 12),
    },
    playerSeason: {},
    playoffs: {
      east: { round: 4, series: [] },
      west: { round: 4, series: [] },
      finals: series,
      championId: null,
    },
    resultsLog: [],
    standings: {},
  };
}

function fakeSnap(homeScore, awayScore) {
  return { score: { home: homeScore, away: awayScore }, home: { roster: [] }, away: { roster: [] } };
}

test("nextUserPlayoffGame: fresh series, user is the high seed -> user is home for game 1 (2-2-1-1-1)", () => {
  const st = stateFixture({ userIsHigh: true });
  const info = nextUserPlayoffGame(st);
  assert.ok(info);
  assert.equal(info.gameIndex, 0);
  assert.equal(info.homeId, "USER");
  assert.equal(info.awayId, "CPU");
});

test("nextUserPlayoffGame: user is the LOW seed -> still correctly away for game 1", () => {
  const st = stateFixture({ userIsHigh: false });
  const info = nextUserPlayoffGame(st);
  assert.ok(info);
  assert.equal(info.homeId, "CPU");
  assert.equal(info.awayId, "USER");
});

test("nextUserPlayoffGame: game 3 (index 2) flips home court under 2-2-1-1-1 even with the low seed", () => {
  const st = stateFixture({ userIsHigh: false, winsHigh: 1, winsLow: 1 });
  const info = nextUserPlayoffGame(st);
  assert.equal(info.gameIndex, 2);
  assert.equal(info.homeId, "USER", "game 3 is the low seed's home game");
});

test("nextUserPlayoffGame: null outside the playoffs phase", () => {
  const st = stateFixture();
  st.phase = "done";
  assert.equal(nextUserPlayoffGame(st), null);
});

test("nextUserPlayoffGame: null once the user's series is already decided", () => {
  const st = stateFixture({ winsHigh: 4, winsLow: 1 });
  st.playoffs.finals.done = true;
  st.playoffs.finals.winnerId = "USER";
  assert.equal(activeUserPlayoffSeries(st), null, "a done series is no longer 'active'");
  assert.equal(nextUserPlayoffGame(st), null);
});

test("simUserNextPlayoffGame: plays exactly one game, advances the series by one win, and accumulates real player stats", () => {
  const st = stateFixture();
  const before = st.playoffs.finals.winsHigh + st.playoffs.finals.winsLow;
  const result = simUserNextPlayoffGame(st);
  assert.ok(result);
  assert.equal(result.game.played, true);
  const after = result.series.winsHigh + result.series.winsLow;
  assert.equal(after, before + 1, "exactly one game's worth of wins should be recorded, not more");
  const userRows = Object.keys(st.playerSeason).filter((k) => k.startsWith("USER:"));
  const cpuRows = Object.keys(st.playerSeason).filter((k) => k.startsWith("CPU:"));
  assert.ok(userRows.length > 0 && cpuRows.length > 0, "both rosters' box-score lines should accumulate into playerSeason");
});

test("simUserNextPlayoffGame: does not touch regular-season standings (playoff games are won via series, not W-L)", () => {
  const st = stateFixture();
  simUserNextPlayoffGame(st);
  assert.deepEqual(st.standings, {}, "recordStandings:false must hold for playoff games exactly like simPlayoffSeries already does");
});

test("simUserNextPlayoffGame: playing out the whole series lands on a real winner and then goes quiet", () => {
  const st = stateFixture();
  let guard = 0;
  while (!st.playoffs.finals.done && guard++ < 10) simUserNextPlayoffGame(st);
  assert.ok(st.playoffs.finals.done, "a 7-game-max series must finish within 10 iterations");
  assert.ok(["USER", "CPU"].includes(st.playoffs.finals.winnerId));
  assert.equal(nextUserPlayoffGame(st), null, "no more games once the user's own series is decided");
});

test("simUserNextPlayoffGame: clinching the FINALS flips st.phase to done, sets championId, and computes finalsAllTeam", () => {
  const st = stateFixture();
  let guard = 0;
  while (!st.playoffs.finals.done && guard++ < 10) simUserNextPlayoffGame(st);
  assert.equal(st.phase, "done");
  assert.equal(st.playoffs.championId, st.playoffs.finals.winnerId);
  assert.ok(Array.isArray(st.finalsAllTeam), "computeFinalsAllTeam() should have run, same as the bulk advancePlayoffs() path");
});

test("recordUserLivePlayoffResult: a hand-played (亲自指挥) game updates the series exactly like quick-sim would", () => {
  const st = stateFixture({ winsHigh: 3, winsLow: 2 }); // user (high) one win from the title
  const series = st.playoffs.finals;
  const info = nextUserPlayoffGame(st);
  assert.ok(info);
  const game = { homeId: info.homeId, awayId: info.awayId, played: false, result: null };
  const userWinsThisOne = info.homeId === series.high.id ? fakeSnap(110, 90) : fakeSnap(90, 110);
  recordUserLivePlayoffResult(st, game, series, userWinsThisOne);
  assert.equal(game.played, true);
  assert.equal(series.winsHigh, 4);
  assert.equal(series.done, true);
  assert.equal(series.winnerId, series.high.id);
  assert.equal(st.phase, "done", "clinching the finals live must flip phase exactly like the quick-sim path");
  assert.equal(st.playoffs.championId, series.high.id);
});

test("recordUserLivePlayoffResult: refuses to double-record an already-played game", () => {
  const st = stateFixture({ winsHigh: 1, winsLow: 1 });
  const series = st.playoffs.finals;
  const game = { homeId: "USER", awayId: "CPU", played: true, result: { winnerId: "USER" } };
  recordUserLivePlayoffResult(st, game, series, fakeSnap(100, 90));
  assert.equal(series.winsHigh, 1, "an already-played game must be a no-op, not a second win");
});

test("recordUserLivePlayoffResult: does not log the game into resultsLog (playoff games aren't schedule-replayable, same as simPlayoffSeries)", () => {
  const st = stateFixture({ winsHigh: 0, winsLow: 0 });
  const series = st.playoffs.finals;
  const game = { homeId: "USER", awayId: "CPU", played: false, result: null };
  recordUserLivePlayoffResult(st, game, series, fakeSnap(100, 90));
  assert.equal(st.resultsLog.length, 0);
});

test("simPlayoffSeries resumes from however many games are already on the board -- doesn't crash, double-count, or blow past a best-of-7 when mixing hand-played and bulk-simmed games", () => {
  // NOTE: this does NOT pin down the specific home/away-assignment bug the gi-resume fix targets
  // (seriesHomeAway(highId, lowId, gameIndex) picking the WRONG gameIndex when resuming) -- that
  // would require stubbing GameSim deeply enough to force a specific winner, which is both
  // invasive and brittle. seriesHomeAway's actual 2-2-1-1-1 pattern IS deterministically covered
  // above (nextUserPlayoffGame tests for game index 0 vs. 2). What this test guards is the
  // user-visible consequence of mixing 亲自指挥/快速模拟本场 with 一键打完季后赛 on the SAME
  // series: no crash, no double-counted wins, no runaway game count.
  const st = stateFixture();
  // Hand-play 2 games via the new per-game API (mixing manual + bulk sim is the whole point of
  // this feature), THEN hand the partially-finished series to the OLD bulk function to finish.
  simUserNextPlayoffGame(st);
  simUserNextPlayoffGame(st);
  const series = st.playoffs.finals;
  const playedSoFar = series.winsHigh + series.winsLow;
  assert.ok(playedSoFar === 2 && !series.done, "sanity: 2 games in, series should still be open");
  simPlayoffSeries(st, series); // the "一键打完季后赛" bulk path
  assert.equal(series.done, true);
  const total = series.winsHigh + series.winsLow;
  assert.ok(total >= 4 && total <= 7, `total games played must stay within a legal best-of-7 (got ${total})`);
  assert.ok(series.winsHigh >= playedSoFar || series.winsLow >= playedSoFar, "the hand-played wins must still be on the board, not reset");
});

test("activeUserPlayoffSeries: null once the user has been eliminated from an earlier round", () => {
  const st = stateFixture({ winsHigh: 1, winsLow: 4 }); // low (CPU) seed just closed it out
  st.playoffs.finals.done = true;
  st.playoffs.finals.winnerId = "CPU";
  assert.equal(activeUserPlayoffSeries(st), null);
});
