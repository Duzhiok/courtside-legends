import assert from "node:assert/strict";
import test from "node:test";
import { foldBatch, settleGame } from "../js/career/gameRewards.js";
import { batchHtml, postGameHtml } from "../js/ui/careerPostGameView.js";

const CJK = /[\u3400-\u9fff]/;
const player = (id, name, stats) => ({ id, name, stats });
const snap = (score = { home: 104, away: 99 }, home = null) => ({
  score,
  home: { name: "Denver", roster: home || [
    player("a", "Nikola Jokic", { min: 36, pts: 28, reb: 12, ast: 9, fgm: 10, fga: 17 }),
    player("b", "Jamal Murray", { min: 34, pts: 21, reb: 3, ast: 6, fgm: 8, fga: 18 }),
    player("c", "Aaron Gordon", { min: 30, pts: 11, reb: 8, ast: 2, fgm: 4, fga: 7 }),
    player("d", "Bench Guy", { min: 8, pts: 2, fgm: 1, fga: 3 }),
  ] },
  away: { name: "Boston", roster: [player("x", "Jayson Tatum", { min: 38, pts: 30, reb: 7, ast: 4, fgm: 11, fga: 24 })] },
});

test("a single game card: verdict, opponent, and the three stars with their lines", () => {
  const html = postGameHtml(settleGame(snap(), "home"), "zh");
  assert.match(html, /赛后结算/);
  assert.match(html, /pg-win/);
  assert.match(html, /胜 104-99/);
  assert.match(html, /对阵 Boston/);
  assert.equal((html.match(/class="pg-star"/g) || []).length, 3, "three stars, not the whole bench");
  assert.match(html, /Nikola Jokic/);
  assert.match(html, /28 分 12 板 9 助/);
  assert.doesNotMatch(html, /Bench Guy/);
});

test("a loss and a tie get their own tone, from the user's side", () => {
  assert.match(postGameHtml(settleGame(snap({ home: 90, away: 99 }), "home"), "zh"), /pg-loss[\s\S]*负 90-99/);
  assert.match(postGameHtml(settleGame(snap({ home: 90, away: 90 }), "home"), "zh"), /pg-even[\s\S]*战平 90-90/);
  assert.match(postGameHtml(settleGame(snap({ home: 90, away: 99 }), "away"), "zh"), /pg-win[\s\S]*胜 99-90/, "the same box score is a win for the other side");
});

test("English mode has no Chinese in the card", () => {
  const html = postGameHtml(settleGame(snap(), "home"), "en");
  assert.match(html, /Post-game/);
  assert.match(html, /Win 104-99/);
  assert.match(html, /28 pts 12 reb 9 ast/);
  assert.doesNotMatch(html, CJK);
  const batch = batchHtml(foldBatch([settleGame(snap(), "home"), settleGame(snap({ home: 90, away: 99 }), "home")]), "en");
  assert.match(batch, /This stretch/);
  assert.match(batch, /2 games · 1-1/);
  assert.match(batch, /Point diff \+?-?\d+/);
  assert.doesNotMatch(batch, CJK);
});

test("team and player names are escaped, not injected", () => {
  const evil = settleGame({ ...snap(), away: { name: "<img src=x onerror=alert(1)>", roster: [] }, home: { name: "H", roster: [player("e", "<script>alert(1)</script>", { min: 20, pts: 9 })] } }, "home");
  const html = postGameHtml(evil, "zh") + batchHtml(foldBatch([evil, evil]), "zh");
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});

test("the batch card: record, point differential, best night, and who carried the team", () => {
  const html = batchHtml(foldBatch([settleGame(snap(), "home"), settleGame(snap({ home: 90, away: 99 }), "home"), settleGame(snap(), "home")]), "zh");
  assert.match(html, /本段收获/);
  assert.match(html, /3 场 · 2 胜 1 负/);
  assert.match(html, /净胜分 \+1\b/, "(+5) + (-9) + (+5) = +1");
  assert.match(html, /单场最佳：Nikola Jokic 28 分 12 板 9 助，对阵 Boston（胜 104-99）/);
  assert.match(html.replace(/<[^>]+>/g, ""), /场均 28\.0 分 12\.0 板 9\.0 助 · 出场 3 场/, "the visible line reads as one sentence");
  assert.match(html, /<span class="pg-nowrap">出场 3 场<\/span>/, "...and '出场 3 场' can't break in half on a phone");
  assert.equal((html.match(/class="pg-star"/g) || []).length, 3);
});

test("a losing stretch is tinted as a loss, a negative differential has its minus sign", () => {
  const html = batchHtml(foldBatch([settleGame(snap({ home: 80, away: 99 }), "home"), settleGame(snap({ home: 80, away: 99 }), "home")]), "zh");
  assert.match(html, /pg-loss/);
  assert.match(html, /净胜分 -38/);
});

test("nothing to show means no markup at all (the container stays hidden)", () => {
  assert.equal(postGameHtml(null), "");
  assert.equal(batchHtml(null), "");
  assert.equal(batchHtml(foldBatch([])), "");
  assert.equal(postGameHtml(settleGame({ score: { home: 1, away: 0 }, home: { name: "x" }, away: { name: "y" } }, "home")), "");
});

test("a card for a game where nobody has stats still says who won (no empty stars list)", () => {
  const html = postGameHtml(settleGame(snap({ home: 90, away: 80 }, []), "home"), "zh");
  assert.match(html, /胜 90-80/);
  assert.doesNotMatch(html, /pg-stars|本场最佳/);
});
