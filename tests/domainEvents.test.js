import test from "node:test";
import assert from "node:assert/strict";
import { createDomainEventAdapter } from "../js/engine/domainEvents.js";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";

function snap(overrides = {}) {
  const court = (prefix) => [1, 2, 3, 4, 5].map((i) => ({ id: `${prefix}${i}` }));
  return {
    quarter: 1,
    clock: 720,
    possession: "home",
    score: { home: 0, away: 0 },
    home: { onCourt: court("h") },
    away: { onCourt: court("a") },
    ...overrides,
  };
}

function collect() {
  const seen = [];
  const adapter = createDomainEventAdapter({ onDomainEvent: (evt) => seen.push(evt) });
  return { seen, adapter };
}

test("domain events: tip-off emits POSSESSION_START, identical ticks emit nothing", () => {
  const { seen, adapter } = collect();
  adapter.observeTick(snap());
  assert.deepEqual(seen.map((e) => e.type), ["POSSESSION_START"]);
  assert.equal(seen[0].meta.possession, "home");
  adapter.observeTick(snap());
  assert.equal(seen.length, 1, "same snapshot twice derives nothing");
});

test("domain events: possession flip derives POSSESSION_START with the new side", () => {
  const { seen, adapter } = collect();
  adapter.observeTick(snap());
  seen.length = 0;
  adapter.observeTick(snap({ possession: "away", clock: 700 }));
  assert.deepEqual(seen.map((e) => e.type), ["POSSESSION_START"]);
  assert.equal(seen[0].meta.possession, "away");
  assert.equal(seen[0].meta.quarter, 1);
});

test("domain events: quarter change derives PERIOD_END then PERIOD_START", () => {
  const { seen, adapter } = collect();
  adapter.observeTick(snap());
  seen.length = 0;
  adapter.observeTick(snap({ quarter: 2, clock: 720, possession: "away" }));
  assert.deepEqual(seen.map((e) => e.type), ["PERIOD_END", "PERIOD_START", "POSSESSION_START"]);
  assert.equal(seen[0].meta.quarter, 1, "the period that ended");
  assert.equal(seen[0].meta.nextQuarter, 2);
  assert.equal(seen[1].meta.quarter, 2);
});

test("domain events: onCourt set diff derives SUBSTITUTION with structured meta", () => {
  const { seen, adapter } = collect();
  adapter.observeTick(snap());
  seen.length = 0;
  const next = snap();
  next.home.onCourt = [{ id: "h1" }, { id: "h2" }, { id: "h3" }, { id: "h4" }, { id: "h6" }];
  adapter.observeTick(next);
  assert.deepEqual(seen.map((e) => e.type), ["SUBSTITUTION"]);
  assert.deepEqual(seen[0].meta.sub, { inId: "h6", outId: "h5", side: "home" });
});

test("domain events: a two-player rotation yields two SUBSTITUTION events", () => {
  const { seen, adapter } = collect();
  adapter.observeTick(snap());
  seen.length = 0;
  const next = snap();
  next.away.onCourt = [{ id: "a1" }, { id: "a2" }, { id: "a3" }, { id: "a6" }, { id: "a7" }];
  adapter.observeTick(next);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen.map((e) => e.meta.sub.side), ["away", "away"]);
  assert.deepEqual(new Set(seen.map((e) => e.meta.sub.inId)), new Set(["a6", "a7"]));
});

test("domain events: observeEnd emits MATCH_END once with the final score", () => {
  const { seen, adapter } = collect();
  adapter.observeTick(snap());
  seen.length = 0;
  const end = adapter.observeEnd(snap({ score: { home: 101, away: 98 } }));
  assert.equal(end.type, "MATCH_END");
  assert.deepEqual(end.meta.score, { home: 101, away: 98 });
  assert.equal(adapter.observeEnd(snap()), null, "second end is a no-op");
  assert.equal(seen.length, 1);
});

test("domain events: reset makes the next tick a tip-off again", () => {
  const { seen, adapter } = collect();
  adapter.observeTick(snap());
  adapter.reset();
  seen.length = 0;
  adapter.observeTick(snap({ quarter: 4, clock: 12 }));
  assert.deepEqual(seen.map((e) => e.type), ["POSSESSION_START"]);
});

/**
 * M3 meta systematization, end to end on the real engine: every event type
 * that carries a structured fact carries it in the M2b shape (noun-keyed
 * meta object, *Id fields). A seeded full game must produce fouls,
 * turnovers, rebounds and free throws, and the adapter must derive
 * POSSESSION_START / PERIOD_END from the same run.
 */
test("domain events: real seeded game — meta shapes hold on every typed event", () => {
  const events = [];
  const derived = [];
  const adapter = createDomainEventAdapter({ onDomainEvent: (evt) => derived.push(evt) });
  const sim = new GameSim({
    home: realTeam("GSW", 2016),
    away: realTeam("CLE", 2016),
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(7),
    onEvent: (e) => events.push(e),
    onTick: (s) => adapter.observeTick(s),
    onEnd: (s) => adapter.observeEnd(s),
  });
  let steps = 0;
  sim.running = true; // drive synchronously (start() would use the async _loop)
  while (sim.running && steps < 2000) {
    sim.step();
    steps += 1;
    // Quarter breaks pause the game for the UI; resume like the user tapping 继续比赛.
    if (sim.paused) sim.setPaused(false);
  }
  assert.equal(sim.running, false, "the seeded game finished");
  assert.ok(events.length > 50, `expected a full game of events, got ${events.length}`);
  const fouls = events.filter((e) => e.meta?.foul);
  const turnovers = events.filter((e) => e.meta?.turnover);
  const rebs = events.filter((e) => e.meta?.reb);
  const fts = events.filter((e) => e.meta?.ft);
  assert.ok(fouls.length > 0, "fouls carry meta.foul");
  assert.ok(turnovers.length > 0, "turnovers carry meta.turnover");
  assert.ok(rebs.length > 0, "rebounds carry meta.reb");
  assert.ok(fts.length > 0, "free throws carry meta.ft");
  for (const e of fouls) {
    assert.equal(typeof e.meta.foul.foulerId, "string");
    assert.equal(typeof e.meta.foul.victimId, "string");
    assert.ok(["charge", "defensive", "shooting", "and_one"].includes(e.meta.foul.kind));
  }
  for (const e of turnovers) {
    assert.equal(typeof e.meta.turnover.actorId, "string");
    assert.ok(["steal", "charge", "foul", "forced", "unforced"].includes(e.meta.turnover.kind));
  }
  for (const e of rebs) {
    assert.equal(typeof e.meta.reb.rebounderId, "string");
    assert.equal(typeof e.meta.reb.offensive, "boolean");
  }
  for (const e of fts) {
    assert.equal(typeof e.meta.ft.shooterId, "string");
    assert.equal(typeof e.meta.ft.made, "boolean");
    assert.equal(e.meta.ft.pts, 1);
  }
  // Shots still carry the original meta.shot shape (M2b convention unchanged).
  const shots = events.filter((e) => e.meta?.shot);
  assert.ok(shots.length > 0);
  for (const e of shots) {
    assert.equal(typeof e.meta.shot.shooterId, "string");
    assert.equal(typeof e.meta.shot.made, "boolean");
  }
  const starts = derived.filter((e) => e.type === "POSSESSION_START");
  const periodEnds = derived.filter((e) => e.type === "PERIOD_END");
  assert.ok(starts.length > 20, `expected many possession starts, got ${starts.length}`);
  assert.ok(periodEnds.length >= 3, `expected period ends, got ${periodEnds.length}`);
  assert.ok(derived.some((e) => e.type === "MATCH_END"), "match end derived");
});
