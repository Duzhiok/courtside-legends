// 2026-11 code review, data / security batch. Every test here failed before its fix.
import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import WebSocket from "ws";
import { photoImg, bbrefHeadshotUrl } from "../js/data/photo.js";
import { toSafeDisplayName, isSafeDisplayName } from "../js/data/saveNames.js";
import { pruneDatedKeys } from "../js/data/account.js";
import { isFinishedSimSave, resumeRoute } from "../js/ui/saveResume.js";
import { createAccountStore, MAX_LOGIN_FAILURES } from "../server/online-accounts.mjs";
import { createOnlineServer, ROOM_TTL_MS, MSG_BURST } from "../server/online-server.mjs";

const tmp = (tag) => join(tmpdir(), `courtside-review-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

test("photoImg: a crafted bref / stored photo from an edited save cannot break out of the src attribute", () => {
  const evil = '" onerror="alert(1)" x="';
  const html = photoImg({ name: "Mal", bref: `ab${evil}`, photo: `assets/avatars/a${evil}`, season: 2000 });
  assert.doesNotMatch(html, /onerror=/, html);
  assert.equal(bbrefHeadshotUrl(`ab${evil}`), null, "a bref that is not letters + digits never becomes a URL");
  assert.match(bbrefHeadshotUrl("jamesle01"), /\/jamesle01\.jpg$/);
});

test("My Team: an account name with < > or a long one still makes a saveable team name", () => {
  const name = `${toSafeDisplayName("<b>Zhi</b> & co", 56)} 班底`;
  assert.equal(isSafeDisplayName(name), true, name);
  assert.equal(isSafeDisplayName(`${toSafeDisplayName("x".repeat(80), 56)} 班底`), true);
});

test("pruneDatedKeys: once-per-day keys older than 30 days go, recent and undated keys stay", () => {
  const once = { "login:2026-09-01": "login", "task:win:2026-11-20": "dailyTask", "2026-10-01": 3, "level:5": "claim" };
  assert.equal(pruneDatedKeys(once, "2026-11-24"), 2);
  assert.deepEqual(Object.keys(once).sort(), ["level:5", "task:win:2026-11-20"]);
});

test("resume: a saved sim that already reached its final buzzer is not resumed as a live game (no second payout)", () => {
  const done = { quarter: 4, clock: 0, score: { home: 101, away: 99 } };
  assert.equal(isFinishedSimSave(done), true);
  assert.equal(isFinishedSimSave({ quarter: 4, clock: 0, score: { home: 99, away: 99 } }), false, "tied: overtime follows");
  assert.equal(isFinishedSimSave({ quarter: 3, clock: 0, score: { home: 1, away: 0 } }), false);
  assert.equal(resumeRoute({ sim: done, screen: "game" }, { career: { kind: "career" } }), "market");
  assert.equal(resumeRoute({ sim: { quarter: 2, clock: 300, score: { home: 0, away: 0 } } }, {}), "game");
});

test("accounts: wrong guesses lock that address only, not the account for everyone", () => {
  const file = tmp("lock");
  try {
    const store = createAccountStore({ file });
    store.register("Alice", "secret99");
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) store.verify("Alice", "wrong", "6.6.6.6");
    assert.equal(store.isLocked("Alice", "6.6.6.6"), true);
    assert.equal(store.isLocked("Alice", "1.2.3.4"), false);
    assert.equal(store.verify("Alice", "secret99", "1.2.3.4"), true, "the real owner still logs in");
  } finally {
    rmSync(file, { force: true });
  }
});

test("accounts: a session expires after the TTL without use, and use slides it", () => {
  const file = tmp("sess");
  let t = 1_000_000;
  try {
    const store = createAccountStore({ file, now: () => t, sessionTtlMs: 1000 });
    store.register("Bob", "secret99");
    const token = store.createSession("Bob");
    t += 900;
    assert.equal(store.getSession(token), "Bob");
    t += 900; // 1800 after creation, 900 after the last use
    assert.equal(store.getSession(token), "Bob", "sliding expiry");
    t += 1001;
    assert.equal(store.getSession(token), null);
  } finally {
    rmSync(file, { force: true });
  }
});

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    ws.on("message", (raw) => messages.push(JSON.parse(raw)));
    ws.once("open", () => resolve({ ws, messages }));
    ws.once("error", reject);
  });
}
const until = async (pred, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

test("online server: a room both players left is swept after the TTL", async () => {
  const server = createOnlineServer({ port: 0, graceMs: 50, accountsFile: tmp("acc"), economyFile: tmp("eco") });
  await new Promise((r) => server.wss.on("listening", r));
  try {
    const url = `ws://localhost:${server.port()}`;
    const [tA, tB] = server.presets.slice(0, 2);
    const a = await connect(url);
    const b = await connect(url);
    a.ws.send(JSON.stringify({ type: "create", name: "Alice", teamId: tA.id }));
    await until(() => a.messages.some((m) => m.type === "room"));
    const code = a.messages.find((m) => m.type === "room").code;
    b.ws.send(JSON.stringify({ type: "join", code, name: "Bob", teamId: tB.id }));
    await until(() => b.messages.some((m) => m.type === "joined"));
    assert.equal(server.roomCount(), 1);
    a.ws.close();
    b.ws.close();
    await new Promise((r) => setTimeout(r, 200));
    const now = Date.now();
    server.sweepRooms(now);
    assert.equal(server.roomCount(), 1, "kept inside the TTL");
    server.sweepRooms(now + ROOM_TTL_MS);
    assert.equal(server.roomCount(), 0, "gone after it");
  } finally {
    await server.close();
  }
});

test("online server: a message flood is throttled per connection", async () => {
  const server = createOnlineServer({ port: 0, accountsFile: tmp("acc2"), economyFile: tmp("eco2") });
  await new Promise((r) => server.wss.on("listening", r));
  try {
    const c = await connect(`ws://localhost:${server.port()}`);
    for (let i = 0; i < MSG_BURST + 30; i++) c.ws.send(JSON.stringify({ type: "decision", decision: { kind: "timeout" } }));
    assert.ok(await until(() => c.messages.some((m) => m.type === "decision_rejected" && /频繁/.test(m.reason))), "told to slow down");
  } finally {
    await server.close();
  }
});
