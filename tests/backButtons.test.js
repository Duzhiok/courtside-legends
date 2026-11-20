import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  NO_BACK,
  STATIC_BACK_TARGETS,
  STACK_BACK_SCREENS,
  EXPLICIT_BACK,
  TRANSIENT_SCREENS,
  navPush,
  navPop,
  resolveDrawBack,
  resolveResultBack,
} from "../js/ui/navBack.js";
import { PHRASES } from "../js/i18n-phrases.js";

// Back-button standard (docs/implementation/back-button-layering-design.md):
// every non-home screen has one top-left back control, and back means
// "previous screen" by construction via a minimal nav stack. This file pins
// the stack rules, the back-target table, and the per-screen controls in
// index.html, so a future screen without a back control fails the suite.
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(HERE, "../index.html"), "utf8");
const CSS = readFileSync(join(HERE, "../css/style.css"), "utf8");
const PHRASE_KEYS = new Set(PHRASES.map(([zh]) => zh));

/** Registry key (js/app.js `screens`) -> <main> id in index.html. */
const SCREEN_IDS = {
  loading: "screen-loading",
  home: "screen-home",
  account: "screen-account",
  onboard: "screen-onboard",
  collection: "screen-collection",
  credits: "screen-credits",
  draw: "screen-draw",
  draft: "screen-draft",
  customHub: "screen-custom-hub",
  legend: "screen-legend",
  setup: "screen-setup",
  market: "screen-market",
  game: "screen-game",
  result: "screen-result",
  tournament: "screen-tournament",
  season: "screen-season",
  timeTravel: "screen-time-travel",
  sandbox: "screen-sandbox",
  familyDuel: "screen-family-duel",
  clutch: "screen-clutch",
  clutchPlay: "screen-clutch-play",
  clutchResult: "screen-clutch-result",
  clutch3d: "screen-clutch-3d",
  halfCourt: "screen-halfcourt",
};

/** Markup chunk of one screen: from its <main> to the next <main> (or EOF). */
function screenChunk(mainId) {
  const start = HTML.indexOf(`<main id="${mainId}"`);
  assert.notEqual(start, -1, `missing <main id="${mainId}">`);
  const next = HTML.indexOf('<main id="screen-', start + 1);
  return HTML.slice(start, next === -1 ? undefined : next);
}

// ---------------------------------------------------------------- stack rules

test("navPush/navPop: basic forward then back", () => {
  const stack = [];
  navPush(stack, "home", "customHub");
  navPush(stack, "customHub", "draft");
  assert.deepEqual(stack, ["home", "customHub"]);
  assert.equal(navPop(stack), "customHub");
  assert.equal(navPop(stack), "home");
  assert.equal(navPop(stack), null);
});

test("navPush: entering home / result / market clears the trail", () => {
  const stack = ["home", "customHub", "draft"];
  navPush(stack, "draft", "home");
  assert.deepEqual(stack, []);
  stack.push("home", "market");
  navPush(stack, "market", "result");
  assert.deepEqual(stack, []);
  stack.push("home", "season");
  navPush(stack, "season", "market");
  assert.deepEqual(stack, []);
});

test("navPush: transient sources are never pushed as back targets", () => {
  const stack = ["home"];
  navPush(stack, "result", "collection");
  navPush(stack, "game", "season");
  navPush(stack, "onboard", "collection");
  assert.deepEqual(stack, ["home"]);
});

test("navPush: re-entering a screen already on the trail truncates it", () => {
  // home -> season -> customHub -> season again: the stale season entry is
  // removed, so back from season goes home (not to customHub).
  const stack = [];
  navPush(stack, "home", "season");
  assert.deepEqual(stack, ["home"]);
  navPush(stack, "season", "customHub");
  assert.deepEqual(stack, ["home", "season"]);
  navPush(stack, "customHub", "season");
  assert.deepEqual(stack, ["home"]);
});

test("navPush: full career loop ends with back -> home, never setup", () => {
  const stack = [];
  navPush(stack, "home", "market");
  navPush(stack, "market", "setup");
  navPush(stack, "setup", "game");
  navPush(stack, "game", "result");
  assert.deepEqual(stack, []); // result cleared it
  navPush(stack, "result", "market");
  assert.deepEqual(stack, []);
  navPush(stack, "market", "setup");
  assert.deepEqual(stack, ["market"]);
  navPush(stack, "setup", "market"); // setup-back, second round
  assert.deepEqual(stack, []);
  assert.equal(navPop(stack), null); // back from market -> home
});

test("navPush: season entered from timeTravel backs to timeTravel", () => {
  const stack = [];
  navPush(stack, "home", "timeTravel");
  navPush(stack, "timeTravel", "season");
  assert.deepEqual(stack, ["home", "timeTravel"]);
  assert.equal(navPop(stack), "timeTravel");
});

test("navPush: no duplicate consecutive push", () => {
  const stack = [];
  navPush(stack, "home", "collection");
  navPush(stack, "collection", "draw");
  assert.deepEqual(stack, ["home", "collection"]);
});

test("resolveDrawBack: drops the collection entry when entered from the collection", () => {
  assert.deepEqual(resolveDrawBack(["home", "collection"]), ["home"]);
});

test("resolveDrawBack: leaves the trail alone when entered from elsewhere", () => {
  assert.deepEqual(resolveDrawBack(["home"]), ["home"]);
  assert.deepEqual(resolveDrawBack(["home", "account"]), ["home", "account"]);
  assert.deepEqual(resolveDrawBack([]), []);
});

test("draw-back deadlock: home -> draw -> collection backs home, never ping-pongs", () => {
  // Regression (user report 2026-11-20 17:27): the draw's back control
  // used to be a plain show("collection") — a forward navigation that
  // pushed "draw" onto the trail, so the collection's goBack() returned
  // straight to the draw and the two screens ping-ponged forever.
  // The fixed draw-back consumes the return entry (resolveDrawBack) and
  // shows the collection without pushing (navPopping in js/app.js).
  const stack = [];
  let cur = "home";
  const fwd = (to) => { navPush(stack, cur, to); cur = to; };
  const drawBack = () => { resolveDrawBack(stack); cur = "collection"; };
  const back = () => { cur = navPop(stack) || "home"; };
  fwd("draw");
  drawBack();
  assert.equal(cur, "collection");
  back();
  assert.equal(cur, "home");
  assert.deepEqual(stack, []);
});

test("draw-back deadlock: collection -> draw -> collection backs home", () => {
  const stack = [];
  let cur = "home";
  const fwd = (to) => { navPush(stack, cur, to); cur = to; };
  const drawBack = () => { resolveDrawBack(stack); cur = "collection"; };
  const back = () => { cur = navPop(stack) || "home"; };
  fwd("collection");
  fwd("draw");
  drawBack();
  assert.equal(cur, "collection");
  assert.deepEqual(stack, ["home"]);
  back();
  assert.equal(cur, "home");
  assert.deepEqual(stack, []);
});

test("draw-back (old behavior): plain show() forward-jump ping-pongs draw <-> collection", () => {
  // Pins the bug the fix removes: with a forward show("collection") as
  // the draw-back, back presses never reach home.
  const stack = [];
  let cur = "home";
  const fwd = (to) => { navPush(stack, cur, to); cur = to; };
  const back = () => { cur = navPop(stack) || "home"; };
  fwd("draw");
  for (let i = 0; i < 4; i++) {
    fwd("collection"); // old draw-back: forward show, pushes "draw"
    back(); // collection-back: goBack pops back to the draw
    assert.equal(cur, "draw", `press ${i + 1} must still be on the draw (the loop)`);
  }
  assert.notEqual(cur, "home");
});

test("draw-back handler wires resolveDrawBack + navPopping (no forward push)", () => {
  // The walk tests above pin the algorithm; this pins the actual wiring
  // in js/app.js, so a revert to the old plain show("collection")
  // handler fails the suite.
  const app = readFileSync(join(HERE, "../js/app.js"), "utf8");
  const at = app.indexOf('$("#btn-draw-back")');
  assert.notEqual(at, -1, "missing #btn-draw-back wiring in js/app.js");
  const chunk = app.slice(at, at + 1200);
  assert.ok(chunk.includes("resolveDrawBack(navStack)"), "draw-back must consume the return entry via resolveDrawBack");
  assert.ok(chunk.includes("navPopping = true"), "draw-back must show the collection without pushing (navPopping)");
  assert.ok(chunk.includes('show("collection")'), "draw-back must still land on the collection");
  assert.ok(chunk.includes("openCollection()"), "draw-back must still re-render the collection");
});

// ------------------------------------------------------------ result origin

test("resolveResultBack: season > career market > home", () => {
  assert.equal(resolveResultBack({ isSeason: true, isCareer: true }), "season");
  assert.equal(resolveResultBack({ isSeason: true }), "season");
  assert.equal(resolveResultBack({ isCareer: true }), "market");
  assert.equal(resolveResultBack({}), "home");
  assert.equal(resolveResultBack(), "home");
});

// ------------------------------------------------------- back-target table

test("back-target table covers every screen exactly once", () => {
  const covered = new Set([
    ...NO_BACK,
    ...Object.keys(STATIC_BACK_TARGETS),
    ...STACK_BACK_SCREENS,
    ...EXPLICIT_BACK,
  ]);
  assert.deepEqual(
    [...covered].sort(),
    Object.keys(SCREEN_IDS).sort(),
    "every screen must have exactly one back mechanism (navBack.js)",
  );
  for (const target of Object.values(STATIC_BACK_TARGETS)) {
    assert.ok(SCREEN_IDS[target], `static back target "${target}" is not a screen`);
  }
  for (const screen of TRANSIENT_SCREENS) {
    assert.ok(SCREEN_IDS[screen], `transient screen "${screen}" is not a screen`);
  }
});

// ------------------------------------------------------------ DOM controls

test("every non-home screen has a top-left back control (except game/result)", () => {
  for (const [key, mainId] of Object.entries(SCREEN_IDS)) {
    if (NO_BACK.has(key) || key === "game" || key === "result") continue;
    const chunk = screenChunk(mainId);
    if (key === "timeTravel") {
      // Time-travel's own treatment IS the standard (chevron + label, top-left).
      assert.ok(chunk.includes("tt-icon-btn"), "timeTravel must keep its top-left back (tt-icon-btn)");
    } else {
      assert.ok(
        chunk.includes('class="nav-back"'),
        `${key} (${mainId}) must have a .nav-back control`,
      );
    }
  }
});

test("market screen has a back control (was soft-trapped: no exit at all)", () => {
  assert.ok(screenChunk("screen-market").includes('id="btn-market-back"'));
});

test("game screen exit lives in the pause overlay (visible primary action)", () => {
  const chunk = screenChunk("screen-game");
  assert.ok(chunk.includes('id="btn-pause-leave"'), "pause overlay needs #btn-pause-leave");
  assert.ok(chunk.includes("保存并离开"), "#btn-pause-leave must say 保存并离开");
});

test("result screen keeps #btn-home as its (origin-aware) back control", () => {
  assert.ok(screenChunk("screen-result").includes('id="btn-home"'));
});

test("wizards have step-back controls", () => {
  assert.ok(screenChunk("screen-onboard").includes('id="btn-onboard-prev"'));
  assert.ok(
    screenChunk("screen-time-travel").includes('id="btn-time-travel-offers-back"'),
    "time-travel offers zone needs a back-to-wizard control",
  );
});

test("no back button is still the old transparent ghost top-right style", () => {
  const ghostBacks = [...HTML.matchAll(/class="btn ghost" id="btn-[a-z-]*back"/g)];
  assert.deepEqual(ghostBacks, [], "all back buttons must use .nav-back (or tt-icon-btn)");
});

test("every .nav-back label has a bilingual PHRASES entry", () => {
  const labels = [...HTML.matchAll(/class="nav-back"[^>]*><span>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.ok(labels.length >= 12, `expected 12+ .nav-back labels, got ${labels.length}`);
  for (const label of labels) {
    assert.ok(PHRASE_KEYS.has(label), `.nav-back label "${label}" needs a PHRASES entry`);
  }
});

test("shared .nav-back style exists (pill + chevron, mobile chevron-only)", () => {
  assert.ok(CSS.includes(".nav-back {"), "css/style.css must define .nav-back");
  assert.ok(CSS.includes(".nav-back::before"), ".nav-back needs the CSS chevron");
  assert.ok(CSS.includes(".nav-back span { display: none; }"), "mobile must hide the .nav-back label");
  assert.ok(CSS.includes(".panel-head > h2"), "panel-head titles must sit next to the back button");
});
