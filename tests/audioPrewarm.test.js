// The first tap used to pay for opening the audio device (`new AudioContext()`: 0.5-1 s, once per browser process, measured with a CPU
// profile). It is built in an idle moment after boot instead; the tap only resumes it.
import test from "node:test";
import assert from "node:assert/strict";
import { prewarmWhenIdle } from "../js/audio/prewarm.js";

test("prewarmWhenIdle: never synchronous, runs once the browser is idle", () => {
  const queue = [];
  let built = 0;
  prewarmWhenIdle(() => { built += 1; }, { idle: (fn) => queue.push(fn), inputPending: () => false });
  assert.equal(built, 0, "nothing happens inside the caller's turn");
  queue.shift()();
  assert.equal(built, 1);
  assert.equal(queue.length, 0);
});

test("prewarmWhenIdle: steps aside while the player is typing/tapping, but does go ahead after a few deferrals", () => {
  const queue = [];
  let built = 0;
  let pending = true;
  prewarmWhenIdle(() => { built += 1; }, { idle: (fn) => queue.push(fn), inputPending: () => pending, tries: 3 });
  for (let i = 0; i < 3; i++) queue.shift()(); // three deferrals while input is pending
  assert.equal(built, 0);
  queue.shift()(); // out of tries: a one-off cost now beats the same cost inside a tap
  assert.equal(built, 1);
  const q2 = [];
  let b2 = 0;
  pending = false;
  prewarmWhenIdle(() => { b2 += 1; }, { idle: (fn) => q2.push(fn), inputPending: () => pending });
  q2.shift()();
  assert.equal(b2, 1, "no pending input: straight away");
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
