// Screen Shell modal variant (A-P1-5) + the takeover dialog migrated onto it.
//
// Drives the real mountScreen/showTakeoverDialog against a minimal fake DOM
// (same idea as tests/screenShellBatch4.test.js — small element stubs, no
// jsdom). Pins the migration contract: the modal has no panel-head/back
// button, lives on <body> as the overlay host, opens/closes with
// shell.open()/shell.close(), Esc dismisses it AND claims the key (the app's
// global Esc -> goBack handler skips defaultPrevented keys), opening focuses
// the first dialog control and closing restores the opener's focus, and the
// takeover dialog resolves with the chosen option (or null on dismiss) while
// creating no .reborn-takeover-overlay element of its own.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mountScreen } from "../js/ui/screenShell.js";
import { showTakeoverDialog, TAKEOVER_OPTIONS } from "../js/ui/reborn/takeover.js";

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

function matchesSelector(node, selector) {
  if (!selector || selector.includes(":not(")) return false;
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  if (selector.startsWith("[") && selector.endsWith("]")) {
    const inner = selector.slice(1, -1);
    const [key, value] = inner.split("=");
    const dataKey = key.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const actual = node.dataset?.[dataKey];
    return value === undefined ? actual !== undefined : actual === value.replace(/["']/g, "");
  }
  return node.tagName?.toLowerCase() === selector.toLowerCase();
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
    setAttribute(k, v) {
      el[k] = v;
    },
    getAttribute(k) {
      return el[k] ?? null;
    },
    addEventListener(type, fn, options) {
      const capture = typeof options === "object" ? !!options.capture : !!options;
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, capture, signal: options?.signal });
      options?.signal?.addEventListener?.("abort", () => {
        const list = listeners.get(type) || [];
        const i = list.findIndex((l) => l.fn === fn);
        if (i >= 0) list.splice(i, 1);
      });
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const i = list.findIndex((l) => l.fn === fn);
      if (i >= 0) list.splice(i, 1);
    },
    listenerCount(type, capture) {
      return (listeners.get(type) || []).filter((l) => capture === undefined || l.capture === capture).length;
    },
    fire(type, event = {}) {
      for (const { fn } of [...(listeners.get(type) || [])]) fn(event);
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
    closest(selector) {
      let at = el;
      while (at) {
        if (matchesSelector(at, selector)) return at;
        at = at.parent;
      }
      return null;
    },
    querySelector(sel) {
      return el.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      for (const part of String(sel).split(",").map((s) => s.trim())) {
        const walk = (node) => {
          for (const child of node.children || []) {
            if (matchesSelector(child, part)) out.push(child);
            walk(child);
          }
        };
        walk(el);
      }
      return out;
    },
    focus() {
      if (globalThis.document) globalThis.document.activeElement = el;
    },
  };
  el.classList = makeClassList(el);
  Object.defineProperty(el, "innerHTML", {
    get: () => el._html,
    set: (v) => {
      el._html = v;
      // Materialise the shell's own markup so mountScreen's querySelector
      // calls find real elements; anything else is just text.
      if (v.includes("screen-shell-body") && !v.includes("reborn-takeover-dialog")) {
        const body = makeEl("div");
        body.id = v.match(/<div class="screen-shell-body" id="([^"]+)"/)?.[1] || "";
        body.classList.add("screen-shell-body");
        if (v.includes('tabindex="-1"')) body.setAttribute("tabindex", "-1");
        el.children = [body];
        body.parent = el;
      } else if (v.includes("reborn-takeover-dialog")) {
        el.children = [parseTakeoverHtml(v)];
        el.children[0].parent = el;
      }
    },
    configurable: true,
  });
  return el;
}

/** Materialise the takeover dialog: the dialog div with its three option buttons. */
function parseTakeoverHtml(html) {
  const dialog = makeEl("div");
  dialog.classList.add("reborn-takeover-dialog");
  const h2 = makeEl("h2");
  h2.textContent = html.match(/<h2>([^<]*)<\/h2>/)?.[1] || "";
  const options = makeEl("div");
  options.classList.add("reborn-takeover-options");
  for (const [i, option] of TAKEOVER_OPTIONS.entries()) {
    const button = makeEl("button");
    button.classList.add("reborn-takeover-option");
    button.dataset.option = option.id;
    button.dataset.key = String(i + 1);
    const label = makeEl("span");
    label.classList.add("reborn-takeover-label");
    label.textContent = option.zh;
    button.children = [label];
    label.parent = button;
    options.children.push(button);
    button.parent = options;
  }
  dialog.children = [h2, options];
  h2.parent = dialog;
  options.parent = dialog;
  return dialog;
}

function makeDoc() {
  const app = makeEl("div");
  app.id = "app";
  const body = makeEl("body");
  body.isConnected = true;
  const doc = {
    body,
    activeElement: null,
    defaultView: null,
    _listeners: new Map(),
    createElement: (tag) => makeEl(tag),
    querySelector: (sel) => {
      if (sel === "#app") return app;
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
    addEventListener(type, fn, options) {
      const capture = typeof options === "object" ? !!options.capture : !!options;
      if (!doc._listeners.has(type)) doc._listeners.set(type, []);
      doc._listeners.get(type).push({ fn, capture, signal: options?.signal });
      options?.signal?.addEventListener?.("abort", () => {
        const list = doc._listeners.get(type) || [];
        const i = list.findIndex((l) => l.fn === fn);
        if (i >= 0) list.splice(i, 1);
      });
    },
    removeEventListener(type, fn) {
      const list = doc._listeners.get(type) || [];
      const i = list.findIndex((l) => l.fn === fn);
      if (i >= 0) list.splice(i, 1);
    },
    listenerCount(type, capture) {
      return (doc._listeners.get(type) || []).filter((l) => capture === undefined || l.capture === capture).length;
    },
    // Dispatch a keydown the way the browser does: capture listeners on the
    // document first, then bubble listeners — unless stopPropagation ran.
    fireKey(key) {
      const event = {
        key,
        defaultPrevented: false,
        _stopped: false,
        preventDefault() {
          event.defaultPrevented = true;
        },
        stopPropagation() {
          event._stopped = true;
        },
        target: body,
      };
      const list = [...(doc._listeners.get("keydown") || [])];
      for (const { fn, capture } of list) {
        if (!capture) continue;
        fn(event);
        if (event._stopped) return event;
      }
      for (const { fn, capture } of list) {
        if (capture) continue;
        fn(event);
        if (event._stopped) return event;
      }
      return event;
    },
  };
  return { doc, app };
}

function installDoc() {
  observers.clear();
  const { doc } = makeDoc();
  globalThis.document = doc;
  return doc;
}

const FAKE_SIM = {
  you: () => ({ onCourt: [{ id: "p1", name: "Test" }], roster: [] }),
  youSide: "home",
  score: { home: 98, away: 100 },
  clock: 100,
  quarter: 4,
};

test("modal mount: no panel-head/back button, one instance, lives on <body> as the overlay host", () => {
  const doc = installDoc();
  const shell = mountScreen({ id: "takeover", variant: "modal", host: "overlay", doc });
  const again = mountScreen({ id: "takeover", variant: "modal", host: "overlay", doc });
  assert.equal(again, shell, "mount twice returns the same shell");
  assert.equal(shell.el.id, "screen-takeover");
  assert.equal(doc.body.children.filter((c) => c.id === "screen-takeover").length, 1);
  assert.equal(shell.el.dataset.shellHost, "overlay", "modal lives on <body>");
  assert.ok(shell.el.classList.contains("screen-shell-modal"));
  assert.ok(!shell.el.innerHTML.includes("panel-head"), "modal has no panel-head");
  assert.equal(shell.el.querySelector("#btn-takeover-back"), null, "modal has no back button");
  assert.ok(shell.el.querySelector("#takeover-body"), "modal still has its body");
  assert.equal(shell.el.querySelectorAll(".reborn-takeover-overlay").length, 0);
});

test("modal open focuses the first dialog control; close restores the opener's focus", () => {
  const doc = installDoc();
  const opener = makeEl("button");
  opener.id = "opener";
  opener.isConnected = true;
  doc.activeElement = opener;
  const shell = mountScreen({ id: "takeover", variant: "modal", host: "overlay", doc });
  shell.body.innerHTML = `<div class="reborn-takeover-dialog" role="dialog"><h2>关键时刻</h2>`
    + `<div class="reborn-takeover-options">`
    + TAKEOVER_OPTIONS.map((o, i) => `<button type="button" class="reborn-takeover-option" data-option="${o.id}" data-key="${i + 1}"></button>`).join("")
    + `</div></div>`;
  shell.open();
  assert.ok(shell.el.classList.contains("active"));
  const first = shell.body.querySelector("[data-option]");
  assert.equal(doc.activeElement, first, "opening focuses the first option");
  shell.close();
  assert.ok(!shell.el.classList.contains("active"));
  assert.equal(doc.activeElement, opener, "closing restores the opener's focus");
  shell.destroy();
});

test("modal Esc dismisses, claims the key, and never reaches the app's bubble-phase handler", () => {
  const doc = installDoc();
  let dismissed = 0;
  let appSawEsc = 0;
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape") appSawEsc += 1;
  });
  const shell = mountScreen({
    id: "takeover", variant: "modal", host: "overlay",
    onDismiss: () => { dismissed += 1; },
    doc,
  });
  shell.open();
  const event = doc.fireKey("Escape");
  assert.equal(dismissed, 1, "Esc calls onDismiss once");
  assert.equal(event.defaultPrevented, true, "Esc is preventDefaulted so the app's handler skips it");
  assert.equal(appSawEsc, 0, "stopPropagation keeps the app's goBack handler from seeing Esc");
  // Closed modals ignore Esc.
  shell.close();
  doc.fireKey("Escape");
  assert.equal(dismissed, 1, "Esc while closed does not dismiss again");
  shell.destroy();
});

test("showTakeoverDialog resolves with the chosen option on click and on keys 1/2/3", async () => {
  installDoc();
  const doc = globalThis.document;
  const clicked = showTakeoverDialog({ sim: FAKE_SIM, playerId: "p1" });
  const drive = doc.getElementById("screen-takeover").querySelector("[data-option='drive']");
  assert.ok(drive, "dialog renders the drive option");
  doc.getElementById("screen-takeover").fire("click", { target: drive });
  assert.equal(await clicked, "drive");

  const keyed = showTakeoverDialog({ sim: FAKE_SIM, playerId: "p1" });
  doc.fireKey("2");
  assert.equal(await keyed, "pullup");

  const third = showTakeoverDialog({ sim: FAKE_SIM, playerId: "p1" });
  doc.fireKey("3");
  assert.equal(await third, "pass");
});

test("showTakeoverDialog resolves null on Esc and on a backdrop click; a click on the dialog itself does nothing", async () => {
  const doc = installDoc();
  const byEsc = showTakeoverDialog({ sim: FAKE_SIM, playerId: "p1" });
  doc.fireKey("Escape");
  assert.equal(await byEsc, null);

  const byBackdrop = showTakeoverDialog({ sim: FAKE_SIM, playerId: "p1" });
  const shellEl = doc.getElementById("screen-takeover");
  shellEl.fire("click", { target: shellEl });
  assert.equal(await byBackdrop, null);

  const stillOpen = showTakeoverDialog({ sim: FAKE_SIM, playerId: "p1" });
  let resolved = false;
  stillOpen.then(() => { resolved = true; });
  const dialog = doc.getElementById("screen-takeover").querySelector(".reborn-takeover-dialog");
  doc.getElementById("screen-takeover").fire("click", { target: dialog });
  await Promise.resolve();
  assert.equal(resolved, false, "clicking the dialog background does not dismiss");
  assert.ok(doc.getElementById("screen-takeover"), "dialog stays mounted");
  doc.fireKey("Escape");
  assert.equal(await stillOpen, null);
});

test("showTakeoverDialog cleans up: element removed, key listener gone, no self-made overlay", async () => {
  const doc = installDoc();
  const before = doc.listenerCount("keydown", true);
  const pending = showTakeoverDialog({ sim: FAKE_SIM, playerId: "p1" });
  const shellEl = doc.getElementById("screen-takeover");
  assert.ok(shellEl.classList.contains("active"), "dialog opens active");
  assert.equal(doc.getElementById("screen-takeover").querySelectorAll(".reborn-takeover-overlay").length, 0,
    "no .reborn-takeover-overlay element is created — the shell owns the overlay now");
  assert.equal(doc.listenerCount("keydown", true), before + 2, "shell Esc + dialog digit listeners registered");
  shellEl.fire("click", { target: shellEl.querySelector("[data-option='drive']") });
  assert.equal(await pending, "drive");
  assert.equal(doc.getElementById("screen-takeover"), null, "element removed on resolve");
  assert.equal(doc.listenerCount("keydown", true), before, "both key listeners removed on resolve");
});

test("modal variant needs no title; an unknown variant throws", () => {
  const doc = installDoc();
  assert.doesNotThrow(() => mountScreen({ id: "no-title", variant: "modal", host: "overlay", doc }));
  doc.getElementById("screen-no-title")?.__shell?.destroy?.();
  assert.throws(() => mountScreen({ id: "bad", title: { zh: "x", en: "x" }, variant: "weird", doc }), /unknown variant/);
});

test("screenShell.css carries the modal centring and the B69 takeover dialog structure", () => {
  const css = readFileSync(new URL("../css/screenShell.css", import.meta.url), "utf8");
  assert.match(css, /\.screen-shell-modal\.active\s*\{[^}]*display:\s*flex/, "modal centres its dialog when active");
  assert.match(css, /\.reborn-takeover-dialog\s*\{/, "takeover dialog has rules now (B69)");
  assert.match(css, /\.reborn-takeover-option\s*\{[^}]*min-height:\s*44px/, "options meet the ≥44px touch target");
});
