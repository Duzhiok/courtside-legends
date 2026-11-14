// G-P1-1: a duplicated id in a trade offer used to clone the player — the executor
// mapped per list entry (so ["A1","A1"] became two copies) but filtered per id (so only
// one copy left). Duplicate ids in any offer list are refused outright now.
import test from "node:test";
import assert from "node:assert/strict";
import {
  executeThreeTeamTrade,
  executeTrade,
  teamDraftAssets,
} from "../js/engine/seasonMarket.js";

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
    tradeLog: [],
    draftAssets: [],
  };
}

function rosterIds(st, teamId) {
  return st.teams[teamId].players.map((p) => p.id).sort();
}

test("G-P1-1: a duplicated give id is refused — no clone, rosters untouched", () => {
  const st = seasonFixture();
  const beforeUser = rosterIds(st, "USER");
  const beforeT2 = rosterIds(st, "T2");
  const res = executeTrade(st, { giveIds: ["u0", "u0"], wantIds: ["t2_0"], cpuTeamId: "T2" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /重复/);
  assert.deepEqual(rosterIds(st, "USER"), beforeUser);
  assert.deepEqual(rosterIds(st, "T2"), beforeT2);
  assert.equal(st.tradeLog.length, 0);
});

test("G-P1-1: a duplicated want id is refused the same way", () => {
  const st = seasonFixture();
  const res = executeTrade(st, { giveIds: ["u0"], wantIds: ["t2_0", "t2_0"], cpuTeamId: "T2" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /重复/);
  assert.equal(st.teams.T2.players.filter((p) => p.id === "t2_0").length, 1, "the wanted player was not cloned");
});

test("G-P1-1: a duplicated pick id is refused (its value was double-counted before)", () => {
  const st = seasonFixture();
  const mine = teamDraftAssets(st, "USER")[0];
  const res = executeTrade(st, { giveIds: ["u0"], givePickIds: [mine.id, mine.id], wantIds: ["t2_0"], cpuTeamId: "T2" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /重复/);
  assert.equal(st.tradeLog.length, 0);
});

test("G-P1-1: duplicates in a three-team trade are refused on every leg", () => {
  for (const args of [
    { giveIds: ["u0", "u0"], team2Id: "T2", team2PlayerIds: ["t2_0"], team3Id: "T3", team3PlayerIds: ["t3_0"] },
    { giveIds: ["u0"], team2Id: "T2", team2PlayerIds: ["t2_0", "t2_0"], team3Id: "T3", team3PlayerIds: ["t3_0"] },
    { giveIds: ["u0"], team2Id: "T2", team2PlayerIds: ["t2_0"], team3Id: "T3", team3PlayerIds: ["t3_0", "t3_0"] },
  ]) {
    const st = seasonFixture();
    const res = executeThreeTeamTrade(st, args);
    assert.equal(res.ok, false, JSON.stringify(args));
    assert.match(res.reason, /重复/);
    assert.equal(st.tradeLog.length, 0);
  }
});

test("G-P1-1: a clean offer still executes (the check only bites on duplicates)", () => {
  const st = seasonFixture();
  const res = executeTrade(st, { giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2" });
  assert.equal(res.ok, true, res.reason);
  assert.deepEqual(rosterIds(st, "USER").includes("t2_0"), true);
  const st3 = seasonFixture();
  const res3 = executeThreeTeamTrade(st3, { giveIds: ["u0"], team2Id: "T2", team2PlayerIds: ["t2_0"], team3Id: "T3", team3PlayerIds: ["t3_0"] });
  assert.equal(res3.ok, true, res3.reason);
});
