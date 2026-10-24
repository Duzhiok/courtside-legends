import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createOnlineServer } from "../server/online-server.mjs";

/**
 * T6 P0 integration: two real WebSocket clients, create -> join -> frames
 * -> decision applied/rejected -> timeout/resume -> disconnect/reclaim.
 * The full game is NOT played out here (speed 2 is ~60s); game_over is
 * covered by the sim's own onEnd path, and frames prove the loop runs.
 */

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    // Attach the message collector immediately: the server sends `welcome`
    // on connection, before `open` resolves, and unlistened messages drop.
    const client = makeClient(ws);
    ws.once("open", () => resolve(client));
    ws.once("error", reject);
  });
}

function makeClient(ws) {
  const seen = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw);
    seen.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(msg)) {
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });
  return {
    ws,
    send: (obj) => ws.send(JSON.stringify(obj)),
    waitFor: (pred, label, ms = 8000) =>
      new Promise((resolve, reject) => {
        const hit = seen.find(pred);
        if (hit) return resolve(hit);
        const waiter = { pred, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const idx = waiters.indexOf(waiter);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error(`timeout waiting for ${label}`));
        }, ms);
      }),
  };
}

test("online P0: create, join, frames, decisions, pause, reclaim", async () => {
  const server = createOnlineServer({ port: 0 });
  await new Promise((resolve) => server.wss.on("listening", resolve));
  const url = `ws://localhost:${server.port()}`;
  const [teamA, teamB] = server.presets.slice(0, 2);
  assert.notEqual(teamA.id, teamB.id);

  const clients = [];
  const track = (c) => {
    clients.push(c);
    return c;
  };
  try {
  const a = track(await connect(url));
  const b = track(await connect(url));
  await a.waitFor((m) => m.type === "welcome", "welcome A");
  await b.waitFor((m) => m.type === "welcome", "welcome B");

  a.send({ type: "create", name: "Alice", teamId: teamA.id });
  const roomMsg = await a.waitFor((m) => m.type === "room", "room");
  assert.equal(roomMsg.side, "home");

  b.send({ type: "join", code: roomMsg.code, name: "Bob", teamId: teamB.id });
  await b.waitFor((m) => m.type === "room", "room B");
  const joinedA = await a.waitFor((m) => m.type === "joined", "joined A");
  const joinedB = await b.waitFor((m) => m.type === "joined", "joined B");
  assert.equal(joinedA.side, "home");
  assert.equal(joinedB.side, "away");
  assert.equal(joinedA.home.roster.length, 12);

  const frame1 = await a.waitFor((m) => m.type === "frame", "first frame");
  assert.equal(frame1.home.onCourt.length, 5);
  assert.equal(frame1.paused, false);

  // Valid sub from Alice applies and shows up in the next frame.
  const outId = joinedA.home.onCourt[0].id;
  const inId = joinedA.home.bench[0].id;
  a.send({ type: "decision", decision: { kind: "sub", outId, inId } });
  await a.waitFor(
    (m) => m.type === "decision_applied" && m.kind === "sub",
    "sub applied"
  );
  const frameAfterSub = await a.waitFor(
    (m) => m.type === "frame" && m.home.onCourt.some((p) => p.id === inId),
    "frame with sub"
  );
  assert.equal(frameAfterSub.home.onCourt.some((p) => p.id === outId), false);

  // Bob cannot sub Alice's players: rejected, game unaffected.
  b.send({ type: "decision", decision: { kind: "sub", outId, inId } });
  const rejected = await b.waitFor(
    (m) => m.type === "decision_rejected",
    "rejected sub"
  );
  assert.match(rejected.reason, /场上\/板凳/);

  // Timeout pauses; resume restarts.
  a.send({ type: "decision", decision: { kind: "timeout" } });
  await a.waitFor((m) => m.type === "decision_applied" && m.kind === "timeout", "timeout applied");
  await a.waitFor((m) => m.type === "frame" && m.paused === true, "paused frame");
  a.send({ type: "decision", decision: { kind: "resume" } });
  await a.waitFor((m) => m.type === "frame" && m.paused === false, "resumed frame");

  // Bob disconnects: Alice sees the pause. Bob reclaims his seat by name.
  b.ws.close();
  await a.waitFor(
    (m) => m.type === "frame" && m.paused === true,
    "paused after disconnect"
  );
  const b2 = track(await connect(url));
  await b2.waitFor((m) => m.type === "welcome", "welcome B2");
  b2.send({ type: "join", code: roomMsg.code, name: "Bob", teamId: teamB.id });
  const reclaimed = await b2.waitFor((m) => m.type === "room", "reclaim");
  assert.equal(reclaimed.reclaimed, true);
  assert.equal(reclaimed.side, "away");
  await b2.waitFor((m) => m.type === "joined", "re-joined");

  } finally {
    for (const c of clients) {
      try {
        c.ws.close();
      } catch {}
    }
    await server.close();
  }
});
