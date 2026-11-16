// A-P2-11: static screens reuse the Shell's scroll-to-top + focus-to-heading.
//
// Drives the real scrollScreenToTop / focusScreenHeading helpers from
// js/ui/screenShell.js against a minimal fake DOM (same idea as
// tests/screenShellModal.test.js — small element stubs, no jsdom), plus an
// integration check that mountScreen's activate() still scrolls to top and
// focuses the heading through those helpers. The app's show() calls the
// same two helpers for screens without __shell; show() itself lives in
// js/app.js and has no unit-test entry point (no test imports app.js).
import test from "node:test";
import assert from "node:assert/strict";
import { mountScreen, scrollScreenToTop, focusScreenHeading } from "../js/ui/screenShell.js";

globalThis.CSS = { escape: (s) => String(s) };

// Fake MutationObserver: classList changes notify observers synchronously
// (the real one fires on a microtask; the shell only reads the class list).
const observers = new Map();
function notifyObservers(el) {
  for (const cb of observers.get(el) || []) cb();
}
globalThis.MutationObserver = class {
  constructor(cb) {
    this.cb = cb;
  }
  observe(el) {
    if (!observers.has(el)) observers.set(el, []);
    observers.get(el).push(this.cb);
  }
  disconnect() {
    for (const list of observers.values()) {
      const i = list.indexOf(this.cb);
      if (i >= 0) list.splice(i, 1);
    }
  }
};

function matchesSelector(node, selector) {
  if (!selector) return false;
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  return node.tagName?.toLowerCase() === selector.toLowerCase();
}

function makeClassList(el) {
  const set = new Set();
  return {
    add: (c) => {
      if (!set.has(c)) {
        set.add(c);
        notifyObservers(el);
      }
    },
    remove: (c) => {
      if (set.delete(c)) notifyObservers(el);
    },
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
    id: "",
    className: "",
    textContent: "",
    _html: "",
    parent: null,
    isConnected: false,
    focusCalls: [],
    scrollCalls: [],
    focus(options) {
      el.focusCalls.push(options || {});
      if (globalThis.document) globalThis.document.activeElement = el;
    },
    scrollTo(x, y) {
      el.scrollCalls.push([x, y]);
    },
    setAttribute(k, v) {
      el[k] = v;
    },
    getAttribute(k) {
      return el[k] ?? null;
    },
    addEventListener(type, fn, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      options?.signal?.addEventListener?.("abort", () => {
        const list = listeners.get(type) || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      });
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    appendChild(child) {
      el.children.push(child);
      child.parent = el;
      child.isConnected = true;
      return child;
    },
    remove() {
      if (el.parent) {
        const i = el.parent.children.indexOf(el);
        if (i >= 0) el.parent.children.splice(i, 1);
        el.parent = null;
      }
      el.isConnected = false;
    },
    contains(node) {
      let at = node;
      while (at) {
        if (at === el) return true;
        at = at.parent;
      }
      return false;
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
  };
  el.classList = makeClassList(el);
  Object.defineProperty(el, "innerHTML", {
    get: () => el._html,
    set: (v) => {
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
  btn.appendChild(span);
  head.appendChild(btn);
  const h2 = makeEl("h2");
  h2.id = html.match(/<h2[^>]*id="([^"]+)"/)?.[1] || "";
  h2.textContent = html.match(/<h2[^>]*>([^<]*)<\/h2>/)?.[1] || "";
  head.appendChild(h2);
  const body = makeEl("div");
  body.id = html.match(/<div[^>]*class="screen-shell-body"[^>]*id="([^"]+)"/)?.[1]
    || html.match(/<div[^>]*id="([^"]+)"[^>]*class="screen-shell-body"/)?.[1] || "";
  body.classList.add("screen-shell-body");
  return [head, body];
}

function makeDoc() {
  const app = makeEl("div");
  app.id = "app";
  const body = makeEl("body");
  const view = makeEl("div");
  view.scrollCalls = [];
  view.scrollTo = (x, y) => view.scrollCalls.push([x, y]);
  const doc = {
    body,
    activeElement: null,
    defaultView: view,
    createElement: (tag) => makeEl(tag),
    querySelector: (sel) => (sel === "#app" ? app : null),
    getElementById: (id) => {
      const walk = (node) => {
        if (node.id === id) return node;
        for (const child of node.children || []) {
          const hit = walk(child);
          if (hit) return hit;
        }
        return null;
      };
      return walk(app) || walk(body);
    },
  };
  return { doc, app, view };
}

function installDoc() {
  const { doc, app, view } = makeDoc();
  globalThis.document = doc;
  return { app, view, doc };
}

test("scrollScreenToTop: app-hosted screen scrolls the window, not the element", () => {
  const { view } = installDoc();
  const el = makeEl("main");
  el.dataset.shellHost = "app";
  scrollScreenToTop(el, globalThis.document);
  assert.deepEqual(view.scrollCalls, [[0, 0]], "window scrolled to top");
  assert.deepEqual(el.scrollCalls, [], "element itself not scrolled");
});

test("scrollScreenToTop: overlay-hosted screen scrolls its own element", () => {
  const { view } = installDoc();
  const el = makeEl("main");
  el.dataset.shellHost = "overlay";
  scrollScreenToTop(el, globalThis.document);
  assert.deepEqual(el.scrollCalls, [[0, 0]], "overlay element scrolled to top");
  assert.deepEqual(view.scrollCalls, [], "window not scrolled");
});

test("scrollScreenToTop: null element is a no-op, no throw", () => {
  installDoc();
  assert.doesNotThrow(() => scrollScreenToTop(null, globalThis.document));
  assert.doesNotThrow(() => scrollScreenToTop(undefined));
});

test("focusScreenHeading: focuses the first h2 with preventScroll, returns true", () => {
  installDoc();
  const el = makeEl("main");
  const h2 = makeEl("h2");
  h2.textContent = "账号";
  const p = makeEl("p");
  el.appendChild(h2);
  el.appendChild(p);
  assert.equal(focusScreenHeading(el), true);
  assert.equal(globalThis.document.activeElement, h2, "heading focused");
  assert.deepEqual(h2.focusCalls, [{ preventScroll: true }]);
});

test("focusScreenHeading: falls back to h1 when there is no h2", () => {
  installDoc();
  const el = makeEl("main");
  const h1 = makeEl("h1");
  h1.textContent = "组建你的传奇阵容";
  el.appendChild(h1);
  assert.equal(focusScreenHeading(el), true);
  assert.equal(globalThis.document.activeElement, h1, "h1 focused");
});

test("focusScreenHeading: no heading returns false and focuses nothing", () => {
  installDoc();
  const el = makeEl("main");
  el.appendChild(makeEl("div"));
  assert.equal(focusScreenHeading(el), false);
  assert.equal(globalThis.document.activeElement, null);
  assert.equal(focusScreenHeading(null), false);
});

test("mountScreen open: shell activate scrolls to top and focuses the heading via the helpers", () => {
  const { app, view, doc } = installDoc();
  const shell = mountScreen({
    id: "static-check",
    title: { zh: "检查", en: "Check" },
    host: "app",
    getLang: () => "zh",
    onBack: () => {},
  });
  const heading = shell.el.querySelector("#static-check-title");
  assert.ok(heading, "shell heading exists");
  assert.equal(app.children.filter((c) => c.id === "screen-static-check").length, 1);
  shell.open();
  assert.deepEqual(view.scrollCalls, [[0, 0]], "activate scrolled the window to top");
  assert.equal(doc.activeElement, heading, "activate focused the heading");
  // Re-open focuses again: the wiring runs on every activation, not just the first.
  shell.close();
  shell.open();
  assert.equal(heading.focusCalls.length, 2, "heading focused on each activation");
  assert.deepEqual(view.scrollCalls, [[0, 0], [0, 0]], "window scrolled on each activation");
});
