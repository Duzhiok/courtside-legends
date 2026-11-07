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

// --- R161: already_armed + structured-event contract (what ClutchController will depend on) ---

test("already_armed: a second pending decision is rejected, the first is kept, and no dice are rolled", () => {
  const run = (extraSubmit) => {
    const sim = build(11);
    const [first, second] = sim.home.onCourt;
    const ok = submit(sim, first.id, "three");
    let dup = null;
    if (extraSubmit) dup = submit(sim, second.id, "attack");
    for (let i = 0; i < 14 && !sim.clutchLog.length; i++) sim.step();
    return { sim, ok, dup, first };
  };
  const plain = run(false);
  const withDup = run(true);
  assert.deepEqual(withDup.ok, { accepted: true, reason: null });
  assert.deepEqual(withDup.dup, { accepted: false, reason: "already_armed" });
  assert.equal(withDup.sim.clutchLog.length, 1, "exactly one terminal outcome");
  assert.equal(withDup.sim.clutchLog[0].shooterId, withDup.first.id, "the original decision survived");
  assert.deepEqual(withDup.sim.clutchLog, plain.sim.clutchLog, "rejected call changed nothing (same dice, same outcome)");
  assert.deepEqual(withDup.sim.score, plain.sim.score);
});

test("validation precedence: a stale id is reported as stale even while a decision is armed", () => {
  const sim = build(12);
  const x = sim.home.onCourt[0];
  const old = sim.issueAttemptId();
  assert.equal(submit(sim, x.id).accepted, true); // arms with a fresh id
  assert.equal(sim.submitDecision({ attemptId: old, kind: "clutch_shooter", shooterId: x.id, actionHint: "three" }).reason, "stale_attempt");
  assert.equal(submit(sim, x.id).reason, "already_armed");
  assert.equal(sim.submitDecision({ attemptId: "x", kind: "nope" }).reason, "invalid");
});

function playWithEvents(seed, decide) {
  const events = [];
  const sim = build(seed);
  sim.onEvent = (e) => events.push(e);
  const fga = new Map(sim.home.roster.map((p) => [p.id, p.stats.fga || 0]));
  const before = sim.score.home;
  const x = decide ? sim.home.onCourt.find((p) => p.id !== sim.home.temp?.lateChase?.shooterId) : null;
  if (decide) submit(sim, x.id, "three");
  for (let i = 0; i < 14 && (decide ? !sim.clutchLog.length : i < 6); i++) sim.step();
  const shooters = sim.home.roster.filter((p) => (p.stats.fga || 0) > fga.get(p.id)).map((p) => p.id);
  return { sim, events, x, shooters, gained: sim.score.home - before };
}

test("meta.clutchOutcome: one per accepted decision, identical to clutchLog, consistent with the real possession", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { sim, events, x, shooters, gained } = playWithEvents(seed, true);
    const metas = events.filter((e) => e.meta?.clutchOutcome).map((e) => e.meta.clutchOutcome);
    assert.equal(metas.length, 1, `seed ${seed}: exactly one terminal outcome event`);
    const o = metas[0];
    assert.deepEqual(o, sim.clutchLog[0], "event meta and clutchLog carry the same outcome");
    assert.deepEqual(JSON.parse(JSON.stringify(o)), o, "outcome is plain serializable data");
    assert.equal(o.attemptId, "clutch-1");
    assert.equal(o.shooterId, x.id);
    assert.equal(o.actionHint, "three");
    if (o.reason === "no_possession" || o.reason === "not_on_court") continue;
    assert.equal(o.attempted, shooters.includes(x.id), "attempted matches the box score");
    assert.equal(o.actualShooterId, shooters[0] ?? null, "actualShooterId is whoever really shot");
    if (o.attempted) assert.equal(o.actualShooterId, x.id);
    assert.equal(o.teamPoints, gained, "teamPoints is the real score change");
    assert.equal(o.honored, o.attempted);
    if (!o.attempted) assert.ok(["turnover", "foul", "not_handed_off", "kicked_out", "doubled"].includes(o.reason), o.reason);
  }
});

test("no decision => no clutch outcome event at all", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { sim, events } = playWithEvents(seed, false);
    assert.equal(events.filter((e) => e.meta?.clutchOutcome).length, 0);
    assert.equal(sim.clutchLog.length, 0);
  }
});

// Role-aware delivery (R165). Ranges are per archetype on purpose: a creator, a catch-and-shoot specialist and a post
// scorer are NOT expected to land on one shared share. What must hold: the call helps, it is not forced, shots stay real.
test("role-aware delivery: the call lifts specialists and post players without forcing them or hurting shot quality", async () => {
  const { CASES, runOne } = await import("../scripts/research/clutch-calibration-sweep.mjs");
  const N = 300;
  const measure = (label) => {
    const c = CASES.find((x) => x.label.startsWith(label));
    let shots = 0, mine = 0, n = 0, made = 0, role = null, bm = 0, bFga = 0, bFgm = 0;
    for (let seed = 1; seed <= N; seed++) {
      const r = runOne(c, "three", true, seed);
      n++; role = r.o.role;
      if (r.shot) shots++;
      if (r.mine) { mine++; if (r.o.made) made++; }
      const b = runOne(c, "three", false, seed);
      if (b.mine) bm++;
      bFga += b.fga; bFgm += b.fgm;
    }
    return { role, share: (100 * mine) / shots, perDecision: (100 * mine) / n, base: (100 * bm) / n, fg: (100 * made) / mine, baseFg: (100 * bFgm) / bFga };
  };
  const specialists = ["Klay", "Kukoc", "Kerr"].map((l) => [l, measure(l)]);
  for (const [l, m] of specialists) {
    assert.equal(m.role, "catch_shoot", l);
    assert.ok(m.perDecision >= m.base + 15, `${l}: the call must beat his normal rate (${m.perDecision.toFixed(1)} vs ${m.base.toFixed(1)})`);
    assert.ok(m.share >= 45 && m.share <= 80, `${l}: share ${m.share.toFixed(1)} should be large but not forced`);
    assert.ok(m.fg >= m.baseFg - 8, `${l}: shot quality must not collapse (${m.fg.toFixed(1)} vs ${m.baseFg.toFixed(1)})`);
  }
  const duncan = measure("Duncan");
  assert.equal(duncan.role, "post");
  assert.ok(duncan.perDecision >= 45 && duncan.perDecision >= duncan.base + 30 && duncan.share <= 85, `post: ${duncan.perDecision.toFixed(1)} / ${duncan.share.toFixed(1)}`);
  assert.ok(duncan.fg >= duncan.baseFg - 12, "post: still shoots like a post player");
  const curry = measure("Curry");
  assert.equal(curry.role, "creator");
  assert.ok(curry.share >= 40 && curry.share <= 90, `creator share ${curry.share.toFixed(1)}`);
});

test("outcome records the role and the delivery mode, and every non-shot has a known reason", async () => {
  const { CASES, runOne } = await import("../scripts/research/clutch-calibration-sweep.mjs");
  const known = new Set(["turnover", "foul", "not_handed_off", "kicked_out", "doubled", "not_on_court", null]);
  for (const label of ["Klay", "Duncan", "Curry"]) {
    const c = CASES.find((x) => x.label.startsWith(label));
    for (let seed = 1; seed <= 40; seed++) {
      const { o } = runOne(c, "three", true, seed);
      assert.ok(["creator", "playmaker", "catch_shoot", "post", "role_player"].includes(o.role), o.role);
      assert.ok(["on_ball", "off_ball", "entry"].includes(o.delivery), o.delivery);
      assert.ok(known.has(o.reason), `unknown reason ${o.reason}`);
      assert.equal(o.attempted, o.reason === null, "attempted XOR reason");
    }
  }
});

// ---- M2b-1 final correction: a called creator under pressure may find the open man (R168) ----
const sweep = await import("../scripts/research/clutch-calibration-sweep.mjs");
const caseOf = (re) => sweep.CASES.find((c) => re.test(c.label));
function tally(c, decide, seeds = 300) {
  let shots = 0, mine = 0, kicked = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = sweep.runOne(c, "three", decide, seed);
    if (!r) continue;
    if (r.shot) shots++;
    if (r.mine) mine++;
    if (r.o?.reason === "kicked_out") kicked++;
  }
  return { shots, mine, kicked };
}

test("pressured creator: Stockton now sometimes finds the open man instead of forcing every shot", () => {
  const t = tally(caseOf(/Stockton/), true);
  assert.ok(t.kicked > 0, "under pressure he passes at least sometimes");
  assert.ok(t.mine / t.shots < 0.95, `share ${(t.mine / t.shots).toFixed(3)} is no longer ~97%`);
  assert.ok(t.mine / t.shots > 0.6, "the call still matters: he remains the main option");
});

test("pressured creator passes with the normal pass appetite: a lone-wolf, poor-passing version passes less", () => {
  const c = caseOf(/Stockton/);
  const [home, away] = c.t;
  const gunnerHome = home.map((p) => (/Stockton/.test(p.name) ? { ...p, pass: 40, skills: [...(p.skills || []), "lone_wolf"] } : p));
  const playmaker = tally(c, true);
  const gunner = tally({ ...c, t: [gunnerHome, away] }, true);
  assert.ok(gunner.kicked < playmaker.kicked, `gunner ${gunner.kicked} < playmaker ${playmaker.kicked}`);
});

test("picking the script's own shooter (Curry) is identical to no decision: the call has no increment there by design", () => {
  const c = caseOf(/Curry/);
  const withCall = tally(c, true, 200);
  const without = tally(c, false, 200);
  assert.equal(withCall.mine, without.mine);
});
