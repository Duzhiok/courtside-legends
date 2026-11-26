import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { createFakeCloud } from "./helpers/fakeCloud.js";
import { ROOT_SAVE_KEY, createRootState, readRootSave, writeRootSave } from "../js/data/saveRoot.js";
import { SYNC_BACKUP_KEY, createCloudSync, contentHash } from "../js/cloud/cloudSync.js";

// One cloud user ("user-1") signed in as the local account "acc-1" on every device unless a test says otherwise.
const device = (settings = {}, cloud, { userId = "user-1", linkedAccountId = "acc-1", accountId = "acc-1" } = {}) => {
  const storage = createMemoryStorage();
  if (settings) writeRootSave(createRootState({ profile: { accountId, settings, accessibility: {} } }), storage);
  return { storage, sync: createCloudSync({ storage, transport: cloud, userId, linkedAccountId }) };
};
const edit = (storage, settings) => {
  const root = readRootSave(storage);
  root.profile.settings = settings;
  writeRootSave(root, storage);
};

test("first sync uploads revision 1, an unchanged save is up to date, a change uploads revision 2", async () => {
  const cloud = createFakeCloud();
  const a = device({ n: 1 }, cloud);
  assert.deepEqual(await a.sync.sync(), { status: "uploaded", revision: 1 });
  assert.equal((await a.sync.sync()).status, "up-to-date");
  edit(a.storage, { n: 2 });
  assert.deepEqual(await a.sync.sync(), { status: "uploaded", revision: 2 });
  assert.equal(cloud.rows.get("career").revision, 2);
});

test("saving again without a real change (only savedAt moves) uploads nothing", async () => {
  const cloud = createFakeCloud();
  const a = device({ n: 1 }, cloud);
  await a.sync.sync();
  edit(a.storage, { n: 1 });
  assert.equal((await a.sync.sync()).status, "up-to-date");
  assert.equal(cloud.rows.get("career").revision, 1);
});

test("a lost response is retried safely: the upload is applied once, not twice", async () => {
  const cloud = createFakeCloud();
  const a = device({ n: 1 }, cloud);
  cloud.failNext = "after";
  assert.equal((await a.sync.sync()).status, "offline");
  assert.equal(cloud.rows.get("career").revision, 1, "the server did apply it");
  assert.deepEqual(await a.sync.sync(), { status: "up-to-date", revision: 1 });
  assert.equal(cloud.rows.get("career").revision, 1, "retry did not apply it again");
  assert.equal(a.sync.state().revision, 1, "device now knows it is at revision 1");
});

test("an upload that never reached the server leaves local sync state untouched", async () => {
  const cloud = createFakeCloud();
  const a = device({ n: 1 }, cloud);
  cloud.failNext = "before";
  assert.equal((await a.sync.sync()).status, "offline");
  assert.equal(a.sync.state().revision, 0);
  assert.equal(cloud.rows.size, 0);
  assert.equal((await a.sync.sync()).status, "uploaded");
});

test("two devices that both changed: conflict, nothing is overwritten on either side", async () => {
  const cloud = createFakeCloud();
  const a = device({ who: "A" }, cloud);
  await a.sync.sync();
  const b = device({ who: "B" }, cloud);
  const before = b.storage.getItem(ROOT_SAVE_KEY);
  assert.deepEqual(await b.sync.sync(), { status: "conflict", cloudRevision: 1 });
  assert.equal(b.storage.getItem(ROOT_SAVE_KEY), before, "local untouched");
  assert.equal(cloud.rows.get("career").revision, 1, "cloud untouched");
});

test("device B follows A: after A uploads revision 2, B (no local edits) sees cloud-newer and restore catches it up", async () => {
  const cloud = createFakeCloud();
  const a = device({ n: 1 }, cloud);
  await a.sync.sync();
  const b = device(null, cloud);
  await b.sync.restore();
  edit(a.storage, { n: 2 });
  await a.sync.sync();
  assert.deepEqual(await b.sync.sync(), { status: "cloud-newer", cloudRevision: 2 });
  assert.equal(readRootSave(b.storage).profile.settings.n, 1, "reported, not applied");
  assert.equal((await b.sync.restore()).revision, 2);
  assert.equal(readRootSave(b.storage).profile.settings.n, 2);
});

test("cloud-newer is reported (not applied) when the device has no local edits", async () => {
  const cloud = createFakeCloud();
  const a = device({ n: 1 }, cloud);
  await a.sync.sync();
  const b = device(null, cloud);
  assert.equal((await b.sync.sync()).status, "cloud-newer", "empty device sees the cloud copy but writes nothing");
  assert.equal(b.storage.getItem(ROOT_SAVE_KEY), null);
  const restored = await b.sync.restore();
  assert.deepEqual({ status: restored.status, revision: restored.revision, backedUp: restored.backedUp }, { status: "restored", revision: 1, backedUp: false });
  assert.equal(readRootSave(b.storage).profile.settings.n, 1);
  assert.equal((await b.sync.sync()).status, "up-to-date");
});

test("restore over an existing local save backs it up first", async () => {
  const cloud = createFakeCloud();
  const a = device({ n: "cloud" }, cloud);
  await a.sync.sync();
  const b = device({ n: "local" }, cloud);
  assert.equal((await b.sync.sync()).status, "conflict");
  const r = await b.sync.restore();
  assert.equal(r.status, "restored");
  assert.equal(r.backedUp, true);
  assert.equal(readRootSave(b.storage).profile.settings.n, "cloud");
  assert.match(b.storage.getItem(SYNC_BACKUP_KEY), /"local"/);
});

test("keepLocal is an explicit overwrite of the cloud and moves it to the next revision", async () => {
  const cloud = createFakeCloud();
  const a = device({ n: "cloud" }, cloud);
  await a.sync.sync();
  const b = device({ n: "local" }, cloud);
  assert.equal((await b.sync.sync()).status, "conflict");
  assert.deepEqual(await b.sync.keepLocal(), { status: "uploaded", revision: 2 });
  assert.match(cloud.rows.get("career").data, /"local"/);
});

test("a corrupt or newer-version cloud copy is refused and the local save is not touched", async () => {
  const cloud = createFakeCloud();
  const b = device({ n: "mine" }, cloud);
  const before = b.storage.getItem(ROOT_SAVE_KEY);
  cloud.rows.set("career", { revision: 5, schemaVersion: 4, data: "{not json", lastKey: null });
  assert.equal((await b.sync.restore()).status, "invalid-cloud");
  const future = JSON.stringify({ format: "x", schemaVersion: 99, exportedAt: "z", root: {} });
  cloud.rows.set("career", { revision: 6, schemaVersion: 99, data: future, lastKey: null });
  assert.equal((await b.sync.restore()).status, "invalid-cloud");
  assert.equal(b.storage.getItem(ROOT_SAVE_KEY), before);
  assert.equal(b.storage.getItem(SYNC_BACKUP_KEY), null);
});

test("offline get is reported, never thrown, and never changes anything", async () => {
  const transport = { get: async () => { throw new Error("down"); }, put: async () => { throw new Error("down"); } };
  const a = device({ n: 1 }, transport);
  assert.equal((await a.sync.sync()).status, "offline");
  assert.equal((await a.sync.restore()).status, "offline");
  assert.equal((await a.sync.keepLocal()).status, "offline");
});

test("contentHash ignores savedAt but notices real changes", () => {
  const r = createRootState();
  assert.equal(contentHash({ ...r, savedAt: 1 }), contentHash({ ...r, savedAt: 999 }));
  assert.notEqual(contentHash(r), contentHash({ ...r, activeMode: "franchise" }));
});

// --- one browser, several people (the bug found in review: B signing in on A's browser uploaded A's career) ---

const asUser = (storage, cloud, userId, linkedAccountId) => createCloudSync({ storage, transport: cloud, userId, linkedAccountId });

test("B signs in on A's browser: A's career is NOT uploaded to B's cloud", async () => {
  const a = device({ who: "A's career" }, createFakeCloud(), { userId: "user-A", linkedAccountId: "acc-A", accountId: "acc-A" });
  assert.equal((await a.sync.sync()).status, "uploaded");
  const cloudB = createFakeCloud();
  const asB = asUser(a.storage, cloudB, "user-B", "acc-B");
  assert.equal((await asB.sync()).status, "not-linked");
  assert.equal((await asB.keepLocal()).status, "not-linked");
  assert.equal(cloudB.rows.size, 0, "nothing of A's save reached B's cloud");
});

test("B's existing cloud row is never reported 'up to date' just because A's browser remembers the same revision number", async () => {
  const cloudA = createFakeCloud();
  const a = device({ who: "A" }, cloudA, { userId: "user-A", linkedAccountId: "acc-A", accountId: "acc-A" });
  await a.sync.sync(); // A's browser remembers revision 1
  const cloudB = createFakeCloud();
  const b = device({ who: "B" }, cloudB, { userId: "user-B", linkedAccountId: "acc-B", accountId: "acc-B" });
  await b.sync.sync(); // B's cloud is also at revision 1, with different content
  assert.equal((await asUser(a.storage, cloudB, "user-B", "acc-B").sync()).status, "not-linked");
});

test("sync bookkeeping is per cloud user: what A's browser remembers is invisible to B", async () => {
  const a = device({ n: 1 }, createFakeCloud(), { userId: "user-A", linkedAccountId: "acc-A", accountId: "acc-A" });
  await a.sync.sync();
  assert.equal(a.sync.state().revision, 1);
  assert.deepEqual(asUser(a.storage, createFakeCloud(), "user-B", "acc-B").state(), { revision: 0, hash: null });
});

test("a guest save (no account) never leaves the device, and nothing is even asked of the server", async () => {
  const cloud = createFakeCloud();
  let calls = 0;
  const spy = { get: async (r) => { calls += 1; return cloud.get(r); }, put: async (r) => { calls += 1; return cloud.put(r); } };
  const guest = device({ n: 1 }, spy, { accountId: null });
  assert.equal((await guest.sync.sync()).status, "guest");
  assert.equal((await guest.sync.keepLocal()).status, "guest");
  assert.equal(calls, 0);
  assert.equal(cloud.rows.size, 0);
});

test("createCloudSync refuses to run without a signed-in user id", () => {
  assert.throws(() => createCloudSync({ storage: createMemoryStorage(), transport: createFakeCloud() }), /userId/);
});

// --- why a call failed ---

const failing = (kind) => {
  const boom = () => { throw Object.assign(new Error(`${kind} failure`), kind ? { kind } : {}); };
  return { get: async () => null, put: async () => boom() };
};

test("a failed upload says WHY: signed out, refused, too large - only a real network failure is 'offline'", async () => {
  const expected = { auth: "auth-required", rejected: "rejected", "too-large": "too-large", offline: "offline", "": "offline" };
  for (const [kind, status] of Object.entries(expected)) {
    const out = await device({ n: 1 }, failing(kind)).sync.sync();
    assert.equal(out.status, status, `kind "${kind}"`);
    assert.match(out.error, /failure/);
  }
  const signedOut = { get: async () => { throw Object.assign(new Error("401"), { kind: "auth" }); }, put: async () => ({}) };
  assert.equal((await device({ n: 1 }, signedOut).sync.sync()).status, "auth-required", "a failing get is classified the same way");
});

// --- the fingerprint must not move when nothing was played ---

test("loading and re-saving the same career does not change its content hash (two idle devices must not report a conflict)", () => {
  const { storage } = device({ n: 1 }, createFakeCloud());
  const before = contentHash(readRootSave(storage));
  for (let i = 0; i < 3; i += 1) writeRootSave(readRootSave(storage), storage);
  assert.equal(contentHash(readRootSave(storage)), before);
});

test("a save restored from another device becomes THIS device's linked account's, and syncs normally afterwards", async () => {
  const cloud = createFakeCloud();
  const mac = device({ n: 1 }, cloud, { accountId: "acc-mac", linkedAccountId: "acc-mac" });
  await mac.sync.sync();
  const phone = device(null, cloud, { accountId: "acc-phone", linkedAccountId: "acc-phone" });
  const r = await phone.sync.restore();
  assert.equal(r.status, "restored");
  assert.equal(readRootSave(phone.storage).profile.accountId, "acc-phone", "re-owned to the phone's linked account");
  assert.equal((await phone.sync.sync()).status, "up-to-date", "not blocked as 'not-linked', not re-uploaded");
  assert.equal(cloud.rows.get("career").revision, 1);
});

test("the same career opened under different local account ids is not a conflict", async () => {
  const cloud = createFakeCloud();
  const mac = device({ n: 1 }, cloud, { accountId: "acc-mac", linkedAccountId: "acc-mac" });
  await mac.sync.sync();
  const phone = device({ n: 1 }, cloud, { accountId: "acc-phone", linkedAccountId: "acc-phone" });
  assert.equal((await phone.sync.sync()).status, "up-to-date");
});
