// Screen Shell batch 4 — relationshipsView + rebornView + myHomeScreen on the shared shell.
//
// Drives the real views against a minimal fake DOM (same idea as
// tests/screenShellBatch3.test.js — small element stubs, no jsdom).
// Pins the migration contract: mount twice = one instance, the shell head
// shows ONE language at a time, the back button calls goBack exactly once
// (the relationships backWired branch, the reborn __rebornWired back wiring
// and the myHome wire() back wiring are all gone from the views — the shell
// owns the button now), a language switch re-renders the body where it is
// cheap (relationships panel, myHome room) and leaves the stateful bodies
// alone before open (reborn's roster is not loaded until open, so its
// relocalize-after-open case stays with the Mac browser QA, like the
// screen wiring itself).
import test from "node:test";
import assert from "node:assert/strict";
import { setLang, getLang } from "../js/i18n.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import {
  ensureRelationshipsScreen, createRelationshipsView, RELATIONSHIPS_TITLE,
} from "../js/ui/relationshipsView.js";
import {
  ensureRebornScreen, createRebornView, REBORN_TITLE,
} from "../js/ui/reborn/rebornView.js";
import {
  ensureMyHomeScreen, createMyHome, MY_HOME_TITLE,
} from "../js/ui/myHome/myHomeScreen.js";

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
    removeEventListener() {},
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
    activeElement: null,
    defaultView: null,
    createElement: (tag) => makeEl(tag),
    querySelector: (sel) => {
      if (sel === "#app") return app;
      // The views resolve their screen and body by id through
      // document.querySelector, like the real browser.
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
/* Career Relationships (DEV panel)                                    */
/* ------------------------------------------------------------------ */

function makeRelationshipsView(backs) {
  return createRelationshipsView({
    getLang,
    getAccount: () => ({ id: "t1", name: "Test" }),
    saveAccount: () => {},
    readRootSave: () => null,
    writeRootSave: () => {},
    show: () => {},
    goBack: () => { backs.count += 1; },
  });
}

test("relationships: mount twice is one instance, single-language title, back works once", () => {
  const app = installDoc();
  setLang("zh");
  const backs = { count: 0 };
  const view = makeRelationshipsView(backs);
  const first = view.mount();
  const second = view.mount();
  assert.equal(first, second, "mount twice returns the same element");
  assert.equal(first.id, "screen-relationships");
  assert.equal(app.children.filter((c) => c.id === "screen-relationships").length, 1);
  assert.equal(first.dataset.shellHost, "app", "relationships lives in the #app column");
  const title = first.querySelector("#relationships-title");
  assert.equal(title.textContent, "职业关系（开发）");
  assert.equal(title.textContent, RELATIONSHIPS_TITLE.zh);
  assert.ok(!first.innerHTML.includes("Relationships"), "zh mode shows no English title");
  const back = first.querySelector("#btn-relationships-back");
  assert.ok(back, "back button exists");
  assert.equal(back.listenerCount("click"), 1, "one back handler (shell-owned, old backWired branch gone)");
  back.fire("click");
  assert.equal(backs.count, 1, "one click calls goBack exactly once");
  setLang("zh");
});

test("relationships: relocalize before open switches the head, does not crash, leaves the body alone", () => {
  installDoc();
  setLang("zh");
  const view = makeRelationshipsView({ count: 0 });
  const el = view.mount();
  setLang("en");
  assert.doesNotThrow(() => el.__shellRelocalize(), "relocalize before open must not crash (empty body)");
  assert.equal(el.querySelector("#relationships-title").textContent, "Relationships (DEV)");
  assert.equal(el.querySelector("#btn-relationships-back").querySelector("span").textContent, "Back");
  assert.equal(el.querySelector("#relationships-body").innerHTML, "", "body untouched before open");
  setLang("zh");
});

test("relationships: relocalize after open re-renders the body in the new language", () => {
  installDoc();
  setLang("zh");
  const view = makeRelationshipsView({ count: 0 });
  const el = view.mount();
  view.open();
  const body = el.querySelector("#relationships-body");
  assert.ok(body.innerHTML.includes("人物"), "body renders in zh after open");
  const zhHtml = body.innerHTML;
  setLang("en");
  el.__shellRelocalize();
  assert.equal(el.querySelector("#relationships-title").textContent, "Relationships (DEV)");
  assert.ok(body.innerHTML.includes("People"), "body re-renders in en after relocalize");
  assert.notEqual(body.innerHTML, zhHtml, "body html changes with the language");
  setLang("zh");
});

/* ------------------------------------------------------------------ */
/* Player Reborn                                                       */
/* ------------------------------------------------------------------ */

function makeRebornView(backs) {
  return createRebornView({
    getLang,
    readRootSave: () => null,
    writeRootSave: () => {},
    show: () => {},
    goBack: () => { backs.count += 1; },
    getAccount: () => null,
    saveAccount: () => {},
  });
}

test("reborn: mount twice is one instance, single-language title, back works once", () => {
  const app = installDoc();
  setLang("zh");
  const backs = { count: 0 };
  const view = makeRebornView(backs);
  const first = view.mount();
  const second = view.mount();
  assert.equal(first, second, "mount twice returns the same element");
  assert.equal(first.id, "screen-reborn");
  assert.equal(app.children.filter((c) => c.id === "screen-reborn").length, 1);
  assert.equal(first.dataset.shellHost, "app", "reborn lives in the #app column");
  const title = first.querySelector("#reborn-title");
  assert.equal(title.textContent, "球员重生");
  assert.equal(title.textContent, REBORN_TITLE.zh);
  assert.ok(!first.innerHTML.includes("Player Reborn"), "zh mode shows no English title");
  const back = first.querySelector("#btn-reborn-back");
  assert.ok(back, "back button exists");
  assert.equal(back.listenerCount("click"), 1, "one back handler (shell-owned, old __rebornWired back wiring gone)");
  back.fire("click");
  assert.equal(backs.count, 1, "one click calls goBack exactly once");
  setLang("zh");
});

test("reborn: relocalize before open switches the head, does not crash, leaves the body alone", () => {
  installDoc();
  setLang("zh");
  const view = makeRebornView({ count: 0 });
  const el = view.mount();
  setLang("en");
  assert.doesNotThrow(() => el.__shellRelocalize(), "relocalize before open must not crash (empty body, roster not loaded)");
  assert.equal(el.querySelector("#reborn-title").textContent, "Player Reborn");
  assert.equal(el.querySelector("#btn-reborn-back").querySelector("span").textContent, "Back");
  assert.equal(el.querySelector("#reborn-body").innerHTML, "", "body untouched before open");
  setLang("zh");
});

test("reborn: ensureRebornScreen without wiring still mounts the same shell element", () => {
  installDoc();
  setLang("zh");
  const view = makeRebornView({ count: 0 });
  const mounted = view.mount();
  assert.equal(ensureRebornScreen(), mounted, "open()'s bare ensure returns the booted shell element");
  setLang("zh");
});

/* ------------------------------------------------------------------ */
/* My Home                                                             */
/* ------------------------------------------------------------------ */

function makeMyHome(backs) {
  return createMyHome({
    getLang,
    getModel: () => ({ account: null, cards: [], trophyCount: 0, portrait: null, name: "" }),
    show: () => {},
    goBack: () => { backs.count += 1; },
    onOpenShop: () => {},
  });
}

test("myHome: mount twice is one instance, single-language title, back works once", () => {
  const app = installDoc();
  setLang("zh");
  const backs = { count: 0 };
  const home = makeMyHome(backs);
  const first = home.mount();
  const second = home.mount();
  assert.equal(first, second, "mount twice returns the same element");
  assert.equal(first.id, "screen-my-home");
  assert.equal(app.children.filter((c) => c.id === "screen-my-home").length, 1);
  assert.equal(first.dataset.shellHost, "app", "myHome lives in the #app column");
  const title = first.querySelector("#my-home-title");
  assert.equal(title.textContent, "我的家");
  assert.equal(title.textContent, MY_HOME_TITLE.zh);
  assert.ok(!first.innerHTML.includes("My Home"), "zh mode shows no English title");
  const back = first.querySelector("#btn-my-home-back");
  assert.ok(back, "back button exists");
  assert.equal(back.listenerCount("click"), 1, "one back handler (shell-owned, old wire() back wiring gone)");
  back.fire("click");
  assert.equal(backs.count, 1, "one click calls goBack exactly once");
  setLang("zh");
});

test("myHome: relocalize before open switches the head, does not crash, leaves the body alone", () => {
  installDoc();
  setLang("zh");
  const home = makeMyHome({ count: 0 });
  const el = home.mount();
  setLang("en");
  assert.doesNotThrow(() => el.__shellRelocalize(), "relocalize before open must not crash (no body yet)");
  assert.equal(el.querySelector("#my-home-title").textContent, "My Home");
  assert.equal(el.querySelector("#btn-my-home-back").querySelector("span").textContent, "Back");
  assert.equal(el.querySelector("#my-home-body").innerHTML, "", "body untouched before open");
  setLang("zh");
});

test("myHome: relocalize after open re-renders the room in the new language", () => {
  installDoc();
  setLang("zh");
  const home = makeMyHome({ count: 0 });
  const el = home.mount();
  home.open();
  const body = el.querySelector("#my-home-body");
  assert.ok(body.innerHTML.includes("我的家具"), "room renders in zh after open");
  const zhHtml = body.innerHTML;
  setLang("en");
  el.__shellRelocalize();
  assert.equal(el.querySelector("#my-home-title").textContent, "My Home");
  assert.ok(body.innerHTML.includes("My furniture"), "room re-renders in en after relocalize");
  assert.notEqual(body.innerHTML, zhHtml, "body html changes with the language");
  setLang("zh");
});
