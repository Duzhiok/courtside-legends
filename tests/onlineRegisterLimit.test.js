// Registration used to be unlimited: one connection created 40 accounts in 2.4 seconds, each one worth 1000
// starting gold and a scrypt hash that blocks the event loop. Now registration is rate limited per client
// address and globally, checked BEFORE the expensive hash and charged only for accounts actually created.
import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import {
  REGISTER_GLOBAL_LIMIT,
  REGISTER_PER_IP_LIMIT,
  REGISTER_WINDOW_MS,
  clientIp,
  createRegistrationGate,
} from "../server/online-ratelimit.mjs";
import { createOnlineServer } from "../server/online-server.mjs";
import { connect, loginClient, sendJson, tmpFile, waitFor } from "./helpers/onlineWire.js";

const MIN = 60 * 1000;

function gate(opts = {}) {
  const clock = { t: 1_000_000 };
  return { clock, gate: createRegistrationGate({ perIp: 3, global: 100, windowMs: 10 * MIN, now: () => clock.t, ...opts }) };
}

/** Make `n` registrations from one address, the way the server does: check, then record on success. */
function register(g, ip, n = 1) {
  for (let i = 0; i < n; i++) {
    assert.equal(g.check(ip).ok, true);
    g.record(ip);
  }
}

test("defaults are modest but not hostile to a household", () => {
  assert.equal(REGISTER_PER_IP_LIMIT, 5);
  assert.equal(REGISTER_GLOBAL_LIMIT, 100);
  assert.equal(REGISTER_WINDOW_MS, 60 * MIN);
});

test("one address can create a few accounts, then must wait", () => {
  const { gate: g } = gate();
  register(g, "1.2.3.4", 3);
  const blocked = g.check("1.2.3.4");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.scope, "ip");
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 10 * MIN);
  assert.equal(g.check("5.6.7.8").ok, true, "another address is unaffected");
});

test("the window slides: the oldest registration frees a slot first", () => {
  const { gate: g, clock } = gate();
  register(g, "1.2.3.4"); // t0
  clock.t += 4 * MIN;
  register(g, "1.2.3.4", 2); // t0 + 4 min
  assert.equal(g.check("1.2.3.4").ok, false);
  clock.t += 6 * MIN + 1; // the first one is now over 10 minutes old
  assert.equal(g.check("1.2.3.4").ok, true, "one slot is free again");
  register(g, "1.2.3.4");
  assert.equal(g.check("1.2.3.4").ok, false, "but only one");
  clock.t += 4 * MIN + 1;
  assert.equal(g.check("1.2.3.4").ok, true, "and the other two follow");
});

test("a check alone costs nothing; only a recorded registration counts", () => {
  const { gate: g } = gate();
  for (let i = 0; i < 50; i++) assert.equal(g.check("1.2.3.4").ok, true);
  register(g, "1.2.3.4", 3);
  assert.equal(g.check("1.2.3.4").ok, false);
});

test("a global ceiling holds even when every registration comes from a different address", () => {
  const { gate: g } = gate({ perIp: 5, global: 4 });
  for (let i = 0; i < 4; i++) register(g, `10.0.0.${i}`);
  const blocked = g.check("10.0.0.99");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.scope, "global");
});

test("addresses are forgotten once their window has passed (memory stays bounded)", () => {
  const { gate: g, clock } = gate({ global: 1000 });
  for (let i = 0; i < 20; i++) register(g, `10.1.0.${i}`);
  assert.equal(g.size(), 20);
  clock.t += 10 * MIN + 1;
  g.check("anyone");
  assert.equal(g.size(), 0);
});

test("limits can be switched off for a trusted setup", () => {
  const { gate: g } = gate({ perIp: Infinity, global: Infinity });
  register(g, "1.2.3.4", 500);
});

test("clientIp: the socket address, with IPv4-mapped IPv6 unwrapped", () => {
  assert.equal(clientIp({ socket: { remoteAddress: "203.0.113.9" }, headers: {} }), "203.0.113.9");
  assert.equal(clientIp({ socket: { remoteAddress: "::ffff:203.0.113.9" }, headers: {} }), "203.0.113.9");
  assert.equal(clientIp({ socket: {}, headers: {} }), "unknown");
  assert.equal(clientIp(undefined), "unknown");
});

test("clientIp: X-Forwarded-For is ignored unless a trusted proxy is configured", () => {
  const req = { socket: { remoteAddress: "198.51.100.7" }, headers: { "x-forwarded-for": "6.6.6.6" } };
  assert.equal(clientIp(req), "198.51.100.7", "a client cannot pick its own address by sending the header");
  assert.equal(clientIp(req, { trustProxy: false }), "198.51.100.7");
});

test("clientIp: behind a trusted proxy the RIGHTMOST entry is the one the proxy added", () => {
  const spoofed = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" } };
  assert.equal(clientIp(spoofed, { trustProxy: true }), "203.0.113.9", "the client-supplied left side is not believed");
  const single = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": " 203.0.113.9 " } };
  assert.equal(clientIp(single, { trustProxy: true }), "203.0.113.9");
  const none = { socket: { remoteAddress: "127.0.0.1" }, headers: {} };
  assert.equal(clientIp(none, { trustProxy: true }), "127.0.0.1", "no header: fall back to the socket");
  const junk = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": " , ," } };
  assert.equal(clientIp(junk, { trustProxy: true }), "127.0.0.1");
});

// ---- over the wire ----

async function withServer(opts, fn) {
  const acctFile = tmpFile("acct");
  const ecoFile = tmpFile("eco");
  const server = createOnlineServer({ port: 0, accountsFile: acctFile, economyFile: ecoFile, ...opts });
  await new Promise((r) => server.wss.on("listening", r));
  const open = [];
  const url = `ws://localhost:${server.port()}`;
  const dial = async (options) => {
    const c = await connect(url, options);
    open.push(c);
    return c;
  };
  try {
    await fn({ url, dial, server });
  } finally {
    for (const c of open) try { c.ws.close(); } catch { /* already closed */ }
    await server.close();
    rmSync(acctFile, { force: true });
    rmSync(ecoFile, { force: true });
  }
}

async function tryRegister(client, name, password = "secret") {
  const before = client.messages.length;
  sendJson(client, { type: "register", name, password });
  return waitFor(client.messages, (m) => (m.type === "registered" || m.type === "decision_rejected") && client.messages.indexOf(m) >= before);
}

test("wire: after the per-address limit, further registrations are refused and create nothing", async () => {
  await withServer({ registerLimits: { perIp: 3 } }, async ({ url, dial }) => {
    const c = await dial();
    for (let i = 0; i < 3; i++) assert.equal((await tryRegister(c, `user${i}`)).type, "registered");
    const refused = await tryRegister(c, "user3");
    assert.equal(refused.type, "decision_rejected");
    assert.match(refused.reason, /注册太频繁/);
    assert.match(refused.reason, /分钟/, "says roughly how long to wait");
    const other = await dial(); // a fresh connection from the same address is limited too
    assert.match((await tryRegister(other, "user4")).reason, /注册太频繁/);
    const probe = await dial();
    sendJson(probe, { type: "login", name: "user3", password: "secret" });
    assert.match((await waitFor(probe.messages, (m) => m.type === "decision_rejected")).reason, /名字或密码不对/, "the refused account really does not exist");
    const existing = await loginClient(url, "user0", { register: false });
    existing.ws.close();
  });
});

test("wire: typos, duplicate names and bad passwords do not use up the quota", async () => {
  await withServer({ registerLimits: { perIp: 2 } }, async ({ dial }) => {
    const c = await dial();
    assert.equal((await tryRegister(c, "alice")).type, "registered");
    assert.match((await tryRegister(c, "alice")).reason, /已被注册/);
    assert.match((await tryRegister(c, "bobby", "x")).reason, /密码至少/);
    assert.match((await tryRegister(c, "")).reason, /名字需为/);
    assert.equal((await tryRegister(c, "bobby")).type, "registered", "the second real registration still fits the limit of 2");
    assert.match((await tryRegister(c, "carol")).reason, /注册太频繁/);
  });
});

test("wire: the global ceiling applies across addresses", async () => {
  await withServer({ registerLimits: { perIp: 10, global: 2 } }, async ({ dial }) => {
    const a = await dial({ headers: { "X-Forwarded-For": "10.0.0.1" } });
    await tryRegister(a, "one");
    await tryRegister(a, "two");
    const refused = await tryRegister(await dial(), "three");
    assert.match(refused.reason, /注册太频繁|暂时/);
  });
});

test("wire: a spoofed X-Forwarded-For does not get around the limit when no proxy is trusted", async () => {
  await withServer({ registerLimits: { perIp: 2 } }, async ({ dial }) => {
    for (let i = 0; i < 2; i++) {
      const c = await dial({ headers: { "X-Forwarded-For": `9.9.9.${i}` } });
      assert.equal((await tryRegister(c, `bot${i}`)).type, "registered");
    }
    const c = await dial({ headers: { "X-Forwarded-For": "9.9.9.200" } });
    assert.match((await tryRegister(c, "bot2")).reason, /注册太频繁/, "every header value was the same real address");
  });
});

test("wire: behind a trusted proxy each real client gets its own quota", async () => {
  await withServer({ trustProxy: true, registerLimits: { perIp: 1 } }, async ({ dial }) => {
    const a = await dial({ headers: { "X-Forwarded-For": "203.0.113.1" } });
    assert.equal((await tryRegister(a, "ann")).type, "registered");
    assert.match((await tryRegister(a, "ann2")).reason, /注册太频繁/, "same client, over its limit");
    const b = await dial({ headers: { "X-Forwarded-For": "203.0.113.2" } });
    assert.equal((await tryRegister(b, "ben")).type, "registered", "a different client behind the proxy is not punished for it");
    const sneaky = await dial({ headers: { "X-Forwarded-For": "1.1.1.1, 203.0.113.1" } });
    assert.match((await tryRegister(sneaky, "ann3")).reason, /注册太频繁/, "a fake left-hand entry does not make a new client");
  });
});

test("wire: the limit lifts once the window has passed", async () => {
  const clock = { t: Date.now() };
  await withServer({ registerLimits: { perIp: 1, windowMs: 10 * MIN, now: () => clock.t } }, async ({ dial }) => {
    const c = await dial();
    assert.equal((await tryRegister(c, "first")).type, "registered");
    assert.match((await tryRegister(c, "second")).reason, /注册太频繁/);
    clock.t += 10 * MIN + 1;
    assert.equal((await tryRegister(c, "second")).type, "registered");
  });
});
