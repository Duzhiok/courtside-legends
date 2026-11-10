/**
 * Daily Basketball Journey, end to end: complete 2 of 3 daily tasks →
 * claim today's player card by hand → the new card is usable (it lands in
 * the My Team lineup when its OVR puts it in the top 12) → the journey
 * strip shows the whole loop with the card's real lineup rank → gold and
 * XP earned along the way can be spent in the shop.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { recordRankedResult } = await import("../js/data/account.js");
const {
  canClaimDailyDraw,
  claimDailyDraw,
  dailyDrawState,
  lastDrawJourney,
  recordRankedTasks,
  taskBoard,
} = await import("../js/data/dailyTasks.js");
const { tasksHtml, journeyHtml } = await import("../js/ui/gachaView.js");
const { lineupIds } = await import("../js/data/accountRecycle.js");
const { PLAYERS, overall } = await import("../js/data/players.js");
const shop = await import("../js/data/shop.js");

const DAY1 = "2026-03-01";
const DATE1 = new Date(2026, 2, 1);

/**
 * Fabricated anchor cards (same shape as tests/dailyDraw.test.js) — the real
 * PLAYERS roster loads async from roster.json, which node tests don't have,
 * so the loop test seeds the live PLAYERS binding with its own small pool.
 * overall() reads ovr2k for anchor cards, so ranks are exact.
 */
function card(id, ovr, name) {
  const [bref, season] = id.split("-");
  return { id, bref, season: Number(season), name, team: "DEN", ovr2k: ovr, ratingSource: "anchor", skills: [], intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 } };
}
const TOP = card("jokic-2020", 90, "Nikola Jokic");
const STRONG = Array.from({ length: 12 }, (_, i) => card(`star${i}-2020`, 89 - i, `Star ${i}`));
const WEAK = card("bench-2020", 60, "Bench Player");
PLAYERS.push(TOP, ...STRONG, WEAK);

function account(extra = {}) {
  return { id: "loop-test", playerIds: [], cardMods: {}, gold: 0, rankedWins: 0, rankedLosses: 0, ...extra };
}

/** 3 ranked wins = play 3 + win 2 done = 2 of 3 tasks. */
function doTwoTasks(acc, day) {
  for (let i = 0; i < 3; i++) {
    recordRankedResult(acc, true);
    recordRankedTasks(acc, true, day);
  }
}

test("loop: tasks → claim → card in the lineup → journey shows its rank", () => {
  const acc = account();
  assert.equal(canClaimDailyDraw(acc, DAY1), false, "nothing done yet, no ticket either");
  let board = taskBoard(acc, DAY1, "zh");
  assert.equal(board.journey.tasksDone, 0);
  assert.equal(board.journey.lastDraw, null);
  assert.ok(tasksHtml(board, "zh").includes("今日篮球之旅"));
  assert.ok(tasksHtml(board, "zh").includes("抽到卡后，这里会告诉你它在阵容里的位置"));

  doTwoTasks(acc, DAY1);
  assert.equal(dailyDrawState(acc, DAY1).payWith, "tasks");
  assert.equal(canClaimDailyDraw(acc, DAY1), true);

  const result = claimDailyDraw(acc, { pool: [TOP], rng: () => 0.5, date: DATE1 });
  assert.equal(result.kind, "player");
  assert.equal(result.player.id, TOP.id);
  assert.ok(acc.playerIds.includes(TOP.id), "the card is in the binder");
  assert.ok(lineupIds(acc).has(TOP.id), "top-OVR card lands in the My Team lineup");

  board = taskBoard(acc, DAY1, "zh");
  assert.equal(board.journey.claimedToday, true);
  const last = board.journey.lastDraw;
  assert.equal(last.playerId, TOP.id);
  assert.equal(last.ovr, overall(TOP));
  assert.equal(last.inLineup, true);
  assert.equal(last.lineupRank, 1);
  const html = tasksHtml(board, "zh");
  assert.ok(html.includes(TOP.name), "the journey names the new card");
  assert.ok(html.includes("已进入 My Team 首发阵容（第 1 名）"));
  assert.ok(html.includes("今日球员卡已领取"));

  // The same day cannot claim again — the loop enforces one card a day.
  assert.throws(() => claimDailyDraw(acc, { pool: [TOP], rng: () => 0.5, date: DATE1 }), /今日球员卡已领取/);
});

test("loop: a weak card ranks outside the lineup and the strip says so", () => {
  const acc = account();
  // Twelve strong cards first, then the journey card is the 13th — outside the top-12 lineup.
  acc.playerIds = STRONG.map((p) => p.id);
  acc.cardMods = {};
  doTwoTasks(acc, DAY1);
  const result = claimDailyDraw(acc, { pool: [WEAK], rng: () => 0.5, date: DATE1 });
  assert.equal(result.player.id, WEAK.id);
  const last = lastDrawJourney(acc);
  assert.equal(last.inLineup, false, "rank 13 is outside the top-12 lineup");
  assert.equal(last.lineupRank, 13);
  assert.equal(last.collectionSize, 13);
  const html = journeyHtml(taskBoard(acc, DAY1, "zh").journey, "zh");
  assert.ok(html.includes(WEAK.name));
  assert.ok(html.includes("收藏第 13 名"));
});

test("loop: gold earned from the day buys a real shop item and it stays owned", () => {
  const acc = account({ gold: 300 });
  doTwoTasks(acc, DAY1);
  const result = claimDailyDraw(acc, { pool: [TOP], rng: () => 0.5, date: DATE1 });
  assert.ok(result.goldGain >= 0, "a pull pays its gold");
  // Ranked wins already paid milestone gold on the way (10-win steps); spend what we have.
  const before = acc.gold;
  const bought = shop.purchaseShopItem(acc, "furniture-rug");
  assert.equal(bought.ok, true, `gold ${before} must cover the ¤200 rug`);
  assert.equal(bought.gold, before - 200);
  assert.deepEqual(shop.ownedFurnitureIds(acc), ["rug"]);
  assert.equal(shop.recentPurchases(acc, 1)[0].item.id, "furniture-rug");
  // The journey strip reflects the new balance.
  const board = taskBoard(acc, DAY1, "zh");
  assert.equal(board.journey.gold, before - 200);
});
