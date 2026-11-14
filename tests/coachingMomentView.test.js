// Coaching Moment view — changing a panel <select> must not rebuild the panel
// (B66: every change used to run a full body.innerHTML rebuild, destroying the
// dropdown the user was interacting with, so it flickered on every pick).
//
// Drives the real view against the real challenge controller with a minimal
// fake DOM (same idea as tests/legendsGallery.test.js — small element stubs,
// no jsdom). Identity of the <select> elements is the assertion: a light
// meters-only refresh keeps the same objects; a full render replaces them.
import test from "node:test";
import assert from "node:assert/strict";
import { CLUTCH_POOL } from "./helpers/clutchSim.js";
import { createCoachingMomentView } from "../js/ui/coachingMomentView.js";
import { FOCUS_PLAYS } from "../js/engine/gameplan.js";

// mountScreen observes class changes and escapes opener selectors; the
// stubs below are enough because the observer never fires in these tests.
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
    hidden: false,
    value: "",
    options: [],
    disabled: false,
    _html: "",
    setAttribute(k, v) {
      el[k] = v;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    fire(type) {
      for (const fn of listeners.get(type) || []) fn();
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
  const body = makeTacticsBody();
  body.id = html.match(/<div class="screen-shell-body" id="([^"]+)"/)?.[1] || "";
  body.classList.add("screen-shell-body");
  return [head, body];
}

/** The #coach-tactics-body element: writing panel HTML materialises the
 * selects / buttons / meters the view drives, as in parseBodyHtml. */
function makeTacticsBody() {
  const body = makeEl("div");
  Object.defineProperty(body, "innerHTML", {
    get: () => body._html,
    set: (v) => {
      body._html = v;
      body.children = parseBodyHtml(v);
      for (const c of body.children) c.parent = body;
    },
    configurable: true,
  });
  return body;
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
  const { doc } = makeDoc();
  globalThis.document = doc;
  return doc;
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
      if (attr.startsWith("data-")) return node.dataset?.[attr.slice(5)] === want;
      return String(node[attr] ?? "") === want;
    }
    if (inner.startsWith("data-")) return node.dataset?.[inner.slice(5)] !== undefined;
    return node[inner] !== undefined;
  }
  return node.tagName?.toLowerCase() === selector.toLowerCase();
}

/** Parse the panel HTML the view writes into #coach-tactics-body. Only the
 * parts the test drives are materialised: the four <select>s, the buttons,
 * and the .ct-meters row (balanced-div scan for its nested meters). */
function parseBodyHtml(html) {
  const children = [];
  for (const m of html.matchAll(/<select data-act="([^"]+)">([\s\S]*?)<\/select>/g)) {
    const sel = makeEl("select");
    sel.dataset.act = m[1];
    sel.options = [...m[2].matchAll(/<option value="([^"]*)"( selected)?>/g)].map((o) => ({
      value: o[1],
      selected: Boolean(o[2]),
    }));
    const picked = sel.options.find((o) => o.selected);
    sel.value = picked ? picked.value : sel.options[0]?.value || "";
    children.push(sel);
  }
  for (const m of html.matchAll(/<button([^>]*)>/g)) {
    const attrs = m[1];
    const act = attrs.match(/data-act="([^"]+)"/)?.[1];
    const choice = attrs.match(/data-choice="([^"]+)"/)?.[1];
    if (!act && !choice) continue;
    const btn = makeEl("button");
    if (act) btn.dataset.act = act;
    if (choice) btn.dataset.choice = choice;
    btn.disabled = /\bdisabled\b/.test(attrs);
    children.push(btn);
  }
  const metersAt = html.indexOf('<div class="ct-meters">');
  if (metersAt >= 0) {
    const meters = makeEl("div");
    meters.classList.add("ct-meters");
    // Balance <div>/</div> from the opening tag to find the matching close.
    let depth = 0;
    let end = -1;
    const tagRe = /<\/?div\b[^>]*>/g;
    tagRe.lastIndex = metersAt;
    for (const t of html.matchAll(tagRe)) {
      if (t.index < metersAt) continue;
      depth += t[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    meters._html = end > 0 ? html.slice(metersAt, end) : html.slice(metersAt);
    children.push(meters);
  }
  return children;
}

/** Mount the real view on the fake DOM and drive it to the live panel
 * (opening moment choice -> no moment -> focus/tempo/sub selects). */
function openPanel() {
  const doc = installDoc();
  const view = createCoachingMomentView({
    getPool: () => CLUTCH_POOL,
    show: () => {},
  });
  const opened = view.open();
  assert.ok(opened.ok, "view must open with the full pool");
  const body = doc.getElementById("coach-tactics-body");
  assert.ok(body, "shell must materialise #coach-tactics-body");
  // Opening moment -> pick the first enabled choice until the live panel
  // (focus/tempo/sub selects) appears.
  for (let guard = 0; guard < 10; guard += 1) {
    const focus = body.querySelector('[data-act="focus"]');
    if (focus) return { view, body };
    const choice = body
      .querySelectorAll("[data-choice]")
      .find((b) => !b.disabled);
    assert.ok(choice, "expected a moment choice or the live panel");
    choice.fire("click");
  }
  assert.fail("live panel never appeared after 10 moment choices");
}

test("focus/tempo change refreshes only the meters — selects keep identity", () => {
  const { body } = openPanel();
  const focus = body.querySelector('[data-act="focus"]');
  const tempo = body.querySelector('[data-act="tempo"]');
  const subOut = body.querySelector('[data-act="sub-out"]');
  const subIn = body.querySelector('[data-act="sub-in"]');
  const meters = body.querySelector(".ct-meters");
  assert.ok(focus && tempo && subOut && subIn && meters, "panel must have 4 selects + meters");
  const metersBefore = meters.innerHTML;

  // Pick a focus different from the current one, then a different tempo.
  const otherFocus = FOCUS_PLAYS.find((f) => f.id !== focus.value)?.id;
  assert.ok(otherFocus, "need a second focus play to pick");
  focus.value = otherFocus;
  focus.fire("change");
  assert.equal(body.querySelector('[data-act="focus"]'), focus, "focus select must survive its own change");
  assert.equal(body.querySelector('[data-act="sub-out"]'), subOut, "sub-out select must survive a focus change");
  assert.equal(body.querySelector('[data-act="sub-in"]'), subIn, "sub-in select must survive a focus change");
  assert.equal(body.querySelector(".ct-meters"), meters, "meters row must be the same element");
  assert.equal(focus.value, otherFocus, "focus value must stick");

  tempo.value = tempo.options[1]?.value || tempo.value;
  tempo.fire("change");
  assert.equal(body.querySelector('[data-act="tempo"]'), tempo, "tempo select must survive its own change");
  assert.equal(body.querySelector('[data-act="sub-out"]'), subOut, "sub-out select must survive a tempo change");
  assert.notEqual(meters.innerHTML, "", "meters must still render after the refresh");
  assert.ok(meters.innerHTML.length > 0 && metersBefore.length > 0, "meters html present");
});

test("picking sub-out / sub-in does not rebuild the panel", () => {
  const { body } = openPanel();
  const subOut = body.querySelector('[data-act="sub-out"]');
  const subIn = body.querySelector('[data-act="sub-in"]');
  const focus = body.querySelector('[data-act="focus"]');
  subOut.value = subOut.options[1]?.value || subOut.value;
  subOut.fire("change");
  assert.equal(body.querySelector('[data-act="sub-out"]'), subOut, "sub-out must survive its own change");
  assert.equal(body.querySelector('[data-act="sub-in"]'), subIn, "sub-in must survive a sub-out change");
  subIn.value = subIn.options[1]?.value || subIn.value;
  subIn.fire("change");
  assert.equal(body.querySelector('[data-act="sub-in"]'), subIn, "sub-in must survive its own change");
  assert.equal(body.querySelector('[data-act="focus"]'), focus, "focus must survive sub picks");
});

test("Substitute still rebuilds the panel with the new rosters", () => {
  const { body } = openPanel();
  const subOut = body.querySelector('[data-act="sub-out"]');
  const subIn = body.querySelector('[data-act="sub-in"]');
  const outId = subOut.value;
  const inId = subIn.value;
  assert.ok(outId && inId && outId !== inId, "need distinct out/in players");
  const subBtn = body.querySelector('[data-act="sub"]');
  assert.ok(subBtn, "Substitute button must exist");
  subBtn.fire("click");
  const newSubOut = body.querySelector('[data-act="sub-out"]');
  const newSubIn = body.querySelector('[data-act="sub-in"]');
  assert.ok(newSubOut && newSubIn, "panel must re-render after substituting");
  assert.notEqual(newSubOut, subOut, "sub-out select must be rebuilt after the rosters change");
  const outOptions = newSubOut.options.map((o) => o.value);
  const inOptions = newSubIn.options.map((o) => o.value);
  assert.ok(!outOptions.includes(outId), "subbed-out player must leave the court list");
  assert.ok(inOptions.includes(outId), "subbed-out player must join the bench list");
  assert.ok(outOptions.includes(inId), "subbed-in player must join the court list");
});
