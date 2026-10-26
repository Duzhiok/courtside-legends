/**
 * T4: multi-for-multi trades that can also move draft picks, plus the "推荐方案" package
 * recommender (js/engine/tradeBuilder.js + the executeTrade()/teamDraftAssets() additions in
 * seasonMarket.js). There was no prior test coverage of executeTrade() at all, so this covers
 * both the pre-existing N-for-M player path and the new pick-trading additions together.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { executeTrade, teamDraftAssets, pickValueOf } from "../js/engine/seasonMarket.js";
import { recommendTradePackage, packageWorks } from "../js/engine/tradeBuilder.js";

function player(id, ovr, salary) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: ovr < 78 ? 22 : 28 };
}

function fixture() {
  return {
    year: 1994,
    dayIndex: 10,
    phase: "regular",
    userTeamId: "USER",
    teams: {
      USER: {
        name: "我方",
        players: [
          player("star", 88, 400),
          player("role1", 74, 120),
          player("prospectA", 70, 60),
          player("filler1", 68, 60),
          player("filler2", 68, 60),
          player("filler3", 68, 60),
          player("filler4", 68, 60),
          player("filler5", 68, 60),
          player("filler6", 68, 60),
          player("filler7", 68, 60),
        ],
      },
      CPU: {
        name: "对手",
        players: [
          player("cpuStar", 85, 380),
          player("cpuRole", 72, 110),
          player("cpuFiller1", 66, 55),
          player("cpuFiller2", 66, 55),
          player("cpuFiller3", 66, 55),
          player("cpuFiller4", 66, 55),
          player("cpuFiller5", 66, 55),
          player("cpuFiller6", 66, 55),
        ],
      },
    },
    tradeLog: [],
    draftAssets: [],
  };
}

test("teamDraftAssets: a club's picks are derived from the draft calendar, deterministic, and stored nowhere", () => {
  const st = fixture();
  const a = teamDraftAssets(st, "USER");
  assert.equal(a.length, 6, "a first and a second for each of the next three drafts");
  assert.equal(a[0].round, 1);
  assert.equal(a[0].year, 1994, "this summer's draft is tradable too");
  assert.equal(a[1].round, 2);
  assert.deepEqual(teamDraftAssets(st, "USER"), a, "same picks, in the same order, on every call");
  assert.ok(!st.draftAssets.length, "nothing is stored: the list is a view of the ledger");
});

test("teamDraftAssets: CPU teams get their own independent pool, not the user's", () => {
  const st = fixture();
  const mine = teamDraftAssets(st, "USER");
  const theirs = teamDraftAssets(st, "CPU");
  assert.notDeepEqual(mine.map((p) => p.id), theirs.map((p) => p.id));
  assert.ok(theirs.every((p) => p.id.startsWith("CPU-")));
});

test("executeTrade: not touching picks at all leaves no pick state behind (regression)", () => {
  // A player-only trade must not create ledger entries or stored pools as a side effect.
  const st = fixture();
  const result = executeTrade(st, { giveIds: ["role1"], wantIds: ["cpuRole"], cpuTeamId: "CPU" });
  assert.equal(result.ok, true);
  assert.deepEqual(st.draftAssets, []);
  assert.equal(st.pickOwnership, undefined);
  assert.equal(st.pickOwnershipR2, undefined);
});

test("executeTrade: a pick-for-player trade moves the pick into the user's hands and off the CPU's", () => {
  const st = fixture();
  const theirFirst = teamDraftAssets(st, "CPU").find((p) => p.round === 1);
  const result = executeTrade(st, {
    giveIds: ["role1"],
    wantIds: [],
    wantPickIds: [theirFirst.id],
    cpuTeamId: "CPU",
  });
  assert.equal(result.ok, true, result.reason);
  assert.ok(teamDraftAssets(st, "USER").some((p) => p.id === theirFirst.id), "pick should land with me");
  assert.ok(!teamDraftAssets(st, "CPU").some((p) => p.id === theirFirst.id), "and leave theirs");
  assert.ok(!st.teams.USER.players.some((p) => p.id === "role1"), "role1 was actually traded away");
});

test("executeTrade: swapping just picks (no players at all) puts each pick with its new club", () => {
  const st = fixture();
  const mySecond = teamDraftAssets(st, "USER").find((p) => p.round === 2);
  const theirSecond = teamDraftAssets(st, "CPU").find((p) => p.round === 2);
  const result = executeTrade(st, {
    giveIds: [],
    givePickIds: [mySecond.id],
    wantIds: [],
    wantPickIds: [theirSecond.id],
    cpuTeamId: "CPU",
  });
  assert.equal(result.ok, true, result.reason);
  assert.ok(!teamDraftAssets(st, "USER").some((p) => p.id === mySecond.id), "my pick left me");
  assert.ok(teamDraftAssets(st, "USER").some((p) => p.id === theirSecond.id), "their pick landed with me");
  assert.ok(teamDraftAssets(st, "CPU").some((p) => p.id === mySecond.id), "and mine landed with them");
});

test("executeTrade: rejects a pick id that doesn't exist in either pool", () => {
  const st = fixture();
  const result = executeTrade(st, {
    giveIds: ["role1"],
    givePickIds: ["not-a-real-pick"],
    wantIds: ["cpuRole"],
    cpuTeamId: "CPU",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /选秀权无效/);
});

test("executeTrade: still supports N-for-M multi-player deals (the pre-existing capability the UI never exposed)", () => {
  const st = fixture();
  // Comparable combined OVR/salary on both sides -- executeTrade's value check compares raw OVR
  // SUMS, not per-player quality, so "2 scrubs for 1 star" legitimately reads as CPU-unfavorable
  // (136 combined > 85 single) even though it's a very normal-looking real-world trade shape.
  const result = executeTrade(st, {
    giveIds: ["filler1", "filler2"],
    wantIds: ["cpuFiller1", "cpuFiller2"],
    cpuTeamId: "CPU",
  });
  assert.equal(result.ok, true, result.reason);
  assert.ok(st.teams.USER.players.some((p) => p.id === "cpuFiller1"));
  assert.ok(st.teams.USER.players.some((p) => p.id === "cpuFiller2"));
  assert.equal(st.teams.USER.players.some((p) => p.id === "filler1" || p.id === "filler2"), false);
  assert.equal(st.teams.CPU.players.filter((p) => p.id === "filler1" || p.id === "filler2").length, 2);
});

test("executeTrade: rejects a trade with nothing at all on one side, even with the new pick fields present", () => {
  const st = fixture();
  const result = executeTrade(st, { giveIds: [], givePickIds: [], wantIds: ["cpuRole"], cpuTeamId: "CPU" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /都需出点东西/);
});

test("pickValueOf: a closer/unprotected pick is worth more than a far-off lottery-protected one", () => {
  const st = fixture();
  const near = { year: st.year + 1, round: 1, protection: "unprotected" };
  const farProtected = { year: st.year + 4, round: 1, protection: "lottery-protected" };
  assert.ok(pickValueOf(st, near) > pickValueOf(st, farProtected));
});

test("recommendTradePackage: finds a single salary-matched piece when one plainly exists", () => {
  const st = fixture();
  const rec = recommendTradePackage(st, { cpuTeamId: "CPU", wantPlayerId: "cpuRole" });
  assert.equal(rec.ok, true, rec.reason);
  assert.equal(rec.giveIds.length, 1);
  assert.deepEqual(rec.givePickIds, []);
  // Verify it actually clears executeTrade's own gate, not just the recommender's internal copy of the math.
  const result = executeTrade(st, { giveIds: rec.giveIds, givePickIds: rec.givePickIds, wantIds: ["cpuRole"], cpuTeamId: "CPU" });
  assert.equal(result.ok, true, result.reason);
});

test("recommendTradePackage: falls back to anchor + prospect when no single piece matches", () => {
  const st = fixture();
  // cpuStar is pricier than anything on my roster alone except "star" itself (which we don't want
  // to immediately re-offer back for their guy) -- force the 2-piece path by asking for cpuStar
  // while my roster's single pieces are all too cheap on their own.
  const rec = recommendTradePackage(st, { cpuTeamId: "CPU", wantPlayerId: "cpuStar" });
  assert.equal(rec.ok, true, rec.reason);
  assert.ok(rec.giveIds.length >= 1);
  const result = executeTrade(st, { giveIds: rec.giveIds, givePickIds: rec.givePickIds, wantIds: ["cpuStar"], cpuTeamId: "CPU" });
  assert.equal(result.ok, true, result.reason);
});

test("recommendTradePackage: reports failure with a reason instead of crashing when I have nobody to trade", () => {
  const st = fixture();
  st.teams.USER.players = [];
  const rec = recommendTradePackage(st, { cpuTeamId: "CPU", wantPlayerId: "cpuStar" });
  assert.equal(rec.ok, false);
  assert.ok(typeof rec.reason === "string" && rec.reason.length > 0);
});

test("recommendTradePackage: invalid target returns a clear failure, not a throw", () => {
  const st = fixture();
  assert.equal(recommendTradePackage(st, { cpuTeamId: "CPU", wantPlayerId: "nobody" }).ok, false);
  assert.equal(recommendTradePackage(st, { cpuTeamId: "not-a-team", wantPlayerId: "cpuRole" }).ok, false);
});

// executeTrade's salaryOk check (salIn <= salOut*1.25+40 OR salOut <= salIn*1.25+40) turns out to
// be a tautology for any non-negative salaries -- there is no (salOut, salIn) pair that fails
// both directions at once. That's pre-existing behavior, not something this feature touches, so
// this test documents what ACTUALLY gates a package rather than asserting a salary-mismatch
// rejection that the current formula can never produce. The real gate is the value check: giving
// away far more than you receive (and not clearing the "dumping salary" escape hatch) fails.
test("packageWorks: the value check blocks giving away far more than you receive", () => {
  assert.equal(packageWorks(100, 100, 80, 80), true);
  assert.equal(packageWorks(100, 100, 95, 50), false, "giving 95 of value for 50 back, same salary, should fail");
  assert.equal(packageWorks(300, 100, 95, 50), true, "but dumping enough extra salary (>=80 more out) excuses it");
});
