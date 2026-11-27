import test from "node:test";
import assert from "node:assert/strict";
import { createFakeCloud } from "./helpers/fakeCloud.js";
import { ROOT_SAVE_VERSION } from "../js/data/saveRoot.js";

// Direct tests for the fake transport's own branches (B156 follow-up 1): the cloudSync suite only ever drives
// the fake through sync(), which never calls put() twice with the same key and never puts a stale revision —
// so removing either branch below left the whole suite green (mutations M1/M6). These two tests pin them.

test("replaying the same idempotency key applies the upload once, and reports the same revision", async () => {
  const cloud = createFakeCloud();
  const put = { slot: "career", expectedRevision: 0, schemaVersion: ROOT_SAVE_VERSION, data: "v1", idempotencyKey: "career:0:hash1" };
  assert.deepEqual(await cloud.put(put), { revision: 1 });
  assert.equal(cloud.rows.get("career").revision, 1);
  assert.equal(cloud.rows.get("career").data, "v1");
  assert.deepEqual(await cloud.put(put), { revision: 1 }, "the lost-response retry is not applied a second time");
  assert.equal(cloud.rows.get("career").revision, 1);
  assert.equal(cloud.rows.get("career").data, "v1");
});

test("a put with a stale expected revision is a conflict, and the cloud row is untouched", async () => {
  const cloud = createFakeCloud();
  assert.deepEqual(
    await cloud.put({ slot: "career", expectedRevision: 0, schemaVersion: ROOT_SAVE_VERSION, data: "v1", idempotencyKey: "career:0:hash1" }),
    { revision: 1 },
  );
  assert.deepEqual(
    await cloud.put({ slot: "career", expectedRevision: 0, schemaVersion: ROOT_SAVE_VERSION, data: "v2", idempotencyKey: "career:0:hash2" }),
    { conflict: true, revision: 1 },
    "a different key with a stale revision must not overwrite",
  );
  assert.equal(cloud.rows.get("career").revision, 1);
  assert.equal(cloud.rows.get("career").data, "v1");
});
