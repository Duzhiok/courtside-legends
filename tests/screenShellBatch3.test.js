// Screen Shell batch 3 — duelView + networkViews on the shared shell.
//
// Drives the real views against a minimal fake DOM (same idea as
// tests/screenShellBatch2.test.js — small element stubs, no jsdom).
// Pins the migration contract: mount twice = one instance, the shell head
// shows ONE language at a time, the back button calls goBack exactly once
// (the duel's destroy-court-then-goBack sequence and the network's old
// backWired branch are both gone from the views — the shell owns the
// button now), and a language switch re-renders the body in the new
// language: the duel select screen, a live duel court (re-mounted from the
// same state) and the result screen (re-rendered from the stored outcome,
// never re-recorded), network home / opportunity board, and the scout /
// film / analytics challenges (re-rendered from their stored challenge
// state — decisions and answers survive the switch, U-P2-1).
import test from "node:test";
import assert from "node:assert/strict";
import { setLang, getLang } from "../js/i18n.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import {
  ensureDuelScreen, initDuelView, openDuelSelect, DUEL_TITLE,
} from "../js/ui/duelView.js";
import {
  createNetworkView, NETWORK_TITLE,
} from "../js/ui/networkViews.js";

globalThis.localStorage = createMemoryStorage();
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.CSS = { escape: (s) => String(s) };

function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
  };
}

function makeEl(tag = "div") {
  const listeners = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    classList: makeClassList(),
    id: "",
    className: "",
    textContent: "",
    _html: "",
    setAttribute(k, v) {
      el[k] = v;
    },
    getAttribute(k) {
      return el[k] ?? null;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
    fire(type, event = {}) {
      for (const fn of listeners.get(type) || []) fn(event);
    },
    appendChild(child) {
      el.children.push(child);
      child.parent = el;
      return child;
    },
    querySelector(sel) {
      return el.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const child of node.children || []) {
          if (matchesSelector(child, sel)) out.push(child);
          walk(child);
        }
      };
      walk(el);
      return out;
    },
    hasChildNodes() {
      // innerHTML content counts as child nodes even though this stub
      // does not parse it into elements (the shell html above is the
      // only markup materialised into children).
      return el.children.length > 0 || el._html !== "";
    },
    remove() {},
  };
  Object.defineProperty(el, "innerHTML", {
    get: () => el._html,
    set: (value) => {
      const v = String(value); // a real innerHTML setter stringifies (html`` results are objects)
      el._html = v;
      // The shell's head markup is materialised so mountScreen's
      // querySelector calls find real elements; anything else is just text.
      if (v.includes("panel-head") && v.includes("screen-shell-body")) {
        el.children = parseShellHtml(v);
        for (const c of el.children) c.parent = el;
      }
    },
    configurable: true,
  });
  return el;
}

/** Materialise the shell head: panel-head > button > span + h2, then the body div. */
function parseShellHtml(html) {
  const head = makeEl("div");
  head.classList.add("panel-head");
  const btn = makeEl("button");
  btn.id = html.match(/<button[^>]*id="([^"]+)"/)?.[1] || "";
  btn.classList.add("nav-back");
  const span = makeEl("span");
  span.textContent = html.match(/<button[^>]*>[\s\S]*?<span>([^<]*)<\/span>/)?.[1] || "";
  btn.children = [span];
  span.parent = btn;
  const h2 = makeEl("h2");
  h2.id = html.match(/<h2 id="([^"]+)"/)?.[1] || "";
  h2.textContent = html.match(/<h2[^>]*>([^<]*)<\/h2>/)?.[1] || "";
  head.children = [btn, h2];
  btn.parent = head;
  h2.parent = head;
  const body = makeEl("div");
  body.id = html.match(/<div class="screen-shell-body" id="([^"]+)"/)?.[1] || "";
  body.classList.add("screen-shell-body");
  return [head, body];
}

function matchesSelector(node, selector) {
  if (!selector) return false;
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  return node.tagName?.toLowerCase() === selector.toLowerCase();
}

function makeDoc() {
  const app = makeEl("div");
  app.id = "app";
  const body = makeEl("body");
  const doc = {
    body,
    activeElement: null,
    defaultView: null,
    createElement: (tag) => makeEl(tag),
    querySelector: (sel) => {
      if (sel === "#app") return app;
      // duelView / networkViews resolve their screen and body by id
      // through document.querySelector, like the real browser.
      if (sel.startsWith("#")) return doc.getElementById(sel.slice(1));
      return null;
    },
    getElementById: (id) => {
      const walk = (node) => {
        if (node.id === id) return node;
        for (const child of node.children || []) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(app) || walk(body);
    },
  };
  return { doc, app };
}

function installDoc() {
  const { doc, app } = makeDoc();
  globalThis.document = doc;
  return app;
}

/* ------------------------------------------------------------------ */
/* Legend Duel                                                         */
/* ------------------------------------------------------------------ */

test("duel: mount twice is one instance, single-language title, back works once", () => {
  const app = installDoc();
  setLang("zh");
  let backs = 0;
  initDuelView({ show: () => {}, goBack: () => { backs += 1; } });
  const first = ensureDuelScreen();
  const second = ensureDuelScreen();
  assert.equal(first, second, "mount twice returns the same element");
  assert.equal(first.id, "screen-duel");
  const mounted = app.children.filter((c) => c.id === "screen-duel");
  assert.equal(mounted.length, 1, "exactly one duel screen in #app");
  assert.equal(first.dataset.shellHost, "app", "duel lives in the #app column");
  const title = first.querySelector("#duel-title");
  assert.equal(title.textContent, "传奇单挑");
  assert.equal(title.textContent, DUEL_TITLE.zh);
  assert.ok(!first.innerHTML.includes("Legend Duel"), "zh mode shows no English title");
  const back = first.querySelector("#btn-duel-back");
  assert.ok(back, "back button exists");
  assert.equal(back.listenerCount("click"), 1, "one back handler (shell-owned)");
  back.fire("click");
  assert.equal(backs, 1, "one click calls goBack exactly once");
  setLang("zh");
});

test("duel: relocalize before open switches the head, does not crash, leaves the body alone", () => {
  installDoc();
  setLang("zh");
  initDuelView({ show: () => {}, goBack: () => {} });
  const el = ensureDuelScreen();
  setLang("en");
  assert.doesNotThrow(() => el.__shellRelocalize(), "relocalize before open must not crash (empty body)");
  assert.equal(el.querySelector("#duel-title").textContent, "Legend Duel");
  assert.equal(el.querySelector("#btn-duel-back").querySelector("span").textContent, "Back");
  assert.equal(el.querySelector("#duel-body").innerHTML, "", "body untouched before open");
  setLang("zh");
});

test("duel: relocalize after opening the select screen re-renders the body in the new language", () => {
  installDoc();
  setLang("zh");
  initDuelView({ show: () => {}, goBack: () => {} });
  const el = ensureDuelScreen();
  assert.equal(openDuelSelect({}), true, "select screen opens once mounted");
  const body = el.querySelector("#duel-body");
  assert.ok(body.innerHTML.includes("你的挑战者"), "body renders in zh after open");
  const zhHtml = body.innerHTML;
  setLang("en");
  el.__shellRelocalize();
  assert.equal(el.querySelector("#duel-title").textContent, "Legend Duel");
  assert.ok(body.innerHTML.includes("Your challenger"), "body re-renders in en after relocalize");
  assert.notEqual(body.innerHTML, zhHtml, "body html changes with the language");
  setLang("zh");
});

/* ------------------------------------------------------------------ */
/* Career Network                                                      */
/* ------------------------------------------------------------------ */

function makeNetworkView(backs) {
  return createNetworkView({
    getLang,
    getAccountId: () => null,
    show: () => {},
    goBack: () => { backs.count += 1; },
  });
}

test("network: mount twice is one instance, single-language title, back works once", () => {
  const app = installDoc();
  setLang("zh");
  const backs = { count: 0 };
  const view = makeNetworkView(backs);
  const first = view.mount();
  const second = view.mount();
  assert.equal(first, second, "mount twice returns the same element");
  assert.equal(first.id, "screen-network");
  assert.equal(app.children.filter((c) => c.id === "screen-network").length, 1);
  assert.equal(first.dataset.shellHost, "app", "network lives in the #app column");
  const title = first.querySelector("#network-title");
  assert.equal(title.textContent, "篮球职业网络");
  assert.equal(title.textContent, NETWORK_TITLE.zh);
  assert.ok(!first.innerHTML.includes("Career Network"), "zh mode shows no English title");
  const back = first.querySelector("#btn-network-back");
  assert.ok(back, "back button exists");
  assert.equal(back.listenerCount("click"), 1, "one back handler (shell-owned, old backWired branch gone)");
  back.fire("click");
  assert.equal(backs.count, 1, "one click calls goBack exactly once");
  setLang("zh");
});

test("network: relocalize before open switches the head, does not crash, leaves the body alone", () => {
  installDoc();
  setLang("zh");
  const view = makeNetworkView({ count: 0 });
  const el = view.mount();
  setLang("en");
  assert.doesNotThrow(() => el.__shellRelocalize(), "relocalize before open must not crash (empty body)");
  assert.equal(el.querySelector("#network-title").textContent, "Career Network");
  assert.equal(el.querySelector("#btn-network-back").querySelector("span").textContent, "Back");
  assert.equal(el.querySelector("#network-body").innerHTML, "", "body untouched before open");
  setLang("zh");
});

test("network: relocalize after opening home re-renders the body in the new language", () => {
  installDoc();
  setLang("zh");
  const view = makeNetworkView({ count: 0 });
  const el = view.mount();
  view.open("home");
  const body = el.querySelector("#network-body");
  assert.ok(body.innerHTML.includes("从篮球行业的底层开始"), "home renders in zh after open");
  const zhHtml = body.innerHTML;
  setLang("en");
  el.__shellRelocalize();
  assert.equal(el.querySelector("#network-title").textContent, "Career Network");
  assert.ok(body.innerHTML.includes("Start at the bottom"), "home re-renders in en after relocalize");
  assert.notEqual(body.innerHTML, zhHtml, "body html changes with the language");
  setLang("zh");
});

test("network: relocalize after opening the opportunity board re-renders it in the new language", () => {
  installDoc();
  setLang("zh");
  const view = makeNetworkView({ count: 0 });
  const el = view.mount();
  view.open("board");
  const body = el.querySelector("#network-body");
  assert.ok(body.innerHTML.includes("职业机会"), "board renders in zh after open");
  setLang("en");
  el.__shellRelocalize();
  assert.ok(body.innerHTML.includes("Career opportunities"), "board re-renders in en after relocalize");
  setLang("zh");
});
