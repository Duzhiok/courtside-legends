// Draft gamble (workstream C) on an empty browser — B136, B127's sibling.
//
// ?draft-gamble=1 in a browser with no root save used to reject open() with
// "invalid root save": open() builds a fresh gamble state and persist()
// wrote it into a bare {} root, which saveRoot's validateRoot rejects (no
// schemaVersion), so show() never ran and the page stayed on home. The
// gamble is self-contained — it only needs the root for resume-across-
// refresh — so with no root open it now plays in memory for the session
// and persist()/restart become no-ops instead of throwing.
//
// Drives the real view against the real saveRoot + a minimal fake DOM
// (same idea as tests/screenShellBatch1.test.js — small element stubs,
// no jsdom). PLAYERS is the real 1996 pool (featured board + 1997 CHH).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDraftGambleView } from "../js/ui/scoutingView.js";
import { PLAYERS, seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import {
  DRAFT_YEAR,
  FEATURED_BOARD,
  GAMBLE_SEED_DEFAULT,
  GAMBLE_TEAM_ID,
} from "../js/career/gm/scoutingIntel.js";
import {
  createRootState,
  readRootSave,
  writeRootSave,
} from "../js/data/saveRoot.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.CSS = { escape: (s) => String(s) };
// confirmAction falls back to window.confirm when the dialog is absent.
globalThis.window = { confirm: () => true };

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
    contains(node) {
      let x = node;
      while (x) {
        if (x === el) return true;
        x = x.parent;
      }
      return false;
    },
    focus() {},
    closest: () => null,
  };
  Object.defineProperty(el, "innerHTML", {
    get: () => el._html,
    set: (v) => {
      // B127: browsers coerce on assignment (B122's html`` returns a
      // SafeHtml object, not a string) — the stub must do the same.
      v = String(v);
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

function installDoc() {
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
  globalThis.document = doc;
  return app;
}

/** Real 1996-class cards: the 14 featured ladders + the 1997 CHH roster. */
let playersLoaded = false;
function loadRealPlayers() {
  if (playersLoaded) return;
  playersLoaded = true;
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  const wanted = new Set(FEATURED_BOARD);
  const picked = rows.filter(
    (r) => wanted.has(r.bref) || (Number(r.season) === DRAFT_YEAR + 1 && r.team === GAMBLE_TEAM_ID),
  );
  for (const r of picked) PLAYERS.push(seasonToCard(r));
}

function gambleViewWithRealSave({ lang = "zh", seedRoot = null } = {}) {
  loadRealPlayers();
  const storage = createMemoryStorage();
  if (seedRoot) storage.setItem("cls_root_v3", JSON.stringify(seedRoot));
  installDoc();
  let langValue = lang;
  const shown = [];
  let writes = 0;
  const view = createDraftGambleView({
    getLang: () => langValue,
    readRootSave: () => readRootSave(storage),
    writeRootSave: (root) => {
      writes += 1;
      return writeRootSave(root, storage);
    },
    show: (id) => shown.push(id),
    goBack: () => {},
  });
  const el = view.mount();
  return {
    view, el, storage, shown,
    get writes() {
      return writes;
    },
    setLang: (next) => {
      langValue = next;
    },
    body: () => el.querySelector("#draft-gamble-body"),
  };
}

/** Fire a delegated [data-action] click on the screen element. */
function clickAction(t, action, dataset = {}) {
  const target = makeEl("button");
  target.dataset = { action, ...dataset };
  target.closest = (sel) => (sel === "[data-action]" ? target : null);
  t.el.fire("click", { target });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Play start-draft → picks → run-review; forfeit keeps it deterministic. */
async function driveToReview(t) {
  for (let i = 0; i < 60; i++) {
    const html = t.body().innerHTML;
    if (html.includes('data-action="run-review"')) {
      clickAction(t, "run-review");
      await tick();
      return;
    }
    if (html.includes('data-action="start-draft"')) clickAction(t, "start-draft");
    else if (html.includes('data-action="advance"')) clickAction(t, "advance");
    else if (html.includes('data-action="forfeit"')) clickAction(t, "forfeit");
    else if (html.includes('data-action="pick"')) {
      const prospect = html.match(/data-action="pick" data-prospect="([^"]+)"/)?.[1];
      assert.ok(prospect, "a pick button carries a prospect id");
      clickAction(t, "pick", { prospect });
    } else {
      assert.fail(`stuck in draft flow at iteration ${i}: ${html.slice(0, 200)}`);
    }
    await tick();
  }
  assert.fail("did not reach the review phase within 60 clicks");
}

test("gamble B136: open with no root save opens the scout phase instead of throwing", async () => {
  const t = gambleViewWithRealSave({ lang: "zh" });
  await assert.doesNotReject(() => t.view.open(), "open() must not throw without a save");
  assert.deepEqual(t.shown, ["draftGamble"], "the gamble screen still opens");
  assert.match(t.body().innerHTML, /开始选秀/, "scout phase renders");
  assert.equal(t.writes, 0, "no write is attempted against the missing root");
  assert.ok(!("cls_root_v3" in t.storage.dump()), "no root save is created as a side effect");
});

test("gamble B136: the no-save screen renders in English", async () => {
  const t = gambleViewWithRealSave({ lang: "en" });
  await t.view.open();
  assert.match(t.body().innerHTML, /Start the draft/, "en scout phase renders");
  assert.doesNotMatch(t.body().innerHTML, /开始选秀/, "en mode shows no Chinese button");
});

test("gamble B136: a tryout click with no save still updates the UI", async () => {
  const t = gambleViewWithRealSave({ lang: "zh" });
  await t.view.open();
  assert.match(t.body().innerHTML, /试训（剩余3）/, "three tryouts to start");
  clickAction(t, "tryout", { bref: "bryanko01" });
  await tick();
  assert.match(t.body().innerHTML, /试训（剩余2）/, "tryout spends the budget and re-renders");
  assert.equal(t.writes, 0, "the in-memory session writes nothing");
  assert.ok(!("cls_root_v3" in t.storage.dump()), "still no root save after playing");
});

test("gamble B136: a full no-save run to review, then restart starts a fresh run", async () => {
  const t = gambleViewWithRealSave({ lang: "zh" });
  await t.view.open();
  await driveToReview(t);
  assert.match(t.body().innerHTML, /三年推演/, "review phase renders (B136: runReview sort fix)");
  assert.match(t.body().innerHTML, /换个种子再来一次/, "review phase offers a restart");
  clickAction(t, "restart");
  await tick();
  await tick();
  assert.match(t.body().innerHTML, /开始选秀/, "restart opens a fresh scout phase");
  assert.match(t.body().innerHTML, /试训（剩余3）/, "the fresh run has a full tryout budget");
  assert.equal(t.writes, 0, "restart writes nothing without a root");
  assert.ok(!("cls_root_v3" in t.storage.dump()), "restart creates no root save");
});

test("gamble B136: open with a root save persists the gamble and resumes it", async () => {
  const t = gambleViewWithRealSave({ lang: "zh", seedRoot: createRootState({}) });
  await t.view.open();
  assert.deepEqual(t.shown, ["draftGamble"]);
  const saved = readRootSave(t.storage);
  assert.equal(saved.gmDraftGamble?.version, 1, "the gamble state lands in the root");
  assert.equal(saved.gmDraftGamble?.seed, GAMBLE_SEED_DEFAULT, "default seed for a fresh run");
  assert.ok(t.writes >= 1, "opening a fresh run writes once");
  clickAction(t, "tryout", { bref: "bryanko01" });
  await tick();
  // Reopen: the saved run resumes instead of starting over.
  await t.view.open();
  assert.match(t.body().innerHTML, /试训（剩余2）/, "the tryout survived the reopen");
  assert.equal(readRootSave(t.storage).gmDraftGamble.seed, GAMBLE_SEED_DEFAULT, "same seed on resume");
});

test("gamble B136: restart with a root save clears the saved run and starts fresh", async () => {
  const t = gambleViewWithRealSave({ lang: "zh", seedRoot: createRootState({}) });
  await t.view.open();
  clickAction(t, "tryout", { bref: "bryanko01" });
  await tick();
  await driveToReview(t);
  assert.match(t.body().innerHTML, /三年推演/, "review phase renders before restart");
  clickAction(t, "restart");
  await tick();
  await tick();
  assert.match(t.body().innerHTML, /试训（剩余3）/, "restarted run has a full budget");
  assert.deepEqual(readRootSave(t.storage).gmDraftGamble.tryoutsUsed, {}, "the old run is gone from the root");
});
