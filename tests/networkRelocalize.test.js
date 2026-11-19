// U-P2-1 — a language switch inside a Network sub-view must re-render the
// body in the new language, keeping the challenge and the player's answers.
// Scout / film / analytics used to be left in the old language (the view's
// onRelocalize only handled home and the opportunity board), and three spots
// were hardcoded Chinese even without a switch (analytics explanation,
// dismissal note, film option titles).
//
// Drives the real view against a minimal fake DOM (same idea as
// tests/coachingMomentView.test.js — small element stubs, no jsdom). The
// body's innerHTML setter materialises the buttons and result divs the view
// queries, so clicks drive the real challenge flow against the real roster.
//
// Pins: (1) scout decisions + reveal survive a switch and render in the new
// language with the same five prospects; (2) a film answer survives with
// the same challenge and an English explanation; (3) an analytics answer
// survives with an English explanation; (4) the dismissal note renders in
// the language active when it is shown; (5) relocalize never double-counts
// a slice result in the profile.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setLang, getLang } from "../js/i18n.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { createNetworkView } from "../js/ui/networkViews.js";
import { buildAnalyticsChallenge } from "../js/career/network/analyticsSpecialist.js";

globalThis.localStorage = createMemoryStorage();
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.CSS = { escape: (s) => String(s) };

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.remove(c),
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
    attrs: {},
    style: {},
    classList: makeClassList(),
    id: "",
    className: "",
    textContent: "",
    hidden: false,
    value: "",
    disabled: false,
    _html: "",
    setAttribute(k, v) {
      el.attrs[k] = String(v);
      if (k === "id") el.id = String(v);
    },
    getAttribute(k) {
      return el.attrs[k] ?? null;
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
      return el.children.length > 0 || el._html !== "";
    },
    remove() {},
  };
  Object.defineProperty(el, "innerHTML", {
    get: () => el._html,
    set: (v) => {
      el._html = v;
      if (v.includes("panel-head") && v.includes("screen-shell-body")) {
        el.children = parseShellHtml(v);
      } else {
        el.children = parseBodyHtml(v);
      }
      for (const c of el.children) c.parent = el;
    },
    configurable: true,
  });
  return el;
}

function matchesSelector(node, selector) {
  if (!selector) return false;
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  if (selector.startsWith("[") && selector.endsWith("]")) {
    const inner = selector.slice(1, -1);
    const eq = inner.indexOf('="');
    if (eq >= 0) {
      const attr = inner.slice(0, eq);
      const want = inner.slice(eq + 2, -1);
      return String(node.getAttribute(attr) ?? "") === want;
    }
    return node.getAttribute(inner) !== null;
  }
  return node.tagName?.toLowerCase() === selector.toLowerCase();
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

/** Materialise what the network view queries: buttons and the result divs. */
function parseBodyHtml(html) {
  const children = [];
  for (const m of html.matchAll(/<div[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const div = makeEl("div");
    div.setAttribute("id", m[1]);
    children.push(div);
  }
  for (const m of html.matchAll(/<button([^>]*)>/g)) {
    const attrs = m[1];
    const btn = makeEl("button");
    const id = attrs.match(/id="([^"]+)"/)?.[1];
    if (id) btn.setAttribute("id", id);
    for (const dm of attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)) {
      btn.setAttribute(`data-${dm[1]}`, dm[2]);
      // The view reads btn.dataset.* (camelCase), not getAttribute.
      btn.dataset[dm[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = dm[2];
    }
    btn.disabled = /\bdisabled\b/.test(attrs);
    children.push(btn);
  }
  return children;
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
  const { doc } = makeDoc();
  globalThis.document = doc;
  return doc;
}

function makeView() {
  installDoc();
  setLang("zh");
  const view = createNetworkView({
    getLang,
    getRows: async () => ROWS,
    getAccountId: () => null,
    show: () => {},
    goBack: () => {},
  });
  const el = view.mount();
  return { view, el, body: el.querySelector("#network-body") };
}

function brefsIn(html) {
  // Each card carries its bref three times (card + two buttons): dedupe.
  return [...new Set([...html.matchAll(/data-bref="([^"]+)"/g)].map((m) => m[1]))].sort();
}

test("network: scout decisions and reveal survive a language switch, same five prospects", async () => {
  const { view, el, body } = makeView();
  await view.openScout();
  assert.ok(body.innerHTML.includes("球探考察"), "scout renders in zh after open");
  assert.ok(body.innerHTML.includes("推荐选秀"), "recommend buttons in zh");
  const before = brefsIn(body.innerHTML);
  assert.equal(before.length, 5, "five prospects");
  // Decide all five (re-query after each click: the view re-renders).
  for (let i = 0; i < 5; i++) {
    const btn = body.querySelectorAll("[data-scout-rec]").find((b) => !b.disabled);
    assert.ok(btn, `an undecided prospect remains (round ${i})`);
    btn.fire("click");
  }
  const reveal = body.querySelector("#btn-scout-reveal");
  assert.ok(reveal && !reveal.disabled, "reveal enables once all five are decided");
  reveal.fire("click");
  assert.ok(body.innerHTML.includes("三年后"), "reveal shows in zh");
  assert.equal(view.profile().decisions.scoutTotal, 5, "five scout results recorded");
  setLang("en");
  el.__shellRelocalize();
  assert.ok(body.innerHTML.includes("Scout evaluation"), "scout re-renders in en after relocalize");
  assert.ok(body.innerHTML.includes("Recommend"), "recommend buttons in en");
  assert.ok(body.innerHTML.includes("Three years later"), "reveal survives the switch");
  assert.deepEqual(brefsIn(body.innerHTML), before, "same five prospects after the switch");
  assert.equal(view.profile().decisions.scoutTotal, 5, "relocalize does not re-count the reveal");
  setLang("zh");
});

test("network: a film answer survives a language switch, same challenge, English explanation", async () => {
  const { view, el, body } = makeView();
  await view.openFilm();
  assert.ok(body.innerHTML.includes("找出对手最大的弱点"), "film renders in zh after open");
  const label = body.innerHTML.match(/CHI vs UTA|最终比分/)?.[0];
  assert.ok(label, "the challenge game label is present");
  const opt = body.querySelector("[data-film-opt]");
  assert.ok(opt, "film options exist");
  opt.fire("click");
  assert.ok(body.innerHTML.includes("声望变化"), "film result shows in zh");
  assert.equal(view.profile().decisions.filmTotal, 1, "one film result recorded");
  const challengeBefore = body.innerHTML;
  setLang("en");
  el.__shellRelocalize();
  assert.ok(body.innerHTML.includes("Find the opponent's biggest weakness"), "film re-renders in en after relocalize");
  assert.ok(body.innerHTML.includes(label), "same challenge after the switch");
  assert.ok(body.innerHTML.includes("Reputation"), "film result re-renders in en");
  assert.ok(!body.innerHTML.includes("声望变化"), "no zh result left");
  assert.equal(view.profile().decisions.filmTotal, 1, "relocalize does not re-count the answer");
  assert.notEqual(body.innerHTML, challengeBefore, "body html changes with the language");
  setLang("zh");
});

test("network: an analytics answer survives a language switch with an English explanation", async () => {
  const { view, el, body } = makeView();
  await view.openAnalytics();
  assert.ok(body.innerHTML.includes("谁是被低估的球员？"), "analytics renders in zh after open");
  // Answer correctly (the challenge is deterministic for the default seed),
  // so the verified count moves and pins the single-counting.
  const correctId = buildAnalyticsChallenge(ROWS, { season: 1997, seed: 3 }).correctOptionId;
  const opt = body.querySelector(`[data-analytics-opt="${correctId}"]`);
  assert.ok(opt, "the correct analytics option exists");
  opt.fire("click");
  assert.ok(body.innerHTML.includes("声望变化"), "analytics result shows in zh");
  assert.equal(view.profile().decisions.analyticsVerified, 1, "one analytics result recorded");
  setLang("en");
  el.__shellRelocalize();
  assert.ok(body.innerHTML.includes("Who is the most undervalued player?"), "analytics re-renders in en after relocalize");
  assert.ok(body.innerHTML.includes("Reputation"), "analytics result re-renders in en");
  assert.ok(!body.innerHTML.includes("声望变化"), "no zh result left");
  assert.equal(view.profile().decisions.analyticsVerified, 1, "relocalize does not re-count the answer");
  setLang("zh");
});

test("network: the dismissal note renders in the language active when it is shown", () => {
  const { view, body } = makeView();
  view.openBoard();
  assert.ok(body.innerHTML.includes("职业机会"), "board renders in zh after open");
  const fired = body.querySelector("#btn-network-fired");
  assert.ok(fired, "the simulate-fired button exists");
  fired.fire("click");
  const noteZh = body.querySelector("#network-result").innerHTML;
  assert.ok(noteZh.includes("被解雇不是终点"), "dismissal note shows in zh");
  // Flip the language and fire again: the note follows the new language.
  setLang("en");
  const firedEn = body.querySelector("#btn-network-fired");
  assert.ok(firedEn, "the fired button is still there after the board re-render");
  firedEn.fire("click");
  const noteEn = body.querySelector("#network-result").innerHTML;
  assert.ok(noteEn.includes("Being fired is not the end"), "dismissal note shows in en");
  assert.ok(!noteEn.includes("被解雇不是终点"), "no zh note in en mode");
  setLang("zh");
});
