// P0 data integrity, part 2 (product decision): an UNASSOCIATED save (pre-ownership, or its owner account was
// deleted) is protected too -- only continuing that same save, or an explicit confirmed delete (`release`), may
// replace it. The guest's save is protected from accounts and claimable by them. The career's quick-season compat
// copy is tagged as a mirror and never protected (the real save is the root).
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { hiredRoot } from "./helpers/careerFixtures.js";
import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY } from "../js/data/accountKeys.js";
import {
  ForeignSaveError, OWNERS_KEY, _resetOwnershipForTests, careerSig, claimSave, hiddenFromMe, markSlotResumed,
  saveVisibility, slotLockReason, stampLegacySaves,
} from "../js/data/saveOwnership.js";
import { ROOT_SAVE_KEY, clearRootSave, deleteCareerSave, purgeOrphanedLegacySaves, readRootSave, writeRootSave } from "../js/data/saveRoot.js";
import { clearSave, peekSave, writeSave } from "../js/data/savegame.js";
import { clearSeasonSave, saveSeason } from "../js/engine/season.js";

const SEASON_KEY = "cls_season_v1";
const SESSION_KEY = "cls_savegame_v1";

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
  return { storage, as, deleteAccount };
}
const owners = (storage) => JSON.parse(storage.getItem(OWNERS_KEY) || "{}");
/** A different career (its own storyId), valid for the root validator. */
const otherCareer = (root, tag = "new") => {
  const storyId = `${root.story.storyId}-${tag}`;
  return { ...root, leagueCareer: { ...root.leagueCareer, storyId }, story: { ...root.story, storyId } };
};
/** A pre-ownership career already on the device, then boot (which stamps it unassociated). */
function legacyCareer(storage, as, who) {
  const root = hiredRoot(60);
  writeRootSave(root, storage); // before the boot stamp: not attributed
  as(who);
  stampLegacySaves({ career: readRootSave(storage) }, storage);
  return root;
}

test("unassociated career: a NEW career can't replace it, clear or delete it -- only continuing or a confirmed delete", () => {
  const { storage, as } = device("acc-b");
  const root = legacyCareer(storage, as, "acc-b");
  const before = storage.getItem(ROOT_SAVE_KEY);
  assert.equal(slotLockReason("career", true, { sig: careerSig(otherCareer(root)) }, storage), "unassociated");
  assert.throws(() => writeRootSave(otherCareer(root), storage), (e) => e instanceof ForeignSaveError && e.reason === "unassociated");
  assert.throws(() => clearRootSave(storage), ForeignSaveError);
  assert.throws(() => deleteCareerSave(storage), ForeignSaveError);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), before, "refused writes leave the save byte-identical");
  assert.doesNotThrow(() => writeRootSave(hiredRoot(30), storage), "same storyId = playing on");
  assert.equal(owners(storage).career.owner, null, "continuing never claims it");
  deleteCareerSave(storage, { release: true });
  assert.equal(readRootSave(storage)?.leagueCareer ?? null, null, "the explicit delete removes the career");
  assert.equal(owners(storage).career, undefined);
  assert.doesNotThrow(() => writeRootSave(otherCareer(root), storage), "after the release the slot is free");
  assert.equal(owners(storage).career.owner, "acc-b");
});

test("a deleted owner's career turns unassociated: protected from everyone, claimable, then normal", () => {
  const { storage, as, deleteAccount } = device("acc-a", "acc-b");
  as("acc-a");
  stampLegacySaves({}, storage);
  const root = hiredRoot(60);
  writeRootSave(root, storage);
  deleteAccount("acc-a");
  as("acc-b");
  assert.equal(saveVisibility("career", careerSig(root), storage), "unassociated");
  assert.throws(() => writeRootSave(otherCareer(root), storage), (e) => e.reason === "unassociated");
  assert.deepEqual(claimSave("career", careerSig(root), storage), { ok: true });
  assert.doesNotThrow(() => writeRootSave(otherCareer(root), storage), "claimed: B's own slot now");
});

test("the guest's save: hidden from and protected against accounts, but claimable by one (explicitly)", () => {
  const { storage, as } = device("acc-a");
  as(null);
  stampLegacySaves({}, storage);
  const root = hiredRoot(60);
  writeRootSave(root, storage);
  as("acc-a");
  const state = saveVisibility("career", careerSig(root), storage);
  assert.equal(state, "guest");
  assert.equal(hiddenFromMe(state), true, "never resumable by the account before it claims");
  assert.throws(() => writeRootSave(otherCareer(root), storage), (e) => e.reason === "other");
  assert.deepEqual(claimSave("career", careerSig(root), storage), { ok: true });
  assert.equal(saveVisibility("career", careerSig(root), storage), "mine");
  as(null);
  assert.equal(saveVisibility("career", careerSig(root), storage), "other", "claimed: the guest no longer has it");
  assert.throws(() => writeRootSave(otherCareer(root), storage), ForeignSaveError);
});

test("another ACCOUNT's save is never claimable (only the guest's and unassociated ones are)", () => {
  const { storage, as } = device("acc-a", "acc-b");
  as("acc-a");
  stampLegacySaves({}, storage);
  const root = hiredRoot(60);
  writeRootSave(root, storage);
  as("acc-b");
  assert.deepEqual(claimSave("career", careerSig(root), storage), { ok: false, reason: "claimed" });
});

test("unassociated unfinished game: a new game can't autosave or clean up over it; resuming or a confirmed discard can", () => {
  const { storage, as } = device("acc-b");
  storage.setItem(SESSION_KEY, JSON.stringify({ v: 1, screen: "game", label: "legacy game" }));
  as("acc-b");
  stampLegacySaves({ session: peekSave() }, storage);
  const before = storage.getItem(SESSION_KEY);
  assert.equal(writeSave({ screen: "game", label: "new game" }).blocked, "foreign");
  assert.equal(clearSave(), false);
  assert.equal(storage.getItem(SESSION_KEY), before);
  markSlotResumed("session");
  const resumedWrite = writeSave({ screen: "game", label: "legacy game, continued" });
  assert.ok(!resumedWrite.saveFailed && resumedWrite.bytes > 0, "resuming it keeps saving");
  assert.equal(peekSave().label, "legacy game, continued");
  assert.equal(owners(storage).session.owner, null, "resuming never claims it");
  clearSave({ release: true });
  assert.equal(storage.getItem(SESSION_KEY), null);
});

test("unassociated quick season: no new season, mirror or cleanup over it; only a confirmed delete frees it", () => {
  const { storage, as } = device("acc-b");
  storage.setItem(SEASON_KEY, JSON.stringify({ v: 2, year: 1988, userTeamId: "XYZ", label: "legacy season" }));
  as("acc-b");
  stampLegacySaves({ season: JSON.parse(storage.getItem(SEASON_KEY)) }, storage);
  assert.equal(saveSeason({ v: 2, label: "new" }), false);
  assert.equal(saveSeason({ v: 2, label: "mirror" }, { mirror: true }), false, "a career mirror never overwrites it");
  assert.equal(clearSeasonSave(), false);
  writeRootSave(hiredRoot(60), storage);
  assert.equal(purgeOrphanedLegacySaves(storage), 0, "not even to free quota");
  assert.equal(JSON.parse(storage.getItem(SEASON_KEY)).label, "legacy season");
  clearSeasonSave({ release: true });
  assert.equal(storage.getItem(SEASON_KEY), null);
});

test("boot: an old build's compat copy of the root career is stamped as a mirror, so it never locks the slot", () => {
  const { storage, as } = device("acc-b");
  const root = hiredRoot(60);
  const { year, userTeamId } = root.leagueCareer.season;
  storage.setItem(SEASON_KEY, JSON.stringify({ v: 2, year, userTeamId, label: "mirror copy" }));
  writeRootSave(root, storage);
  as("acc-b");
  stampLegacySaves({ career: readRootSave(storage), season: JSON.parse(storage.getItem(SEASON_KEY)) }, storage);
  assert.equal(owners(storage).season.mirror, true);
  assert.equal(saveVisibility("season", "season", storage), "mirror");
  assert.ok(purgeOrphanedLegacySaves(storage) > 0, "the duplicate can still be dropped to free quota");
});

test("before the boot stamp, legacy migration writes are never blocked", () => {
  const { storage } = device();
  writeRootSave(hiredRoot(60), storage);
  assert.doesNotThrow(() => writeRootSave(otherCareer(hiredRoot(60)), storage));
});
