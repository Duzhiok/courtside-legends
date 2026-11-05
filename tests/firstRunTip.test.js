import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAY_NOW_TIP_KEY,
  markTipSeen,
  resetTipSession,
  shouldShowTip,
} from "../js/ui/firstRunTip.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
}

const brokenStorage = {
  getItem() { throw new Error("denied"); },
  setItem() { throw new Error("quota"); },
};

test("a fresh visitor sees the tip; after dismissing, never again (even after reload)", () => {
  resetTipSession();
  const storage = memoryStorage();
  assert.equal(shouldShowTip(storage, PLAY_NOW_TIP_KEY), true);
  markTipSeen(storage, PLAY_NOW_TIP_KEY);
  assert.equal(shouldShowTip(storage, PLAY_NOW_TIP_KEY), false);
  resetTipSession(); // simulate a page reload: only storage survives
  assert.equal(shouldShowTip(storage, PLAY_NOW_TIP_KEY), false);
});

test("missing storage counts as 'not seen yet' and never throws", () => {
  resetTipSession();
  assert.equal(shouldShowTip(undefined, PLAY_NOW_TIP_KEY), true);
  assert.doesNotThrow(() => markTipSeen(undefined, PLAY_NOW_TIP_KEY));
  assert.equal(shouldShowTip(undefined, PLAY_NOW_TIP_KEY), false);
});

test("throwing storage: dismissal still sticks for this session, no crash", () => {
  resetTipSession();
  assert.equal(shouldShowTip(brokenStorage, PLAY_NOW_TIP_KEY), true);
  assert.doesNotThrow(() => markTipSeen(brokenStorage, PLAY_NOW_TIP_KEY));
  assert.equal(shouldShowTip(brokenStorage, PLAY_NOW_TIP_KEY), false);
});

test("tips are independent by key", () => {
  resetTipSession();
  const storage = memoryStorage();
  markTipSeen(storage, PLAY_NOW_TIP_KEY);
  assert.equal(shouldShowTip(storage, "cls_tip_other_v1"), true);
});
