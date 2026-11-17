// 3D-S1B: the Gold game screen's 3D toggle controller. Design goals only: 2D is the default and the fallback, 3D never
// runs ahead of or blocks GameSim, pause/speed are read from the sim, and no failure leaves a blank court.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch3dController } from "../js/ui/match3dController.js";
import { buildCannedFeed } from "../js/match/presentation/cannedFeed.js";

const el = () => {
  const listeners = {};
  return {
    hidden: false, innerHTML: "x", textContent: "", attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, fn) { listeners[t] = fn; },
    click() { return listeners.click?.(); },
  };
};

function rig({ failCreate = false, sim = { paused: false, snapshot: () => ({ quarter: 1, clock: 720, score: { home: 0, away: 0 } }) }, speed = 1 } = {}) {
  const dom = { host: el(), twoD: el(), button: el(), note: el() };
  const stub = { rendered: [], shots: [], disposed: 0, render(s) { this.rendered.push(s); }, onShot(s) { this.shots.push(s); }, resize() {}, dispose() { this.disposed++; } };
  const frames = [];
  const ctx = {
    dom, stub, frames, sim, speed,
    runFrame() { const fn = frames.shift(); if (fn) fn(); return !!fn; },
  };
  ctx.ctl = createMatch3dController({
    ...dom, getSim: () => ctx.sim, getSpeed: () => ctx.speed, seed: 7,
    createView3d: async () => { if (failCreate) throw new Error("WebGL unavailable"); return stub; },
    raf: (fn) => frames.push(fn), caf: () => { frames.length = 0; },
  });
  return ctx;
}

test("off by default: outside Gold there is no button, events are ignored, 2D stays", () => {
  const r = rig();
  r.ctl.startMatch({ offer: false });
  assert.equal(r.dom.button.hidden, true);
  assert.equal(r.ctl.active, false);
  r.ctl.feedRaw({ type: "score" });
  r.ctl.feedDerived({ type: "POSSESSION_START" });
  assert.equal(r.dom.twoD.hidden, false);
});

test("Gold offers the button, but the match still starts in 2D", () => {
  const r = rig();
  r.ctl.startMatch({ offer: true });
  assert.equal(r.dom.button.hidden, false);
  assert.equal(r.ctl.active, false);
  assert.equal(r.dom.twoD.hidden, false);
});

test("enable swaps 2D for 3D, draws the CURRENT sim snapshot, and disable restores 2D and frees the view", async () => {
  const r = rig();
  r.ctl.startMatch({ offer: true });
  assert.equal(await r.ctl.enable(), true);
  assert.equal(r.dom.host.hidden, false);
  assert.equal(r.dom.twoD.hidden, true);
  assert.equal(r.dom.button.attrs["aria-pressed"], "true");
  assert.equal(r.stub.rendered.length, 1, "the live position is drawn at once");
  r.ctl.disable();
  assert.equal(r.dom.twoD.hidden, false);
  assert.equal(r.dom.host.hidden, true);
  assert.equal(r.stub.disposed, 1);
  assert.equal(r.frames.length, 0, "the frame loop is cancelled");
});

test("the real event feed plays through: a possession boundary flushes, beats reach the 3D view", async () => {
  const r = rig();
  r.ctl.startMatch({ offer: true });
  await r.ctl.enable();
  const { rawEvents, domainEvents } = buildCannedFeed();
  const all = [...rawEvents.map((e) => ({ raw: true, e })), ...domainEvents.map((e) => ({ raw: false, e }))]
    .sort((a, b) => (b.e.snapshot?.clock ?? b.e.clock) - (a.e.snapshot?.clock ?? a.e.clock));
  // Up to and including possession 2's start (clock 690): that boundary closes possession 1 and flushes it. (Feeding the
  // whole game with no frame in between would let each later flush compress the earlier one, which a real match never does.)
  const before = r.stub.rendered.length;
  for (const { raw, e } of all.filter((x) => (x.e.snapshot?.clock ?? x.e.clock) >= 690)) (raw ? r.ctl.feedRaw(e) : r.ctl.feedDerived(e));
  for (let i = 0; i < 6; i++) r.runFrame(); // the first beat of a loaded play is applied at load; later beats follow the clock
  assert.ok(r.stub.rendered.length > before || r.stub.shots.length > 0, "a choreographed beat reached the 3D view");
});

test("pause is read from the sim, not pushed: a paused sim freezes the 3D playback", async () => {
  const r = rig();
  r.ctl.startMatch({ offer: true });
  await r.ctl.enable();
  r.sim.paused = true;
  r.runFrame();
  // the frame loop must still be alive so resume works
  assert.equal(r.frames.length, 1);
  r.sim.paused = false;
  assert.equal(r.runFrame(), true);
});

test("no WebGL: stays on 2D with a note, button reset, no throw, and the choice is not remembered", async () => {
  const r = rig({ failCreate: true });
  r.ctl.startMatch({ offer: true });
  assert.equal(await r.ctl.enable(), false);
  assert.equal(r.ctl.active, false);
  assert.equal(r.dom.twoD.hidden, false);
  assert.equal(r.dom.note.hidden, false);
  assert.ok(r.dom.note.textContent.length > 0);
  r.ctl.startMatch({ offer: true });
  assert.equal(r.ctl.active, false, "a device that cannot do 3D is not retried every match");
});

test("a 3D failure mid-match drops back to 2D instead of freezing the court", async () => {
  const r = rig();
  r.ctl.startMatch({ offer: true });
  await r.ctl.enable();
  r.sim = { get paused() { throw new Error("boom"); } };
  r.runFrame();
  assert.equal(r.ctl.active, false);
  assert.equal(r.dom.twoD.hidden, false);
  assert.equal(r.stub.disposed, 1);
});

test("the player's 3D choice carries into the next Gold match; stop() releases the view", async () => {
  const r = rig();
  r.ctl.startMatch({ offer: true });
  await r.ctl.enable();
  r.ctl.stop();
  assert.equal(r.ctl.active, false);
  assert.equal(r.stub.disposed, 1);
  r.ctl.startMatch({ offer: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(r.ctl.active, true, "3D comes back for the next match");
});

test("leaving the game while WebGL is still loading does not leak a view", async () => {
  const r = rig();
  r.ctl.startMatch({ offer: true });
  const opening = r.ctl.enable();
  r.ctl.stop();
  assert.equal(await opening, false);
  assert.equal(r.stub.disposed, 1);
  assert.equal(r.ctl.active, false);
});
