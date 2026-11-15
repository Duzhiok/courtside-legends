// Screen Shell batch 1 — careerInboxView + gmBusinessView on the shared shell.
//
// Drives the real views against a minimal fake DOM (same idea as
// tests/coachingMomentView.test.js — small element stubs, no jsdom).
// Pins the migration contract: mount twice = one instance, the shell head
// shows ONE language at a time, the back button calls goBack exactly once,
// a language switch re-renders the body, and the GM body's delegated click
// handler is bound once (a per-open bind stacked duplicate handlers — a
// second open would settle two seasons on one click).
import test from "node:test";
import assert from "node:assert/strict";
import { createCareerInboxView, CAREER_INBOX_TITLE } from "../js/ui/careerInboxView.js";
import { createGmBusinessView, GM_BUSINESS_TITLE } from "../js/ui/gmBusinessView.js";

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

const card = (bref, team, rating = 60) => ({
  bref, name: `Player ${bref}`, team, pos: "SG",
  three: rating, mid: rating, paint: rating, scoring: rating, pass: rating,
  iq: rating, defense: rating, steal: rating, block: rating, rebound: rating,
  speed: rating, strength: rating, stamina: rating, clutch: rating,
  raw: { ppg: 10 },
});
const stubRoster = () => [
  card("star01", "VAN", 88),
  ...Array.from({ length: 11 }, (_, i) => card(`role${i}`, "VAN", 50)),
];

test("inbox: mount twice is one instance, single-language title, back works once", () => {
  const app = installDoc();
  let lang = "zh";
  let backs = 0;
  const view = createCareerInboxView({
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
  assert.equal(first.id, "screen-career-inbox");
  const mounted = app.children.filter((c) => c.id === "screen-career-inbox");
  assert.equal(mounted.length, 1, "exactly one inbox screen in #app");
  assert.equal(first.dataset.shellHost, "app", "inbox lives in the #app column");
  const title = first.querySelector("#career-inbox-title");
  assert.equal(title.textContent, "职业收件箱");
  assert.equal(title.textContent, CAREER_INBOX_TITLE.zh);
  assert.ok(!first.innerHTML.includes("Career Inbox"), "zh mode shows no English title");
  const back = first.querySelector("#btn-career-inbox-back");
  assert.ok(back, "back button exists");
  back.fire("click");
  assert.equal(backs, 1, "one click calls goBack exactly once");
});

test("inbox: relocalize before open switches the head and does not crash", () => {
  installDoc();
  let lang = "zh";
  const view = createCareerInboxView({
    getLang: () => lang,
    readRootSave: () => ({}),
    writeRootSave: () => {},
    show: () => {},
    goBack: () => {},
  });
  const el = view.mount();
  lang = "en";
  assert.doesNotThrow(() => el.__shellRelocalize(), "relocalize before open must not crash (no slice yet)");
  assert.equal(el.querySelector("#career-inbox-title").textContent, "Career Inbox");
  assert.equal(el.querySelector("#btn-career-inbox-back").querySelector("span").textContent, "Back");
});

test("gm business: mount twice is one instance, single-language title, back works once", () => {
  const app = installDoc();
  let lang = "zh";
  let backs = 0;
  const view = createGmBusinessView({
    getLang: () => lang,
    show: () => {},
    goBack: () => {
      backs += 1;
    },
  });
  const first = view.mount();
  assert.equal(view.mount(), first, "mount twice returns the same element");
  assert.equal(first.id, "screen-gm-business");
  assert.equal(app.children.filter((c) => c.id === "screen-gm-business").length, 1);
  assert.equal(first.dataset.shellHost, "app", "gm business lives in the #app column");
  assert.equal(first.querySelector("#gm-business-title").textContent, "总经理 · 从雇员到帝国");
  assert.equal(first.querySelector("#gm-business-title").textContent, GM_BUSINESS_TITLE.zh);
  assert.ok(!first.innerHTML.includes("From Employee to Empire"), "zh mode shows no English title");
  first.querySelector("#btn-gm-business-back").fire("click");
  assert.equal(backs, 1, "one click calls goBack exactly once");
});

test("gm business: relocalize re-renders the body in the new language", () => {
  installDoc();
  let lang = "zh";
  const view = createGmBusinessView({
    getLang: () => lang,
    show: () => {},
    goBack: () => {},
  });
  const el = view.mount();
  view.open(view.createScenario({ players: stubRoster() }), stubRoster());
  const body = el.querySelector("#gm-business-body");
  assert.ok(body.innerHTML.includes("当前身份"), "body renders in zh after open");
  lang = "en";
  el.__shellRelocalize();
  assert.equal(el.querySelector("#gm-business-title").textContent, "GM · From Employee to Empire");
  assert.ok(body.innerHTML.includes("Current stage"), "body re-renders in en after relocalize");
});

test("gm business: opening twice does not stack body click handlers", () => {
  installDoc();
  const view = createGmBusinessView({
    getLang: () => "zh",
    show: () => {},
    goBack: () => {},
  });
  const el = view.mount();
  const scenario = view.createScenario({ players: stubRoster() });
  view.open(scenario, stubRoster());
  view.open(scenario, stubRoster());
  assert.equal(
    el.querySelector("#gm-business-body").listenerCount("click"),
    1,
    "one delegated body handler after two opens",
  );
  assert.equal(
    el.querySelector("#btn-gm-business-back").listenerCount("click"),
    1,
    "one back handler after two opens",
  );
});
