import test from "node:test";
import assert from "node:assert/strict";
import {
  FREEZE_DIAG_CAP,
  FREEZE_DIAG_KEY,
  actionLabelFromTarget,
  createFreezeDiag,
  freezeRecord,
  freezeShouldPersist,
  pushFreezeRecord,
  readFreezeDiag,
  writeFreezeDiag,
} from "../js/core/freezeDiag.js";

const fakeStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    _map: m,
  };
};

test("freezeRecord: rounds the stall and keeps screen + action", () => {
  const rec = freezeRecord({ at: 1700000000000, blockedMs: 1234.6, screen: "season", action: "#btn-rot-save" });
  assert.deepEqual(rec, { at: 1700000000000, blockedMs: 1235, screen: "season", action: "#btn-rot-save" });
  assert.equal(freezeRecord({ blockedMs: 5 }).screen, null);
});

test("freezeShouldPersist: only real stalls (>= 1s) are persisted", () => {
  assert.equal(freezeShouldPersist(999), false);
  assert.equal(freezeShouldPersist(1000), true);
  assert.equal(freezeShouldPersist(5000), true);
});

test("pushFreezeRecord: newest last, capped", () => {
  let list = [];
  for (let i = 0; i < FREEZE_DIAG_CAP + 3; i++) list = pushFreezeRecord(list, { n: i });
  assert.equal(list.length, FREEZE_DIAG_CAP);
  assert.equal(list[0].n, 3);
  assert.equal(list.at(-1).n, FREEZE_DIAG_CAP + 2);
});

test("read/writeFreezeDiag: round-trips, tolerates junk and throwing storage", () => {
  const storage = fakeStorage();
  assert.deepEqual(readFreezeDiag(storage), { state: null, stalls: [] });
  assert.equal(writeFreezeDiag(storage, { state: { screen: "season", action: "x", at: 1 }, stalls: [{ blockedMs: 2000 }] }), true);
  assert.deepEqual(JSON.parse(storage._map.get(FREEZE_DIAG_KEY)).stalls, [{ blockedMs: 2000 }]);
  storage.setItem(FREEZE_DIAG_KEY, "not json{");
  assert.deepEqual(readFreezeDiag(storage), { state: null, stalls: [] });
  const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.deepEqual(readFreezeDiag(bad), { state: null, stalls: [] });
  assert.equal(writeFreezeDiag(bad, {}), false);
});

test("actionLabelFromTarget: id wins, then data-action, then text, then tag", () => {
  assert.equal(actionLabelFromTarget({ id: "btn-rot-save" }), "#btn-rot-save");
  assert.equal(actionLabelFromTarget({ dataset: { action: "save-rotation" }, getAttribute: () => null, textContent: "Save" }), "save-rotation");
  assert.equal(actionLabelFromTarget({ dataset: {}, getAttribute: () => null, textContent: "  保存默认轮换  ", tagName: "BUTTON" }), "保存默认轮换");
  assert.equal(actionLabelFromTarget({ dataset: {}, getAttribute: () => null, textContent: " ", tagName: "DIV" }), "div");
  assert.equal(actionLabelFromTarget(null), null);
});

test("createFreezeDiag: noteScreen/noteAction persist last-known state; handleStall records + persists only real stalls", () => {
  const storage = fakeStorage();
  const diag = createFreezeDiag({ now: () => 1700000000000, storage });
  diag.noteScreen("season");
  diag.noteAction("#btn-rot-save");
  assert.deepEqual(readFreezeDiag(storage).state, { screen: "season", action: "#btn-rot-save", at: 1700000000000 });
  const small = diag.handleStall(400);
  assert.equal(small.blockedMs, 400);
  assert.equal(readFreezeDiag(storage).stalls.length, 0);
  const big = diag.handleStall(2500);
  assert.equal(big.screen, "season");
  assert.equal(big.action, "#btn-rot-save");
  assert.equal(readFreezeDiag(storage).stalls.length, 1);
  assert.deepEqual(diag.state().ring.map((r) => r.blockedMs), [400, 2500]);
});

test("createFreezeDiag heartbeat: a late tick records the stall; on-time and hidden ticks do not", () => {
  const storage = fakeStorage();
  let tick = null;
  let nowMs = 0;
  const documentRef = { visibilityState: "visible", addEventListener: () => {} };
  const diag = createFreezeDiag({
    now: () => 1700000000000,
    perfNow: () => nowMs,
    storage,
    documentRef,
    windowRef: {},
    setIntervalFn: (fn) => { tick = fn; return 1; },
    PerformanceObserverCtor: null,
  });
  diag.noteScreen("season");
  diag.start();
  nowMs = 600;
  tick();
  assert.equal(readFreezeDiag(storage).stalls.length, 0);
  nowMs = 3600; // 3000ms late
  tick();
  assert.equal(readFreezeDiag(storage).stalls.length, 1);
  assert.equal(readFreezeDiag(storage).stalls[0].blockedMs, 2500);
  documentRef.visibilityState = "hidden";
  nowMs = 9000; // 5400ms late but hidden: background throttling, not a freeze
  tick();
  assert.equal(readFreezeDiag(storage).stalls.length, 1);
});

test("createFreezeDiag longtask observer: only entries >= 1s are recorded", () => {
  const storage = fakeStorage();
  let cb = null;
  class FakePO {
    constructor(fn) { cb = fn; }
    observe() {}
  }
  const diag = createFreezeDiag({
    now: () => 1700000000000,
    storage,
    documentRef: { visibilityState: "visible", addEventListener: () => {} },
    windowRef: {},
    setIntervalFn: () => 1,
    PerformanceObserverCtor: FakePO,
  });
  diag.start();
  cb({ getEntries: () => [{ duration: 500 }] });
  assert.equal(readFreezeDiag(storage).stalls.length, 0);
  cb({ getEntries: () => [{ duration: 1800 }] });
  assert.equal(readFreezeDiag(storage).stalls.length, 1);
  assert.equal(readFreezeDiag(storage).stalls[0].blockedMs, 1800);
});

test("createFreezeDiag start: surfaces last session's stalls in the console once", () => {
  const storage = fakeStorage();
  writeFreezeDiag(storage, { state: { screen: "season", action: "#btn-rot-save", at: 1 }, stalls: [{ at: 1, blockedMs: 3000, screen: "season", action: "#btn-rot-save" }] });
  const warned = [];
  const origWarn = console.warn;
  console.warn = (...args) => warned.push(args);
  try {
    const diag = createFreezeDiag({
      now: () => 1700000000000,
      storage,
      documentRef: { visibilityState: "visible", addEventListener: () => {} },
      windowRef: {},
      setIntervalFn: () => 1,
      PerformanceObserverCtor: null,
    });
    diag.start();
  } finally {
    console.warn = origWarn;
  }
  assert.equal(warned.length, 1);
  assert.match(warned[0][0], /last session/);
  assert.equal(warned[0][1].stalls[0].blockedMs, 3000);
});
