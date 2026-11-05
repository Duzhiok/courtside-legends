import test from "node:test";
import assert from "node:assert/strict";
import { goalProgress, liveGoalProgress } from "../js/career/gameGoals.js";
import { barPercent, liveGoalsHtml } from "../js/ui/liveGoals.js";

const player = (id, stats) => ({ id, name: id, stats });
/** A live snapshot shaped like GameSim.snapshot(): you are "home". */
const snap = ({ you = 0, opp = 0, roster = [] } = {}) => ({
  youSide: "home",
  score: { home: you, away: opp },
  home: { name: "You", roster },
  away: { name: "Them", roster: [] },
});

const G = {
  margin: { id: "margin", n: 10 },
  assists: { id: "assists", n: 35 },
  steals: { id: "steals", n: 11 },
  careful: { id: "careful", n: 16 },
  balance: { id: "balance", n: 5 },
  star: { id: "star", n: 40 },
  rookie: { id: "rookie", n: 20, playerId: "kid", name: "Kid" },
};

test("an at-least goal is open until reached, then done and stays done", () => {
  const low = snap({ roster: [player("a", { ast: 20, min: 10 })] });
  const high = snap({ roster: [player("a", { ast: 20, min: 10 }), player("b", { ast: 15, min: 10 })] });
  assert.deepEqual(liveGoalProgress(low, [G.assists]).map((p) => [p.cur, p.status]), [[20, "open"]]);
  assert.deepEqual(liveGoalProgress(high, [G.assists]).map((p) => [p.cur, p.status]), [[35, "done"]]);
});

test("a turnover budget is fine until it is exceeded, then failed (exactly at the cap is still fine)", () => {
  const at = snap({ roster: [player("a", { tov: 16, min: 5 })] });
  const over = snap({ roster: [player("a", { tov: 17, min: 5 })] });
  assert.equal(liveGoalProgress(at, [G.careful])[0].status, "open");
  assert.equal(liveGoalProgress(over, [G.careful])[0].status, "failed");
});

test("a lead is 'ahead' only while it is big enough -- it can slip back to open", () => {
  const roster = [player("a", { pts: 50, min: 30 })];
  assert.equal(liveGoalProgress(snap({ you: 60, opp: 50, roster }), [G.margin])[0].status, "ahead");
  const back = liveGoalProgress(snap({ you: 60, opp: 55, roster }), [G.margin])[0];
  assert.equal(back.status, "open");
  assert.equal(back.cur, 5);
  assert.equal(liveGoalProgress(snap({ you: 40, opp: 52, roster }), [G.margin])[0].cur, -12);
});

test("balance, star and rookie read the box score the same way the verdict does", () => {
  const roster = [
    player("a", { pts: 12, min: 20 }), player("b", { pts: 10, min: 20 }), player("c", { pts: 9, min: 20 }),
    player("d", { pts: 41, min: 30 }), player("kid", { pts: 0, min: 12.9 }),
  ];
  const [balance, star, rookie] = liveGoalProgress(snap({ roster }), [G.balance, G.star, G.rookie]);
  assert.deepEqual([balance.cur, balance.status], [3, "open"]);
  assert.deepEqual([star.cur, star.status], [41, "done"]);
  assert.deepEqual([rookie.cur, rookie.status], [12, "open"]); // floored: 12.9 min is not yet 13
});

test("a rookie who has not checked in reads 0 minutes (no line at all), not a crash", () => {
  const out = liveGoalProgress(snap({ roster: [player("a", { pts: 2, min: 3 })] }), [G.rookie]);
  assert.deepEqual([out[0].cur, out[0].status], [0, "open"]);
});

test("junk in, nothing out: unknown goal, missing snapshot, non-game object", () => {
  assert.equal(goalProgress({ margin: 1 }, { id: "nope", n: 1 }), null);
  assert.equal(goalProgress(null, G.margin), null);
  assert.deepEqual(liveGoalProgress(null, [G.margin]), []);
  assert.deepEqual(liveGoalProgress({}, [G.margin]), []);
  assert.deepEqual(liveGoalProgress(snap(), undefined), []);
});

test("the live panel's verdict never disagrees with the final one for the same box score", async () => {
  const { settleGameGoals } = await import("../js/career/gameGoals.js");
  const roster = [player("a", { ast: 40, tov: 9, stl: 3, pts: 44, min: 36 }), player("kid", { min: 25 })];
  const finished = snap({ you: 110, opp: 90, roster });
  const goals = [G.assists, G.careful, G.margin, G.star, G.rookie, G.steals, G.balance];
  const live = liveGoalProgress(finished, goals);
  const st = { year: 1995, userTeamId: "t", gameGoals: { seq: 0, goals } };
  const settled = settleGameGoals(st, [], (await import("../js/career/gameRewards.js")).settleGame(finished, "home"), { handPlayed: true });
  // settleGameGoals judges only the stored first two when hand-played; compare those two.
  for (let i = 0; i < settled.goals.length; i += 1) {
    // At the buzzer a budget goal that never failed is met; every other kind is met when reached/ahead.
    const done = live[i].kind === "atMost" ? live[i].status !== "failed" : ["done", "ahead"].includes(live[i].status);
    assert.equal(settled.goals[i].done, done, `goal ${live[i].id}`);
  }
});

test("panel html: status in words, value text, per-goal data hooks, escaped, empty is empty string", () => {
  const roster = [player("a", { ast: 20, tov: 17, min: 30 })];
  const progress = liveGoalProgress(snap({ you: 40, opp: 52, roster }), [G.assists, G.careful, G.margin]);
  const html = liveGoalsHtml({ progress, lang: "zh" });
  assert.match(html, /本场目标/);
  assert.match(html, /data-goal="assists" data-status="open"/);
  assert.match(html, /data-goal="careful" data-status="failed"/);
  assert.match(html, /20 \/ 35/);
  assert.match(html, /17 \/ 16 上限/);
  assert.match(html, /落后 12 \/ 10/);
  assert.match(html, /已失败/);
  assert.equal(liveGoalsHtml({ progress: [] }), "");
  assert.equal(liveGoalsHtml(), "");
  const evil = liveGoalProgress(snap({ roster: [player("x", { min: 1 })] }), [{ id: "rookie", n: 20, playerId: "x", name: "<img src=x onerror=alert(1)>" }]);
  assert.ok(!liveGoalsHtml({ progress: evil }).includes("<img"), "player name must be escaped");
});

test("panel html in English has no Chinese", () => {
  const roster = [player("kid", { ast: 3, tov: 2, min: 5 })];
  const progress = liveGoalProgress(snap({ you: 50, opp: 45, roster }), Object.values(G));
  assert.ok(!/[\u4e00-\u9fff]/.test(liveGoalsHtml({ progress, lang: "en" })));
});

test("barPercent clamps: negative lead and a budget at zero are empty, overshoot is full", () => {
  assert.equal(barPercent({ cur: -12, target: 10 }), 0);
  assert.equal(barPercent({ cur: 0, target: 16 }), 0);
  assert.equal(barPercent({ cur: 50, target: 35 }), 100);
  assert.equal(barPercent({ cur: 7, target: 10 }), 70);
  assert.equal(barPercent(null), 0);
});
