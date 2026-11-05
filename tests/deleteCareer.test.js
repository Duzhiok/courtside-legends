// B36: "Delete current career" must remove the career from the root save AND the legacy season key,
// and leave everything that isn't the career alone.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOT_SAVE_KEY,
  createRootState,
  deleteCareerSave,
  readRootSave,
  writeRootSave,
} from "../js/data/saveRoot.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

const LEGACY_SEASON = "cls_season_v1";

test("deleting removes the root career and the legacy season key; a reload finds nothing", () => {
  const storage = createMemoryStorage({ [LEGACY_SEASON]: "{\"old\":true}" });
  writeRootSave(createRootState({ activeMode: "franchise" }), storage);
  deleteCareerSave(storage);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), null);
  assert.equal(storage.getItem(LEGACY_SEASON), null);
  assert.equal(readRootSave(storage), null);
});

test("a root that holds a profile keeps the profile but loses coach, story and live game", () => {
  const storage = createMemoryStorage();
  const profile = { accountId: "acc-1", settings: { lang: "en" }, accessibility: {} };
  writeRootSave(createRootState({ profile, activeMode: "franchise" }), storage);
  deleteCareerSave(storage);
  const after = readRootSave(storage);
  assert.deepEqual(after.profile, profile);
  assert.equal(after.leagueCareer, null);
  assert.equal(after.story, null);
  assert.equal(after.liveGame, null);
  assert.equal(after.activeMode, null);
});

test("unrelated keys (accounts, collections, the live-match autosave) are untouched", () => {
  const storage = createMemoryStorage({
    cls_accounts_v1: "ACCOUNTS",
    cls_collection_v1: "CARDS",
    cls_savegame_v1: "LIVE",
  });
  writeRootSave(createRootState(), storage);
  deleteCareerSave(storage);
  assert.equal(storage.getItem("cls_accounts_v1"), "ACCOUNTS");
  assert.equal(storage.getItem("cls_collection_v1"), "CARDS");
  assert.equal(storage.getItem("cls_savegame_v1"), "LIVE");
});

test("deleting twice, or with nothing saved, is a harmless no-op", () => {
  const storage = createMemoryStorage();
  assert.doesNotThrow(() => deleteCareerSave(storage));
  assert.doesNotThrow(() => deleteCareerSave(storage));
  assert.equal(readRootSave(storage), null);
});
