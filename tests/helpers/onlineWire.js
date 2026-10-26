// Shared WebSocket test helpers for the online server tests. (The older online*.test.js files each carry
// their own copy of these; new tests import this one instead of adding a seventh.)
import WebSocket from "ws";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tmpFile(tag) {
  return join(tmpdir(), `courtside-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

/** Open a socket and collect every JSON message it receives. `options` go to the ws client (e.g. a TLS `ca`). */
export function connect(url, options) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    const messages = [];
    ws.on("message", (raw) => {
      try {
        messages.push(JSON.parse(raw));
      } catch {
        /* ignore non-JSON */
      }
    });
    ws.on("open", () => resolve({ ws, messages }));
    ws.on("error", reject);
  });
}

/** Resolve with the first message matching `pred`, or throw after `timeoutMs`. */
export async function waitFor(messages, pred, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = messages.find(pred);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out waiting for a message");
}

/** Like waitFor, but resolves null on timeout, for asserting that something does NOT happen. */
export async function maybeWaitFor(messages, pred, timeoutMs = 400) {
  try {
    return await waitFor(messages, pred, timeoutMs);
  } catch {
    return null;
  }
}

/** Send one JSON message. */
export const sendJson = (client, payload) => client.ws.send(JSON.stringify(payload));

/** Register (unless `register: false`) and log in; resolves with the socket plus its session token. */
export async function loginClient(url, name, { register = true, options } = {}) {
  const c = await connect(url, options);
  if (register) {
    sendJson(c, { type: "register", name, password: "secret" });
    await waitFor(c.messages, (m) => m.type === "registered");
  }
  sendJson(c, { type: "login", name, password: "secret" });
  const logged = await waitFor(c.messages, (m) => m.type === "logged_in");
  return { ...c, token: logged.token };
}

/** Fetch an account's market view (gold, roster, listings). */
export async function marketOf(c) {
  const before = c.messages.filter((m) => m.type === "market").length;
  sendJson(c, { type: "market_board", token: c.token });
  return waitFor(c.messages, (m) => m.type === "market" && c.messages.filter((x) => x.type === "market").indexOf(m) >= before);
}
