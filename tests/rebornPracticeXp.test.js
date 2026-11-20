/**
 * Practice-day XP (Alpha Playability): game XP is minutes-based, so a rookie who rides the bench grew nothing and
 * the weekly training focus was an empty choice. A completed training WEEK now pays a fixed, capped practice XP.
 * It never raises a cap or a ceiling, never touches the league career (it only pays a line marked `practice`),
 * and OVR moves only through the existing +1-per-level path.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { awardGrowth, practiceXp } from "../js/career/playerGrowth.js";
import { GROWTH_PRACTICE_XP, GROWTH_XP_PER_LEVEL } from "../js/career/balance.js";
import { describeGrowth } from "../js/reborn/training.js";
import { createRebornState } from "../js/reborn/identity.js";
import { buildSeason, playGame } from "../js/reborn/season.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const player = (age) => ({ id: "p1", bref: "p1", name: "Bench Guy", age, season: 1997, defense: 50, rebound: 50, block: 50, pass: 50 });
const award = (age, line, extra = {}) => awardGrowth({ year: 1997, players: [player(age)], lines: [line], plans: { p1: { focus: "defense" } }, ...extra });

test("practice XP is a fixed amount times the youth factor, only for a line marked practice", () => {
  assert.equal(practiceXp({ practice: true }, 26), GROWTH_PRACTICE_XP);
  assert.equal(practiceXp({ practice: true }, 20), Math.round(GROWTH_PRACTICE_XP * 1.6));
  assert.equal(practiceXp({ practice: true }, 23), Math.round(GROWTH_PRACTICE_XP * 1.35));
  assert.equal(practiceXp({ practice: true }, 30), Math.round(GROWTH_PRACTICE_XP * 0.7));
  assert.equal(practiceXp({ min: 30, score: 8 }, 26), 0, "a plain game line earns no practice XP");
  assert.equal(practiceXp(null, 26), 0);
});

test("a player who never left the bench still earns his training week (0 minutes)", () => {
  const out = award(26, { id: "p1", min: 0, score: 0, practice: true });
  assert.equal(out.growth.p1.xp, GROWTH_PRACTICE_XP);
  assert.equal(out.entries[0].practice, GROWTH_PRACTICE_XP);
  assert.equal(out.entries[0].xp, GROWTH_PRACTICE_XP);
});

test("no training week, no minutes: nothing (no free ride)", () => {
  const out = award(26, { id: "p1", min: 0, score: 0 });
  assert.equal(out.growth.p1, undefined);
  assert.deepEqual(out.entries, []);
});

test("practice XP stacks on game XP and rides the same multiplier (intensive training)", () => {
  const plain = award(26, { id: "p1", min: 10, score: 4, practice: true }).entries[0];
  const boosted = award(26, { id: "p1", min: 10, score: 4, practice: true }, { xpMultiplier: 1.5 }).entries[0];
  assert.equal(plain.xp, Math.round(10 * 0.8 * 1) + GROWTH_PRACTICE_XP);
  assert.equal(boosted.practice, Math.round(GROWTH_PRACTICE_XP * 1.5));
  assert.ok(boosted.xp > plain.xp);
});

test("the season level cap still binds: practice cannot out-grow it", () => {
  // Age 26 banks at most 2 levels a season, however much practice XP arrives.
  let growth = {};
  let levels = 0;
  for (let week = 1; week <= 80; week += 1) {
    const out = awardGrowth({ growth, year: 1997, players: [player(26)], lines: [{ id: "p1", min: 0, score: 0, practice: true }], plans: { p1: { focus: "defense" } } });
    growth = out.growth;
    levels = growth.p1.levels;
  }
  assert.equal(levels, 2);
  assert.ok(growth.p1.xp <= GROWTH_XP_PER_LEVEL, "the bar sits full instead of overflowing");
});

test("a diligent 26-year-old bench rookie banks about one level in a 20-week season", () => {
  let growth = {};
  for (let week = 1; week <= 20; week += 1) {
    growth = awardGrowth({ growth, year: 1997, players: [player(26)], lines: [{ id: "p1", min: 1, score: 0, practice: true }], plans: { p1: { focus: "defense" } } }).growth;
  }
  assert.equal(growth.p1.levels, 1);
});

test("a veteran past 32 gains no levels from practice either (the real curve already has him declining)", () => {
  const out = award(34, { id: "p1", min: 0, score: 0, practice: true });
  assert.equal(out.entries[0].levels, 0);
  assert.equal(out.changes.p1, undefined);
});

test("the report says it, zh + en, with level progress", () => {
  const entries = award(26, { id: "p1", min: 0, score: 0, practice: true }).entries;
  const zh = describeGrowth(entries, "zh");
  const en = describeGrowth(entries, "en");
  assert.match(zh[0], /训练日：不上场也在进步，本周训练 \+60 经验（升级进度 5%）/);
  assert.match(en[0], /Practice day: you grow off the court too, \+60 XP this week \(level progress 5%\)/);
});

test("real engine: a Reborn bench rookie earns practice XP on the week's last game, and only then", async () => {
  let reborn = createRebornState("rookie-trial-3", ROWS); // historical bench player
  const season = buildSeason(reborn, ROWS);
  const practiceByGame = [];
  for (let i = 0; i < 8; i += 1) {
    reborn.player.training = { focus: "defense", week: Math.floor(season.index / 4) + 1 };
    const out = await playGame(reborn, season, ROWS, { trainingDone: true });
    reborn = out.reborn;
    practiceByGame.push(out.report.growth.reduce((n, e) => n + (e.practice || 0), 0));
  }
  assert.deepEqual(practiceByGame.map((n) => n > 0), [false, false, false, true, false, false, false, true]);
  assert.ok(practiceByGame[3] >= GROWTH_PRACTICE_XP * 0.7);
  // Without finishing the week's training there is nothing to pay.
  const idle = createRebornState("rookie-trial-3", ROWS);
  const s2 = buildSeason(idle, ROWS);
  let r2 = idle;
  for (let i = 0; i < 4; i += 1) r2 = (await playGame(r2, s2, ROWS, { trainingDone: false })).reborn;
  assert.ok(Object.values(r2.player.growth).every((e) => e.xp < GROWTH_PRACTICE_XP), "no training, no practice XP");
});

test("the report never repeats the practice XP, and a game's own XP keeps its line (with a real name)", () => {
  const both = award(26, { id: "p1", name: "Bench Guy", min: 10, score: 4, practice: true }).entries;
  const lines = describeGrowth(both, "zh");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /训练日.*\+60 经验/);
  assert.match(lines[1], /^训练经验 \+8（Bench Guy）$/);
  const only = describeGrowth(award(26, { id: "p1", name: "Bench Guy", min: 0, score: 0, practice: true }).entries, "zh");
  assert.equal(only.length, 1, "practice alone is one line, not two");
  assert.doesNotMatch(only.join(" "), /undefined/);
});

test("a real Reborn game's growth entry carries the player's name (no more 'undefined' in the report)", async () => {
  const reborn = createRebornState("rookie-trial-3", ROWS);
  const out = await playGame(reborn, buildSeason(reborn, ROWS), ROWS, { trainingDone: true });
  assert.ok(out.report.growth.every((e) => typeof e.name === "string" && e.name.length > 0) || out.report.growth.length === 0);
});
