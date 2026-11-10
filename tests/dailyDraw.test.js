import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { recordRankedResult } = await import("../js/data/account.js");
const {
  canClaimDailyDraw,
  claimDailyDraw,
  dailyDrawState,
  recordRankedTasks,
  taskBoard,
} = await import("../js/data/dailyTasks.js");

const { MAX_CARDS } = await import("../js/data/accountRecycle.js");

const DAY1 = "2026-03-01";
const DAY2 = "2026-03-02";
const DATE1 = new Date(2026, 2, 1); // same local day as DAY1
const DATE2 = new Date(2026, 2, 2);

function card(id, ovr) {
  const [bref, season] = id.split("-");
  return { id, bref, season: Number(season), team: "DEN", ovr2k: ovr, ratingSource: "anchor", skills: [], intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 } };
}

const POOL = [card("jokic-2020", 90)];

function account(extra = {}) {
  return { id: "dd-test", playerIds: [], cardMods: {}, gold: 0, rankedWins: 0, rankedLosses: 0, ...extra };
}

/** 3 ranked wins = play + win done = 2 of 3 tasks. */
function doTwoTasks(acc, day) {
  for (let i = 0; i < 3; i++) {
    recordRankedResult(acc, true);
    recordRankedTasks(acc, true, day);
  }
}

test("2 of 3 tasks unlock the draw and the claim pays one card, no ticket spent", () => {
  const acc = account({ tickets: 2 });
  assert.equal(dailyDrawState(acc, DAY1).payWith, "ticket", "banked tickets alone can claim — tasks just make it free");
  doTwoTasks(acc, DAY1);
  assert.equal(canClaimDailyDraw(acc, DAY1), true);
  assert.equal(dailyDrawState(acc, DAY1).payWith, "tasks", "with 2 tasks done the free route wins over tickets");
  const result = claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 });
  assert.equal(result.outcome, "new");
  assert.deepEqual(acc.playerIds, ["jokic-2020"]);
  assert.equal(result.usedTicket, false, "the task route is free");
  assert.equal(acc.tickets, 2, "banked tickets are untouched");
  assert.equal(dailyDrawState(acc, DAY1).claimed, true);
});

test("the 1/day cap is enforced: a second claim the same day throws, even with tickets banked", () => {
  const acc = account({ tickets: 5 });
  doTwoTasks(acc, DAY1);
  claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 });
  assert.throws(() => claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 }), /今日球员卡已领取/);
  assert.equal(acc.playerIds.length, 1, "no second card");
  assert.equal(acc.tickets, 5, "no ticket was spent on the refused claim");
});

test("no duplicate claim after a reload: the claimed marker survives a fresh read of the same account", () => {
  const acc = account();
  doTwoTasks(acc, DAY1);
  claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 });
  // a reload re-reads the saved account — simulate by re-deriving state from the same object
  const reloaded = JSON.parse(JSON.stringify(acc));
  assert.equal(dailyDrawState(reloaded, DAY1).claimed, true);
  assert.equal(canClaimDailyDraw(reloaded, DAY1), false);
  assert.throws(() => claimDailyDraw(reloaded, { pool: POOL, rng: () => 0.5, date: DATE1 }), /今日球员卡已领取/);
});

test("a new day resets the slot: yesterday's claim does not block today's", () => {
  const acc = account();
  doTwoTasks(acc, DAY1);
  claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 });
  assert.equal(canClaimDailyDraw(acc, DAY2), false, "today's tasks are not done yet");
  doTwoTasks(acc, DAY2);
  assert.equal(canClaimDailyDraw(acc, DAY2), true);
  const result = claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE2 });
  assert.equal(result.outcome, "starUp", "the same card again stars up instead of duplicating");
  assert.equal(acc.playerIds.length, 1);
});

test("accounts do not share claims: one account's claim leaves the other's slot open", () => {
  const a = account({ id: "dd-a" });
  const b = account({ id: "dd-b" });
  doTwoTasks(a, DAY1);
  doTwoTasks(b, DAY1);
  claimDailyDraw(a, { pool: POOL, rng: () => 0.5, date: DATE1 });
  assert.equal(canClaimDailyDraw(a, DAY1), false);
  assert.equal(canClaimDailyDraw(b, DAY1), true, "B's slot is independent of A's claim");
  claimDailyDraw(b, { pool: POOL, rng: () => 0.5, date: DATE1 });
  assert.deepEqual([a.playerIds, b.playerIds], [["jokic-2020"], ["jokic-2020"]]);
});

test("the legacy ticket route claims the same slot: one ticket, one card, no second claim", () => {
  const acc = account({ tickets: 1 });
  assert.equal(dailyDrawState(acc, DAY1).payWith, "ticket");
  const result = claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 });
  assert.equal(result.usedTicket, true);
  assert.equal(acc.tickets, 0);
  assert.equal(dailyDrawState(acc, DAY1).claimed, true);
  assert.equal(canClaimDailyDraw(acc, DAY1), false, "the ticket claim used up the day's slot");
});

test("a claim with no unlock and no ticket throws and spends nothing", () => {
  const acc = account({ tickets: 0, gold: 1000 });
  assert.throws(() => claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 }), /任意 2 个/);
  assert.equal(acc.playerIds.length, 0);
  assert.equal(acc.gold, 1000, "gold is never touched by the draw");
});

test("a full binder does not consume the claim", () => {
  const ids = Array.from({ length: MAX_CARDS }, (_, i) => `x${i}-2000`);
  const acc = account({ playerIds: ids });
  doTwoTasks(acc, DAY1);
  assert.equal(canClaimDailyDraw(acc, DAY1), true);
  assert.throws(() => claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 }), /卡库已满/);
  assert.equal(dailyDrawState(acc, DAY1).claimed, false, "the failed claim leaves the slot open");
  assert.equal(canClaimDailyDraw(acc, DAY1), true);
});

test("a pending 成色 choice blocks the claim until it is resolved", () => {
  const acc = account({ playerIds: ["jokic-2020"], cardMods: { "jokic-2020": { merges: 0, skills: [], roll: 77 } }, pendingRoll: { cardId: "jokic-2020", current: { seed: 77 }, candidate: { seed: 88 } } });
  doTwoTasks(acc, DAY1);
  assert.equal(canClaimDailyDraw(acc, DAY1), false, "pendingRoll blocks the slot");
  assert.throws(() => claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 }), /先选择成色/);
});

test("the task board shows the draw slot state for the UI", () => {
  const acc = account();
  let board = taskBoard(acc, DAY1);
  assert.deepEqual([board.dailyDraw.tasksDone, board.dailyDraw.needed, board.dailyDraw.claimed, board.dailyDraw.canClaim], [0, 2, false, false]);
  doTwoTasks(acc, DAY1);
  board = taskBoard(acc, DAY1);
  assert.deepEqual([board.dailyDraw.tasksDone, board.dailyDraw.taskEligible, board.dailyDraw.payWith], [2, true, "tasks"]);
  claimDailyDraw(acc, { pool: POOL, rng: () => 0.5, date: DATE1 });
  board = taskBoard(acc, DAY1);
  assert.equal(board.dailyDraw.claimed, true);
  assert.equal(board.dailyDraw.canClaim, false);
});
