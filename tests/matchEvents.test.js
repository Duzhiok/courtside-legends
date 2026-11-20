import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { createDomainEventAdapter } from "../js/engine/domainEvents.js";
import {
  MATCH_EVENT_TUNING,
  applyMatchEffect,
  buildMatchEvent,
  createMatchEventState,
  decideMatchEvent,
  exportMatchEventState,
  foulLimitFor,
  foulTroubleCandidates,
  matchEventHistoryRows,
  restoreMatchEventState,
  settleMatchEventOutcomes,
  stepMatchEvents,
  takeoverCandidates,
  weaknessCandidates,
} from "../js/engine/matchEvents.js";
import { createMatchEventsSession } from "../js/ui/matchEventsController.js";
import { validateMatchEvent } from "../js/ui/matchEventCards.js";
import { realTeam } from "./helpers/realGame.js";

// ---------------------------------------------------------------- fixtures

const player = (id, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  pos: "SF",
  overall: 70,
  defense: 60,
  hot: 0,
  fatigue: 10,
  injuredGames: 0,
  stats: { pts: 0, fgm: 0, fga: 0, pf: 0 },
  ...extra,
});

function snap({ quarter = 2, clock = 400, you = {}, opp = {}, ...rest } = {}) {
  const yourCourt = you.onCourt || ["a", "b", "c", "d", "e"].map((id, i) => player(id, { overall: 90 - i * 4 }));
  const yourBench = you.bench || [player("f", { overall: 65 }), player("g", { overall: 60, pos: "C" })];
  const oppCourt = opp.onCourt || ["v", "w", "x", "y", "z"].map((id, i) => player(id, { defense: 50 + i * 8 }));
  return {
    quarter,
    clock,
    youSide: "home",
    score: { home: 50, away: 48 },
    possession: "home",
    offenseFocusId: null,
    focusPlay: null,
    home: { name: "Bulls", onCourt: yourCourt, bench: yourBench, roster: [...yourCourt, ...yourBench] },
    away: { name: "Sonics", onCourt: oppCourt, bench: [], roster: oppCourt },
    ...rest,
  };
}

const hotStar = () => snap({ you: { onCourt: [player("a", { overall: 95, hot: 2 }), ...["b", "c", "d", "e"].map((id, i) => player(id, { overall: 80 - i }))] } });
const boundary = (s) => ({ type: "POSSESSION_START", snapshot: s });
const ALWAYS = { ...MATCH_EVENT_TUNING, warmupBoundaries: 0, minGapBoundaries: 0, chance: { takeover: 1, weakness: 1, foulTrouble: 1 } };

// ---------------------------------------------------------------- eligibility

test("takeover: only a hot top-2 star on your floor, and not when he already has the ball", () => {
  assert.deepEqual(takeoverCandidates(hotStar()).map((c) => c.id), ["takeover:a:h1"]);
  assert.deepEqual(takeoverCandidates(snap()), [], "nobody hot");
  assert.deepEqual(takeoverCandidates({ ...hotStar(), offenseFocusId: "a" }), [], "already the initiator");
  assert.deepEqual(takeoverCandidates({ ...hotStar(), focusPlay: { id: "iso_star" } }), [], "star ISO already running");
  const benchHot = snap({ you: { onCourt: ["b", "c", "d", "e", "h"].map((id) => player(id, { overall: 70, hot: 3 })), bench: [player("a", { overall: 99, hot: 3 }), player("a2", { overall: 98 })] } });
  assert.deepEqual(takeoverCandidates(benchHot), [], "the hot players on the floor are not top-2 stars");
  assert.equal(takeoverCandidates({ ...hotStar(), quarter: 3 })[0].id, "takeover:a:h2", "one per half");
});

test("weakness: one of their two weakest defenders on the floor, tiring or on 3 fouls", () => {
  const tired = snap({ opp: { onCourt: [player("v", { defense: 40, fatigue: 58 }), ...["w", "x", "y", "z"].map((id) => player(id, { defense: 80 }))] } });
  const [c] = weaknessCandidates(tired);
  assert.equal(c.id, "weakness:v:q2");
  assert.equal(c.reason, "fatigue");
  const fouled = snap({ opp: { onCourt: [player("v", { defense: 40, stats: { pf: 3 } }), ...["w", "x", "y", "z"].map((id) => player(id, { defense: 80 }))] } });
  assert.equal(weaknessCandidates(fouled)[0].reason, "fouls");
  const strongTired = snap({ opp: { onCourt: [player("v", { defense: 99, fatigue: 90 }), ...["w", "x", "y", "z"].map((id) => player(id, { defense: 40 }))] } });
  assert.deepEqual(weaknessCandidates(strongTired), [], "a tired elite defender is not a weak spot");
  assert.deepEqual(weaknessCandidates({ ...tired, focusPlay: { id: "hunt_mismatch" } }), [], "already hunting it");
});

test("foul trouble: key players by quarter line (Q1 2, Q2 3, Q3 4, Q4/OT 5), one event per foul count", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((q) => foulLimitFor(q)), [2, 3, 4, 5, 5]);
  const s = (quarter, pf) => snap({ quarter, you: { onCourt: [player("a", { overall: 95, stats: { pf } }), ...["b", "c", "d", "e"].map((id) => player(id, { overall: 80 }))] } });
  assert.deepEqual(foulTroubleCandidates(s(1, 2)).map((c) => c.id), ["foulTrouble:a:pf2"]);
  assert.deepEqual(foulTroubleCandidates(s(2, 2)), [], "2 fouls is fine in Q2");
  assert.deepEqual(foulTroubleCandidates(s(4, 5)).map((c) => c.id), ["foulTrouble:a:pf5"]);
});

// ---------------------------------------------------------------- event objects (Lychee's contract)

test("every family builds a valid UI event with a real no-op default; the disabled choice says why", () => {
  const tired = snap({ opp: { onCourt: [player("v", { defense: 40, fatigue: 60, pos: "SG" }), ...["w", "x", "y", "z"].map((id) => player(id, { defense: 80 }))] } });
  const fouls = snap({ quarter: 1, you: { onCourt: [player("a", { overall: 95, pos: "C", stats: { pf: 2 } }), ...["b", "c", "d", "e"].map((id) => player(id, { overall: 80 }))] } });
  const events = [
    buildMatchEvent(takeoverCandidates(hotStar())[0], hotStar()),
    buildMatchEvent(weaknessCandidates(tired)[0], tired),
    buildMatchEvent(foulTroubleCandidates(fouls)[0], fouls),
  ];
  for (const e of events) {
    assert.deepEqual(validateMatchEvent(e), { ok: true }, e.id);
    assert.equal(e.severity, "decision");
    assert.deepEqual(e.effects[e.defaultChoiceId], [], `${e.family}: the default changes nothing`);
    assert.ok(e.title.zh && e.title.en && e.body.zh && e.body.en);
  }
  const post = events[1].choices.find((c) => c.id === "post");
  assert.equal(post.disabled, true, "a guard is not a post target");
  assert.ok(post.disabledReason.en);
  const sit = events[2].choices.find((c) => c.id === "sit");
  assert.deepEqual(events[2].effects.sit, [{ kind: "substitute", outId: "a", inId: "g" }], "same position group first (C for C)");
  assert.match(sit.label.en, /G/);
});

test("no healthy bench: 'sit' is disabled and picking it falls back to the default", () => {
  const s = snap({ quarter: 1, you: { onCourt: [player("a", { overall: 95, stats: { pf: 2 } }), ...["b", "c", "d", "e"].map((id) => player(id, { overall: 80 }))], bench: [player("f", { injuredGames: 2 })] } });
  let state = createMatchEventState({ seed: "x" });
  ({ state } = stepMatchEvents(state, boundary(s), ALWAYS));
  assert.equal(state.pending.choices.find((c) => c.id === "sit").disabled, true);
  const r = decideMatchEvent(state, "sit", { snapshot: s });
  assert.equal(r.entry.choiceId, "keep");
  assert.deepEqual(r.effects, []);
});

// ---------------------------------------------------------------- selection, dedup, caps

test("selection is seeded: same seed + same boundaries -> same events; it never touches Math.random", () => {
  const run = (seed) => {
    let state = createMatchEventState({ seed });
    const ids = [];
    for (let i = 0; i < 40; i++) {
      const r = stepMatchEvents(state, boundary(hotStar()));
      state = r.state;
      if (r.event) {
        ids.push(`${state.boundaries}:${r.event.id}`);
        state = decideMatchEvent(state, "ignore").state;
      }
    }
    return ids;
  };
  const real = Math.random;
  Math.random = () => {
    throw new Error("match events must not use Math.random");
  };
  try {
    assert.deepEqual(run("seed-1"), run("seed-1"));
    const seeds = ["a", "b", "c", "d", "e", "f"].map(run).map((ids) => ids.join());
    assert.ok(new Set(seeds).size > 1, "different seeds pick different moments");
  } finally {
    Math.random = real;
  }
});

test("an id fires once per game; warmup, gap and per-game cap hold", () => {
  let state = createMatchEventState({ seed: "s" });
  const fired = [];
  for (let i = 0; i < 300; i++) {
    const r = stepMatchEvents(state, boundary(hotStar()), { ...ALWAYS, warmupBoundaries: 5, minGapBoundaries: 7 });
    state = r.state;
    if (r.event) {
      fired.push({ id: r.event.id, at: state.boundaries });
      state = decideMatchEvent(state, "ignore").state;
    }
  }
  assert.deepEqual(fired.map((f) => f.id), ["takeover:a:h1"], "the same occasion never repeats");
  assert.equal(fired[0].at, 5);
  let capped = createMatchEventState({ seed: "s" });
  let count = 0;
  for (let i = 0; i < 400; i++) {
    const s = snap({ quarter: 4, you: { onCourt: [player(`p${i}`, { overall: 99, stats: { pf: 5 } }), ...["b", "c", "d", "e"].map((id) => player(id, { overall: 50 }))] } });
    const r = stepMatchEvents(capped, boundary(s), ALWAYS);
    capped = r.state;
    if (r.event) {
      count += 1;
      capped = decideMatchEvent(capped, null).state;
    }
  }
  assert.equal(count, MATCH_EVENT_TUNING.maxPerGame);
});

test("a pending decision blocks new events until it is resolved", () => {
  let state = createMatchEventState({ seed: "s" });
  ({ state } = stepMatchEvents(state, boundary(hotStar()), ALWAYS));
  assert.ok(state.pending);
  const again = stepMatchEvents(state, boundary(snap({ quarter: 1, you: { onCourt: [player("a", { overall: 95, hot: 3, stats: { pf: 2 } }), ...["b", "c", "d", "e"].map((id) => player(id))] } })), ALWAYS);
  assert.equal(again.event, null);
  assert.equal(again.state.boundaries, state.boundaries + 1, "boundaries still count");
});

// ---------------------------------------------------------------- save / reload

test("reload: exported state round-trips; fired ids and the open decision survive; junk falls back", () => {
  let state = createMatchEventState({ seed: "keep-me" });
  ({ state } = stepMatchEvents(state, boundary(hotStar()), ALWAYS));
  const saved = JSON.parse(JSON.stringify(exportMatchEventState(state)));
  const back = restoreMatchEventState(saved, { seed: "other" });
  assert.equal(back.seed, "keep-me");
  assert.equal(back.pending.id, "takeover:a:h1");
  assert.deepEqual(back.fired, ["takeover:a:h1"]);
  const after = stepMatchEvents(back, boundary(hotStar()), ALWAYS);
  assert.equal(after.event, null, "not shown twice while it is still open");
  const done = decideMatchEvent(back, "ignore").state;
  assert.equal(stepMatchEvents(done, boundary(hotStar()), ALWAYS).event, null, "not re-fired after the reload either");

  assert.equal(restoreMatchEventState(null, { seed: "n" }).seed, "n", "no field in an older save");
  assert.equal(restoreMatchEventState({ v: 99 }).history.length, 0);
  const junk = restoreMatchEventState({ v: 1, seed: "j", boundaries: -3, fired: [1, "ok"], history: [{ id: 5 }, { id: "h", family: "nope" }], pending: { id: "p", family: "takeover", choices: [] } });
  assert.deepEqual([junk.boundaries, junk.fired, junk.history, junk.pending], [0, ["ok"], [], null]);
  const badEffect = restoreMatchEventState({ ...saved, pending: { ...saved.pending, effects: { feed: [{ kind: "giveFreeWin" }] } } });
  assert.deepEqual(badEffect.pending.effects.feed, [], "only known GameSim calls survive a reload");
});

// ---------------------------------------------------------------- real GameSim

function playSeeded({ seed, withEvents, decide = () => null, tuning = MATCH_EVENT_TUNING }) {
  const log = [];
  let session = null;
  const adapter = createDomainEventAdapter({ onDomainEvent: (evt) => session?.onDomainEvent(evt) });
  const sim = new GameSim({
    home: realTeam("CHI", 1996),
    away: realTeam("SEA", 1996),
    youSide: "home",
    injuries: false,
    speed: 1,
    rng: seededStream(seed),
    onEvent: (e) => log.push(e.text),
    onTick: (s) => adapter.observeTick(s),
    onEnd: (s) => adapter.observeEnd(s),
  });
  const ui = {
    shown: [],
    show(e) {
      this.shown.push(e);
      const pick = e.severity === "decision" ? decide(e) : null;
      if (pick) queue.push(pick);
    },
    clear() {},
  };
  const queue = [];
  if (withEvents) session = createMatchEventsSession({ sim, seed: `ev-${seed}`, ui, tuning, defer: () => {} });
  sim.running = true;
  let guard = 0;
  while (sim.running && guard++ < 8000) {
    if (queue.length) session.decide(queue.shift());
    if (sim.paused) sim.setPaused(false);
    sim.step();
  }
  return { sim, log, ui, session, final: JSON.stringify({ score: sim.score, home: sim.home.roster.map((p) => p.stats), away: sim.away.roster.map((p) => p.stats) }) };
}

test("normal matches are unaffected: a seeded game where every event takes its default is identical", () => {
  for (const seed of [3, 11]) {
    const plain = playSeeded({ seed, withEvents: false });
    const ignored = playSeeded({ seed, withEvents: true, tuning: ALWAYS });
    assert.ok(ignored.session.state.history.length >= 1, `seed ${seed}: events really fired`);
    assert.equal(ignored.final, plain.final, `seed ${seed}: box score identical`);
    assert.deepEqual(ignored.log, plain.log, `seed ${seed}: play-by-play identical`);
  }
});

test("taking a choice goes through the real GameSim API, is recorded, and its outcome is measured", () => {
  const run = playSeeded({
    seed: 5,
    withEvents: true,
    tuning: { ...ALWAYS, chance: { takeover: 1, weakness: 0, foulTrouble: 0 } },
    decide: (e) => (e.family === "takeover" ? "feed" : null),
  });
  const entry = run.session.state.history.find((h) => h.family === "takeover");
  assert.ok(entry, "a takeover fired");
  assert.equal(entry.choiceId, "feed");
  assert.equal(entry.applied, true);
  assert.ok(run.log.some((line) => /持球发起|Initiator/.test(line)), "the engine's own setOffenseFocus line is in the feed");
  assert.match(entry.outcome.en, /pts \(\d+\/\d+ FG\)/, "measured from the box score, not invented");
  const rows = matchEventHistoryRows(run.session.state, "en");
  assert.equal(typeof rows[0].choiceLabel, "string");
});

test("applyMatchEffect only calls existing GameSim methods and reports failure honestly", () => {
  const calls = [];
  const fake = {
    setOffenseFocus: (id) => calls.push(["focus", id]),
    setFocusPlay: (id) => calls.push(["play", id]),
    substitute: (o, i) => (calls.push(["sub", o, i]), false),
  };
  assert.equal(applyMatchEffect(fake, [{ kind: "setOffenseFocus", playerId: "a" }, { kind: "setFocusPlay", focusId: "hunt_mismatch" }]), true);
  assert.equal(applyMatchEffect(fake, [{ kind: "substitute", outId: "a", inId: "b" }]), false, "a refused sub is not reported as applied");
  assert.equal(applyMatchEffect(fake, [{ kind: "teleport" }]), false);
  assert.deepEqual(calls, [["focus", "a"], ["play", "hunt_mismatch"], ["sub", "a", "b"]]);
});

test("session: pauses only to ask; top speed and quick sim auto-resolve with the default; resume without a pick takes the default", () => {
  const sim = {
    speed: 1,
    running: true,
    paused: false,
    pauses: [],
    snapshot: () => hotStar(),
    setPaused(v, why) {
      this.paused = !!v;
      this.pauses.push([!!v, why ?? null]);
    },
    setOffenseFocus: () => true,
  };
  const shown = [];
  const ui = { show: (e) => shown.push(e), clear() {} };
  const deferred = [];
  const s = createMatchEventsSession({ sim, seed: "q", ui, tuning: ALWAYS, defer: (fn) => deferred.push(fn) });
  s.onDomainEvent(boundary(hotStar()));
  assert.equal(shown.at(-1).severity, "decision");
  deferred.splice(0).forEach((fn) => fn());
  assert.deepEqual(sim.pauses, [[true, "event"]], "paused after the tick, to ask");
  s.decide("feed");
  assert.deepEqual(sim.pauses.at(-1), [false, null], "resumed after the pick");

  const fast = { ...sim, speed: 3, pauses: [], setPaused: sim.setPaused };
  const shownFast = [];
  const s3 = createMatchEventsSession({ sim: fast, seed: "q", ui: { show: (e) => shownFast.push(e), clear() {} }, tuning: ALWAYS, defer: (fn) => fn() });
  s3.onDomainEvent(boundary(hotStar()));
  assert.equal(shownFast[0].severity, "info", "top speed: a toast, no question");
  assert.deepEqual(fast.pauses, [], "and no pause");
  assert.equal(s3.state.history[0].auto, true);

  const s4 = createMatchEventsSession({ sim: { ...sim, pauses: [] }, seed: "q", ui, tuning: ALWAYS, defer: () => {} });
  s4.onDomainEvent(boundary(hotStar()));
  assert.equal(s4.autoResolvePending().choiceId, "ignore", "quick sim");

  const s5 = createMatchEventsSession({ sim: { ...sim, pauses: [] }, seed: "q", ui, tuning: ALWAYS, defer: () => {} });
  s5.onDomainEvent(boundary(hotStar()));
  s5.onDomainEvent(boundary(snap()));
  assert.deepEqual([s5.state.history[0].choiceId, s5.state.history[0].auto], ["ignore", true], "play went on: default");
});

test("outcomes settle at period end even inside the window", () => {
  let state = createMatchEventState({ seed: "o" });
  ({ state } = stepMatchEvents(state, boundary(hotStar()), ALWAYS));
  state = decideMatchEvent(state, "feed", { snapshot: hotStar() }).state;
  assert.equal(settleMatchEventOutcomes(state, hotStar()).history[0].outcome, null, "window not over");
  const later = hotStar();
  later.home.roster[0].stats = { pts: 7, fgm: 3, fga: 5, pf: 0 };
  later.score = { home: 60, away: 52 };
  const settled = settleMatchEventOutcomes(state, later, { final: true });
  assert.equal(settled.history[0].outcome.en, "A: 7 pts (3/5 FG) · 10–4 run since");
});

test("reload mid-game with a decision open: the restored session reshows it, keeps firing, never repeats an id", () => {
  const tuning = { ...MATCH_EVENT_TUNING, warmupBoundaries: 2, minGapBoundaries: 6, takeoverHot: -3, chance: { takeover: 1, weakness: 0, foulTrouble: 0 } };
  const wire = (sim, saved) => {
    const queue = [];
    let session = null;
    const adapter = createDomainEventAdapter({ onDomainEvent: (evt) => session?.onDomainEvent(evt) });
    sim.onTick = (s) => adapter.observeTick(s);
    sim.onEnd = (s) => adapter.observeEnd(s);
    const ui = { show: (e) => e.severity === "decision" && queue.push("ignore"), clear() {} };
    session = createMatchEventsSession({ sim, seed: "reload", saved, ui, tuning, defer: () => {} });
    return { session, queue };
  };
  const play = (sim, w, until) => {
    sim.running = true;
    for (let guard = 0; sim.running && !until() && guard < 8000; guard += 1) {
      if (w.queue.length) w.session.decide(w.queue.shift());
      if (sim.paused) sim.setPaused(false);
      sim.step();
    }
  };
  const sim = new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 1, rng: seededStream(7) });
  const first = wire(sim, null);
  play(sim, first, () => first.session.state.history.length >= 1 && first.session.state.pending); // leave with #2 open
  const openId = first.session.state.pending.id;

  const restored = GameSim.fromSave(JSON.parse(JSON.stringify(sim.exportState())), {});
  restored.rng = seededStream(11); // fromSave() restores without an rng (a real reload uses Math.random); seed it so this test is deterministic
  const second = wire(restored, JSON.parse(JSON.stringify(first.session.exportState())));
  second.session.reshowPending();
  assert.deepEqual(second.queue, ["ignore"], "the same open decision is asked again after the reload");
  play(restored, second, () => false);

  const ids = second.session.state.history.map((h) => h.id);
  assert.equal(ids[1], openId, "the open decision is the one that got settled");
  // After the reload the game is in the 2nd half or overtime ("h2" / "hot"): never the 1st-half ids it had already used.
  assert.ok(ids.length > 2 && ids.slice(2).every((id) => /:h(2|ot)$/.test(id)), `kept firing after the reload: ${ids}`);
  assert.equal(new Set(ids).size, ids.length, "no id fires twice across the reload");
});
