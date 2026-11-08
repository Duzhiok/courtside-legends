import test from "node:test";
import assert from "node:assert/strict";
import { CourtView } from "../js/engine/court.js";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";

function makeEl(id = "") {
  const el = {
    id,
    style: {},
    dataset: {},
    classList: {
      _set: new Set(),
      add: (...cls) => cls.forEach((c) => el.classList._set.add(c)),
      remove: (...cls) => cls.forEach((c) => el.classList._set.delete(c)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (el.classList._set.has(c)) el.classList._set.delete(c);
          else el.classList._set.add(c);
        } else if (force) el.classList._set.add(c);
        else el.classList._set.delete(c);
        return el.classList._set.has(c);
      },
      contains: (c) => el.classList._set.has(c),
    },
    children: [],
    textContent: "",
    innerHTML: "",
    appendChild: (child) => {
      el.children.push(child);
      return child;
    },
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    addEventListener: () => {},
    setAttribute: () => {},
    remove: () => {},
  };
  return el;
}

function makeRoot() {
  const parts = {};
  const ids = [
    "court-fx",
    "court-trails",
    "court-pass-arc",
    "court-fx-btn",
    "court-mode-btn",
    "court-stage",
    "court-tokens",
    "court-ball",
    "court-formation",
  ];
  for (const id of ids) parts[id] = makeEl(id);
  return {
    style: {},
    dataset: {},
    classList: makeEl().classList,
    innerHTML: "",
    querySelector: (sel) => parts[sel.replace("#", "")] || makeEl(),
    querySelectorAll: () => [],
  };
}

function installDom() {
  globalThis.document = { createElement: () => makeEl() };
  globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.requestAnimationFrame = () => 0; // never fires: only manual tick() drives the queue
  globalThis.cancelAnimationFrame = () => {};
  globalThis.performance = { now: () => Date.now() }; // real time: the queue's wake-up timers must be able to fire and drain
  globalThis.addEventListener = () => {};
}

function deepFreeze(obj) {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

/** Drive a seeded game synchronously, rendering every tick + event through the view. */
function playSeededGame(seed, effectsOn) {
  const view = new CourtView(makeRoot(), { labels: {} });
  view.setEffectsEnabled(effectsOn);
  const sim = new GameSim({
    home: realTeam("GSW", 2016),
    away: realTeam("CLE", 2016),
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(seed),
    onEvent: (e) => {
      if (e.meta?.shot) view.onShot(e.meta.shot);
      if (e.meta?.dunk) view.onDunk(e.meta.dunk);
      if (e.meta?.skill) view.skillPop(e.meta.skill);
      if (e.meta?.pass) view.onPass(e.meta.pass);
    },
    onTick: (snap) => {
      view.render(snap);
      view.tick(1000);
    },
    onEnd: (snap) => {
      view.render(snap);
      view.tick(1000);
    },
  });
  sim.running = true;
  let steps = 0;
  while (sim.running && steps < 2000) {
    sim.step();
    steps += 1;
    if (sim.paused) sim.setPaused(false); // quarter-break resume, like the UI
  }
  assert.equal(sim.running, false, "the seeded game finished");
  return sim.snapshot();
}

test("court render: a frozen snapshot renders without mutating sim state or the snapshot", () => {
  installDom();
  const sim = new GameSim({
    home: realTeam("GSW", 2016),
    away: realTeam("CLE", 2016),
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(21),
  });
  sim.running = true;
  for (let i = 0; i < 5; i++) {
    sim.step();
    if (sim.paused) sim.setPaused(false);
  }
  const frozen = deepFreeze(sim.snapshot());
  const frozenBefore = JSON.stringify(frozen);
  const simBefore = JSON.stringify(sim.snapshot());
  const view = new CourtView(makeRoot(), { labels: {} });
  // Every render-layer entry point, in strict mode (frozen input would throw on mutation).
  view.render(frozen);
  view.tick(1000);
  view.onShot({ shooterId: sim.snapshot().home.onCourt[0].id, made: true });
  view.onDunk({ shooterId: sim.snapshot().home.onCourt[0].id });
  view.skillPop({ actorId: sim.snapshot().home.onCourt[0].id });
  view.onPass({ passerId: sim.snapshot().home.onCourt[0].id, receiverId: sim.snapshot().home.onCourt[1].id });
  view.tick(2000);
  assert.equal(JSON.stringify(frozen), frozenBefore, "the frozen snapshot is untouched");
  assert.equal(JSON.stringify(sim.snapshot()), simBefore, "the sim is untouched by rendering");
});

test("court render: the same seeded game ends identically with effects on and off", () => {
  installDom();
  const on = playSeededGame(33, true);
  const off = playSeededGame(33, false);
  assert.deepEqual(off.score, on.score, "final score must not depend on animations");
  assert.deepEqual(off, on, "the whole final snapshot must be identical");
});
