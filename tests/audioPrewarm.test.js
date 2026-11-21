// The first tap used to pay for opening the audio device (`new AudioContext()`: 0.5-1 s, once per browser process, measured with a CPU
// profile). It is built in an idle moment after boot instead; the tap only resumes it.
import test from "node:test";
import assert from "node:assert/strict";
import { prewarmWhenIdle } from "../js/audio/prewarm.js";

/** A fake clock + timer: `tick(ms)` moves time and runs whatever fell due. */
function fakeTime() {
  let t = 0;
  const q = [];
  return {
    now: () => t,
    wait: (fn, ms) => q.push({ at: t + ms, fn }),
    tick(ms) {
      const end = t + ms;
      for (;;) {
        q.sort((x, y) => x.at - y.at);
        if (!q.length || q[0].at > end) break;
        const job = q.shift();
        t = Math.max(t, job.at);
        job.fn();
      }
      t = end;
    },
    pending: () => q.length,
  };
}

test("prewarmWhenIdle: never synchronous, and not while the app is still young", () => {
  const time = fakeTime();
  let built = 0;
  prewarmWhenIdle(() => { built += 1; }, { ...time, lastInput: () => -1e9 });
  assert.equal(built, 0, "nothing happens inside the caller's turn");
  time.tick(2000);
  assert.equal(built, 0, "still starting up: the build (one 0.5 s block) waits");
  time.tick(1000);
  assert.equal(built, 1, "quiet and old enough: built once");
  time.tick(60000);
  assert.equal(built, 1);
  assert.equal(time.pending(), 0, "no more polling afterwards");
});

test("prewarmWhenIdle: waits for a quiet moment while the player is tapping, then builds", () => {
  const time = fakeTime();
  let built = 0;
  let last = 0;
  prewarmWhenIdle(() => { built += 1; }, { ...time, lastInput: () => last });
  for (let i = 0; i < 14; i++) { last = time.now(); time.tick(500); } // a tap every half second for 7 s (well past the minimum age)
  assert.equal(built, 0, "never in the middle of a burst of taps");
  time.tick(700);
  assert.equal(built, 0, "1.2 s of calm is not enough yet");
  time.tick(1500);
  assert.equal(built, 1, "1.5 s without input: now");
});

test("prewarmWhenIdle: a player who never goes quiet already built it with the first tap, so it gives up; and stops once it exists", () => {
  const busy = fakeTime();
  let built = 0;
  prewarmWhenIdle(() => { built += 1; }, { ...busy, lastInput: () => busy.now() });
  busy.tick(120000);
  assert.equal(built, 0);
  assert.equal(busy.pending(), 0, "gave up: no timer left running");
  const made = fakeTime();
  let exists = false;
  let b2 = 0;
  prewarmWhenIdle(() => { b2 += 1; }, { ...made, lastInput: () => -1e9, done: () => exists });
  exists = true; // the first tap built it meanwhile
  made.tick(60000);
  assert.equal(b2, 0, "nothing to do any more");
  assert.equal(made.pending(), 0);
});

class FakeNode { connect() { return this; } }
class FakeContext {
  static made = 0;
  constructor() {
    FakeContext.made += 1;
    this.state = "suspended"; // a context built without a gesture stays suspended until resume() is called from one
    this.currentTime = 0;
    this.destination = new FakeNode();
  }
  createGain() { const n = new FakeNode(); n.gain = { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} }; return n; }
  createDynamicsCompressor() { return new FakeNode(); }
  async resume() { this.state = "running"; }
}

test("audioManager: prewarm builds the context once, suspended; the later unlock builds nothing and only resumes", async () => {
  const keep = globalThis.AudioContext;
  try {
    globalThis.AudioContext = FakeContext;
    const manager = await import("../js/audio/audioManager.js");
    assert.equal(manager.isUnlocked(), false);
    assert.equal(manager.prewarm(), true);
    assert.equal(FakeContext.made, 1);
    assert.equal(manager.isUnlocked(), false, "prewarm does not start sound: that still needs a gesture");
    assert.equal(manager.prewarm(), true);
    assert.equal(FakeContext.made, 1, "prewarm twice builds once");
    assert.ok(manager.bus(), "the sfx bus exists, so cues can play as soon as it is resumed");
    assert.equal(await manager.unlock(), true);
    assert.equal(FakeContext.made, 1, "the tap did not construct a second context (that was the 0.5-1 s)");
    assert.equal(manager.isUnlocked(), true);
  } finally {
    globalThis.AudioContext = keep;
  }
});

test("audioManager: no audio support or a constructor that throws is a quiet false, never an exception", async () => {
  // a fresh module instance, so the context built above does not count
  const manager = await import("../js/audio/audioManager.js?fresh-1");
  const keep = globalThis.AudioContext;
  try {
    delete globalThis.AudioContext;
    delete globalThis.webkitAudioContext;
    assert.equal(manager.prewarm(), false);
    assert.equal(await manager.unlock(), false);
    globalThis.AudioContext = class { constructor() { throw new Error("device busy"); } };
    assert.equal(manager.prewarm(), false);
  } finally {
    if (keep) globalThis.AudioContext = keep; else delete globalThis.AudioContext;
  }
});
