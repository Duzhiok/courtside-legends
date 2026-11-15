import test from "node:test";
import assert from "node:assert/strict";
import { realTeam } from "./helpers/realGame.js";
import { GameSim } from "../js/engine/sim.js";
import {
  HALF_COURT_RULES,
  buildHalfCourtTeam,
  countedFreeThrows,
  halfCourtTeamTotals,
  playHalfCourtGame,
  playLines,
} from "../js/modes/halfCourt3v3.js";
import { SANDBOX_MAX, addToSide, buildSandboxTeam } from "../js/modes/sandboxDuel.js";

const top3 = (code, season) => realTeam(code, season).players.slice(0, 3);
const teams = (a = ["GSW", 2016], b = ["CLE", 2016]) => ({
  home: buildHalfCourtTeam(`${a[0]}`, top3(...a), { side: "home" }),
  away: buildHalfCourtTeam(`${b[0]}`, top3(...b), { side: "away" }),
});

function withMathRandomBanned(fn) {
  const real = Math.random;
  Math.random = () => {
    throw new Error("Math.random escaped the seeded 3v3 game");
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

const reached = (score, side, rules = HALF_COURT_RULES) => {
  const other = side === "home" ? "away" : "home";
  return score[side] >= rules.target && score[side] - score[other] >= rules.winBy;
};

test("3v3 rules: 21, win by 2, 1 inside / 2 beyond the arc, 12s clock, 3 a side", () => {
  assert.equal(HALF_COURT_RULES.teamSize, 3);
  assert.equal(HALF_COURT_RULES.target, 21);
  assert.equal(HALF_COURT_RULES.winBy, 2);
  assert.equal(HALF_COURT_RULES.insidePts, 1);
  assert.equal(HALF_COURT_RULES.arcPts, 2);
  assert.equal(HALF_COURT_RULES.shotClock, 12);
  assert.ok(Object.isFrozen(HALF_COURT_RULES));
});

test("3v3 teams: exactly three; the same card on both sides gets distinct match ids", () => {
  const cards = top3("CHI", 1996);
  assert.throws(() => buildHalfCourtTeam("A", cards.slice(0, 2)), /至少 3/);
  assert.throws(() => buildHalfCourtTeam("A", [...cards, cards[0]]), /最多 3/);
  const home = buildHalfCourtTeam("A", cards, { side: "home" });
  const away = buildHalfCourtTeam("B", cards, { side: "away" });
  const ids = [...home.players, ...away.players].map((p) => p.id);
  assert.equal(new Set(ids).size, 6);
  assert.throws(() => playHalfCourtGame({ home, away: { name: "B", players: away.players.slice(0, 2) } }), /exactly 3/);
});

test("sandbox picker rules stay the sandbox's by default; 3v3 options are opt-in", () => {
  const card = top3("CHI", 1996)[0];
  let side = [];
  for (let i = 0; i < SANDBOX_MAX; i++) side = addToSide(side, card); // duplicates still fine in sandbox
  assert.throws(() => addToSide(side, card), /最多 12/);
  assert.throws(() => addToSide([card], card, { max: 3, unique: true }), /只能选一次/);
  assert.throws(() => addToSide([card, card, card], card, { max: 3 }), /最多 3/);
  assert.throws(() => buildSandboxTeam("x", [card, card, card]), /至少 5/);
  assert.equal(buildSandboxTeam("x", [card, card, card], { min: 3, max: 3 }).players.length, 3);
});

test("free throws: half-court allowance per trip (arc foul 2, anything else 1), extra GameSim dice ignored", () => {
  const ft = (shooterId, made) => ({ meta: { ft: { shooterId, made, pts: 1 } } });
  const other = { meta: { reb: { rebounderId: "x", offensive: false } } };
  assert.deepEqual(countedFreeThrows([ft("a", true), ft("a", false), ft("a", true)]), [{ shooterId: "a", attempts: 2, made: 1, rolled: 3 }]);
  assert.deepEqual(countedFreeThrows([ft("a", false), ft("a", true)]), [{ shooterId: "a", attempts: 1, made: 0, rolled: 2 }]);
  assert.deepEqual(countedFreeThrows([ft("a", true)]), [{ shooterId: "a", attempts: 1, made: 1, rolled: 1 }]);
  assert.equal(countedFreeThrows([ft("a", true), other, ft("a", true)]).length, 2, "a non-FT event ends the trip");
  assert.equal(countedFreeThrows([ft("a", true), ft("b", true)]).length, 2, "a new shooter starts a new trip");
  assert.deepEqual(countedFreeThrows([other]), []);
});

test("a real game ends at the FIRST possession that reaches 21 with a 2-point lead, and the box adds up", () => {
  for (const seed of ["a", "b", "c", "d", "e", "f"]) {
    const r = playHalfCourtGame({ ...teams(), seed });
    const { score, winner } = r;
    assert.ok(reached(score, winner), `${seed}: ${score.home}-${score.away}`);
    assert.ok(!reached(score, winner === "home" ? "away" : "home"));
    assert.equal(r.capped, false);
    // Never reached earlier.
    for (const p of r.plays.slice(0, -1)) {
      assert.ok(!reached(p.score, "home") && !reached(p.score, "away"), `${seed}: ended late at play ${p.n}`);
    }
    for (const side of ["home", "away"]) {
      const lines = r.box[side];
      assert.equal(lines.length, 3);
      for (const l of lines) {
        assert.equal(l.pts, l.fgm1 * 1 + l.fgm2 * 2 + l.ftm, `${l.name}: 1 inside, 2 beyond the arc, 1 per counted FT`);
        assert.ok(l.fgm1 <= l.fga1 && l.fgm2 <= l.fga2 && l.ftm <= l.fta);
      }
      assert.equal(halfCourtTeamTotals(lines).pts, score[side], `${seed} ${side}: box total = score`);
    }
    let prev = { home: 0, away: 0 };
    for (const [i, p] of r.plays.entries()) {
      assert.ok(p.shotClockUsed >= 1 && p.shotClockUsed <= HALF_COURT_RULES.shotClock, "a possession never runs past 12s");
      assert.ok(p.score.home >= prev.home && p.score.away >= prev.away);
      prev = p.score;
      const next = r.plays[i + 1];
      if (next) assert.equal(p.clear, next.offense !== p.offense, "clear-the-ball exactly when the ball changes sides");
      if (p.lines.some((l) => l.kind === "oreb") && next && !p.lines.some((l) => l.kind === "dreb" || l.kind === "turnover")) {
        assert.equal(next.offense, p.offense, "offensive rebound: same team plays on");
      }
    }
  }
});

test("seeded: same teams + seed -> identical game; Math.random never touched; seeds differ", () => {
  const a = withMathRandomBanned(() => playHalfCourtGame({ ...teams(), seed: "same" }));
  const b = withMathRandomBanned(() => playHalfCourtGame({ ...teams(), seed: "same" }));
  assert.deepEqual(a, b);
  const finals = new Set(["s1", "s2", "s3", "s4"].map((seed) => JSON.stringify(playHalfCourtGame({ ...teams(), seed }).score)));
  assert.ok(finals.size > 1, "different seeds play different games");
});

test("it is GameSim playing: ratings matter, and the side you are on does not", () => {
  // 2016 Warriors' top three vs 2001 Sixers' bottom three of their top ten.
  const strong = top3("GSW", 2016);
  const weak = realTeam("PHI", 2001).players.slice(7, 10);
  let strongWins = 0;
  let asAway = 0;
  for (let s = 0; s < 20; s++) {
    const r1 = playHalfCourtGame({ home: buildHalfCourtTeam("S", strong), away: buildHalfCourtTeam("W", weak, { side: "away" }), seed: `r${s}` });
    const r2 = playHalfCourtGame({ home: buildHalfCourtTeam("W", weak), away: buildHalfCourtTeam("S", strong, { side: "away" }), seed: `r${s}` });
    if (r1.winner === "home") strongWins += 1;
    if (r2.winner === "away") asAway += 1;
  }
  assert.ok(strongWins >= 15, `strong trio won ${strongWins}/20 at home`);
  assert.ok(asAway >= 15, `strong trio won ${asAway}/20 away`);
});

test("one timeout per team, spent through GameSim's callTimeout when the trio is gassed", () => {
  const rules = { ...HALF_COURT_RULES, timeoutFatigue: 0 };
  const r = playHalfCourtGame({ ...teams(), seed: "to", rules });
  const timeouts = r.plays.flatMap((p) => p.lines.filter((l) => l.kind === "timeout").map((l) => l.side));
  assert.deepEqual([...timeouts].sort(), ["away", "home"]);
  const off = playHalfCourtGame({ ...teams(), seed: "to", rules: { ...HALF_COURT_RULES, timeoutsPerTeam: 0 } });
  assert.equal(off.plays.flatMap((p) => p.lines.filter((l) => l.kind === "timeout")).length, 0);
});

test("safety valve: past maxPossessions the leader wins (flagged capped)", () => {
  const r = playHalfCourtGame({ ...teams(), seed: "cap", rules: { ...HALF_COURT_RULES, maxPossessions: 6 } });
  assert.ok(r.possessions >= 6 && r.possessions <= 12);
  assert.equal(r.capped, true);
  assert.ok(r.score[r.winner] > r.score[r.winner === "home" ? "away" : "home"] || r.possessions === 12);
});

test("teams passed in are not mutated into match state (Retry replays the same picks)", () => {
  const t = teams();
  const before = JSON.stringify(t.home.players.map((p) => ({ id: p.id, ovr: p.ovr, fatigue: p.fatigue, stats: p.stats })));
  playHalfCourtGame({ ...t, seed: "m1" });
  assert.equal(JSON.stringify(t.home.players.map((p) => ({ id: p.id, ovr: p.ovr, fatigue: p.fatigue, stats: p.stats }))), before);
  assert.deepEqual(playHalfCourtGame({ ...t, seed: "m2" }), playHalfCourtGame({ ...teams(), seed: "m2" }));
});

test("playLines: an event carrying foul+turnover yields BOTH lines (charge, loose-ball foul)", () => {
  const nameOf = (id) => ({ baller: "持球人", defender: "防守人" }[id] || id);
  // sim.js:950 charge: the fouler is the baller, turnover kind charge.
  const charge = [{ meta: { actorId: "defender", foul: { foulerId: "baller", victimId: "defender", kind: "charge" }, turnover: { actorId: "baller", kind: "charge", forcedById: "defender" } } }];
  const chargeLines = playLines(charge, nameOf, "zh");
  assert.equal(chargeLines.length, 2);
  assert.deepEqual(chargeLines.map((l) => l.kind), ["turnover", "foul"]);
  assert.equal(chargeLines[1].playerId, "baller");
  // sim.js:1036 loose-ball foul after a turnover: the fouler is the defender.
  const loose = [{ meta: { actorId: "baller", foul: { foulerId: "defender", victimId: "baller", kind: "defensive" }, turnover: { actorId: "baller", kind: "foul", forcedById: "defender" } } }];
  const looseLines = playLines(loose, nameOf, "zh");
  assert.equal(looseLines.length, 2);
  assert.deepEqual(looseLines.map((l) => l.kind), ["turnover", "foul"]);
  assert.equal(looseLines[1].playerId, "defender");
  // Foul-only events still yield exactly one foul line (and-one / shooting / technical).
  const solo = [{ meta: { foul: { foulerId: "defender", victimId: "baller", kind: "shooting" } } }];
  assert.deepEqual(playLines(solo, nameOf, "zh").map((l) => l.kind), ["foul"]);
  // And a plain turnover still yields exactly one line.
  const tov = [{ meta: { actorId: "baller", turnover: { actorId: "baller", kind: "unforced", forcedById: "defender" } } }];
  assert.deepEqual(playLines(tov, nameOf, "zh").map((l) => l.kind), ["turnover"]);
});

test("engine failure mid-game ends the game early with a valid result, never an exception", () => {
  const origStep = GameSim.prototype.step;
  const origError = console.error;
  const errors = [];
  console.error = (...args) => { errors.push(args); };
  let calls = 0;
  GameSim.prototype.step = function (...args) {
    calls += 1;
    if (calls === 5) throw new Error("simulated engine failure");
    return origStep.apply(this, args);
  };
  try {
    const r = playHalfCourtGame({ ...teams(), seed: "boom" });
    assert.equal(r.aborted, true);
    assert.equal(r.plays.length, 4, "only completed possessions are kept");
    assert.equal(r.capped, false);
    assert.ok(r.winner === "home" || r.winner === "away");
    if (r.score.home !== r.score.away) {
      assert.equal(r.winner, r.score.home > r.score.away ? "home" : "away", "the leader at abort time takes it");
    }
    for (const side of ["home", "away"]) {
      assert.equal(halfCourtTeamTotals(r.box[side]).pts, r.score[side], "the box still adds up");
    }
    assert.ok(errors.some(([msg]) => String(msg).includes("[3v3] sim.step failed")), "the failure is logged, not swallowed silently");
  } finally {
    GameSim.prototype.step = origStep;
    console.error = origError;
  }
});

test("engine failure on the first possession still returns a viewable result", () => {
  const origStep = GameSim.prototype.step;
  const origError = console.error;
  console.error = () => {};
  GameSim.prototype.step = function () { throw new Error("simulated engine failure"); };
  try {
    const r = playHalfCourtGame({ ...teams(), seed: "boom-first" });
    assert.equal(r.aborted, true);
    assert.deepEqual(r.plays, []);
    assert.deepEqual(r.score, { home: 0, away: 0 });
    assert.ok(r.winner === "home" || r.winner === "away");
    for (const side of ["home", "away"]) {
      assert.equal(r.box[side].length, 3);
      assert.equal(halfCourtTeamTotals(r.box[side]).pts, 0);
    }
  } finally {
    GameSim.prototype.step = origStep;
    console.error = origError;
  }
});

test("plays carry no dead points/gained fields (score deltas already tell the story)", () => {
  const r = playHalfCourtGame({ ...teams(), seed: "dead" });
  assert.ok(r.plays.length > 0);
  for (const p of r.plays) {
    assert.ok(!("points" in p) && !("gained" in p), "no dead per-possession point fields");
    assert.deepEqual(Object.keys(p).sort(), ["clear", "elapsedSec", "lines", "n", "offense", "score", "shotClockUsed"]);
  }
});
