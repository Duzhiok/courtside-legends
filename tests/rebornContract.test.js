/**
 * Player Reborn PR5 — season-end contract + rollover. The decision is pure
 * trust thresholds; the rollover is the engine's carriedDeltas. No game
 * results are asserted anywhere here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONTRACT_TRUST,
  seasonSummary,
  contractDecision,
  settleContract,
  nextSeasonCard,
  rolloverSeason,
  describeContract,
} from "../js/reborn/contract.js";
import { createRebornState, buildPlayerCard, REBORN_TEAM_IDS } from "../js/reborn/identity.js";
import { buildSeason, playGame } from "../js/reborn/season.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

function withTrust(seed, trust, log = []) {
  const reborn = createRebornState(seed, ROWS);
  reborn.player.coachTrust = trust;
  reborn.player.seasonLog = log;
  return reborn;
}

const LOG_1997 = [
  { year: 1997, game: 1, opp: "CHI", home: true, min: 20, pts: 8, reb: 3, ast: 2, takeovers: 0, role: "rotation", won: true },
  { year: 1997, game: 2, opp: "LAL", home: false, min: 24, pts: 12, reb: 4, ast: 1, takeovers: 1, role: "rotation", won: false },
  { year: 1996, game: 1, opp: "CHI", home: true, min: 5, pts: 2, reb: 1, ast: 0, takeovers: 0, role: "garbage", won: true },
];

test("the contract follows trust: 50 re-signs, 30 takes the minimum, below is cut", () => {
  assert.equal(CONTRACT_TRUST.resign, 50);
  assert.equal(CONTRACT_TRUST.minimum, 30);
  assert.equal(contractDecision(withTrust("reborn-c-1", 50), 1997).type, "resign");
  assert.equal(contractDecision(withTrust("reborn-c-2", 75), 1997).type, "resign");
  assert.equal(contractDecision(withTrust("reborn-c-3", 49), 1997).type, "minimum");
  assert.equal(contractDecision(withTrust("reborn-c-4", 30), 1997).type, "minimum");
  assert.equal(contractDecision(withTrust("reborn-c-5", 29), 1997).type, "cut");
  assert.equal(contractDecision(withTrust("reborn-c-6", 0), 1997).type, "cut");
});

test("the season summary aggregates one year only", () => {
  const summary = seasonSummary(withTrust("reborn-c-7", 60, LOG_1997), 1997);
  assert.deepEqual(summary, {
    year: 1997, games: 2, wins: 1, avgMin: 22, avgPts: 10, takeovers: 1,
  });
});

test("settling a contract records it and never mutates the input", () => {
  const reborn = withTrust("reborn-c-8", 62, LOG_1997);
  const { reborn: next, outcome } = settleContract(reborn, { year: 1997 });
  assert.equal(outcome.type, "resign");
  assert.equal(next.player.contractStatus, "resign");
  assert.equal(next.player.freeAgency, undefined);
  assert.equal(reborn.player.contractStatus, "camp", "input untouched");
  const event = next.timeline.events.at(-1);
  assert.deepEqual(event, {
    year: 1997, event: "contract", outcome: "resign", trust: 62, games: 2, avgMin: 22,
  });
});

test("being cut is not a Game Over — it is a tryout", () => {
  const reborn = withTrust("reborn-c-9", 12, LOG_1997);
  const { reborn: next, outcome } = settleContract(reborn, { year: 1997 });
  assert.equal(outcome.type, "cut");
  assert.equal(next.player.contractStatus, "cut");
  assert.deepEqual(next.player.freeAgency, { status: "tryout", sinceYear: 1997 });
  assert.equal(describeContract(outcome, "zh").includes("不是结束"), true);
  assert.equal(describeContract(outcome, "en").includes("not the end"), true);
});

test("the rollover carries half the growth and keeps the timeline going", () => {
  const reborn = withTrust("reborn-c-10", 62, LOG_1997);
  reborn.player.growth = {
    [reborn.identity.bref]: { year: 1997, xp: 40, levels: 1, deltas: { three: 3, mid: 2 } },
  };
  const { reborn: settled } = settleContract(reborn, { year: 1997 });
  const { reborn: next, year, card } = rolloverSeason(settled, { year: 1997, players: ROWS });
  assert.equal(year, 1998);
  assert.equal(next.player.seasonYear, 1998);
  assert.equal(next.player.contractStatus, "resign", "same team, same deal");
  assert.equal(next.player.coachTrust, 62, "the coach's trust carries");
  // carriedDeltas: 50% rounded half up.
  assert.deepEqual(next.player.growth[reborn.identity.bref], {
    year: 1998, xp: 0, levels: 0, deltas: { three: 2, mid: 1 },
  });
  assert.equal(next.player.training, undefined, "a new season picks a new focus");
  assert.equal(next.timeline.events.at(-1).event, "season_start");
  assert.equal(next.timeline.events.at(-1).year, 1998);
  assert.ok(card, "the next season's card is built");
  const base = buildPlayerCard(reborn.identity, ROWS, { season: 1998 });
  assert.equal(card.three, base.three + 2, "the carried growth is on the card");
  assert.equal(card.mid, base.mid + 1);
});

test("a cut player starts the next season over at camp", () => {
  const reborn = withTrust("reborn-c-11", 12, LOG_1997);
  const { reborn: settled } = settleContract(reborn, { year: 1997 });
  const { reborn: next } = rolloverSeason(settled, { year: 1997, players: ROWS });
  assert.equal(next.player.coachTrust, 25, "a new team, a new coach, camp trust");
  assert.equal(next.player.contractStatus, "camp");
  assert.equal(next.player.rotationRole, "garbage");
  assert.deepEqual(next.player.freeAgency, { status: "tryout", sinceYear: 1997 });
});

test("the next season's card is the new year's real card — or the last real one", () => {
  const reborn = createRebornState("reborn-c-12", ROWS);
  const card1998 = nextSeasonCard(reborn, { year: 1998, players: ROWS });
  const row1998 = ROWS.find((r) => r.bref === reborn.identity.bref && r.season === 1998);
  if (row1998) {
    assert.equal(card1998.season, 1998);
  } else {
    // No 1998 row: the fallback is the 1997 card, never a throw.
    assert.equal(card1998.season, 1997);
  }
  // A fictional identity has no real ladder — the same generated card carries.
  const fictional = createRebornState("reborn-train-1", ROWS);
  assert.equal(fictional.identity.kind, "fictional");
  const ficCard = nextSeasonCard(fictional, { year: 1998, players: ROWS });
  assert.equal(ficCard.name, fictional.identity.name);
});

test("training pays trust once a week, on the week's last game", async () => {
  const teamOf = (reborn) => REBORN_TEAM_IDS.filter((t) => t !== reborn.player.teamId).slice(0, 4);
  async function fourGames(trainingDone) {
    const reborn = createRebornState("reborn-contract-train", ROWS);
    reborn.player.coachTrust = 10; // DNP: zero minutes, zero performance delta
    const season = buildSeason(reborn, ROWS, {
      games: teamOf(reborn).map((o, i) => ({ homeId: reborn.player.teamId, awayId: o, day: i + 1, played: false })),
    });
    let cur = reborn;
    const deltas = [];
    for (let i = 0; i < 4; i++) {
      const out = await playGame(cur, season, ROWS, { trainingDone });
      deltas.push(out.report.trustDelta);
      cur = out.reborn;
    }
    return { deltas, trust: cur.player.coachTrust };
  }
  assert.deepEqual((await fourGames(false)).deltas, [0, 0, 0, 0]);
  const trained = await fourGames(true);
  assert.deepEqual(trained.deltas, [0, 0, 0, 4], "the DNP weekly bonus lands once, not four times");
  assert.equal(trained.trust, 14);
});

test("the contract reads on the card, zh + en", () => {
  const outcome = { type: "resign", trust: 62, year: 1997, games: 82, avgMin: 18.5 };
  assert.match(describeContract(outcome, "zh"), /续约/);
  assert.match(describeContract(outcome, "en"), /Re-signed/);
  assert.equal(describeContract(null, "zh"), null);
});
