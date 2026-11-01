import assert from "node:assert/strict";
import test from "node:test";
import { STAR_COUNT, emptyRewards, foldBatch, settleGame } from "../js/career/gameRewards.js";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { gameScore } from "../js/engine/matchExplain.js";
import { GameSim } from "../js/engine/sim.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const realTeam = (code, season) => ({
  name: code,
  players: ROWS.filter((r) => r.team === code && r.season === season).map(seasonToCard).sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 10),
});
/** A REAL fast-forwarded game between real historical rosters (synthetic cards play 0-0 games). */
function realGame(youSide = "home") {
  let end = null;
  const sim = new GameSim({ home: realTeam("DEN", 2023), away: realTeam("BOS", 2023), youSide, injuries: false, speed: 3, onEvent: () => {}, onTick: () => {}, onEnd: (snap) => { end = snap; } });
  return sim.runFast() || end || sim.snapshot();
}

const player = (id, stats) => ({ id, name: `P-${id}`, stats });
/** Hand-built snapshot: rules are tested on numbers we can check by eye. */
const snapshot = ({ home, away, score = { home: 100, away: 90 } }) => ({
  score,
  home: { name: "Home Club", roster: home },
  away: { name: "Away Club", roster: away },
});

test("settleGame reads the game from the user's side, home or away", () => {
  const snap = snapshot({ home: [player("h", { min: 30, pts: 20 })], away: [player("a", { min: 30, pts: 18 })], score: { home: 100, away: 90 } });
  const home = settleGame(snap, "home");
  assert.deepEqual([home.won, home.tied, home.margin, home.score, home.opponentName], [true, false, 10, { you: 100, opp: 90 }, "Away Club"]);
  const away = settleGame(snap, "away");
  assert.deepEqual([away.won, away.margin, away.score, away.teamName, away.opponentName], [false, -10, { you: 90, opp: 100 }, "Away Club", "Home Club"]);
  assert.equal(away.stars[0].id, "a", "the stars are MY players, not the opponent's");
});

test("a tie is neither a win nor a loss", () => {
  const report = settleGame(snapshot({ home: [], away: [], score: { home: 88, away: 88 } }), "home");
  assert.deepEqual([report.won, report.tied, report.margin], [false, true, 0]);
});

test("stars: top three of MY rotation by box-score night, best first, ties broken by points", () => {
  const roster = [
    player("scorer", { min: 36, pts: 30, fgm: 11, fga: 22, reb: 4, ast: 3 }),
    player("floor-general", { min: 34, pts: 0, fgm: 0, fga: 3, reb: 2, ast: 6, tov: 0 }),
    player("glue", { min: 28, pts: 12, fgm: 5, fga: 9, reb: 9, ast: 2, stl: 2 }),
    player("bench", { min: 12, pts: 4, fgm: 2, fga: 5 }),
  ];
  const report = settleGame(snapshot({ home: roster, away: [] }), "home");
  assert.equal(report.stars.length, STAR_COUNT);
  const expected = [...roster].sort((a, b) => gameScore(b.stats) - gameScore(a.stats)).slice(0, 3).map((p) => p.id);
  assert.deepEqual(report.stars.map((s) => s.id), expected);
  assert.ok(report.stars[0].score >= report.stars[1].score && report.stars[1].score >= report.stars[2].score);
  assert.equal(report.lines.length, 4, "`lines` keeps the whole rotation for batch folding");
});

test("a player who never touched the floor is not in the lines; a 20-second scorer (0 rounded minutes) is", () => {
  const roster = [
    player("dnp", { min: 0 }),
    player("cameo", { min: 0, pts: 2, fgm: 1, fga: 1 }),
    player("starter", { min: 30, pts: 10 }),
  ];
  const ids = settleGame(snapshot({ home: roster, away: [] }), "home").lines.map((l) => l.id).sort();
  assert.deepEqual(ids, ["cameo", "starter"]);
});

test("unusable snapshots give null, never a half-built report", () => {
  assert.equal(settleGame(null, "home"), null);
  assert.equal(settleGame({}, "home"), null);
  assert.equal(settleGame({ score: { home: 1, away: 2 }, home: { name: "x" }, away: { name: "y" } }, "home"), null, "no roster -> null");
});

test("the reward slots exist, empty, and are a fresh object each time (C2-C6 fill them)", () => {
  const report = settleGame(snapshot({ home: [player("h", { min: 20, pts: 5 })], away: [] }), "home");
  assert.deepEqual(report.rewards, emptyRewards());
  assert.deepEqual(Object.keys(report.rewards).sort(), ["coachXp", "goal", "highlights", "insights", "playerXp"]);
  assert.notEqual(emptyRewards().highlights, emptyRewards().highlights);
});

test("foldBatch counts the record and the point differential", () => {
  const win = (margin) => ({ won: true, tied: false, margin, score: { you: 100 + margin, opp: 100 }, opponentName: "O", lines: [] });
  const loss = (margin) => ({ won: false, tied: false, margin: -margin, score: { you: 100, opp: 100 + margin }, opponentName: "O", lines: [] });
  const tie = { won: false, tied: true, margin: 0, score: { you: 90, opp: 90 }, opponentName: "O", lines: [] };
  const batch = foldBatch([win(10), win(4), loss(7), tie, null]);
  assert.deepEqual([batch.games, batch.wins, batch.losses, batch.pointDiff], [4, 2, 1, 7], "the tie is a game but neither W nor L; null is skipped");
});

test("foldBatch ranks by TOTAL contribution: one huge night doesn't outrank a month of solid ones", () => {
  const night = (lines) => ({ won: true, tied: false, margin: 5, score: { you: 100, opp: 95 }, opponentName: "O", lines });
  const solid = { id: "steady", name: "Steady", min: 32, pts: 22, reb: 5, ast: 5, stl: 0, blk: 0, tov: 2, score: 16 };
  const fluke = { id: "fluke", name: "Fluke", min: 10, pts: 40, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, score: 38 };
  const batch = foldBatch([night([solid, fluke]), night([solid]), night([solid]), night([solid])]);
  assert.equal(batch.leaders[0].id, "steady", "4 x 16 = 64 beats 1 x 38");
  assert.equal(batch.best.id, "fluke", "...but the single best night is still the fluke");
  assert.deepEqual([batch.leaders[0].games, batch.leaders[0].ppg], [4, 22], "averages are over games PLAYED");
  assert.equal(batch.best.opponentName, "O");
  assert.deepEqual(batch.best.game, { you: 100, opp: 95 });
});

test("foldBatch of nothing is an empty, safe summary", () => {
  assert.deepEqual(foldBatch([]), { games: 0, wins: 0, losses: 0, pointDiff: 0, leaders: [], best: null });
  assert.equal(foldBatch(undefined).games, 0);
});

test("REAL engine: a real game settles into numbers that match its box score (either side)", () => {
  for (const side of ["home", "away"]) {
    const snap = realGame(side);
    const report = settleGame(snap, side);
    // Guard against a vacuous pass: a 0-0 game with empty rosters would satisfy every equality below.
    assert.ok(report.score.you > 50 && report.score.opp > 50, `a real game scores points (${report.score.you}-${report.score.opp})`);
    assert.ok(report.lines.length >= 8, `a real rotation played (${report.lines.length})`);
    assert.equal(report.score.you, snap.score[side]);
    assert.equal(report.margin, report.score.you - report.score.opp);
    assert.equal(report.won, report.score.you > report.score.opp);
    assert.equal(report.teamName, side === "home" ? "DEN" : "BOS");
    assert.equal(report.lines.reduce((sum, line) => sum + line.pts, 0), report.score.you, "the player lines add up to the team's score");
    assert.equal(report.stars.length, STAR_COUNT);
    assert.deepEqual(report.stars, report.lines.slice(0, STAR_COUNT));
    assert.ok(report.stars.every((star) => Number.isFinite(star.score) && star.min > 0));
  }
});

test("REAL engine: folding a run of real games keeps the books straight", () => {
  const reports = Array.from({ length: 12 }, (_, i) => settleGame(realGame(i % 2 ? "away" : "home"), i % 2 ? "away" : "home"));
  const batch = foldBatch(reports);
  assert.equal(batch.games, 12);
  assert.equal(batch.wins + batch.losses, reports.filter((r) => !r.tied).length, "every decided game is a W or an L");
  assert.equal(batch.pointDiff, reports.reduce((sum, r) => sum + r.margin, 0));
  assert.equal(batch.leaders.length, STAR_COUNT);
  assert.ok(batch.leaders[0].total >= batch.leaders[1].total && batch.leaders[1].total >= batch.leaders[2].total);
  assert.ok(batch.leaders.every((leader) => leader.games >= 1 && leader.games <= 12 && leader.ppg > 0));
  assert.ok(batch.best.score >= Math.max(...reports.flatMap((r) => r.lines.map((l) => l.score))) - 1e-9, "best night really is the best of all 12");
});

test("the card shows the CARD name, not the in-game disambiguation tag ('主·Otto Porter Jr.')", () => {
  const tagged = { id: "op", name: "**·Otto Porter Jr.", cardName: "Otto Porter Jr.", stats: { min: 30, pts: 20, reb: 5, ast: 2, fga: 12, fgm: 8 } };
  const report = settleGame(snapshot({ home: [tagged], away: [player("x", { min: 30, pts: 10 })] }), "home");
  assert.equal(report.stars[0].name, "Otto Porter Jr.");
  const batch = foldBatch([report, report]);
  assert.equal(batch.leaders[0].name, "Otto Porter Jr.");
  assert.equal(batch.best.name, "Otto Porter Jr.");
});

test("REAL engine: the same player on both teams gets renamed in-game, but never on the card", () => {
  const jokic = (season) => seasonToCard(ROWS.find((r) => r.bref === "jokicni01" && r.season === season));
  const home = realTeam("DEN", 2023);
  const away = realTeam("BOS", 2023);
  away.players = [jokic(2019), ...away.players.slice(0, 9)];
  const cardNames = new Set(home.players.map((p) => p.name));
  let end = null;
  const sim = new GameSim({ home, away, youSide: "home", injuries: false, speed: 3, onEvent: () => {}, onTick: () => {}, onEnd: (s) => { end = s; } });
  const snap = sim.runFast() || end || sim.snapshot();
  // Precondition: the engine really did tag someone, or this test proves nothing.
  assert.ok(snap.home.roster.some((p) => p.name !== (p.cardName || p.name)), "expected an in-game rename");
  const report = settleGame(snap, "home");
  assert.ok(report.lines.length > 0);
  for (const line of report.lines) assert.ok(cardNames.has(line.name), `${line.name} is not a card name`);
});
