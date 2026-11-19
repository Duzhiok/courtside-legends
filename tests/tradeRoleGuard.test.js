// R5 leftover (Board 已知缺口): executeTrade itself had no requireCapability
// guard — only the trade button's canDo gate guarded it, so a coach could
// still execute a trade by accepting a CPU proposal. The operation now
// refuses at its own entry point; the button gate is unchanged.
// G-P1-3/G-P1-4 (same family): swapDraftPicks, cutPlayer and
// signFreeAgent had the same gap — UI gates only, no operation-layer guard.
import test from "node:test";
import assert from "node:assert/strict";
import {
  cutPlayer,
  executeThreeTeamTrade,
  executeTrade,
  signFreeAgent,
} from "../js/engine/seasonMarket.js";
import { swapDraftPicks } from "../js/engine/leagueDraft.js";
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
const COACH_WITH_PERSONNEL_GRANTS = { role: "COACH", grants: ["trade", "signFreeAgent", "release"] };
const GM = { role: "GM" };

// 9 on the roster so a cut can execute (min roster is 8), one FA to sign.
function marketFixture() {
  const st = seasonFixture();
  st.teams.USER.players.push(player("u7", 70, 50));
  st.freeAgents = [player("fa1", 70, 50)];
  return st;
}

// B (2nd-worst record) swaps with C (3rd): C receives the better pick.
function swapFixture() {
  const ids = ["A", "B", "C", "D"];
  return {
    phase: "done",
    year: 2024,
    userTeamId: "B",
    league: { teamIds: ids },
    teams: Object.fromEntries(ids.map((id) => [id, { id, name: id, players: [] }])),
    standings: Object.fromEntries(
      ids.map((id, index) => [id, { w: 20 + index, l: 62 - index, pf: 8000, pa: 8100 }]),
    ),
  };
}

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

// G-P1-4: cut and sign had UI gates only — a coach could call them directly.
test("coach is refused cut and sign at the operation, rosters untouched", () => {
  const cutSt = marketFixture();
  const beforeCut = rosterIds(cutSt, "USER");
  const cutRes = cutPlayer(cutSt, "u0", "zh", { career: COACH });
  assert.equal(cutRes.ok, false);
  assert.match(cutRes.reason, /经理/);
  assert.deepEqual(rosterIds(cutSt, "USER"), beforeCut);
  assert.equal(cutSt.tradeLog.length, 0);

  const signSt = marketFixture();
  const signRes = signFreeAgent(signSt, "fa1", "zh", { career: COACH });
  assert.equal(signRes.ok, false);
  assert.match(signRes.reason, /经理/);
  assert.equal(signSt.teams.USER.players.length, 9);
  assert.equal(signSt.freeAgents.length, 1);
  assert.equal(signSt.tradeLog.length, 0);
});

// G-P1-3: a pick swap is a trade — the swap itself had no guard at all,
// and its button had no UI gate either.
test("coach is refused a pick swap at the operation, ledger untouched", () => {
  const st = swapFixture();
  const res = swapDraftPicks(st, { year: 2024, cpuTeamId: "C", career: COACH });
  assert.equal(res.ok, false);
  assert.match(res.reason, /经理/);
  assert.equal(st.pickOwnership, undefined);
});

test("player career is refused cut/sign/swap; GM and grant-holding coaches execute", () => {
  const playerSt = marketFixture();
  assert.equal(cutPlayer(playerSt, "u0", "zh", { career: { role: "PLAYER" } }).ok, false);
  assert.equal(signFreeAgent(playerSt, "fa1", "zh", { career: { role: "PLAYER" } }).ok, false);
  assert.equal(swapDraftPicks(swapFixture(), { year: 2024, cpuTeamId: "C", career: { role: "PLAYER" } }).ok, false);

  const grantedCut = marketFixture();
  const grantedCutRes = cutPlayer(grantedCut, "u0", "zh", { career: COACH_WITH_PERSONNEL_GRANTS });
  assert.equal(grantedCutRes.ok, true, grantedCutRes.reason);
  assert.equal(grantedCut.teams.USER.players.some((p) => p.id === "u0"), false);

  const grantedSign = marketFixture();
  const grantedSignRes = signFreeAgent(grantedSign, "fa1", "zh", { career: COACH_WITH_PERSONNEL_GRANTS });
  assert.equal(grantedSignRes.ok, true, grantedSignRes.reason);
  assert.equal(grantedSign.teams.USER.players.some((p) => p.id === "fa1"), true);

  const grantedSwap = swapFixture();
  const grantedSwapRes = swapDraftPicks(grantedSwap, { year: 2024, cpuTeamId: "C", career: COACH_WITH_PERSONNEL_GRANTS });
  assert.equal(grantedSwapRes.ok, true, grantedSwapRes.reason);
  assert.deepEqual(grantedSwap.pickOwnership[2024], { B: "C", C: "B" });

  const gmCut = marketFixture();
  assert.equal(cutPlayer(gmCut, "u0", "zh", { career: GM }).ok, true);
  const gmSign = marketFixture();
  assert.equal(signFreeAgent(gmSign, "fa1", "zh", { career: GM }).ok, true);
  const gmSwap = swapFixture();
  assert.equal(swapDraftPicks(gmSwap, { year: 2024, cpuTeamId: "C", career: GM }).ok, true);
});

test("no career at all still executes cut, sign and swap (Classic fallback)", () => {
  const cutSt = marketFixture();
  const cutRes = cutPlayer(cutSt, "u0");
  assert.equal(cutRes.ok, true, cutRes.reason);
  assert.equal(cutSt.teams.USER.players.some((p) => p.id === "u0"), false);

  const signSt = marketFixture();
  const signRes = signFreeAgent(signSt, "fa1");
  assert.equal(signRes.ok, true, signRes.reason);
  assert.equal(signSt.teams.USER.players.some((p) => p.id === "fa1"), true);

  const swapSt = swapFixture();
  const swapRes = swapDraftPicks(swapSt, { year: 2024, cpuTeamId: "C" });
  assert.equal(swapRes.ok, true, swapRes.reason);
});

test("cut/sign/swap refusal follows the save root when no career wrapper is passed", () => {
  const refused = marketFixture();
  assert.equal(cutPlayer(refused, "u0", "zh", { root: { identity: { currentRole: "COACH" } } }).ok, false);
  assert.equal(signFreeAgent(refused, "fa1", "zh", { root: { identity: { currentRole: "COACH" } } }).ok, false);
  assert.equal(
    swapDraftPicks(swapFixture(), { year: 2024, cpuTeamId: "C", root: { identity: { currentRole: "COACH" } } }).ok,
    false,
  );

  const allowed = marketFixture();
  assert.equal(cutPlayer(allowed, "u0", "zh", { root: { identity: { currentRole: "GM" } } }).ok, true);
  assert.equal(
    swapDraftPicks(swapFixture(), { year: 2024, cpuTeamId: "C", root: { identity: { currentRole: "GM" } } }).ok,
    true,
  );
});

test("cut/sign/swap refusal reason follows the requested language", () => {
  const st = marketFixture();
  assert.match(cutPlayer(st, "u0", "en", { career: COACH }).reason, /GM's job/);
  assert.match(signFreeAgent(st, "fa1", "en", { career: COACH }).reason, /GM's job/);
  assert.match(
    swapDraftPicks(swapFixture(), { year: 2024, cpuTeamId: "C", career: COACH, lang: "en" }).reason,
    /GM's job/,
  );
});

// G-P2-3: signFreeAgent read team.players with no null check — an invalid
// userTeamId threw TypeError instead of returning { ok: false }.
test("signFreeAgent with an invalid user team returns { ok: false } instead of throwing", () => {
  const st = marketFixture();
  st.userTeamId = "NOPE";
  const res = signFreeAgent(st, "fa1");
  assert.equal(res.ok, false);
  assert.match(res.reason, /找不到球队/);
});
