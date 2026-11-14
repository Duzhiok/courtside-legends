// D-P1-2: a corrupt account store must be quarantined, never mistaken for an empty one —
// one ordinary write over it used to permanently erase every account.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY, CORRUPT_ACCOUNTS_KEY } from "../js/data/accountKeys.js";

globalThis.localStorage = createMemoryStorage();

const {
  deleteAccount,
  discardCorruptAccountStore,
  getAccount,
  getCorruptAccountsBackup,
  isAccountStoreCorrupt,
  listAccounts,
  saveAccount,
} = await import("../js/data/account.js");

function seedStore(raw) {
  globalThis.localStorage = createMemoryStorage(raw === null ? {} : { [ACCOUNTS_KEY]: raw });
}
const storeBytes = () => globalThis.localStorage.getItem(ACCOUNTS_KEY);

test("D-P1-2: unparseable account bytes are quarantined and reported corrupt, not read as empty", () => {
  const raw = '{"accounts": [{"id": "acc-a", "gold": 500}'; // truncated mid-object
  seedStore(raw);
  assert.deepEqual(listAccounts(), []);
  assert.equal(isAccountStoreCorrupt(), true);
  assert.equal(getCorruptAccountsBackup(), raw);
  assert.equal(globalThis.localStorage.getItem(CORRUPT_ACCOUNTS_KEY), raw);
});

test("D-P1-2: a well-formed store with a non-array accounts field is corrupt too", () => {
  const raw = JSON.stringify({ accounts: { "acc-a": { gold: 1 } } });
  seedStore(raw);
  assert.equal(isAccountStoreCorrupt(), true);
  assert.equal(getCorruptAccountsBackup(), raw);
});

test("D-P1-2: saveAccount refuses to overwrite a corrupt store — the bytes survive every write", () => {
  const raw = "{corrupt";
  seedStore(raw);
  saveAccount({ id: "acc-new", name: "New" });
  assert.equal(storeBytes(), raw, "the corrupt bytes are untouched by the refused write");
  assert.equal(getCorruptAccountsBackup(), raw);
  assert.equal(getAccount("acc-new"), null, "the refused account was not persisted");
  assert.equal(isAccountStoreCorrupt(), true);
});

test("D-P1-2: deleteAccount refuses too", () => {
  const raw = "{corrupt";
  seedStore(raw);
  deleteAccount("acc-a");
  assert.equal(storeBytes(), raw);
});

test("D-P1-2: discarding a corrupt store frees the slot but keeps the backup", () => {
  const raw = "{corrupt";
  seedStore(raw);
  globalThis.localStorage.setItem(ACTIVE_ACCOUNT_KEY, "acc-a");
  assert.equal(discardCorruptAccountStore(), true);
  assert.equal(storeBytes(), null);
  assert.equal(getCorruptAccountsBackup(), raw, "the backup is never deleted by the discard path");
  assert.equal(globalThis.localStorage.getItem(ACTIVE_ACCOUNT_KEY), null, "the active pointer to a dead account is cleared");
  assert.equal(isAccountStoreCorrupt(), false);
  saveAccount({ id: "acc-fresh", name: "Fresh" });
  assert.equal(getAccount("acc-fresh")?.name, "Fresh", "a fresh start works after the discard");
});

test("D-P1-2: discarding refuses on a healthy store", () => {
  const raw = JSON.stringify({ accounts: [{ id: "acc-a", name: "A", playerIds: [] }] });
  seedStore(raw);
  assert.equal(discardCorruptAccountStore(), false);
  assert.equal(storeBytes(), raw);
});

test("D-P1-2: a healthy store is untouched — no backup key, no corrupt flag, normal round-trip", () => {
  seedStore(null);
  assert.equal(isAccountStoreCorrupt(), false, "a missing store is empty, not corrupt");
  assert.equal(getCorruptAccountsBackup(), null);
  saveAccount({ id: "acc-a", name: "A", playerIds: [] });
  assert.equal(isAccountStoreCorrupt(), false);
  assert.equal(globalThis.localStorage.getItem(CORRUPT_ACCOUNTS_KEY), null, "no backup is written for a healthy store");
  assert.equal(getAccount("acc-a")?.name, "A");
  assert.equal(listAccounts().length, 1);
});

test("D-P1-2: app.js wires the corrupt-store prompt, export and discard (source check)", () => {
  const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.ok(/isAccountStoreCorrupt\(\)/.test(src), "boot + account screen check the corrupt flag");
  assert.ok(/btn-corrupt-accounts-download/.test(src), "the account list offers a backup download");
  assert.ok(/btn-corrupt-accounts-discard/.test(src), "the account list offers discarding the damaged store");
  assert.ok(/downloadCorruptAccountsBackup\(\)/.test(src), "the download helper exists and is wired");
  assert.ok(/discardCorruptAccountStore\(\)/.test(src), "the discard path is wired");
});
