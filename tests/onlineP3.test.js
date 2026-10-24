import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import WebSocket from "ws";
import { createAccountStore, ELO_K, START_RATING } from "../server/online-accounts.mjs";
import { createOnlineServer, RATING_BAND } from "../server/online-server.mjs";

function tmpFile(tag) {
  return join(tmpdir(), `courtside-acct-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test("P3 accounts: register, verify, duplicates, short passwords", () => {
  const file = tmpFile("unit");
  try {
    const store = createAccountStore({ file });
    assert.equal(store.register("Alice", "pw").ok, false); // too short
    assert.equal(store.register("Alice", "secret").ok, true);
    assert.equal(store.register("Alice", "other").ok, false); // duplicate
    assert.equal(store.verify("Alice", "secret"), true);
    assert.equal(store.verify("Alice", "wrong"), false);
    assert.equal(store.verify("Nobody", "secret"), false);
    assert.deepEqual(store.get("Alice"), { name: "Alice", rating: START_RATING, wins: 0, losses: 0 });
    // Sessions resolve, unknown tokens don't.
    const token = store.createSession("Alice");
    assert.equal(store.getSession(token), "Alice");
    assert.equal(store.getSession("nope"), null);
  } finally {
    rmSync(file, { force: true });
  }
});

test("P3 accounts: Elo moves 16/16 at equal ratings, favors the underdog", () => {
  const file = tmpFile("elo");
  try {
    const store = createAccountStore({ file });
    store.register("A", "secret");
    store.register("B", "secret");
    const r1 = store.recordMatch("A", "B");
    assert.equal(r1.winner.rating, START_RATING + ELO_K / 2);
    assert.equal(r1.loser.rating, START_RATING - ELO_K / 2);
    assert.equal(r1.winner.wins, 1);
    assert.equal(r1.loser.losses, 1);
    // Draws and unknown players change nothing.
    assert.equal(store.recordMatch("A", "A"), null);
    assert.equal(store.recordMatch("A", "Ghost"), null);
    // Underdog win: 1000 beats 1200 gains more than 16.
    const file2 = tmpFile("elo2");
    try {
      const s2 = createAccountStore({ file: file2 });
      s2.register("Low", "secret");
      s2.register("High", "secret");
      for (let i = 0; i < 8; i++) s2.recordMatch("High", "Low"); // High climbs
      assert.ok(s2.get("High").rating - s2.get("Low").rating > 100);
      const before = s2.get("Low").rating;
      s2.recordMatch("Low", "High");
      assert.ok(s2.get("Low").rating - before > ELO_K / 2, "underdog should gain more than 16");
    } finally {
      rmSync(file2, { force: true });
    }
  } finally {
    rmSync(file, { force: true });
  }
});

test("P3 accounts: ratings persist across store instances", () => {
  const file = tmpFile("persist");
  try {
    const s1 = createAccountStore({ file });
    s1.register("Alice", "secret");
    s1.recordMatch("Alice", "Alice"); // no-op, but exercises the path
    s1.register("Bob", "secret");
    s1.recordMatch("Alice", "Bob");
    const s2 = createAccountStore({ file });
    assert.equal(s2.verify("Alice", "secret"), true);
    assert.equal(s2.get("Alice").rating, START_RATING + ELO_K / 2);
    assert.equal(s2.get("Bob").rating, START_RATING - ELO_K / 2);
  } finally {
    rmSync(file, { force: true });
  }
});

// ---- wire tests ----

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    ws.on("message", (raw) => {
      try {
        messages.push(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    });
    ws.on("open", () => resolve({ ws, messages }));
    ws.on("error", reject);
  });
}

async function waitFor(messages, pred, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = messages.find(pred);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timed out waiting for a message");
}

async function loginClient(url, name, password) {
  const c = await connect(url);
  c.ws.send(JSON.stringify({ type: "register", name, password }));
  await waitFor(c.messages, (m) => m.type === "registered");
  c.ws.send(JSON.stringify({ type: "login", name, password }));
  const logged = await waitFor(c.messages, (m) => m.type === "logged_in");
  return { ...c, token: logged.token };
}

test("P3 wire: ranked match, forfeit records Elo for both players", async () => {
  assert.equal(RATING_BAND, 100);
  const file = tmpFile("wire");
  const server = createOnlineServer({ port: 0, graceMs: 150, accountsFile: file });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const a = await loginClient(url, "Alice", "secret");
    const b = await loginClient(url, "Bob", "secret");
    clients.push(a, b);
    a.ws.send(JSON.stringify({ type: "queue", name: "Alice", teamId: "ATL", mode: "ranked", token: a.token }));
    b.ws.send(JSON.stringify({ type: "queue", name: "Bob", teamId: "UTA", mode: "ranked", token: b.token }));
    await waitFor(a.messages, (m) => m.type === "room" && m.matched);
    await waitFor(b.messages, (m) => m.type === "room" && m.matched);
    await waitFor(a.messages, (m) => m.type === "joined");
    // Bob forfeits by disconnecting; Alice's rating must move +16.
    b.ws.close();
    const over = await waitFor(a.messages, (m) => m.type === "game_over" && m.forfeit, 3000);
    assert.equal(over.winner, "home");
    const acct = await waitFor(a.messages, (m) => m.type === "account", 3000);
    assert.equal(acct.name, "Alice");
    assert.equal(acct.rating, START_RATING + ELO_K / 2);
    assert.equal(acct.wins, 1);
    // Bob's loss survives a fresh login.
    const b2 = await connect(url);
    clients.push(b2);
    b2.ws.send(JSON.stringify({ type: "login", name: "Bob", password: "secret" }));
    const logged = await waitFor(b2.messages, (m) => m.type === "logged_in");
    assert.equal(logged.rating, START_RATING - ELO_K / 2);
    assert.equal(logged.losses, 1);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
    rmSync(file, { force: true });
  }
});

test("P3 wire: ranked queue needs login, and ranked never meets casual", async () => {
  const file = tmpFile("mix");
  const server = createOnlineServer({ port: 0, accountsFile: file });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const guest = await connect(url);
    clients.push(guest);
    guest.ws.send(JSON.stringify({ type: "queue", name: "Guest", teamId: "ATL", mode: "ranked" }));
    const rejected = await waitFor(guest.messages, (m) => m.type === "decision_rejected");
    assert.match(rejected.reason, /登录/);

    const a = await loginClient(url, "Alice", "secret");
    clients.push(a);
    a.ws.send(JSON.stringify({ type: "queue", name: "Alice", teamId: "ATL", mode: "ranked", token: a.token }));
    await waitFor(a.messages, (m) => m.type === "queue_status");
    guest.ws.send(JSON.stringify({ type: "queue", name: "Guest", teamId: "UTA" }));
    await waitFor(guest.messages, (m) => m.type === "queue_status");
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(a.messages.some((m) => m.type === "room"), false);
    assert.equal(guest.messages.some((m) => m.type === "room"), false);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
    rmSync(file, { force: true });
  }
});

test("P3 wire: ranked band keeps far-apart ratings unmatched", async () => {
  // Seed: Bob beats Alice 6 times, opening a >100 rating gap.
  const file = tmpFile("band");
  const seed = createAccountStore({ file });
  seed.register("Alice", "secret");
  seed.register("Bob", "secret");
  for (let i = 0; i < 6; i++) seed.recordMatch("Bob", "Alice");
  assert.ok(seed.get("Bob").rating - seed.get("Alice").rating > RATING_BAND);

  const server = createOnlineServer({ port: 0, accountsFile: file });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const a = await connect(url);
    const b = await connect(url);
    clients.push(a, b);
    a.ws.send(JSON.stringify({ type: "login", name: "Alice", password: "secret" }));
    const tokenA = (await waitFor(a.messages, (m) => m.type === "logged_in")).token;
    b.ws.send(JSON.stringify({ type: "login", name: "Bob", password: "secret" }));
    const tokenB = (await waitFor(b.messages, (m) => m.type === "logged_in")).token;
    a.ws.send(JSON.stringify({ type: "queue", name: "Alice", teamId: "ATL", mode: "ranked", token: tokenA }));
    b.ws.send(JSON.stringify({ type: "queue", name: "Bob", teamId: "UTA", mode: "ranked", token: tokenB }));
    await waitFor(a.messages, (m) => m.type === "queue_status");
    await waitFor(b.messages, (m) => m.type === "queue_status");
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(a.messages.some((m) => m.type === "room"), false);
    assert.equal(b.messages.some((m) => m.type === "room"), false);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
    rmSync(file, { force: true });
  }
});

test("P3 wire: bad logins and duplicate registrations are rejected", async () => {
  const file = tmpFile("auth");
  const server = createOnlineServer({ port: 0, accountsFile: file });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const c = await connect(url);
    clients.push(c);
    c.ws.send(JSON.stringify({ type: "login", name: "Alice", password: "secret" }));
    const bad = await waitFor(c.messages, (m) => m.type === "decision_rejected");
    assert.match(bad.reason, /名字或密码不对/);
    c.ws.send(JSON.stringify({ type: "register", name: "Alice", password: "secret" }));
    await waitFor(c.messages, (m) => m.type === "registered");
    c.ws.send(JSON.stringify({ type: "register", name: "Alice", password: "other" }));
    const dup = await waitFor(c.messages, (m) => m.type === "decision_rejected" && /已被注册/.test(m.reason));
    assert.ok(dup);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
    rmSync(file, { force: true });
  }
});
