import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMatchResult } from "../js/engine/matchExplain.js";

function player(name, stats, gradeScore = 70) {
  return { name, gradeScore, grade: "B", stats: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, oreb: 0, dreb: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pm: 0, ...stats } };
}

function snapFixture(overrides = {}) {
  return {
    score: { home: 102, away: 94 },
    home: {
      name: "Home Team",
      roster: [
        player("Star A", { pts: 30, fgm: 10, fga: 18, tpm: 3, tpa: 6, ftm: 7, fta: 8, oreb: 5, tov: 2, pm: 12 }, 95),
        player("Role B", { pts: 12, fgm: 5, fga: 10, oreb: 2, tov: 1, pm: 6 }, 70),
      ],
    },
    away: {
      name: "Away Team",
      roster: [
        player("Star C", { pts: 28, fgm: 10, fga: 22, tpm: 1, tpa: 8, ftm: 7, fta: 9, oreb: 1, tov: 6, pm: -10 }, 80),
        player("Role D", { pts: 10, fgm: 4, fga: 11, oreb: 1, tov: 2, pm: -8 }, 55),
      ],
    },
    ...overrides,
  };
}

test("summarizeMatchResult requires a completed snapshot with rosters", () => {
  assert.throws(() => summarizeMatchResult(null), /snapshot/);
  assert.throws(() => summarizeMatchResult({ home: {}, away: {}, score: { home: 1, away: 0 } }), /snapshot/);
});

test("summarizeMatchResult computes totals, shooting, and winner-side factors", () => {
  const summary = summarizeMatchResult(snapFixture());
  assert.equal(summary.winnerSide, "home");
  assert.equal(summary.margin, 8);
  assert.equal(summary.teamTotals.home.pts, 42);
  assert.equal(summary.teamTotals.away.tov, 8);
  assert.ok(Math.abs(summary.shooting.home.fg - (15 / 28)) < 1e-9);
  assert.equal(summary.topPerformers.home.name, "Star A");
  assert.equal(summary.topPerformers.away.name, "Star C");
  assert.deepEqual(summary.plusMinus.home.best, { name: "Star A", pm: 12 });
  assert.deepEqual(summary.plusMinus.away.worst, { name: "Star C", pm: -10 });
  assert.ok(summary.factors.some((line) => line.includes("失误")));
  assert.ok(summary.factors.some((line) => line.includes("前场篮板")));
});

test("summarizeMatchResult reports no winner-side factors on a tie", () => {
  const summary = summarizeMatchResult(snapFixture({ score: { home: 90, away: 90 } }));
  assert.equal(summary.winnerSide, null);
  assert.equal(summary.margin, 0);
  assert.deepEqual(summary.factors, []);
});

test("summarizeMatchResult skips small, noisy differences", () => {
  const summary = summarizeMatchResult(
    snapFixture({
      home: {
        name: "Home Team",
        roster: [player("Even A", { pts: 50, fgm: 20, fga: 40, tov: 3, pm: 1 }, 80)],
      },
      away: {
        name: "Away Team",
        roster: [player("Even B", { pts: 46, fgm: 18, fga: 38, tov: 4, pm: -1 }, 70)],
      },
      score: { home: 96, away: 92 },
    }),
  );
  assert.deepEqual(summary.factors, []);
});

test("最佳表现 ranks by the box score shown next to it, not the live gradeScore", () => {
  // Real bug report: a 0pt/3reb/6ast/0tov bench PG out-graded a real scorer (gradeScore rewards
  // zero-turnover efficiency), so the result screen said "最佳表现" over a stat line that looked
  // like nothing happened. gradeScore stays useful for development elsewhere — this screen must
  // agree with the pts/reb/ast it prints.
  const summary = summarizeMatchResult(
    snapFixture({
      away: {
        name: "Away Team",
        roster: [
          player("Volume Scorer", { pts: 24, fgm: 9, fga: 20, oreb: 1, tov: 2, pm: -4 }, 60),
          player("Zero Shot Playmaker", { pts: 0, ast: 6, reb: 3, dreb: 3, tov: 0, pm: -2 }, 96),
        ],
      },
    }),
  );
  assert.equal(summary.topPerformers.away.name, "Volume Scorer");
  assert.equal(summary.topPerformers.away.pts, 24);
});

test("2026-11 review: factor lines never print a negative gap, and English mode gets English lines", () => {
  // Seen on the result screen: "三分命中率差距 -32 个百分点" and "罚球多命中 -8 个" when the loser led those columns.
  const snap = snapFixture({
    home: { name: "主场群星", roster: [player("W", { pts: 60, fgm: 25, fga: 50, tpm: 2, tpa: 10, ftm: 8, fta: 10 })] },
    away: { name: "客场挑战者", roster: [player("L", { pts: 50, fgm: 15, fga: 40, tpm: 6, tpa: 10, ftm: 16, fta: 18 })] },
    score: { home: 60, away: 50 },
  });
  const zh = summarizeMatchResult(snap).factors.join("\n");
  assert.doesNotMatch(zh, /-\d/, zh);
  assert.match(zh, /客场挑战者 罚球多命中 8 个，仍没能赢下比赛/);
  const names = { "主场群星": "Home All-Stars", "客场挑战者": "Away Challengers" };
  const en = summarizeMatchResult(snap, { lang: "en", teamName: (n) => names[n] || n }).factors.join("\n");
  assert.doesNotMatch(en, /[一-鿿]/, en);
  assert.match(en, /Away Challengers shot 40 points better from three/);
  assert.match(en, /Away Challengers made 8 more free throws and still lost/);
});
