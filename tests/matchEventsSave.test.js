import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { peekSave, writeSave } from "../js/data/savegame.js";
import { createMatchEventState, exportMatchEventState, restoreMatchEventState } from "../js/engine/matchEvents.js";

// Found by the browser smoke (scripts/qa/match-events.mjs): writeSave copies a whitelist of
// fields, so the In-Match Events state never reached localStorage and a reload re-fired events.
test("session save keeps the In-Match Events state (fired ids + open decision) through writeSave", () => {
  globalThis.localStorage = createMemoryStorage();
  const state = {
    ...createMatchEventState({ seed: "s" }),
    boundaries: 40,
    fired: ["takeover:a:h1", "takeover:b:h1"],
    history: [{ id: "takeover:a:h1", family: "takeover", choiceId: "feed", auto: false }],
    pending: { id: "takeover:b:h1", family: "takeover", choices: [{ id: "feed" }, { id: "ignore" }], defaultChoiceId: "ignore", effects: { feed: [{ kind: "setOffenseFocus", playerId: "b" }], ignore: [] } },
  };
  const written = writeSave({ screen: "game", label: "x", app: {}, sim: { quarter: 2 }, feed: [], matchEvents: exportMatchEventState(state) });
  assert.ok(!written.saveFailed && !written.blocked);
  const back = restoreMatchEventState(peekSave().matchEvents, { seed: "other" });
  assert.deepEqual(back.fired, state.fired);
  assert.equal(back.pending.id, "takeover:b:h1");
  assert.equal(back.history[0].id, "takeover:a:h1");
  assert.equal(back.seed, "s", "the saved seed wins over a new one");
});

test("a save without events (older saves, menus) has no matchEvents key and restores fresh", () => {
  globalThis.localStorage = createMemoryStorage();
  writeSave({ screen: "draft", label: "x", app: {}, sim: null, feed: [], matchEvents: null });
  assert.equal("matchEvents" in peekSave(), false);
  assert.deepEqual(restoreMatchEventState(peekSave().matchEvents, { seed: "n" }), createMatchEventState({ seed: "n" }));
});
