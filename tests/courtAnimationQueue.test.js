import test from "node:test";
import assert from "node:assert/strict";
import { createAnimationQueue } from "../js/engine/courtAnimationQueue.js";

/** Fake rAF: callbacks only run when the test drives them. */
function makeRaf() {
  const cbs = [];
  return {
    raf: (cb) => {
      cbs.push(cb);
      return cbs.length;
    },
    caf: () => {},
    run() {
      const fns = cbs.splice(0);
      for (const fn of fns) fn();
    },
    get pending() {
      return cbs.length;
    },
  };
}

test("queue: jobs run in priority order, same priority FIFO", () => {
  const raf = makeRaf();
  let now = 1000;
  const q = createAnimationQueue({
    requestAnimationFrame: raf.raf,
    cancelAnimationFrame: raf.caf,
    now: () => now,
  });
  const order = [];
  q.enqueue({ id: "low", priority: 0, step: () => { order.push("low"); return true; } });
  q.enqueue({ id: "high", priority: 10, step: () => { order.push("high"); return true; } });
  q.enqueue({ id: "mid", priority: 5, step: () => { order.push("mid"); return true; } });
  q.enqueue({ id: "low2", priority: 0, step: () => { order.push("low2"); return true; } });
  q.tick(now);
  assert.deepEqual(order, ["high", "mid", "low", "low2"]);
  q.cancelAll();
});

test("queue: a multi-frame job runs every frame until it reports done", () => {
  const raf = makeRaf();
  let now = 1000;
  const q = createAnimationQueue({
    requestAnimationFrame: raf.raf,
    cancelAnimationFrame: raf.caf,
    now: () => now,
  });
  let frames = 0;
  q.enqueue({
    id: "spin",
    step: () => {
      frames += 1;
      return frames >= 3;
    },
  });
  q.tick(now);
  assert.equal(frames, 1);
  q.tick(now + 16);
  assert.equal(frames, 2);
  q.tick(now + 32);
  assert.equal(frames, 3);
  assert.equal(q.size, 0);
  q.cancelAll();
});

test("queue: cancel drops the job and runs its onCancel", () => {
  const raf = makeRaf();
  let now = 1000;
  const q = createAnimationQueue({
    requestAnimationFrame: raf.raf,
    cancelAnimationFrame: raf.caf,
    now: () => now,
  });
  let ran = 0;
  let cancelled = 0;
  q.enqueue({ id: "x", step: () => { ran += 1; return true; }, onCancel: () => { cancelled += 1; } });
  assert.equal(q.cancel("x"), true);
  assert.equal(q.cancel("x"), false, "second cancel is a no-op");
  q.tick(now);
  assert.equal(ran, 0);
  assert.equal(cancelled, 1);
  q.cancelAll();
});

test("queue: re-enqueueing an id replaces the old job", () => {
  const raf = makeRaf();
  let now = 1000;
  const q = createAnimationQueue({
    requestAnimationFrame: raf.raf,
    cancelAnimationFrame: raf.caf,
    now: () => now,
  });
  let first = 0;
  let second = 0;
  q.enqueue({ id: "same", step: () => { first += 1; return true; } });
  q.enqueue({ id: "same", step: () => { second += 1; return true; } });
  q.tick(now);
  assert.equal(first, 0);
  assert.equal(second, 1);
  q.cancelAll();
});

test("queue: delayed jobs wait until their time, then run", () => {
  const raf = makeRaf();
  let now = 1000;
  const q = createAnimationQueue({
    requestAnimationFrame: raf.raf,
    cancelAnimationFrame: raf.caf,
    now: () => now,
  });
  let ran = 0;
  q.enqueue({ id: "later", delay: 500, step: () => { ran += 1; return true; } });
  q.tick(now + 100);
  assert.equal(ran, 0);
  q.tick(now + 499);
  assert.equal(ran, 0);
  q.tick(now + 500);
  assert.equal(ran, 1);
  q.cancelAll();
});

test("queue: nextGeneration invalidates old callbacks, new jobs still run", () => {
  const raf = makeRaf();
  let now = 1000;
  const q = createAnimationQueue({
    requestAnimationFrame: raf.raf,
    cancelAnimationFrame: raf.caf,
    now: () => now,
  });
  let oldRan = 0;
  let oldCancelled = 0;
  let newRan = 0;
  q.enqueue({ id: "old", step: () => { oldRan += 1; return true; }, onCancel: () => { oldCancelled += 1; } });
  const gen = q.nextGeneration();
  assert.equal(gen, 1);
  assert.equal(oldCancelled, 1);
  q.enqueue({ id: "new", step: () => { newRan += 1; return true; } });
  q.tick(now);
  assert.equal(oldRan, 0, "the stale callback never fires");
  assert.equal(newRan, 1);
  q.cancelAll();
});

test("queue: one rAF loop drives frames; it stops when empty", () => {
  const raf = makeRaf();
  let now = 1000;
  const q = createAnimationQueue({
    requestAnimationFrame: raf.raf,
    cancelAnimationFrame: raf.caf,
    now: () => now,
  });
  let frames = 0;
  q.enqueue({
    id: "spin",
    step: () => {
      frames += 1;
      return frames >= 2;
    },
  });
  assert.equal(raf.pending, 1, "enqueue arms the loop");
  raf.run(); // frame 1
  assert.equal(frames, 1);
  assert.equal(raf.pending, 1, "still armed while a job remains");
  now += 16;
  raf.run(); // frame 2
  assert.equal(frames, 2);
  assert.equal(q.size, 0);
  q.cancelAll();
});

test("queue: a throwing job is dropped, not fatal to the queue", () => {
  const raf = makeRaf();
  let now = 1000;
  const q = createAnimationQueue({
    requestAnimationFrame: raf.raf,
    cancelAnimationFrame: raf.caf,
    now: () => now,
  });
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    let good = 0;
    q.enqueue({ id: "bad", step: () => { throw new Error("boom"); } });
    q.enqueue({ id: "good", step: () => { good += 1; return true; } });
    q.tick(now);
    assert.equal(good, 1);
    assert.equal(q.size, 0);
    assert.ok(errors.some((e) => e.includes("boom")));
  } finally {
    console.error = realError;
  }
  q.cancelAll();
});

test("queue: with a real rAF loop a running job never arms a 0 ms timer (no timer storm)", () => {
  // Regression (2026-11-20 review): armTimer() armed setTimeout(0) for jobs that were already due, and every
  // fire re-armed it -- ~4,500 timer fires per 5 s alongside rAF for the whole live game.
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const armed = [];
  globalThis.setTimeout = (fn, ms) => { armed.push(ms); return armed.length; };
  globalThis.clearTimeout = () => {};
  try {
    const raf = makeRaf();
    let now = 1000;
    const q = createAnimationQueue({ requestAnimationFrame: raf.raf, cancelAnimationFrame: raf.caf, now: () => now });
    q.enqueue({ id: "loop", step: () => false }); // a push loop that runs every frame
    for (let i = 0; i < 50; i++) { now += 16; raf.run(); }
    assert.equal(armed.length, 0, `no timer for due jobs, got ${armed.length}`);
    q.enqueue({ id: "later", delay: 500, step: () => true });
    assert.equal(armed.at(-1), 500, "a delayed job still gets its real-time wake-up");
    q.cancelAll();
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});

test("queue: a timer that rings a millisecond early re-arms the leftover delay and still runs the job", () => {
  // B78: court skill-pop stubs rAF to `() => 0`. The 900 ms timer can fire ~1 ms early, the tick
  // leaves the job, and a second clock() read then sees nothing left in the future and disarms.
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, ms) => {
    const id = timers.length + 1;
    timers.push({ fn, ms, id });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    const at = timers.findIndex((timer) => timer.id === id);
    if (at >= 0) timers.splice(at, 1);
  };
  try {
    let now = 1000;
    const q = createAnimationQueue({
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      now: () => now,
    });
    let ran = 0;
    q.enqueue({ id: "pop", delay: 900, step: () => { ran += 1; return true; } });
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 900);
    now = 1899;
    const early = timers[0].fn;
    timers.length = 0;
    early();
    assert.equal(ran, 0, "a millisecond early is not due yet");
    assert.equal(timers.length, 1, "the leftover millisecond stays armed");
    assert.ok(timers[0].ms > 0 && timers[0].ms <= 2, `re-armed for ${timers[0].ms} ms`);
    now = 1900;
    timers[0].fn();
    assert.equal(ran, 1);
    assert.equal(q.size, 0);
    q.cancelAll();
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});
