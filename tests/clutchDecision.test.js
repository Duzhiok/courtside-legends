import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";

const SCENARIO = { clock: 12, score: { home: 97, away: 100 }, hint: "three" };

function build(seed, sc = SCENARIO) {
  const sim = new GameSim({
    home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3,
    rng: seededStream(seed), onEvent() {}, onTick() {}, onEnd() {},
  });
  sim.running = true;
  sim.paused = false;
  sim.quarter = 4;
  sim.clock = sc.clock;
  sim.score = { ...sc.score };
  sim.possession = "home";
  return sim;
}
const submit = (sim, shooterId, actionHint = "three") =>
  sim.submitDecision({ attemptId: sim.issueAttemptId(), kind: "clutch_shooter", shooterId, actionHint });
/** An on-court player who is NOT the one the late-game script would pick. */
function otherThan(sim) {
  sim.step();
  const scriptId = sim.home.temp?.lateChase?.shooterId;
  return sim.home.onCourt.find((p) => p.id !== scriptId);
}

test("submitDecision: rejects bad input, stale ids, off-court shooters and finished games with a reason", () => {
  const sim = build(1);
  const x = sim.home.onCourt[1];
  assert.deepEqual(sim.submitDecision(null), { accepted: false, reason: "invalid" });
  assert.equal(sim.submitDecision({ attemptId: "x", kind: "nope", shooterId: x.id, actionHint: "three" }).reason, "invalid");
  assert.equal(sim.submitDecision({ attemptId: "x", kind: "clutch_shooter", shooterId: x.id, actionHint: "dunk" }).reason, "invalid");
  assert.equal(sim.submitDecision({ attemptId: "never-issued", kind: "clutch_shooter", shooterId: x.id, actionHint: "three" }).reason, "stale_attempt");
  const stale = sim.issueAttemptId();
  sim.issueAttemptId(); // a newer id supersedes it
  assert.equal(sim.submitDecision({ attemptId: stale, kind: "clutch_shooter", shooterId: x.id, actionHint: "three" }).reason, "stale_attempt");
  const bench = sim.home.roster.find((p) => !sim.home.onCourt.includes(p));
  assert.equal(submit(sim, bench.id).reason, "not_on_court");
  assert.equal(sim.clutchDecision, null, "nothing armed by any rejection");
  const ok = submit(sim, x.id);
  assert.deepEqual(ok, { accepted: true, reason: null });
  assert.equal(sim.submitDecision({ attemptId: sim._clutchAttemptId ?? "clutch-1", kind: "clutch_shooter", shooterId: x.id, actionHint: "three" }).reason, "stale_attempt", "one decision per issued id");
  sim.running = false;
  assert.equal(submit(sim, x.id).reason, "game_over");
});

test("a decision is consumed by exactly one of your possessions and publishes a structured outcome", () => {
  const sim = build(3);
  const x = otherThan(build(3));
  assert.ok(submit(sim, x.id).accepted);
  for (let i = 0; i < 6 && !sim.clutchLog.length; i++) sim.step();
  assert.equal(sim.clutchLog.length, 1);
  const o = sim.clutchLog[0];
  for (const k of ["attemptId", "shooterId", "actionHint", "handedOff", "attempted", "zone", "made", "points", "honored", "reason"]) {
    assert.ok(k in o, `outcome has ${k}`);
  }
  assert.equal(o.honored, o.attempted);
  assert.equal(sim.clutchDecision, null);
  if (!o.attempted) assert.ok(o.reason, "a decision that did not end in a shot says why");
  if (o.attempted) assert.equal(o.reason, null);
});

test("same seed + same decision => same outcome (deterministic)", () => {
  const run = () => {
    const sim = build(7);
    const x = otherThan(build(7));
    submit(sim, x.id);
    for (let i = 0; i < 6 && !sim.clutchLog.length; i++) sim.step();
    return JSON.stringify([sim.clutchLog, sim.score]);
  };
  assert.equal(run(), run());
});

test("no decision submitted => engine untouched (nothing armed, nothing logged, same score as before)", () => {
  const a = build(5), b = build(5);
  a.runFast();
  b.issueAttemptId(); // issuing an id alone must not change play
  b.runFast();
  assert.deepEqual(a.score, b.score);
  assert.equal(a.clutchLog.length, 0);
  assert.equal(b.clutchLog.length, 0);
});

test("an armed decision that never gets a possession is closed with no_possession at the buzzer", () => {
  const sim = build(2);
  submit(sim, sim.home.onCourt[1].id);
  sim.nextQuarter();
  assert.equal(sim.clutchLog[0].reason, "no_possession");
  assert.equal(sim.clutchDecision, null);
});

test("shooter who left the floor before the possession => not_on_court, play continues normally", () => {
  const sim = build(4);
  const x = sim.home.onCourt[1];
  submit(sim, x.id);
  sim.home.onCourt = sim.home.onCourt.filter((p) => p.id !== x.id);
  sim.home.onCourt.push(sim.home.roster.find((p) => !sim.home.onCourt.includes(p) && p.id !== x.id));
  sim.step();
  assert.equal(sim.clutchLog[0].reason, "not_on_court");
});

test("the pick takes the shot far more often than by default, WITHOUT any accuracy bonus", () => {
  const N = 1200; // default play only gives the pick ~14% of the shots, so FG% needs this many seeds to be quiet
  const probe = build(1);
  const x = otherThan(probe);
  const tally = (decide) => {
    let shots = 0, mine = 0, made = 0, tov = 0, poss = 0;
    for (let seed = 1; seed <= N; seed++) {
      const sim = build(seed);
      if (decide) assert.ok(submit(sim, x.id).accepted);
      const f0 = sim.home.roster.reduce((n, p) => n + p.stats.fga, 0), t0 = sim.home.roster.reduce((n, p) => n + p.stats.tov, 0);
      const px = sim.home.roster.find((p) => p.id === x.id);
      const [xf0, xm0] = [px.stats.fga, px.stats.fgm];
      for (let i = 0; i < 6; i++) {
        sim.step();
        if (sim.home.roster.reduce((n, p) => n + p.stats.fga, 0) > f0 || sim.home.roster.reduce((n, p) => n + p.stats.tov, 0) > t0) break;
      }
      const f1 = sim.home.roster.reduce((n, p) => n + p.stats.fga, 0), t1 = sim.home.roster.reduce((n, p) => n + p.stats.tov, 0);
      if (f1 > f0) { shots++; if (px.stats.fga > xf0) { mine++; made += px.stats.fgm - xm0; } }
      if (f1 > f0 || t1 > t0) poss++;
      if (t1 > t0) tov++;
    }
    return { share: mine / shots, fg: made / Math.max(1, mine), tov: tov / poss, mine };
  };
  const base = tally(false), picked = tally(true);
  // Product target is >=35%; the engine delivers ~90%, and a half-broken read point still clears 35%
  // (kick weighting alone gives ~30-50%), so the regression bar sits well above the target.
  assert.ok(picked.share >= 0.6, `pick share ${picked.share.toFixed(2)} (target >=0.35, regression bar 0.6)`);
  assert.ok(picked.share - base.share >= 0.4, `and is far above default (${base.share.toFixed(2)})`);
  assert.ok(picked.share < 0.99, "never a guaranteed shot");
  assert.ok(Math.abs(picked.fg - base.fg) < 0.10, `no accuracy bonus (fg ${base.fg.toFixed(2)} -> ${picked.fg.toFixed(2)})`);
  assert.ok(picked.tov > 0, "turnovers stay possible");
});

function outcomesFor(x, hint, n = 300) {
  const out = [];
  for (let seed = 1; seed <= n; seed++) {
    const sim = build(seed);
    submit(sim, x.id, hint);
    for (let i = 0; i < 6 && !sim.clutchLog.length; i++) sim.step();
    assert.ok(sim.clutchLog[0], `seed ${seed}: decision settled`);
    out.push(sim.clutchLog[0]);
  }
  return out;
}

test("across seeds every outcome is internally consistent and every miss-to-shoot names its reason", () => {
  const x = otherThan(build(1));
  const REASONS = new Set(["doubled", "kicked_out", "turnover", "foul", "not_handed_off", "not_on_court", "no_possession"]);
  const seen = new Set();
  for (const o of outcomesFor(x, "three")) {
    if (o.attempted) {
      assert.equal(o.reason, null, "a shot has no failure reason");
      assert.ok(["three", "two"].includes(o.zone));
      assert.equal(o.handedOff, true, "can't shoot without the ball");
      assert.ok(!o.made || o.points >= 2, "a make is worth points");
    } else {
      assert.ok(REASONS.has(o.reason), `reason "${o.reason}" is a known one`);
      assert.equal(o.zone, null);
      // `points` is everything the pick scored this possession, free throws included (and-ones, foul trips)
      seen.add(o.reason);
    }
  }
  assert.ok(seen.has("turnover"), "turnovers stay a real outcome");
});

test("'three' vs 'attack' for the same player changes real shot selection, not just a label", () => {
  const x = otherThan(build(1));
  const threeShare = (os) => {
    const shots = os.filter((o) => o.attempted);
    return shots.filter((o) => o.zone === "three").length / shots.length;
  };
  const asThree = threeShare(outcomesFor(x, "three")), asAttack = threeShare(outcomesFor(x, "attack"));
  assert.ok(asThree - asAttack >= 0.1, `three-share ${asAttack.toFixed(2)} (attack) -> ${asThree.toFixed(2)} (three)`);
  assert.ok(asThree < 1, "the engine's own shot-selection gates still apply (a non-shooter does not always pull up)");
});
