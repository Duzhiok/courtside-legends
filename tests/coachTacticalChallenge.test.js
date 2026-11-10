// Coach tactical comeback challenge — the slice controller on the real engine.
// Pins the scenario, the moment state machine, the real sim calls behind
// every choice, determinism under a fixed seed, and the decision report.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { seededStream } from "../js/core/seededRandom.js";
import { CLUTCH_POOL } from "./helpers/clutchSim.js";
import { createCoachingChallenge, COACH_COMEBACK_SCENARIO } from "../js/career/coach/coachingChallenge.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const challenge = (seed = 1, opts = {}) => createCoachingChallenge({ pool: CLUTCH_POOL, rng: seededStream(seed), ...opts });

/** Play a whole challenge with the same opening choice; returns the report. */
function playThrough(seed, openingChoice, { recommend = null } = {}) {
  const c = challenge(seed, recommend ? { recommend } : {});
  const started = c.start();
  assert.ok(started.ok, `start must succeed (seed ${seed})`);
  const picked = c.choose(openingChoice);
  assert.ok(picked.ok, `choose ${openingChoice} must succeed: ${picked.reason || ""}`);
  let guard = 0;
  while (c.state !== "ended" && guard < 40) {
    const res = c.playChunk(8);
    if (res.status === "moment") {
      const m = res.moment;
      const choice = m.choices.find((x) => !x.disabled) || m.choices[0];
      const r = c.choose(choice.id);
      assert.ok(r.ok, `choose ${choice.id} in ${m.kind} must succeed: ${r.reason || ""}`);
    } else if (res.status === "ended") {
      return res.report;
    }
    guard += 1;
  }
  assert.equal(c.state, "ended", `challenge must end (seed ${seed}, state ${c.state})`);
  return c.finish().report;
}

test("no randomness of its own — the controller never reads Math.random", () => {
  const src = readFileSync(join(HERE, "../js/career/coach/coachingChallenge.js"), "utf8");
  assert.ok(!src.includes("Math.random"), "coachingChallenge must not read Math.random");
});

test("start builds the Q4 down-10 scenario and presents the opening moment", () => {
  const c = challenge(1);
  const res = c.start();
  assert.equal(res.ok, true);
  assert.equal(c.state, "moment");
  const sim = c._sim();
  assert.equal(sim.quarter, 4);
  assert.equal(sim.clock, COACH_COMEBACK_SCENARIO.clock);
  assert.deepEqual(sim.score, { home: 85, away: 95 });
  assert.equal(sim.possession, "away");
  const m = res.moment;
  assert.equal(m.kind, "opening");
  assert.deepEqual(m.choices.map((x) => x.id), ["switch_all", "zone_drop", "pack_paint"]);
  for (const choice of m.choices) {
    assert.ok(choice.preview?.zh, `${choice.id} has a preview`);
    assert.ok(choice.downside?.zh, `${choice.id} names its downside`);
    assert.ok(choice.risk?.level, `${choice.id} carries an execution risk`);
    assert.ok(Number.isFinite(choice.familiarity), `${choice.id} carries familiarity`);
  }
  assert.equal(typeof c.momentShape().choice, "string");
});

test("every opening choice applies a real sim call and is logged with before/after", () => {
  for (const [choiceId, tacticId] of [["switch_all", "switch_all"], ["zone_drop", "zone_drop"], ["pack_paint", "pack_paint"]]) {
    const c = challenge(2);
    c.start();
    const before = c._sim().you().fit;
    const res = c.choose(choiceId);
    assert.equal(res.ok, true, `${choiceId}: ${res.reason || ""}`);
    assert.equal(c._sim().you().tactic.id, tacticId);
    assert.equal(c.state, "playing");
    const [d] = c.decisions;
    assert.equal(d.choiceId, choiceId);
    assert.equal(d.momentId, "moment-1");
    assert.equal(d.fitBefore, before);
    assert.ok(Number.isFinite(d.fitAfter));
    assert.ok(Number.isFinite(d.moraleBefore) && Number.isFinite(d.moraleAfter));
    assert.equal(d.clock, 720);
    assert.deepEqual(d.score, { home: 85, away: 95 });
  }
});

test("panel actions flow through the existing sim interfaces and cost real timeouts", () => {
  const c = challenge(3);
  c.start();
  c.choose("zone_drop");
  assert.equal(c.callTimeout().ok, true);
  assert.equal(c._sim().timeouts.home, 6);
  assert.deepEqual(c.setFocus("iso_star"), { ok: true, focusId: "iso_star" });
  assert.equal(c._sim().focusPlay?.id, "iso_star");
  assert.deepEqual(c.setTempo("push"), { ok: true, tempoId: "push" });
  assert.equal(c._sim().you().gameplan.tempo, "push");
  assert.equal(c.shout().ok, true);
  assert.equal(c.talk().ok, true);
  const out = c._sim().you().onCourt[0];
  const inn = c._sim().you().bench[0];
  assert.equal(c.substitute(out.id, inn.id).ok, true);
  assert.ok(c._sim().you().onCourt.some((p) => p.id === inn.id));
});

test("determinism: same seed + same choices => identical final score and swings", () => {
  const a = playThrough(7, "switch_all");
  const b = playThrough(7, "switch_all");
  assert.deepEqual(a.final, b.final);
  assert.equal(a.won, b.won);
  assert.deepEqual(
    a.decisions.map((d) => [d.choiceId, d.swing]),
    b.decisions.map((d) => [d.choiceId, d.swing]),
  );
});

test("different opening choices diverge on the same seed (the engine consumes the choice)", () => {
  const results = {};
  for (const choice of ["switch_all", "zone_drop", "pack_paint"]) {
    results[choice] = playThrough(11, choice);
  }
  const finals = Object.values(results).map((r) => `${r.final.home}-${r.final.away}`);
  assert.ok(new Set(finals).size > 1, `choices must diverge on seed 11, got ${finals.join(" / ")}`);
  // Baseline (no decisions at all) for the same seed, for the A/B script's sanity.
  const base = challenge(11);
  base.start();
  const res = base.finish();
  assert.ok(res.report.final.home !== undefined);
});

test("a CPU timeout mid-Q4 does not stall the challenge (seed 5 freezes without the resume)", () => {
  const report = playThrough(5, "pack_paint");
  assert.ok(Number.isInteger(report.final.home) && Number.isInteger(report.final.away));
  assert.equal(typeof report.won, "boolean");
});

test("the report is built from real sim data: swings, fit/morale, promises, career effect", () => {
  const report = playThrough(5, "pack_paint");
  assert.ok(Number.isInteger(report.final.home) && Number.isInteger(report.final.away));
  assert.equal(typeof report.won, "boolean");
  assert.equal(report.deficitStart, 10);
  assert.ok(report.decisions.length >= 1);
  for (const d of report.decisions) {
    assert.ok(Number.isInteger(d.swing), "each decision carries a measured swing");
    assert.ok(Number.isFinite(d.fitBefore) && Number.isFinite(d.fitAfter));
    assert.ok("scoreAfter" in d && "youPointsAfter" in d && "oppPointsAfter" in d);
  }
  // The opening choice carries a promise; by the end of the game it is settled.
  assert.equal(report.promises.open, 0, "no promise may stay open past the final whistle");
  assert.equal(report.promises.kept + report.promises.broken, report.decisions.filter((d) => d.choiceId === "pack_paint").length > 0 ? 1 : 0);
  assert.ok("reputationDelta" in report.careerEffect);
  assert.equal(report.careerEffect.goalAchieved, report.won);
  assert.ok(report.tactical.familiarity.pack_paint > 0, "the run system gains familiarity");
  assert.ok(report.tactical.opponentReadiness.pack_paint > 0, "the opponent was exposed to it");
  assert.ok(Number.isFinite(report.tactical.buyIn));
});

test("moments fire on real game state across seeds, and every fired choice applies", () => {
  const kinds = new Set();
  let lateClutchSettled = false;
  for (let seed = 1; seed <= 12; seed += 1) {
    const c = challenge(seed);
    c.start();
    c.choose("zone_drop");
    let guard = 0;
    while (c.state !== "ended" && guard < 40) {
      const res = c.playChunk(8);
      if (res.status === "moment") {
        kinds.add(res.moment.kind);
        const m = res.moment;
        const choice = m.choices.find((x) => !x.disabled) || m.choices[0];
        const r = c.choose(choice.id);
        assert.ok(r.ok, `seed ${seed} ${m.kind} choose ${choice.id}: ${r.reason || ""}`);
        if (choice.id === "clutch_call") {
          assert.equal(r.clutchPending, true);
          // Step until the armed clutch settles or the game ends.
          let g2 = 0;
          while (c.state === "clutch_pending" && g2 < 20) {
            const r2 = c.playChunk(8);
            if (r2.status === "ended") break;
            if (r2.status === "moment") {
              const cc = r2.moment.choices.find((x) => !x.disabled);
              c.choose(cc.id);
            }
            g2 += 1;
          }
          if (c._sim().clutchLog.length) {
            lateClutchSettled = true;
            const o = c._sim().clutchLog[0];
            assert.ok("attempted" in o && "made" in o && "shooterId" in o);
          }
        }
      } else if (res.status === "ended") {
        break;
      }
      guard += 1;
    }
    assert.equal(c.state, "ended", `seed ${seed} must end`);
  }
  assert.ok(kinds.has("opponent_run"), `a run moment must fire on some seed, saw ${[...kinds].join(",")}`);
  assert.ok(kinds.has("late"), `a late moment must fire on some seed, saw ${[...kinds].join(",")}`);
  assert.ok(lateClutchSettled, "the clutch call must settle through the engine on some seed");
});

test("recommendation seam (workstream G): a valid recommendation is attached, a bad one is ignored, a throwing hook never breaks the moment", () => {
  const withRec = challenge(1, {
    recommend: () => ({ choiceId: "zone_drop", reason: "they hunt the paint", source: "video-analyst" }),
  });
  withRec.start();
  assert.deepEqual(withRec.moment.recommendation, { choiceId: "zone_drop", reason: "they hunt the paint", source: "video-analyst" });

  const badRec = challenge(1, { recommend: () => ({ choiceId: "nope", reason: "x" }) });
  badRec.start();
  assert.equal(badRec.moment.recommendation, undefined);

  const throwing = challenge(1, { recommend: () => { throw new Error("analyst down"); } });
  const res = throwing.start();
  assert.equal(res.ok, true);
  assert.equal(res.moment.kind, "opening");
});

test("choose() refuses bad states: unknown choice, disabled choice, double choose", () => {
  const c = challenge(1);
  assert.deepEqual(c.choose("switch_all"), { ok: false, reason: "wrong_state", state: "idle" });
  c.start();
  assert.deepEqual(c.choose("nope"), { ok: false, reason: "invalid" });
  assert.equal(c.choose("switch_all").ok, true);
  assert.deepEqual(c.choose("zone_drop"), { ok: false, reason: "wrong_state", state: "playing" });
});
