// R89 trade tightening: deadline, deterministic value rejection,
// and pre-filtered CPU proposals (every dangled offer clears the acceptance math).
// R109: the R103 per-season count cap is gone — the NBA has no trade count limit,
// only a deadline plus salary/roster rules, so a count cap is not realism.
import test from "node:test";
import assert from "node:assert/strict";
import {
  executeThreeTeamTrade,
  executeTrade,
  pickValueOf,
  seasonTradeCount,
  tradeDeadlineDay,
} from "../js/engine/seasonMarket.js";
import { generateTradeProposals } from "../js/engine/tradeProposals.js";
import { overall } from "../js/data/players.js";

function player(id, ovr, salary = 100) {
  return { id, name: id, season: 1994, ovr2k: ovr, ratingSource: "anchor", salary, age: ovr < 80 ? 22 : 28 };
}

function seasonFixture(extra = {}) {
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
    ...extra,
  };
}

function compliantSwap(st, giveId, wantId) {
  return executeTrade(st, { giveIds: [giveId], wantIds: [wantId], cpuTeamId: "T2" });
}

test("deadline: trades close past 70% of the schedule, open before it, ignored without a schedule", () => {
  const schedule = Array.from({ length: 100 }, () => []);
  assert.equal(tradeDeadlineDay({ schedule }), 70);
  const late = seasonFixture({ schedule, dayIndex: 71 });
  const lateRes = compliantSwap(late, "u0", "t2_0");
  assert.equal(lateRes.ok, false);
  assert.match(lateRes.reason, /截止日/);
  const edge = seasonFixture({ schedule, dayIndex: 70 });
  assert.equal(compliantSwap(edge, "u0", "t2_0").ok, true);
  const noSchedule = seasonFixture();
  assert.equal(tradeDeadlineDay(noSchedule), null);
  assert.equal(compliantSwap(noSchedule, "u0", "t2_0").ok, true);
});

test("no count cap: the sixth trade — and beyond — still goes through (R109)", () => {
  const st = seasonFixture();
  for (let i = 0; i < 4; i++) {
    const res = compliantSwap(st, `u${i}`, `t2_${i}`);
    assert.equal(res.ok, true, res.reason);
  }
  assert.equal(seasonTradeCount(st), 4);
  const three = executeThreeTeamTrade(st, {
    giveIds: ["u4"],
    team2Id: "T2",
    team2PlayerIds: ["t2_4"],
    team3Id: "T3",
    team3PlayerIds: ["t3_4"],
  });
  assert.equal(three.ok, true, three.reason);
  assert.equal(seasonTradeCount(st), 5);
  // R103 used to refuse this; the NBA has no per-season trade count limit.
  const sixth = compliantSwap(st, "u5", "t2_5");
  assert.equal(sixth.ok, true, sixth.reason);
  assert.equal(seasonTradeCount(st), 6);
});

test("value rejection is deterministic: a value-losing trade never sneaks through on luck", () => {
  // Give an 80-OVR cheap player, want a 60-OVR same-salary player: value fails
  // (64 < 72) and the salary-dump clause does not rescue it (50 < 50 + 80).
  for (let run = 0; run < 10; run++) {
    const st = seasonFixture();
    st.teams.USER.players.push(player("rich", 80, 50));
    st.teams.T2.players.push(player("poor", 60, 50));
    const res = executeTrade(st, { giveIds: ["rich"], wantIds: ["poor"], cpuTeamId: "T2" });
    assert.equal(res.ok, false, `run ${run} should reject`);
    assert.match(res.reason, /吃亏/);
  }
});

test("every generated CPU proposal clears the acceptance math", () => {
  const st = seasonFixture();
  const proposals = generateTradeProposals(st, 3);
  assert.ok(proposals.length >= 1);
  for (const p of proposals) {
    const target = st.teams.USER.players.find((x) => x.id === p.giveIds[0]);
    assert.ok(target, "proposal target must still be on the user roster");
    const pkgSalary = p.receivePlayers.reduce((s, x) => s + (x.salary ?? 0), 0);
    const pkgOvr = p.receivePlayers.reduce((s, x) => s + overall(x), 0)
      + (p.offerPicks || []).reduce((s, pk) => s + pickValueOf(st, pk), 0);
    const mySalary = target.salary ?? 0;
    const myOvr = overall(target);
    const salaryOk = pkgSalary <= mySalary * 1.25 + 40 || mySalary <= pkgSalary * 1.25 + 40;
    const valueOk = pkgOvr + 4 >= myOvr * 0.9 || mySalary >= pkgSalary + 80;
    assert.ok(salaryOk && valueOk, `proposal ${p.id} must clear acceptance math`);
  }
});

test("filter: a CPU too weak to make a compliant offer dangles nothing for that star", () => {
  const st = seasonFixture();
  st.teams.USER.players = [player("giant", 99, 50), ...Array.from({ length: 7 }, (_, i) => player(`u${i}`, 70, 50))];
  // Every CPU player is old, weak and identical: no prospect stands out, and even
  // two sweetener picks cannot lift a 60-OVR package to 90% of a 99-OVR star.
  const weak = () => Array.from({ length: 8 }, (_, i) => player(`w${i}`, 60, 45));
  st.teams.T2.players = weak();
  st.teams.T3.players = weak();
  const proposals = generateTradeProposals(st, 3);
  const forGiant = proposals.filter((p) => p.targetName === "giant");
  assert.equal(forGiant.length, 0);
});
