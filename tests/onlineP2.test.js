import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { loadRecord, saveRecord, recordGame, formatRecord } from "../js/online/record.js";
import { createOnlineServer, MATCH_BAND } from "../server/online-server.mjs";

// Preset OVRs (measured 2026-10-24, span 75–79): ATL 75, UTA 76, TOR 79.
const CLOSE = ["ATL", "UTA"]; // diff 1, inside the band
const FAR = ["ATL", "TOR"]; // diff 4, outside the band

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

test("P2 record: wins/losses accumulate, draws and spectators change nothing", () => {
  const storage = fakeStorage();
  assert.deepEqual(loadRecord(storage), { wins: 0, losses: 0 });
  let rec = recordGame(loadRecord(storage), { side: "home", winner: "home" });
  rec = recordGame(rec, { side: "home", winner: "away" });
  rec = recordGame(rec, { side: "home", winner: null }); // draw
  rec = recordGame(rec, { side: "spectator", winner: "home" });
  assert.deepEqual(rec, { wins: 1, losses: 1 });
  assert.equal(formatRecord(rec), "1 胜 1 负");
  saveRecord(storage, rec);
  assert.deepEqual(loadRecord(storage), { wins: 1, losses: 1 });
});

test("P2 record: corrupt stored data resets to zeros", () => {
  assert.deepEqual(loadRecord(fakeStorage({ "courtside-online-record": "not json" })), {
    wins: 0,
    losses: 0,
  });
  assert.deepEqual(
    loadRecord(fakeStorage({ "courtside-online-record": JSON.stringify({ wins: "x" }) })),
    { wins: 0, losses: 0 }
  );
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

test("P2 wire: queue pairs in-band teams into a matched game", async () => {
  assert.ok(MATCH_BAND >= 1, "band must cover the close pair");
  const server = createOnlineServer({ port: 0 });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const a = await connect(url);
    const b = await connect(url);
    clients.push(a, b);
    a.ws.send(JSON.stringify({ type: "queue", name: "Alice", teamId: CLOSE[0] }));
    await waitFor(a.messages, (m) => m.type === "queue_status");
    b.ws.send(JSON.stringify({ type: "queue", name: "Bob", teamId: CLOSE[1] }));
    const roomA = await waitFor(a.messages, (m) => m.type === "room");
    const roomB = await waitFor(b.messages, (m) => m.type === "room");
    assert.equal(roomA.matched, true);
    assert.equal(roomB.matched, true);
    assert.equal(roomA.code, roomB.code);
    assert.equal(roomA.side, "home"); // first in queue hosts
    assert.equal(roomB.side, "away");
    await waitFor(a.messages, (m) => m.type === "joined");
    await waitFor(b.messages, (m) => m.type === "joined");
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
  }
});

test("P2 wire: out-of-band teams wait instead of matching", async () => {
  const server = createOnlineServer({ port: 0 });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const a = await connect(url);
    const b = await connect(url);
    clients.push(a, b);
    a.ws.send(JSON.stringify({ type: "queue", name: "Alice", teamId: FAR[0] }));
    b.ws.send(JSON.stringify({ type: "queue", name: "Bob", teamId: FAR[1] }));
    await waitFor(a.messages, (m) => m.type === "queue_status");
    await waitFor(b.messages, (m) => m.type === "queue_status");
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(a.messages.some((m) => m.type === "room"), false);
    assert.equal(b.messages.some((m) => m.type === "room"), false);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
  }
});

test("P2 wire: stale queued players match anyone", async () => {
  const server = createOnlineServer({ port: 0, queueStaleMs: 300, queueSweepMs: 200 });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const a = await connect(url);
    const b = await connect(url);
    clients.push(a, b);
    a.ws.send(JSON.stringify({ type: "queue", name: "Alice", teamId: FAR[0] }));
    b.ws.send(JSON.stringify({ type: "queue", name: "Bob", teamId: FAR[1] }));
    const roomA = await waitFor(a.messages, (m) => m.type === "room", 3000);
    const roomB = await waitFor(b.messages, (m) => m.type === "room", 3000);
    assert.equal(roomA.code, roomB.code);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
  }
});

test("P2 wire: disconnecting removes the player from the queue", async () => {
  const server = createOnlineServer({ port: 0 });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const a = await connect(url);
    a.ws.send(JSON.stringify({ type: "queue", name: "Alice", teamId: CLOSE[0] }));
    await waitFor(a.messages, (m) => m.type === "queue_status");
    a.ws.close();
    await new Promise((r) => setTimeout(r, 200));
    const b = await connect(url);
    clients.push(b);
    b.ws.send(JSON.stringify({ type: "queue", name: "Bob", teamId: CLOSE[1] }));
    await waitFor(b.messages, (m) => m.type === "queue_status");
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(b.messages.some((m) => m.type === "room"), false);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
  }
});
