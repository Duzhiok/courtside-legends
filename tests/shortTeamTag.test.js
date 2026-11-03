import test from "node:test";
import assert from "node:assert/strict";
import { shortTeamTag } from "../js/engine/sim.js";

test("shortTeamTag: Chinese names shorten to their last two Chinese characters, never filler", () => {
  assert.equal(shortTeamTag("洛杉矶湖人", "home", "波士顿凯尔特人", "zh"), "湖人");
  assert.equal(shortTeamTag("湖人", "home", "波士顿凯尔特人", "zh"), "湖人");
  assert.equal(shortTeamTag("凯尔特人", "away", "洛杉矶湖人", "zh"), "特人");
  // The user team's display name ends in " ***": a raw slice(-2) gave "**" in the broadcast.
  assert.equal(shortTeamTag("拉斯维加斯 ***", "home", "波士顿凯尔特人", "zh"), "加斯");
  assert.equal(shortTeamTag("拉斯维加斯 ***", "away", "拉斯维加斯 ***", "zh"), "客", "identical tags fall back to the side");
  assert.equal(shortTeamTag("拉斯维加斯 ***", "home", "拉斯维加斯 ***", "zh"), "主");
});

test("shortTeamTag: empty names fall back to the side, English names to three letters", () => {
  assert.equal(shortTeamTag("", "home", "Boston Celtics", "zh"), "主");
  assert.equal(shortTeamTag("", "away", "Boston Celtics", "en"), "A");
  assert.equal(shortTeamTag("Lakers", "home", "Celtics", "en"), "Lak");
  assert.equal(shortTeamTag("Heat", "away", "Lakers", "en"), "Heat");
});
