import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { CLOUD_CONFIG_KEY, CLOUD_FLAG_KEY, cloudConfig, isSecretKey } from "../js/cloud/config.js";
import { SESSION_KEY, createSupabaseAuth } from "../js/cloud/auth.js";
import { createSupabaseTransport } from "../js/cloud/supabaseTransport.js";
import { createAccountLinks } from "../js/cloud/accountLink.js";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role) => `${b64({ alg: "HS256" })}.${b64({ role })}.sig`;
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });

test("config: off without the flag, off without a config, never a secret key, https only", () => {
  const s = createMemoryStorage();
  assert.deepEqual(cloudConfig(s, { globals: {} }), { off: "flag" });
  s.setItem(CLOUD_FLAG_KEY, "1");
  assert.deepEqual(cloudConfig(s, { globals: {} }), { off: "config" });
  s.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ url: "http://x.supabase.co", key: "pub" }));
  assert.equal(cloudConfig(s, { globals: {} }).off, "config", "http is refused");
  s.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ url: "https://x.supabase.co/", key: jwt("service_role") }));
  assert.equal(cloudConfig(s, { globals: {} }).off, "secret-key");
  s.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ url: "https://x.supabase.co", key: "sb_secret_abc" }));
  assert.equal(cloudConfig(s, { globals: {} }).off, "secret-key");
  s.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ url: "https://x.supabase.co/", key: jwt("anon") }));
  assert.deepEqual(cloudConfig(s, { globals: {} }), { url: "https://x.supabase.co", key: jwt("anon") });
  assert.equal(cloudConfig(createMemoryStorage(), { search: "?a=1&cloud=1", globals: { CLS_CLOUD: { url: "https://y.co", key: "sb_publishable_1" } } }).url, "https://y.co", "URL flag + global config");
  assert.equal(isSecretKey("sb_publishable_1"), false);
});

test("auth: sign-up with a session, confirmation-required sign-up, readable errors, offline-safe sign-out", async () => {
  const storage = createMemoryStorage();
  const calls = [];
  let mode = "ok";
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (mode === "down") throw new Error("offline");
    if (mode === "bad") return reply(400, { error_description: "Invalid login credentials" });
    if (mode === "confirm") return reply(200, { id: "u1", email: "a@b.c" });
    return reply(200, { access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { id: "u1", email: "a@b.c" } });
  };
  const auth = createSupabaseAuth({ url: "https://x.co", key: "pub", fetch, storage, now: () => 1000 });
  assert.deepEqual(await auth.signUp({ email: "a@b.c", password: "pw" }), { userId: "u1", email: "a@b.c" });
  assert.equal(calls[0].url, "https://x.co/auth/v1/signup");
  assert.equal(calls[0].init.headers.apikey, "pub");
  assert.deepEqual(auth.session(), { userId: "u1", email: "a@b.c" });
  assert.equal(JSON.parse(storage.getItem(SESSION_KEY)).expiresAt, 1000 + 3600 * 1000);
  mode = "bad";
  await assert.rejects(auth.signIn({ email: "a@b.c", password: "x" }), /Invalid login credentials/);
  mode = "confirm";
  assert.deepEqual(await auth.signUp({ email: "n@b.c", password: "pw" }), { needsConfirmation: true });
  mode = "down";
  await auth.signOut(); // must not throw offline
  assert.equal(auth.session(), null);
});

test("auth: an expiring access token is refreshed; no session means 'not signed in'", async () => {
  const storage = createMemoryStorage();
  let t = 0;
  const seen = [];
  const fetch = async (url, init) => {
    seen.push(url);
    const grant = url.includes("refresh_token");
    return reply(200, { access_token: grant ? "AT2" : "AT1", refresh_token: "RT2", expires_in: 100, user: { id: "u1", email: "a@b.c" } });
  };
  const auth = createSupabaseAuth({ url: "https://x.co", key: "pub", fetch, storage, now: () => t });
  await assert.rejects(auth.accessToken(), /not signed in/);
  await auth.signIn({ email: "a@b.c", password: "pw" });
  assert.equal(await auth.accessToken(), "AT1", "fresh token reused");
  t = 100_000; // past expiry
  assert.equal(await auth.accessToken(), "AT2");
  assert.ok(seen.at(-1).endsWith("grant_type=refresh_token"));
  assert.equal(await auth.accessToken(), "AT2", "refreshed token is stored and reused");
});

test("transport: failures are classified, requests carry the user's token, anonymous never reaches the network", async () => {
  let next;
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    if (next instanceof Error) throw next;
    return next;
  };
  const auth = { accessToken: async () => "TOKEN" };
  const t = createSupabaseTransport({ url: "https://x.co", key: "pub", auth, fetch });
  next = reply(200, [{ revision: 3, schema_version: 4, save_data: "D", updated_at: "T" }]);
  assert.deepEqual(await t.get({ slot: "career" }), { revision: 3, schemaVersion: 4, data: "D", updatedAt: "T" });
  assert.equal(requests[0].init.headers.Authorization, "Bearer TOKEN");
  assert.match(requests[0].url, /game_saves\?slot=eq\.career/);
  next = reply(200, []);
  assert.equal(await t.get({ slot: "career" }), null);
  next = reply(200, { revision: 1 });
  assert.deepEqual(await t.put({ slot: "career", expectedRevision: 0, schemaVersion: 4, data: "D", idempotencyKey: "K" }), { revision: 1 });
  assert.deepEqual(JSON.parse(requests.at(-1).init.body), { p_slot: "career", p_expected_revision: 0, p_schema_version: 4, p_data: "D", p_idempotency_key: "K" });
  for (const [response, kind] of [[reply(401, {}), "auth"], [reply(403, {}), "auth"], [reply(413, {}), "too-large"], [reply(400, {}), "rejected"], [reply(503, {}), "offline"], [new Error("fetch failed"), "offline"]]) {
    next = response;
    await assert.rejects(t.get({ slot: "career" }), (e) => e.kind === kind, `${response.status ?? "throw"} -> ${kind}`);
  }
  const before = requests.length;
  const anon = createSupabaseTransport({ url: "https://x.co", key: "pub", auth: { accessToken: async () => { throw new Error("not signed in"); } }, fetch });
  await assert.rejects(anon.get({ slot: "career" }), (e) => e.kind === "auth");
  assert.equal(requests.length, before, "no request without a session");
});

test("account links: explicit confirmation, one user per account and one account per user", () => {
  const links = createAccountLinks(createMemoryStorage());
  assert.deepEqual(links.link("acc-1", "u1"), { ok: false, reason: "needs-confirmation" });
  assert.equal(links.allows("acc-1", "u1"), false);
  assert.deepEqual(links.link("acc-1", "u1", { confirmed: true }), { ok: true });
  assert.equal(links.link("acc-1", "u1").already, true, "re-linking the same pair needs no new yes");
  assert.equal(links.link("acc-1", "u2", { confirmed: true }).reason, "account-linked-to-other-user");
  assert.equal(links.link("acc-2", "u1", { confirmed: true }).reason, "user-linked-to-other-account");
  assert.equal(links.allows("acc-1", "u1"), true);
  assert.equal(links.allows("acc-1", "u2"), false);
  assert.equal(links.localOf("u1"), "acc-1");
  links.unlink("acc-1");
  assert.equal(links.userOf("acc-1"), null);
});

test("account store: a store from before versioning still loads and gets stamped; a store from a newer build is never written to", async () => {
  const mem = createMemoryStorage();
  globalThis.localStorage = mem;
  const { createAccount, getAccount, saveAccount, ACCOUNT_STORE_VERSION } = await import(`../js/data/account.js?v=${Date.now()}`);
  mem.setItem("cls_accounts_v1", JSON.stringify({ accounts: [{ id: "old", name: "Old", createdAt: 1, playerIds: [] }] }));
  assert.equal(getAccount("old").name, "Old", "legacy store (no version) reads fine");
  saveAccount({ ...getAccount("old"), gold: 7 });
  const stamped = JSON.parse(mem.getItem("cls_accounts_v1"));
  assert.equal(stamped.version, ACCOUNT_STORE_VERSION);
  assert.equal(stamped.accounts[0].gold, 7);
  const future = JSON.stringify({ version: ACCOUNT_STORE_VERSION + 1, accounts: [{ id: "x", name: "X", extra: "keep me" }] });
  mem.setItem("cls_accounts_v1", future);
  assert.equal(getAccount("x").name, "X", "still readable");
  saveAccount({ id: "x", name: "changed" });
  createAccount("another");
  assert.equal(mem.getItem("cls_accounts_v1"), future, "a newer build's store is left byte-for-byte alone");
});
