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

test("court simple: photo mode renders avatar images, simple mode renders humanoid figures", () => {
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
  // Humanoid figures: jersey torso with position letters, two arms,
  // two legs, names stay visible.
  const first = tokenBox.children[0];
  assert.match(first.innerHTML, /tok-torso/);
  assert.match(first.innerHTML, /tok-arm left/);
  assert.match(first.innerHTML, /tok-arm right/);
  assert.match(first.innerHTML, /tok-leg left/);
  assert.match(first.innerHTML, /tok-leg right/);
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

test("court shot arc: made shot flies shooter to rim and ends clean", () => {
  const { view } = setup();
  // SG (h3) sits off-center, so the arc's travel is actually measurable.
  view.onShot({ shooterId: "h3", made: true });
  assert.ok(view._shot);
  // The arc starts exactly where the shooter token stands.
  assert.deepEqual(view._shot.from, view._lastTokenPos.get("home-h3"));
  assert.equal(view._shot.to.y, 6); // home attacks the top rim
  const start = view._shot.start;
  const fromX = view._shot.from.x;
  const fromY = view._shot.from.y;
  view._shotFrame(start + 375); // mid-flight
  const midLeft = parseFloat(view.ball.style.left);
  const midTop = parseFloat(view.ball.style.top);
  assert.ok(midLeft > fromX && midLeft < 50, `mid x ${midLeft} should travel ${fromX} -> 50`);
  assert.ok(midTop < fromY && midTop > 6, `mid y ${midTop} should travel ${fromY} -> 6`);
  assert.equal(view.ball.style.width, "20px"); // peak height reads as size
  view._shotFrame(start + 750 + 150 + 1); // past the net phase
  assert.equal(view._shot, null);
  assert.equal(view.ball.style.transition, "");
  assert.equal(view.ball.style.width, "");
});

test("court shot arc: missed shot bounces off the rim and settles short", () => {
  const { view } = setup();
  view.onShot({ shooterId: "h3", made: false });
  const start = view._shot.start;
  view._shotFrame(start + 750 + 300 + 1); // past the bounce phase
  assert.equal(view._shot, null);
  assert.equal(parseFloat(view.ball.style.left), 50);
  assert.ok(Math.abs(parseFloat(view.ball.style.top) - 10) < 0.01); // rim 6 + 4 settle
});

test("court shot arc: render during flight does not move the ball", () => {
  const { view } = setup();
  view.onShot({ shooterId: "h3", made: true });
  view._shotFrame(view._shot.start + 200);
  const left = view.ball.style.left;
  const top = view.ball.style.top;
  view.render(snap());
  assert.equal(view.ball.style.left, left);
  assert.equal(view.ball.style.top, top);
});

test("court shot arc: onShot before any render is a silent no-op", () => {
  const root = makeRoot();
  const view = new CourtView(root);
  view.onShot({ shooterId: "h3", made: true });
  assert.equal(view._shot, null);
});
