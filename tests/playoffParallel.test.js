import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard, PLAYERS } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { seededStream } from "../js/core/seededRandom.js";
import { historicalSeason } from "../js/data/historicalSeasons.js";
import {
  advancePlayoffs,
  buildCpuTeamForYear,
  computeAwards,
  createSeason,
  ensureFinals,
  simPlayoffDay,
  simScheduledGame,
  simUserNextPlayoffGame,
  startPlayoffs,
} from "../js/engine/season.js";
import { selectAllTeamByPos } from "../js/engine/allTeam.js";

/**
 * A real user report: "I'm already the East champion and the West hasn't played a game" / "why can the Finals only be
 * simmed as a whole round" / "the Finals MVP isn't on the Finals All-Team and Doncic is the center".
 * One real regular season is played once, then the playoffs are stepped in order.
 */
const YEAR = 2020;
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
if (!PLAYERS.some((p) => p.season === YEAR)) PLAYERS.push(...ROWS.filter((r) => r.season === YEAR).map(seasonToCard));

const real = Math.random;
Math.random = seededStream(11);
const hist = historicalSeason(YEAR);
const meta = hist.teams[0];
const st = createSeason({
  userTeamId: meta.id,
  userTeamName: meta.name,
  userTeam: buildCpuTeamForYear(YEAR, meta, new Set()),
  mode: "historical",
  year: YEAR,
  seed: 11,
});
for (const night of st.schedule) for (const g of night) if (!g.played) simScheduledGame(st, g);
st.awards = computeAwards(st);
startPlayoffs(st);
st.userTeamId = st.playoffs.east.series[0].high.id; // "you" are the East's top seed, so you are always in a series

const seriesOf = (conf) => st.playoffs[conf].series;
const gamesPlayed = (s) => s.winsHigh + s.winsLow;
const userSeries = () => ["east", "west"].flatMap(seriesOf).find((s) => [s.high?.id, s.low?.id].includes(st.userTeamId) && !s.done);

test("season rows keep the card's real position, not the lineup slot a player once filled", () => {
  const sample = Object.values(st.playerSeason).slice(0, 400);
  assert.ok(sample.length > 50);
  for (const row of sample) {
    const live = st.teams[row.teamId]?.players.find((c) => c.id === row.playerId);
    if (live?.pos) assert.equal(row.pos, live.pos, `${row.name}`);
  }
});

test("a game you play is a playoff night for everyone: every other open series plays a game too", () => {
  const mine = userSeries();
  assert.ok(mine, "the user team is in a series");
  const others = ["east", "west"].flatMap(seriesOf).filter((s) => s !== mine && !s.done && !s.high?.bye && !s.low?.bye);
  assert.ok(others.length >= 4);
  simUserNextPlayoffGame(st);
  for (const s of others) assert.equal(gamesPlayed(s), 1, `${s.high.name} vs ${s.low.name} must have played game 1`);
  assert.ok(others.some((s) => s.games?.length === 1 && Number.isFinite(s.games[0].homeScore)), "the box score of each game is logged");
});

test("one call advances BOTH conferences by one round (the West no longer waits for the East)", () => {
  for (let i = 0; i < 3; i++) {
    advancePlayoffs(st);
    const e = st.playoffs.east;
    const w = st.playoffs.west;
    assert.equal(e.round, w.round, `after call ${i + 1} both conferences are in the same round`);
  }
  assert.ok(st.playoffs.east.finalist && st.playoffs.west.finalist, "both conference champions are decided together");
});

test("the Finals is set up but NOT auto-played, so it can be played game by game", () => {
  const f = ensureFinals(st);
  assert.ok(f, "finals exists as soon as both champions are known");
  assert.equal(gamesPlayed(f), 0);
  assert.equal(f.done, false);
  assert.notEqual(st.phase, "done");
  assert.equal(st.playoffs.championId, null);
});

test("stepping the Finals one night at a time ends in a champion, a Finals-only board and a logged series", () => {
  const f = st.playoffs.finals;
  let nights = 0;
  while (!f.done && nights++ < 7) {
    const before = gamesPlayed(f);
    simPlayoffDay(st);
    assert.equal(gamesPlayed(f), before + 1, "exactly one Finals game per night");
  }
  assert.ok(f.done && (f.winsHigh === 4 || f.winsLow === 4));
  assert.equal(f.games.length, gamesPlayed(f), "every game has its score in the log");
  assert.equal(st.phase, "done");
  assert.equal(st.playoffs.championId, f.winnerId);
});

test("Finals MVP is always on the Finals All-Team, both judged on Finals games only", () => {
  const { finalsMvp: mvp, finalsAllTeam: team } = st;
  assert.ok(mvp && team.length === 5);
  assert.ok(team.some((p) => p.id === mvp.id), "the MVP is on the All-Team");
  assert.equal(mvp.teamId, st.playoffs.championId, "the MVP plays for the champion");
  for (const p of team) assert.ok(p.gp >= 1 && p.gp <= 7, `${p.name}: ${p.gp} games is a Finals line, not a season line`);
  assert.equal(team.find((p) => p.id === mvp.id).slot, team.find((p) => p.id === mvp.id).naturalPos, "the MVP sits at his own position");
});

test("selectAllTeamByPos lockId: a must-have player takes his own slot even against better scorers", () => {
  const mk = (id, pos, pts) => ({ id, name: id, pos, teamId: "T", ovr: 80, gp: 7, pts: pts * 7, reb: 0, ast: 0, stl: 0, blk: 0, min: 200, wins: 0, gradeSum: 0 });
  const pool = [mk("g1", "PG", 30), mk("g2", "SG", 28), mk("w", "SF", 27), mk("b1", "PF", 25), mk("c1", "C", 24), mk("c2", "C", 5)];
  const team = selectAllTeamByPos(pool, { lockId: "c2" });
  assert.equal(team.find((p) => p.slot === "C").id, "c2");
  assert.equal(selectAllTeamByPos(pool).find((p) => p.slot === "C").id, "c1");
});

test.after(() => {
  Math.random = real;
});
