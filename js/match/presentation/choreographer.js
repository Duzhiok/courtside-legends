/**
 * Choreographer — 3D-S1A (docs/implementation/3D-MATCH-VIEWER-PHASE0-AUDIT.md §7).
 *
 * Pure and deterministic: from normalized presentation events + the
 * per-event GameSim snapshots, produce keyframe tracks (player positions,
 * ball path, anim tags, camera cue) for the match viewer.
 *
 *   seed = sim seed + possession index: every play's randomness comes from
 *   `seededStream(hashSeed(`${seed}:${possessionIndex}`))`. There is NO
 *   Math.random anywhere in this module — same seed + same events ⇒
 *   byte-identical tracks (JSON.stringify-stable).
 *
 * What is real vs invented (audit §12, owner ruling):
 *   - REAL (from GameSim, never re-decided here): who scored / missed /
 *     dunked / passed / rebounded / turned it over, the score, the clock,
 *     the quarter, the on-court lineups. The choreographer never rolls a
 *     make/miss, never picks a scorer, never moves the clock.
 *   - PRESENTATION-ONLY (GameSim never computed these): dribble routes,
 *     screens, cuts, the shooter's exact spot, the push path, the ball arc.
 *     They are deterministic staging so the viewer reads as basketball, and
 *     must never be presented as simulated. Base set positions reuse
 *     CourtView3D's own `snapshotTo3DPositions` (the same formation math
 *     the 2D court uses), so the staging matches the 2D view.
 *
 * Output:
 *   { seed, plays: [{ possessionIndex, seed, beats, durationMs }], totalDurationMs }
 *   beat = { seq, kind, possessionIndex, startMs, durationMs,
 *            players: [{ playerId, side, keyframes: [{ t, x, y, z, anim }] }],
 *            ball: { keyframes: [{ t, x, y, z }] } | null,
 *            camera: { mode: "wide" | "follow-ball" | "rim" | "bench" },
 *            score: { home, away }, clock, quarter, label }
 *   `t` and `startMs` are milliseconds inside the beat / play. `y` is height
 *   in metres (0 = floor). `score`/`clock` on every beat are copied straight
 *   from the GameSim snapshot — the HUD must display those values, never a
 *   value the viewer computed.
 *
 * Beat durations are the compressed-playback durations at 1x (audit §4,
 * owner decision 1: deterministic compressed playback, no look-ahead).
 * The PlaybackScheduler divides them by the timeScale (1x/2x/3x) and may
 * skip non-essential beats; it never re-times the sim.
 *
 * Pure module: no DOM, no Math.random, no sim imports. The only engine
 * imports are the pure position helpers from `js/engine/court3d.js`.
 */
import {
  snapshotTo3DPositions,
  rimVec3,
  COURT_HALF_WIDTH_M,
  RIM_HEIGHT_M,
  BALL_RADIUS_M,
  MISS_BOUNCE_M,
} from "../../engine/court3d.js";
import { hashSeed, seededStream, clamp } from "../../core/seededRandom.js";
import { ballHolders, openingHolder } from "./ballOwner.js";

/** Compressed-playback beat durations at 1x (ms). */
export const BEAT_DURATIONS = Object.freeze({
  possession_start: 1400,
  pass: 500,
  score: 1000,
  miss: 1000,
  dunk: 900,
  reb: 600,
  turnover: 500,
  foul: 500,
  substitution: 800,
  period_start: 600,
  period_end: 600,
  match_end: 900,
  hold: 400,
});

/** Beats the scheduler may skip entirely when compressing (never a scoring beat). */
export const SKIPPABLE_BEAT_KINDS = Object.freeze(["pass", "possession_start", "hold"]);

/** `coach` feed lines have no visual beat — they are text, not movement. */
const SKIPPED_KINDS = new Set(["coach"]);

function posMap(snap, phase = 1) {
  const map = new Map();
  for (const p of snapshotTo3DPositions(snap, phase, 0)) {
    map.set(p.playerId, p);
  }
  return map;
}

function kf(t, x, y, z, anim) {
  return { t, x, y, z, anim };
}

/** Two-keyframe hold at one spot (stable under interpolation). */
function holdTrack(p, durationMs, anim = "idle") {
  return {
    playerId: p.playerId,
    side: p.side,
    keyframes: [kf(0, p.x, 0, p.z, anim), kf(durationMs, p.x, 0, p.z, anim)],
  };
}

/** Move from `from` to `to`, optionally via a mid keyframe (jump / drive). */
function moveTrack(p, from, to, durationMs, mid) {
  const frames = [kf(0, from.x, from.y ?? 0, from.z, mid?.animFrom || "run")];
  if (mid) frames.push(kf(mid.t, mid.x, mid.y ?? 0, mid.z, mid.anim || "run"));
  frames.push(kf(durationMs, to.x, to.y ?? 0, to.z, mid?.animTo || "idle"));
  return { playerId: p.playerId, side: p.side, keyframes: frames };
}

/** Ball arc: start → apex → end. `apexY` is the peak height in metres. */
function ballArc(from, to, durationMs, apexY) {
  const mid = {
    x: (from.x + to.x) / 2,
    z: (from.z + to.z) / 2,
  };
  return {
    keyframes: [
      kf(0, from.x, from.y, from.z),
      kf(Math.round(durationMs * 0.55), mid.x, apexY, mid.z),
      kf(durationMs, to.x, to.y, to.z),
    ],
  };
}

function ballAt(p, y = 1.4) {
  return { x: p.x, y, z: p.z };
}

/**
 * Pure: normalized events + sim seed → deterministic plays of keyframe beats.
 * `events` must already be sequenced (see normalizer.js). `seed` is the
 * GameSim seed (number or string); per-play seeds are `${seed}:${possessionIndex}`.
 */
export function choreograph(events = [], { seed = 0 } = {}) {
  const plays = [];
  let current = null;
  let possessionIndex = -1;
  // Last known floor spot per player, for continuity between beats/plays.
  const lastPos = new Map();

  const ensurePlay = () => {
    if (!current) {
      if (possessionIndex < 0) possessionIndex = 0;
      current = {
        possessionIndex,
        seed: `${seed}:${possessionIndex}`,
        beats: [],
        durationMs: 0,
      };
      plays.push(current);
    }
    return current;
  };

  for (const [eventIndex, evt] of (events || []).entries()) {
    if (!evt || SKIPPED_KINDS.has(evt.kind)) continue;
    const snap = evt.snapshot;
    if (!snap || typeof snap !== "object") continue;

    if (evt.kind === "possession_start") {
      possessionIndex++;
      current = {
        possessionIndex,
        seed: `${seed}:${possessionIndex}`,
        beats: [],
        durationMs: 0,
      };
      plays.push(current);
    }
    const play = ensurePlay();
    const rng = seededStream(hashSeed(play.seed));
    const dur = BEAT_DURATIONS[evt.kind] ?? BEAT_DURATIONS.hold;
    const attackingUp = evt.possession === "home";
    const rim = rimVec3(attackingUp);
    const set = posMap(snap, 1);
    const push = posMap(snap, 0);
    const startMs = play.durationMs;

    // Deterministic staging jitter, drawn in a fixed order per beat so the
    // same seed + events always draw the same values. Presentation-only.
    const jitter = () => ({ dx: (rng() - 0.5) * 1.6, dz: (rng() - 0.5) * 1.6 });

    const spotOf = (playerId) => {
      const p = set.get(playerId);
      if (p) return p;
      const last = lastPos.get(playerId);
      return last ? { playerId, side: "home", x: last.x, z: last.z } : null;
    };
    const at = (playerId, fallback) => {
      const last = lastPos.get(playerId);
      if (last) return { x: last.x, z: last.z };
      const p = set.get(playerId) || push.get(playerId) || fallback;
      return p ? { x: p.x, z: p.z } : { x: 0, z: 0 };
    };

    const beat = {
      seq: evt.seq ?? -1,
      // The GameSim event this beat shows (see normalizer.js): what the feed, the scoreboard and the 3D court all agree on.
      eventId: evt.eventId ?? null,
      simSeq: evt.simSeq ?? null,
      // Who holds the ball before / after this event, from GameSim's own actor ids (ballOwner.js). A possession start has no actor of its
      // own: it opens with the first player the same possession names.
      holder: evt.kind === "possession_start" ? { after: openingHolder(events, eventIndex) } : ballHolders(evt.kind, evt.meta),
      kind: evt.kind,
      possessionIndex: play.possessionIndex,
      startMs,
      durationMs: dur,
      players: [],
      ball: null,
      camera: { mode: "wide" },
      score: { ...(evt.score || { home: 0, away: 0 }) },
      clock: evt.gameTime?.clock ?? null,
      quarter: evt.gameTime?.quarter ?? null,
      label: evt.text || evt.kind,
      // Passthrough references (not copies): the view adapter needs the
      // snapshot for render() and the meta for onShot/onDunk. Both stay
      // GameSim-authoritative — the beat never rewrites them.
      snapshot: evt.snapshot,
      meta: evt.meta || {},
    };

    const holdAll = (anim = "idle") => {
      for (const p of set.values()) beat.players.push(holdTrack(p, dur, anim));
    };
    const finishBeat = () => {
      // Remember end spots for continuity; ball ends with its holder.
      for (const tr of beat.players) {
        const last = tr.keyframes[tr.keyframes.length - 1];
        lastPos.set(tr.playerId, { x: last.x, z: last.z });
      }
      play.beats.push(beat);
      play.durationMs += dur;
    };

    switch (evt.kind) {
      case "possession_start": {
        // Push: backcourt (phase 0) → set (phase 1). Presentation-only path.
        for (const p of set.values()) {
          const from = push.get(p.playerId) || p;
          beat.players.push(moveTrack(p, from, p, dur));
        }
        const handler = [...set.values()].find((p) => p.isHandler);
        if (handler) beat.ball = { keyframes: [kf(0, handler.x, 1.0, handler.z), kf(dur, handler.x, 1.0, handler.z)] };
        beat.camera = { mode: "wide" };
        finishBeat();
        break;
      }
      case "pass": {
        const passerId = evt.meta?.pass?.passerId;
        const receiverId = evt.meta?.pass?.receiverId;
        holdAll();
        const passer = spotOf(passerId);
        const receiver = spotOf(receiverId);
        if (passer && receiver) {
          beat.ball = ballArc(ballAt(passer, 1.6), ballAt(receiver, 1.4), dur, 2.4);
          beat.camera = { mode: "follow-ball" };
        }
        finishBeat();
        break;
      }
      case "score":
      case "miss": {
        const shot = evt.meta?.shot || {};
        const shooterId = shot.shooterId || [...set.values()].find((p) => p.isHandler)?.playerId;
        const shooter = spotOf(shooterId);
        const made = evt.kind === "score" || shot.made === true;
        // Presentation-only: the shooter's exact spot is staged (a small
        // deterministic offset from the set spot), not simulated.
        const j = jitter();
        const spot = shooter
          ? { x: clamp(shooter.x + j.dx, -COURT_HALF_WIDTH_M, COURT_HALF_WIDTH_M), z: shooter.z + j.dz }
          : { x: 0, z: 0 };
        for (const p of set.values()) {
          if (shooter && p.playerId === shooter.playerId) {
            beat.players.push(
              moveTrack(
                p,
                at(p.playerId, p),
                { x: spot.x, z: spot.z },
                dur,
                { t: Math.round(dur * 0.6), x: spot.x, y: 0.35, z: spot.z, anim: "shoot", animTo: "idle" },
              ),
            );
          } else {
            beat.players.push(holdTrack(p, dur));
          }
        }
        if (shooter) {
          const release = { x: spot.x, y: 2.1, z: spot.z };
          const rimTop = { x: rim.x, y: RIM_HEIGHT_M, z: rim.z };
          const out = attackingUp ? 1 : -1;
          const end = made
            ? { x: rim.x, y: BALL_RADIUS_M, z: rim.z }
            : { x: rim.x, y: BALL_RADIUS_M, z: rim.z + out * MISS_BOUNCE_M };
          beat.ball = {
            keyframes: [
              kf(0, release.x, release.y, release.z),
              kf(Math.round(dur * 0.55), (release.x + rim.x) / 2, 4.3, (release.z + rim.z) / 2),
              kf(Math.round(dur * 0.85), rimTop.x, rimTop.y, rimTop.z),
              kf(dur, end.x, end.y, end.z),
            ],
          };
        }
        beat.camera = { mode: "rim" };
        finishBeat();
        break;
      }
      case "dunk": {
        const dunkerId = evt.meta?.player?.id || [...set.values()].find((p) => p.isHandler)?.playerId;
        const dunker = spotOf(dunkerId);
        for (const p of set.values()) {
          if (dunker && p.playerId === dunker.playerId) {
            beat.players.push(
              moveTrack(
                p,
                at(p.playerId, p),
                { x: rim.x, z: rim.z },
                dur,
                { t: Math.round(dur * 0.65), x: rim.x, y: 0.9, z: rim.z, anim: "dunk", animTo: "idle" },
              ),
            );
          } else {
            beat.players.push(holdTrack(p, dur));
          }
        }
        if (dunker) {
          const from = at(dunker.playerId, dunker);
          beat.ball = {
            keyframes: [
              kf(0, from.x, 1.6, from.z),
              kf(Math.round(dur * 0.65), rim.x, 2.5, rim.z),
              kf(dur, rim.x, BALL_RADIUS_M, rim.z),
            ],
          };
        }
        beat.camera = { mode: "rim" };
        finishBeat();
        break;
      }
      case "reb": {
        const rebId = evt.meta?.reb?.rebounderId;
        const rebounder = spotOf(rebId);
        const rimSpot = { x: rim.x, z: rim.z + (attackingUp ? 1 : -1) * 1.2 };
        for (const p of set.values()) {
          if (rebounder && p.playerId === rebounder.playerId) {
            beat.players.push(
              moveTrack(p, at(p.playerId, p), rimSpot, dur, {
                t: Math.round(dur * 0.6),
                x: rimSpot.x,
                y: 0.3,
                z: rimSpot.z,
                anim: "rebound",
                animTo: "idle",
              }),
            );
          } else {
            beat.players.push(holdTrack(p, dur));
          }
        }
        if (rebounder) {
          beat.ball = {
            keyframes: [
              kf(0, rim.x, RIM_HEIGHT_M, rim.z),
              kf(Math.round(dur * 0.6), rimSpot.x, 1.8, rimSpot.z),
              kf(dur, rimSpot.x, 1.4, rimSpot.z),
            ],
          };
        }
        beat.camera = { mode: "rim" };
        finishBeat();
        break;
      }
      case "turnover":
      case "foul": {
        holdAll();
        const actorId = evt.meta?.turnover?.forcedById || evt.meta?.foul?.foulerId;
        const actor = actorId ? spotOf(actorId) : null;
        if (actor) {
          beat.ball = { keyframes: [kf(0, actor.x, 1.4, actor.z), kf(dur, actor.x, 1.4, actor.z)] };
        }
        beat.camera = { mode: "wide" };
        finishBeat();
        break;
      }
      case "substitution": {
        const sub = evt.meta?.sub || {};
        const inId = sub.inId;
        const outId = sub.outId;
        const sideX = sub.side === "away" ? -1 : 1;
        const sideline = { x: sideX * (COURT_HALF_WIDTH_M + 1.5), z: 0 };
        for (const p of set.values()) {
          if (inId && p.playerId === inId) {
            // Enters from the sideline to the set spot. Presentation-only path.
            beat.players.push(moveTrack(p, sideline, p, dur, { t: Math.round(dur * 0.5), x: p.x / 2, y: 0, z: p.z / 2, anim: "run", animTo: "idle" }));
          } else {
            beat.players.push(holdTrack(p, dur));
          }
        }
        if (outId && !set.has(outId)) {
          const last = lastPos.get(outId);
          if (last) {
            beat.players.push({
              playerId: outId,
              side: sub.side || "home",
              keyframes: [
                kf(0, last.x, 0, last.z, "run"),
                kf(dur, sideline.x, 0, sideline.z, "idle"),
              ],
            });
          }
        }
        beat.camera = { mode: "bench" };
        finishBeat();
        break;
      }
      case "period_start":
      case "period_end":
      case "match_end": {
        const winner = evt.kind === "match_end" ? (beat.score.home >= beat.score.away ? "home" : "away") : null;
        for (const p of set.values()) {
          const anim = winner && p.side === winner ? "celebrate" : "idle";
          beat.players.push(holdTrack(p, dur, anim));
        }
        beat.camera = { mode: "wide" };
        finishBeat();
        break;
      }
      default: {
        holdAll();
        finishBeat();
        break;
      }
    }
  }

  return {
    seed,
    plays,
    totalDurationMs: plays.reduce((sum, p) => sum + p.durationMs, 0),
  };
}
