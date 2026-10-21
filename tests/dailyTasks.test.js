import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { recordRankedResult } = await import("../js/data/account.js");
const { MILESTONE_WINS, WELCOME_TICKETS, grantWelcomeTickets, recordRankedTasks, taskBoard } = await import("../js/data/dailyTasks.js");
const { drawAvailability, performDailyDraw } = await import("../js/data/accountGacha.js");

const DAY1 = "2026-03-01";
const DAY2 = "2026-03-02";

function account(extra = {}) {
  return { id: "t", playerIds: [], cardMods: {}, gold: 0, rankedWins: 0, rankedLosses: 0, ...extra };
}

/** What handleRankedResult does, minus the UI. */
function playRanked(acc, won, day) {
  recordRankedResult(acc, won);
  return recordRankedTasks(acc, won, day);
}

test("welcome tickets are granted exactly once", () => {
  const acc = account();
  assert.equal(grantWelcomeTickets(acc), WELCOME_TICKETS);
  assert.equal(grantWelcomeTickets(acc), 0);
  assert.equal(acc.tickets, WELCOME_TICKETS);
});

test("first ranked game of the day pays the 'play' ticket, a win pays 'win'", () => {
  const acc = account();
  const loss = playRanked(acc, false, DAY1);
  assert.deepEqual(loss.map((g) => g.id), ["play"]);
  const win = playRanked(acc, true, DAY1);
  assert.deepEqual(win.map((g) => g.id), ["win"]);
  assert.equal(acc.tickets, 2);
});

test("daily tasks pay once per day, no matter how many games", () => {
  const acc = account();
  for (let i = 0; i < 6; i++) playRanked(acc, i % 2 === 0, DAY1);
  // 3 wins → no milestone yet (needs 5); only the two daily tickets
  assert.equal(acc.tickets, 2);
});

test("a new day resets the tasks", () => {
  const acc = account();
  playRanked(acc, true, DAY1);
  assert.equal(acc.tickets, 2);
  playRanked(acc, true, DAY2);
  assert.equal(acc.tickets, 4);
  assert.equal(taskBoard(acc, "2026-03-03").tasks.every((t) => !t.claimed), true);
});

test("every 5 lifetime ranked wins grants one ticket, never twice", () => {
  const acc = account();
  let milestoneTickets = 0;
  for (let i = 0; i < MILESTONE_WINS * 2; i++) {
    const day = `2026-04-${String(i + 1).padStart(2, "0")}`; // new day each game → dailies reset
    const granted = playRanked(acc, true, day);
    milestoneTickets += granted.filter((g) => g.id === "milestone").reduce((s, g) => s + g.tickets, 0);
  }
  assert.equal(milestoneTickets, 2);
  assert.equal(acc.milestoneClaimed, 2);
  // replaying the same settle does not double pay
  assert.deepEqual(recordRankedTasks(acc, false, "2026-04-10").filter((g) => g.id === "milestone"), []);
});

test("tickets are spent after the free pull and before gold", () => {
  const acc = account({ tickets: 2, gold: 1000, lastDailyDraw: DAY1 });
  const date = new Date(2026, 2, 1); // same local day as DAY1
  const pool = [{ id: "a-2000", bref: "a", season: 2000, team: "CHI", ovr2k: 60, ratingSource: "anchor", skills: [] }];
  const result = performDailyDraw(acc, { pool, rng: () => 0.5, date });
  assert.equal(result.usedTicket, true);
  assert.equal(result.paidGold, 0);
  assert.equal(acc.tickets, 1);
  assert.equal(acc.gold, 1000 + 20, "only the low-pull refund, no gold spent");
  assert.equal(drawAvailability(acc, DAY1).tickets, 1);
});

test("with no free pull, no tickets and no gold, drawing is refused", () => {
  const acc = account({ lastDailyDraw: DAY1 });
  assert.throws(() => performDailyDraw(acc, { pool: [], rng: () => 0.5, date: new Date(2026, 2, 1) }), /都用完了/);
});
