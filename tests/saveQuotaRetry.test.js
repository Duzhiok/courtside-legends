// saveLongCareer is meant to retry a failed save once after freeing orphaned legacy saves. It checked
// `error.name === "QuotaExceededError"`, but writeRootSave throws a plain Error, so the retry never ran.
// The retry now lives in saveRoot.js (where node can reach it) and keys off a typed error.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOT_SAVE_KEY,
  StorageWriteError,
  createRootState,
  writeRootSave,
  writeRootSaveFreeingOrphans,
} from "../js/data/saveRoot.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

const LEGACY_SEASON = "cls_season_v1";
const LEGACY_GAME = "cls_savegame_v1";

/** A localStorage that throws a real QuotaExceededError once the total stored size passes `limit`. */
function limitedStorage(limit, seed = {}) {
  const base = createMemoryStorage(seed);
  const used = () => Object.values(base.dump()).reduce((sum, value) => sum + value.length, 0);
  return {
    ...base,
    setItem(key, value) {
      const current = base.getItem(key);
      const next = used() - (current === null ? 0 : current.length) + String(value).length;
      if (next > limit) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      base.setItem(key, value);
    },
  };
}

const rootSize = () => JSON.stringify(createRootState()).length;

test("a failed write throws a typed StorageWriteError that keeps the browser's own error as its cause", () => {
  const storage = limitedStorage(10);
  assert.throws(() => writeRootSave(createRootState(), storage), (error) => {
    assert.ok(error instanceof StorageWriteError);
    assert.equal(error.name, "StorageWriteError");
    assert.match(error.message, /storage quota exceeded/);
    assert.equal(error.cause?.name, "QuotaExceededError");
    return true;
  });
});

test("a save the game can't validate is NOT a storage error (it stays a schema bug)", () => {
  const storage = limitedStorage(10_000_000);
  assert.throws(() => writeRootSave({ not: "a root" }, storage), (error) => {
    assert.ok(!(error instanceof StorageWriteError));
    assert.match(error.message, /invalid root save/);
    return true;
  });
});

test("full storage + orphaned legacy saves: the retry frees them and the save lands", () => {
  const size = rootSize();
  // Room for the root, but the two legacy keys are hogging it.
  const storage = limitedStorage(size * 3, {
    [LEGACY_SEASON]: "x".repeat(size * 2),
    [LEGACY_GAME]: "y".repeat(size),
  });
  assert.throws(() => writeRootSave(createRootState(), storage), StorageWriteError, "precondition: it really is full");
  const persisted = writeRootSaveFreeingOrphans(createRootState(), storage);
  assert.ok(persisted.savedAt, "returns the persisted root, like writeRootSave");
  assert.ok(storage.getItem(ROOT_SAVE_KEY), "the career is now saved");
  assert.equal(storage.getItem(LEGACY_SEASON), null, "the orphaned legacy saves were freed");
  assert.equal(storage.getItem(LEGACY_GAME), null);
});

test("full storage with nothing to free: one honest failure, the original error, no second attempt", () => {
  let writes = 0;
  const storage = limitedStorage(10);
  const counting = { ...storage, setItem(key, value) { writes += 1; storage.setItem(key, value); } };
  assert.throws(() => writeRootSaveFreeingOrphans(createRootState(), counting), StorageWriteError);
  const afterFirst = writes;
  assert.ok(afterFirst > 0);
  // nothing was freed, so nothing is retried: a second call makes the same number of writes, not double
  assert.throws(() => writeRootSaveFreeingOrphans(createRootState(), counting), StorageWriteError);
  assert.equal(writes, afterFirst * 2);
});

test("legacy saves freed but it still doesn't fit: the second failure surfaces", () => {
  const storage = limitedStorage(10, { [LEGACY_SEASON]: "x" });
  assert.throws(() => writeRootSaveFreeingOrphans(createRootState(), storage), StorageWriteError);
  assert.equal(storage.getItem(LEGACY_SEASON), null, "they were freed -- that part is not undone");
});

test("a schema bug never deletes the player's legacy saves", () => {
  const storage = limitedStorage(10_000_000, { [LEGACY_SEASON]: "keep me", [LEGACY_GAME]: "keep me too" });
  assert.throws(() => writeRootSaveFreeingOrphans({ not: "a root" }, storage), /invalid root save/);
  assert.equal(storage.getItem(LEGACY_SEASON), "keep me");
  assert.equal(storage.getItem(LEGACY_GAME), "keep me too");
});

test("when storage has room, it is a plain write: legacy saves are left alone", () => {
  const storage = limitedStorage(10_000_000, { [LEGACY_SEASON]: "still here" });
  writeRootSaveFreeingOrphans(createRootState(), storage);
  assert.ok(storage.getItem(ROOT_SAVE_KEY));
  assert.equal(storage.getItem(LEGACY_SEASON), "still here");
});
