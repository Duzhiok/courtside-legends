import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";
import { buildOnlineFrame } from "../server/online-frame.mjs";
import { diffFrame, applyFrameDelta } from "../js/online/delta.js";
import { createOnlineServer } from "../server/online-server.mjs";

const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool2020 = rows.filter((r) => r.season === 2020).map(seasonToCard);

function team(name, offset) {
  const players = pool2020.slice(offset, offset + 12);
  return { name, players, starterIds: players.slice(0, 5).map((p) => p.id) };
}

function freshSim() {
  return new GameSim({
    home: team("Home", 0),
    away: team("Away", 12),
    youSide: "home",
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
}

test("P1 delta: round-trip across steps reconstructs the next frame exactly", () => {
  const sim = freshSim();
  const frame0 = buildOnlineFrame(sim, 0);
  for (let i = 0; i < 5; i++) sim.step();
  const frame1 = buildOnlineFrame(sim, 5);
  const patch = diffFrame(frame0, frame1);
  assert.ok(patch, "expected a delta for a changed frame");
  assert.equal(patch.type, "frame_delta");
  assert.equal(patch.tick, 5);
  assert.deepEqual(applyFrameDelta(frame0, patch), frame1);
  assert.ok(
    Buffer.byteLength(JSON.stringify(patch), "utf8") < Buffer.byteLength(JSON.stringify(frame1), "utf8"),
    "delta should be smaller than the full frame"
  );
});

test("P1 delta: covers membership, tactic and focus changes", () => {
  const sim = freshSim();
  const frame0 = buildOnlineFrame(sim, 0);
  sim.substitute(sim.home.onCourt[0].id, sim.home.bench[0].id, "home");
  sim.setTactic("triangle", "home");
  sim.setOffenseFocus(sim.home.onCourt[0].id, { sideKey: "home" });
  const frame1 = buildOnlineFrame(sim, 1);
  const patch = diffFrame(frame0, frame1);
  assert.ok(patch.home.onCourt, "membership change must carry the new id list");
  assert.equal(patch.home.tactic.id, "triangle");
  assert.ok(patch.home.focusId, "focus change must be in the delta");
  assert.deepEqual(applyFrameDelta(frame0, patch), frame1);
});

test("P1 delta: identical frames diff to null, bad applies return null", () => {
  const sim = freshSim();
  const frame = buildOnlineFrame(sim, 0);
  assert.equal(diffFrame(frame, JSON.parse(JSON.stringify(frame))), null);
  assert.equal(applyFrameDelta(null, { type: "frame_delta", tick: 1 }), null);
  assert.equal(applyFrameDelta(frame, { type: "frame", tick: 1 }), null);
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

async function startDuel(server) {
  const url = `ws://localhost:${server.port()}`;
  const [tA, tB] = server.presets.slice(0, 2);
  const a = await connect(url);
  const b = await connect(url);
  a.ws.send(JSON.stringify({ type: "create", name: "Alice", teamId: tA.id }));
  const roomMsg = await waitFor(a.messages, (m) => m.type === "room");
  b.ws.send(JSON.stringify({ type: "join", code: roomMsg.code, name: "Bob", teamId: tB.id }));
  await waitFor(a.messages, (m) => m.type === "joined");
  await waitFor(b.messages, (m) => m.type === "joined");
  return { url, a, b, code: roomMsg.code };
}

test("P1 wire: spectator sees frames, cannot decide, disconnect pauses nothing", async () => {
  const server = createOnlineServer({ port: 0 });
  await new Promise((r) => server.wss.on("listening", r));
  try {
    const { url, a, b, code } = await startDuel(server);
    const c = await connect(url);
    c.ws.send(JSON.stringify({ type: "spectate", code, name: "Carol" }));
    const specRoom = await waitFor(c.messages, (m) => m.type === "room");
    assert.equal(specRoom.side, "spectator");
    const specJoined = await waitFor(c.messages, (m) => m.type === "joined");
    assert.equal(specJoined.side, "spectator");
    await waitFor(c.messages, (m) => m.type === "frame" || m.type === "frame_delta");
    c.ws.send(JSON.stringify({ type: "decision", decision: { kind: "timeout" } }));
    const rejected = await waitFor(c.messages, (m) => m.type === "decision_rejected");
    assert.match(rejected.reason, /观战/);
    c.ws.close();
    // The game must keep running: no opponent_disconnected for the players,
    // and a fresh frame still arrives after the spectator leaves.
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(a.messages.some((m) => m.type === "opponent_disconnected"), false);
    assert.equal(b.messages.some((m) => m.type === "opponent_disconnected"), false);
    const framesAfter = a.messages.filter((m) => m.type === "frame" || m.type === "frame_delta").length;
    assert.ok(framesAfter > 0, "players should keep receiving frames");
    a.ws.close();
    b.ws.close();
  } finally {
    await server.close();
  }
});

test("P1 wire: delta chain rebuilds exactly the frame a reclaim gets in full", async () => {
  const server = createOnlineServer({ port: 0 });
  await new Promise((r) => server.wss.on("listening", r));
  try {
    const { url, a, b, code } = await startDuel(server);
    // Bob (continuous) applies every delta; Alice drops and reclaims.
    await new Promise((r) => setTimeout(r, 1000));
    a.ws.close();
    await waitFor(b.messages, (m) => m.type === "opponent_disconnected");
    const a2 = await connect(url);
    a2.ws.send(JSON.stringify({ type: "join", code, name: "Alice", teamId: server.presets[0].id }));
    await waitFor(a2.messages, (m) => m.type === "room" && m.reclaimed);
    await waitFor(a2.messages, (m) => m.type === "joined");
    const full = a2.messages.find((m) => m.type === "frame");
    assert.ok(full, "reclaim must receive a full frame");
    // Replay Bob's stream: first full frame, then deltas in order.
    let current = null;
    const byTick = new Map();
    for (const m of b.messages) {
      if (m.type === "frame") {
        current = m;
        byTick.set(m.tick, JSON.parse(JSON.stringify(m)));
      } else if (m.type === "frame_delta" && current) {
        current = applyFrameDelta(current, m);
        byTick.set(current.tick, JSON.parse(JSON.stringify(current)));
      }
    }
    assert.ok(byTick.has(full.tick), `Bob's delta chain must cover tick ${full.tick}`);
    assert.deepEqual(byTick.get(full.tick), full);
    a2.ws.close();
    b.ws.close();
  } finally {
    await server.close();
  }
});

test("P1 wire: disconnect past the grace timer forfeits the game", async () => {
  const server = createOnlineServer({ port: 0, graceMs: 150 });
  await new Promise((r) => server.wss.on("listening", r));
  try {
    const { a, b } = await startDuel(server);
    b.ws.close();
    const notice = await waitFor(a.messages, (m) => m.type === "opponent_disconnected");
    assert.equal(notice.graceMs, 150);
    const over = await waitFor(a.messages, (m) => m.type === "game_over", 3000);
    assert.equal(over.forfeit, true);
    assert.equal(over.winner, "home");
    assert.equal(over.forfeitSide, "away");
    a.ws.close();
  } finally {
    await server.close();
  }
});

test("P1 wire: reclaim inside the grace window cancels the forfeit", async () => {
  const server = createOnlineServer({ port: 0, graceMs: 500 });
  await new Promise((r) => server.wss.on("listening", r));
  try {
    const { url, a, b, code } = await startDuel(server);
    b.ws.close();
    await waitFor(a.messages, (m) => m.type === "opponent_disconnected");
    const b2 = await connect(url);
    b2.ws.send(JSON.stringify({ type: "join", code, name: "Bob", teamId: server.presets[1].id }));
    await waitFor(b2.messages, (m) => m.type === "room" && m.reclaimed);
    await waitFor(a.messages, (m) => m.type === "opponent_back");
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(a.messages.some((m) => m.type === "game_over"), false);
    a.ws.close();
    b2.ws.close();
  } finally {
    await server.close();
  }
});
