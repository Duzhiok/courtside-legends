import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CourtView } from "../js/engine/court.js";

// B113: 94b05004 (B97 #8) added modeTip/fxTip, but its test only pins the
// court.js zh defaults — dropping the app.js L() wiring leaves the test
// green and English users silently fall back to the Chinese default.
// These tests pin the wiring: app.js passes both tips through L(), and
// explicit labels actually land on the buttons' title attribute.

globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.document = { createElement: () => makeEl() };

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
    "#court-fx-btn": makeEl(),
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

function snap() {
  const homeCourt = ["C", "PF", "SF", "SG", "PG"].map(
    (pos, i) => player(`h${i}`, `Home Player ${i + 1}`, pos, 0)
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

const CJK = /[\u4e00-\u9fff]/;

test("B113: app.js passes modeTip/fxTip through L() in newCourtView", () => {
  const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const modeTip = src.match(/modeTip: L\("([^"]+)", "([^"]+)"\)/);
  const fxTip = src.match(/fxTip: L\("([^"]+)", "([^"]+)"\)/);
  assert.ok(modeTip, "newCourtView passes modeTip via L()");
  assert.ok(fxTip, "newCourtView passes fxTip via L()");
  assert.match(modeTip[1], /简易小人/);
  assert.match(fxTip[1], /不影响比赛结果/);
  assert.ok(!CJK.test(modeTip[2]), `modeTip English has no CJK: ${modeTip[2]}`);
  assert.ok(!CJK.test(fxTip[2]), `fxTip English has no CJK: ${fxTip[2]}`);
  assert.match(fxTip[2], /never changes the score/);
});

test("B113: explicit labels land on the look/effects buttons' title", () => {
  const root = makeRoot();
  const view = new CourtView(root, {
    labels: {
      modeTip: "Click to switch how players look: simple figures / photos",
      fxTip: "Click to turn court animation on/off; it never changes the score",
    },
  });
  view.render(snap());
  assert.equal(
    root._parts["#court-mode-btn"].title,
    "Click to switch how players look: simple figures / photos"
  );
  assert.equal(
    root._parts["#court-fx-btn"].title,
    "Click to turn court animation on/off; it never changes the score"
  );
});
