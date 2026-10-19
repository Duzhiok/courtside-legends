import test from "node:test";
import assert from "node:assert/strict";
import { createGameStore } from "../js/core/gameStore.js";

test("store publishes replacement state and metadata", () => {
  const store = createGameStore({ count: 0 });
  const seen = [];
  const unsubscribe = store.subscribe((next, prev, meta) => seen.push({ next, prev, meta }));

  store.update((state) => ({ ...state, count: state.count + 1 }), { type: "increment" });

  assert.equal(store.getState().count, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].prev.count, 0);
  assert.deepEqual(seen[0].meta, { type: "increment" });
  unsubscribe();
  store.replaceState({ count: 2 });
  assert.equal(seen.length, 1);
});

test("store rejects updater functions that return the same object", () => {
  const state = { count: 0 };
  const store = createGameStore(state);
  assert.throws(() => store.update((current) => current), /new root object/);
});
