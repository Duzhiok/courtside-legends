import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { hiredRoot } from "./helpers/careerFixtures.js";
import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY } from "../js/data/accountKeys.js";
import {
  OWNERS_KEY, _resetOwnershipForTests, careerSig, claimSave, ForeignSaveError, markSessionResumed, recordSaveWrite, saveVisibility, stampLegacySaves,
} from "../js/data/saveOwnership.js";
import { clearRootSave, deleteCareerSave, readRootSave, ROOT_SAVE_KEY, writeRootSave } from "../js/data/saveRoot.js";

// Accounts that sign in really exist on the device (ownership treats a deleted owner as gone).
function device(activeId = null) {
  _resetOwnershipForTests();
  const storage = createMemoryStorage({ [ACCOUNTS_KEY]: JSON.stringify({ accounts: [] }) });
  const register = (id) => {
    const store = JSON.parse(storage.getItem(ACCOUNTS_KEY));
    if (!store.accounts.some((a) => a.id === id)) store.accounts.push({ id });
    storage.setItem(ACCOUNTS_KEY, JSON.stringify(store));
  };
  const as = (id) => {
    if (!id) return storage.removeItem(ACTIVE_ACCOUNT_KEY);
    register(id);
    storage.setItem(ACTIVE_ACCOUNT_KEY, id);
  };
  as(activeId);
  return { storage, as };
}
const owners = (storage) => JSON.parse(storage.getItem(OWNERS_KEY) || "{}");

test("a legacy save is stamped unassociated and is NOT auto-assigned when someone keeps playing it", () => {
  const { storage, as } = device();
  const root = hiredRoot(60);
  writeRootSave(root, storage); // written before ownership existed (not attributed)
  as("acc-b");
  stampLegacySaves({ career: readRootSave(storage) }, storage);
  const sig = careerSig(readRootSave(storage));
  assert.equal(saveVisibility("career", sig, storage), "unassociated");
  writeRootSave(root, storage); // B continues the same career
  assert.equal(owners(storage).career.owner, null, "still unassociated: continuing is not claiming");
  assert.equal(saveVisibility("career", sig, storage), "unassociated");
});

test("a NEW career is attributed to whoever started it, and is invisible to every other account", () => {
  const { storage, as } = device("acc-a");
  stampLegacySaves({}, storage);
  const root = hiredRoot(60);
  writeRootSave(root, storage);
  const sig = careerSig(root);
  assert.equal(saveVisibility("career", sig, storage), "mine");
  as("acc-b");
  assert.equal(saveVisibility("career", sig, storage), "other");
  as(null);
  assert.equal(saveVisibility("career", sig, storage), "other", "a guest does not see an account's save");
  as("acc-a");
  assert.equal(saveVisibility("career", sig, storage), "mine");
});

test("claiming: explicit, signed-in only, once; the save itself is never touched", () => {
  const { storage, as } = device();
  const root = hiredRoot(60);
  writeRootSave(root, storage);
  stampLegacySaves({ career: root }, storage);
  const before = storage.getItem("cls_root_v3");
  const sig = careerSig(root);
  assert.deepEqual(claimSave("career", sig, storage), { ok: false, reason: "guest" });
  as("acc-b");
  assert.equal(claimSave("career", sig, storage).ok, true);
  assert.equal(saveVisibility("career", sig, storage), "mine");
  assert.deepEqual(claimSave("career", sig, storage), { ok: false, reason: "already_yours" });
  as("acc-a");
  assert.deepEqual(claimSave("career", sig, storage), { ok: false, reason: "claimed" }, "no second claim by another account");
  assert.equal(saveVisibility("career", sig, storage), "other");
  assert.equal(storage.getItem("cls_root_v3"), before, "claiming never edits the save");
});

test("a failed claim (storage refuses the metadata) keeps the save and its unassociated state", () => {
  const { storage, as } = device();
  const root = hiredRoot(60);
  writeRootSave(root, storage);
  stampLegacySaves({ career: root }, storage);
  as("acc-b");
  const real = storage.setItem;
  storage.setItem = (k, v) => { if (k === OWNERS_KEY) throw new Error("quota"); return real.call(storage, k, v); };
  assert.deepEqual(claimSave("career", careerSig(root), storage), { ok: false, reason: "storage" });
  storage.setItem = real;
  assert.ok(readRootSave(storage)?.leagueCareer, "save still there");
  assert.equal(saveVisibility("career", careerSig(root), storage), "unassociated");
});

test("deleting the career drops its ownership entry", () => {
  for (const del of [clearRootSave, deleteCareerSave]) {
    const { storage } = device("acc-a");
    stampLegacySaves({}, storage);
    writeRootSave(hiredRoot(60), storage);
    assert.ok(owners(storage).career);
    del(storage);
    assert.equal(owners(storage).career, undefined);
  }
});

test("session slot: a fresh match is attributed; a resumed one keeps its previous owner", () => {
  const { storage, as } = device();
  stampLegacySaves({ session: { v: 1 } }, storage);
  as("acc-b");
  markSessionResumed();
  recordSaveWrite("session", "session", storage);
  assert.equal(owners(storage).session.owner, null, "continuing a legacy match does not claim it");

  const fresh = device("acc-a");
  stampLegacySaves({}, fresh.storage);
  recordSaveWrite("session", "session", fresh.storage);
  assert.equal(saveVisibility("session", "session", fresh.storage), "mine");
  fresh.as("acc-b");
  assert.equal(saveVisibility("session", "session", fresh.storage), "other");
});

test("no ownership bookkeeping before the boot stamp (legacy migration writes stay unassociated)", () => {
  const { storage } = device("acc-a");
  writeRootSave(hiredRoot(60), storage);
  assert.equal(storage.getItem(OWNERS_KEY), null);
});

const otherCareer = (root, tag = "new") => {
  const storyId = `${root.story.storyId}-${tag}`;
  return { ...root, leagueCareer: { ...root.leagueCareer, storyId }, story: { ...root.story, storyId } };
};

test("D-P1-1: a newer-schema career survives a downgrade boot — its entry is kept unassociated, not deleted", () => {
  const { storage } = device("acc-a");
  stampLegacySaves({}, storage);
  const root = hiredRoot(60);
  writeRootSave(root, storage);
  assert.equal(owners(storage).career.owner, "acc-a");
  // The player then plays on a newer build (v5 root) and comes back to this one:
  // this build cannot parse the v5 root, so boot sees "no career".
  const newer = JSON.stringify({ ...JSON.parse(storage.getItem(ROOT_SAVE_KEY)), schemaVersion: 5 });
  storage.setItem(ROOT_SAVE_KEY, newer);
  assert.equal(readRootSave(storage), null, "a newer-schema root reads as no save on this build");
  _resetOwnershipForTests();
  stampLegacySaves({ career: readRootSave(storage) }, storage);
  const entry = owners(storage).career;
  assert.ok(entry, "the entry is kept while the slot still holds bytes");
  assert.equal(entry.owner, null, "unreadable means unassociated, not the recorded owner");
  assert.equal(entry.sig, careerSig(root), "the sig is preserved so the save is recognisable again on upgrade");
  // A new career over it is refused; the newer bytes are untouched.
  assert.throws(() => writeRootSave(otherCareer(root), storage), (e) => e instanceof ForeignSaveError && e.reason === "unassociated");
  assert.equal(storage.getItem(ROOT_SAVE_KEY), newer, "the newer save is byte-for-byte untouched");
  // An explicit confirmed delete still frees the slot.
  deleteCareerSave(storage, { release: true });
  assert.equal(storage.getItem(ROOT_SAVE_KEY), null);
});

test("D-P1-1: a corrupt career (unparseable bytes) keeps its entry too", () => {
  const { storage } = device("acc-a");
  stampLegacySaves({}, storage);
  const root = hiredRoot(60);
  writeRootSave(root, storage);
  const before = "{not json";
  storage.setItem(ROOT_SAVE_KEY, before);
  assert.equal(readRootSave(storage), null);
  _resetOwnershipForTests();
  stampLegacySaves({ career: readRootSave(storage) }, storage);
  assert.ok(owners(storage).career, "unparseable bytes still count as a save");
  assert.equal(owners(storage).career.owner, null);
  assert.throws(() => writeRootSave(otherCareer(root), storage), ForeignSaveError);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), before);
});

test("D-P1-1: a stale entry whose slot holds no data is still cleaned up", () => {
  const { storage } = device("acc-a");
  stampLegacySaves({}, storage);
  writeRootSave(hiredRoot(60), storage);
  assert.ok(owners(storage).career);
  storage.removeItem(ROOT_SAVE_KEY); // the save itself is gone (deleted out-of-band)
  _resetOwnershipForTests();
  stampLegacySaves({ career: null }, storage);
  assert.equal(owners(storage).career, undefined, "no bytes left: the stale entry goes");
});

test("a Reborn-only root is owned by whoever started it and hidden from everyone else (QA: account isolation)", () => {
  const { storage, as } = device("acc-a");
  const root = { reborn: { seed: "run-1" } }; // no leagueCareer: the Reborn slice's own root
  assert.equal(careerSig(root), "reborn:run-1");
  assert.equal(careerSig({}), null);
  stampLegacySaves({}, storage);
  recordSaveWrite("career", careerSig(root), storage);
  assert.equal(saveVisibility("career", careerSig(root), storage), "mine");
  as("acc-b");
  assert.equal(saveVisibility("career", careerSig(root), storage), "other");
  as(null);
  assert.equal(saveVisibility("career", careerSig(root), storage), "other");
});
