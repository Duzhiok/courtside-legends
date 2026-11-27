import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { createFakeBackend } from "./helpers/fakeBackend.js";
import { ROOT_SAVE_KEY, createRootState, readRootSave, writeRootSave } from "../js/data/saveRoot.js";
import { createCloudService, summarizeRoot } from "../js/cloud/cloudService.js";

const putSave = (storage, settings, accountId = "acc-1", savedAt = 0) =>
  writeRootSave(createRootState({ savedAt, profile: { accountId, settings, accessibility: {} } }), storage);

/** One physical device: its own storage, its own signed-in session, the same cloud backend. */
function device(backend, { settings, accountId = "acc-1", clock = { t: 1_000 } } = {}) {
  const storage = createMemoryStorage();
  if (settings) putSave(storage, settings, accountId);
  const auth = backend.auth();
  const state = { accountId };
  const svc = createCloudService({ storage, auth, makeTransport: () => backend.transportFor(auth), localAccountId: () => state.accountId, now: () => clock.t });
  return { storage, auth, svc, state, clock };
}
const signInAndLink = async (d, email = "p@x.co") => {
  const r = await d.svc.signUp({ email, password: "pw" }).then((x) => (x.error ? d.svc.signIn({ email, password: "pw" }) : x));
  assert.ok(r.userId, JSON.stringify(r));
  assert.deepEqual(d.svc.linkAccount({ confirmed: true }).ok, true);
};

test("nothing syncs for a signed-out player, a guest, or an account that was never linked; local play is untouched", async () => {
  const backend = createFakeBackend();
  const d = device(backend, { settings: { n: 1 } });
  const before = d.storage.getItem(ROOT_SAVE_KEY);
  assert.equal((await d.svc.sync()).status, "signed-out");
  await d.svc.signUp({ email: "p@x.co", password: "pw" });
  assert.equal((await d.svc.sync()).status, "not-linked");
  assert.deepEqual(d.svc.linkAccount({ confirmed: false }), { ok: false, reason: "needs-confirmation" });
  d.state.accountId = null;
  assert.equal((await d.svc.sync()).status, "guest");
  assert.deepEqual(d.svc.linkAccount({ confirmed: true }), { ok: false, reason: "guest" });
  assert.equal(backend.rows.size, 0);
  assert.equal(d.storage.getItem(ROOT_SAVE_KEY), before);
});

test("sign in, confirm the link, sync: uploaded; status shows the last successful sync time", async () => {
  const backend = createFakeBackend();
  const d = device(backend, { settings: { n: 1 } });
  assert.equal(d.svc.status().lastSyncAt, null);
  await signInAndLink(d);
  d.clock.t = 5_000;
  assert.deepEqual(await d.svc.sync(), { status: "uploaded", revision: 1 });
  const status = d.svc.status();
  assert.equal(status.signedIn, true);
  assert.equal(status.lastSyncAt, 5_000);
  assert.equal(status.revision, 1);
  assert.equal(status.last.status, "uploaded");
});

test("two devices: conflict shows both careers, restore backs up and adopts the cloud copy, then they follow each other", async () => {
  const backend = createFakeBackend();
  const mac = device(backend, { settings: { who: "mac" } });
  await signInAndLink(mac);
  await mac.svc.sync();
  const phone = device(backend, { settings: { who: "phone" } });
  await signInAndLink(phone); // same email -> same cloud user
  assert.equal((await phone.svc.sync()).status, "conflict");
  const view = await phone.svc.describeConflict();
  assert.equal(view.local.mode, "none");
  assert.equal(view.cloud.revision, 1);
  assert.ok(view.cloud.updatedAt);
  const restored = await phone.svc.restore();
  assert.deepEqual({ s: restored.status, b: restored.backedUp }, { s: "restored", b: true });
  assert.equal(readRootSave(phone.storage).profile.settings.who, "mac");
  assert.equal((await phone.svc.sync()).status, "up-to-date");
  // phone plays on and uploads; the Mac (untouched since its last sync) is told the cloud is newer, and catches up
  const root = readRootSave(phone.storage);
  root.profile.settings = { who: "phone-2" };
  writeRootSave(root, phone.storage);
  assert.deepEqual(await phone.svc.sync(), { status: "uploaded", revision: 2 });
  assert.equal((await mac.svc.sync()).status, "cloud-newer");
  assert.equal(readRootSave(mac.storage).profile.settings.who, "mac", "reported, not applied");
  assert.equal((await mac.svc.restore()).status, "restored");
  assert.equal(readRootSave(mac.storage).profile.settings.who, "phone-2");
});

test("keepLocal is the player's explicit choice and moves the cloud to the next revision", async () => {
  const backend = createFakeBackend();
  const a = device(backend, { settings: { who: "a" } });
  await signInAndLink(a);
  await a.svc.sync();
  const b = device(backend, { settings: { who: "b" } });
  await signInAndLink(b);
  assert.equal((await b.svc.sync()).status, "conflict");
  assert.deepEqual(await b.svc.keepLocal(), { status: "uploaded", revision: 2 });
});

test("offline: the player keeps playing, nothing is lost, and the next sync after reconnecting uploads", async () => {
  const backend = createFakeBackend();
  const d = device(backend, { settings: { n: 1 } });
  await signInAndLink(d);
  backend.offline = true;
  const before = d.storage.getItem(ROOT_SAVE_KEY);
  const down = await d.svc.sync();
  assert.equal(down.status, "offline");
  assert.equal(d.svc.status().last.status, "offline");
  assert.equal(d.storage.getItem(ROOT_SAVE_KEY), before);
  backend.offline = false;
  assert.deepEqual(await d.svc.sync(), { status: "uploaded", revision: 1 });
  // an upload whose response was lost is retried safely: applied once
  const root = readRootSave(d.storage);
  root.profile.settings = { n: 2 };
  writeRootSave(root, d.storage);
  backend.failNext = "after";
  assert.equal((await d.svc.sync()).status, "offline");
  assert.equal((await d.svc.sync()).status, "up-to-date");
  assert.equal(backend.rows.get([...backend.rows.keys()][0]).revision, 2);
});

test("isolation: another cloud user on the same device cannot sync that account, and cannot read the first user's cloud save", async () => {
  const backend = createFakeBackend();
  const a = device(backend, { settings: { secret: "A" } });
  await signInAndLink(a, "a@x.co");
  await a.svc.sync();
  // user B signs in on A's device (same storage, same local account)
  const authB = backend.auth();
  const svcB = createCloudService({ storage: a.storage, auth: authB, makeTransport: () => backend.transportFor(authB), localAccountId: () => "acc-1" });
  await svcB.signUp({ email: "b@x.co", password: "pw" });
  assert.deepEqual(svcB.linkAccount({ confirmed: true }).reason, "account-linked-to-other-user");
  assert.equal((await svcB.sync()).status, "linked-to-other-user");
  // B on a clean device gets an empty cloud, never A's row; and an anonymous caller cannot read anything
  const b = device(backend, { settings: { mine: "B" }, accountId: "acc-9" });
  await signInAndLink(b, "b@x.co");
  assert.deepEqual(await b.svc.sync(), { status: "uploaded", revision: 1 });
  assert.equal(backend.rows.size, 2, "two users, two separate rows");
  const anon = backend.auth();
  await assert.rejects(backend.transportFor(anon).get({ slot: "career" }), (e) => e.kind === "auth");
});

test("summarizeRoot gives the player something to compare", () => {
  const s = summarizeRoot({ savedAt: 9, activeMode: null, leagueCareer: null, reborn: { player: { seasonYear: 1999, seasonLog: [1, 2, 3], coachTrust: 41, rotationRole: "bench" } } });
  assert.deepEqual(s, { mode: "reborn", year: 1999, games: 3, trust: 41, role: "bench", savedAt: 9 });
  assert.equal(summarizeRoot(null), null);
});

import { cloudPanelHtml } from "../js/ui/cloudPanel.js";
import { getCloudService } from "../js/cloud/index.js";

test("with the feature flag unset there is no cloud service at all (the default player sees nothing new)", () => {
  assert.equal(getCloudService({ storage: createMemoryStorage(), search: "" }), null);
});

test("panel: every state tells the player what is going on, in both languages, and never shows a conflict without both saves", () => {
  const out = { signedIn: false };
  assert.match(cloudPanelHtml({ status: out }), /不登录也能正常游玩/);
  assert.match(cloudPanelHtml({ status: out, lang: "en" }), /play without it/);
  const base = { signedIn: true, email: "p@x.co", blocked: null, lastSyncAt: null, last: null };
  assert.match(cloudPanelHtml({ status: { ...base, blocked: "guest" } }), /游客存档只保存在本机/);
  assert.match(cloudPanelHtml({ status: { ...base, blocked: "not-linked" } }), /data-cloud-action="link"/);
  assert.match(cloudPanelHtml({ status: { ...base, blocked: "not-linked" } }), /绑定不会改变/);
  assert.match(cloudPanelHtml({ status: base, lang: "en" }), /never/);
  assert.match(cloudPanelHtml({ status: { ...base, last: { status: "offline" } } }), /进度保存在本机/);
  const view = { local: { mode: "reborn", year: 1999, games: 46, trust: 40, savedAt: 1 }, cloud: { mode: "reborn", year: 1999, games: 49, trust: 44, savedAt: 2, revision: 31 } };
  const conflict = cloudPanelHtml({ status: { ...base, last: { status: "conflict" } }, view });
  assert.match(conflict, /46/);
  assert.match(conflict, /49/);
  assert.match(conflict, /Cloud revision|云端版本/);
  assert.match(conflict, /data-cloud-action="restore"/);
  assert.match(conflict, /data-cloud-action="keep-local"/);
  assert.match(conflict, /先备份/);
  const newer = cloudPanelHtml({ status: { ...base, last: { status: "cloud-newer" } }, view });
  assert.match(newer, /data-cloud-action="restore"/);
  assert.doesNotMatch(newer, /keep-local/, "cloud-newer has no local edits to keep");
  assert.doesNotMatch(cloudPanelHtml({ status: out, message: "<img onerror=x>" }), /<img/);
});

test("a late answer for a signed-out user never touches the next user's save (restore and the conflict view)", async () => {
  const backend = createFakeBackend();
  const mac = device(backend, { settings: { who: "A-mac" }, accountId: "acc-A-mac" });
  await signInAndLink(mac, "a@x.co");
  await mac.svc.sync();

  // A phone whose cloud reads we can hold back.
  const storage = createMemoryStorage();
  putSave(storage, { who: "B-local" }, "acc-B");
  const auth = backend.auth();
  const state = { accountId: "acc-A-phone" };
  let release;
  const held = new Promise((r) => { release = r; });
  const slowTransport = () => {
    const t = backend.transportFor(auth);
    return { ...t, get: async (args) => { const res = await t.get(args); await held; return res; } };
  };
  const svc = createCloudService({ storage, auth, makeTransport: slowTransport, localAccountId: () => state.accountId, now: () => 1 });
  putSave(storage, { who: "A-phone" }, "acc-A-phone");
  await svc.signUp({ email: "a@x.co", password: "pw" }).then((x) => (x.error ? svc.signIn({ email: "a@x.co", password: "pw" }) : x));
  assert.equal(svc.linkAccount({ confirmed: true }).ok, true);

  const pendingRestore = svc.restore();
  const pendingView = svc.describeConflict();
  // While both requests are out: A signs out, B signs in on this device (its local account is B's now).
  await svc.signOut();
  await svc.signUp({ email: "b@x.co", password: "pw" });
  state.accountId = "acc-B";
  putSave(storage, { who: "B-local" }, "acc-B");
  const before = storage.getItem(ROOT_SAVE_KEY);
  release();

  assert.equal((await pendingRestore).status, "stale");
  const view = await pendingView;
  assert.equal(view.cloud, null);
  assert.equal(view.stale, true);
  assert.equal(storage.getItem(ROOT_SAVE_KEY), before, "B's save is byte-for-byte untouched");
  assert.equal(readRootSave(storage).profile.settings.who, "B-local");
  assert.equal(storage.getItem("cls_cloud_backup_v1"), null, "no backup was written either");
});
