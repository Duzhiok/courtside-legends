import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRosterEvaluation,
  evaluateRosterPlayer,
} from "../js/ui/rosterEvaluationView.js";

function player(id, name = id) {
  return { id, name, season: 1994 };
}

function row(stats) {
  return { stats: { gp: 10, min: 300, pts: 200, reb: 60, ast: 40, plusMinus: 5, ...stats } };
}

test("evaluation derives per-game production and keeps a high-output core", () => {
  const result = evaluateRosterPlayer(player("a", "Star"), row({ pts: 240, plusMinus: 30 }), { salary: 180, ovr: 88 });
  assert.equal(result.ppg, 24);
  assert.equal(result.recommendation, "核心保留");
  assert.equal(result.age, "—");
  assert.ok(result.photo.includes("img"));
  assert.equal(result.abilities.scoring, "—");
  assert.match(result.potential, /潜力/);
});

test("evaluation flags expensive low-impact players as cut candidates", () => {
  const result = evaluateRosterPlayer(player("b", "Bad Contract"), row({ pts: 80, plusMinus: -40 }), { salary: 260, ovr: 72 });
  assert.equal(result.recommendation, "裁员候选");
  assert.match(result.reason, /合同负担高/);
});

test("roster evaluation sorts decisions by urgency and reads season identity", () => {
  const players = [player("keep", "Keep"), player("cut", "Cut")];
  const rows = {
    "CHI:keep": row({ pts: 220, plusMinus: 20 }),
    "CHI:cut": row({ pts: 70, plusMinus: -30 }),
  };
  const result = buildRosterEvaluation(players, rows, {
    teamId: "CHI",
    salaryOf: (p) => (p.id === "cut" ? 260 : 100),
    overallOf: (p) => (p.id === "keep" ? 86 : 70),
  });
  assert.deepEqual(result.map((item) => item.recommendation), ["裁员候选", "核心保留"]);
  assert.equal(result[1].name, "Keep");
});
