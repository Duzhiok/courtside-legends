/**
 * M3 unified animation queue (ROADMAP §6).
 *
 * CourtView used to run 3 independent rAF loops (main push loop, shot arc,
 * dunk drive) + 1 timeout (skillPop), each cancelling the others by hand.
 * This module owns ONE rAF loop and schedules every court animation as a
 * job with enqueue / cancel / priority / generational token:
 *
 *   enqueue({ id?, priority?, delay?, step, onCancel? }) -> id
 *     step(now) returns true when the job is done (removed), false to run
 *     again next frame. delay defers the first run by that many ms.
 *     Enqueueing a job with an id that already exists replaces it.
 *   cancel(id) / cancelAll()
 *   nextGeneration() — bumps the generation and drops every job stamped
 *     with an older one (their onCancel runs). Use it when the game /
 *     screen changes so stale callbacks can never fire afterwards.
 *
 * Pure module: the rAF / clock functions are injected (the browser passes
 * none — globals are read lazily at construction, never at import time, so
 * Node tests can stub them). With no rAF available the jobs just wait until
 * tick(now) is called manually; delayed jobs additionally get a setTimeout
 * wake-up so they still fire in real time when the frame loop is idle.
 * The queue never touches the sim.
 */

export function createAnimationQueue({ requestAnimationFrame, cancelAnimationFrame, now } = {}) {
  const raf =
    requestAnimationFrame ||
    (typeof globalThis !== "undefined" && typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : null);
  const caf =
    cancelAnimationFrame ||
    (typeof globalThis !== "undefined" && typeof globalThis.cancelAnimationFrame === "function"
      ? globalThis.cancelAnimationFrame.bind(globalThis)
      : null);
  const clock =
    now ||
    (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const setT =
    setTimeout ||
    (typeof globalThis !== "undefined" && typeof globalThis.setTimeout === "function"
      ? globalThis.setTimeout.bind(globalThis)
      : null);
  const clearT =
    clearTimeout ||
    (typeof globalThis !== "undefined" && typeof globalThis.clearTimeout === "function"
      ? globalThis.clearTimeout.bind(globalThis)
      : null);

  let jobs = [];
  let generation = 0;
  let rafId = 0;
  let timerId = 0;
  let nextId = 1;

  function schedule() {
    if (rafId || !raf || jobs.length === 0) return;
    rafId = raf(() => {
      rafId = 0;
      tick(clock());
    });
  }

  /**
   * Wake the queue when the next delayed job comes due, even if the rAF loop is idle (or stubbed, as in tests).
   * With a real rAF loop, jobs that are already due run on the next frame, so the timer is only armed for
   * jobs due in the FUTURE. (Arming it for due jobs too meant a 0 ms setTimeout that re-armed itself on every
   * tick: ~4,500 timer fires per 5 s and the court redrawn 3–4 times per frame for the whole game.)
   */
  let armedFor = -1;
  function disarm() {
    if (timerId) clearT(timerId);
    timerId = 0;
    armedFor = -1;
  }
  function armTimer(seenAt) {
    if (!setT) return;
    // Use the timestamp the caller already judged jobs against. A fresh clock() here can be a
    // millisecond later, so a job the tick just decided was not due looks finished-and-future-less
    // and the wake-up is dropped. A stub rAF (returns 0, never calls back) then never runs it.
    const t = seenAt ?? clock();
    const pending = jobs.length === 0 ? [] : raf ? jobs.filter((j) => j.runAt > t) : jobs;
    if (pending.length === 0) {
      disarm();
      return;
    }
    const earliest = Math.min(...pending.map((j) => j.runAt));
    // Already armed for this exact wake-up: keep it (re-arming on every frame was ~20 clear/set pairs a second).
    if (timerId && earliest === armedFor) return;
    disarm();
    armedFor = earliest;
    timerId = setT(() => {
      timerId = 0;
      armedFor = -1;
      tick(clock());
    }, Math.max(0, earliest - t));
  }

  function tick(t) {
    // Snapshot: a step may enqueue (cleanup jobs) or cancel siblings.
    const due = jobs
      .filter((j) => t >= j.runAt)
      .sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    for (const job of due) {
      if (!jobs.includes(job)) continue; // cancelled by an earlier job this frame
      let done = false;
      try {
        done = job.step(t) === true;
      } catch (err) {
        // A broken animation must never kill the queue (or the game clock).
        if (typeof console !== "undefined") console.error("[anim-queue] job failed", err);
        done = true;
      }
      if (done) jobs = jobs.filter((j) => j !== job);
    }
    if (jobs.length > 0) {
      schedule();
      armTimer(t);
    }
  }

  return {
    get generation() {
      return generation;
    },
    get size() {
      return jobs.length;
    },

    enqueue(job) {
      if (!job || typeof job.step !== "function") {
        throw new Error("animation queue needs a job with step(now)");
      }
      const id = job.id || `anim-${nextId++}`;
      const existing = jobs.find((j) => j.id === id);
      if (existing) this.cancel(id);
      const entry = {
        id,
        priority: job.priority || 0,
        runAt: clock() + (job.delay || 0),
        step: job.step,
        onCancel: job.onCancel || null,
        generation,
        seq: nextId++,
      };
      jobs.push(entry);
      schedule();
      armTimer();
      return id;
    },

    cancel(id) {
      const job = jobs.find((j) => j.id === id);
      if (!job) return false;
      jobs = jobs.filter((j) => j !== job);
      try {
        job.onCancel?.();
      } catch (err) {
        if (typeof console !== "undefined") console.error("[anim-queue] onCancel failed", err);
      }
      armTimer();
      return true;
    },

    cancelAll() {
      const all = jobs;
      jobs = [];
      if (caf && rafId) {
        caf(rafId);
        rafId = 0;
      }
      if (clearT) disarm();
      for (const job of all) {
        try {
          job.onCancel?.();
        } catch (err) {
          if (typeof console !== "undefined") console.error("[anim-queue] onCancel failed", err);
        }
      }
    },

    /** Invalidate every pending job: stale callbacks from the old game/screen never run. */
    nextGeneration() {
      generation += 1;
      const stale = jobs;
      jobs = [];
      if (caf && rafId) {
        caf(rafId);
        rafId = 0;
      }
      if (clearT) disarm();
      for (const job of stale) {
        try {
          job.onCancel?.();
        } catch (err) {
          if (typeof console !== "undefined") console.error("[anim-queue] onCancel failed", err);
        }
      }
      return generation;
    },

    /** Drive one frame manually (tests; the browser loop calls this via rAF). */
    tick,
  };
}
