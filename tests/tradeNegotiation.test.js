import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptTradeProposal,
  counterTradeProposal,
  declineTradeProposal,
  ensureTradeProposals,
  generateTradeProposals,
  tradeRosterOk,
} from "../js/engine/tradeProposals.js";
import { teamDraftAssets } from "../js/engine/seasonMarket.js";

// User decision (2026-11-01): two-round negotiation where round 2 REPLACES round 1,
// plus offers that respect roster size (8–15 both sides) and CPU asks (an extra
// user player or a user pick) when the package clearly overpays.

function player(id, ovr, salary = 100) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: ovr < 80 ? 22 : 28 };
}

function seasonFixture(userExtra = 0) {
  const userPlayers = [player("star", 86, 160), ...Array.from({ length: 7 + userExtra }, (_, i) => player(`u${i}`, 70, 50))];
  // CPU averages ~79 (mid, not rebuilding) on purpose: with a rebuilding club this
  // expensive target would now take the picks-only shape instead of the player offer
  // these tests pin down; that shape is covered in tests/tradeProposalShapes.test.js.
  const cpuPlayers = [player("cpu-star", 83, 150), player("prospect", 70, 35), ...Array.from({ length: 7 }, (_, i) => player(`c${i}`, 79, 45))];
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

const pkgOf = (p) => [p.giveIds.join(","), p.wantIds.join(","), p.offerPicks.map((x) => x.id).join(","), (p.askPickIds || []).join(",")].join("|");

test("tradeRosterOk: both clubs must land within 8–15", () => {
  assert.equal(tradeRosterOk(10, 10, 1, 1), true);
  assert.equal(tradeRosterOk(8, 8, 1, 1), true);
  assert.equal(tradeRosterOk(15, 10, 1, 2), false, "user would overflow");
  assert.equal(tradeRosterOk(8, 10, 2, 1), false, "user would fall short");
  assert.equal(tradeRosterOk(10, 15, 2, 1), false, "CPU would overflow");
  assert.equal(tradeRosterOk(10, 8, 1, 3), false, "CPU would fall short");
});

test("a 15-man roster is not offered a 2-for-1 that would overflow: the prospect is dropped", () => {
  const st = seasonFixture(7); // star + 14 = 15 players
  const [proposal] = generateTradeProposals(st);
  assert.ok(proposal, "a valid 1-for-1 offer is still made");
  assert.equal(proposal.receivePlayers.length, 1, "the prospect sweetener is dropped, not dangled");
  assert.equal(st.teams.USER.players.length - 1 + proposal.receivePlayers.length, 15);
});

test("a clearly overpaying package asks for a user pick, and accepting moves it", () => {
  const st = seasonFixture();
  const proposal = ensureTradeProposals(st)[0];
  assert.equal(proposal.askPickIds.length, 1, "CPU asks for one user pick on top of the target");
  const askedPick = proposal.askPickIds[0];
  assert.ok(teamDraftAssets(st, "USER").some((p) => p.id === askedPick), "the asked pick is really the user's");
  const result = acceptTradeProposal(st, proposal.id);
  assert.equal(result.ok, true);
  assert.ok(teamDraftAssets(st, "CPU").some((p) => p.id === askedPick), "the asked pick is now the CPU's");
  assert.ok(!teamDraftAssets(st, "USER").some((p) => p.id === askedPick), "the asked pick is gone from the user");
  assert.match(result.message, /送出/);
});

test("counter replaces round 1 with round 2, no round 3, and neither shape resurrects", () => {
  const st = seasonFixture();
  const first = ensureTradeProposals(st)[0];
  const firstPkg = pkgOf(first);
  const countered = counterTradeProposal(st, first.id);
  assert.equal(countered.ok, true);
  assert.equal(st.tradeProposals.length, 1, "round 2 replaces round 1 in the same slot");
  assert.equal(countered.proposal.id, first.id, "same id: round 2 IS the offer now");
  assert.equal(countered.proposal.round, 2);
  assert.notEqual(pkgOf(countered.proposal), firstPkg, "the revision really changes the package");
  assert.equal(counterTradeProposal(st, first.id).ok, false, "no third round");
  assert.equal(declineTradeProposal(st, first.id).ok, true);
  assert.equal(st.tradeProposals.length, 0);
  const refreshed = generateTradeProposals(st);
  assert.ok(
    !refreshed.some((p) => p.fromTeamId === first.fromTeamId && (p.wantIds[0] === first.wantIds[0] || p.wantIds[0] === countered.proposal.wantIds[0])),
    "neither the round-1 nor the round-2 shape comes back on refresh"
  );
});

test("countering is deterministic: identical fixtures counter identically", () => {
  const rev = () => {
    const st = seasonFixture();
    const first = ensureTradeProposals(st)[0];
    return pkgOf(counterTradeProposal(st, first.id).proposal);
  };
  assert.equal(rev(), rev());
});
