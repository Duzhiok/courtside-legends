import test from "node:test";
import assert from "node:assert/strict";
import {
  generateTradeProposals,
  listPlayerForTrade,
  listedPlayerIds,
  teamSituation,
  unlistPlayerForTrade,
} from "../js/engine/tradeProposals.js";
import { executeThreeTeamTrade } from "../js/engine/seasonMarket.js";

function player(id, ovr, salary = 100) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: ovr < 80 ? 22 : 28 };
}

function seasonFixture() {
  const userPlayers = [player("star", 86, 160), ...Array.from({ length: 7 }, (_, i) => player(`u${i}`, 70, 50))];
  const t2Players = [player("t2star", 83, 150), player("t2mid", 74, 60), ...Array.from({ length: 7 }, (_, i) => player(`t2_${i}`, 68, 45))];
  const t3Players = [player("t3role", 76, 80), ...Array.from({ length: 7 }, (_, i) => player(`t3_${i}`, 68, 45))];
  return {
    year: 1994,
    dayIndex: 20,
    phase: "regular",
    userTeamId: "USER",
    teams: {
      USER: { name: "我方", players: userPlayers },
      T2: { name: "二方", players: t2Players },
      T3: { name: "三方", players: t3Players },
    },
    playerSeason: {
      "USER:star": { stats: { gp: 10, pts: 220, plusMinus: 30 } },
    },
    tradeLog: [],
    draftAssets: [],
  };
}

test("listing: listed players get proposals first, even when not attractive", () => {
  const st = seasonFixture();
  const quiet = player("quiet", 72, 55);
  st.teams.USER.players.push(quiet);
  assert.equal(listPlayerForTrade(st, "quiet").ok, true);
  assert.equal(listPlayerForTrade(st, "nope").ok, false);
  assert.deepEqual(listedPlayerIds(st), ["quiet"]);
  const proposals = generateTradeProposals(st, 3);
  assert.ok(proposals.length >= 1);
  assert.equal(proposals[0].targetName, "quiet");
  assert.match(proposals[0].reason, /挂牌询价/);
  unlistPlayerForTrade(st, "quiet");
  assert.deepEqual(listedPlayerIds(st), []);
});

test("teamSituation: rebuilding < 78, contender > 84, else mid", () => {
  const mk = (ovr) => ({ players: Array.from({ length: 5 }, (_, i) => player(`p${i}`, ovr)) });
  assert.equal(teamSituation(mk(70)), "rebuilding");
  assert.equal(teamSituation(mk(88)), "contender");
  assert.equal(teamSituation(mk(80)), "mid");
  assert.equal(teamSituation({ players: [] }), "mid");
});

test("rebuilding teams attach one extra pick, capped at 3", () => {
  const st = seasonFixture();
  // T2 is rebuilding (avg ~70): base 1 pick (83+5 >= 86) -> 2 picks.
  const proposals = generateTradeProposals(st, 3);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].offerPicks.length, 2);
  // Make the offer much weaker so base is 2 -> rebuilding caps at 3.
  st.teams.T2.players = [player("t2weak", 78, 60), ...Array.from({ length: 7 }, (_, i) => player(`w${i}`, 68, 45))];
  const proposals2 = generateTradeProposals(st, 3);
  assert.equal(proposals2[0].offerPicks.length, 3);
});

test("three-team trade: players rotate user -> T2 -> T3 -> user", () => {
  const st = seasonFixture();
  const res = executeThreeTeamTrade(st, {
    giveIds: ["star"],
    team2Id: "T2",
    team2PlayerIds: ["t2mid"],
    team3Id: "T3",
    team3PlayerIds: ["t3role"],
    acceptedProposal: true,
  });
  assert.equal(res.ok, true, res.reason);
  assert.equal(st.teams.USER.players.some((p) => p.id === "t3role"), true);
  assert.equal(st.teams.USER.players.some((p) => p.id === "star"), false);
  assert.equal(st.teams.T2.players.some((p) => p.id === "star"), true);
  assert.equal(st.teams.T3.players.some((p) => p.id === "t2mid"), true);
  assert.equal(st.tradeLog.at(-1).type, "trade_3team");
});

test("three-team trade: roster cap, invalid player, phase, apron refusals", () => {
  const st = seasonFixture();
  // Cap: user at MIN 8 gives 2, gets 1 -> 7 < 8.
  const capRes = executeThreeTeamTrade(st, {
    giveIds: ["star", "u0"],
    team2Id: "T2",
    team2PlayerIds: ["t2mid"],
    team3Id: "T3",
    team3PlayerIds: ["t3role"],
    acceptedProposal: true,
  });
  assert.equal(capRes.ok, false);
  assert.match(capRes.reason, /人数/);
  // Invalid player.
  const badRes = executeThreeTeamTrade(st, {
    giveIds: ["ghost"],
    team2Id: "T2",
    team2PlayerIds: ["t2mid"],
    team3Id: "T3",
    team3PlayerIds: ["t3role"],
    acceptedProposal: true,
  });
  assert.equal(badRes.ok, false);
  // Phase.
  const off = seasonFixture();
  off.phase = "playoffs";
  const phaseRes = executeThreeTeamTrade(off, {
    giveIds: ["star"],
    team2Id: "T2",
    team2PlayerIds: ["t2mid"],
    team3Id: "T3",
    team3PlayerIds: ["t3role"],
    acceptedProposal: true,
  });
  assert.equal(phaseRes.ok, false);
  // Apron: T3 payroll 2400, sends a 50 player, receives a 300 player -> 2650 > 2350.
  const apron = seasonFixture();
  apron.teams.T3.players = [player("t3cheap", 70, 50), ...Array.from({ length: 7 }, (_, i) => player(`a${i}`, 68, 300))];
  apron.teams.T2.players = [player("t2rich", 80, 300), ...Array.from({ length: 7 }, (_, i) => player(`b${i}`, 68, 45))];
  const apronRes = executeThreeTeamTrade(apron, {
    giveIds: ["star"],
    team2Id: "T2",
    team2PlayerIds: ["t2rich"],
    team3Id: "T3",
    team3PlayerIds: ["t3cheap"],
    acceptedProposal: true,
  });
  assert.equal(apronRes.ok, false);
  assert.match(apronRes.reason, /硬帽/);
});
