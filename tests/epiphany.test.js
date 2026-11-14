import test from "node:test";
import assert from "node:assert/strict";
import {
  EPIPHANY_RULES,
  MAX_EPIPHANY,
  MIN_MINUTES,
  EPIPHANY_BASE_CHANCE,
  EPIPHANY_MAX_CHANCE,
  STREAK,
  epiphanyCandidates,
  epiphanyChance,
  formLine,
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

// Career 2.0 ruling 3: evidence picks the candidates, dice only pick among them.
const shooterDime = { min: 32, pts: 18, reb: 3, ast: 10, stl: 1, blk: 0, fgm: 6, tpm: 4 };

test("stage 1: only families the streak proves are candidates; both when both are proven", () => {
  const ids = (games, focus) => epiphanyCandidates(games.map(formLine), GUARD, new Set(), focus).map((c) => c.rule.id).sort();
  assert.deepEqual(ids([dimeGame, dimeGame, dimeGame]), ["playmaker"]);
  assert.deepEqual(ids([shooterDime, shooterDime, shooterDime]), ["playmaker", "shooter"]);
  assert.deepEqual(ids([dimeGame, quietGame, dimeGame]), []);
});

test("an assist streak never awakens a non-passing skill, whatever the dice", () => {
  for (const r of [0, 0.2, 0.39, 0.5, 0.99]) {
    const { learned } = play([dimeGame, dimeGame, dimeGame], () => r * 0.4);
    if (learned) assert.ok(PASSING.includes(learned.skillId), `${learned.skillId} at ${r}`);
  }
});

test("the chance to awaken grows with how far the streak beat the bar, capped", () => {
  const at = (ast) => epiphanyChance(epiphanyCandidates(Array(STREAK).fill(formLine({ ...dimeGame, ast })), GUARD));
  assert.equal(at(9), EPIPHANY_BASE_CHANCE, "exactly at the bar");
  assert.ok(at(13) > at(10) && at(10) > at(9));
  assert.equal(at(40), EPIPHANY_MAX_CHANCE);
  assert.equal(epiphanyChance([]), 0);
});

test("training focus tilts the weighted pick toward the trained family", () => {
  const form = Array(STREAK).fill(formLine(shooterDime));
  const base = epiphanyCandidates(form, GUARD);
  const trained = epiphanyCandidates(form, GUARD, new Set(), "shooting");
  const w = (list, id) => list.find((c) => c.rule.id === id).weight;
  assert.ok(w(trained, "shooter") > w(base, "shooter"));
  assert.equal(w(trained, "playmaker"), w(base, "playmaker"));
  // A low pick roll lands on the first family (playmaker); with shooting trained the same
  // roll's share of the wheel belongs to shooting more often, measured over the roll range.
  const pickShare = (focus) => {
    let shooter = 0;
    for (let i = 0; i < 100; i += 1) {
      const rolls = [0, i / 100, 0];
      const rng = () => rolls.shift() ?? 0;
      const { learned } = recordGameAndCheck({ merges: 0, skills: [], form: form.slice(0, 2) }, GUARD, shooterDime, rng, { focus });
      if (learned?.rule.id === "shooter") shooter += 1;
    }
    return shooter;
  };
  assert.ok(pickShare("shooting") > pickShare(null));
});
