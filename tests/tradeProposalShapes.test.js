import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptTradeProposal,
  counterTradeProposal,
  declineTradeProposal,
  generateTradeProposals,
} from "../js/engine/tradeProposals.js";
import { teamDraftAssets } from "../js/engine/seasonMarket.js";

// New proposal shapes: picks-only (rebuilding club takes an expensive contract for
// picks alone) and consolidation (one better CPU player for two user players).
// Fixture shape mirrors tests/tradeNegotiation.test.js.

function player(id, ovr, salary = 100) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: ovr < 80 ? 22 : 28 };
}

function seasonFixture(userPlayers, cpuPlayers, stats = {}) {
  return {
    year: 1994,
    dayIndex: 20,
    phase: "regular",
    userTeamId: "USER",
    teams: {
      USER: { name: "You", players: userPlayers },
      CPU: { name: "Rivals", players: cpuPlayers },
    },
    playerSeason: stats,
    tradeLog: [],
    draftAssets: [],
  };
}

const CJK = /[\u3400-\u9fff]/;
const STAR_STATS = { "USER:star": { stats: { gp: 10, pts: 220, plusMinus: 30 } } };

function rebuildingCpu() {
  // Average OVR ~70: rebuilding.
  return [player("cpu-star", 83, 150), player("prospect", 70, 35), ...Array.from({ length: 7 }, (_, i) => player(`c${i}`, 68, 45))];
}

test("picks-only: rebuilding club offers picks alone for an expensive target", () => {
  const user = [player("star", 86, 160), ...Array.from({ length: 8 }, (_, i) => player(`u${i}`, 70, 50))];
  const [proposal] = generateTradeProposals(seasonFixture(user, rebuildingCpu(), STAR_STATS), 3, "en");
  assert.ok(proposal, "a proposal is generated");
  assert.deepEqual(proposal.wantIds, []);
  assert.deepEqual(proposal.receivePlayers, []);
  assert.ok(proposal.offerPicks.length >= 2, "picks-only carries at least the base pick count");
  assert.match(proposal.reason, /for picks alone/);
  assert.doesNotMatch(proposal.reason, CJK);
});

test("picks-only: no picks-only offer from a non-rebuilding club", () => {
  const user = [player("star", 86, 160), ...Array.from({ length: 8 }, (_, i) => player(`u${i}`, 70, 50))];
  const cpu = Array.from({ length: 9 }, (_, i) => player(`m${i}`, 80, 100));
  const [proposal] = generateTradeProposals(seasonFixture(user, cpu, STAR_STATS), 3, "en");
  assert.ok(proposal, "a proposal is generated");
  assert.ok(proposal.wantIds.length >= 1, "a player comes back");
});

test("picks-only: no picks-only offer for a cheap target even from a rebuilding club", () => {
  const user = [player("cheap", 70, 50), ...Array.from({ length: 8 }, (_, i) => player(`u${i}`, 70, 50))];
  const stats = { "USER:cheap": { stats: { gp: 10, pts: 220, plusMinus: 30 } } };
  const [proposal] = generateTradeProposals(seasonFixture(user, rebuildingCpu(), stats), 3, "en");
  assert.ok(proposal, "a proposal is generated");
  assert.ok(proposal.wantIds.length >= 1, "a player comes back");
});

test("consolidation: one better CPU player for target plus bench when the salary dump is fair", () => {
  const user = [
    player("target", 70, 160),
    player("bench", 60, 100),
    ...Array.from({ length: 7 }, (_, i) => player(`f${i}`, 68, 50)),
  ];
  const st = seasonFixture(user, Array.from({ length: 9 }, (_, i) => player(`m${i}`, 78, 150)), {
    "USER:target": { stats: { gp: 10, pts: 220, plusMinus: 30 } },
  });
  st.teams.USER.starterIds = user.slice(2).map((p) => p.id);
  const [proposal] = generateTradeProposals(st, 3, "en");
  assert.ok(proposal, "a proposal is generated");
  assert.deepEqual(proposal.giveIds, ["target", "bench"]);
  assert.equal(proposal.wantIds.length, 1);
});

test("consolidation: the second-player ask is dropped when the totals are not fair", () => {
  const user = [
    player("target", 70, 160),
    player("bench", 60, 40),
    ...Array.from({ length: 7 }, (_, i) => player(`f${i}`, 68, 50)),
  ];
  const st = seasonFixture(user, Array.from({ length: 9 }, (_, i) => player(`m${i}`, 78, 150)), {
    "USER:target": { stats: { gp: 10, pts: 220, plusMinus: 30 } },
  });
  st.teams.USER.starterIds = user.slice(2).map((p) => p.id);
  const [proposal] = generateTradeProposals(st, 3, "en");
  assert.ok(proposal, "a proposal is generated");
  assert.deepEqual(proposal.giveIds, ["target"]);
});

test("picks-only: declining remembers the picks shape, and a player offer may still follow", () => {
  const user = [player("star", 86, 160), ...Array.from({ length: 8 }, (_, i) => player(`u${i}`, 70, 50))];
  const st = seasonFixture(user, rebuildingCpu(), STAR_STATS);
  const [proposal] = generateTradeProposals(st, 3, "en");
  assert.deepEqual(proposal.wantIds, []);
  const declined = declineTradeProposal(st, proposal.id, "en");
  assert.equal(declined.ok, true);
  assert.ok(st.declinedTradeSignatures.includes("CPU:star:PICKS"));
  const [next] = generateTradeProposals(st, 3, "en");
  assert.ok(next, "a different shape may still be offered");
  assert.ok(next.wantIds.length >= 1, "the follow-up is a player offer, not the declined picks shape");
});

test("picks-only: accepting moves the player and the picks through the ledger", () => {
  const user = [player("star", 86, 160), ...Array.from({ length: 8 }, (_, i) => player(`u${i}`, 70, 50))];
  const st = seasonFixture(user, rebuildingCpu(), STAR_STATS);
  const [proposal] = generateTradeProposals(st, 3, "en");
  const pickIds = proposal.offerPicks.map((p) => p.id);
  const result = acceptTradeProposal(st, proposal.id, "en");
  assert.equal(result.ok, true);
  assert.equal(st.teams.USER.players.length, 8);
  assert.equal(st.teams.CPU.players.length, 10);
  assert.ok(st.teams.CPU.players.some((p) => p.id === "star"));
  const userPicks = teamDraftAssets(st, "USER").map((p) => p.id);
  for (const id of pickIds) assert.ok(userPicks.includes(id), `user now holds ${id}`);
});

test("picks-only: a round-2 revision stays picks-only and adds a pick", () => {
  const user = [player("star", 86, 160), ...Array.from({ length: 8 }, (_, i) => player(`u${i}`, 70, 50))];
  const st = seasonFixture(user, rebuildingCpu(), STAR_STATS);
  const [proposal] = generateTradeProposals(st, 3, "en");
  const result = counterTradeProposal(st, proposal.id, "en");
  assert.equal(result.ok, true);
  assert.deepEqual(result.proposal.wantIds, []);
  assert.equal(result.proposal.round, 2);
  assert.equal(result.proposal.offerPicks.length, proposal.offerPicks.length + 1);
});

test("player offers: a round-2 revision never morphs into picks-only", () => {
  const user = [player("star", 86, 160), ...Array.from({ length: 8 }, (_, i) => player(`u${i}`, 70, 50))];
  const cpu = Array.from({ length: 9 }, (_, i) => player(`m${i}`, 80, 100));
  const st = seasonFixture(user, cpu, STAR_STATS);
  const [proposal] = generateTradeProposals(st, 3, "en");
  assert.ok(proposal.wantIds.length >= 1);
  const result = counterTradeProposal(st, proposal.id, "en");
  assert.equal(result.ok, true);
  assert.ok(result.proposal.wantIds.length >= 1, "the revision still brings a player");
});
