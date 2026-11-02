import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRosterEvaluation,
  evaluateRosterPlayer,
  renderRosterEvaluation,
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

test("evaluation card carries the seven sub-attributes", () => {
  const p = { id: "c", name: "Card", season: 1994, scoring: 80, three: 70, defense: 60, rebound: 55, pass: 65, speed: 70, strength: 60, handle: 91, perimDef: 89, interiorDef: 71, catchShoot: 67, offDribble: 65, offReb: 56, defReb: 61 };
  const rowOut = evaluateRosterPlayer(p, row({}), { salary: 100, ovr: 85 });
  assert.match(rowOut.subAttrs, /控球<\/b>91/);
  assert.equal((rowOut.subAttrs.match(/class="rot-attr/g) || []).length, 7);
  const box = { innerHTML: "" };
  renderRosterEvaluation(box, [rowOut]);
  assert.ok(box.innerHTML.includes('class="rot-attrs sub-attrs"'));
  assert.match(box.innerHTML, /控球<\/b>91/);
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
