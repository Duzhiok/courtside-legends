import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergePresentationEvents } from "../js/match/presentation/normalizer.js";
import { choreograph, BEAT_DURATIONS } from "../js/match/presentation/choreographer.js";
import { buildCannedFeed, CANNED_SEED } from "../js/match/presentation/cannedFeed.js";
import { BALL_RADIUS_M } from "../js/engine/court3d.js";

function cannedChoreography(seed = CANNED_SEED) {
  const feed = buildCannedFeed({ seed });
  const events = mergePresentationEvents(feed.rawEvents, feed.domainEvents);
  return { feed, events, result: choreograph(events, { seed }) };
}

test("choreographer is deterministic: same seed + same events ⇒ byte-identical tracks", () => {
  const a = cannedChoreography();
  const b = cannedChoreography();
  assert.equal(JSON.stringify(a.result), JSON.stringify(b.result));
  // And re-choreographing the same normalized events (not the same objects)
  // is identical too.
  const c = choreograph(a.events, { seed: CANNED_SEED });
  assert.equal(JSON.stringify(a.result), JSON.stringify(c));
});

test("choreographer: a different seed stages the plays differently", () => {
  const a = cannedChoreography(CANNED_SEED).result;
  const b = cannedChoreography(CANNED_SEED + 1).result;
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  // Per-play seed is sim seed + possession index.
  assert.equal(a.plays[0].seed, `${CANNED_SEED}:0`);
  assert.equal(a.plays[1].seed, `${CANNED_SEED}:1`);
});

test("choreographer uses no Math.random (seeded streams only)", () => {
  // Header comments document the no-RNG rule in words, so strip comments
  // before scanning for actual calls.
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const file of ["normalizer.js", "choreographer.js", "scheduler.js", "matchView.js", "cannedFeed.js"]) {
    const src = fs.readFileSync(new URL(`../js/match/presentation/${file}`, import.meta.url), "utf8");
    assert.ok(!stripComments(src).includes("Math.random"), `${file} must not use Math.random`);
  }
});

test("choreographer groups beats into plays by possession and covers every event kind", () => {
  const { events, result } = cannedChoreography();
  assert.equal(result.plays.length, 3, "three POSSESSION_STARTs ⇒ three plays");
  const kinds = result.plays.flatMap((p) => p.beats.map((b) => b.kind));
  assert.deepEqual(kinds, [
    "possession_start", "pass", "score",
    "possession_start", "pass", "miss", "reb", "substitution",
    "possession_start", "dunk", "match_end",
  ]);
  // Every beat carries the GameSim snapshot values, never a computed score.
  for (const play of result.plays) {
    for (const beat of play.beats) {
      const src = events.find((e) => e.seq === beat.seq);
      assert.deepEqual(beat.score, src.score);
      assert.equal(beat.clock, src.gameTime.clock);
      assert.equal(beat.quarter, src.gameTime.quarter);
    }
  }
  assert.equal(
    result.totalDurationMs,
    result.plays.reduce((s, p) => s + p.durationMs, 0),
  );
});

test("choreographer: every beat tracks all 10 on-court players; shot beat has a ball arc", () => {
  const { result } = cannedChoreography();
  for (const play of result.plays) {
    for (const beat of play.beats) {
      // 10 on court; a substitution beat also tracks the outgoing player.
      const expected = beat.kind === "substitution" ? 11 : 10;
      assert.equal(beat.players.length, expected, `${beat.kind} should track ${expected} players`);
      for (const tr of beat.players) {
        assert.ok(tr.keyframes.length >= 2, "each track has start + end keyframes");
        for (const k of tr.keyframes) {
          assert.ok(Number.isFinite(k.x) && Number.isFinite(k.y) && Number.isFinite(k.z));
          assert.equal(typeof k.anim, "string");
        }
      }
    }
  }
  const shot = result.plays[0].beats.find((b) => b.kind === "score");
  assert.ok(shot.ball, "shot beat has a ball path");
  assert.equal(shot.ball.keyframes.at(-1).y, BALL_RADIUS_M, "made shot ends on the floor under the rim");
  assert.ok(shot.ball.keyframes.some((k) => k.y > 3), "shot arc rises above the rim");
  assert.equal(shot.camera.mode, "rim");
  const shooter = shot.players.find((t) => t.playerId === "home-sg");
  assert.ok(shooter.keyframes.some((k) => k.anim === "shoot"), "shooter gets a shoot anim tag");
});

test("choreographer: substitution tracks the incoming and outgoing players", () => {
  const { result } = cannedChoreography();
  const sub = result.plays[1].beats.find((b) => b.kind === "substitution");
  assert.ok(sub, "substitution beat exists");
  assert.equal(sub.players.length, 11, "10 on court + the outgoing player walking off");
  const incoming = sub.players.find((t) => t.playerId === "home-6");
  assert.ok(incoming, "incoming player has a track");
  assert.notEqual(incoming.keyframes[0].x, incoming.keyframes.at(-1).x, "incoming player walks in from the sideline");
  const outgoing = sub.players.find((t) => t.playerId === "home-pf");
  assert.ok(outgoing, "outgoing player has a track");
  assert.equal(sub.camera.mode, "bench");
});

test("choreographer: dunk beat drives the dunker to the rim; coach lines make no beat", () => {
  const { events, result } = cannedChoreography();
  const dunk = result.plays[2].beats.find((b) => b.kind === "dunk");
  const dunker = dunk.players.find((t) => t.playerId === "home-sg");
  assert.ok(dunker.keyframes.some((k) => k.anim === "dunk"));
  assert.equal(dunk.durationMs, BEAT_DURATIONS.dunk);
  // A coach feed line is text, not movement.
  const withCoach = choreograph(
    [...events, { seq: 99, kind: "coach", text: "nice", source: "raw", gameTime: { quarter: 1, clock: 650 }, score: { home: 4, away: 0 }, possession: "home", snapshot: events.at(-1).snapshot, meta: {} }],
    { seed: CANNED_SEED },
  );
  assert.equal(
    withCoach.plays.flatMap((p) => p.beats).length,
    result.plays.flatMap((p) => p.beats).length,
    "coach events add no beat",
  );
});
