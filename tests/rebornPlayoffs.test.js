// Player Reborn Playoffs v1, P2: 16-team bracket, historical series lengths, round-by-round advancement, the player's games, elimination in any round.
import test from "node:test";
import assert from "node:assert/strict";
import { advanceLeague, leagueStandings } from "../js/reborn/league.js";
import { ROUND_NAMES, bracketFingerprint, involves, nextGameOf, nextUserGame, playoffFormat, recordGame, resolveFeeds, settleOtherSeries, startPlayoffs, userRun, winsNeeded } from "../js/reborn/playoffs.js";
import { enterPlayoffs, playPlayoffGame, regularGames } from "../js/reborn/playoffFlow.js";
import { seasonSummary } from "../js/reborn/contract.js";
import { ROWS, coin, fakeUserLog, playRun, poSim, run, userAlways } from "./helpers/rebornLeagueFixtures.js";

const takeover = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });
/** A finished regular season for the run (the player's club always wins or always loses), and its table. */
function season(seed, year, userWins) {
  const state = run(seed, year);
  fakeUserLog(state, year, userAlways(state, userWins));
  advanceLeague(state, ROWS, { year, simulate: coin });
  return { state, standings: leagueStandings(state, year) };
}

/** Everything a finished bracket must satisfy, whoever played it. */
function assertConsistentBracket(po, year) {
  const fmt = playoffFormat(year).bestOf;
  assert.equal(po.series.length, 15);
  assert.ok(po.series.every((s) => s.winner), "every series is decided");
  assert.ok(po.championId && po.finalsLoserId && po.championId !== po.finalsLoserId);
  const teams = new Set(po.series.filter((s) => s.round === 1).flatMap((s) => [s.high, s.low]));
  assert.equal(teams.size, 16, "sixteen different clubs");
  for (const s of po.series) {
    const need = winsNeeded(fmt[s.round - 1]);
    assert.equal(s.bestOf, fmt[s.round - 1], `${s.id} is best-of-${fmt[s.round - 1]} in ${year}`);
    const [wins, losses] = s.winner === s.high ? [s.winsHigh, s.winsLow] : [s.winsLow, s.winsHigh];
    assert.equal(wins, need, `${s.id}: the winner has exactly ${need} wins`);
    assert.ok(losses < need && s.games.length === wins + losses && s.games.length <= s.bestOf, `${s.id}: ${wins}-${losses}`);
    assert.ok(s.games.at(-1).winnerId === s.winner, "the last game is the one that decided it");
    // home court: higher seed hosts games 1, 2 (and 5, 7); the other club 3, 4 (and 6)
    s.games.forEach((g) => assert.equal(g.homeId, [true, true, false, false, true, false, true][g.n - 1] ? s.high : s.low, `${s.id} game ${g.n} home`));
    if (s.feeds) {
      const feeders = s.feeds.map((id) => po.series.find((x) => x.id === id).winner);
      assert.deepEqual([s.high, s.low].sort(), [...feeders].sort(), `${s.id} is played by the winners of ${s.feeds.join(" and ")}`);
    }
  }
  const finals = po.series.find((s) => s.id === "F");
  assert.equal(po.championId, finals.winner);
  assert.deepEqual([finals.high, finals.low].sort(), [po.series.find((s) => s.id === "CF-E").winner, po.series.find((s) => s.id === "CF-W").winner].sort());
}

test("series lengths follow the historical year: first round best-of-5 through 2002, best-of-7 everywhere else and in every later round", () => {
  for (const y of [1997, 1998, 2001, 2002, 1990]) assert.deepEqual(playoffFormat(y).bestOf, [5, 7, 7, 7], String(y));
  for (const y of [2003, 2005, 2009, 2014, 2025, 2030]) assert.deepEqual(playoffFormat(y).bestOf, [7, 7, 7, 7], String(y));
  assert.equal(winsNeeded(5), 3);
  assert.equal(winsNeeded(7), 4);
  assert.equal(ROUND_NAMES.length, 4);
});

test("the bracket: 16 clubs, 8 per conference by the table, 1v8 4v5 2v7 3v6, fifteen series, no Play-In", () => {
  const { standings } = season("po-shape-1", 2005, true);
  const po = startPlayoffs(standings, { year: 2005, userId: "NOPE" });
  assert.equal(po.series.length, 15);
  for (const conf of ["east", "west"]) {
    const field = standings[conf].slice(0, 8);
    assert.deepEqual(po.seeds[conf], field);
    const r1 = po.series.filter((s) => s.round === 1 && s.conf === conf);
    assert.deepEqual(r1.map((s) => [po.seedOf[s.high], po.seedOf[s.low]]), [[1, 8], [4, 5], [2, 7], [3, 6]]);
    assert.ok(r1.every((s) => field.includes(s.high) && field.includes(s.low)));
  }
  assert.equal(Object.keys(po.seedOf).length, 16);
  assert.equal(po.status, "missed", "a club outside the field is not in it");
  assert.deepEqual(po.series.find((s) => s.id === "F").feeds, ["CF-E", "CF-W"]);
});

for (const year of [1997, 2002, 2003, 2005, 2009, 2014, 2025]) {
  test(`${year}: a whole bracket without the player's club plays out round by round to one champion (${playoffFormat(year).bestOf[0] === 5 ? "best-of-5" : "best-of-7"} first round)`, () => {
    const { standings } = season(`po-full-${year}`, year, false);
    const out = startPlayoffs(standings, { year, userId: "NOT-IN-FIELD" });
    const games = settleOtherSeries(out, poSim);
    assert.ok(games >= 15 * winsNeeded(5) && games <= 15 * 7);
    assert.equal(out.status, "missed");
    assertConsistentBracket(out, year);
    // deterministic: the same table gives the same bracket, game for game
    const again = startPlayoffs(standings, { year, userId: "NOT-IN-FIELD" });
    settleOtherSeries(again, poSim);
    assert.equal(bracketFingerprint(again), bracketFingerprint(out));
  });
}

test("round barrier: with the player in round one, the other round-one series are played and nothing beyond it is", () => {
  const { state, standings } = season("po-barrier-1", 2003, true);
  const po = startPlayoffs(standings, { year: 2003, userId: state.player.teamId });
  assert.equal(po.status, "active");
  assert.equal(po.seedOf[state.player.teamId], 1 + standings[standings.rows[state.player.teamId].conf].indexOf(state.player.teamId));
  settleOtherSeries(po, poSim);
  const r1 = po.series.filter((s) => s.round === 1);
  const mine = r1.find((s) => involves(s, state.player.teamId));
  assert.equal(mine.games.length, 0, "his series waits for him");
  assert.ok(r1.filter((s) => s !== mine).every((s) => s.winner), "the other seven are decided");
  assert.ok(po.series.filter((s) => s.round > 1).every((s) => s.games.length === 0), "no later round has a game yet");
  // he plays his series; only then is round two played (the other conference's too) and his next opponent is known
  const g = nextUserGame(po);
  assert.equal(g.seriesId, mine.id);
  assert.equal(g.n, 1);
  assert.equal(g.homeId, mine.high, "the better seed hosts game 1");
  while (nextUserGame(po)?.round === 1) {
    const n = nextUserGame(po), uh = n.homeId === po.userId;
    recordGame(po, n.seriesId, { n: n.n, homeId: n.homeId, awayId: n.awayId, homeScore: uh ? 100 : 90, awayScore: uh ? 90 : 100, user: true });
    settleOtherSeries(po, poSim);
  }
  const r2 = po.series.filter((s) => s.round === 2);
  const mine2 = r2.find((s) => involves(s, state.player.teamId));
  assert.ok(mine2.high && mine2.low && mine2.games.length === 0, "his round-two opponent is known, and he has not played it");
  assert.ok(r2.filter((s) => s !== mine2).every((s) => s.winner), "the other three round-two series are decided");
  assert.ok(po.series.filter((s) => s.round > 2).every((s) => s.games.length === 0), "and nothing beyond round two");
});

for (const lostIn of [1, 2, 3, 4]) {
  test(`the player is eliminated in round ${lostIn}: his run ends there, the rest of the bracket is played out, another club is champion`, () => {
    const { state, standings } = season(`po-out-${lostIn}`, 2009, true);
    const po = startPlayoffs(standings, { year: 2009, userId: state.player.teamId });
    playRun(po, lostIn - 1);
    assert.equal(po.status, "eliminated");
    assertConsistentBracket(po, 2009);
    assert.notEqual(po.championId, state.player.teamId);
    assert.equal(nextUserGame(po), null, "no more games for him");
    const run1 = userRun(po);
    assert.equal(run1.series.length, lostIn);
    assert.deepEqual(run1.series.map((s) => s.won), [...Array(lostIn - 1).fill(true), false]);
    if (lostIn === 4) assert.equal(po.finalsLoserId, state.player.teamId);
  });
}

test("the player wins all four rounds: champion, and only the clinching Finals game is flagged as the title game", () => {
  const { state, standings } = season("po-champ-1", 2014, true);
  const po = startPlayoffs(standings, { year: 2014, userId: state.player.teamId });
  const flags = playRun(po, 4);
  assert.equal(po.status, "champion");
  assert.equal(po.championId, state.player.teamId);
  assertConsistentBracket(po, 2014);
  assert.equal(flags.filter(Boolean).length, 1, "exactly one title game");
  assert.equal(flags.at(-1), true, "and it is the last game he played");
  const finals = po.series.find((s) => s.id === "F");
  assert.ok(finals.games.at(-1).user && finals.games.at(-1).winnerId === state.player.teamId);
});

test("a game cannot be recorded out of order, or on a decided series", () => {
  const { state, standings } = season("po-order-1", 2003, true);
  const po = startPlayoffs(standings, { year: 2003, userId: state.player.teamId });
  settleOtherSeries(po, poSim);
  const g = nextUserGame(po);
  assert.throws(() => recordGame(po, g.seriesId, { n: 2, homeId: g.homeId, awayId: g.awayId, homeScore: 100, awayScore: 90 }), /out of order/);
  assert.throws(() => recordGame(po, g.seriesId, { n: 1, homeId: g.awayId, awayId: g.homeId, homeScore: 100, awayScore: 90 }), /out of order/, "wrong home side");
  const s = po.series.find((x) => x.id === g.seriesId);
  assert.equal(s.games.length, 0);
  const done = po.series.find((x) => x.winner);
  const before = JSON.stringify(done);
  recordGame(po, done.id, { n: 9, homeId: done.high, awayId: done.low, homeScore: 100, awayScore: 90 });
  assert.equal(JSON.stringify(done), before, "a decided series does not take another game");
});

test("save and reload in the middle of a series: continuing gives exactly the bracket an uninterrupted run gives", () => {
  const { state, standings } = season("po-reload-1", 2005, true);
  const make = () => { const p = startPlayoffs(standings, { year: 2005, userId: state.player.teamId }); settleOtherSeries(p, poSim); return p; };
  const play = (po, games) => { for (let i = 0; i < games; i += 1) { const g = nextUserGame(po); if (!g) break; const win = (g.n + g.round) % 3 !== 0; const uh = g.homeId === po.userId; recordGame(po, g.seriesId, { n: g.n, homeId: g.homeId, awayId: g.awayId, homeScore: uh === win ? 101 : 95, awayScore: uh === win ? 95 : 101, user: true }); settleOtherSeries(po, poSim); } };
  const straight = make();
  play(straight, 99);
  const half = make();
  play(half, 2);
  const reloaded = JSON.parse(JSON.stringify(half));
  assert.equal(bracketFingerprint(reloaded), bracketFingerprint(half));
  play(reloaded, 99);
  assert.equal(bracketFingerprint(reloaded), bracketFingerprint(straight));
  assert.equal(reloaded.status, straight.status);
});

test("resolveFeeds and nextGameOf are pure bookkeeping: resolving twice changes nothing", () => {
  const { standings } = season("po-pure-1", 2003, false);
  const po = startPlayoffs(standings, { year: 2003, userId: "X" });
  settleOtherSeries(po, poSim);
  const snap = JSON.stringify(po);
  resolveFeeds(po);
  resolveFeeds(po);
  assert.equal(JSON.stringify(po), snap);
  const s = po.series[0];
  assert.deepEqual(nextGameOf({ ...s, winner: null, games: [] }), { n: 1, homeId: s.high, awayId: s.low });
});

test("real flow, the player in the field: the playoffs start, his game is a real GameSim game through playGame, logged as a playoff game and counted in his series", { timeout: 180000 }, async () => {
  const reborn = run("po-real-1", 1997);
  reborn.player.coachTrust = 80;
  fakeUserLog(reborn, 1997, userAlways(reborn, true));
  advanceLeague(reborn, ROWS, { year: 1997, simulate: coin });   // the league was advanced with him during the season; here by the stand-in
  const before = JSON.stringify(reborn);
  const entered = await enterPlayoffs(reborn, ROWS, { year: 1997 });
  assert.equal(JSON.stringify(reborn), before, "entering does not mutate the save it was given");
  assert.equal(entered.playoffs.status, "active");
  assert.equal(entered.playoffs.bestOf[0], 5, "1997: best-of-5 first round");
  assert.equal(await enterPlayoffs(entered, ROWS, { year: 1997 }), entered, "entering twice is a no-op");
  const first = nextUserGame(entered.playoffs);
  const out = await playPlayoffGame(entered, ROWS, { onTakeover: takeover });
  assert.ok(out, "a real game was played");
  const log = out.reborn.player.seasonLog;
  const entry = log.at(-1);
  assert.equal(entry.year, 1997);
  assert.deepEqual(entry.po, { round: 1, series: first.seriesId, n: 1 });
  assert.equal(entry.opp, first.oppId, "he played the opponent the bracket said");
  assert.ok(Number.isFinite(entry.ptsFor) && Number.isFinite(entry.ptsAgainst));
  assert.equal(regularGames(out.reborn, 1997).length, 82, "the regular season is still 82 games");
  assert.equal(seasonSummary(out.reborn, 1997).games, 82, "the contract summary ignores playoff games");
  const series = out.reborn.playoffs.series.find((s) => s.id === first.seriesId);
  assert.equal(series.games.length, 1);
  assert.equal(series.games[0].user, true);
  assert.equal(series.games[0].gameId, out.report.gameId);
  assert.equal(series.games[0].homeScore, out.report.score.home);
  assert.equal(series.games[0].awayScore, out.report.score.away);
  assert.equal(out.report.po.series, first.seriesId);
  assert.notEqual(out.report.gameId, entered.player.seasonLog[0].gameId, "its own game id");
  assert.ok(!entered.player.seasonLog.some((e) => e.po), "the input save is untouched");
  // the next game of the same series follows, with the other side's home court
  const second = await playPlayoffGame(out.reborn, ROWS, { onTakeover: takeover });
  assert.equal(second.reborn.playoffs.series.find((s) => s.id === first.seriesId).games.length === 2 || second.reborn.playoffs.series.find((s) => s.id === first.seriesId).winner !== null, true);
  const ids = second.reborn.player.seasonLog.filter((e) => e.year === 1997).map((e) => e.gameId).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "no game id repeats");
});

test("real flow, the player outside the field: the whole bracket is real GameSim, ends with one champion, and reloading rerolls nothing", { timeout: 180000 }, async () => {
  for (const year of [1997, 2025]) {
    const reborn = run(`po-real-miss-${year}`, year);
    fakeUserLog(reborn, year, userAlways(reborn, false));
    advanceLeague(reborn, ROWS, { year, simulate: coin });
    const entered = await enterPlayoffs(reborn, ROWS, { year });
    assert.equal(entered.playoffs.status, "missed", String(year));
    assertConsistentBracket(entered.playoffs, year);
    assert.equal(await playPlayoffGame(entered, ROWS, { onTakeover: takeover }), null, "no game for a club that is not in it");
    const reloaded = JSON.parse(JSON.stringify(entered));
    assert.equal(await enterPlayoffs(reloaded, ROWS, { year }) === reloaded, true);
    // an independent second run from the same table gives the identical bracket
    const second = await enterPlayoffs(reborn, ROWS, { year });
    assert.equal(bracketFingerprint(second.playoffs), bracketFingerprint(entered.playoffs));
  }
});

test("no roster data for the season: there are no playoffs (nothing invented)", async () => {
  const reborn = run("po-none-1", 2030);
  const out = await enterPlayoffs(reborn, ROWS, { year: 2030 });
  assert.equal(out.playoffs.status, "unavailable");
  assert.equal(nextUserGame(out.playoffs), null);
});
