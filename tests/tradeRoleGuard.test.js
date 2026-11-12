// R5 leftover (Board 已知缺口): executeTrade itself had no requireCapability
// guard — only the trade button's canDo gate guarded it, so a coach could
// still execute a trade by accepting a CPU proposal. The operation now
// refuses at its own entry point; the button gate is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import {
  executeThreeTeamTrade,
  executeTrade,
} from "../js/engine/seasonMarket.js";
import {
  acceptTradeProposal,
  ensureTradeProposals,
} from "../js/engine/tradeProposals.js";

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

function rosterIds(st, teamId) {
  return st.teams[teamId].players.map((p) => p.id).sort();
}

const COACH = { role: "COACH" };
const COACH_WITH_TRADE_GRANT = { role: "COACH", grants: ["trade"] };
const GM = { role: "GM" };

test("coach without a trade grant is refused at the operation, rosters untouched", () => {
  const st = seasonFixture();
  const beforeUser = rosterIds(st, "USER");
  const beforeT2 = rosterIds(st, "T2");
  const res = executeTrade(st, { giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2", career: COACH });
  assert.equal(res.ok, false);
  assert.match(res.reason, /经理/);
  assert.deepEqual(rosterIds(st, "USER"), beforeUser);
  assert.deepEqual(rosterIds(st, "T2"), beforeT2);
  assert.equal(st.tradeLog.length, 0);
});

test("player career is refused the same way; GM and a grant-holding coach execute", () => {
  const refused = seasonFixture();
  const playerRes = executeTrade(refused, { giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2", career: { role: "PLAYER" } });
  assert.equal(playerRes.ok, false);
  assert.match(playerRes.reason, /经理/);

  const granted = seasonFixture();
  const grantedRes = executeTrade(granted, { giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2", career: COACH_WITH_TRADE_GRANT });
  assert.equal(grantedRes.ok, true, grantedRes.reason);

  const gm = seasonFixture();
  const gmRes = executeTrade(gm, { giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2", career: GM });
  assert.equal(gmRes.ok, true, gmRes.reason);
});

test("no career at all still executes (Classic GM + Coach fallback, plain seasons)", () => {
  const st = seasonFixture();
  const res = executeTrade(st, { giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2" });
  assert.equal(res.ok, true, res.reason);
  assert.equal(st.teams.USER.players.some((p) => p.id === "t2_0"), true);
});

test("role resolved from the save root when no career wrapper is passed", () => {
  const coachRoot = seasonFixture();
  const refused = executeTrade(coachRoot, {
    giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2",
    root: { identity: { currentRole: "COACH" } },
  });
  assert.equal(refused.ok, false);

  const gmRoot = seasonFixture();
  const allowed = executeTrade(gmRoot, {
    giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2",
    root: { identity: { currentRole: "GM" } },
  });
  assert.equal(allowed.ok, true, allowed.reason);
});

test("refusal reason follows the requested language", () => {
  const st = seasonFixture();
  const res = executeTrade(st, { giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2", career: COACH, lang: "en" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /GM's job/);
});

test("three-team trade refuses a coach and executes for a GM", () => {
  const refused = seasonFixture();
  const beforeUser = rosterIds(refused, "USER");
  const res = executeThreeTeamTrade(refused, {
    giveIds: ["u4"], team2Id: "T2", team2PlayerIds: ["t2_4"], team3Id: "T3", team3PlayerIds: ["t3_4"], career: COACH,
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /经理/);
  assert.deepEqual(rosterIds(refused, "USER"), beforeUser);

  const gm = seasonFixture();
  const gmRes = executeThreeTeamTrade(gm, {
    giveIds: ["u4"], team2Id: "T2", team2PlayerIds: ["t2_4"], team3Id: "T3", team3PlayerIds: ["t3_4"], career: GM,
  });
  assert.equal(gmRes.ok, true, gmRes.reason);
});

test("accepting a CPU proposal refuses a coach and keeps the offer; a GM accepts", () => {
  const st = seasonFixture();
  const proposal = ensureTradeProposals(st)[0];
  assert.ok(proposal, "fixture: the hot star draws a proposal");
  const res = acceptTradeProposal(st, proposal.id, "zh", { career: COACH });
  assert.equal(res.ok, false);
  assert.match(res.reason, /经理/);
  assert.equal(st.tradeProposals.some((p) => p.id === proposal.id), true, "offer stays on the table");
  assert.equal(st.teams.USER.players.some((p) => p.id === "star"), true, "star not traded away");
  assert.equal(st.tradeLog.length, 0);

  const gmSt = seasonFixture();
  const gmProposal = ensureTradeProposals(gmSt)[0];
  const gmRes = acceptTradeProposal(gmSt, gmProposal.id, "zh", { career: GM });
  assert.equal(gmRes.ok, true, gmRes.reason);
});
