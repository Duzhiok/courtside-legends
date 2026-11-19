// U-P2-1 — a language switch mid-duel or on the result screen must
// re-render the body in the new language. The select screen already did;
// the live court and the result screen used to be left in the old language
// (duelView's onRelocalize returned early whenever a duel was in progress).
//
// Drives the real view against a minimal fake DOM (same idea as
// tests/duelEscBack.test.js + tests/coachingMomentView.test.js — small
// element stubs, no jsdom). The body's innerHTML setter materialises the
// buttons and court pieces the view queries, so clicks drive the real
// possession flow. Legend-vs-legend needs no account: the challenger and
// the defender both come from the static gallery pool.
//
// Pins: (1) a live court re-mounts in the new language with the same score
// and turn, and the re-mounted court still resolves possessions; (2) a
// result screen re-renders in the new language without recording the duel
// a second time (games stay at 1, no duplicate XP).
import test from "node:test";
import assert from "node:assert/strict";
import { setLang } from "../js/i18n.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import {
  ensureDuelScreen, initDuelView, openDuelSelect,
} from "../js/ui/duelView.js";
import { readFileSync } from "node:fs";
import { GALLERY_LEGENDS } from "../js/data/galleryLegends.js";
import { readDuelRecord } from "../js/duel/duelStore.js";

// PLAYERS is empty in Node (the browser fills it via loadPlayers), so push
// just the gallery legends' rows through the real card builder —
// legendDuelists() needs the exact bref+season cards. Same idea as
// tests/helpers/sampleRoster.js, targeted at the gallery pool.
{
  const { PLAYERS, seasonToCard } = await import("../js/data/players.js");
  if (!PLAYERS.length) {
    const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
    const wanted = new Set(GALLERY_LEGENDS.map((l) => `${l.bref}|${l.season}`));
    PLAYERS.push(...rows.filter((r) => wanted.has(`${r.bref}|${r.season}`)).map(seasonToCard));
  }
}


globalThis.localStorage = createMemoryStorage();
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.CSS = { escape: (s) => String(s) };
globalThis.requestAnimationFrame = () => 0;

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

/** Materialise what the duel view queries: court pieces + every button it wires. */
function parseBodyHtml(html) {
  const children = [];
  if (html.includes("duel-court-wrap")) {
    const wrap = makeEl("div");
    wrap.classList.add("duel-court-wrap");
    const svg = makeEl("svg");
    svg.id = "duel-court";
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50 });
    const spot = makeEl("p");
    spot.id = "duel-spot-line";
    const mA = makeEl("div");
    mA.classList.add("duel-marker");
    const mB = makeEl("div");
    mB.classList.add("duel-marker");
    children.push(wrap, svg, spot, mA, mB);
  }
  for (const m of html.matchAll(/<button([^>]*)>/g)) {
    const attrs = m[1];
    const btn = makeEl("button");
    const id = attrs.match(/id="([^"]+)"/)?.[1];
    if (id) btn.setAttribute("id", id);
    for (const dm of attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)) {
      btn.setAttribute(`data-${dm[1]}`, dm[2]);
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

/** Start a legend-vs-legend duel through the real select screen. Returns the screen element. */
function startLegendDuel() {
  installDoc();
  setLang("zh");
  initDuelView({ show: () => {}, goBack: () => {} });
  const el = ensureDuelScreen();
  assert.equal(openDuelSelect({ challengerKind: "legend" }), true, "select screen opens");
  const body = el.querySelector("#duel-body");
  const challenger = body.querySelector("[data-challenger]");
  assert.ok(challenger, "a legend challenger is listed");
  challenger.fire("click");
  const legend = body.querySelector("[data-legend]");
  assert.ok(legend, "a legend defender is listed");
  legend.fire("click");
  const start = body.querySelector("#btn-duel-start");
  assert.ok(start && !start.disabled, "start enables once both sides are picked");
  start.fire("click");
  return el;
}

function bodyOf(el) {
  return el.querySelector("#duel-body");
}

test("duel: relocalize mid-match re-mounts the court in the new language, state intact", () => {
  const el = startLegendDuel();
  const body = bodyOf(el);
  assert.ok(body.innerHTML.includes("你的进攻选择") || body.innerHTML.includes("你的防守策略"), "court renders in zh after start");
  assert.ok(body.innerHTML.includes("第 1 回合"), "first possession in zh");
  setLang("en");
  el.__shellRelocalize();
  assert.ok(body.innerHTML.includes("Your offensive move") || body.innerHTML.includes("Your defensive call"), "court re-renders in en after relocalize");
  assert.ok(!body.innerHTML.includes("你的进攻选择") && !body.innerHTML.includes("你的防守策略"), "no zh choice heading left");
  assert.ok(body.innerHTML.includes("Possession 1"), "same possession after the re-mount");
  // The re-mounted court still resolves possessions: one click advances the turn.
  const choice = body.querySelector("[data-duel-choice]");
  assert.ok(choice, "choice buttons exist after the re-mount");
  choice.fire("click");
  assert.ok(body.innerHTML.includes("Possession 2") || body.innerHTML.includes("你赢了") || body.innerHTML.includes("传奇获胜"), "a choice resolves after the re-mount");
  setLang("zh");
});

test("duel: relocalize on the result screen re-renders without recording twice", () => {
  const el = startLegendDuel();
  const body = bodyOf(el);
  // Play possessions until the duel ends (first to 11, win by 2).
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const choice = body.querySelector("[data-duel-choice]");
    if (!choice) break;
    choice.fire("click");
    if (!body.querySelector("[data-duel-choice]")) break;
  }
  assert.ok(body.innerHTML.includes("你赢了") || body.innerHTML.includes("传奇获胜"), "result screen shows after the duel ends");
  assert.equal(readDuelRecord().games.length, 1, "the duel is recorded once");
  const zhHtml = body.innerHTML;
  setLang("en");
  el.__shellRelocalize();
  assert.ok(body.innerHTML.includes("You win!") || body.innerHTML.includes("The legend wins"), "result re-renders in en after relocalize");
  assert.ok(!body.innerHTML.includes("你赢了") && !body.innerHTML.includes("传奇获胜"), "no zh result left");
  assert.notEqual(body.innerHTML, zhHtml, "result html changes with the language");
  assert.equal(readDuelRecord().games.length, 1, "relocalize does not record the duel again");
  setLang("zh");
  el.__shellRelocalize();
  assert.ok(body.innerHTML.includes("你赢了") || body.innerHTML.includes("传奇获胜"), "result re-renders back in zh");
  assert.equal(readDuelRecord().games.length, 1, "still recorded once after switching back");
  setLang("zh");
});
