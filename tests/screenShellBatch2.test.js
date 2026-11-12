// Screen Shell batch 2 — coachingMomentView + scoutingView (draft gamble) on
// the shared shell.
//
// Drives the real views against a minimal fake DOM (same idea as
// tests/screenShellBatch1.test.js — small element stubs, no jsdom).
// Pins the migration contract: mount twice = one instance, the shell head
// shows ONE language at a time, the back button calls goBack exactly once
// (the coaching back button was never wired before; the gamble's old
// per-view back branch is gone, so a click can no longer fire goBack
// twice), a language switch re-renders the body, and opening the gamble
// twice does not stack its delegated click handler.
import test from "node:test";
import assert from "node:assert/strict";
import { CLUTCH_POOL } from "./helpers/clutchSim.js";
import { setLang } from "../js/i18n.js";
import { createCoachingMomentView, COACHING_MOMENT_TITLE } from "../js/ui/coachingMomentView.js";
import { createDraftGambleView, DRAFT_GAMBLE_TITLE } from "../js/ui/scoutingView.js";

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
  const doc = {
    body,
    createElement: (tag) => makeEl(tag),
    querySelector: (sel) => (sel === "#app" ? app : null),
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

test("coaching: mount twice is one instance, single-language title, back works once", () => {
  const app = installDoc();
  setLang("zh");
  let backs = 0;
  const view = createCoachingMomentView({
    getPool: () => CLUTCH_POOL,
    show: () => {},
    goBack: () => {
      backs += 1;
    },
  });
  const first = view.mount();
  const second = view.mount();
  assert.equal(first, second, "mount twice returns the same element");
  assert.equal(first.id, "screen-coach-tactics");
  const mounted = app.children.filter((c) => c.id === "screen-coach-tactics");
  assert.equal(mounted.length, 1, "exactly one coaching screen in #app");
  assert.equal(first.dataset.shellHost, "app", "coaching lives in the #app column");
  const title = first.querySelector("#coach-tactics-title");
  assert.equal(title.textContent, "教练战术逆转挑战");
  assert.equal(title.textContent, COACHING_MOMENT_TITLE.zh);
  assert.ok(!first.innerHTML.includes("Coach Comeback Challenge"), "zh mode shows no English title");
  const back = first.querySelector("#btn-coach-tactics-back");
  assert.ok(back, "back button exists");
  assert.equal(back.listenerCount("click"), 1, "one back handler (the button was unwired before this batch)");
  back.fire("click");
  assert.equal(backs, 1, "one click calls goBack exactly once");
  setLang("zh");
});

test("coaching: relocalize before open switches the head and does not crash", () => {
  installDoc();
  setLang("zh");
  const view = createCoachingMomentView({
    getPool: () => CLUTCH_POOL,
    show: () => {},
    goBack: () => {},
  });
  const el = view.mount();
  setLang("en");
  assert.doesNotThrow(() => el.__shellRelocalize(), "relocalize before open must not crash (no challenge yet)");
  assert.equal(el.querySelector("#coach-tactics-title").textContent, "Coach Comeback Challenge");
  assert.equal(el.querySelector("#btn-coach-tactics-back").querySelector("span").textContent, "Back");
  setLang("zh");
});

test("coaching: relocalize after open re-renders the body in the new language", () => {
  installDoc();
  setLang("zh");
  const view = createCoachingMomentView({
    getPool: () => CLUTCH_POOL,
    show: () => {},
    goBack: () => {},
  });
  const el = view.mount();
  const opened = view.open();
  assert.ok(opened.ok, "view must open with the full pool");
  const body = el.querySelector("#coach-tactics-body");
  assert.ok(body.innerHTML.includes("落后"), "body renders in zh after open");
  const zhHtml = body.innerHTML;
  setLang("en");
  el.__shellRelocalize();
  assert.equal(el.querySelector("#coach-tactics-title").textContent, "Coach Comeback Challenge");
  assert.ok(body.innerHTML.includes("Down"), "body re-renders in en after relocalize");
  assert.notEqual(body.innerHTML, zhHtml, "body html changes with the language");
  setLang("zh");
});

test("draft gamble: mount twice is one instance, single-language title, back works once", () => {
  const app = installDoc();
  let lang = "zh";
  let backs = 0;
  const view = createDraftGambleView({
    getLang: () => lang,
    readRootSave: () => ({}),
    writeRootSave: () => {},
    show: () => {},
    goBack: () => {
      backs += 1;
    },
  });
  const first = view.mount();
  const second = view.mount();
  assert.equal(first, second, "mount twice returns the same element");
  assert.equal(first.id, "screen-draft-gamble");
  assert.equal(app.children.filter((c) => c.id === "screen-draft-gamble").length, 1);
  assert.equal(first.dataset.shellHost, "app", "gamble lives in the #app column");
  const title = first.querySelector("#draft-gamble-title");
  assert.equal(title.textContent, "1996 选秀赌局");
  assert.equal(title.textContent, DRAFT_GAMBLE_TITLE.zh);
  assert.ok(!first.innerHTML.includes("1996 Draft Gamble"), "zh mode shows no English title");
  const back = first.querySelector("#btn-draft-gamble-back");
  assert.ok(back, "back button exists");
  assert.equal(back.listenerCount("click"), 1, "one back handler (shell-owned)");
  back.fire("click");
  assert.equal(backs, 1, "one click calls goBack exactly once");
});

test("draft gamble: relocalize before open switches the head, does not crash, leaves the body alone", () => {
  installDoc();
  let lang = "zh";
  const view = createDraftGambleView({
    getLang: () => lang,
    readRootSave: () => ({}),
    writeRootSave: () => {},
    show: () => {},
    goBack: () => {},
  });
  const el = view.mount();
  lang = "en";
  assert.doesNotThrow(() => el.__shellRelocalize(), "relocalize before open must not crash (no gamble yet)");
  assert.equal(el.querySelector("#draft-gamble-title").textContent, "1996 Draft Gamble");
  assert.equal(el.querySelector("#btn-draft-gamble-back").querySelector("span").textContent, "Back");
  assert.equal(el.querySelector("#draft-gamble-body").innerHTML, "", "body untouched before open");
});

test("draft gamble: opening twice does not stack click handlers", async () => {
  installDoc();
  const view = createDraftGambleView({
    getLang: () => "zh",
    readRootSave: () => ({}),
    writeRootSave: () => {},
    show: () => {},
    goBack: () => {},
  });
  const el = view.mount();
  await view.open();
  await view.open();
  assert.equal(el.listenerCount("click"), 1, "one delegated click handler after two opens");
  assert.equal(
    el.querySelector("#btn-draft-gamble-back").listenerCount("click"),
    1,
    "one back handler after two opens",
  );
});
