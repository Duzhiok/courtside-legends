import test from "node:test";
import assert from "node:assert/strict";
import { prizeNotice } from "../js/online/prizeNotice.js";

test("a full prize is announced with the amount", () => {
  assert.equal(prizeNotice({ gold: 1200, prize: 200, limited: null }), "对局奖金 +200，现有金币 1200");
});

test("a part prize says the daily cap was reached", () => {
  assert.match(prizeNotice({ gold: 1500, prize: 100, limited: "daily" }), /\+100.*已达今日上限/);
});

test("no prize because the pair is used up, or because of the daily cap, says so and never claims a reward", () => {
  const pair = prizeNotice({ gold: 1600, prize: 0, limited: "pair" });
  const daily = prizeNotice({ gold: 2000, prize: 0, limited: "daily" });
  assert.match(pair, /没有奖金.*这位对手/);
  assert.match(daily, /没有奖金.*封顶/);
  for (const text of [pair, daily]) assert.doesNotMatch(text, /到账|\+\d/);
});

test("a message from an older server (no prize fields) still reads sensibly", () => {
  assert.equal(prizeNotice({ gold: 900 }), "现有金币 900");
  assert.equal(prizeNotice(undefined), "现有金币 0");
});
