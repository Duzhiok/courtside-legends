import test from "node:test";
import assert from "node:assert/strict";
import { createUiGate } from "../js/match/presentation/uiGate.js";
import { playThroughController } from "./helpers/presentationHarness.js";

// ---------------------------------------------------------------- the gate itself (pure bookkeeping)

test("gate off: defer runs at once (2D mode is exactly today's behaviour)", () => {
  const gate = createUiGate();
  const seen = [];
  assert.equal(gate.defer(5, () => seen.push("a")), false);
  assert.deepEqual(seen, ["a"]);
  assert.equal(gate.pending, 0);
});

test("gate on: held until the cursor reaches the event, shown in seq order, never twice", () => {
  const gate = createUiGate();
  gate.setEnabled(true);
  const seen = [];
  for (const seq of [3, 4, 4, 7, 9]) gate.defer(seq, () => seen.push(seq));
  assert.equal(gate.pending, 5);
  gate.release(2);
  assert.deepEqual(seen, [], "the cursor is before everything");
  gate.release(4);
  assert.deepEqual(seen, [3, 4, 4], "up to and including seq 4, in order");
  gate.release(4);
  assert.deepEqual(seen, [3, 4, 4], "nothing is shown twice");
  gate.release(100);
  assert.deepEqual(seen, [3, 4, 4, 7, 9]);
  assert.equal(gate.pending, 0);
});

test("an entry with no seq cannot be ordered, so it is shown at once; turning the gate off shows everything waiting", () => {
  const gate = createUiGate();
  gate.setEnabled(true);
  const seen = [];
  gate.defer(null, () => seen.push("no-seq"));
  gate.defer(1, () => seen.push(1));
  gate.defer(2, () => seen.push(2));
  assert.deepEqual(seen, ["no-seq"]);
  gate.setEnabled(false);
  assert.deepEqual(seen, ["no-seq", 1, 2], "nothing is lost when 3D goes away");
  assert.equal(gate.enabled, false);
});

test("bounded: an overflowing queue shows its oldest entries instead of holding forever, and a throwing entry cannot block the rest", () => {
  const gate = createUiGate({ maxPending: 3 });
  gate.setEnabled(true);
  const seen = [];
  for (let i = 0; i < 6; i++) gate.defer(i, () => seen.push(i));
  assert.deepEqual(seen, [0, 1, 2], "three held, three forced out, oldest first");
  assert.equal(gate.forced, 3);
  const quiet = console.error;
  console.error = () => {};
  try {
    const g2 = createUiGate();
    g2.setEnabled(true);
    const out = [];
    g2.defer(1, () => { throw new Error("paint failed"); });
    g2.defer(2, () => out.push(2));
    g2.release(2);
    assert.deepEqual(out, [2]);
  } finally {
    console.error = quiet;
  }
});

// ---------------------------------------------------------------- real GameSim through the real controller

// Seed pinned by a scan (B76 moved the dice: s3-a/s3-b/s3-g left fewer than 4 shots on the court at 3x; s3-c/d/f/h pass at every speed).
for (const speed of [1, 2, 3]) {
  test(`${speed}x: the feed line and the scoreboard come with the ball, never before it (real GameSim, real controller)`, async () => {
    const gated = (await playThroughController({ speed, possessions: 40, seed: "s3-c" })).summary;
    const ungated = (await playThroughController({ speed, possessions: 40, seed: "s3-c", gated: false })).summary;
    assert.ok(gated.shownWithEventId >= 4, "enough shots reached the court to mean something");
    assert.equal(gated.feedBeforeShotStart, 0, "no shot's commentary before its shot");
    assert.equal(gated.scoreboardSpoilerMs, 0, "the scoreboard never shows an event the 3D cursor has not reached");
    assert.equal(gated.gateStuck, 0, "nothing is left waiting at the end");
    assert.ok(gated.feedAfterShotStartMaxMs <= 1010 / speed + 20, `the line lands with the ball (${gated.feedAfterShotStartMaxMs} ms)`);
    assert.ok(gated.feedAfterShotStartMedianMs >= 1000 / speed - 20, `...and not before the ball lands (${gated.feedAfterShotStartMedianMs} ms)`);
    // The measurement must be able to see the bug it guards: without the gate the same run is clearly ahead.
    assert.ok(ungated.feedBeforeShotStart >= gated.shownWithEventId - 1, "ungated, nearly every line runs ahead of its shot");
    assert.ok(ungated.scoreboardSpoilerMs > 1000, "ungated, the scoreboard spends seconds ahead of the court");
    assert.ok(gated.gatePendingPeak <= 120, "bounded backlog");
  });
}

test("GameSim is untouched: the same seed gives the same shots and score with or without the gate", async () => {
  const a = await playThroughController({ speed: 2, possessions: 40, seed: "s3-b" });
  const b = await playThroughController({ speed: 2, possessions: 40, seed: "s3-b", gated: false });
  assert.deepEqual(a.shotsSim.map((s) => [s.seq, s.shooterId, s.made]), b.shotsSim.map((s) => [s.seq, s.shooterId, s.made]));
  assert.deepEqual(a.sim.score, b.sim.score);
});

test("pause freezes the whole screen: cursor, feed, scoreboard and the 3D beat do not move while the game is paused", async () => {
  const r = await playThroughController({ speed: 1, possessions: 40, seed: "s3-c", hold: { from: 30000, to: 45000 } });
  const { start, end } = r.holdSample;
  assert.ok(start && end, "the pause window was sampled");
  assert.equal(end.cursorSeq, start.cursorSeq, "the cursor did not move");
  assert.deepEqual(end.shown, start.shown, "the scoreboard did not move");
  assert.equal(end.feedLines, start.feedLines, "no feed line appeared");
  assert.equal(r.summary.gateStuck, 0, "and after resuming everything drains");
});

test("2D <-> 3D: leaving 3D shows every waiting line and the latest score at once; nothing is lost and GameSim is not touched", async () => {
  const r = await playThroughController({ speed: 3, possessions: 30, seed: "s3-d" });
  const seqBefore = r.sim.seq ?? null;
  r.ctl.disable({ keepWanted: true });
  assert.equal(r.ctl.gatePending, 0);
  assert.deepEqual(r.shownScore(), { ...r.sim.score }, "the scoreboard is the authoritative score");
  assert.equal(r.sim.seq ?? null, seqBefore, "switching view emits nothing");
});

test("fast simulation: syncNow drops the animation backlog and shows the latest state", async () => {
  const r = await playThroughController({ speed: 3, possessions: 30, seed: "s3-e", skipDrain: true });
  r.ctl.syncNow();
  assert.equal(r.ctl.gatePending, 0);
  assert.equal(r.ctl.idle, true, "the scheduler has nothing left to play");
  assert.deepEqual(r.shownScore(), { ...r.sim.score });
});
