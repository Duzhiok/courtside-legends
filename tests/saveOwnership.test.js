import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { hiredRoot } from "./helpers/careerFixtures.js";
import { ACTIVE_ACCOUNT_KEY } from "../js/data/accountKeys.js";
import {
  OWNERS_KEY, _resetOwnershipForTests, careerSig, claimSave, markSessionResumed, recordSaveWrite, saveVisibility, stampLegacySaves,
} from "../js/data/saveOwnership.js";
import { clearRootSave, deleteCareerSave, readRootSave, writeRootSave } from "../js/data/saveRoot.js";

function device(activeId = null) {
  _resetOwnershipForTests();
  const storage = createMemoryStorage(activeId ? { [ACTIVE_ACCOUNT_KEY]: activeId } : {});
  const as = (id) => (id ? storage.setItem(ACTIVE_ACCOUNT_KEY, id) : storage.removeItem(ACTIVE_ACCOUNT_KEY));
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
