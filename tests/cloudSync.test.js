import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { createFakeCloud } from "./helpers/fakeCloud.js";
import { ROOT_SAVE_KEY, createRootState, readRootSave, writeRootSave } from "../js/data/saveRoot.js";
import { SYNC_BACKUP_KEY, createCloudSync, contentHash } from "../js/cloud/cloudSync.js";

const device = (settings = {}, cloud) => {
  const storage = createMemoryStorage();
  if (settings) writeRootSave(createRootState({ profile: { accountId: null, settings, accessibility: {} } }), storage);
  return { storage, sync: createCloudSync({ storage, transport: cloud }) };
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
