import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptTradeProposal,
  declineTradeProposal,
  ensureTradeProposals,
  generateTradeProposals,
} from "../js/engine/tradeProposals.js";

function player(id, ovr, salary = 100) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: ovr < 80 ? 22 : 28 };
}

function seasonFixture() {
  const userPlayers = [player("star", 86, 160), ...Array.from({ length: 7 }, (_, i) => player(`u${i}`, 70, 50))];
  const cpuPlayers = [player("cpu-star", 83, 150), player("prospect", 70, 35), ...Array.from({ length: 7 }, (_, i) => player(`c${i}`, 68, 45))];
  return {
    year: 1994,
    dayIndex: 20,
    phase: "regular",
    userTeamId: "USER",
    teams: {
      USER: { name: "我方", players: userPlayers },
      CPU: { name: "对手", players: cpuPlayers },
    },
    playerSeason: {
      "USER:star": { stats: { gp: 10, pts: 220, plusMinus: 30 } },
    },
    tradeLog: [],
    draftAssets: [],
  };
}

test("strong recent performance creates a deterministic incoming proposal", () => {
  const st = seasonFixture();
  const proposals = generateTradeProposals(st);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].targetName, "star");
  assert.equal(proposals[0].receivePlayers.length >= 1, true);
  assert.equal(proposals[0].offerPicks.length >= 1, true);
  assert.match(proposals[0].reason, /最近表现突出/);
});

test("incoming proposals persist and can be declined", () => {
  const st = seasonFixture();
  const proposals = ensureTradeProposals(st);
  const result = declineTradeProposal(st, proposals[0].id);
  assert.equal(result.ok, true);
  assert.equal(st.tradeProposals.length, 0);
  assert.equal(st.tradeLog.at(-1).type, "trade_declined");
});

test("accepting a proposal moves players and adds future draft assets", () => {
  const st = seasonFixture();
  const proposal = ensureTradeProposals(st)[0];
  const result = acceptTradeProposal(st, proposal.id);
  assert.equal(result.ok, true);
  assert.ok(st.teams.USER.players.some((p) => p.id === proposal.receivePlayers[0].id));
  assert.equal(st.teams.USER.players.some((p) => p.id === "star"), false);
  assert.equal(st.draftAssets.length, proposal.offerPicks.length);
  assert.equal(st.tradeLog.at(-1).proposalId, proposal.id);
});
