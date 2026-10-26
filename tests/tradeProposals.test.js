import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptTradeProposal,
  declineTradeProposal,
  ensureTradeProposals,
  generateTradeProposals,
} from "../js/engine/tradeProposals.js";
import { SEASON_APRON, teamDraftAssets, teamPayroll } from "../js/engine/seasonMarket.js";

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
  const mine = new Set(teamDraftAssets(st, "USER").map((p) => p.id));
  assert.ok(proposal.offerPicks.length >= 1);
  for (const pick of proposal.offerPicks) assert.ok(mine.has(pick.id), `${pick.id} is now mine`);
  assert.equal(st.tradeLog.at(-1).proposalId, proposal.id);
});

// Regression for user report #14: "我都拒绝报价了，怎么刷新报价后又出现相同的报价？". generateTradeProposals
// is a pure function of (year, dayIndex, roster) -- without a persistent "already said no to this
// exact deal" memory, clicking refresh (which re-runs generateTradeProposals at the SAME day/year
// with nothing else changed) was guaranteed to hand back the identical proposal.
test("declining a proposal, then refreshing at the same day/year, does NOT bring back the exact same offer", () => {
  const st = seasonFixture();
  const first = ensureTradeProposals(st)[0];
  declineTradeProposal(st, first.id);

  const refreshed = generateTradeProposals(st); // same st.year/st.dayIndex/roster as before
  assert.equal(
    refreshed.some((p) => p.fromTeamId === first.fromTeamId && p.wantIds[0] === first.wantIds[0]),
    false,
    "the exact team+offer-player shape the user just declined must not reappear on refresh",
  );
});

test("declining one team's offer does not block a DIFFERENT team's offer for the same star later", () => {
  const st = seasonFixture();
  const first = ensureTradeProposals(st)[0];
  declineTradeProposal(st, first.id);

  // Add a second CPU team and advance a day so the team-rotation picks it instead of CPU --
  // a different team's offer has a different signature and must still be allowed through; only
  // the EXACT declined team+player+offer shape is blocked, not the star forever.
  st.teams.CPU2 = { name: "另一队", players: [player("cpu2-star", 84, 150), player("cpu2-filler", 60, 30)] };
  st.dayIndex += 1;
  const refreshed = generateTradeProposals(st);
  assert.ok(
    refreshed.some((p) => p.targetName === first.targetName && p.fromTeamId !== first.fromTeamId),
    "a different team's offer for the same player should still surface",
  );
});

// Regression for a real user report: a CPU team sends an unsolicited offer, the user clicks
// 接受报价 on EXACTLY what was offered, and it bounces with "对方硬帽放不下，拒绝". That's an offer
// that could never have been accepted from the moment it was generated -- generateTradeProposals()
// picked a send-back combo purely by OVR/salary similarity to the targeted player and never once
// checked whether the OFFERING team's own books could absorb the deal.
function capTightFixture() {
  const userPlayers = [
    player("star", 86, 100),
    ...Array.from({ length: 7 }, (_, i) => player(`u${i}`, 65, 40)),
  ];
  const cpuPlayers = [
    player("cpu-star", 85, 90), // closest OVR match to "star" -> picked as the naive offerPlayer
    player("junior", 50, 20), // highest prospectScore among the rest -> picked as the prospect
    player("filler-big", 55, 500), // NOT selected initially; smaller of the two untouched whales
    player("filler-mid", 90, 1890), // NOT selected initially; the bigger untouched whale
    ...Array.from({ length: 7 }, (_, i) => player(`cf${i}`, 72, 10)), // untouched padding, keeps CPU roster >= 8 after giving 3 away
  ];
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

test("an offer from a cap-tight team gets a salary throw-in added so it actually clears the cap", () => {
  const st = capTightFixture();
  // Sanity-check the fixture actually reproduces the bug shape: the naive two-piece send-back
  // (closest-OVR match + best prospect) alone does NOT fit under the CPU's apron.
  const naiveOutgoing = 90 + 20; // cpu-star + junior
  const naiveProjected = teamPayroll(st.teams.CPU) - naiveOutgoing + 100; // + the user star's salary
  assert.ok(naiveProjected > SEASON_APRON + 50, "fixture must actually be cap-tight for this test to mean anything");

  const proposals = generateTradeProposals(st);
  assert.equal(proposals.length, 1);
  const proposal = proposals[0];
  // The naive 2-piece offer wasn't enough -- expect the big untouched contract got thrown in too.
  assert.ok(proposal.wantIds.includes("filler-mid"), "should have patched the offer with the salary-matching throw-in");
  assert.equal(proposal.wantIds.length, 3);

  // The actual regression: accepting exactly what was offered must succeed, not bounce on the cap.
  const result = acceptTradeProposal(st, proposal.id);
  assert.equal(result.ok, true, result.reason);
});

test("a team that's hopelessly over the cap even with a throw-in does not get offered at all", () => {
  const st = capTightFixture();
  // Push CPU's books into territory no single throw-in can rescue.
  st.teams.CPU.players.push(player("whale", 60, 5000));
  const proposals = generateTradeProposals(st);
  assert.equal(proposals.length, 0, "a deal that can never clear the cap should never be dangled in front of the user");
});
