// B150 follow-up 1 + B151 follow-ups 1-2: the hosted panel's mount behaviour, pinned with a fake DOM
// (no browser). Before this file, the suite only covered the pure builders and the settle rules:
//   - B150 M5: deleting `await afterPaint()` in open() left the whole suite green — nothing proved the
//     "settling" line was actually on screen before the first game blocked the thread.
//   - B151 M4: the second-open guard and the settle-time edit block were only covered by Muse's
//     throwaway panel probe, not by the suite.
//   - B151 M2: the chunking test derived its expectation from YIELD_EVERY_GAMES, so changing 5 -> 20
//     stayed green — the "every 5 games" cadence was never pinned by value.
// The fake DOM below is deliberately small: the panel only needs querySelector for [data-hosted] /
// [data-hosted-top] / .hl-settling / data-hosted-* controls, innerHTML writes, textContent on one line,
// and click/change dispatch with closest/matches/contains. A manual requestAnimationFrame stub stands
// in for the browser frame: callbacks only run when the test drains them, so "waited for a real frame"
// is observable instead of assumed.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

// Manual frame queue: afterPaint() in hostedView.js is requestAnimationFrame + setTimeout(0).
// Nothing advances until the test drains the queue, which is what makes the frame-wait observable.
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };

const hosted = await import("../js/data/hostedLeague.js");
const view = await import("../js/ui/hostedView.js");

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 23, 12, 0); // a Monday; three owed days stay in the same week
const noSave = () => {};

function card(id, name = id, team = "DEN") {
  return {
    id, bref: id, season: 2000, name, team, pos: "SF", age: 27, heightCm: 201,
    ovr2k: 72, ratingSource: "anchor", skills: [], speed: 70, strength: 65, stamina: 70, block: 60,
    three: 70, mid: 62, paint: 62, pass: 65, iq: 65, rebound: 55, defense: 60, steal: 55, scoring: 65, clutch: 60,
    intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 },
  };
}
const POOL = [
  ...["a", "b", "c", "d", "e"].map((id) => card(id)),
  // One real opponent team-season (7 players): hostedReady needs opponents to exist,
  // and hostedOpponents only keeps team-seasons with >= 7 players.
  ...["o1", "o2", "o3", "o4", "o5", "o6", "o7"].map((id) => card(id, id, "LAL")),
];
const account = (extra = {}) => ({ id: "acc-m", playerIds: ["a", "b", "c", "d", "e"], cardMods: {}, gold: 0, ...extra });

// --- minimal fake DOM ---

const settlingTexts = []; // every textContent write on the .hl-settling line, in order
const toCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function readAttrs(el, attrStr) {
  for (const m of attrStr.matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) {
    const name = m[1];
    const value = m[2] ?? "";
    el.attributes.set(name, value);
    if (name === "class") el.classNames = value.split(/\s+/).filter(Boolean);
    if (name.startsWith("data-")) el.dataset[toCamel(name.slice(5))] = value;
  }
}

function parseChildren(el, html) {
  el.children = [];
  const line = html.match(/<p class="hl-settling"[^>]*>([^<]*)<\/p>/);
  if (line) {
    const p = fakeEl("p");
    p.classNames = ["hl-settling"];
    p._text = line[1]; // the initial paint: not a progress tick, so it is not logged
    p.parentNode = el;
    p.onText = (t) => settlingTexts.push(t);
    el.children.push(p);
  }
  for (const m of html.matchAll(/<button\b([^>]*)>/g)) {
    const b = fakeEl("button");
    readAttrs(b, m[1]);
    b.parentNode = el;
    el.children.push(b);
  }
  const sel = html.match(/<select\b([^>]*)>/);
  if (sel) {
    const s = fakeEl("select");
    readAttrs(s, sel[1]);
    s.value = "";
    s.parentNode = el;
    el.children.push(s);
  }
}

function fakeEl(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    parentNode: null,
    dataset: {},
    attributes: new Map(),
    classNames: [],
    _text: "",
    _html: "",
    _innerWrites: 0,
    _listeners: {},
    onText: null,
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); if (this.onText) this.onText(this._text); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this._innerWrites += 1; parseChildren(this, this._html); },
    hasAttribute(name) { return this.attributes.has(name); },
    matches(sel) {
      if (sel.startsWith(".")) return this.classNames.includes(sel.slice(1));
      const attr = sel.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/);
      if (attr) {
        const key = toCamel(attr[1]);
        return attr[2] === undefined ? key in this.dataset : this.dataset[key] === attr[2];
      }
      return this.tagName.toLowerCase() === sel.toLowerCase();
    },
    querySelector(sel) {
      for (const child of this.children) {
        if (child.matches(sel)) return child;
        const found = child.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    closest(sel) {
      let n = this;
      while (n) { if (n.matches?.(sel)) return n; n = n.parentNode; }
      return null;
    },
    contains(node) {
      let n = node;
      while (n) { if (n === this) return true; n = n.parentNode; }
      return false;
    },
    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
    dispatch(type, target) { for (const fn of this._listeners[type] || []) fn({ type, target }); },
  };
  return el;
}

function fakeRoot() {
  const root = fakeEl("div");
  const top = fakeEl("div");
  top.dataset.hostedTop = "";
  const box = fakeEl("div");
  box.dataset.hosted = "";
  top.parentNode = root;
  box.parentNode = root;
  root.children = [top, box];
  return { root, top, box };
}

// Settle 3 owed days (60 games) with a deterministic stub game: even indices win.
// Gold arithmetic (taper + weekly cap 25, all in the same week; losses pay too, at 12 x share):
// day 1 pays 20 games (wins ¤40 + ¤30, losses ¤18 + ¤6 = ¤94), day 2 pays 5 games
// (wins ¤40, losses ¤18 = ¤58), day 3 pays nothing — total ¤152, paid exactly once.
function setupPanel({ daysOwed = 3 } = {}) {
  const acc = account();
  hosted.setHostedPlan(acc, { playerId: "a", attr: "three" }, { now: T0, save: noSave });
  const { root, top, box } = fakeRoot();
  const playFactoryCalls = [];
  const playCalls = [];
  const panel = view.createHostedPanel({
    root,
    getAccount: () => acc,
    pool: () => POOL,
    now: () => T0 + (daysOwed + 1) * DAY,
    save: noSave,
    play: () => {
      playFactoryCalls.push(1);
      return ({ index }) => {
        playCalls.push(index);
        return { won: index % 2 === 0, score: { me: 100 + index, opponent: 90 }, opponent: "OPP|2000" };
      };
    },
  });
  return { acc, root, top, box, panel, playFactoryCalls, playCalls };
}

// Drive the manual frames until the promise settles (or fail loudly instead of hanging).
async function drain(promise, cap = 500) {
  let done = false;
  let value;
  let error;
  promise.then((v) => { done = true; value = v; }, (e) => { done = true; error = e; });
  for (let i = 0; i < cap && !done; i++) {
    for (const cb of rafQueue.splice(0)) cb();
    await new Promise((r) => setTimeout(r, 0));
  }
  assert.ok(done, "open() never settled");
  if (error) throw error;
  return value;
}

test("open() paints the settling line and waits for a real frame before the first game", async () => {
  const { top, panel, playFactoryCalls, playCalls } = setupPanel();
  const p = panel.open(); // not awaited: observe what happens before the first frame
  assert.match(top.innerHTML, /正在结算你离线时的比赛/, "the settling line is on screen first");
  assert.equal(playFactoryCalls.length, 0, "no game factory yet — the frame has not happened");
  assert.equal(playCalls.length, 0, "no game settled yet");
  assert.equal(rafQueue.length, 1, "exactly one frame is being waited for");
  assert.equal(await drain(p), true, "three days settle");
  assert.equal(playCalls.length, 60, "all 60 games ran, once");
});

test("a second open() while settling returns false and the days are paid exactly once", async () => {
  const { acc, panel, playCalls } = setupPanel();
  const first = panel.open();
  const second = panel.open();
  // Drain the second promise too: without the guard it would start a second settlement,
  // which needs frames — a bare await would deadlock the test instead of failing it.
  assert.equal(await drain(second), false, "second visit while settling must not settle again");
  assert.equal(await drain(first), true);
  assert.equal(playCalls.length, 60, "no second settlement ran");
  assert.equal(acc.gold, 152, "gold paid once: ¤94 + ¤58 + ¤0, not doubled");
  assert.equal(hosted.hostedState(acc).settledDay, hosted.dayOf(T0 + 3 * DAY), "settled through yesterday");
});

test("plan edits and the focus-picker change wait until settling is done", async () => {
  const { acc, root, box, panel } = setupPanel();
  const p = panel.open();
  // While the games are running, try to turn hosted league off and to switch the focus player.
  root.dispatch("click", box.querySelector("[data-hosted-off]"));
  const select = box.querySelector("[data-hosted-player]");
  select.value = "b";
  root.dispatch("change", select);
  assert.equal(await drain(p), true);
  assert.deepEqual(hosted.hostedState(acc).plan, { playerId: "a", attr: "three" }, "the off click was ignored mid-settle");
  assert.match(box.innerHTML, /value="a" selected/, "the focus picker still shows the plan's player");
  assert.doesNotMatch(box.innerHTML, /value="b" selected/, "the mid-settle change never landed");
});

test("progress ticks rewrite one line only: the form is painted at the start and at the end, never per tick", async () => {
  settlingTexts.length = 0;
  const { top, box, panel } = setupPanel();
  const p = panel.open();
  const boxWritesAtStart = box._innerWrites;
  const topWritesAtStart = top._innerWrites;
  assert.equal(boxWritesAtStart, 1, "the form is painted once when settling starts");
  assert.equal(topWritesAtStart, 1, "the settling line is painted once when settling starts");
  assert.equal(await drain(p), true);
  assert.equal(box._innerWrites, 2, "the form is painted again only after settling ends");
  assert.equal(top._innerWrites, 2, "the top slot is rewritten only once more, for the welcome-back card");
  // 3 days x 20 games, one yield every 5 games: exactly 11 ticks, each 5 games further.
  // Literal percentages — changing YIELD_EVERY_GAMES 5 -> 20 would report 33% then 67% instead.
  const percents = settlingTexts.map((t) => Number(t.match(/· (\d+)%/)?.[1]));
  assert.deepEqual(percents, [8, 17, 25, 33, 42, 50, 58, 67, 75, 83, 92], "11 ticks, 5 games apart");
  assert.ok(!top.innerHTML.includes("正在结算"), "the settling line is gone once the report is up");
});
