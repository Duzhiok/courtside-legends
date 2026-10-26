// Hardening for the online server found in review: a malformed message used to be able to
// crash the whole process, a player named "__proto__" broke the economy store, there was no
// payload cap, and logins could be brute-forced (each attempt also blocks the event loop in
// scryptSync). Every test here failed before the fix.
import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import net from "node:net";
import WebSocket from "ws";
import { createAccountStore, MAX_LOGIN_FAILURES, LOGIN_LOCK_MS } from "../server/online-accounts.mjs";
import { createEconomyStore } from "../server/online-economy.mjs";
import { createOnlineServer, MAX_MESSAGE_BYTES } from "../server/online-server.mjs";

const tmp = (tag) => join(tmpdir(), `courtside-hard-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
const CARDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

test("economy: odd account names are ordinary keys, never the Object prototype", () => {
  const file = tmp("eco");
  try {
    const eco = createEconomyStore({ file, cardIds: CARDS, cardOvr: new Map() });
    for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const p = eco.getPlayer(name);
      assert.equal(p.gold, 1000, `${name} starts with the normal gold`);
      assert.equal(p.roster.length, 8, `${name} gets a normal roster`);
      const buy = eco.buyListing(name, eco.getBoard()[0].id);
      assert.equal(buy.ok, true, `${name} can use the market`);
    }
    assert.equal(({}).gold, undefined, "Object.prototype must stay clean");
    assert.equal(({}).roster, undefined);
  } finally {
    rmSync(file, { force: true });
  }
});

test("economy: reorderRoster rejects anything that is not an array of ids", () => {
  const file = tmp("eco2");
  try {
    const eco = createEconomyStore({ file, cardIds: CARDS, cardOvr: new Map() });
    for (const bad of [5, {}, true, null, undefined, "abc"]) {
      assert.deepEqual(eco.reorderRoster("alice", bad).ok, false, `${JSON.stringify(bad)} is refused, not thrown`);
    }
    const roster = eco.getPlayer("alice").roster;
    assert.equal(eco.reorderRoster("alice", [...roster].reverse()).ok, true, "a real permutation still works");
  } finally {
    rmSync(file, { force: true });
  }
});

test("accounts: repeated wrong passwords lock the account, and the lock expires", () => {
  const file = tmp("lock");
  try {
    let clock = 1_000_000;
    const store = createAccountStore({ file, now: () => clock });
    store.register("Alice", "secret");
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      assert.equal(store.isLocked("Alice"), false, `attempt ${i + 1} is still allowed`);
      assert.equal(store.verify("Alice", "wrong"), false);
    }
    assert.equal(store.isLocked("Alice"), true);
    assert.equal(store.verify("Alice", "secret"), false, "even the right password is refused while locked");
    clock += LOGIN_LOCK_MS + 1;
    assert.equal(store.isLocked("Alice"), false);
    assert.equal(store.verify("Alice", "secret"), true, "the lock expires");
  } finally {
    rmSync(file, { force: true });
  }
});

test("accounts: a success resets the failure count, and unknown names are not tracked", () => {
  const file = tmp("reset");
  try {
    const store = createAccountStore({ file, now: () => 5 });
    store.register("Bob", "secret");
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) store.verify("Bob", "wrong");
    assert.equal(store.verify("Bob", "secret"), true);
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) store.verify("Bob", "wrong");
    assert.equal(store.isLocked("Bob"), false, "count restarted after the success");
    for (let i = 0; i < 50; i++) store.verify(`ghost${i}`, "x");
    assert.equal(store.isLocked("ghost0"), false, "no memory is spent on names that do not exist");
  } finally {
    rmSync(file, { force: true });
  }
});

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    ws.on("message", (raw) => inbox.push(JSON.parse(raw)));
    ws.once("open", () => resolve({ ws, inbox }));
    ws.once("error", reject);
  });
}
const waitFor = async (inbox, pred, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = inbox.find(pred);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 10));
  }
  return null;
};

async function withServer(fn) {
  const accountsFile = tmp("srv-a");
  const economyFile = tmp("srv-e");
  const server = createOnlineServer({ port: 0, accountsFile, economyFile });
  await new Promise((r) => (server.wss.address() ? r() : server.wss.once("listening", r)));
  try {
    await fn(`ws://127.0.0.1:${server.port()}`);
  } finally {
    await server.close();
    rmSync(accountsFile, { force: true });
    rmSync(economyFile, { force: true });
  }
}

test("server: a malformed market message is rejected and the server keeps serving", async () => {
  await withServer(async (url) => {
    const { ws, inbox } = await connect(url);
    ws.send(JSON.stringify({ type: "register", name: "Eve", password: "secret" }));
    assert.ok(await waitFor(inbox, (m) => m.type === "registered"));
    ws.send(JSON.stringify({ type: "login", name: "Eve", password: "secret" }));
    const login = await waitFor(inbox, (m) => m.type === "logged_in");
    assert.ok(login, "logged in");

    ws.send(JSON.stringify({ type: "market_roster_order", token: login.token, cardIds: 5 }));
    const rejected = await waitFor(inbox, (m) => m.type === "decision_rejected" && !/登录/.test(m.reason));
    assert.ok(rejected, "bad cardIds gets a rejection instead of killing the process");

    inbox.length = 0;
    ws.send(JSON.stringify({ type: "market_board", token: login.token }));
    assert.ok(await waitFor(inbox, (m) => m.type === "market"), "the server still answers afterwards");
    ws.close();
  });
});

test("server: a handler bug cannot take the process down (errors become a rejection)", async () => {
  await withServer(async (url) => {
    const { ws, inbox } = await connect(url);
    // `decision: null` and a numeric `type` are the kind of junk a hostile client sends.
    for (const junk of [{ type: "decision", decision: null }, { type: 7 }, { type: "create", name: {} }, "just a string", null, 42]) {
      ws.send(JSON.stringify(junk));
    }
    inbox.length = 0;
    ws.send(JSON.stringify({ type: "register", name: "Zed", password: "secret" }));
    assert.ok(await waitFor(inbox, (m) => m.type === "registered"), "still alive after junk");
    ws.close();
  });
});

test("server: a message over the size cap closes the connection", async () => {
  await withServer(async (url) => {
    const { ws } = await connect(url);
    const closed = new Promise((resolve) => ws.once("close", (code) => resolve(code)));
    ws.send(JSON.stringify({ type: "register", name: "x", password: "y".repeat(MAX_MESSAGE_BYTES + 1) }));
    assert.equal(await closed, 1009, "1009 = message too big");
  });
});

test("server: login is refused with a clear reason once the account is locked", async () => {
  await withServer(async (url) => {
    const { ws, inbox } = await connect(url);
    ws.send(JSON.stringify({ type: "register", name: "Kim", password: "secret" }));
    assert.ok(await waitFor(inbox, (m) => m.type === "registered"));
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) ws.send(JSON.stringify({ type: "login", name: "Kim", password: "bad" }));
    // Wait for every wrong-password reply, so none of them can arrive after the inbox is cleared.
    const rejections = () => inbox.filter((m) => m.type === "decision_rejected" && /不对/.test(m.reason)).length;
    for (let waited = 0; rejections() < MAX_LOGIN_FAILURES && waited < 3000; waited += 10) await new Promise((r) => setTimeout(r, 10));
    assert.equal(rejections(), MAX_LOGIN_FAILURES);
    inbox.length = 0;
    ws.send(JSON.stringify({ type: "login", name: "Kim", password: "secret" }));
    const refused = await waitFor(inbox, (m) => m.type === "decision_rejected");
    assert.ok(refused);
    assert.match(refused.reason, /尝试过多/);
    assert.equal(inbox.some((m) => m.type === "logged_in"), false);
    ws.close();
  });
});

test("server: a malformed websocket frame closes that socket but does not kill the server", async () => {
  await withServer(async (url) => {
    const port = Number(new URL(url).port);
    // Raw TCP: complete a real upgrade, then send a masked frame with a reserved opcode (6 bytes).
    const raw = net.connect(port, "127.0.0.1");
    await new Promise((resolve) => raw.once("connect", resolve));
    raw.write("GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n");
    await new Promise((resolve) => raw.once("data", resolve));
    raw.write(Buffer.from([0x83, 0x80, 0, 0, 0, 0]));
    await new Promise((resolve) => raw.once("close", resolve));

    const { ws, inbox } = await connect(url);
    ws.send(JSON.stringify({ type: "register", name: "Pat", password: "secret" }));
    assert.ok(await waitFor(inbox, (m) => m.type === "registered"), "a fresh client still gets served");
    ws.close();
  });
});
