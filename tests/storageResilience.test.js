/**
 * Regression for user report #15 ("\u8ddf\u5b58\u50a8\u6709\u5173\u7cfb\u5417" -- a mysterious error, possibly storage-related,
 * with no screenshot/repro available). An audit of every localStorage call site in the codebase
 * found several writes with ZERO error handling, unlike season.js's saveSeason() which already
 * has a quota-retry fallback:
 *   - account.js's saveStore() (backs saveAccount(), which runs on nearly every click: draw a
 *     card, claim a daily task, level up, recycle a card)
 *   - account.js's getActiveAccountId() / setActiveAccountId() (on the app BOOT path)
 *   - savegame.js's writeSave() / clearSave() (the mid-session "continue" autosave)
 *   - season.js's clearSeasonSave()
 *
 * Any of these throwing (quota exceeded, or a browser privacy mode that disables localStorage
 * entirely) would propagate as an uncaught exception straight out of whatever click handler
 * triggered it -- exactly the kind of unexplained crash a player would describe as "some
 * storage-related error" with no further detail. These tests simulate that failure directly and
 * confirm each call site now degrades gracefully instead of throwing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

function throwingStorage() {
  const real = createMemoryStorage();
  return {
    ...real,
    setItem() {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    },
    removeItem() {
      throw new DOMException("Storage is disabled.", "SecurityError");
    },
    getItem() {
      throw new DOMException("Storage is disabled.", "SecurityError");
    },
  };
}

test("account.js: saveAccount() does not throw when localStorage.setItem is broken", async () => {
  globalThis.localStorage = throwingStorage();
  const { saveAccount } = await import("../js/data/account.js?no-throw-save");
  assert.doesNotThrow(() => {
    const result = saveAccount({ id: "acc1", playerIds: [] });
    assert.equal(result.id, "acc1", "still returns the account object, same as the success path");
  });
});

test("account.js: getActiveAccountId()/setActiveAccountId() do not throw when storage is fully disabled", async () => {
  globalThis.localStorage = throwingStorage();
  const { getActiveAccountId, setActiveAccountId } = await import("../js/data/account.js?no-throw-active");
  assert.doesNotThrow(() => {
    assert.equal(getActiveAccountId(), null, "falls back to null instead of crashing app boot");
  });
  assert.doesNotThrow(() => setActiveAccountId("acc1"));
  assert.doesNotThrow(() => setActiveAccountId(null));
});

test("savegame.js: writeSave() does not throw when quota is exceeded, and flags the failure", async () => {
  globalThis.localStorage = throwingStorage();
  const { writeSave } = await import("../js/data/savegame.js?no-throw-write");
  let result;
  assert.doesNotThrow(() => {
    result = writeSave({ screen: "home", app: {} });
  });
  assert.equal(result.saveFailed, true, "callers can tell this particular save did not persist");
  assert.equal(result.bytes, 0);
});

test("savegame.js: clearSave() does not throw when storage is disabled", async () => {
  globalThis.localStorage = throwingStorage();
  const { clearSave } = await import("../js/data/savegame.js?no-throw-clear");
  assert.doesNotThrow(() => clearSave());
});

test("season.js: clearSeasonSave() does not throw when storage is disabled", async () => {
  globalThis.localStorage = throwingStorage();
  const { clearSeasonSave } = await import("../js/engine/season.js?no-throw-season-clear");
  assert.doesNotThrow(() => clearSeasonSave());
});

test("sanity check: the SAME functions still work normally against healthy storage", async () => {
  globalThis.localStorage = createMemoryStorage();
  const { saveAccount, getActiveAccountId, setActiveAccountId } = await import(
    "../js/data/account.js?healthy-account"
  );
  const { writeSave } = await import("../js/data/savegame.js?healthy-savegame");
  saveAccount({ id: "acc1", playerIds: [] });
  setActiveAccountId("acc1");
  assert.equal(getActiveAccountId(), "acc1");
  const result = writeSave({ screen: "home", app: {} });
  assert.equal(result.saveFailed, undefined, "no failure flag on the healthy path");
  assert.ok(result.bytes > 0);
});
