// A rolled-over Reborn season is a NEW season: its own year, its own game ids, and it does not open already finished.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeason, playGame } from "../js/reborn/season.js";
import { createRebornState } from "../js/reborn/identity.js";
import { rolloverSeason } from "../js/reborn/contract.js";
import { gameEvidenceId } from "../js/reborn/promiseEvidence.js";
import { EXCHANGE_RULES, evaluateExchangeCandidate, respectFromRival } from "../js/collectibles/jerseyEligibility.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const takeover = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });

test("a new run's first season is unchanged (startYear + 1), and an old save with no player.seasonYear falls back to it", () => {
  const reborn = createRebornState("year-fresh-1", ROWS);
  assert.equal(buildSeason(reborn, ROWS).year, reborn.startYear + 1);
  assert.equal(buildSeason(reborn, ROWS).year, reborn.player.seasonYear);
  const old = structuredClone(reborn);
  delete old.player.seasonYear;
  assert.equal(buildSeason(old, ROWS).year, old.startYear + 1);
  assert.deepEqual(buildSeason(old, ROWS).games, buildSeason(reborn, ROWS).games, "same schedule either way");
});

test("after rolloverSeason the next season carries the next year and its own schedule", () => {
  const reborn = createRebornState("year-roll-1", ROWS);
  const first = buildSeason(reborn, ROWS);
  const rolled = rolloverSeason(reborn, { year: first.year, players: ROWS }).reborn;
  const second = buildSeason(rolled, ROWS);
  assert.equal(second.year, first.year + 1);
  assert.equal(second.index, 0);
  assert.notEqual(gameEvidenceId(reborn.seed, first.year, 1), gameEvidenceId(rolled.seed, second.year, 1), "game ids no longer repeat");
});

test("the resume count (log entries of THIS year) is 0 for the new season, not the finished one's 82", () => {
  const reborn = createRebornState("year-resume-1", ROWS);
  const first = buildSeason(reborn, ROWS);
  reborn.player.seasonLog = Array.from({ length: 82 }, (_, i) => ({ year: first.year, game: i + 1 }));
  const rolled = rolloverSeason(reborn, { year: first.year, players: ROWS }).reborn;
  const second = buildSeason(rolled, ROWS);
  // exactly what rebornView.rebuildSeason does
  const resumed = (rolled.player.seasonLog || []).filter((g) => g.year === second.year).length;
  assert.equal(resumed, 0, "the second season starts at game 1");
  assert.equal((rolled.player.seasonLog || []).filter((g) => g.year === first.year).length, 82, "the first season's log is untouched");
});

test("a real game in the second season is settled under the second year and its own id", async () => {
  const reborn = createRebornState("year-play-1", ROWS);
  reborn.player.coachTrust = 80;
  const first = buildSeason(reborn, ROWS);
  const rolled = rolloverSeason(reborn, { year: first.year, players: ROWS }).reborn;
  const second = buildSeason(rolled, ROWS, { games: buildSeason(rolled, ROWS).games.slice(0, 1) });
  const out = await playGame(rolled, second, ROWS, { onTakeover: takeover });
  assert.equal(out.report.year, first.year + 1);
  assert.match(out.report.gameId, new RegExp(`:${first.year + 1}:1$`));
  assert.ok(out.reborn.player.seasonLog.every((g) => g.year === first.year + 1));
});

test("jersey respect bar: three meetings and one close game earn an offer, three plain meetings do not", () => {
  assert.equal(EXCHANGE_RULES.MIN_RESPECT, 60);
  const game = { id: "g1", settled: true, participants: ["x"], directMatchups: [{ playerId: "you", opponentId: "x" }], rivalIds: [], isChampionship: false };
  const meet = (margins) => ({ bref: "x", games: margins.map((margin) => ({ margin, you: { gs: 1 }, rival: { gs: 1 } })) });
  const verdict = (rival) => evaluateExchangeCandidate({ opponent: { bref: "x" }, game, respect: respectFromRival(rival), meetings: rival.games.length });
  assert.equal(respectFromRival(meet([20, 20, 3])), 60);
  assert.equal(verdict(meet([20, 20, 3])).eligible, true);
  assert.equal(respectFromRival(meet([20, 20, 20])), 54);
  assert.equal(verdict(meet([20, 20, 20])).eligible, false);
  assert.equal(verdict(meet([20])).reason, "TOO_FEW_MEETINGS", "meetings are still real evidence: one game is never enough");
});
