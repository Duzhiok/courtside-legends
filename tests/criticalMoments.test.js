import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import { createMatchEventsSession } from "../js/ui/matchEventsController.js";
import { MATCH_EVENT_TUNING } from "../js/engine/matchEvents.js";
import { CRITICAL_TUNING, criticalCandidates, inCrunchWindow } from "../js/engine/criticalMoments.js";

/** A real 1996 CHI (you, home) vs SEA game placed at the given late-game situation. */
function crunch(seed, { quarter = 4, clock = 12, home = 98, away = 100, possession = "home", speed = 1 } = {}) {
  const sim = new GameSim({
    home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3,
    rng: seededStream(hashSeed(seed)), // a string seed must be hashed: "abc" >>> 0 is 0 for every string onEvent() {}, onTick() {}, onEnd() {},
  });
  Object.assign(sim, { running: true, paused: false, quarter, clock, possession, speed });
  sim.score = { home, away };
  return sim;
}
const silentUi = () => ({ shown: [], show(e) { this.shown.push(e); }, clear() {} });
function session(sim, extra = {}) {
  const ui = silentUi();
  const s = createMatchEventsSession({ sim, ui, seed: "cm", defer: (fn) => fn(), ...extra });
  return { s, ui };
}
const boundary = (s, sim) => s.onDomainEvent({ type: "POSSESSION_START", snapshot: sim.snapshot() });
/** Pick, let the resumed game play the armed possession, then stop the loop (no stray timers between tests). */
function call(s, sim, choiceId) {
  const entry = s.decide(choiceId);
  sim.setPaused(true);
  return entry;
}

test("window: Q4/OT, <= 24 s, within 3 -- and nothing outside it", () => {
  const snap = (o) => crunch("w", o).snapshot();
  assert.equal(inCrunchWindow(snap({ clock: 24 })), true);
  assert.equal(inCrunchWindow(snap({ quarter: 5, clock: 10, home: 110, away: 110 })), true, "overtime counts");
  assert.equal(inCrunchWindow(snap({ clock: 25 })), false, "more than one shot clock left");
  assert.equal(inCrunchWindow(snap({ quarter: 3, clock: 10 })), false);
  assert.equal(inCrunchWindow(snap({ home: 96, away: 100 })), false, "down 4: no last-shot moment");
  assert.equal(inCrunchWindow(snap({ clock: 0 })), false);
  assert.equal(criticalCandidates(snap({}))[0].family, "clutchOffense");
  assert.equal(criticalCandidates(snap({ possession: "away" }))[0].family, "clutchDefense");
  const managed = crunch("w");
  managed.autoOffense = true;
  assert.deepEqual(criticalCandidates(managed.snapshot()), [], "managed offense: the AI handles the last shot");
});

test("offense: the card offers real actions only, each mapped to an existing GameSim call", () => {
  const sim = crunch("o", { home: 97, away: 100 });
  const { s, ui } = session(sim);
  boundary(s, sim);
  const ev = ui.shown[0];
  assert.equal(ev.family, "clutchOffense");
  assert.deepEqual(ev.choices.map((c) => c.id), ["three", "three2", "attack", "hunt", "ignore"]);
  assert.match(ev.choices[0].hint.zh, /唯一能直接追平/, "down 3: the analysis says why the three");
  assert.match(ev.choices[2].hint.zh, /两分追不平/);
  assert.equal(ev.defaultChoiceId, "ignore");
  assert.equal(sim.paused, true, "a live 1x game waits for the call");
  const kinds = Object.values(ev.effects).flat().map((e) => e.kind);
  assert.ok(kinds.every((k) => ["submitDecision", "setFocusPlay"].includes(k)));
  const lead = crunch("o2", { home: 101, away: 100 });
  const l = session(lead);
  boundary(l.s, lead);
  assert.ok(l.ui.shown[0].choices.some((c) => c.id === "slow"), "leading: run the clock is offered");
});

test("acceptance: a made game-winner and a missed one -- the sim decides, the score tells the truth", () => {
  let made = null;
  let missed = null;
  for (let i = 0; i < 60 && !(made && missed); i += 1) {
    const sim = crunch(`gw-${i}`, { home: 99, away: 100 });
    const { s, ui } = session(sim);
    boundary(s, sim);
    call(s, sim, "three"); // the pick resumes the game: the armed possession plays out right away
    const out = sim.clutchLog[0];
    assert.equal(out?.shooterId, ui.shown[0].effects.three[0].shooterId, "the possession was run for the picked shooter");
    if (!out?.attempted) continue;
    if (out.made && sim.score.home > sim.score.away) made = { out, score: { ...sim.score } };
    if (!out.made) missed = { out, score: { ...sim.score } };
  }
  assert.ok(made, "some seed hits the game-winner");
  assert.equal(made.score.home - 99, made.out.teamPoints, "points on the board = points the possession scored");
  assert.ok(missed, "some seed misses it -- no guaranteed makes");
});

test("acceptance: a game-tying possession (down 2, attack the rim)", () => {
  let tied = null;
  for (let i = 0; i < 60 && !tied; i += 1) {
    const sim = crunch(`tie-${i}`, { home: 98, away: 100 });
    const { s } = session(sim);
    boundary(s, sim);
    call(s, sim, "attack");
    assert.equal(sim.clutchLog[0]?.actionHint, "attack");
    if (sim.score.home === sim.score.away) tied = sim.clutchLog[0];
  }
  assert.ok(tied, "some seed scores the tying two");
});

test("acceptance: a final defensive decision lands on the real defense plan", () => {
  const sim = crunch("d", { possession: "away", home: 100, away: 99 });
  const { s, ui } = session(sim);
  boundary(s, sim);
  const ev = ui.shown[0];
  assert.equal(ev.family, "clutchDefense");
  const targetId = ev.effects.deny[0].targetId;
  assert.ok(sim.away.onCourt.some((p) => p.id === targetId), "the target is on their floor");
  call(s, sim, "deny");
  assert.equal(sim.defensePlan.scheme, "focus");
  assert.equal(sim.defensePlan.targetId, targetId);
  const up3 = crunch("d3", { possession: "away", home: 103, away: 100 });
  const u = session(up3);
  boundary(u.s, up3);
  assert.match(u.ui.shown[0].choices[0].hint.zh, /三分/, "up 3: guard the three");
});

test("acceptance: overtime asks too", () => {
  const sim = crunch("ot", { quarter: 5, clock: 9, home: 110, away: 110 });
  const { s, ui } = session(sim);
  boundary(s, sim);
  assert.equal(ui.shown[0]?.family, "clutchOffense");
  assert.match(ui.shown[0].clock, /^OT1/);
});

test("acceptance: automatic resolution -- top speed, managed career role, never blocks or changes the game", () => {
  const fast = crunch("auto", { speed: 3 });
  const f = session(fast);
  boundary(f.s, fast);
  assert.equal(fast.paused, false, "never pauses at top speed");
  assert.equal(fast.clutchDecision, null, "the default is 'let them play': nothing armed");
  assert.equal(f.s.state.history[0].auto, true);
  const gm = crunch("gm");
  const g = session(gm, { mayDecide: () => false });
  boundary(g.s, gm);
  assert.equal(gm.paused, false, "a GM watches: no coaching prompt");
  assert.equal(g.s.state.history[0].auto, true);
  const quick = crunch("quick");
  const q = session(quick);
  boundary(q.s, quick);
  q.s.autoResolvePending();
  assert.equal(quick.clutchDecision, null, "quick sim settles it with the default");
});

test("acceptance: save/reload -- an open call reshows once and applies once; a settled one never repeats", () => {
  const sim = crunch("save", { home: 99, away: 100 });
  const a = session(sim);
  boundary(a.s, sim);
  const saved = a.s.exportState();
  const b = session(sim, { saved });
  b.s.reshowPending();
  assert.equal(b.ui.shown.length, 1, "the open call comes back after reload");
  b.s.decide("three"); // after a reload the game is paused: the call arms the possession, play resumes later
  assert.equal(sim.clutchDecision?.shooterId, b.ui.shown[0].effects.three[0].shooterId);
  sim.setPaused(false);
  sim.setPaused(true);
  assert.equal(sim.clutchLog.length, 1, "applied once");
  const again = createMatchEventsSession({ sim, ui: silentUi(), saved: b.s.exportState(), seed: "cm", defer: (fn) => fn() });
  assert.equal(again.decide("three"), null, "nothing pending after reload: no second settlement");
  assert.equal(sim.clutchLog.length, 1);
  assert.equal(again.state.history.length, 1);
});

test("one voice at a time: routine events stay quiet in the crunch window, and the cap holds", () => {
  const sim = crunch("quiet");
  sim.autoOffense = true; // no critical question on this end ...
  const forced = { warmupBoundaries: 0, minGapBoundaries: 0, chance: { takeover: 1, weakness: 1, foulTrouble: 1 } };
  const { s, ui } = session(sim, { tuning: { ...MATCH_EVENT_TUNING, ...forced, chance: { ...MATCH_EVENT_TUNING.chance, ...forced.chance } } });
  for (const p of sim.home.onCourt) p.hot = 3;
  boundary(s, sim);
  assert.equal(ui.shown.length, 0, "... and no takeover nagging during the last shot either");
  const capped = crunch("cap");
  const c = session(capped);
  for (let i = 0; i < CRITICAL_TUNING.maxPerGame + 3; i += 1) {
    Object.assign(capped, { quarter: 4, clock: 12, possession: "home", paused: false, running: true });
    capped.score = { home: 98, away: 100 };
    boundary(c.s, capped);
    call(c.s, capped, "ignore");
  }
  assert.equal(c.s.state.history.length, CRITICAL_TUNING.maxPerGame);
});


test("resolveTuning keeps the critical-window override, and with no override the game is exactly as before", async () => {
  const { resolveTuning } = await import("../js/ui/matchEventsController.js");
  const { MATCH_EVENT_TUNING } = await import("../js/engine/matchEvents.js");
  const withOverride = resolveTuning({ critical: { clockMax: 700, margin: 99 }, chance: { takeover: 0 } });
  assert.deepEqual(withOverride.critical, { clockMax: 700, margin: 99 }, "tuning.critical survives resolveTuning");
  assert.equal(withOverride.chance.takeover, 0, "and the other families' overrides still merge");
  assert.equal(withOverride.chance.weakness, MATCH_EVENT_TUNING.chance.weakness);
  // nothing / junk -> the shipped numbers, with no `critical` key at all (the engine then uses CRITICAL_TUNING)
  for (const none of [undefined, null, "x", 3, []]) {
    const t = resolveTuning(none);
    assert.equal("critical" in t, false, `no override (${JSON.stringify(none)}) adds no critical key`);
    assert.deepEqual({ ...t, chance: { ...t.chance }, foulLimit: { ...t.foulLimit }, defaults: { ...t.defaults } }, { ...MATCH_EVENT_TUNING, chance: { ...MATCH_EVENT_TUNING.chance }, foulLimit: { ...MATCH_EVENT_TUNING.foulLimit }, defaults: { ...MATCH_EVENT_TUNING.defaults } });
  }
  // the engine side: without it the window is the production one (<= 24 s, <= 3 points); with it, wider
  const snap = (over) => ({ quarter: 4, clock: 11 * 60 + 30, score: { home: 40, away: 58 }, possession: "home", ...over });
  assert.equal(inCrunchWindow(snap({})), false, "Q4 11:30 down 18 is not a crunch under the shipped window");
  assert.equal(inCrunchWindow(snap({}), { ...CRITICAL_TUNING, ...withOverride.critical }), true, "the override widens it");
});

test("last 24 s: tied, down 1, 2, 3 (and up 1-3) all ask; down 4 does not; both ends of the floor", () => {
  const ask = (home, away, possession) => criticalCandidates(crunch("deficit", { clock: 20, home, away, possession }).snapshot()).map((c) => c.family);
  for (const [home, away] of [[100, 100], [99, 100], [98, 100], [97, 100], [101, 100], [103, 100]]) {
    assert.deepEqual(ask(home, away, "home"), ["clutchOffense"], `${home}-${away} with the ball`);
    assert.deepEqual(ask(home, away, "away"), ["clutchDefense"], `${home}-${away} defending`);
  }
  assert.deepEqual(ask(96, 100, "home"), [], "down 4: no last-shot moment");
  assert.deepEqual(ask(104, 100, "away"), [], "up 4: no last-stop moment");
});

test("the choice changes what the sim does: tied, 'three' really shoots threes, 'attack' really goes to the rim -- as a tendency, not a guarantee", () => {
  const share = (pick) => {
    let threes = 0;
    let shots = 0;
    for (let i = 0; i < 60; i += 1) {
      const sim = crunch(`z-${i}`, { home: 98, away: 98 });
      const { s } = session(sim);
      boundary(s, sim);
      call(s, sim, pick);
      const out = sim.clutchLog[0];
      if (!out?.attempted) continue;
      shots += 1;
      if (out.zone === "three") threes += 1;
      assert.equal(out.honored, true);
    }
    return { share: threes / shots, shots };
  };
  const three = share("three");
  const attack = share("attack");
  assert.ok(three.shots >= 30 && attack.shots >= 30, `enough attempts (${three.shots}/${attack.shots})`);
  assert.ok(three.share - attack.share > 0.3, `three-share ${three.share.toFixed(2)} vs attack ${attack.share.toFixed(2)}`);
  assert.ok(attack.share > 0 && three.share < 1, "not a guarantee: the player's own game still decides");
});
