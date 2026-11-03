// Regression coverage for js/engine/form.js -- had zero tests before this. Bug report: a player
// drops 0pts/18ast/1reb in a win (rateBoxImpact correctly tags that "组织统治" -- passing
// dominance), but confidence crashed to the "自我怀疑" floor anyway because scorePull weighted
// scoring impact (1.05) almost 4x passing impact (0.28). The market card's "近况不佳" tip then
// concatenated lastNote + confidenceLabel() and regex-matched "自我怀疑" in that combined string,
// so a card whose actual last game was glowingly positive still got slapped with a "bad form"
// warning. Fixed in two places: scorePull now weights scoring/passing near parity, and the tip
// only reads lastNote (not confidence) for "近况不佳".
import test from "node:test";
import assert from "node:assert/strict";
import { applyFormAfterGame, confidenceLabel, rateBoxImpact, summarizeRecentForm, tacticalLabel } from "../js/engine/form.js";

function freshPlayer(overrides = {}) {
  return { pass: 81, scoring: 76, confidence: 50, tacticalStatus: 50, ...overrides };
}

test("confidenceLabel / tacticalLabel band correctly, no overlap at the edges", () => {
  assert.equal(confidenceLabel(28), "自我怀疑");
  assert.equal(confidenceLabel(34), "自我怀疑");
  assert.equal(confidenceLabel(35), "信心不足");
  assert.equal(confidenceLabel(78), "自信爆棚");
  assert.equal(tacticalLabel(34), "信任下滑");
  assert.equal(tacticalLabel(78), "战术核心");
});

test("an 18-assist, 0-point floor-general win is tagged 组织统治 with a wildly positive passing impact", () => {
  const stats = { pts: 0, ast: 18, reb: 1, min: 47, fga: 2, fgm: 0, tov: 2 };
  const impact = rateBoxImpact(freshPlayer(), stats);
  assert.ok(impact.passing >= 12, `passing impact ${impact.passing} should clear the 组织统治 bar`);
  assert.ok(impact.scoring < 0, "zero points from a 76-scoring player should read as a scoring miss");

  const src = freshPlayer();
  const g = applyFormAfterGame(src, { stats }, { won: true });
  assert.equal(g.note, "组织统治");
  assert.notEqual(
    confidenceLabel(src.confidence),
    "自我怀疑",
    `confidence crashed to ${src.confidence} (${confidenceLabel(src.confidence)}) after a game the engine itself calls passing dominance`
  );
});

test("a genuinely empty, losing night still tanks confidence (no over-correction)", () => {
  const stats = { pts: 2, ast: 1, reb: 1, min: 14, fga: 3, fgm: 0, tov: 3 };
  const src = freshPlayer();
  const g = applyFormAfterGame(src, { stats }, { won: false });
  assert.equal(g.note, "进攻哑火");
  assert.ok(src.confidence < 45, `confidence ${src.confidence} should still read as shaky after this line`);
});

test("a big efficient scoring night still lifts confidence strongly (rebalance didn't neuter scoring)", () => {
  const stats = { pts: 40, ast: 5, reb: 6, min: 38, fga: 25, fgm: 13, tov: 3 };
  const src = freshPlayer({ scoring: 90, pass: 60 });
  const g = applyFormAfterGame(src, { stats }, { won: true });
  assert.ok(["得分大火", "全能爆发"].includes(g.note), g.note);
  assert.ok(src.confidence >= 68, `confidence ${src.confidence} (${confidenceLabel(src.confidence)}) should be at least 信心十足`);
});

test("summarizeRecentForm carries the real lastNote through, not a guess", () => {
  const src = freshPlayer();
  applyFormAfterGame(src, { stats: { pts: 0, ast: 18, reb: 1, min: 47, fga: 2, fgm: 0, tov: 2 } }, { won: true });
  const recent = summarizeRecentForm(src);
  assert.equal(recent.lastNote, "组织统治");
  assert.equal(recent.apg, 18);
});
