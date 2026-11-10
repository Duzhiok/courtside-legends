import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { recordRankedResult } = await import("../js/data/account.js");
const {
  MILESTONE_WINS,
  DAILY_TASKS,
  WELCOME_TICKETS,
  CHALLENGE_XP,
  MILESTONE_GOLD,
  DAILY_CHALLENGES,
  DAILY_DRAW_TASKS_NEEDED,
  grantWelcomeTickets,
  recordCareerTasks,
  recordRankedTasks,
  recordChallengeProgress,
  dailyState,
  dailyDrawState,
  canClaimDailyDraw,
  taskBoard,
} = await import("../js/data/dailyTasks.js");

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

test("daily targets are 3 played / 2 won ranked and 3 gold-challenge wins; the draw needs any 2 of 3", () => {
  assert.deepEqual(DAILY_TASKS.map((t) => [t.id, t.target]), [["play", 3], ["win", 2], ["careerWin", 3]]);
  assert.equal(MILESTONE_WINS, 10);
  assert.equal(DAILY_DRAW_TASKS_NEEDED, 2);
});

test("any 2 of 3 tasks unlock the daily draw — the 3rd is not required (2026-11-09 rule)", () => {
  const acc = account();
  assert.deepEqual(playRanked(acc, true, DAY1).map((g) => g.id), [], "1 game, 1 win: nothing yet");
  assert.deepEqual(playRanked(acc, true, DAY1).map((g) => g.id), [], "2nd win: ranked pair done, career task still open");
  const unlock = playRanked(acc, false, DAY1);
  assert.deepEqual(unlock.map((g) => g.id), ["dailyDraw"], "3rd game completes the ranked pair → the draw unlocks");
  assert.equal(acc.tickets || 0, 0, "unlocking the draw grants no ticket");
  const state = dailyDrawState(acc, DAY1);
  assert.equal(state.tasksDone, 2);
  assert.equal(state.taskEligible, true);
  assert.equal(state.canClaim, true);
  assert.equal(state.payWith, "tasks");
  const board = taskBoard(acc, DAY1);
  assert.deepEqual(board.tasks.map((t) => [t.id, t.progress, t.target]), [["play", 3, 3], ["win", 2, 2], ["careerWin", 0, 3]]);
  assert.deepEqual([board.dailyDraw.tasksDone, board.dailyDraw.needed, board.dailyDraw.taskEligible], [2, 2, true]);
});

test("one task alone does not unlock the draw", () => {
  const acc = account();
  playRanked(acc, true, DAY1); // play 1/3, win 1/2 → 0 tasks done
  const state = dailyDrawState(acc, DAY1);
  assert.equal(state.tasksDone, 0);
  assert.equal(state.taskEligible, false);
  assert.equal(state.canClaim, false);
  assert.equal(state.payWith, null, "no tasks done and no banked ticket → nothing to claim with");
});

test("a new day resets the tasks and the slot", () => {
  const acc = account();
  for (let i = 0; i < 3; i++) playRanked(acc, true, DAY1);
  assert.equal(canClaimDailyDraw(acc, DAY1), true);
  const fresh = dailyDrawState(acc, DAY2);
  assert.equal(fresh.tasksDone, 0);
  assert.equal(fresh.claimed, false);
  assert.equal(fresh.canClaim, false, "day 2 starts from zero");
  const board = taskBoard(acc, "2026-03-03");
  assert.equal(board.tasks.every((t) => !t.claimed && t.progress === 0), true);
  assert.equal(board.dailyDraw.claimed, false);
});

test("every MILESTONE_WINS lifetime ranked wins grants ¤50 gold, never twice", () => {
  const acc = account();
  let milestoneGold = 0;
  for (let i = 0; i < MILESTONE_WINS * 2; i++) {
    const day = `2026-04-${String(i + 1).padStart(2, "0")}`; // new day each game → dailies reset
    const granted = playRanked(acc, true, day);
    milestoneGold += granted.filter((g) => g.id === "milestone").reduce((s, g) => s + g.gold, 0);
  }
  assert.equal(milestoneGold, MILESTONE_GOLD * 2);
  assert.equal(acc.gold, 20 * 40 + MILESTONE_GOLD * 2, "20 ranked wins at +40 each, plus 2 milestone rewards");
  assert.equal(acc.milestoneClaimed, 2);
  // replaying the same settle does not double pay
  assert.deepEqual(recordRankedTasks(acc, false, "2026-04-10").filter((g) => g.id === "milestone"), []);
});

/**
 * The daily challenge: the three 每日任务 (play 3 ranked, win 2 ranked, win 3 gold-challenge)
 * unlock one player card a day, so there was no reason to ever touch the gold tournament
 * or a full time-travel season just for ticket income. This is one randomly-assigned hard
 * accomplishment a day, worth +40 account XP, reported by whatever game-mode completion
 * hook matches its id.
 */
test("taskBoard always surfaces today's assigned challenge, unclaimed on a fresh day", () => {
  const acc = account();
  const board = taskBoard(acc, DAY1);
  assert.ok(board.challenge, "a challenge must be assigned, not missing");
  assert.ok(DAILY_CHALLENGES.some((c) => c.id === board.challenge.id), "must be one of the real pool entries");
  assert.equal(board.challenge.xp, CHALLENGE_XP);
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

test("recordChallengeProgress pays +40 account XP only when the id matches today's assigned challenge", () => {
  const acc = account();
  dailyState(acc, DAY1, () => 0); // pins today's challenge to DAILY_CHALLENGES[0]
  const wrongId = DAILY_CHALLENGES.find((c) => c.id !== DAILY_CHALLENGES[0].id).id;
  assert.equal(recordChallengeProgress(acc, wrongId, DAY1), null, "wrong accomplishment pays nothing");
  assert.equal(acc.axp?.totalXp || 0, 0);

  const grant = recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY1);
  assert.ok(grant, "the matching accomplishment must pay out");
  assert.equal(grant.kind, "xp");
  assert.equal(grant.xp, CHALLENGE_XP);
  assert.equal(acc.axp.totalXp, CHALLENGE_XP);
});

test("recordChallengeProgress never pays twice for the same day, even if the accomplishment repeats", () => {
  const acc = account();
  dailyState(acc, DAY1, () => 0);
  recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY1);
  const second = recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY1);
  assert.equal(second, null, "claiming the same challenge twice in one day must no-op");
  assert.equal(acc.axp.totalXp, CHALLENGE_XP, "XP must not double");
});

test("a new day rolls a fresh challenge that can be claimed again", () => {
  const acc = account();
  dailyState(acc, DAY1, () => 0);
  recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY1);
  assert.equal(acc.axp.totalXp, CHALLENGE_XP);

  dailyState(acc, DAY2, () => 0); // new day -> challenge resets to unclaimed
  const grant = recordChallengeProgress(acc, DAILY_CHALLENGES[0].id, DAY2);
  assert.ok(grant, "the next day's matching accomplishment must pay out again");
  assert.equal(acc.axp.totalXp, CHALLENGE_XP * 2);
});

test("recordChallengeProgress is a safe no-op with no account, no id, or an unknown id", () => {
  assert.equal(recordChallengeProgress(null, "goldChampion", DAY1), null);
  const acc = account();
  assert.equal(recordChallengeProgress(acc, null, DAY1), null);
  assert.equal(recordChallengeProgress(acc, "not-a-real-challenge", DAY1), null);
  assert.equal(acc.axp?.totalXp || 0, 0);
});

/**
 * R47 rebalance: day one used to hand out 5 premium pulls before any real
 * play (welcome 4 + free 1). The welcome gift is 2 now, and the third daily
 * task ticket moved into the gold ladder （金币挑战赛）. 2026-11-09: the three
 * daily tasks together unlock one player card a day when any 2 are done.
 */
test("welcome gift is the rebalanced 2 tickets", () => {
  assert.equal(WELCOME_TICKETS, 2);
});

test("career wins alone do not unlock the draw; the unlock fires when the 2nd task completes", () => {
  const acc = account();
  assert.deepEqual(recordCareerTasks(acc, false, DAY1), [], "a loss must not pay");
  assert.deepEqual(recordCareerTasks(acc, true, DAY1), [], "1 win: not yet");
  assert.deepEqual(recordCareerTasks(acc, true, DAY1), [], "2 wins: not yet");
  assert.deepEqual(recordCareerTasks(acc, true, DAY1), [], "3rd win: career task done, but the ranked pair is still open");
  assert.equal(dailyDrawState(acc, DAY1).tasksDone, 1);
  assert.equal(canClaimDailyDraw(acc, DAY1), false);
  for (let i = 0; i < 3; i++) playRanked(acc, true, DAY1);
  // the 3rd ranked win completes the ranked pair → the draw unlocks there
  assert.equal(canClaimDailyDraw(acc, DAY1), true);
  assert.deepEqual(recordCareerTasks(acc, true, DAY1), [], "a 4th career win the same day pays nothing more");
  for (let i = 0; i < 2; i++) recordCareerTasks(acc, true, DAY2);
  const day2Unlock = [];
  for (let i = 0; i < 3; i++) day2Unlock.push(...playRanked(acc, true, DAY2).map((g) => g.id));
  assert.deepEqual(day2Unlock, ["dailyDraw"], "a new day unlocks again once the 2nd task completes");
  assert.deepEqual(recordCareerTasks(acc, true, DAY2), [], "the unlock already fired — no second note");
  assert.equal(canClaimDailyDraw(acc, DAY2), true);
});

test("the unlock note fires exactly once per day", () => {
  const acc = account();
  for (let i = 0; i < 3; i++) playRanked(acc, true, DAY1); // play + win
  for (let i = 0; i < 3; i++) recordCareerTasks(acc, true, DAY1); // careerWin
  const board = taskBoard(acc, DAY1);
  assert.deepEqual(board.tasks.map((t) => t.id), ["play", "win", "careerWin"]);
  assert.ok(board.tasks.every((t) => t.claimed));
  assert.equal(board.dailyDraw.taskEligible, true);
  // replaying the same settle does not re-fire the unlock
  assert.deepEqual(recordRankedTasks(acc, true, DAY1), []);
});

test("recordCareerTasks is a safe no-op without an account", () => {
  assert.deepEqual(recordCareerTasks(null, true, DAY1), []);
});

test("task board renders progress and the 2-of-3 draw row, and English mode has no Chinese left", async () => {
  const { tasksHtml } = await import("../js/ui/gachaView.js");
  const acc = account();
  playRanked(acc, true, DAY1);
  const en = tasksHtml(taskBoard(acc, DAY1, "en"), "en");
  assert.match(en, /Play 3 ranked games <span class="tiny">1\/3<\/span>/);
  assert.match(en, /Complete any 2 to claim today's player card <span class="tiny">0\/2<\/span>/);
  assert.match(en, /Account XP \+40/);
  assert.doesNotMatch(en, /[\u4e00-\u9fff]/, "no CJK characters in the English task board");
  const zh = tasksHtml(taskBoard(acc, DAY1), "zh");
  assert.match(zh, /排位赢 2 场 <span class="tiny">1\/2<\/span>/);
  assert.match(zh, /完成任意 2 项领取今日球员卡 <span class="tiny">0\/2<\/span>/);
  assert.match(zh, /账号经验 \+40/);
});
