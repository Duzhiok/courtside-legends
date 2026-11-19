// U-P1-2 — Esc leaving a live Legend Duel must destroy the court controller.
//
// Regression: the shell back button ran destroyCourtController() + goBack,
// but the global Esc path (app.js handleBack) had no `duel` branch and fell
// through to a bare goBack(), so the court's document keydown listener
// (arrows/WASD/number keys, all preventDefault) and timers leaked onto
// whatever screen came next. The fix shares one exported sequence —
// duelView.handleDuelBack() — between the shell back button and handleBack.
//
// Pins, against the real code: (1) mountDuelCourt().destroy() actually
// unregisters the document keydown listener; (2) handleDuelBack() navigates
// exactly once (goBack, or show("home") when no goBack is wired); (3) the
// shell back button runs that same sequence; (4) app.js handleBack routes
// the duel screen through handleDuelBack before its plain goBack fall-through.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setLang } from "../js/i18n.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import {
  ensureDuelScreen, handleDuelBack, initDuelView,
} from "../js/ui/duelView.js";
import { mountDuelCourt } from "../js/ui/duelCourtView.js";
import { createDuel } from "../js/duel/duelSim.js";
import { createTakeover } from "../js/duel/duelTakeover.js";

const APP_SRC = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const DUEL_VIEW_SRC = readFileSync(new URL("../js/ui/duelView.js", import.meta.url), "utf8");

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
    toggle: (c, force) => {
      if (force === undefined) set.has(c) ? set.delete(c) : set.add(c);
      else if (force) set.add(c);
      else set.delete(c);
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
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((f) => f !== fn));
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
    fire(type, event = {}) {
      for (const fn of [...(listeners.get(type) || [])]) fn(event);
    },
    appendChild(child) {
      el.children.push(child);
      child.parent = el;
      return child;
    },
    contains(node) {
      let n = node;
      while (n) {
        if (n === el) return true;
        n = n.parent;
      }
      return false;
    },
    focus() {},
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
      return el.children.length > 0 || el._html !== "";
    },
    remove() {},
  };
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
  const docListeners = new Map();
  const doc = {
    body,
    activeElement: null,
    defaultView: null,
    createElement: (tag) => makeEl(tag),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = docListeners.get(type) || [];
      docListeners.set(type, list.filter((f) => f !== fn));
    },
    keydownListenerCount() {
      return (docListeners.get("keydown") || []).length;
    },
    fireKeydown(event = {}) {
      for (const fn of [...(docListeners.get("keydown") || [])]) fn(event);
    },
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
  };
  return { doc, app };
}

function installDoc() {
  const { doc, app } = makeDoc();
  globalThis.document = doc;
  return { doc, app };
}

/** Minimal duelists for a mountable court: name + OVR is all the view reads. */
function makeDuelists() {
  return {
    challenger: { id: "me", name: "我", displayName: "我", ovr: 80, skills: [] },
    legend: { id: "mj", name: "乔丹", displayName: "乔丹", ovr: 95, skills: [] },
  };
}

/** A court container stub: mountDuelCourt only queries for its own pieces. */
function makeCourtContainer() {
  const container = makeEl("div");
  const wrap = makeEl("div");
  wrap.classList.add("duel-court-wrap");
  const svg = makeEl("svg");
  svg.id = "duel-court";
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50 });
  const spot = makeEl("p");
  spot.id = "duel-spot-line";
  const markerA = makeEl("div");
  markerA.classList.add("duel-marker");
  const markerB = makeEl("div");
  markerB.classList.add("duel-marker");
  container._court = { wrap, svg, spot, markerA, markerB };
  container.querySelector = (sel) => {
    if (sel === ".duel-court-wrap") return wrap;
    if (sel === "#duel-court") return svg;
    if (sel === "#duel-spot-line") return spot;
    return null;
  };
  container.querySelectorAll = (sel) => {
    if (sel === ".duel-marker") return [markerA, markerB];
    return [];
  };
  return container;
}

/* ------------------------------------------------------------------ */
/* The leak itself: the court's document keydown listener              */
/* ------------------------------------------------------------------ */

test("court destroy() unregisters the document keydown listener", () => {
  const { doc } = installDoc();
  setLang("zh");
  const { challenger, legend } = makeDuelists();
  const state = createDuel({ challenger, legend, difficulty: "pro" });
  let takeover = createTakeover();
  const container = makeCourtContainer();
  const court = mountDuelCourt(container, {
    getState: () => state,
    getTakeover: () => takeover,
    setTakeover: (t) => { takeover = t; },
    challenger,
    legend,
    photoHtml: () => "",
    onChoice: () => {},
    onQuit: () => {},
  });
  assert.equal(doc.keydownListenerCount(), 1, "mount registers one document keydown listener");

  // The listener is live: an arrow key is claimed (preventDefault) and
  // moves the controlled player — exactly what leaked onto other screens.
  let prevented = false;
  doc.fireKeydown({ key: "ArrowUp", preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true, "live court claims arrow keys");

  court.destroy();
  assert.equal(doc.keydownListenerCount(), 0, "destroy removes the document keydown listener");
  prevented = false;
  doc.fireKeydown({ key: "ArrowUp", preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false, "no handler runs after destroy");
});

/* ------------------------------------------------------------------ */
/* The shared back sequence (shell button and Esc use the same one)    */
/* ------------------------------------------------------------------ */

test("handleDuelBack navigates exactly once via goBack", () => {
  installDoc();
  setLang("zh");
  let backs = 0;
  const shown = [];
  initDuelView({ show: (name) => shown.push(name), goBack: () => { backs += 1; } });
  ensureDuelScreen();
  handleDuelBack();
  assert.equal(backs, 1, "one goBack, no double navigation");
  assert.deepEqual(shown, [], "goBack wins; no fallback show() call");
});

test("handleDuelBack falls back to show('home') with no goBack wired", () => {
  installDoc();
  setLang("zh");
  const shown = [];
  initDuelView({ show: (name) => shown.push(name) });
  ensureDuelScreen();
  handleDuelBack();
  assert.deepEqual(shown, ["home"]);
});

test("shell back button runs the same handleDuelBack sequence", () => {
  const { doc } = installDoc();
  setLang("zh");
  let backs = 0;
  initDuelView({ show: () => {}, goBack: () => { backs += 1; } });
  ensureDuelScreen();
  const backBtn = doc.getElementById("btn-duel-back");
  assert.ok(backBtn, "shell back button exists");
  backBtn.fire("click");
  assert.equal(backs, 1, "back button navigates exactly once");
});

/* ------------------------------------------------------------------ */
/* Wiring: Esc (handleBack) must go through handleDuelBack             */
/* ------------------------------------------------------------------ */

test("app.js handleBack routes duel through handleDuelBack, before the plain goBack fall-through", () => {
  const handleBack = APP_SRC.slice(APP_SRC.indexOf("function handleBack()"));
  const duelAt = handleBack.indexOf('if (current === "duel")');
  assert.notEqual(duelAt, -1, "handleBack has a duel branch");
  const branchMatch = handleBack.slice(duelAt).match(/^if \(current === "duel"\) \{([\s\S]*?)\n  \}/);
  assert.ok(branchMatch, "duel branch parses as one if-block");
  const branch = branchMatch[1];
  assert.match(branch, /handleDuelBack\(\);/, "duel branch calls handleDuelBack()");
  assert.match(branch, /return;/, "duel branch returns instead of falling through");
  // The branch must sit before the final fall-through goBack(), not after it.
  const fallThrough = handleBack.lastIndexOf("goBack();");
  assert.ok(duelAt < fallThrough, "duel branch precedes the fall-through goBack()");
  // And the duel branch must not navigate on its own — destroy-then-back
  // is handleDuelBack's job, so a bare goBack() here would skip the destroy.
  // (Strip // comments first: the branch comment itself mentions goBack().)
  const codeOnly = branch.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(codeOnly, /goBack\(\)/, "duel branch has no bare goBack()");
});

test("duelView handleDuelBack destroys the court before navigating", () => {
  assert.match(DUEL_VIEW_SRC, /export function handleDuelBack\(\)/, "handleDuelBack is exported");
  const fn = DUEL_VIEW_SRC.slice(DUEL_VIEW_SRC.indexOf("export function handleDuelBack()"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  const destroyAt = body.indexOf("destroyCourtController();");
  assert.notEqual(destroyAt, -1, "handleDuelBack destroys the court controller");
  assert.ok(destroyAt < body.indexOf("goBackFn"), "destroy runs before navigation");
  // The shell's default onBack is this same function, not a second copy.
  assert.match(DUEL_VIEW_SRC, /onBack: onBack \|\| handleDuelBack,/);
  assert.doesNotMatch(DUEL_VIEW_SRC, /onBack: onBack \|\| \(\(\) => \{\n\s+destroyCourtController\(\);/);
});
