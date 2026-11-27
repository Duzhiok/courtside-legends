// B135 follow-up (4): the Training Center 1s countdown timer used to keep
// ticking after the player left the screen by any path other than the back
// button (Escape / top-left back go through handleBack -> goBack, which has
// no training case and never calls dispose()). Screens are hidden by dropping
// .active, never removed from the DOM, so tick()'s [data-tc-slots] guard never
// fired off-screen and the interval ran until the next open() or a refresh.
// The fix: tick() stops its own interval on the first tick after the screen
// went inactive. Fake timers make "the interval was cleared" observable;
// a fake DOM stands in for the screen root.
import test from "node:test";
import assert from "node:assert/strict";
import { createTrainingScreen } from "../js/ui/trainingView.js";

globalThis.CSS = { escape: (s) => String(s) };

// --- fake timers: nothing ticks unless the test fires it ---
let nextTimerId = 0;
const liveTimers = new Map();
const clearedTimerIds = [];
globalThis.setInterval = (cb) => {
  const id = ++nextTimerId;
  liveTimers.set(id, cb);
  return id;
};
globalThis.clearInterval = (id) => {
  if (id == null) return; // open() clears the initial null timer: a no-op, as in a browser
  clearedTimerIds.push(id);
  liveTimers.delete(id);
};
const fireTimer = (id) => liveTimers.get(id)?.();
const resetTimers = () => {
  liveTimers.clear();
  clearedTimerIds.length = 0;
  nextTimerId = 0;
};

// --- minimal fake DOM ---
function fakeEl() {
  const el = {
    style: {},
    _text: "",
    _html: "",
    writes: 0,
    classNames: new Set(),
    dataset: {},
    addEventListener() {},
    contains() { return true; },
    matches() { return false; },
    querySelector() { return fakeEl(); },
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    set innerHTML(v) { this._html = v; this.writes += 1; },
    get innerHTML() { return this._html; },
  };
  el.classList = {
    add: (...names) => names.forEach((n) => el.classNames.add(n)),
    remove: (...names) => names.forEach((n) => el.classNames.delete(n)),
    contains: (name) => el.classNames.has(name),
  };
  return el;
}

// One active session (half done at now=50000) so a live tick has a bar/ETA to update.
const SESSION = {
  id: "s1", playerId: "p1", campId: "shooting", attr: "three",
  durationId: "fullDay", startedAt: 0, completesAt: 100000, cost: 60, xp: 32,
};
const account = {
  playerIds: [], gold: 100,
  training: { sessions: [SESSION], log: [], seq: 1 },
};

function mountScreen() {
  const slotsEl = fakeEl();
  const goldEl = fakeEl();
  const logEl = fakeEl();
  const formEl = fakeEl();
  const toastEl = fakeEl();
  const barEl = fakeEl();
  const etaEl = fakeEl();
  const sessionEl = fakeEl();
  sessionEl.querySelector = (sel) => (sel.includes("tc-bar") ? barEl : etaEl);
  const root = fakeEl();
  root.classList.add("active");
  root.querySelector = (sel) => {
    if (sel === "[data-tc-slots]") return slotsEl;
    if (sel === "[data-tc-gold]") return goldEl;
    if (sel === "[data-tc-log]") return logEl;
    if (sel === "[data-tc-form]") return formEl;
    if (sel === "[data-tc-toast]") return toastEl;
    if (sel.startsWith("[data-session=")) return sessionEl;
    return fakeEl();
  };
  const screen = createTrainingScreen({
    root,
    getAccount: () => account,
    pool: () => [],
    getLang: () => "zh",
    now: () => 50000,
  });
  return { root, screen, slotsEl, barEl, etaEl };
}

test("tick keeps the timer alive while the training screen is active", () => {
  resetTimers();
  const { root, screen, barEl, etaEl } = mountScreen();
  assert.equal(root.classList.contains("active"), true);
  screen.open();
  assert.equal(liveTimers.size, 1);
  const [timerId] = [...liveTimers.keys()];
  fireTimer(timerId);
  fireTimer(timerId);
  assert.deepEqual(clearedTimerIds, [], "no clear while the screen is active");
  assert.equal(barEl.style.width, "50%", "live tick still updates the countdown bar");
  assert.match(etaEl.textContent, /50%/, "live tick still updates the ETA text");
  screen.dispose();
  assert.deepEqual(clearedTimerIds, [timerId], "the back-button path still stops it eagerly");
});

test("leaving without dispose() stops the timer on the next tick", () => {
  resetTimers();
  const { root, screen, slotsEl } = mountScreen();
  screen.open();
  assert.equal(liveTimers.size, 1);
  const [timerId] = [...liveTimers.keys()];
  const writesBefore = slotsEl.writes;
  // Escape / top-left back: handleBack has no training case, so the screen
  // just loses .active and nobody calls dispose().
  root.classList.remove("active");
  fireTimer(timerId);
  assert.deepEqual(clearedTimerIds, [timerId], "the first off-screen tick clears the interval");
  assert.equal(liveTimers.size, 0, "the interval is gone, so tick cannot fire again");
  assert.equal(slotsEl.writes, writesBefore, "the off-screen tick touches nothing");
});

test("re-opening after a self-stop restarts the timer", () => {
  resetTimers();
  const { root, screen } = mountScreen();
  screen.open();
  const [firstId] = [...liveTimers.keys()];
  root.classList.remove("active");
  fireTimer(firstId);
  assert.deepEqual(clearedTimerIds, [firstId]);
  root.classList.add("active");
  screen.open();
  assert.equal(liveTimers.size, 1);
  const [secondId] = [...liveTimers.keys()];
  assert.notEqual(secondId, firstId, "a fresh interval, not the stopped one");
  fireTimer(secondId);
  assert.deepEqual(clearedTimerIds, [firstId], "no spurious stop while active again");
  screen.dispose();
});
