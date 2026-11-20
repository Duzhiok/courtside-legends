// P0 match-presentation synchronization. Design goals only: every scene the 3D court plays refers to a real GameSim event, and the
// formation on screen belongs to the team that is actually shooting. See docs/implementation/PRESENTATION-SYNC-AUDIT.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { createPresentationEventNormalizer } from "../js/match/presentation/normalizer.js";
import { playThroughController } from "./helpers/presentationHarness.js";
import { realTeam } from "./helpers/realGame.js";
import { hashSeed, seededStream } from "../js/core/seededRandom.js";

const snap = (o = {}) => ({ quarter: 1, clock: 700, score: { home: 0, away: 0 }, possession: "home", ...o });

test("GameSim stamps every event with a monotonic seq, and a saved game continues the numbering", () => {
  const seen = [];
  const mk = (extra = {}) => new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3,
    rng: seededStream(hashSeed("seq-1")), onEvent: (e) => seen.push(e.seq), onTick() {}, onEnd() {}, ...extra });
  const sim = mk();
  for (let i = 0; i < 6; i++) sim.step();
  assert.ok(seen.length > 6);
  assert.deepEqual(seen, seen.map((_, i) => i), "0,1,2,... with no gaps and no repeats");
  const saved = sim.exportState();
  assert.equal(saved.eventSeq, seen.length);
  const after = [];
  const restored = GameSim.fromSave(JSON.parse(JSON.stringify(saved)), { onEvent: (e) => after.push(e.seq), onTick() {}, onEnd() {} });
  restored.rng = seededStream(hashSeed("seq-2"));
  restored.paused = false; // a loaded game starts paused; the player presses Continue
  for (let i = 0; i < 3; i++) restored.step();
  assert.equal(after[0], seen.length, "the reloaded game carries on from the saved number: ids never repeat across a reload");
  const oldSave = JSON.parse(JSON.stringify(saved));
  delete oldSave.eventSeq;
  const legacy = [];
  const old = GameSim.fromSave(oldSave, { onEvent: (e) => legacy.push(e.seq), onTick() {}, onEnd() {} });
  old.paused = false;
  old.step();
  assert.equal(legacy[0], 0, "a save from before event ids still loads");
});

test("a fast (quiet) simulation emits no events and is unchanged by the counter", () => {
  const run = () => new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3,
    rng: seededStream(hashSeed("fast-1")), onEvent() { throw new Error("quiet game emitted"); }, onTick() {}, onEnd() {} }).runFast();
  const a = run();
  const b = run();
  assert.deepEqual(a.score, b.score);
});

test("live ordering is arrival order: a possession start follows the events it closes, with stable ids", () => {
  const n = createPresentationEventNormalizer();
  const same = snap({ clock: 700 });
  n.feedRaw({ type: "miss", text: "miss", seq: 4, ...same, meta: { shot: { shooterId: "a" } } });
  n.feedRaw({ type: "reb", text: "reb", seq: 5, ...same, meta: {} });
  // the start of the NEXT possession: same clock, snapshot taken after this one (possession already flipped)
  n.feedDerived({ type: "POSSESSION_START", meta: {}, snapshot: snap({ clock: 700, possession: "away" }) });
  n.feedRaw({ type: "score", text: "score", seq: 6, ...snap({ clock: 690, possession: "away" }), meta: { shot: { shooterId: "b" } } });
  const out = n.flush();
  assert.deepEqual(out.map((e) => e.kind), ["miss", "reb", "possession_start", "score"], "a clock sort used to put the start first");
  assert.deepEqual(out.map((e) => e.eventId), ["sim:4", "sim:5", "drv:5:possession_start:0", "sim:6"]);
  assert.deepEqual(out.map((e) => e.simSeq), [4, 5, 5, 6]);
  assert.deepEqual(out.map((e) => e.seq), [0, 1, 2, 3]);
});

for (const speed of [1, 2, 3]) {
  test(`${speed}x: the 3D court shows the shooting team on offense, and every shown shot is a real GameSim event`, async () => {
    const r = await playThroughController({ speed, possessions: 40, seed: "sync-1" });
    assert.ok(r.shotsShown.length >= 3, `3D showed ${r.shotsShown.length} shots`);
    const wrongSide = r.shotsShown.filter((s) => !s.shooterOnOffense);
    assert.equal(wrongSide.length, 0, `${wrongSide.length}/${r.shotsShown.length} shots were drawn with the shooter on defense`);
    assert.equal(r.paired.length, r.shotsShown.length, "every shown shot carries the eventId of a shot GameSim emitted");
    for (const { shown, sim } of r.paired) {
      assert.equal(shown.shooterId, sim.shooterId, "the event it points at has the same shooter");
      assert.equal(shown.made, sim.made, "and the same outcome");
    }
    const ids = r.shotsShown.map((s) => s.eventId);
    assert.equal(new Set(ids).size, ids.length, "no event is played twice");
  });
}

test("3D plays events in GameSim order", async () => {
  const r = await playThroughController({ speed: 1, possessions: 40, seed: "sync-2" });
  const order = r.shotsShown.map((s) => Number(s.eventId.replace("sim:", "")));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

// ---- S2: ball and player truth -------------------------------------------------

for (const speed of [1, 2]) {
  test(`${speed}x: the 3D ball only moves between players on the team with the ball, and starts each shot in the shooter's hands`, async () => {
    const r = await playThroughController({ speed, possessions: 60, seed: "sync-1" });
    assert.ok(r.openings.length >= 5, `${r.openings.length} possessions opened`);
    assert.equal(r.openings.filter((o) => !o.onOffense).length, 0, "a possession opens with a holder on offense");
    for (const p of r.passes) assert.ok(p.passerOnOffense && p.receiverOnOffense, "both ends of a pass are on offense");
    const shots = r.shotsShown;
    const ready = shots.filter((s) => s.ownerPrior === s.shooterId).length;
    // The rest is GameSim's own gap: an offensive rebound or an inbound followed by a different player's action has no pass event.
    assert.ok(ready / shots.length >= 0.8, `the ball was already with the shooter for ${ready}/${shots.length} shots`);
  });
}

test("1x: passes are drawn from the player who really has the ball, and repasses are drawn too", async () => {
  const r = await playThroughController({ speed: 1, possessions: 60, seed: "sync-1" });
  assert.ok(r.passes.length >= 8, `${r.passes.length} passes drawn`);
  const fromHolder = r.passes.filter((p) => p.passerHadIt).length;
  assert.ok(fromHolder / r.passes.length >= 0.85, `${fromHolder}/${r.passes.length} passes started with the passer holding the ball`);
});

