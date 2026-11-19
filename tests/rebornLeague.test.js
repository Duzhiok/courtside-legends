// Player Reborn Playoffs v1, P1: the whole league's regular season. Full-league W-L, every game counted once, deterministic order, reload safe, no invented table.
import test from "node:test";
import assert from "node:assert/strict";
import { advanceLeague, completeLeague, leagueSchedule, leagueStandings, rankConference, simLeagueGame } from "../js/reborn/league.js";
import { buildSeason, playGame } from "../js/reborn/season.js";
import { rosterCards } from "../js/reborn/rosters.js";
import { leagueLayout } from "../js/reborn/franchises.js";
import { overall } from "../js/data/players.js";
import { createRebornState } from "../js/reborn/identity.js";
import { ROWS, coin, fakeUserLog, run } from "./helpers/rebornLeagueFixtures.js";
const takeover = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });

test("a real GameSim league season (1997, 29 clubs): every club 82 games, wins = losses, every game counted once, scores balance", { timeout: 180000 }, () => {
  const state = run("lg-full-1", 1997);
  fakeUserLog(state, 1997);
  const out = advanceLeague(state, ROWS, { year: 1997 });
  assert.equal(out.complete, true);
  const st = leagueStandings(state, 1997);
  const rows = Object.values(st.rows);
  assert.equal(rows.length, 29);
  assert.equal(st.totalGames, 1189);
  assert.equal(st.gamesPlayed, 1189, "each scheduled game is counted exactly once");
  assert.ok(rows.every((r) => r.w + r.l === 82), "every club has exactly 82 results");
  assert.equal(rows.reduce((n, r) => n + r.w, 0), 1189);
  assert.equal(rows.reduce((n, r) => n + r.l, 0), 1189);
  assert.equal(rows.reduce((n, r) => n + r.pf, 0), rows.reduce((n, r) => n + r.pa, 0), "points for and against balance across the league");
  assert.equal(st.east.length + st.west.length, 29);
  assert.deepEqual(st.east.map((id) => st.rows[id].confRank), st.east.map((_, i) => i + 1));
  // The table is the engine's: the strongest and weakest rosters of the league should not sit in each other's half (a coin flip would not do this).
  const strength = (id) => rosterCards(ROWS, id, 1997).slice(0, 8).reduce((n, c) => n + overall(c), 0);
  const west = st.west.filter((id) => id !== state.player.teamId);
  const bestWest = [...west].sort((a, b) => strength(b) - strength(a))[0], worstWest = [...west].sort((a, b) => strength(a) - strength(b))[0];
  assert.ok(st.rows[bestWest].w > st.rows[worstWest].w, `${bestWest} ${st.rows[bestWest].w}-${st.rows[bestWest].l} vs ${worstWest} ${st.rows[worstWest].w}-${st.rows[worstWest].l}`);
});

test("a game's result depends only on its slot: advancing in pieces, in any order, gives the identical results", () => {
  const a = run("lg-order-1", 2001), b = run("lg-order-1", 2001);
  advanceLeague(a, ROWS, { year: 2001, throughDay: 2 });
  advanceLeague(a, ROWS, { year: 2001, throughDay: 5, maxGames: 9 });
  advanceLeague(a, ROWS, { year: 2001, throughDay: 5 });
  advanceLeague(b, ROWS, { year: 2001, throughDay: 5 });
  assert.deepEqual(a.league.scores, b.league.scores);
  assert.ok(a.league.scores.some((v) => v > 0));
});

test("advancing is idempotent and survives a save reload: finished games are never simulated again", () => {
  const state = run("lg-reload-1", 2003);
  let calls = 0;
  const counting = (args) => { calls += 1; return coin(args); };
  const first = advanceLeague(state, ROWS, { year: 2003, throughDay: 30, simulate: counting });
  assert.ok(first.simulated > 100 && calls === first.simulated);
  const reloaded = JSON.parse(JSON.stringify(state));
  const again = advanceLeague(reloaded, ROWS, { year: 2003, throughDay: 30, simulate: counting });
  assert.equal(again.simulated, 0, "nothing to play twice");
  assert.equal(calls, first.simulated);
  assert.deepEqual(reloaded.league.scores, state.league.scores);
  const more = advanceLeague(reloaded, ROWS, { year: 2003, throughDay: 60, simulate: counting });
  assert.ok(more.simulated > 0 && calls === first.simulated + more.simulated, "only the new days are played");
});

test("the player's own games are never simulated by the league (their result comes from the season log)", () => {
  const state = run("lg-user-1", 2005);
  const userId = state.player.teamId;
  const asked = [];
  advanceLeague(state, ROWS, { year: 2005, simulate: (args) => { asked.push(args.game); return coin(args); } });
  assert.ok(asked.length > 1000);
  assert.ok(asked.every((g) => g.homeId !== userId && g.awayId !== userId));
  const slots = leagueSchedule(state.seed, 2005).games;
  const userSlots = slots.filter((g) => g.homeId === userId || g.awayId === userId);
  assert.equal(userSlots.length, 82);
  assert.ok(userSlots.every((g) => !state.league.scores[g.ordinal]));
});

test("2005 has the 30-club league (Charlotte joins): every club plays 82, and the table has the conferences the schedule was built with", () => {
  const state = run("lg-2005", 2005);
  fakeUserLog(state, 2005);
  advanceLeague(state, ROWS, { year: 2005, simulate: coin });
  const st = leagueStandings(state, 2005);
  assert.equal(Object.keys(st.rows).length, 30);
  assert.ok(Object.values(st.rows).every((r) => r.w + r.l === 82));
  // 16 + 14: the schedule table keeps the New Orleans line (CHH) in the East, which the real league moved West in 2004. Not modelled; each conference sends 8 either way.
  const layout = leagueLayout(2005);
  assert.equal(st.east.length, layout.eastIds.length);
  assert.equal(st.west.length, layout.westIds.length);
  assert.equal(st.east.length + st.west.length, 30);
});

test("no invented table: with no roster data for the season there is no league, and no results are written", () => {
  const state = run("lg-none-1", 2030);
  const out = advanceLeague(state, ROWS, { year: 2030, simulate: coin });
  assert.equal(out.unavailable, true);
  assert.equal(state.league, undefined);
  const empty = run("lg-none-2", 1999);
  assert.equal(advanceLeague(empty, [], { year: 1999, simulate: coin }).unavailable, true);
});

test("tie-breaks: head-to-head for two teams, then conference record, then point difference, then id; shuffled input gives the same table", () => {
  const t = (id, w, l, confW, confL, diff) => ({ id, w, l, confW, confL, diff });
  const h2h = { AAA: { BBB: 3 }, BBB: { AAA: 1 } };
  // AAA and BBB tie on 50-32: AAA won the season series, so it is ahead even though BBB has the better conference record.
  const two = [t("BBB", 50, 32, 35, 17, 400), t("AAA", 50, 32, 30, 22, 100), t("CCC", 55, 27, 30, 22, 0)];
  assert.deepEqual(rankConference(two, h2h).map((r) => r.id), ["CCC", "AAA", "BBB"]);
  // Three teams tied: no head-to-head, conference record decides, then point difference, then id.
  const three = [t("DDD", 40, 42, 25, 27, 50), t("EEE", 40, 42, 28, 24, -10), t("FFF", 40, 42, 25, 27, 80), t("GGG", 40, 42, 25, 27, 80)];
  const order = rankConference(three, { DDD: { EEE: 4 } }).map((r) => r.id);
  assert.deepEqual(order, ["EEE", "FFF", "GGG", "DDD"]);
  assert.deepEqual(rankConference([...three].reverse(), {}).map((r) => r.id), order);
  assert.deepEqual(rankConference([...three].sort((a, b) => (a.id < b.id ? 1 : -1)), {}).map((r) => r.id), order);
});

test("a season log from before scores were kept still counts wins and losses (old saves)", () => {
  const state = run("lg-old-1", 2002);
  const log = fakeUserLog(state, 2002);
  for (const e of log) { delete e.ptsFor; delete e.ptsAgainst; }
  advanceLeague(state, ROWS, { year: 2002, simulate: coin });
  const st = leagueStandings(state, 2002);
  const me = st.rows[state.player.teamId];
  assert.equal(me.w + me.l, 82);
  assert.equal(me.w, log.filter((e) => e.won).length);
});

test("playoff games in the log never count toward the regular-season table", () => {
  const state = run("lg-po-1", 2002);
  fakeUserLog(state, 2002);
  const before = leagueStandings(state, 2002).rows[state.player.teamId].w;
  state.player.seasonLog.push({ year: 2002, game: 83, opp: state.player.seasonLog[0].opp, home: true, won: true, po: { round: 1, n: 1 }, ptsFor: 100, ptsAgainst: 90 });
  assert.equal(leagueStandings(state, 2002).rows[state.player.teamId].w, before);
});

test("real flow: playing the player's real games moves the league along with them, one schedule day at a time", { timeout: 120000 }, async () => {
  const reborn = createRebornState("lg-real-1", ROWS);
  reborn.player.coachTrust = 80;
  const season = buildSeason(reborn, ROWS);
  assert.equal(season.league, true, "the real schedule turns the league on");
  const out1 = await playGame(reborn, season, ROWS, { onTakeover: takeover });
  const day1 = season.games[0].day;
  const slots = leagueSchedule(reborn.seed, season.year).games;
  const played = out1.reborn.league.scores.map((v, i) => (v ? slots[i] : null)).filter(Boolean);
  assert.ok(played.length > 0 && played.every((g) => g.day <= day1), "nothing from the future is played");
  assert.ok(slots.filter((g) => g.day <= day1 && g.homeId !== reborn.player.teamId && g.awayId !== reborn.player.teamId).every((g) => out1.reborn.league.scores[g.ordinal]), "every other game up to that day is");
  assert.ok(Number.isFinite(out1.reborn.player.seasonLog[0].ptsFor) && Number.isFinite(out1.reborn.player.seasonLog[0].ptsAgainst), "the log keeps the score");
  const out2 = await playGame(out1.reborn, season, ROWS, { onTakeover: takeover });
  assert.ok(out2.reborn.league.scores.filter(Boolean).length > out1.reborn.league.scores.filter(Boolean).length);
  const st = leagueStandings(out2.reborn, season.year);
  const me = st.rows[reborn.player.teamId];
  assert.equal(me.w + me.l, 2);
  assert.equal(me.w, out2.reborn.player.seasonLog.filter((e) => e.won).length);
  // a short test schedule (the games override) does not drag the league along
  const short = buildSeason(reborn, ROWS, { games: season.games.slice(0, 2) });
  assert.equal(short.league, undefined);
});

test("completeLeague catches a save up in slices (a save that never advanced the league), and ends complete", async () => {
  const state = run("lg-catchup-1", 1999);
  let slices = 0;
  const r = await completeLeague(state, ROWS, { year: 1999, slice: 400, simulate: coin, onProgress: () => { slices += 1; } });
  assert.equal(r.complete, true);
  assert.ok(slices >= 2, `done in ${slices} slices, handing control back between them`);
  assert.equal(state.league.scores.filter(Boolean).length, 1189 - 82);
});

test("simLeagueGame is a real, repeatable GameSim game: same slot, same score; the score is a basketball score", () => {
  const cards = (id) => rosterCards(ROWS, id, 2009);
  const game = { ordinal: 7, homeId: "BOS", awayId: "LAL" };
  const a = simLeagueGame({ cards, game, seed: "x", year: 2009 }), b = simLeagueGame({ cards, game, seed: "x", year: 2009 });
  assert.deepEqual([a.home, a.away], [b.home, b.away]);
  assert.ok(a.home > 60 && a.away > 60 && a.home !== a.away);
});
