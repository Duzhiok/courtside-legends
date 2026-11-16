import test from "node:test";
import assert from "node:assert/strict";
import { createMatchPresentationView, formatClock } from "../js/match/presentation/matchView.js";
import { mergePresentationEvents } from "../js/match/presentation/normalizer.js";
import { choreograph } from "../js/match/presentation/choreographer.js";
import { buildCannedFeed } from "../js/match/presentation/cannedFeed.js";

function stubView3d() {
  return {
    renders: [],
    shots: [],
    dunks: [],
    render(snap) {
      this.renders.push(snap);
      return Promise.resolve();
    },
    onShot(shot) {
      this.shots.push(shot);
      return true;
    },
    onDunk(id) {
      this.dunks.push(id);
      return true;
    },
  };
}

function stubHud() {
  const field = () => ({ textContent: "" });
  return { scoreHome: field(), scoreAway: field(), clock: field(), quarter: field(), beatLabel: field() };
}

test("formatClock renders GameSim seconds as M:SS", () => {
  assert.equal(formatClock(720), "12:00");
  assert.equal(formatClock(706), "11:46");
  assert.equal(formatClock(65), "1:05");
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(null), "--:--");
});

test("view: HUD score/clock always equal the beat's GameSim snapshot values", () => {
  const view3d = stubView3d();
  const hud = stubHud();
  const view = createMatchPresentationView({ view3d, hud });
  const feed = buildCannedFeed();
  const events = mergePresentationEvents(feed.rawEvents, feed.domainEvents);
  const { plays } = choreograph(events, { seed: feed.seed });
  const scoreBeat = plays[0].beats.find((b) => b.kind === "score");
  view.applyBeat(scoreBeat);
  assert.equal(hud.scoreHome.textContent, "2");
  assert.equal(hud.scoreAway.textContent, "0");
  assert.equal(hud.clock.textContent, "11:46");
  assert.equal(hud.quarter.textContent, "Q1");
  assert.equal(hud.beatLabel.textContent, "Home SG scores");
  assert.deepEqual(view3d.shots, [{ shooterId: "home-sg", made: true, pts: 2 }]);
  const dunkBeat = plays[2].beats.find((b) => b.kind === "dunk");
  view.applyBeat(dunkBeat);
  assert.equal(hud.scoreHome.textContent, "4");
  assert.equal(hud.clock.textContent, "11:00");
  assert.deepEqual(view3d.dunks, ["home-sg"]);
});

test("view: possession/substitution beats render the snapshot; other beats do not re-render", () => {
  const view3d = stubView3d();
  const view = createMatchPresentationView({ view3d, hud: stubHud() });
  const feed = buildCannedFeed();
  const events = mergePresentationEvents(feed.rawEvents, feed.domainEvents);
  const { plays } = choreograph(events, { seed: feed.seed });
  const push = plays[0].beats.find((b) => b.kind === "possession_start");
  const pass = plays[0].beats.find((b) => b.kind === "pass");
  const sub = plays[1].beats.find((b) => b.kind === "substitution");
  view.applyBeat(push);
  view.applyBeat(pass);
  view.applyBeat(sub);
  assert.equal(view3d.renders.length, 2);
  assert.equal(view3d.renders[0], push.snapshot);
  assert.equal(view3d.renders[1], sub.snapshot);
});

test("view: a failing view call never takes down playback or the HUD", () => {
  const hud = stubHud();
  const view = createMatchPresentationView({
    view3d: { render() { throw new Error("WebGL gone"); } },
    hud,
  });
  const feed = buildCannedFeed();
  const events = mergePresentationEvents(feed.rawEvents, feed.domainEvents);
  const { plays } = choreograph(events, { seed: feed.seed });
  assert.doesNotThrow(() => view.applyBeat(plays[0].beats[0]));
  assert.equal(hud.scoreHome.textContent, "0");
});

test("view throws without a view3d", () => {
  assert.throws(() => createMatchPresentationView({ hud: stubHud() }), /needs a view3d/);
});

test("integration: canned feed plays end to end on fake time, HUD ends 4–0", async () => {
  let now = 0;
  const view3d = stubView3d();
  const hud = stubHud();
  const view = createMatchPresentationView({ view3d, hud, clock: () => now });
  const feed = buildCannedFeed();
  const events = mergePresentationEvents(feed.rawEvents, feed.domainEvents);
  const { plays, totalDurationMs } = choreograph(events, { seed: feed.seed });
  view.loadPlays(plays);
  // Drive the scheduler with fake time in 100ms steps until it goes idle.
  for (let step = 0; step < 1000 && !view.scheduler.isIdle(); step++) {
    now += 100;
    view.tick();
  }
  assert.ok(view.scheduler.isIdle(), "scheduler finished all plays");
  assert.equal(hud.scoreHome.textContent, "4");
  assert.equal(hud.scoreAway.textContent, "0");
  assert.equal(hud.quarter.textContent, "Q1");
  assert.equal(view3d.renders.length, 4, "3 possession starts + 1 substitution render");
  assert.equal(view3d.shots.length, 2, "made shot + missed shot");
  assert.deepEqual(view3d.dunks, ["home-sg"]);
  assert.ok(totalDurationMs > 0);
});
