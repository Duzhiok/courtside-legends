/**
 * MatchPresentationView — 3D-S1A (docs/implementation/3D-MATCH-VIEWER-PHASE0-AUDIT.md §7).
 *
 * The adapter between choreographed plays and the existing
 * `CourtView3D` (js/engine/court3d.js) capsule court. It owns NO game state:
 *
 *   - Score / clock / quarter on screen are copied verbatim from the
 *     GameSim snapshot carried on each beat — never computed here. If the
 *     HUD and the sim disagree, the HUD is wrong by definition.
 *   - It drives CourtView3D ONLY through its public interface —
 *     `render(snap)` on possession/substitution/period beats,
 *     `onShot({ shooterId, made, pts })` on shot beats,
 *     `onDunk(playerId)` on dunk beats. CourtView3D.tick() owns figure
 *     placement every frame, so S1A does NOT force-apply the choreographed
 *     per-keyframe player/ball positions on top of it (that would fight the
 *     view's own loop). The tracks are still produced deterministically and
 *     verified by tests, and the preview's beat inspector shows them; a
 *     future S1B track-driven figure/camera mode can consume
 *     `beat.players` / `beat.ball` / `beat.camera` directly.
 *   - Playback (1x/2x/3x, pause, interrupt, compress-never-queue) is the
 *     PlaybackScheduler's job; this adapter just wires its callbacks.
 *
 * `view3d` is injected (a real CourtView3D in the preview, a stub in
 * tests). `hud` is a bag of `{ textContent }` sinks (DOM elements in the
 * preview, plain objects in tests): scoreHome, scoreAway, clock, quarter,
 * beatLabel. No DOM is created here.
 */
import { createPlaybackScheduler } from "./scheduler.js";

export function formatClock(clockSeconds) {
  if (typeof clockSeconds !== "number" || !Number.isFinite(clockSeconds)) return "--:--";
  const total = Math.max(0, Math.floor(clockSeconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function createMatchPresentationView({ view3d, hud = {}, scheduler = null, clock } = {}) {
  if (!view3d || typeof view3d.render !== "function") {
    throw new Error("createMatchPresentationView needs a view3d with render()");
  }
  // Plays are chained one at a time through onPlayEnd: feeding them all
  // into the scheduler at once would (correctly, per compress-never-queue)
  // drop all but the last waiter. An injected scheduler owns its own
  // onPlayEnd, so loadPlays falls back to direct loads there.
  let playQueue = [];
  const ownScheduler = !scheduler;
  const sched =
    scheduler ||
    createPlaybackScheduler({
      onBeat: (beat, play) => applyBeat(beat, play),
      onPlayEnd: () => {
        if (playQueue.length > 0) sched.load(playQueue.shift());
      },
      ...(clock ? { clock } : {}),
    });

  function setHud(score, clockSeconds, quarter) {
    if (hud.scoreHome) hud.scoreHome.textContent = String(score?.home ?? 0);
    if (hud.scoreAway) hud.scoreAway.textContent = String(score?.away ?? 0);
    if (hud.clock) hud.clock.textContent = formatClock(clockSeconds);
    if (hud.quarter) hud.quarter.textContent = quarter == null ? "" : `Q${quarter}`;
  }

  /** Apply one choreographed beat: HUD from the snapshot, view via its public API. */
  function applyBeat(beat, _play) {
    if (!beat) return;
    setHud(beat.score, beat.clock, beat.quarter);
    if (hud.beatLabel) hud.beatLabel.textContent = beat.label || beat.kind;
    try {
      if (beat.kind === "possession_start" || beat.kind === "substitution" || beat.kind === "period_start") {
        if (beat.snapshot) {
          const p = view3d.render(beat.snapshot);
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      } else if ((beat.kind === "score" || beat.kind === "miss") && typeof view3d.onShot === "function") {
        const shot = beat.meta?.shot || {};
        if (shot.shooterId) {
          view3d.onShot({ shooterId: shot.shooterId, made: beat.kind === "score" || shot.made === true, pts: shot.pts || 0, eventId: beat.eventId });
        }
      } else if (beat.kind === "dunk" && typeof view3d.onDunk === "function") {
        const id = beat.meta?.player?.id;
        if (id) view3d.onDunk(id);
      }
    } catch {
      // A view failure must never take down playback; the HUD above is
      // already showing the authoritative snapshot values.
    }
  }

  return {
    /** The scheduler driving this view (injectable for tests). */
    scheduler: sched,
    applyBeat,
    setHud,
    /** Load one choreographed play into the scheduler. */
    loadPlay(play) {
      return sched.load(play);
    },
    /** Load every play of a choreographed game, in order (chained, not queued). */
    loadPlays(plays) {
      if (ownScheduler) {
        playQueue = [...(plays || [])];
        const first = playQueue.shift();
        if (first) sched.load(first);
        return;
      }
      for (const play of plays || []) sched.load(play);
    },
    setTimeScale(n) {
      sched.setTimeScale(n);
    },
    pause() {
      return sched.pause();
    },
    resume() {
      return sched.resume();
    },
    interrupt() {
      playQueue = [];
      return sched.interrupt();
    },
    /** Advance playback to `nowMs` (defaults to the scheduler's clock). */
    tick(nowMs) {
      sched.tick(nowMs);
    },
    currentBeat() {
      return sched.currentBeat();
    },
    dispose() {
      try {
        sched.interrupt();
      } catch {
        /* already stopped */
      }
      try {
        view3d.dispose?.();
      } catch {
        /* already disposed */
      }
    },
  };
}
