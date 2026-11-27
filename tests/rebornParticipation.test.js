/** Player Agency PA2: participation modes decide HOW OFTEN you are asked, never what the sim does. */
import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import * as P from "../js/reborn/participation.js";
import { combineGrades, teamCoach, MAX_TRUST_PER_GAME, MULTI_DECISION_CAP } from "../js/reborn/agency.js";
import { driveGame } from "../js/reborn/season.js";
import { participationBarHtml, describeAgencyFeedback } from "../js/ui/reborn/agencyView.js";

const mkSim = (seed = 3) => new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed), onEvent() {}, onTick() {}, onEnd() {} });
const base = { onCourt: true, importance: 0.2, isCritical: false, hasMeaningfulConflict: false, opportunity: 0 };

test("modes gate the question: auto never, key on moments/conflicts/clear chances, high also on importance and moderate chances, full always", () => {
  const ask = (mode, o = {}) => P.shouldOfferDecision({ mode, ...base, ...o });
  assert.equal(ask("auto", { isCritical: true, hasMeaningfulConflict: true }), false);
  assert.equal(ask("key"), false);
  assert.equal(ask("key", { isCritical: true }), true);
  assert.equal(ask("key", { hasMeaningfulConflict: true }), true);
  assert.equal(ask("key", { opportunity: P.CLEAR_OPPORTUNITY }), true);
  assert.equal(ask("key", { importance: 0.9 }), false);
  assert.equal(ask("high", { importance: 0.55 }), true);
  assert.equal(ask("high", { opportunity: P.MODERATE_OPPORTUNITY }), true);
  assert.equal(ask("high"), false);
  assert.equal(ask("full"), true);
  // Never on the bench, never in fast play, never without a legal action, whatever the mode.
  for (const mode of Object.values(P.PARTICIPATION_MODES)) {
    assert.equal(ask(mode, { onCourt: false, isCritical: true }), false);
    assert.equal(ask(mode, { isCritical: true, fastSimulation: true }), false);
    assert.equal(ask(mode, { isCritical: true, hasLegalActions: false }), false);
  }
  assert.equal(P.sanitizeMode("nonsense"), P.DEFAULT_PARTICIPATION);
});

test("importance is high only for a close, late game", () => {
  const sim = mkSim();
  Object.assign(sim, { quarter: 4, clock: 60 }); sim.score.home = 90; sim.score.away = 91;
  const close = P.importanceOf(sim);
  sim.score.home = 120;
  const blowout = P.importanceOf(sim);
  Object.assign(sim, { quarter: 1, clock: 600 }); sim.score.home = 10; sim.score.away = 10;
  assert.ok(close >= 0.9 && blowout === 0 && P.importanceOf(sim) <= 0.3);
});

test("the gate paces non-clutch asks (gap + cap) and follows a mode changed mid-game", () => {
  let mode = "high";
  const gate = P.createDecisionGate({ getMode: () => mode });
  const hits = []; for (let i = 0; i < 12; i++) hits.push(gate.ask({ importance: 1 }));
  assert.deepEqual(hits.slice(0, 5), [true, false, false, false, true]); // gap 3
  mode = "auto";
  assert.equal(gate.ask({ importance: 1, critical: true }), false);
  mode = "full";
  assert.equal(gate.ask({}), true);
  assert.equal(gate.ask({}), true);
  const capped = P.createDecisionGate({ getMode: () => "key" });
  let n = 0; for (let i = 0; i < 200; i++) if (capped.ask({ critical: true })) n++;
  assert.equal(n, 7); // literal: key.max — the old read of MODE_PACING.key.max stayed green when max moved
});

test("MODE_PACING's four tiers are pinned by literal value, so a silent retune turns red", () => {
  // B154 note (c): key.max=7 was only covered by a test that read the constant back,
  // so max 7→3 passed the suite. Pin gap/max/target for every tier as literals.
  assert.deepEqual(P.MODE_PACING, {
    auto: { gap: Infinity, max: 0, target: "0" },
    key: { gap: 6, max: 7, target: "3–8" },
    high: { gap: 3, max: 25, target: "12–25" },
    full: { gap: 0, max: 90, target: "∞" },
  });
});

async function asksPerGame(mode, { onTakeover, seeds = [1, 2, 3, 4] } = {}) {
  const counts = [];
  for (const seed of seeds) {
    const sim = mkSim(seed);
    const me = [...sim.home.roster].sort((a, b) => b.scoring - a.scoring)[2];
    let asked = 0;
    await driveGame(sim, me.id, { onTakeover: (a) => { asked += 1; return onTakeover ? onTakeover(a, sim) : { choiceId: "pass" }; }, agency: { coach: teamCoach("CHI", 1996), iq: 60, decisionId: `p|${seed}`, autonomy: 10 }, participation: { getMode: () => mode } });
    counts.push(asked);
  }
  return counts;
}

test("on real games the modes are ordered auto < key < high < full, and auto asks nothing, not even the clutch", async () => {
  const mean = async (m) => { const c = await asksPerGame(m); return c.reduce((s, v) => s + v, 0) / c.length; };
  const [auto, key, high, full] = [await mean("auto"), await mean("key"), await mean("high"), await mean("full")];
  assert.equal(auto, 0);
  assert.ok(auto < key && key < high && high < full, JSON.stringify({ auto, key, high, full }));
  assert.ok(key <= 7 && high <= 25); // literal caps: key.max 7, high.max 25
});

test("a game without participation is the classic one clutch ask (old callers and saves)", async () => {
  const sim = mkSim(2);
  Object.assign(sim, { quarter: 4, clock: 70, possession: "home" }); sim.score.home = 90; sim.score.away = 91;
  const me = sim.home.onCourt[1].id;
  let asked = 0;
  const out = await driveGame(sim, me, { onTakeover: () => { asked += 1; return { choiceId: "pass" }; }, agency: { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "c", autonomy: 10 } });
  assert.equal(asked, 1);
  assert.deepEqual(out.extras, []);
});

test("every extra decision is armed through the normal sim API: a shot decision is honoured or settled, never left armed", async () => {
  const sim = mkSim(5);
  const me = [...sim.home.roster].sort((a, b) => b.scoring - a.scoring)[1];
  const out = await driveGame(sim, me.id, {
    onTakeover: ({ sim: s, playerId }) => ({ shooterId: playerId, actionHint: "three", attemptId: s.issueAttemptId(), choiceId: "pullup" }),
    agency: { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "arm", autonomy: 10 },
    participation: { getMode: () => "high" },
  });
  assert.ok(out.extras.length > 1);
  assert.equal(sim.clutchDecision, null);
  const accepted = out.extras.filter((t) => t.accepted);
  assert.ok(accepted.every((t) => sim.clutchLog.some((o) => o.attemptId === t.attemptId)));
});

test("many decisions in one game settle together under a cap, so volume alone cannot farm trust", () => {
  const g = (t, a) => ({ trustDelta: t, autonomyDelta: a, verdict: "x", decisionId: "d" });
  assert.equal(combineGrades([]), null);
  assert.equal(combineGrades([g(2, 1)]).trustDelta, 2);
  const many = combineGrades(Array.from({ length: 20 }, () => g(2, 3)));
  assert.equal(many.decisions, 20);
  assert.equal(many.trustDelta, MAX_TRUST_PER_GAME * MULTI_DECISION_CAP);
  assert.equal(combineGrades(Array.from({ length: 20 }, () => g(-2, -3))).trustDelta, -MAX_TRUST_PER_GAME * MULTI_DECISION_CAP);
});

test("the mode switch renders all four modes, marks the current one, and the feedback line counts decisions", () => {
  const html = participationBarHtml("high", "en");
  for (const id of Object.values(P.PARTICIPATION_MODES)) assert.ok(html.includes(`data-mode="${id}"`));
  assert.match(html, /data-mode="high" aria-pressed="true"/);
  assert.match(html, /data-mode="key" aria-pressed="false"/);
  assert.match(describeAgencyFeedback({ verdict: "free_neutral", decisions: 9, trustDelta: 1, autonomyBefore: 10, autonomyAfter: 12 }, "en"), /9 decisions/);
});

test("the preference round-trips, and a broken store falls back to the default", () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(P.readParticipation(store), "key");
  P.writeParticipation("full", store);
  assert.equal(P.readParticipation(store), "full");
  mem.set(P.PARTICIPATION_STORAGE_KEY, "garbage");
  assert.equal(P.readParticipation(store), "key");
  assert.equal(P.readParticipation({ getItem() { throw new Error("denied"); } }), "key");
});

test("in a forced clutch moment: auto never asks, key/high/full do", async () => {
  const asks = async (mode) => {
    const sim = mkSim(2);
    Object.assign(sim, { quarter: 4, clock: 70, possession: "home" }); sim.score.home = 90; sim.score.away = 91;
    let n = 0;
    await driveGame(sim, sim.home.onCourt[1].id, { onTakeover: () => { n += 1; return { choiceId: "pass" }; }, agency: { coach: teamCoach("CHI", 1996), iq: 60, decisionId: `f|${mode}`, autonomy: 10 }, participation: { getMode: () => mode } });
    return n;
  };
  assert.equal(await asks("auto"), 0);
  for (const m of ["key", "high", "full"]) assert.ok((await asks(m)) >= 1, m);
});
