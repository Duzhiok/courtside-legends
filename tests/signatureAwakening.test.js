/**
 * Signature Awakening — pure module tests. No roster, no sim: synthetic
 * evidence records + synthetic cards. Game RESULTS are never asserted here
 * either — the input is the evidence itself.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  AWAKENING_RULES,
  MISSING_EVIDENCE,
  createAwakeningState,
  normalizeAwakeningState,
  awakenedSkillIds,
  evidenceFromReport,
  progressFor,
  recordGame,
  skillSourceOf,
  MIN_EVIDENCE_MINUTES,
} from "../js/career/player/signatureAwakening.js";
import { skillSlotsFull } from "../js/data/skills.js";

/** A bench big: can retain rim_protector (block 72, speed 60, athlete ~60). */
const BIG = {
  id: "big1",
  bref: "big01",
  skills: [],
  block: 72,
  rebound: 70,
  pass: 45,
  clutch: 50,
  speed: 60,
  stamina: 70,
  steal: 40,
  age: 22,
  heightCm: 208,
};
/** A guard: playmaking + clutch, no rim game. */
const GUARD = {
  id: "g1",
  bref: "gua01",
  skills: [],
  block: 40,
  rebound: 45,
  pass: 75,
  clutch: 65,
  speed: 80,
  stamina: 75,
  steal: 60,
  age: 22,
  heightCm: 190,
};

const ev = (game, over = {}) => ({
  game,
  season: 1997,
  min: 24,
  blk: 0,
  reb: 0,
  ast: 0,
  tov: 0,
  clutchMade: false,
  clutchGameWinner: false,
  ...over,
});

function play(state, card, games) {
  let s = state;
  const fired = [];
  for (const e of games) {
    const out = recordGame(s, { evidence: e, card });
    s = out.state;
    fired.push(...out.awakened);
  }
  return { state: s, fired };
}

test("a 40-point scoring explosion awakens nothing by itself", () => {
  // The old epiphany scorer rule (pts >= 25 x3) would have rolled for a
  // skill here. Awakening reads no scoring total at all.
  const { state, fired } = play(createAwakeningState(1997), BIG, [
    ev(1, { min: 35 }),
    ev(2, { min: 35 }),
    ev(3, { min: 35 }),
    ev(4, { min: 35 }),
    ev(5, { min: 35 }),
  ]);
  assert.deepEqual(fired, []);
  assert.deepEqual(state.awakened, []);
  assert.deepEqual(state.ready, []);
  // The extracted evidence does not even carry points.
  const extracted = evidenceFromReport({
    game: 1,
    year: 1997,
    line: { min: 35, pts: 40, reb: 3, ast: 2, blk: 0, tov: 1 },
    takeover: null,
    score: { home: 110, away: 100 },
    won: true,
  });
  assert.equal("pts" in extracted, false);
});

test("stepback has no rule and no measurable evidence", () => {
  assert.equal(AWAKENING_RULES.some((r) => r.skillId === "stepback"), false);
  const missing = MISSING_EVIDENCE.find((m) => m.skillId === "stepback");
  assert.ok(missing, "stepback is listed as missing evidence, not faked");
  assert.match(missing.needed, /动作类型/);
});

test("rim protector awakens on repeated blocks plus a 4-block key game", () => {
  const { state, fired } = play(createAwakeningState(1997), BIG, [
    ev(1, { min: 20, blk: 2 }), // 3.6 / 36
    ev(2, { min: 12, blk: 1 }), // 3.0 / 36
    ev(3, { min: 24, blk: 4 }), // 6.0 / 36 + key game
  ]);
  assert.deepEqual(fired.map((f) => f.skillId), ["rim_protector"]);
  assert.equal(state.awakened.length, 1);
  assert.equal(state.awakened[0].source, "awakened");
  assert.equal(state.awakened[0].game, 3);
  assert.deepEqual(state.awakened[0].evidence, { qualifying: 3, keyGame: 3 });
  assert.deepEqual(awakenedSkillIds(state), ["rim_protector"]);
});

test("three qualifying games without a key game do not awaken", () => {
  const { state, fired } = play(createAwakeningState(1997), BIG, [
    ev(1, { min: 20, blk: 2 }),
    ev(2, { min: 12, blk: 1 }),
    ev(3, { min: 24, blk: 2 }), // qualifying, but no 4-block game
  ]);
  assert.deepEqual(fired, []);
  assert.deepEqual(state.awakened, []);
  const rim = progressFor(state, BIG).find((p) => p.ruleId === "rim");
  assert.equal(rim.qualifying, 3);
  assert.equal(rim.keyMet, false);
  assert.equal(rim.status, "progress");
});

test("glass cleaner awakens on repeated rebounding plus a 14-board key game", () => {
  const { state, fired } = play(createAwakeningState(1997), BIG, [
    ev(1, { min: 18, reb: 6 }), // 12.0 / 36
    ev(2, { min: 15, reb: 5 }), // 12.0 / 36
    ev(3, { min: 24, reb: 15 }), // 22.5 / 36 + key game
  ]);
  assert.deepEqual(fired.map((f) => f.skillId), ["glass_cleaner"]);
});

test("dime dropper needs assists AND low turnovers — a sloppy passer does not qualify", () => {
  // 4 assists but 4 turnovers: the quality gate (tov <= ast / 2) fails.
  const sloppy = play(createAwakeningState(1997), GUARD, [
    ev(1, { min: 18, ast: 4, tov: 4 }),
    ev(2, { min: 18, ast: 4, tov: 4 }),
    ev(3, { min: 24, ast: 11, tov: 5 }),
  ]);
  assert.deepEqual(sloppy.fired, []);
  const clean = play(createAwakeningState(1997), GUARD, [
    ev(1, { min: 18, ast: 4, tov: 1 }), // 8.0 / 36
    ev(2, { min: 12, ast: 3, tov: 1 }), // 9.0 / 36
    ev(3, { min: 30, ast: 11, tov: 2 }), // 13.2 / 36 + key game
  ]);
  assert.deepEqual(clean.fired.map((f) => f.skillId), ["dime_dropper"]);
});

test("clutch killer needs three takeover makes plus a game-winner", () => {
  const twoMakes = play(createAwakeningState(1997), GUARD, [
    ev(1, { clutchMade: true }),
    ev(2, {}),
    ev(3, { clutchMade: true }),
  ]);
  assert.deepEqual(twoMakes.fired, []);
  const withWinner = play(twoMakes.state, GUARD, [
    ev(4, {}),
    ev(5, { clutchMade: true, clutchGameWinner: true }),
  ]);
  assert.deepEqual(withWinner.fired.map((f) => f.skillId), ["clutch_killer"]);
  assert.equal(withWinner.state.clutchMakes, 3);
});

test("DNP and garbage-time cameos add no evidence", () => {
  const { state, fired } = play(createAwakeningState(1997), BIG, [
    ev(1, { min: 0, blk: 0 }),
    ev(2, { min: 4, blk: 2 }), // two blocks in 4 minutes — still not evidence
    ev(3, { min: MIN_EVIDENCE_MINUTES - 1, blk: 2 }),
  ]);
  assert.deepEqual(fired, []);
  assert.equal(state.form.length, 0);
});

test("determinism: the same evidence twice gives the same state", () => {
  const games = [
    ev(1, { min: 20, blk: 2 }),
    ev(2, { min: 12, blk: 1 }),
    ev(3, { min: 24, blk: 4 }),
  ];
  const a = play(createAwakeningState(1997), BIG, games);
  const b = play(createAwakeningState(1997), BIG, games);
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
  assert.equal(JSON.stringify(a.fired), JSON.stringify(b.fired));
});

test("recordGame never mutates its input", () => {
  const before = createAwakeningState(1997);
  const snapshot = JSON.stringify(before);
  recordGame(before, { evidence: ev(1, { min: 20, blk: 2 }), card: BIG });
  assert.equal(JSON.stringify(before), snapshot);
});

test("cap: at most two awakenings per season; the third waits for next season", () => {
  const triple = {
    ...BIG,
    pass: 65,
    skills: [],
  };
  const { state, fired } = play(createAwakeningState(1997), triple, [
    ev(1, { min: 18, blk: 2, reb: 6, ast: 3, tov: 1 }),
    ev(2, { min: 18, blk: 2, reb: 6, ast: 3, tov: 1 }),
    ev(3, { min: 24, blk: 4, reb: 15, ast: 11, tov: 1 }),
  ]);
  // Fixed firing order: rim, then glass. Dime completed too but waits.
  assert.deepEqual(fired.map((f) => f.skillId), ["rim_protector", "glass_cleaner"]);
  assert.deepEqual(state.ready.map((r) => r.skillId), ["dime_dropper"]);
  // Next season: one played game is enough for the ready rule to fire.
  const next = recordGame(state, { evidence: ev(1, { season: 1998, min: 20 }), card: triple });
  assert.deepEqual(next.awakened.map((f) => f.skillId), ["dime_dropper"]);
  assert.equal(next.state.awakened.length, 3);
});

test("a full skill card stays ready instead of firing", () => {
  const full = {
    ...BIG,
    skills: ["cold_mid", "mid_maestro", "freeze_iso", "paint_finisher", "first_step", "rainmaker", "corner_sniper"],
  };
  assert.equal(skillSlotsFull(full), true, "test card really is full");
  const { state, fired } = play(createAwakeningState(1997), full, [
    ev(1, { min: 20, blk: 2 }),
    ev(2, { min: 12, blk: 1 }),
    ev(3, { min: 24, blk: 4 }),
  ]);
  assert.deepEqual(fired, []);
  assert.deepEqual(state.ready.map((r) => r.skillId), ["rim_protector"]);
});

test("a player who cannot retain the skill completes but never fires", () => {
  const weakBlock = { ...BIG, block: 50 }; // rim gate needs block >= 68
  const { state, fired } = play(createAwakeningState(1997), weakBlock, [
    ev(1, { min: 20, blk: 2 }),
    ev(2, { min: 12, blk: 1 }),
    ev(3, { min: 24, blk: 4 }),
  ]);
  assert.deepEqual(fired, []);
  assert.deepEqual(state.ready.map((r) => r.skillId), ["rim_protector"]);
  const rim = progressFor(state, weakBlock).find((p) => p.ruleId === "rim");
  assert.equal(rim.abilityMet, false);
});

test("a new season resets the form but keeps what was learned", () => {
  const { state } = play(createAwakeningState(1997), BIG, [
    ev(1, { min: 20, blk: 2 }),
    ev(2, { min: 12, blk: 1 }),
    ev(3, { min: 24, blk: 4 }),
  ]);
  assert.equal(state.awakened.length, 1);
  const next = recordGame(state, { evidence: ev(1, { season: 1998, min: 20, blk: 1 }), card: BIG });
  assert.equal(next.state.awakened.length, 1, "learned skill survives");
  assert.equal(next.state.form.length, 1, "form restarts in the new season");
  assert.equal(next.state.clutchMakes, 0);
});

test("skillSourceOf splits innate / awakened / purchased", () => {
  const card = { skills: ["cold_mid", "rim_protector", "dime_dropper"], purchasedSkills: ["dime_dropper"] };
  const state = {
    ...createAwakeningState(1997),
    awakened: [{ skillId: "rim_protector", source: "awakened", game: 3, season: 1997, evidence: { qualifying: 3, keyGame: 3 } }],
  };
  assert.deepEqual(skillSourceOf(card, state), {
    innate: ["cold_mid"],
    awakened: ["rim_protector"],
    purchased: ["dime_dropper"],
  });
});

test("evidenceFromReport: game-winner math", () => {
  const base = {
    game: 5,
    year: 1997,
    line: { min: 30, blk: 1, reb: 2, ast: 1, tov: 0 },
    score: { home: 98, away: 97 },
    won: true,
  };
  const winner = evidenceFromReport({
    ...base,
    takeover: { attempted: true, made: true, points: 2, zone: "two" },
  });
  assert.equal(winner.clutchMade, true);
  assert.equal(winner.clutchGameWinner, true, "margin 1 <= 2 points");
  const notWinner = evidenceFromReport({
    ...base,
    score: { home: 100, away: 97 },
    takeover: { attempted: true, made: true, points: 2, zone: "two" },
  });
  assert.equal(notWinner.clutchMade, true);
  assert.equal(notWinner.clutchGameWinner, false, "margin 3 > 2 points");
  const missed = evidenceFromReport({
    ...base,
    takeover: { attempted: true, made: false, points: 0, zone: "three" },
  });
  assert.equal(missed.clutchMade, false);
  assert.equal(missed.clutchGameWinner, false);
  const none = evidenceFromReport({ ...base, takeover: null });
  assert.equal(none.clutchMade, false);
});

test("normalizeAwakeningState never throws on junk", () => {
  assert.deepEqual(normalizeAwakeningState(undefined).awakened, []);
  assert.deepEqual(normalizeAwakeningState({ ready: ["rim_protector"] }).ready, [
    { skillId: "rim_protector", evidence: null },
  ]);
});
