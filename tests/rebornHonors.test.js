// Player Reborn Playoffs v1, P3: the championship is settled once, honours and playoff statistics persist, nothing else about the player changes.
import test from "node:test";
import assert from "node:assert/strict";
import { advanceLeague, leagueStandings } from "../js/reborn/league.js";
import { startPlayoffs } from "../js/reborn/playoffs.js";
import { enterPlayoffs, playPlayoffGame } from "../js/reborn/playoffFlow.js";
import { archivePlayoffSeason, championships, mirrorHonorsToAccount, playoffGames, playoffStats, settlePlayoffSeason } from "../js/reborn/honors.js";
import { rolloverSeason, seasonSummary } from "../js/reborn/contract.js";
import { buildSeason } from "../js/reborn/season.js";
import { legacyOf } from "../js/career/careerRelationships.js";
import { ROWS, coin, fakeUserLog, playRun, run, userAlways } from "./helpers/rebornLeagueFixtures.js";

/** A run at the end of its regular season (the player's club first), the bracket started, and the player's playoff run played to `winRounds` wins. */
function finished(seed, year, winRounds, { minutes = 20 } = {}) {
  const reborn = run(seed, year);
  fakeUserLog(reborn, year, userAlways(reborn, true));
  advanceLeague(reborn, ROWS, { year, simulate: coin });
  reborn.playoffs = startPlayoffs(leagueStandings(reborn, year), { year, userId: reborn.player.teamId });
  playRun(reborn.playoffs, winRounds, { reborn, minutes });
  return reborn;
}

test("playoff statistics are derived from the log: only playoff games, per series on request, minutes-based averages", () => {
  const reborn = finished("ho-stats-1", 2009, 4);
  const all = playoffStats(reborn, 2009);
  const games = playoffGames(reborn, 2009);
  assert.equal(all.gp, games.length);
  assert.equal(all.wins, games.length, "he won every game of a champion run he won every round of");
  assert.equal(all.pts, 12 * games.length);
  assert.equal(all.ppg, 12);
  assert.equal(all.mpg, 20);
  assert.ok(all.gp >= 16, "four series of at least four wins");
  const finals = playoffStats(reborn, 2009, { series: "F" });
  assert.ok(finals.gp >= 4 && finals.gp <= 7 && finals.gp < all.gp);
  assert.equal(playoffStats(reborn, 2010).gp, 0, "another year has nothing");
  assert.equal(playoffStats(reborn).gp, all.gp, "no year = the whole career");
  assert.equal(seasonSummary(reborn, 2009).games, 82, "and none of it leaks into the regular season");
});

test("a title: one honour, with the Finals he actually played, one timeline line; settling again changes nothing", () => {
  const reborn = finished("ho-champ-1", 2014, 4);
  assert.equal(reborn.playoffs.status, "champion");
  const once = settlePlayoffSeason(reborn);
  assert.equal(championships(once).length, 1);
  const h = once.honors[0];
  assert.equal(h.id, "champion:2014");
  assert.equal(h.teamId, reborn.player.teamId);
  assert.equal(h.finals.wins, 4);
  assert.ok(h.finals.losses <= 3 && h.finals.oppId && h.finals.oppId !== h.teamId);
  assert.equal(h.finals.games.length, h.finals.wins + h.finals.losses);
  assert.equal(h.finals.clinchedGameId, `po:F:${h.finals.games.length}`, "the title-clinching game is on record");
  assert.equal(h.contribution.finals.gp, h.finals.games.length);
  assert.equal(h.contribution.finals.min, 20 * h.finals.games.length);
  assert.equal(h.contribution.run.gp, playoffGames(reborn, 2014).length);
  const events = once.timeline.events.filter((e) => e.event === "playoffs");
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "champion");
  assert.equal(events[0].round, 4);
  const twice = settlePlayoffSeason(once);
  assert.equal(twice, once, "already settled: the very same state comes back");
  assert.equal(settlePlayoffSeason(JSON.parse(JSON.stringify(once))).honors.length, 1, "and a reloaded save does not settle it again");
});

test("a title won by a player who never got on the court says so: the honour records his real minutes (zero), it does not pretend", () => {
  const reborn = finished("ho-bench-1", 2014, 4, { minutes: 0 });
  const h = settlePlayoffSeason(reborn).honors[0];
  assert.equal(h.type, "champion");
  assert.equal(h.contribution.finals.min, 0);
  assert.equal(h.contribution.finals.played, 0);
  assert.equal(h.contribution.run.played, 0);
  assert.ok(h.contribution.finals.gp > 0, "the games were played, he was not in them");
});

test("a Finals loss is a different honour (finalist), an earlier exit is a timeline line only, a missed field likewise", () => {
  const lost = settlePlayoffSeason(finished("ho-final-1", 2005, 3));
  assert.equal(lost.playoffs.status, "eliminated");
  assert.equal(lost.honors.length, 1);
  assert.equal(lost.honors[0].type, "finalist");
  assert.equal(lost.honors[0].id, "finalist:2005");
  assert.equal(championships(lost).length, 0);
  assert.equal(lost.timeline.events.find((e) => e.event === "playoffs").outcome, "finalist");

  const early = settlePlayoffSeason(finished("ho-early-1", 2005, 1));
  assert.equal(early.honors, undefined, "no honour for losing in round two");
  const e = early.timeline.events.find((x) => x.event === "playoffs");
  assert.equal(e.outcome, "eliminated");
  assert.equal(e.round, 2);

  const missed = run("ho-miss-1", 2005);
  fakeUserLog(missed, 2005, userAlways(missed, false));
  advanceLeague(missed, ROWS, { year: 2005, simulate: coin });
  missed.playoffs = startPlayoffs(leagueStandings(missed, 2005), { year: 2005, userId: missed.player.teamId });
  assert.equal(missed.playoffs.status, "missed");
  const m = settlePlayoffSeason(missed);
  assert.equal(m.timeline.events.at(-1).outcome, "missed");
  assert.equal(m.honors, undefined);
});

test("nothing is settled while the run is on, or when the season has no playoffs", () => {
  const live = run("ho-live-1", 2003);
  fakeUserLog(live, 2003, userAlways(live, true));
  advanceLeague(live, ROWS, { year: 2003, simulate: coin });
  live.playoffs = startPlayoffs(leagueStandings(live, 2003), { year: 2003, userId: live.player.teamId });
  assert.equal(live.playoffs.status, "active");
  assert.equal(settlePlayoffSeason(live), live);
  const none = { ...live, playoffs: { year: 2003, status: "unavailable", series: [], seedOf: {} } };
  assert.equal(settlePlayoffSeason(none), none);
  const old = run("ho-old-1", 2003);
  assert.equal(settlePlayoffSeason(old), old, "an old save with no playoffs at all");
});

test("settling touches honours and the timeline only: trust, ratings, growth, the log and the bracket are exactly as they were", () => {
  const reborn = finished("ho-pure-1", 2009, 4);
  const settled = settlePlayoffSeason(reborn);
  const strip = (r) => { const c = structuredClone(r); delete c.honors; if (c.timeline) c.timeline.events = c.timeline.events.filter((e) => e.event !== "playoffs"); return c; };
  assert.deepEqual(strip(settled), strip(reborn));
});

test("two titles in two seasons are two honours with their own ids; the account legacy gets one copy of each, however often it is mirrored", () => {
  let reborn = finished("ho-two-1", 2009, 4);
  reborn = settlePlayoffSeason(reborn);
  const rolled = rolloverSeason(reborn, { year: 2009, players: ROWS }).reborn;
  rolled.player.teamId = reborn.player.teamId;
  // a second title in 2010
  fakeUserLog(rolled, 2010, userAlways(rolled, true));
  advanceLeague(rolled, ROWS, { year: 2010, simulate: coin });
  rolled.playoffs = startPlayoffs(leagueStandings(rolled, 2010), { year: 2010, userId: rolled.player.teamId });
  playRun(rolled.playoffs, 4, { reborn: rolled });
  const both = settlePlayoffSeason(rolled);
  assert.deepEqual(championships(both).map((h) => h.id), ["champion:2009", "champion:2010"]);
  const account = {};
  assert.equal(mirrorHonorsToAccount(account, both), 2);
  assert.equal(mirrorHonorsToAccount(account, both), 0, "mirroring is idempotent");
  const legacy = legacyOf(account).filter((e) => e.type === "championship");
  assert.equal(legacy.length, 2);
  assert.ok(legacy.every((e) => e.summary.includes("总冠军") && e.summaryEn.includes("champions")));
  assert.equal(mirrorHonorsToAccount(null, both), 0);
});

test("rollover closes the season's books: the bracket and league results go, a one-line history stays, the next season starts empty", () => {
  const reborn = settlePlayoffSeason(finished("ho-roll-1", 2014, 4));
  reborn.league = { year: 2014, scores: [1] };
  const rolled = rolloverSeason(reborn, { year: 2014, players: ROWS }).reborn;
  assert.equal(rolled.playoffs, undefined);
  assert.equal(rolled.league, undefined);
  assert.equal(rolled.seasonHistory[2014].playoffs.outcome, "champion");
  assert.equal(rolled.seasonHistory[2014].playoffs.championId, reborn.player.teamId);
  assert.equal(rolled.honors.length, 1, "the honour stays");
  assert.equal(rolled.player.seasonYear, 2015);
  assert.equal(buildSeason(rolled, ROWS).index, 0);
  assert.equal(reborn.playoffs.year, 2014, "rollover works on a copy");
  const plain = rolloverSeason(run("ho-roll-2", 2003), { year: 2003, players: ROWS }).reborn;
  assert.equal(plain.seasonHistory, undefined, "a season with no playoffs leaves no history entry");
  assert.deepEqual(archivePlayoffSeason(run("ho-roll-3", 2003), 2003).seasonHistory, undefined);
});

test("real GameSim run, a title: the clinching game (and only it) carries isChampionship, the honour and one timeline line follow, a reload settles nothing twice", { timeout: 120000 }, async () => {
  let reborn = run("tx-29", 1997);
  reborn.player.coachTrust = 80;
  fakeUserLog(reborn, 1997, userAlways(reborn, true));
  advanceLeague(reborn, ROWS, { year: 1997, simulate: coin });
  reborn = await enterPlayoffs(reborn, ROWS, { year: 1997 });
  const flags = [];
  for (let out = await playPlayoffGame(reborn, ROWS, {}); out; out = await playPlayoffGame(reborn, ROWS, {})) {
    reborn = out.reborn;
    flags.push({ title: !!out.report.isChampionship, won: out.report.won, po: out.report.po });
  }
  assert.equal(reborn.playoffs.status, "champion", "this seed wins it (fixed seed, real engine)");
  assert.equal(flags.filter((f) => f.title).length, 1);
  assert.deepEqual(flags.at(-1).po.series, "F");
  assert.ok(flags.at(-1).title && flags.at(-1).won, "it is the last game, and he won it");
  assert.equal(championships(reborn).length, 1);
  assert.equal(reborn.timeline.events.filter((e) => e.event === "playoffs").length, 1);
  assert.equal(reborn.honors[0].finals.clinchedGameId, reborn.player.seasonLog.at(-1).gameId);
  assert.equal(reborn.honors[0].contribution.run.gp, playoffGames(reborn, 1997).length);
  const reloaded = JSON.parse(JSON.stringify(reborn));
  assert.equal(settlePlayoffSeason(reloaded), reloaded);
  assert.equal(await playPlayoffGame(reloaded, ROWS, {}), null, "no more games after the title");
});

test("real GameSim run, a Finals loss: finalist honour, no title flag anywhere", { timeout: 120000 }, async () => {
  // Fixed seed on the real engine that happens to reach the Finals and lose them. Re-pick it after any GameSim recalibration (the assertions
  // are the design, the seed is not): `node scripts/measure/find-playoff-seeds.mjs tx 1 240 8` lists title / title-dnp / finals-loss seeds.
  let reborn = run("honors-real-11", 1997);
  reborn.player.coachTrust = 80;
  fakeUserLog(reborn, 1997, userAlways(reborn, true));
  advanceLeague(reborn, ROWS, { year: 1997, simulate: coin });
  reborn = await enterPlayoffs(reborn, ROWS, { year: 1997 });
  let titleFlags = 0;
  for (let out = await playPlayoffGame(reborn, ROWS, {}); out; out = await playPlayoffGame(reborn, ROWS, {})) {
    reborn = out.reborn;
    if (out.report.isChampionship) titleFlags += 1;
  }
  assert.equal(titleFlags, 0);
  assert.equal(reborn.playoffs.status, "eliminated");
  assert.deepEqual(reborn.honors.map((h) => h.id), ["finalist:1997"]);
  assert.notEqual(reborn.playoffs.championId, reborn.player.teamId);
});
