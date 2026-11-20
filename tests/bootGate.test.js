import test from "node:test";
import assert from "node:assert/strict";
import { createGate, deferUntil } from "../js/ui/bootGate.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("a deferred call does not run until the gate opens, then runs with its arguments and returns its value", async () => {
  const gate = createGate();
  const seen = [];
  const run = deferUntil(gate, async (a, b) => { seen.push([a, b]); return a + b; });
  const result = run(1, 2);
  await tick();
  assert.deepEqual(seen, [], "must not run while the gate is closed");
  assert.equal(gate.isOpen, false);
  gate.open();
  assert.equal(await result, 3);
  assert.deepEqual(seen, [[1, 2]]);
});

test("calls queued before the gate opens all run once, in order; calls after it run immediately", async () => {
  const gate = createGate();
  const order = [];
  const run = deferUntil(gate, async (n) => { order.push(n); });
  const a = run("a");
  const b = run("b");
  gate.open();
  await Promise.all([a, b]);
  await run("c");
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("opening is idempotent and the gate never closes", async () => {
  const gate = createGate();
  gate.open();
  gate.open();
  assert.equal(gate.isOpen, true);
  await gate.ready;
  assert.equal(await deferUntil(gate, async () => "ok")(), "ok");
});

test("an error from the deferred function reaches the caller (My World's own catch keeps the static portrait)", async () => {
  const gate = createGate();
  gate.open();
  await assert.rejects(deferUntil(gate, async () => { throw new Error("no webgl"); })(), /no webgl/);
});

test("app.js wires it: My World's avatar mount waits for the gate, and the gate opens right when the boot flag is set", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.ok(/mountAvatar:\s*deferUntil\(bootGate,/.test(app), "createMyWorld must get the deferred avatar mount");
  assert.ok(/window\.__rosterBootOk = true;\s*\n\s*bootGate\.open\(\);/.test(app), "the gate must open exactly when boot is marked done");
});
