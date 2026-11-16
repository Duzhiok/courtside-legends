import test from "node:test";
import assert from "node:assert/strict";
import { createPlaybackScheduler } from "../js/match/presentation/scheduler.js";

function playWithBeats(kindsAndDurations) {
  return {
    possessionIndex: 0,
    seed: "test:0",
    beats: kindsAndDurations.map(([kind, durationMs], i) => ({
      seq: i,
      kind,
      possessionIndex: 0,
      startMs: 0,
      durationMs,
      players: [],
      ball: null,
      camera: { mode: "wide" },
      score: { home: 0, away: 0 },
      clock: 720,
      quarter: 1,
      label: kind,
    })),
    durationMs: kindsAndDurations.reduce((s, [, d]) => s + d, 0),
  };
}

function harness(opts = {}) {
  let now = 0;
  const seen = [];
  const ended = [];
  const dropped = [];
  const interrupted = [];
  const sched = createPlaybackScheduler({
    clock: () => now,
    onBeat: (beat) => seen.push(beat.kind),
    onPlayEnd: (play) => ended.push(play),
    onDrop: (play) => dropped.push(play),
    onInterrupt: (play) => interrupted.push(play),
    ...opts,
  });
  return {
    sched,
    seen,
    ended,
    dropped,
    interrupted,
    advance(ms) {
      now += ms;
      sched.tick();
    },
    setNow(ms) {
      now = ms;
      sched.tick();
    },
  };
}

test("scheduler plays beats in order at 1x and ends the play", () => {
  const h = harness();
  const play = playWithBeats([["possession_start", 1400], ["pass", 500], ["score", 1000]]);
  assert.equal(h.sched.load(play), "playing");
  assert.deepEqual(h.seen, ["possession_start"]);
  h.advance(1399);
  assert.deepEqual(h.seen, ["possession_start"]);
  h.advance(1);
  assert.deepEqual(h.seen, ["possession_start", "pass"]);
  h.advance(500);
  assert.deepEqual(h.seen, ["possession_start", "pass", "score"]);
  h.advance(1000);
  assert.equal(h.ended.length, 1);
  assert.ok(h.sched.isIdle());
});

test("scheduler 2x/3x compresses beat durations (never re-times the sim)", () => {
  const h = harness();
  h.sched.setTimeScale(2);
  h.sched.load(playWithBeats([["score", 1000]]));
  h.advance(499);
  assert.equal(h.ended.length, 0, "1000ms beat takes 500ms at 2x");
  h.advance(1);
  assert.equal(h.ended.length, 1);

  const h3 = harness();
  h3.sched.setTimeScale(3);
  h3.sched.load(playWithBeats([["score", 900], ["reb", 600]]));
  h3.advance(300);
  assert.deepEqual(h3.seen, ["score", "reb"], "900ms beat takes 300ms at 3x");
  h3.advance(200);
  assert.equal(h3.ended.length, 1, "600ms beat takes 200ms at 3x");
  assert.throws(() => h3.sched.setTimeScale(4), /timeScale must be 1, 2 or 3/);
});

test("scheduler skips skippable beats below the min-beat floor, never scoring beats", () => {
  const h = harness({ minBeatMs: 200 });
  h.sched.setTimeScale(3);
  // pass: 500/3 ≈ 167ms < 200 → skipped. score: 1000/3 ≈ 333ms → kept.
  h.sched.load(playWithBeats([["pass", 500], ["score", 1000]]));
  assert.deepEqual(h.seen, ["score"], "short pass beat skipped at 3x");
  assert.equal(h.sched.skippedCount, 1);
  h.advance(334);
  assert.equal(h.ended.length, 1);
});

test("scheduler pause freezes the frame and resume continues cleanly", () => {
  const h = harness();
  h.sched.load(playWithBeats([["score", 1000]]));
  h.advance(400);
  assert.ok(h.sched.pause());
  assert.ok(h.sched.isPaused());
  h.advance(5000);
  assert.equal(h.ended.length, 0, "no progress while paused");
  assert.equal(h.sched.currentBeat().kind, "score", "frozen on the same beat");
  assert.ok(h.sched.resume());
  h.advance(599);
  assert.equal(h.ended.length, 0);
  h.advance(1);
  assert.equal(h.ended.length, 1, "resumes from exactly where it stopped");
  assert.equal(h.sched.pause(), false, "pause on an idle scheduler is a no-op");
});

test("scheduler interrupt stops the play and clears the waiter", () => {
  const h = harness();
  h.sched.load(playWithBeats([["score", 1000]]));
  h.sched.load(playWithBeats([["dunk", 900]]));
  assert.equal(h.sched.pendingCount(), 1);
  assert.ok(h.sched.interrupt());
  assert.ok(h.sched.isIdle());
  assert.equal(h.sched.pendingCount(), 0);
  assert.equal(h.interrupted.length, 1);
  h.advance(5000);
  assert.equal(h.ended.length, 0, "nothing plays after interrupt");
});

test("scheduler compresses, never queues: at most one play waits, newer replaces older", () => {
  const h = harness();
  const first = playWithBeats([["score", 1000]]);
  const second = playWithBeats([["dunk", 900]]);
  const third = playWithBeats([["reb", 600]]);
  h.sched.load(first);
  assert.equal(h.sched.load(second), "queued");
  assert.equal(h.sched.load(third), "queued", "third replaces second as the single waiter");
  assert.equal(h.sched.pendingCount(), 1);
  assert.equal(h.sched.droppedCount, 1);
  assert.equal(h.dropped.length, 1);
  assert.equal(h.dropped[0], second);
  h.advance(1000);
  assert.equal(h.ended.length, 1);
  assert.deepEqual(h.seen, ["score", "reb"], "the surviving waiter plays next");
  h.advance(600);
  assert.equal(h.ended.length, 2);
});
