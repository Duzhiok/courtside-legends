import test from "node:test";
import assert from "node:assert/strict";
import {
  EPIPHANY_RULES,
  MAX_EPIPHANY,
  MIN_MINUTES,
  STREAK,
  hotStreak,
  recordGameAndCheck,
} from "../js/engine/epiphany.js";

const GUARD = { id: "liv", bref: "livinsh01", team: "GSW", heightCm: 201, age: 29, pass: 80, block: 40, speed: 60, strength: 60, stamina: 70, skills: [] };
const dimeGame = { min: 30, pts: 8, reb: 4, ast: 11, stl: 1, blk: 0, fgm: 4, tpm: 0 };
const quietGame = { min: 30, pts: 8, reb: 4, ast: 3, stl: 1, blk: 0, fgm: 4, tpm: 0 };
const PASSING = EPIPHANY_RULES.find((rule) => rule.id === "playmaker").skills;

function play(games, rng, start = { merges: 0, skills: [] }) {
  let mod = start;
  let learned = null;
  for (const game of games) {
    ({ mod, learned } = recordGameAndCheck(mod, GUARD, game, rng));
  }
  return { mod, learned };
}

test("a streak needs STREAK games with real minutes", () => {
  const line = { min: 30, pts: 0, reb: 0, ast: 10, stl: 0, blk: 0, tpm: 0, twoPm: 0 };
  assert.equal(hotStreak(Array(STREAK - 1).fill(line)), null);
  assert.equal(hotStreak(Array(STREAK).fill(line)).id, "playmaker");
  assert.equal(hotStreak([...Array(STREAK - 1).fill(line), { ...line, min: MIN_MINUTES - 1 }]), null);
});

test("three straight double-digit assist games can awaken a passing skill", () => {
  const { mod, learned } = play([dimeGame, dimeGame, dimeGame], () => 0.1);
  assert.ok(learned);
  assert.ok(PASSING.includes(learned.skillId));
  assert.deepEqual(mod.epiphany, [learned.skillId]);
  assert.ok(mod.skills.includes(learned.skillId));
  assert.deepEqual(mod.form, [], "streak resets after learning");
});

test("an unlucky roll keeps the streak alive for the next game", () => {
  let roll = 0.9;
  const rng = () => roll;
  const first = play([dimeGame, dimeGame, dimeGame], rng);
  assert.equal(first.learned, null);
  roll = 0.1;
  const second = play([dimeGame], rng, first.mod);
  assert.ok(second.learned);
});

test("a broken streak learns nothing", () => {
  const { learned } = play([dimeGame, quietGame, dimeGame], () => 0);
  assert.equal(learned, null);
});

test("never more than MAX_EPIPHANY skills per card", () => {
  const full = { merges: 0, skills: ["dime_dropper", "clean_dime"], epiphany: Array(MAX_EPIPHANY).fill("x") };
  const { learned } = play([dimeGame, dimeGame, dimeGame], () => 0, full);
  assert.equal(learned, null);
});

test("physical gates still apply: a low-block guard cannot awaken rim skills", () => {
  const blockGame = { min: 30, pts: 5, reb: 5, ast: 2, stl: 0, blk: 4, fgm: 2, tpm: 0 };
  const { learned } = play([blockGame, blockGame, blockGame], () => 0);
  assert.equal(learned, null);
});
