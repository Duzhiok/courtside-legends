/**
 * PlaybackScheduler — 3D-S1A (docs/implementation/3D-MATCH-VIEWER-PHASE0-AUDIT.md §7).
 *
 * Drives choreographed plays through the viewer at 1x / 2x / 3x with the
 * plan's "compress, never queue" rule (3D_BROADCAST_PLAN §6, audit §4):
 *
 *   - TimeScale divides each beat's duration; it never re-times the sim.
 *   - At most ONE play may wait while another plays. A newer play REPLACES
 *     the waiting one (the dropped play is counted and reported via
 *     `onDrop`) — the queue never grows.
 *   - When a new play arrives mid-play, the current play is compressed:
 *     its remaining skippable beats (pass / push / hold — never a scoring
 *     beat) are skipped so the viewer catches up instead of lagging.
 *   - A beat whose effective duration would fall below `minBeatMs` is
 *     skipped too (at 3x a 500 ms pass beat is ~167 ms; below the floor it
 *     is not worth flashing on screen).
 *   - Pause freezes: `tick()` is a no-op while paused, so the viewer keeps
 *     showing the last applied beat — a sane frozen frame — and `resume()`
 *     continues cleanly from exactly where it stopped (no time jump).
 *   - `interrupt()` stops the current play, clears the waiter, and reports
 *     via `onInterrupt`. Nothing is left half-applied.
 *
 * Tick-driven and clock-injectable (`tick(nowMs)`) so tests can drive it
 * with fake time; the default clock is performance.now() / Date.now().
 * No DOM, no Math.random, no sim imports.
 */
import { SKIPPABLE_BEAT_KINDS } from "./choreographer.js";

export const VALID_TIME_SCALES = Object.freeze([1, 2, 3]);

export function createPlaybackScheduler({
  onBeat = () => {},
  onPlayEnd = () => {},
  onInterrupt = () => {},
  onDrop = () => {},
  clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  minBeatMs = 120,
} = {}) {
  let timeScale = 1;
  let state = "idle"; // "idle" | "playing" | "paused"
  let current = null; // { play, beatIndex, beatElapsedMs, lastTickMs }
  let pending = null; // at most one waiting play
  let compressed = false; // current play is being fast-forwarded through skippable beats
  let dropped = 0;
  let skipped = 0;

  const effectiveDuration = (beat) => beat.durationMs / timeScale;

  const startBeat = (nowMs = clock()) => {
    // Skip non-essential beats while compressing, or when the beat would be
    // too short to read at this timeScale. Scoring beats are never skipped.
    while (current && current.beatIndex < current.play.beats.length) {
      const beat = current.play.beats[current.beatIndex];
      const skippable = SKIPPABLE_BEAT_KINDS.includes(beat.kind);
      if ((compressed && skippable) || (skippable && effectiveDuration(beat) < minBeatMs)) {
        skipped++;
        current.beatIndex++;
        continue;
      }
      break;
    }
    if (!current || current.beatIndex >= current.play.beats.length) {
      endPlay();
      return;
    }
    current.beatElapsedMs = 0;
    current.lastTickMs = nowMs;
    onBeat(current.play.beats[current.beatIndex], current.play);
  };

  const endPlay = () => {
    const finished = current?.play || null;
    current = null;
    compressed = false;
    state = "idle";
    if (finished) onPlayEnd(finished);
    // The waiting play (at most one) starts immediately — no gap, no queue.
    if (pending) {
      const next = pending;
      pending = null;
      load(next);
    }
  };

  function load(play) {
    if (!play || !Array.isArray(play.beats)) throw new Error("PlaybackScheduler.load needs a choreographed play");
    if (state === "playing" || state === "paused") {
      // A newer play compresses the one on screen and replaces the waiter.
      compressed = true;
      if (pending) {
        dropped++;
        onDrop(pending);
      }
      pending = play;
      return "queued";
    }
    current = { play, beatIndex: 0, beatElapsedMs: 0, lastTickMs: clock() };
    state = "playing";
    startBeat(current.lastTickMs);
    return "playing";
  }

  return {
    /** Queue a play (replaces any waiting play) or start it immediately. */
    load,
    setTimeScale(n) {
      if (!VALID_TIME_SCALES.includes(n)) throw new Error(`PlaybackScheduler: timeScale must be 1, 2 or 3 (got ${n})`);
      timeScale = n;
    },
    getTimeScale() {
      return timeScale;
    },
    /** Advance playback to `nowMs` (defaults to the injected clock). */
    tick(nowMs = clock()) {
      if (state !== "playing" || !current) return;
      const dt = Math.max(0, nowMs - current.lastTickMs);
      current.lastTickMs = nowMs;
      current.beatElapsedMs += dt;
      while (current && current.beatIndex < current.play.beats.length) {
        const beat = current.play.beats[current.beatIndex];
        if (current.beatElapsedMs < effectiveDuration(beat)) break;
        current.beatElapsedMs -= effectiveDuration(beat);
        current.beatIndex++;
        startBeat(nowMs);
        // startBeat may have ended the play (current === null) or fired the
        // next beat; the loop re-checks the (possibly new) current beat.
        if (!current) break;
        if (state !== "playing") break;
      }
    },
    /** Freeze on the current beat. tick() is a no-op until resume(). */
    pause() {
      if (state !== "playing") return false;
      state = "paused";
      return true;
    },
    /** Continue from exactly where pause() stopped (no time jump). */
    resume() {
      if (state !== "paused" || !current) return false;
      current.lastTickMs = clock();
      state = "playing";
      return true;
    },
    /** Stop everything now: current play + waiting play are discarded. */
    interrupt() {
      if (state === "idle" && !pending) return false;
      const stopped = current?.play || null;
      current = null;
      pending = null;
      compressed = false;
      state = "idle";
      onInterrupt(stopped);
      return true;
    },
    isPlaying() {
      return state === "playing";
    },
    isPaused() {
      return state === "paused";
    },
    isIdle() {
      return state === "idle";
    },
    /** The beat currently on screen, or null. */
    currentBeat() {
      return current?.play.beats[current.beatIndex] || null;
    },
    pendingCount() {
      return pending ? 1 : 0;
    },
    get droppedCount() {
      return dropped;
    },
    get skippedCount() {
      return skipped;
    },
  };
}
