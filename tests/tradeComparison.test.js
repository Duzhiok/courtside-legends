import test from "node:test";
import assert from "node:assert/strict";
import { buildTradeComparison, renderTradeComparisonHtml } from "../js/engine/tradeComparison.js";

function player(id, ovr, salary = 100) {
  return { id, name: id, ovr2k: ovr, ratingSource: "anchor", salary };
}

function seasonFixture() {
  return {
    year: 1995,
    userTeamId: "USER",
    teams: {
      USER: { players: [player("star", 86, 200), player("bench", 70, 60)] },
    },
    tradeProposals: [
      {
        fromTeamId: "CPU",
        fromTeamName: "对手",
        giveIds: ["star"],
        receivePlayers: [player("incoming", 83, 150)],
        offerPicks: [{ year: 1996, round: 1 }],
      },
    ],
    freeAgents: [player("fa-good", 75, 90), player("fa-cheap", 68, 40)],
  };
}

const helpers = {
  salaryOf: (p) => p.salary,
  overallOf: (p) => p.ovr2k,
};

test("comparison includes keep, an existing inbound trade offer, and best cut-and-sign option", () => {
  const st = seasonFixture();
  const comparison = buildTradeComparison(st, "star", helpers);
  assert.equal(comparison.keep.salaryDelta, 0);
  assert.equal(comparison.trade.partnerTeamName, "对手");
  assert.equal(comparison.trade.ovrDelta, 83 - 86);
  assert.ok(comparison.trade.pickValue > 0);
  assert.equal(comparison.trade.netValueDelta, comparison.trade.ovrDelta + comparison.trade.pickValue);
  assert.match(renderTradeComparisonHtml(comparison), /综合价值变化/);
  assert.equal(comparison.cutSign.freeAgentName, "fa-good");
});

test("player with no inbound proposal gets an explicit no-offer message instead of a fabricated trade", () => {
  const st = seasonFixture();
  const comparison = buildTradeComparison(st, "bench", helpers);
  assert.equal(comparison.trade, null);
  const html = renderTradeComparisonHtml(comparison);
  assert.match(html, /没有收到主动交易请求/);
});

test("comparison never mutates roster, free agents, or proposals", () => {
  const st = seasonFixture();
  buildTradeComparison(st, "star", helpers);
  assert.equal(st.teams.USER.players.length, 2);
  assert.equal(st.freeAgents.length, 2);
  assert.equal(st.tradeProposals.length, 1);
});
