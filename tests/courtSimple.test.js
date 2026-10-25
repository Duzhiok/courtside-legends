import test from "node:test";
import assert from "node:assert/strict";
import { CourtView } from "../js/engine/court.js";

// CourtView schedules animation frames while a push is in progress;
// Node has no rAF, and the tests drive renders manually, so no-op it.
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

// rebuildTokens creates token divs via the global document.
globalThis.document = { createElement: () => makeEl() };

/**
 * Simple capsule players (R66): the same CourtView positions, but tokens
 * render as CSS figures (head + body + name) instead of photo avatars.
 * court.js is DOM code, so the tests run it against small element stubs.
 * The stubs only need what CourtView touches: innerHTML, appendChild,
 * querySelector (by id on the root, by class on tokens), style, and a
 * Set-backed classList.
 */

function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => {
      if (force === undefined) set.has(c) ? set.delete(c) : set.add(c);
      else if (force) set.add(c);
      else set.delete(c);
    },
    contains: (c) => set.has(c),
  };
}

function makeEl() {
  const children = [];
  const bySelector = new Map();
  let html = "";
  return {
    tagName: "DIV",
    className: "",
    get innerHTML() {
      return html;
    },
    // Clearing innerHTML must drop children, like a real element:
    // rebuildTokens relies on this to replace the token set.
    set innerHTML(v) {
      html = v;
      if (v === "") children.length = 0;
    },
    style: {},
    children,
    classList: makeClassList(),
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    querySelector: (sel) => {
      if (!bySelector.has(sel)) {
        bySelector.set(sel, { textContent: "", classList: makeClassList(), style: {} });
      }
      return bySelector.get(sel);
    },
    addEventListener: () => {},
  };
}

function makeRoot() {
  const parts = {
    "#court-stage": makeEl(),
    "#court-tokens": makeEl(),
    "#court-ball": makeEl(),
    "#court-formation": makeEl(),
    "#court-mode-btn": makeEl(),
  };
  return {
    querySelector: (sel) => parts[sel] || null,
    innerHTML: "",
    _parts: parts,
  };
}

function player(id, name, pos, pts = 0) {
  return { id, name, pos, playPos: pos, stats: { pts } };
}

function snap(ptsHome = 0) {
  const homeCourt = ["C", "PF", "SF", "SG", "PG"].map(
    (pos, i) => player(`h${i}`, `Home Player ${i + 1}`, pos, ptsHome)
  );
  const awayCourt = ["C", "PF", "SF", "SG", "PG"].map(
    (pos, i) => player(`a${i}`, `Away Player ${i + 1}`, pos, 0)
  );
  return {
    possession: "home",
    home: { name: "主队", tactic: { id: "balanced", name: "均衡" }, onCourt: homeCourt },
    away: { name: "客队", tactic: { id: "balanced", name: "均衡" }, onCourt: awayCourt },
  };
}

function setup() {
  const root = makeRoot();
  const view = new CourtView(root);
  view.render(snap());
  return { root, view };
}

test("court simple: photo mode renders avatar images, simple mode renders capsules", () => {
  const { root, view } = setup();
  const tokenBox = root._parts["#court-tokens"];
  assert.equal(view.simple, false);
  assert.ok(tokenBox.children.length === 10, "5v5 tokens");
  assert.ok(tokenBox.children.every((el) => el.innerHTML.includes("<img")));
  assert.ok(tokenBox.children.every((el) => !el.innerHTML.includes("tok-figure")));

  view.setSimpleMode(true);
  assert.equal(view.simple, true);
  assert.ok(tokenBox.children.every((el) => el.innerHTML.includes("tok-figure")));
  assert.ok(tokenBox.children.every((el) => !el.innerHTML.includes("<img")));
  assert.ok(tokenBox.children.every((el) => el.className.includes("simple")));
  // Capsule bodies carry the position letters, names stay visible.
  const first = tokenBox.children[0];
  assert.match(first.innerHTML, /tok-body/);
  assert.match(first.innerHTML, /tok-name/);

  view.setSimpleMode(false);
  assert.ok(tokenBox.children.every((el) => el.innerHTML.includes("<img")));
});

test("court simple: points keep updating through moveToken in simple mode", () => {
  const { root, view } = setup();
  view.setSimpleMode(true);
  const tokenBox = root._parts["#court-tokens"];
  const firstToken = tokenBox.children[0];
  const ptsEl = firstToken.querySelector(".tok-pts");
  view.render(snap(12));
  assert.equal(ptsEl.textContent, "12");
});

test("court simple: pushing class follows the 2.6s push phase", () => {
  const { root, view } = setup();
  const stage = root._parts["#court-stage"];
  // Fresh possession change starts the push: phase < 1.
  assert.equal(stage.classList.contains("pushing"), true);
  // A re-render long after the phase started ends the push.
  view._phaseStart = performance.now() - 5000;
  view.render(snap());
  assert.equal(stage.classList.contains("pushing"), false);
});
