import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_GOALS_PER_GAME, GAME_GOAL_XP_BONUS, GOAL_ASSISTS, GOAL_MARGIN, GOAL_ROOKIE_MAX_AGE, GOAL_ROOKIE_MINUTES,
  GOAL_STAR_POINTS, HAND_PLAY_XP_MULTIPLIER,
} from "../js/career/balance.js";
import { gameCoachXp } from "../js/career/coachPerks.js";
import {
  drawGameGoals, gameSeq, goalText, goalsForNextGame, rewardMultiplier, settleGameGoals,
} from "../js/career/gameGoals.js";
import { foldBatch, settleGame } from "../js/career/gameRewards.js";
import { batchHtml, postGameHtml } from "../js/ui/careerPostGameView.js";
import { pregameCardHtml } from "../js/ui/pregameCard.js";
import { realGame, realTeam } from "./helpers/realGame.js";

const KINDS = ["margin", "assists", "steals", "careful", "balance", "star", "rookie"];
const young = (id, over = {}) => ({ id, name: `Young ${id}`, age: 21, ...over });
const vet = (id) => ({ id, name: `Vet ${id}`, age: 30 });
const roster = [young("y1"), young("y2"), vet("v1"), vet("v2")];
const newSeason = (over = {}) => ({ year: 1995, userTeamId: "TEAM", ...over });
/** The skeleton of a settled game; tests lay their own `rewards` over it. */
const base = { score: { you: 100, opp: 90 }, won: true, tied: false, margin: 10, opponentName: "X", lines: [], stars: [], rewards: {} };
const line = (id, over = {}) => ({ id, name: id, min: 20, pts: 8, reb: 3, ast: 2, stl: 1, tov: 1, ...over });
/** Force the goals for the next game, the way the hub's draw would have left them. */
const withGoals = (goals, st = newSeason()) => Object.assign(st, { gameGoals: { seq: gameSeq(st), goals } });
const verdictOf = (goal, report) => settleGameGoals(withGoals([goal]), roster, report).goals[0].done;

// ---------------------------------------------------------------- drawing
test("the same game number always draws the same goals; a different one can differ", () => {
  assert.deepEqual(drawGameGoals("1995|T|3", roster), drawGameGoals("1995|T|3", roster));
  const seen = new Set();
  for (let seq = 0; seq < 40; seq++) seen.add(JSON.stringify(drawGameGoals(`1995|T|${seq}`, roster)));
  assert.ok(seen.size > 10, `40 games should not all share a handful of draws, saw ${seen.size}`);
});

test("a game gets two goals, never two of a kind, and every kind turns up eventually", () => {
  const kinds = new Set();
  for (let seq = 0; seq < 200; seq++) {
    const goals = drawGameGoals(`1995|T|${seq}`, roster);
    assert.equal(goals.length, GAME_GOALS_PER_GAME);
    assert.notEqual(goals[0].id, goals[1].id);
    for (const goal of goals) kinds.add(goal.id);
  }
  assert.deepEqual([...kinds].sort(), [...KINDS].sort());
});

test("the young-player goal names a young, healthy player, and only exists when there is one", () => {
  const injured = young("hurt", { injuredGames: 3 });
  for (let seq = 0; seq < 200; seq++) {
    const rookie = drawGameGoals(`s|${seq}`, [...roster, injured]).find((goal) => goal.id === "rookie");
    if (!rookie) continue;
    assert.ok(["y1", "y2"].includes(rookie.playerId), `picked ${rookie.playerId}`);
    assert.equal(rookie.n, GOAL_ROOKIE_MINUTES);
  }
  const veterans = [vet("a"), vet("b"), young("late", { age: GOAL_ROOKIE_MAX_AGE + 1 })];
  for (let seq = 0; seq < 100; seq++) {
    const goals = drawGameGoals(`s|${seq}`, veterans);
    assert.equal(goals.length, GAME_GOALS_PER_GAME, "no young player: still two goals, of other kinds");
    assert.ok(goals.every((goal) => goal.id !== "rookie"));
  }
  assert.equal(drawGameGoals("s|1", []).length, GAME_GOALS_PER_GAME, "an empty roster is no reason to crash");
});

test("goal text reads in both languages, names the player, and says nothing for an unknown kind", () => {
  const goals = [
    { id: "margin", n: 10 }, { id: "assists", n: 35 }, { id: "steals", n: 11 }, { id: "careful", n: 16 },
    { id: "balance", n: 5 }, { id: "star", n: 30 }, { id: "rookie", n: 20, playerId: "p", name: "Ann Lee" },
  ];
  for (const goal of goals) {
    const zh = goalText(goal, "zh");
    const en = goalText(goal, "en");
    assert.ok(zh && en, goal.id);
    assert.ok(/[\u4e00-\u9fff]/.test(zh), `zh: ${zh}`);
    assert.ok(!/[\u4e00-\u9fff]/.test(en), `en must be pure English: ${en}`);
  }
  assert.equal(goalText({ id: "rookie", n: 20, playerId: "p", name: "Ann Lee" }, "en"), "Ann Lee plays 20+ minutes");
  assert.equal(goalText({ id: "nonsense", n: 1 }, "zh"), "");
  assert.equal(goalText(null, "en"), "");
});

// ---------------------------------------------------------------- remembering
test("goals are drawn once and kept: trading a player away does not change what the hub promised", () => {
  const st = newSeason();
  const first = goalsForNextGame(st, roster);
  assert.deepEqual(st.gameGoals, { seq: 0, goals: first });
  assert.deepEqual(goalsForNextGame(st, [vet("only")]), first, "a different roster later, same promise");
});

test("a stale, unknown or damaged saved goal is redrawn instead of trusted", () => {
  const fresh = drawGameGoals("1995|TEAM|0", roster);
  const bad = [
    { seq: 7, goals: [{ id: "margin", n: 10 }] }, // another game's goals
    { seq: 0, goals: [{ id: "nonsense", n: 10 }] }, // a kind we never had
    { seq: 0, goals: [{ id: "margin", n: Number.NaN }] },
    { seq: 0, goals: [{ id: "margin", n: 0 }] },
    { seq: 0, goals: [{ id: "rookie", n: 20 }] }, // rookie goal with nobody named
    { seq: 0, goals: [] },
    { seq: 0, goals: "margin" },
    "junk", 42,
  ];
  for (const saved of bad) {
    const st = newSeason({ gameGoals: saved });
    assert.deepEqual(goalsForNextGame(st, roster), fresh, JSON.stringify(saved));
  }
  assert.equal(gameSeq({ gameSeq: -4 }), 0);
  assert.equal(gameSeq({ gameSeq: "x" }), 0);
  assert.equal(gameSeq({ gameSeq: 2.9 }), 2);
});

// ---------------------------------------------------------------- judging
test("each goal is judged at its exact threshold, and not one short of it", () => {
  const sumLines = (key, values) => values.map((value, index) => line(`p${index}`, { [key]: value }));
  const cases = [
    { goal: { id: "assists", n: 35 }, yes: { lines: sumLines("ast", [20, 15]) }, no: { lines: sumLines("ast", [20, 14]) } },
    { goal: { id: "steals", n: 11 }, yes: { lines: sumLines("stl", [6, 5]) }, no: { lines: sumLines("stl", [6, 4]) } },
    // fewer is better here: the bar is "at most"
    { goal: { id: "careful", n: 16 }, yes: { lines: sumLines("tov", [8, 8]) }, no: { lines: sumLines("tov", [8, 9]) } },
    { goal: { id: "star", n: 30 }, yes: { lines: sumLines("pts", [30, 5]) }, no: { lines: sumLines("pts", [29, 5]) } },
    { goal: { id: "balance", n: 3 }, yes: { lines: sumLines("pts", [10, 10, 10, 9]) }, no: { lines: sumLines("pts", [10, 10, 9, 9]) } },
    { goal: { id: "margin", n: 10 }, yes: { won: true, margin: 10, lines: [] }, no: { won: true, margin: 9, lines: [] } },
    { goal: { id: "rookie", n: 20, playerId: "r", name: "R" }, yes: { lines: [line("r", { min: 20 })] }, no: { lines: [line("r", { min: 19 })] } },
  ];
  for (const { goal, yes, no } of cases) {
    assert.equal(verdictOf(goal, yes), true, `${goal.id} met`);
    assert.equal(verdictOf(goal, no), false, `${goal.id} missed`);
  }
});

test("a win by 10 is only a goal if you actually won; a rookie who never played is a miss", () => {
  assert.equal(verdictOf({ id: "margin", n: 10 }, { won: false, margin: 15, lines: [] }), false);
  assert.equal(verdictOf({ id: "rookie", n: 20, playerId: "r", name: "R" }, { lines: [line("someone-else", { min: 40 })] }), false);
  assert.equal(verdictOf({ id: "assists", n: 1 }, { lines: undefined }), false, "a report with no lines is a miss, not a crash");
});

test("a sim is judged on the first goal alone; coaching it yourself judges both and pays more", () => {
  const goals = [{ id: "assists", n: 1 }, { id: "star", n: 1 }];
  const report = { won: true, margin: 3, lines: [line("a", { ast: 5, pts: 12 })] };

  const sim = settleGameGoals(withGoals(goals), roster, report);
  assert.equal(sim.goals.length, 1);
  assert.equal(sim.handPlayed, false);
  assert.equal(sim.multiplier, 1 + GAME_GOAL_XP_BONUS);

  const live = settleGameGoals(withGoals(goals), roster, report, { handPlayed: true });
  assert.equal(live.goals.length, 2);
  assert.equal(live.done, 2);
  assert.equal(live.multiplier, HAND_PLAY_XP_MULTIPLIER * (1 + 2 * GAME_GOAL_XP_BONUS));
});

test("settling uses the game up: the next one gets its own goals, drawn for its own number", () => {
  const st = newSeason();
  goalsForNextGame(st, roster);
  settleGameGoals(st, roster, { won: true, margin: 1, lines: [] });
  assert.equal(st.gameSeq, 1);
  assert.equal(st.gameGoals, undefined, "the used goals are gone");
  assert.deepEqual(goalsForNextGame(st, roster), drawGameGoals("1995|TEAM|1", roster));
  assert.equal(st.gameGoals.seq, 1);
  // a bulk sim that never showed a single goal still settles one game at a time
  const bulk = newSeason();
  for (let game = 0; game < 5; game++) settleGameGoals(bulk, roster, { won: false, margin: -1, lines: [] });
  assert.equal(bulk.gameSeq, 5);
});

test("reward multiplier: x1.5 for coaching it, +25% per goal, and they stack", () => {
  assert.equal(rewardMultiplier(), 1);
  assert.equal(rewardMultiplier({ handPlayed: true }), 1.5);
  assert.equal(rewardMultiplier({ done: 2 }), 1.5);
  assert.equal(rewardMultiplier({ handPlayed: true, done: 2 }), 2.25);
  assert.equal(rewardMultiplier({ done: -3 }), 1, "a negative count never takes XP away");
});

// ---------------------------------------------------------------- the real engine
test("REAL engine: the goals read the fields a real box score really has", () => {
  const snap = realGame(realTeam("CHI", 1996), realTeam("LAL", 2000), "home");
  const report = settleGame(snap, "home");
  assert.ok(report.lines.length >= 8, "a real game has a rotation");
  const total = (key) => report.lines.reduce((sum, row) => sum + row[key], 0);
  const ast = total("ast");
  const steals = total("stl");
  const turnovers = total("tov");
  assert.ok(ast > 5 && turnovers > 0, `real numbers (${ast} ast, ${turnovers} tov), or this test would pass for the wrong reason`);

  // Exact-sum goals: met at the true total, missed one past it. A wrong field name reads as 0 and fails here.
  assert.equal(verdictOf({ id: "assists", n: ast }, report), true);
  assert.equal(verdictOf({ id: "assists", n: ast + 1 }, report), false);
  if (steals > 0) assert.equal(verdictOf({ id: "steals", n: steals }, report), true);
  assert.equal(verdictOf({ id: "steals", n: steals + 1 }, report), false);
  assert.equal(verdictOf({ id: "careful", n: turnovers }, report), true);
  assert.equal(verdictOf({ id: "careful", n: turnovers - 1 }, report), false);
  const top = Math.max(...report.lines.map((row) => row.pts));
  assert.equal(verdictOf({ id: "star", n: top }, report), true);
  assert.equal(verdictOf({ id: "star", n: top + 1 }, report), false);
  const starter = report.lines.find((row) => row.min > 0);
  assert.equal(verdictOf({ id: "rookie", n: starter.min, playerId: starter.id, name: starter.name }, report), true);
  assert.equal(verdictOf({ id: "rookie", n: starter.min + 1, playerId: starter.id, name: starter.name }, report), false);
});

// ---------------------------------------------------------------- the coach's XP and the batch
test("coach XP takes the multiplier; no multiplier, a junk one and 1 all leave it as it was", () => {
  const base = gameCoachXp({ won: true }).xp;
  assert.equal(gameCoachXp({ won: true, multiplier: 1 }).xp, base);
  for (const junk of [0, -2, Number.NaN, Infinity, "x"]) assert.equal(gameCoachXp({ won: true, multiplier: junk }).xp, base, String(junk));
  assert.equal(gameCoachXp({ won: true, multiplier: 1.5 }).xp, Math.round(base * 1.5));
  assert.equal(gameCoachXp({ won: true, multiplier: 1.5 }).multiplier, 1.5);
  const playoff = gameCoachXp({ won: true, playoff: true, multiplier: 1.5 });
  assert.equal(playoff.xp, Math.round(base * 2 * 1.5), "playoffs and the bonus stack");
});

test("a folded stretch counts the goals that were judged, and nothing for games that had none", () => {
  const judged = (done, total) => ({
    rewards: { goal: { handPlayed: false, done, multiplier: 1, goals: Array.from({ length: total }, (_, i) => ({ id: "margin", n: 10, done: i < done })) } },
  });
  const quiet = { rewards: {} };
  const stretch = foldBatch([judged(1, 1), judged(0, 1), judged(2, 2), quiet].map((report) => ({ ...base, ...report })));
  assert.deepEqual(stretch.goals, { games: 3, done: 3, total: 4 });
  assert.equal(foldBatch([{ ...base, ...quiet }]).goals, null);
  // A goal block with nothing in it was not a judged game either: it must not inflate the game count.
  const empty = { rewards: { goal: { handPlayed: false, done: 0, multiplier: 1, goals: [] } } };
  assert.deepEqual(foldBatch([judged(1, 1), empty].map((report) => ({ ...base, ...report }))).goals, { games: 1, done: 1, total: 1 });
});

// ---------------------------------------------------------------- what the player reads
const reportWith = (goal, lang = "zh") => postGameHtml({ ...base, rewards: { goal } }, lang);
const twoGoals = (over = {}) => ({
  handPlayed: true, done: 1, multiplier: 1.875,
  goals: [{ id: "margin", n: GOAL_MARGIN, done: true }, { id: "assists", n: GOAL_ASSISTS, done: false }], ...over,
});

test("post-game card: a tick and a cross each with a text twin, the multiplier, and what made it", () => {
  const html = reportWith(twoGoals());
  assert.match(html, /本场目标/);
  assert.equal((html.match(/pg-goal-done/g) || []).length, 1);
  assert.equal((html.match(/pg-goal-miss/g) || []).length, 1);
  assert.equal((html.match(/✓/g) || []).length, 1, "one tick");
  assert.equal((html.match(/✗/g) || []).length, 1, "one cross");
  assert.match(html, /aria-label="达成"/);
  assert.match(html, /aria-label="未达成"/);
  assert.match(html, /XP ×1\.88/);
  assert.match(html, /亲自指挥 ×1\.5/);
  assert.match(html, /达成 1 个 \+25%/);
  assert.doesNotMatch(html, /模拟只计第一个目标/, "someone who coached it needs no nudge to");
});

test("post-game card after a sim nudges toward coaching it; in English it is pure English", () => {
  const sim = twoGoals({ handPlayed: false, done: 0, multiplier: 1, goals: [{ id: "star", n: GOAL_STAR_POINTS, done: false }] });
  assert.match(reportWith(sim), /模拟只计第一个目标；亲自指挥多一个目标，XP ×1\.5/);
  const en = reportWith(sim, "en");
  assert.match(en, /Game goals/);
  assert.match(en, /coach it yourself for a second goal and XP ×1\.5/);
  assert.doesNotMatch(en.replace(/<[^>]+>/g, ""), /[\u4e00-\u9fff]/);
});

test("post-game card: no judged goals, no section; the coach line shows a bonus only when there is one", () => {
  assert.doesNotMatch(reportWith(null), /本场目标/);
  assert.doesNotMatch(reportWith({ goals: [] }), /本场目标/);
  const coach = (multiplier) => postGameHtml({
    ...base, rewards: { coachXp: { xp: 12, parts: [{ id: "win", xp: 8 }], playoff: false, multiplier, level: 1, leveledUp: 0, progress: 0.3, perkPoints: 0 } },
  }, "zh");
  assert.match(coach(1.5), /奖励 ×1\.5/);
  assert.doesNotMatch(coach(1), /奖励 ×/);
});

test("a goal that names a player cannot inject markup", () => {
  const evil = { id: "rookie", n: 20, playerId: "p", name: "<img src=x onerror=alert(1)>", done: true };
  const html = reportWith(twoGoals({ goals: [evil] })) + pregameCardHtml({ goals: [evil] });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("pre-game card: both goals, the second marked as counting only if you coach, and the XP rule", () => {
  const goals = [{ id: "margin", n: 10 }, { id: "assists", n: 35 }];
  const zh = pregameCardHtml({ goals, lang: "zh" });
  assert.match(zh, /本场目标/);
  assert.match(zh, /赢下 10 分以上/);
  assert.match(zh, /全队 35 次助攻/);
  assert.equal((zh.match(/pg-pre-tag/g) || []).length, 1, "only the second goal carries the tag");
  assert.match(zh, /亲自指挥才计入/);
  assert.match(zh, /XP \+25%。亲自指挥：XP ×1\.5/);
  const en = pregameCardHtml({ goals, lang: "en" });
  assert.match(en, /Counts if you coach/);
  assert.doesNotMatch(en.replace(/<[^>]+>/g, ""), /[\u4e00-\u9fff]/);
  assert.equal(pregameCardHtml({ goals: [] }), "");
  assert.equal(pregameCardHtml({}), "");
  assert.equal((pregameCardHtml({ goals: [...goals, { id: "star", n: 30 }] }).match(/pg-pre-goal"/g) || []).length, GAME_GOALS_PER_GAME);
});

test("a stretch card shows how many goals were met", () => {
  const html = batchHtml({ ...foldBatch([]), games: 4, goals: { games: 4, done: 3, total: 6 } }, "zh");
  assert.match(html, /本段目标/);
  assert.match(html, /达成 3 \/ 6/);
  assert.doesNotMatch(batchHtml({ ...foldBatch([]), games: 4, goals: null }, "zh"), /本段目标/);
});
