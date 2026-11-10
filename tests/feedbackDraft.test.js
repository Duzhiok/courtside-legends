import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import {
  DRAFT_KEY_PREFIX,
  FEEDBACK_NOTE_MAX,
  clearDraft,
  emptyDraft,
  normalizeDraft,
  readDraft,
  writeDraft,
} from "../js/data/feedbackDraft.js";

test("normalizeDraft keeps good values and repairs bad ones", () => {
  assert.deepEqual(normalizeDraft({ category: "bug", module: "game", stars: 4, note: "x" }), { category: "bug", module: "game", stars: 4, note: "x" });
  assert.deepEqual(normalizeDraft(null), emptyDraft());
  assert.deepEqual(normalizeDraft("nope"), emptyDraft());
  for (const stars of [0, 6, -1, 2.5, "3x", NaN, null]) assert.equal(normalizeDraft({ stars }).stars, 0, String(stars));
  assert.equal(normalizeDraft({ stars: "3" }).stars, 3, "a stored numeric string is still a rating");
  assert.equal(normalizeDraft({ category: "admin" }).category, "suggestion");
  assert.equal(normalizeDraft({ note: 42 }).note, "");
  assert.equal(normalizeDraft({ note: "a".repeat(FEEDBACK_NOTE_MAX + 50) }).note.length, FEEDBACK_NOTE_MAX);
});

test("a draft round-trips and is stored per owner", () => {
  const s = createMemoryStorage();
  assert.equal(writeDraft("acc1", { category: "rating", module: "game", stars: 5, note: "love it" }, s), true);
  assert.deepEqual(readDraft("acc1", s), { category: "rating", module: "game", stars: 5, note: "love it" });
  assert.deepEqual(readDraft("acc2", s), emptyDraft(), "another account on the same device sees nothing");
  assert.deepEqual(readDraft(null, s), emptyDraft(), "guest has its own slot too");
  writeDraft(null, { note: "guest idea" }, s);
  assert.equal(readDraft(undefined, s).note, "guest idea");
  assert.equal(readDraft("acc1", s).note, "love it", "the guest draft did not touch acc1");
});

test("a blank draft removes the key instead of storing noise", () => {
  const s = createMemoryStorage();
  writeDraft("acc1", { note: "hi" }, s);
  assert.ok(s.getItem(`${DRAFT_KEY_PREFIX}acc1`));
  writeDraft("acc1", { category: "bug", stars: 0, note: "   " }, s);
  assert.equal(s.getItem(`${DRAFT_KEY_PREFIX}acc1`), null);
});

test("clearDraft removes only that owner", () => {
  const s = createMemoryStorage();
  writeDraft("a", { note: "1" }, s);
  writeDraft("b", { note: "2" }, s);
  clearDraft("a", s);
  assert.equal(readDraft("a", s).note, "");
  assert.equal(readDraft("b", s).note, "2");
});

test("storage trouble never throws: corrupt data reads as empty, a refused write returns false", () => {
  const s = createMemoryStorage();
  s.setItem(`${DRAFT_KEY_PREFIX}a`, "{not json");
  assert.deepEqual(readDraft("a", s), emptyDraft());
  const full = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
  assert.equal(writeDraft("a", { note: "x" }, full), false);
  assert.doesNotThrow(() => clearDraft("a", { removeItem: () => { throw new Error("denied"); } }));
});
