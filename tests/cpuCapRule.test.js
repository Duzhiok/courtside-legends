// The CPU hard cap used to refuse any trade that left the other team above SEASON_APRON + 50, whether the trade
// added salary or removed it. A freshly built league has every CPU club far over that line (payrolls of
// 2500-5500 against 2350), so NOTHING could be traded, not even a swap of two equal second-round picks.
// The rule is now: the cap only stops a trade that makes the CPU's payroll go UP and leaves it above the line.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CPU_APRON_SLACK,
  SEASON_APRON,
  cpuCapBlocksTrade,
  executeThreeTeamTrade,
  executeTrade,
  teamDraftAssets,
  teamPayroll,
} from "../js/engine/seasonMarket.js";
import { acceptTradeProposal, generateTradeProposals } from "../js/engine/tradeProposals.js";

const CAP = SEASON_APRON + CPU_APRON_SLACK;

function player(id, ovr, salary) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: ovr < 78 ? 22 : 28 };
}

const fillers = (prefix, count, ovr, salary) => Array.from({ length: count }, (_, i) => player(`${prefix}${i}`, ovr, salary));

/** A league where the CPU club is far over the cap, like every club in a new league. */
function overCapFixture() {
  return {
    year: 1994,
    dayIndex: 10,
    phase: "regular",
    userTeamId: "USER",
    teams: {
      USER: { name: "我方", players: [player("star", 88, 400), player("role1", 74, 100), ...fillers("u", 8, 68, 60)] },
      CPU: {
        name: "对手",
        players: [player("whale", 60, 3500), player("cpuHeavy", 80, 300), player("cpuRole", 72, 100), ...fillers("c", 7, 66, 55)],
      },
    },
    tradeLog: [],
    draftAssets: [],
  };
}

const secondRound = (st, teamId) => teamDraftAssets(st, teamId).find((pick) => pick.round === 2);

test("sanity: the fixture's CPU really is far over the line", () => {
  assert.ok(teamPayroll(overCapFixture().teams.CPU) > CAP + 1000);
});

// ---- the rule itself ----

test("cpuCapBlocksTrade: only a trade that adds salary AND ends above the line is blocked", () => {
  assert.equal(cpuCapBlocksTrade(5000, 100, 0), true, "over the line and taking on more");
  assert.equal(cpuCapBlocksTrade(5000, 0, 0), false, "over the line but a salary-neutral swap (picks for picks)");
  assert.equal(cpuCapBlocksTrade(5000, 100, 100), false, "equal salaries swapped");
  assert.equal(cpuCapBlocksTrade(5000, 100, 400), false, "over the line and shedding salary");
  assert.equal(cpuCapBlocksTrade(2000, 100, 0), false, "adds salary but still ends under the line");
});

test("cpuCapBlocksTrade: the boundary is exact", () => {
  assert.equal(cpuCapBlocksTrade(CAP - 100, 100, 0), false, "ending exactly on the line is allowed");
  assert.equal(cpuCapBlocksTrade(CAP - 100, 101, 0), true, "one over is not");
  assert.equal(cpuCapBlocksTrade(CAP - 100, 101, 1), false, "net +100 that lands exactly on the line is fine");
  assert.equal(cpuCapBlocksTrade(CAP - 99, 101, 1), true, "the same net +100 from one dollar higher lands one over the line");
});

// ---- executeTrade ----

test("executeTrade: an over-cap club accepts a salary-neutral pick swap (the case that was impossible)", () => {
  const st = overCapFixture();
  const mine = secondRound(st, "USER");
  const theirs = secondRound(st, "CPU");
  const res = executeTrade(st, { givePickIds: [mine.id], wantPickIds: [theirs.id], cpuTeamId: "CPU" });
  assert.equal(res.ok, true, res.reason);
});

test("executeTrade: an over-cap club accepts a deal that sheds its salary", () => {
  const st = overCapFixture();
  const before = teamPayroll(st.teams.CPU);
  const res = executeTrade(st, { giveIds: ["role1"], wantIds: ["cpuHeavy"], cpuTeamId: "CPU" }); // takes on 100, sends 300
  assert.equal(res.ok, true, res.reason);
  assert.equal(teamPayroll(st.teams.CPU), before - 300 + 100);
});

test("executeTrade: an over-cap club still refuses to take ON salary", () => {
  const st = overCapFixture();
  const res = executeTrade(st, { giveIds: ["star"], wantIds: ["c0"], cpuTeamId: "CPU" }); // takes on 400, sends 55
  assert.equal(res.ok, false);
  assert.match(res.reason, /硬帽/);
});

test("executeTrade: a club under the line may take on salary as long as it stays under", () => {
  const st = overCapFixture();
  st.teams.CPU.players = [...fillers("s", 8, 66, 100)]; // payroll 800
  const res = executeTrade(st, { giveIds: ["star"], wantIds: ["s0"], cpuTeamId: "CPU" });
  assert.equal(res.ok, true, res.reason);
});

test("executeTrade: a club under the line may not be pushed over it", () => {
  const st = overCapFixture();
  st.teams.CPU.players = [...fillers("s", 7, 66, 100), player("big", 66, CAP - 40 - 700)]; // payroll CAP - 40: under the line
  assert.equal(teamPayroll(st.teams.CPU), CAP - 40);
  const res = executeTrade(st, { giveIds: ["star"], wantIds: ["s0"], cpuTeamId: "CPU" }); // net +300: ends over
  assert.equal(res.ok, false);
  assert.match(res.reason, /硬帽/);
});

test("executeTrade: the PLAYER's own hard cap is unchanged: it still refuses a deal that ends over it", () => {
  const st = overCapFixture();
  st.teams.USER.players = [...fillers("u", 8, 68, 280)]; // payroll 2240, apron 2300
  const res = executeTrade(st, { giveIds: ["u0"], wantIds: ["cpuHeavy", "whale"], cpuTeamId: "CPU" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /我方|交易后将超过硬帽/);
});

// ---- three-way ----

function threeWayFixture() {
  return {
    year: 1994,
    dayIndex: 10,
    phase: "regular",
    userTeamId: "USER",
    teams: {
      USER: { name: "我方", players: [player("give", 74, 100), ...fillers("u", 9, 68, 60)] },
      T2: { name: "二队", players: [player("p2", 74, 100), player("whale2", 60, 3500), ...fillers("a", 8, 66, 55)] },
      T3: { name: "三队", players: [player("p3", 74, 100), player("whale3", 60, 3500), ...fillers("b", 8, 66, 55)] },
    },
    tradeLog: [],
    draftAssets: [],
  };
}

test("three-way: over-cap clubs can take part when the money works out neutral", () => {
  const st = threeWayFixture();
  const res = executeThreeTeamTrade(st, { giveIds: ["give"], team2Id: "T2", team2PlayerIds: ["p2"], team3Id: "T3", team3PlayerIds: ["p3"] });
  assert.equal(res.ok, true, res.reason);
});

test("three-way: an over-cap club still cannot take on net salary", () => {
  const st = threeWayFixture();
  st.teams.T3.players[0] = player("p3", 74, 20); // T3 sends 20, receives T2's 100: net +80, still over
  const res = executeThreeTeamTrade(st, { giveIds: ["give"], team2Id: "T2", team2PlayerIds: ["p2"], team3Id: "T3", team3PlayerIds: ["p3"] });
  assert.equal(res.ok, false);
  assert.match(res.reason, /硬帽/);
});

// ---- trade proposals: an offer that goes out must be one that can be accepted ----

/** A CPU club over the cap, and a user star it covets. `userSalary` decides whether the CPU would TAKE ON money. */
function proposalFixture({ userStar = 300, userFiller = 40, extraCpu = [] } = {}) {
  return {
    year: 1994,
    dayIndex: 20,
    phase: "regular",
    userTeamId: "USER",
    teams: {
      USER: { name: "我方", players: [player("star", 86, userStar), ...fillers("u", 7, 65, userFiller)] },
      CPU: {
        name: "对手",
        players: [
          player("cpu-star", 85, 90),
          player("junior", 50, 20),
          player("filler-big", 55, 500),
          player("filler-mid", 90, 1890),
          ...fillers("cf", 7, 72, 10),
          ...extraCpu,
        ],
      },
    },
    playerSeason: { "USER:star": { stats: { gp: 10, pts: 220, plusMinus: 30 } } },
    tradeLog: [],
    draftAssets: [],
  };
}

test("proposals: an over-cap club that would SHED salary makes an offer with no salary throw-in", () => {
  const st = proposalFixture({ userStar: 60 }); // CPU sends cpu-star + junior (110), takes on 60
  assert.ok(teamPayroll(st.teams.CPU) > CAP, "fixture: the CPU is over the line");
  const [proposal] = generateTradeProposals(st);
  assert.ok(proposal, "an over-cap club used to be unable to offer anything");
  assert.deepEqual([...proposal.wantIds].sort(), ["cpu-star", "junior"], "nothing extra had to be thrown in");
  assert.equal(acceptTradeProposal(st, proposal.id).ok, true);
});

test("proposals: the throw-in must also fit under the PLAYER's hard cap, not just the club's", () => {
  // A 5000 contract would rescue the CPU's books but could never be absorbed by the player: the offer would
  // go out, and accepting it would bounce. The largest throw-in that suits BOTH sides is used instead.
  const st = proposalFixture({ userStar: 300, extraCpu: [player("whale", 60, 5000)] });
  const [proposal] = generateTradeProposals(st);
  assert.ok(proposal, "a smaller throw-in works");
  assert.equal(proposal.wantIds.includes("whale"), false, "never dump a contract the player cannot hold");
  assert.ok(proposal.wantIds.includes("filler-mid"));
  assert.equal(acceptTradeProposal(st, proposal.id).ok, true);
});

test("proposals: when no throw-in suits both teams, no offer is made", () => {
  // The player's books are nearly full, so any throw-in breaks the player's cap; without one the CPU would
  // take on salary over the line. There is no deal that works, so none is dangled.
  const st = proposalFixture({ userStar: 300, userFiller: 250, extraCpu: [player("whale", 60, 5000)] });
  assert.equal(generateTradeProposals(st).length, 0);
});

// ---- the invariant, swept ----

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test("every offer the generator produces can actually be accepted (300 random leagues)", () => {
  const rand = lcg(20260101);
  const pick = (lo, hi) => Math.floor(lo + rand() * (hi - lo + 1));
  let offered = 0;
  const failures = [];
  for (let n = 0; n < 300; n++) {
    const userSalaries = Array.from({ length: pick(8, 11) }, () => pick(0, 330));
    const cpuSalaries = Array.from({ length: pick(10, 13) }, () => (rand() < 0.15 ? pick(1500, 4000) : pick(0, 400)));
    const st = {
      year: 1994,
      dayIndex: 20,
      phase: "regular",
      userTeamId: "USER",
      teams: {
        USER: { name: "我方", players: userSalaries.map((sal, i) => player(i === 0 ? "star" : `u${i}`, i === 0 ? 86 : pick(55, 80), sal)) },
        CPU: { name: "对手", players: cpuSalaries.map((sal, i) => player(`c${i}`, pick(45, 90), sal)) },
      },
      playerSeason: { "USER:star": { stats: { gp: 10, pts: 220, plusMinus: 30 } } },
      tradeLog: [],
      draftAssets: [],
    };
    st.tradeProposals = generateTradeProposals(st);
    for (const proposal of st.tradeProposals) {
      offered++;
      const res = acceptTradeProposal(structuredClone(st), proposal.id);
      if (!res.ok) failures.push(`league ${n}: ${res.reason}`);
    }
  }
  assert.ok(offered > 30, `the sweep should actually exercise offers (got ${offered})`);
  assert.deepEqual(failures, [], "an offer that bounces on a cap when accepted is worse than no offer");
});
