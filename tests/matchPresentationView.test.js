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
  // the canned feed has no GameSim event numbers, so the event id is null; a live match passes "sim:<seq>"
  assert.deepEqual(view3d.shots, [{ shooterId: "home-sg", made: true, pts: 2, eventId: null }]);
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

// ---- S2: who has the ball -----------------------------------------------------

function ballRecorder() {
  const calls = [];
  return {
    calls,
    render: (snap) => calls.push(["render", snap.possession]),
    setBallOwner: (id) => calls.push(["owner", id]),
    onPass: ({ passerId, receiverId }) => calls.push(["pass", passerId, receiverId]),
    onShot: ({ shooterId }) => calls.push(["shot", shooterId]),
    onDunk: (id) => calls.push(["dunk", id]),
    resize() {}, dispose() {},
  };
}
const snapAway = { quarter: 1, clock: 700, score: { home: 0, away: 0 }, possession: "away" };
const beatOf = (kind, meta = {}, holder = {}) => ({ kind, meta, holder, score: { home: 0, away: 0 }, clock: 700, quarter: 1, label: kind, snapshot: snapAway, eventId: "sim:1" });

test("view: a possession is drawn first, then the ball goes to the holder GameSim names", () => {
  const v = ballRecorder();
  createMatchPresentationView({ view3d: v }).applyBeat(beatOf("possession_start", {}, { after: "pg" }));
  assert.deepEqual(v.calls, [["render", "away"], ["owner", "pg"]]);
});

test("view: a pass flies passer to receiver; if the beat was skipped the ball is simply with the receiver", () => {
  const meta = { pass: { passerId: "a", receiverId: "b" } };
  const played = ballRecorder();
  createMatchPresentationView({ view3d: played }).applyBeat(beatOf("pass", meta));
  assert.deepEqual(played.calls, [["pass", "a", "b"]]);
  const skipped = ballRecorder();
  createMatchPresentationView({ view3d: skipped }).applyBeat(beatOf("pass", meta), null, { skipped: true });
  assert.deepEqual(skipped.calls, [["owner", "b"]], "no arc, but the ball changed hands");
});

test("view: the shot starts in the shooter's hands; a rebound or a steal gives the ball to who GameSim says", () => {
  const shot = ballRecorder();
  createMatchPresentationView({ view3d: shot }).applyBeat(beatOf("score", { shot: { shooterId: "s", pts: 2 } }, { before: "s", after: null }));
  assert.deepEqual(shot.calls, [["owner", "s"], ["shot", "s"]]);
  const reb = ballRecorder();
  createMatchPresentationView({ view3d: reb }).applyBeat(beatOf("reb", { reb: { rebounderId: "r" } }, { after: "r" }));
  assert.deepEqual(reb.calls, [["owner", "r"]]);
  const steal = ballRecorder();
  createMatchPresentationView({ view3d: steal }).applyBeat(beatOf("miss", { turnover: { actorId: "h", kind: "steal", forcedById: "t" } }, { before: "h", after: "t" }));
  assert.deepEqual(steal.calls, [["owner", "t"]], "a turnover is not a shot");
  const loose = ballRecorder();
  createMatchPresentationView({ view3d: loose }).applyBeat(beatOf("miss", { turnover: { actorId: "h", kind: "unforced" } }, { before: "h", after: null }));
  assert.deepEqual(loose.calls, [], "an unforced turnover names nobody, so nothing is invented");
});

test("view: a 3D court without ball methods keeps working (older views, previews)", () => {
  const bare = { render() {}, onShot() {}, resize() {}, dispose() {} };
  const view = createMatchPresentationView({ view3d: bare });
  view.applyBeat(beatOf("possession_start", {}, { after: "pg" }));
  view.applyBeat(beatOf("pass", { pass: { passerId: "a", receiverId: "b" } }));
  view.applyBeat(beatOf("reb", { reb: { rebounderId: "r" } }, { after: "r" }));
});

