import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { recordRankedResult } = await import("../js/data/account.js");
const {
  MILESTONE_WINS,
  DAILY_TASKS,
  WELCOME_TICKETS,
  CHALLENGE_TICKETS,
  DAILY_CHALLENGES,
  grantWelcomeTickets,
  recordCareerTasks,
  recordRankedTasks,
  recordChallengeProgress,
  dailyState,
  taskBoard,
} = await import("../js/data/dailyTasks.js");
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

test("daily targets are 3 played / 2 won ranked and 3 gold-challenge wins (harder than the old 1/1/1)", () => {
  assert.deepEqual(DAILY_TASKS.map((t) => [t.id, t.target]), [["play", 3], ["win", 2], ["careerWin", 3]]);
  assert.equal(MILESTONE_WINS, 10);
});

test("ranked tasks pay only once the day's count reaches the target", () => {
  const acc = account();
  assert.deepEqual(playRanked(acc, true, DAY1).map((g) => g.id), [], "1 game, 1 win: nothing yet");
  assert.deepEqual(playRanked(acc, true, DAY1).map((g) => g.id), ["win"], "2nd win pays 'win'");
  assert.deepEqual(playRanked(acc, false, DAY1).map((g) => g.id), ["play"], "3rd game pays 'play'");
  assert.equal(acc.tickets, 2);
  const board = taskBoard(acc, DAY1);
  assert.deepEqual(board.tasks.map((t) => [t.id, t.progress, t.target]), [["play", 3, 3], ["win", 2, 2], ["careerWin", 0, 3]]);
});

test("daily tasks pay once per day, no matter how many games", () => {
  const acc = account();
  for (let i = 0; i < 6; i++) playRanked(acc, i % 2 === 0, DAY1);
  // 3 wins → no milestone yet (needs 10); only the two ranked daily tickets
  assert.equal(acc.tickets, 2);
});

test("a new day resets the tasks", () => {
  const acc = account();
  for (let i = 0; i < 3; i++) playRanked(acc, true, DAY1);
  assert.equal(acc.tickets, 2);
  playRanked(acc, true, DAY2);
  assert.equal(acc.tickets, 2, "day 2 starts from zero, one game pays nothing");
  const fresh = taskBoard(acc, "2026-03-03").tasks;
  assert.equal(fresh.every((t) => !t.claimed && t.progress === 0), true);
});

test("every MILESTONE_WINS lifetime ranked wins grants one ticket, never twice", () => {
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

/**
 * The daily challenge: the two 每日任务 (play 1 ranked, win 1 ranked) pay out trivially from a
 * single match, so there was no reason to ever touch the gold tournament or a full time-travel
 * season just for ticket income. This is one randomly-assigned hard accomplishment a day, worth
 * more, reported by whatever game-mode completion hook matches its id.
 */
test("taskBoard always surfaces today's assigned challenge, unclaimed on a fresh day", () => {
  const acc = account();
  const board = taskBoard(acc, DAY1);
  assert.ok(board.challenge, "a challenge must be assigned, not missing");
  assert.ok(DAILY_CHALLENGES.some((c) => c.id === board.challenge.id), "must be one of the real pool entries");
  assert.equal(board.challenge.tickets, CHALLENGE_TICKETS);
  assert.equal(board.challenge.claimed, false);
});

test("the assigned challenge is sticky for the whole day, not re-rolled on every read", () => {
  const acc = account();
  const first = taskBoard(acc, DAY1).challenge.id;
  for (let i = 0; i < 10; i++) {
    assert.equal(taskBoard(acc, DAY1).challenge.id, first, "must not change within the same day");
  }
});

test("dailyState honors an injected rng, so the pick is deterministic and testable", () => {
  const acc = account();
  const day = dailyState(acc, DAY1, () => 0);
  assert.equal(day.challengeId, DAILY_CHALLENGES[0].id, "rng() => 0 must pick the first pool entry");
});

test("recordChallengeProgress pays out only when the id matches today's assigned challenge", () => {
  const acc = account();
  dailyState(acc, DAY1, () => 0); // pins today's challenge to DAILY_CHALLENGES[0]
  const wrongId = DAILY_CHALLENGES.find((c) => c.id !== DAILY_CHALLENGES[0].id).id;
  assert.equal(recordChallengeProgress(acc, wrongId, DAY1), null, "wrong accomplishment pays nothing");
  assert.equal(acc.tickets || 0, 0);

  const grant = recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY1);
  assert.ok(grant, "the matching accomplishment must pay out");
  assert.equal(grant.tickets, CHALLENGE_TICKETS);
  assert.equal(acc.tickets, CHALLENGE_TICKETS);
});

test("recordChallengeProgress never pays twice for the same day, even if the accomplishment repeats", () => {
  const acc = account();
  dailyState(acc, DAY1, () => 0);
  recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY1);
  const second = recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY1);
  assert.equal(second, null, "claiming the same challenge twice in one day must no-op");
  assert.equal(acc.tickets, CHALLENGE_TICKETS, "ticket count must not double");
});

test("a new day rolls a fresh challenge that can be claimed again", () => {
  const acc = account();
  dailyState(acc, DAY1, () => 0);
  recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY1);
  assert.equal(acc.tickets, CHALLENGE_TICKETS);

  dailyState(acc, DAY2, () => 0); // new day -> challenge resets to unclaimed
  const grant = recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY2);
  assert.ok(grant, "the next day's matching accomplishment must pay out again");
  assert.equal(acc.tickets, CHALLENGE_TICKETS * 2);
});

test("recordChallengeProgress is a safe no-op with no account, no id, or an unknown id", () => {
  assert.equal(recordChallengeProgress(null, "goldChampion", DAY1), null);
  const acc = account();
  assert.equal(recordChallengeProgress(acc, null, DAY1), null);
  assert.equal(recordChallengeProgress(acc, "not-a-real-challenge", DAY1), null);
  assert.equal(acc.tickets || 0, 0);
});

/**
 * R47 rebalance: day one used to hand out 5 premium pulls before any real
 * play (welcome 4 + free 1). The welcome gift is 2 now, and the third daily
 * task ticket moved into the gold ladder （金币挑战赛） so a daily ticket is
 * earned in the tournament mode, not only in ranked.
 */
test("welcome gift is the rebalanced 2 tickets", () => {
  assert.equal(WELCOME_TICKETS, 2);
});

test("career wins pay the 金币挑战赛 ticket once the day reaches 3 wins; losses pay nothing", () => {
  const acc = account();
  assert.deepEqual(recordCareerTasks(acc, false, DAY1), [], "a loss must not pay");
  assert.deepEqual(recordCareerTasks(acc, true, DAY1), [], "1 win: not yet");
  assert.deepEqual(recordCareerTasks(acc, true, DAY1), [], "2 wins: not yet");
  assert.deepEqual(recordCareerTasks(acc, true, DAY1).map((g) => g.id), ["careerWin"], "3rd win pays");
  assert.equal(acc.tickets, 1);
  assert.deepEqual(recordCareerTasks(acc, true, DAY1), [], "4th win the same day pays nothing more");
  assert.equal(acc.tickets, 1);
  for (let i = 0; i < 2; i++) recordCareerTasks(acc, true, DAY2);
  assert.deepEqual(recordCareerTasks(acc, true, DAY2).map((g) => g.id), ["careerWin"], "a new day pays again");
  assert.equal(acc.tickets, 2);
});

test("ranked pair + career task stack to 3 daily task tickets, each once", () => {
  const acc = account();
  for (let i = 0; i < 3; i++) playRanked(acc, true, DAY1); // play + win
  for (let i = 0; i < 3; i++) recordCareerTasks(acc, true, DAY1); // careerWin
  assert.equal(acc.tickets, 3);
  const board = taskBoard(acc, DAY1);
  assert.deepEqual(board.tasks.map((t) => t.id), ["play", "win", "careerWin"]);
  assert.ok(board.tasks.every((t) => t.claimed));
});

test("recordCareerTasks is a safe no-op without an account", () => {
  assert.deepEqual(recordCareerTasks(null, true, DAY1), []);
});

test("task board renders progress, and English mode has no Chinese left", async () => {
  const { tasksHtml } = await import("../js/ui/gachaView.js");
  const acc = account();
  playRanked(acc, true, DAY1);
  const en = tasksHtml(taskBoard(acc, DAY1, "en"), "en");
  assert.match(en, /Play 3 ranked games <span class="tiny">1\/3<\/span>/);
  assert.doesNotMatch(en, /[\u4e00-\u9fff]/, "no CJK characters in the English task board");
  assert.match(tasksHtml(taskBoard(acc, DAY1), "zh"), /排位赢 2 场 <span class="tiny">1\/2<\/span>/);
});
