// P0 data integrity: a device-wide save slot holding ANOTHER account's save is read-only for everyone else.
// Hiding a save (saveVisibility "other") is not protecting it -- these tests pin the storage writers themselves.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { hiredRoot } from "./helpers/careerFixtures.js";
import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY } from "../js/data/accountKeys.js";
import {
  ForeignSaveError, OWNERS_KEY, _resetOwnershipForTests, careerSig, claimSave, foreignOwnerOf, saveVisibility,
  stampLegacySaves,
} from "../js/data/saveOwnership.js";
import {
  ROOT_SAVE_KEY, clearRootSave, deleteCareerSave, migrateLegacySaves, purgeOrphanedLegacySaves, readRootSave,
  writeRootSave,
} from "../js/data/saveRoot.js";
import { clearSave, peekSave, writeSave } from "../js/data/savegame.js";
import { clearSeasonSave, saveSeason } from "../js/engine/season.js";

const SEASON_KEY = "cls_season_v1";
const SESSION_KEY = "cls_savegame_v1";

/** A device with real accounts. `as(id)` signs in (null = guest). Uses the global localStorage too. */
function device(...accounts) {
  _resetOwnershipForTests();
  const storage = createMemoryStorage({ [ACCOUNTS_KEY]: JSON.stringify({ accounts: accounts.map((id) => ({ id })) }) });
  globalThis.localStorage = storage;
  const as = (id) => (id ? storage.setItem(ACTIVE_ACCOUNT_KEY, id) : storage.removeItem(ACTIVE_ACCOUNT_KEY));
  const deleteAccount = (id) => {
    const store = JSON.parse(storage.getItem(ACCOUNTS_KEY));
    store.accounts = store.accounts.filter((a) => a.id !== id);
    storage.setItem(ACCOUNTS_KEY, JSON.stringify(store));
  };
  return { storage, as, deleteAccount, boot: () => stampLegacySaves({}, storage) };
}
const owners = (storage) => JSON.parse(storage.getItem(OWNERS_KEY) || "{}");

test("career: B can neither replace, clear nor delete A's career; A's save and owner stay intact", () => {
  const { storage, as, boot } = device("acc-a", "acc-b");
  as("acc-a");
  boot();
  const mine = hiredRoot(60);
  writeRootSave(mine, storage);
  const before = storage.getItem(ROOT_SAVE_KEY);
  as("acc-b");
  assert.throws(() => writeRootSave(hiredRoot(30), storage), ForeignSaveError);
  assert.throws(() => clearRootSave(storage), ForeignSaveError);
  assert.throws(() => deleteCareerSave(storage), ForeignSaveError);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), before, "A's career is byte-for-byte untouched");
  assert.equal(owners(storage).career.owner, "acc-a");
  as("acc-a");
  writeRootSave(mine, storage); // the owner keeps playing as before
  assert.equal(saveVisibility("career", careerSig(mine), storage), "mine");
});

test("career: guest and accounts protect each other the same way", () => {
  const { storage, as, boot } = device("acc-a");
  as(null);
  boot();
  writeRootSave(hiredRoot(60), storage);
  as("acc-a");
  assert.throws(() => writeRootSave(hiredRoot(30), storage), ForeignSaveError, "an account can't overwrite the guest's career");
  as(null);
  clearRootSave(storage);
  as("acc-a");
  writeRootSave(hiredRoot(30), storage);
  as(null);
  assert.throws(() => writeRootSave(hiredRoot(60), storage), ForeignSaveError, "the guest can't overwrite an account's career");
});

test("continuing the SAME unassociated career still saves (a new one over it is refused: saveUnlinkedGuard.test.js)", () => {
  const { storage, as, boot } = device("acc-b");
  writeRootSave(hiredRoot(60), storage); // pre-ownership save
  as("acc-b");
  stampLegacySaves({ career: readRootSave(storage) }, storage);
  assert.equal(foreignOwnerOf("career", storage), null);
  assert.doesNotThrow(() => writeRootSave(hiredRoot(30), storage)); // same storyId: playing on, not overwriting
  assert.equal(owners(storage).career.owner, null, "continuing it is not claiming it");
  boot();
});

test("a deleted owner can't lock the slot forever: its save turns unassociated and claimable", () => {
  const { storage, as, deleteAccount, boot } = device("acc-a", "acc-b");
  as("acc-a");
  boot();
  const root = hiredRoot(60);
  writeRootSave(root, storage);
  as("acc-b");
  assert.equal(saveVisibility("career", careerSig(root), storage), "other");
  deleteAccount("acc-a");
  assert.equal(saveVisibility("career", careerSig(root), storage), "unassociated");
  assert.equal(foreignOwnerOf("career", storage), null);
  assert.deepEqual(claimSave("career", careerSig(root), storage), { ok: true });
  assert.equal(saveVisibility("career", careerSig(root), storage), "mine");
});

test("a malformed account store reads as 'no accounts' (like account.js), so it can't lock a slot forever", () => {
  const { storage, as, boot } = device("acc-a", "acc-b");
  as("acc-a");
  boot();
  writeRootSave(hiredRoot(60), storage);
  as("acc-b");
  storage.setItem(ACCOUNTS_KEY, "{not json");
  assert.equal(foreignOwnerOf("career", storage), null);
});

test("session: B's autosave and match-end cleanup never touch A's unfinished game", () => {
  const { storage, as, boot } = device("acc-a", "acc-b");
  as("acc-a");
  boot();
  writeSave({ screen: "game", label: "A's game" });
  const before = storage.getItem(SESSION_KEY);
  as("acc-b");
  const result = writeSave({ screen: "game", label: "B's game" });
  assert.equal(result.blocked, "foreign");
  assert.equal(result.saveFailed, true, "callers that only check saveFailed still see a failure");
  assert.equal(clearSave(), false);
  assert.equal(storage.getItem(SESSION_KEY), before);
  as("acc-a");
  assert.equal(peekSave().label, "A's game");
  clearSave();
  assert.equal(storage.getItem(SESSION_KEY), null, "the owner can still clear it");
});

test("quick season: B can't overwrite or clear A's; the career compat mirror never claims the slot", () => {
  const { storage, as, boot } = device("acc-a", "acc-b");
  as("acc-a");
  boot();
  assert.equal(saveSeason({ v: 2, label: "A" }), true);
  assert.equal(owners(storage).season.owner, "acc-a");
  as("acc-b");
  assert.equal(saveSeason({ v: 2, label: "B" }), false);
  assert.equal(saveSeason({ v: 2, label: "B mirror" }, { mirror: true }), false, "a mirror respects the lock too");
  assert.equal(clearSeasonSave(), false);
  assert.equal(JSON.parse(storage.getItem(SEASON_KEY)).label, "A");
  as("acc-a");
  assert.notEqual(clearSeasonSave(), false);
  assert.equal(owners(storage).season, undefined);
  as("acc-b");
  assert.equal(saveSeason({ v: 2, label: "B mirror" }, { mirror: true }), true);
  assert.deepEqual(owners(storage).season, { owner: null, sig: "season", mirror: true },
    "the mirror is tagged as the long career's copy, never as a claim on the slot");
});

test("deleting a career or freeing quota never drops ANOTHER account's quick season", () => {
  const { storage, as, boot } = device("acc-a", "acc-b");
  as("acc-b");
  boot();
  saveSeason({ v: 2, label: "B" });
  as("acc-a");
  writeRootSave(hiredRoot(60), storage);
  assert.equal(purgeOrphanedLegacySaves(storage), 0);
  deleteCareerSave(storage);
  assert.equal(JSON.parse(storage.getItem(SEASON_KEY)).label, "B");
  assert.equal(owners(storage).season.owner, "acc-b");
});

test("boot migration of a quick season into the root carries its owner along", () => {
  const { storage, as, boot } = device("acc-a", "acc-b");
  as("acc-b");
  boot();
  const season = hiredRoot(60).leagueCareer.season;
  saveSeason({ ...season, v: 2 });
  _resetOwnershipForTests(); // a fresh page load: migration runs before the boot stamp
  as("acc-a");
  const migrated = migrateLegacySaves(storage);
  assert.ok(migrated?.root, "the quick season became the root save");
  stampLegacySaves({ career: migrated.root }, storage);
  assert.equal(owners(storage).career.owner, "acc-b");
  assert.equal(saveVisibility("career", careerSig(migrated.root), storage), "other", "A doesn't get B's season");
  assert.throws(() => writeRootSave(hiredRoot(30), storage), ForeignSaveError);
});
