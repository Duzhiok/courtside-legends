// G-P1-2: the salary-match check used ||, which is always true for non-negative
// salaries — the "NBA-style 25% + ¤40 matching" never refused anything. The fix is
// one-directional (NBA-style): a side may not take back much more salary than it
// sends (25% + ¤40). Taking back LESS is a salary dump — a legitimate move the value
// check prices separately — and a picks-only offer sends no salary at all (its cap
// is the apron check and valueOk), so neither is gated. The report suggested a
// symmetric &&, but that would kill both dumps and picks-only trades, which are
// designed features (consolidation offers, picks-only offers); 12 existing tests
// pinned them. The three report-listed copies (executeTrade, the three-team leg
// check, packageWorks) use the one-directional band; executeTrade additionally skips
// the check when the user sends no players. A fourth copy lived in the proposal
// filter's check(), but a totals band does not fit it — a package routinely carries
// more players than the target, so its salary is structurally ~2x the target's — so
// that copy's salary term was removed instead (behaviour-identical: the old || was
// vacuous there), leaving value + cap as the filter's guards.
import test from "node:test";
import assert from "node:assert/strict";
import { executeThreeTeamTrade, executeTrade, teamDraftAssets } from "../js/engine/seasonMarket.js";
import { packageWorks, recommendTradePackage } from "../js/engine/tradeBuilder.js";

function player(id, ovr, salary = 100) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: ovr < 80 ? 22 : 28 };
}

function seasonFixture() {
  const userPlayers = [
    player("cheap", 80, 25),
    ...Array.from({ length: 7 }, (_, i) => player(`u${i}`, 70, 50)),
  ];
  const t2Players = [
    player("pricey", 80, 400),
    player("t2mid", 74, 60),
    ...Array.from({ length: 7 }, (_, i) => player(`t2_${i}`, 68, 45)),
  ];
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

test("G-P1-2: packageWorks — taking back much more fails; taking back less is a dump", () => {
  assert.equal(packageWorks(100, 100, 80, 80), true, "equal salaries match");
  assert.equal(packageWorks(25, 400, 80, 80), false, "the report's case: ¤25 for ¤400 at equal OVR");
  assert.equal(packageWorks(400, 25, 80, 80), true, "the reverse is a salary dump, not an exploit — allowed");
  assert.equal(packageWorks(1000, 25, 80, 80), true, "a big dump is still a dump");
  assert.equal(packageWorks(0, 5000, 80, 80), false, "a zero-salary side cannot absorb anything");
  assert.equal(packageWorks(0, 0, 80, 80), true, "zero for zero is a match");
});

test("G-P1-2: packageWorks — the 25% + ¤40 band edge is exact", () => {
  assert.equal(packageWorks(100, 165, 80, 80), true, "165 is exactly 100 * 1.25 + 40");
  assert.equal(packageWorks(100, 166, 80, 80), false, "166 is one over the band");
});

test("G-P1-2: executeTrade refuses a 16x salary gap at equal OVR, rosters untouched", () => {
  const st = seasonFixture();
  const beforeUser = rosterIds(st, "USER");
  const beforeT2 = rosterIds(st, "T2");
  const res = executeTrade(st, { giveIds: ["cheap"], wantIds: ["pricey"], cpuTeamId: "T2" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /薪资/);
  assert.deepEqual(rosterIds(st, "USER"), beforeUser);
  assert.deepEqual(rosterIds(st, "T2"), beforeT2);
  assert.equal(st.tradeLog.length, 0);
});

test("G-P1-2: a salary-balanced trade still executes", () => {
  const st = seasonFixture();
  const res = executeTrade(st, { giveIds: ["u0"], wantIds: ["t2_0"], cpuTeamId: "T2" });
  assert.equal(res.ok, true, res.reason);
});

test("G-P1-2: a salary dump (sending more salary than received) still executes", () => {
  const st = seasonFixture();
  st.teams.USER.players.push(player("star", 88, 400));
  const res = executeTrade(st, { giveIds: ["star"], wantIds: ["t2mid"], cpuTeamId: "T2" });
  assert.equal(res.ok, true, res.reason);
});

test("G-P1-2: a picks-only offer for a player is not blocked by the salary check", () => {
  // The CPU sheds a ¤100 contract for a first-rounder: valueOk passes via the
  // salary-dump rescue, so the only gate is the salary check — which skips
  // picks-only offers (no outgoing salary to match against).
  const st = seasonFixture();
  st.teams.T2.players.push(player("overpaid", 66, 100));
  const myFirst = teamDraftAssets(st, "USER").find((p) => p.round === 1);
  const res = executeTrade(st, { giveIds: [], givePickIds: [myFirst.id], wantIds: ["overpaid"], cpuTeamId: "T2" });
  assert.equal(res.ok, true, res.reason);
  assert.ok(!st.teams.T2.players.some((p) => p.id === "overpaid"), "the player moved");
});

test("G-P1-2: a three-team trade with a lopsided leg is refused; a balanced one executes", () => {
  const st = seasonFixture();
  const res = executeThreeTeamTrade(st, {
    giveIds: ["cheap"],
    team2Id: "T2",
    team2PlayerIds: ["pricey"],
    team3Id: "T3",
    team3PlayerIds: ["t3role"],
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /薪资/);
  assert.equal(st.tradeLog.length, 0);

  const balanced = seasonFixture();
  const ok = executeThreeTeamTrade(balanced, {
    giveIds: ["u0"],
    team2Id: "T2",
    team2PlayerIds: ["t2_0"],
    team3Id: "T3",
    team3PlayerIds: ["t3_0"],
  });
  assert.equal(ok.ok, true, ok.reason);
});

test("G-P1-2: the recommender no longer suggests a salary-mismatched package", () => {
  const st = seasonFixture();
  const res = recommendTradePackage(st, { cpuTeamId: "T2", wantPlayerId: "pricey" });
  assert.equal(res.ok, false, "no combination of ¤25–50 players matches a ¤400 salary");
  const st2 = seasonFixture();
  const ok = recommendTradePackage(st2, { cpuTeamId: "T2", wantPlayerId: "t2mid" });
  assert.equal(ok.ok, true, "a matchable target still gets a recommendation");
});
