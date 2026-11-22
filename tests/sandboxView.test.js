// mountSandbox's addCard (the 3v3 player pool's way in): same limits and errors
// as the +1 button, and the roster + search results re-render behind it.
// Minimal fake DOM: stubs keyed by the exact selectors the picker queries.
import test from "node:test";
import assert from "node:assert/strict";
import { mountSandbox } from "../js/ui/sandboxView.js";

const esc = (v) => String(v ?? "");
const ovrOf = (c) => c.ovr;
const card = (id, ovr = 80) => ({ id, name: id, bref: id, season: 2000, team: "XXX", pos: "SG", ovr });

function fakeEl() {
  return { innerHTML: "", textContent: "", value: "", checked: true, hidden: false, dataset: {}, setAttribute() {} };
}

function mount() {
  const stubs = new Map();
  const root = {
    dataset: {},
    querySelector(sel) {
      if (!stubs.has(sel)) stubs.set(sel, fakeEl());
      return stubs.get(sel);
    },
    addEventListener() {},
  };
  const sb = mountSandbox({
    root,
    pool: () => [],
    ovrOf,
    esc,
    lang: "zh",
    min: 3,
    max: 4,
    unique: true,
    onStart: () => {},
    resultCard: (c) => `<span>${c.name}</span>`,
  });
  return { sb, stubs, text: (sel) => stubs.get(sel)?.textContent ?? "", html: (sel) => stubs.get(sel)?.innerHTML ?? "" };
}

test("addCard adds to the side, updates the count and the roster, and is visible to picksOf", () => {
  const { sb, text, html } = mount();
  assert.equal(sb.addCard("A", card("jordan-1991")), 1);
  assert.equal(text('[data-count="A"]'), "已选 1/4（至少 3）");
  assert.match(html('[data-roster="A"]'), /jordan-1991/);
  assert.deepEqual(sb.picksOf("A").map((c) => c.id), ["jordan-1991"]);
  assert.deepEqual(sb.picksOf("B"), []);
});

test("addCard enforces the same limits as +1: max 4 a side, no duplicate on a side", () => {
  const { sb } = mount();
  for (let i = 0; i < 4; i++) sb.addCard("A", card(`p${i}`));
  assert.throws(() => sb.addCard("A", card("p4")), /每队最多 4 人/);
  assert.throws(() => sb.addCard("A", card("p0")), /每队最多 4 人/); // full first: the max error wins
  const { sb: sb2 } = mount();
  sb2.addCard("B", card("kobe-2006"));
  assert.throws(() => sb2.addCard("B", card("kobe-2006")), /同一名球员每队只能选一次/);
  assert.equal(sb2.picksOf("B").length, 1);
});
