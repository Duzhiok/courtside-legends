/**
 * Workstream G — Career Network: scout, film and analytics slices.
 * Real-data pins come from roster.json (read like tests/helpers/realGame.js).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  prospectPool, scoutReportFor, developmentReport, gradeScoutRecommendation,
  scoreScoutClass, pickProspects, toScoutingIntelInput, gradeForOverall,
} from "../js/career/network/scoutCareer.js";
import {
  collectPossessionLog, analyzeGameLog, buildFilmChallenge, buildTeamFromRows,
  gradeFilmAnswer, filmRecommendation,
} from "../js/career/network/videoAnalyst.js";
import {
  efficiencyMetrics, findUndervalued, contractValueReport, lineupFitReport,
  buildAnalyticsChallenge, gradeAnalyticsAnswer, verifyAnalyticsReport,
} from "../js/career/network/analyticsSpecialist.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

/* ------------------------------------------------------------------ */
/* Scout                                                               */
/* ------------------------------------------------------------------ */

test("G scout: 1997 pool holds rookies and sophomores only, including Kobe as a rookie", () => {
  const pool = prospectPool(ROWS, 1997);
  assert.ok(pool.length > 50, `1997 pool has ${pool.length} prospects`);
  const kobe = pool.find((p) => p.row.bref === "bryanko01");
  assert.ok(kobe, "Kobe Bryant is in the 1997 pool");
  assert.equal(kobe.experience, "rookie");
  assert.equal(kobe.row.gp, 71);
  for (const p of pool) {
    assert.ok(p.experience === "rookie" || p.experience === "sophomore");
  }
});

test("G scout: a report shows only observed stats plus a noisy potential range", () => {
  const pool = prospectPool(ROWS, 1997);
  const kobe = pool.find((p) => p.row.bref === "bryanko01");
  const report = scoutReportFor(kobe, ROWS, { seed: 8 });
  assert.equal(report.observed.ppg, 7.6);
  assert.equal(report.sampleSize.gp, 71);
  assert.ok(report.confidence >= 35 && report.confidence <= 100);
  assert.equal(report.potentialRange.length, 2);
  assert.ok(gradeForOverall(85) === "S" && gradeForOverall(49) === "F");
});

test("G scout: delayed feedback reads real later seasons — Kobe became a star, and the pool holds busts too", () => {
  const pool = prospectPool(ROWS, 1997);
  const kobe = pool.find((p) => p.row.bref === "bryanko01");
  const dev = developmentReport(kobe, ROWS, { years: 3 });
  assert.equal(dev.tier, "star");
  assert.equal(dev.seasonsPlayed, 3);
  assert.equal(dev.peakPpg, 22.5);
  const tiers = new Set(pool.map((p) => developmentReport(p, ROWS, { years: 3 }).tier));
  assert.ok(tiers.has("star"), "pool has future stars");
  assert.ok(tiers.has("bust"), "pool has decoys whose real futures diverged");
});

test("G scout: grading rewards the call against its cost, and passing on a star is the costliest miss", () => {
  const star = { tier: "star" };
  const bust = { tier: "bust" };
  assert.deepEqual(
    { verdict: gradeScoutRecommendation({ recommended: true, pickCost: "mid", report: star }).verdict, points: gradeScoutRecommendation({ recommended: true, pickCost: "mid", report: star }).points },
    { verdict: "hit-star", points: 2 },
  );
  assert.equal(gradeScoutRecommendation({ recommended: false, pickCost: "mid", report: star }).points, -2);
  assert.equal(gradeScoutRecommendation({ recommended: true, pickCost: "mid", report: bust }).verdict, "miss-bust");
  assert.equal(gradeScoutRecommendation({ recommended: false, pickCost: "mid", report: bust }).verdict, "correct-pass");
  const total = scoreScoutClass([
    gradeScoutRecommendation({ recommended: true, pickCost: "mid", report: star }),
    gradeScoutRecommendation({ recommended: false, pickCost: "mid", report: bust }),
  ]);
  assert.equal(total.total, 3);
  assert.equal(total.hits, 1);
});

test("G scout: prospect picks are deterministic per seed, and the C seam carries the recommendation", () => {
  const pool = prospectPool(ROWS, 1997);
  const a = pickProspects(pool, 5, 7).map((p) => p.row.bref);
  const b = pickProspects(pool, 5, 7).map((p) => p.row.bref);
  assert.deepEqual(a, b);
  assert.equal(a.length, 5);
  const kobe = pool.find((p) => p.row.bref === "bryanko01");
  const intel = toScoutingIntelInput({ prospect: kobe, report: scoutReportFor(kobe, ROWS, { seed: 8 }), recommended: true, pickCost: "late" });
  assert.equal(intel.source, "scout-career");
  assert.equal(intel.bref, "bryanko01");
  assert.equal(intel.recommended, true);
});

/* ------------------------------------------------------------------ */
/* Video analyst                                                       */
/* ------------------------------------------------------------------ */

// One real game, collected once and reused by every film test.
const FILM_LOG = collectPossessionLog({
  home: buildTeamFromRows(ROWS, "CHI", 1997),
  away: buildTeamFromRows(ROWS, "UTA", 1997),
  seed: 11,
});

test("G film: one real game yields a reconciled possession log", () => {
  assert.equal(FILM_LOG.finished, true);
  assert.ok(FILM_LOG.possessions.length >= 150 && FILM_LOG.possessions.length <= 260, `possessions: ${FILM_LOG.possessions.length}`);
  const total = FILM_LOG.possessions.reduce((s, p) => s + (p.points.home || 0) + (p.points.away || 0), 0);
  assert.equal(total, (FILM_LOG.finalScore.home || 0) + (FILM_LOG.finalScore.away || 0), "possession points reconcile with the final score");
  for (const p of FILM_LOG.possessions) {
    assert.equal(p.onCourtHome.length, 5);
    assert.equal(p.onCourtAway.length, 5);
    assert.ok(p.side === "home" || p.side === "away");
  }
});

test("G film: analysis finds only kinds the data actually supports — no zones, defenders or drive directions", () => {
  const findings = analyzeGameLog(FILM_LOG, { focusSide: "away" });
  assert.ok(findings.length >= 3, `findings: ${findings.map((f) => f.kind).join(", ")}`);
  const allowed = new Set(["scoring-run", "onoff-scoring", "onoff-defense", "cold-shooter", "late-collapse", "turnover-prone", "sub-effect"]);
  for (const f of findings) {
    assert.ok(allowed.has(f.kind), `finding kind ${f.kind} is data-backed`);
    assert.ok(typeof f.severity === "number" && f.severity > 0);
    assert.ok(f.summaryZh && f.summaryEn);
  }
  for (let i = 1; i < findings.length; i += 1) {
    assert.ok(findings[i - 1].severity >= findings[i].severity, "findings are ranked by severity");
  }
});

test("G film: the challenge has three real options and grades on the biggest weakness", () => {
  const challenge = buildFilmChallenge(FILM_LOG, { seed: 11, focusSide: "away" });
  assert.ok(challenge, "a real game yields a challenge");
  assert.equal(challenge.options.length, 3);
  assert.ok(challenge.options.some((o) => o.id === challenge.correctOptionId));
  assert.ok(challenge.strip.length > 0 && challenge.strip.length <= 12);
  const right = gradeFilmAnswer(challenge, challenge.correctOptionId);
  assert.equal(right.correct, true);
  assert.equal(right.reputationDelta, 3);
  const wrongId = challenge.options.find((o) => o.id !== challenge.correctOptionId).id;
  const wrong = gradeFilmAnswer(challenge, wrongId);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.reputationDelta, -4);
  const rec = filmRecommendation(challenge, challenge.correctOptionId);
  assert.equal(rec.source, "film-room");
  assert.equal(rec.confidence, "high");
  assert.equal(rec.wasCorrect, true);
});

test("G film: the same seed reproduces the same game and the same findings", () => {
  const again = collectPossessionLog({
    home: buildTeamFromRows(ROWS, "CHI", 1997),
    away: buildTeamFromRows(ROWS, "UTA", 1997),
    seed: 11,
  });
  assert.deepEqual(again.finalScore, FILM_LOG.finalScore);
  assert.deepEqual(
    analyzeGameLog(again, { focusSide: "away" }).map((f) => [f.kind, f.severity]),
    analyzeGameLog(FILM_LOG, { focusSide: "away" }).map((f) => [f.kind, f.severity]),
  );
});

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

test("G analytics: efficiency metrics are computed from the row itself", () => {
  const m = efficiencyMetrics({ ppg: 20, fga: 15, fg: 0.5, tp: 0.4, tpa: 5, apg: 6, tpg: 2, spg: 1.5, bpg: 0.5, rpg: 6, mpg: 30, gp: 70 });
  assert.equal(Math.round(m.ptsPerFga * 100) / 100, 1.33);
  assert.equal(m.astTo, 3);
  assert.equal(m.stocksPer36, 2.4);
  assert.equal(m.rebPer36, 7.2);
});

test("G analytics: the value board ranks by production per price, with real minutes only", () => {
  const board = findUndervalued(ROWS, { season: 1997, minGp: 20, limit: 5 });
  assert.equal(board.length, 5);
  for (let i = 1; i < board.length; i += 1) {
    assert.ok(board[i - 1].valueRatio >= board[i].valueRatio, "ranked by value ratio");
  }
  for (const b of board) {
    assert.ok(b.metrics.mpg >= 12, `${b.row.name} has real minutes (${b.metrics.mpg})`);
    assert.ok(Array.isArray(b.signals));
  }
});

test("G analytics: Kobe's rookie contract was a bargain by peer comparison", () => {
  const kobeRow = ROWS.find((r) => r.bref === "bryanko01" && r.season === 1997);
  const report = contractValueReport(kobeRow, ROWS);
  assert.equal(report.verdict, "bargain");
  assert.equal(report.gap, 50);
  assert.equal(report.prodPct, 77);
  assert.equal(report.pricePct, 27);
});

test("G analytics: lineup fit flags clashes, missing creators and complementary pairs", () => {
  const clash = lineupFitReport([
    { id: "a", name: "A", pos: "PG", scoring: 85, pass: 60, defense: 60 },
    { id: "b", name: "B", pos: "SG", scoring: 84, pass: 55, defense: 58 },
    { id: "c", name: "C", pos: "SF", scoring: 60, pass: 55, defense: 60 },
    { id: "d", name: "D", pos: "PF", scoring: 62, pass: 50, defense: 62 },
    { id: "e", name: "E", pos: "C", scoring: 55, pass: 45, defense: 70 },
  ]);
  assert.ok(clash.notes.some((n) => n.id === "usage-clash"));
  assert.ok(clash.score < 70);
  const balanced = lineupFitReport([
    { id: "a", name: "A", pos: "PG", scoring: 70, pass: 80, defense: 70 },
    { id: "b", name: "B", pos: "SG", scoring: 85, pass: 55, defense: 65 },
    { id: "c", name: "C", pos: "SF", scoring: 62, pass: 60, defense: 68 },
    { id: "d", name: "D", pos: "PF", scoring: 64, pass: 52, defense: 66 },
    { id: "e", name: "E", pos: "C", scoring: 58, pass: 48, defense: 72 },
  ]);
  assert.ok(balanced.notes.some((n) => n.id === "creator-finisher"));
  assert.ok(!balanced.notes.some((n) => n.id === "no-creator"));
});

test("G analytics: the challenge's correct answer is the top value ratio, and verification reads later seasons", () => {
  const challenge = buildAnalyticsChallenge(ROWS, { season: 1997, seed: 3 });
  assert.ok(challenge, "a real season yields a challenge");
  assert.equal(challenge.options.length, 3);
  const top = findUndervalued(ROWS, { season: 1997, minGp: 20, limit: 12 })[0];
  assert.equal(challenge.correctBref, top.row.bref);
  const right = gradeAnalyticsAnswer(challenge, challenge.correctOptionId);
  assert.equal(right.correct, true);
  assert.equal(right.reputationDelta, 3);
  const verified = verifyAnalyticsReport({ bref: "bryanko01", season: 1997, production: 31.2 }, ROWS, { years: 2 });
  assert.equal(verified.verified, true, "Kobe's production really did rise after 1997");
  assert.ok(verified.laterPeakProduction > 31.2);
});
