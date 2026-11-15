// Browser capability checks (A-P2-2: webglAvailable moved from ui/avatar3d.js
// to js/core/capabilities.js so engine/ no longer imports from ui/).
import test from "node:test";
import assert from "node:assert/strict";
import { webglAvailable } from "../js/core/capabilities.js";

const fakeDoc = (ctx) => ({
  createElement: () => ({ getContext: (kind) => ctx[kind] ?? null }),
});

test("webglAvailable: true when webgl2 context exists", () => {
  assert.equal(webglAvailable(fakeDoc({ webgl2: {} })), true);
});

test("webglAvailable: falls back to webgl when webgl2 is missing", () => {
  assert.equal(webglAvailable(fakeDoc({ webgl: {} })), true);
});

test("webglAvailable: false when neither context exists", () => {
  assert.equal(webglAvailable(fakeDoc({})), false);
});

test("webglAvailable: false (not a throw) when createElement throws", () => {
  assert.equal(webglAvailable({ createElement: () => { throw new Error("no DOM"); } }), false);
});
