import test from "node:test";
import assert from "node:assert/strict";
import { CourtView } from "../js/engine/court.js";

// CourtView schedules animation frames while a push is in progress;
// Node has no rAF, and the tests drive renders manually, so no-op it.
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

// rebuildTokens creates token divs via the global document.
globalThis.document = { createElement: () => makeEl() };

/**
 * Simple capsule players (R66): the same CourtView positions, but tokens
 * render as CSS figures (head + body + name) instead of photo avatars.
 * court.js is DOM code, so the tests run it against small element stubs.
 * The stubs only need what CourtView touches: innerHTML, appendChild,
 * querySelector (by id on the root, by class on tokens), style, and a
 * Set-backed classList.
 */

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

function makeEl() {
  const children = [];
  const bySelector = new Map();
  let html = "";
  return {
    tagName: "DIV",
    className: "",
    get innerHTML() {
      return html;
    },
    // Clearing innerHTML must drop children, like a real element:
    // rebuildTokens relies on this to replace the token set.
    set innerHTML(v) {
      html = v;
      if (v === "") children.length = 0;
    },
    style: {},
    children,
    classList: makeClassList(),
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    querySelector: (sel) => {
      if (!bySelector.has(sel)) {
        bySelector.set(sel, { textContent: "", classList: makeClassList(), style: {} });
      }
      return bySelector.get(sel);
    },
    addEventListener: () => {},
  };
}

function makeRoot() {
  const parts = {
    "#court-stage": makeEl(),
    "#court-tokens": makeEl(),
    "#court-ball": makeEl(),
    "#court-formation": makeEl(),
    "#court-mode-btn": makeEl(),
  };
  return {
    querySelector: (sel) => parts[sel] || null,
    innerHTML: "",
    _parts: parts,
  };
}

function player(id, name, pos, pts = 0) {
  return { id, name, pos, playPos: pos, stats: { pts } };
}

function snap(ptsHome = 0) {
  const homeCourt = ["C", "PF", "SF", "SG", "PG"].map(
    (pos, i) => player(`h${i}`, `Home Player ${i + 1}`, pos, ptsHome)
  );
  const awayCourt = ["C", "PF", "SF", "SG", "PG"].map(
    (pos, i) => player(`a${i}`, `Away Player ${i + 1}`, pos, 0)
  );
  return {
    possession: "home",
    home: { name: "主队", tactic: { id: "balanced", name: "均衡" }, onCourt: homeCourt },
    away: { name: "客队", tactic: { id: "balanced", name: "均衡" }, onCourt: awayCourt },
  };
}

function setup() {
  const root = makeRoot();
  const view = new CourtView(root);
  view.render(snap());
  return { root, view };
}

test("court simple: photo mode renders avatar images, simple mode renders humanoid figures", () => {
  const { root, view } = setup();
  const tokenBox = root._parts["#court-tokens"];
  assert.equal(view.simple, false);
  assert.ok(tokenBox.children.length === 10, "5v5 tokens");
  assert.ok(tokenBox.children.every((el) => el.innerHTML.includes("<img")));
  assert.ok(tokenBox.children.every((el) => !el.innerHTML.includes("tok-figure")));

  view.setSimpleMode(true);
  assert.equal(view.simple, true);
  assert.ok(tokenBox.children.every((el) => el.innerHTML.includes("tok-figure")));
  assert.ok(tokenBox.children.every((el) => !el.innerHTML.includes("<img")));
  assert.ok(tokenBox.children.every((el) => el.className.includes("simple")));
  // Humanoid figures: jersey torso with position letters, two arms,
  // two legs, names stay visible.
  const first = tokenBox.children[0];
  assert.match(first.innerHTML, /tok-torso/);
  assert.match(first.innerHTML, /tok-arm left/);
  assert.match(first.innerHTML, /tok-arm right/);
  assert.match(first.innerHTML, /tok-leg left/);
  assert.match(first.innerHTML, /tok-leg right/);
  assert.match(first.innerHTML, /tok-name/);

  view.setSimpleMode(false);
  assert.ok(tokenBox.children.every((el) => el.innerHTML.includes("<img")));
});

test("court simple: points keep updating through moveToken in simple mode", () => {
  const { root, view } = setup();
  view.setSimpleMode(true);
  const tokenBox = root._parts["#court-tokens"];
  const firstToken = tokenBox.children[0];
  const ptsEl = firstToken.querySelector(".tok-pts");
  view.render(snap(12));
  assert.equal(ptsEl.textContent, "12");
});

test("court simple: pushing class follows the 2.6s push phase", () => {
  const { root, view } = setup();
  const stage = root._parts["#court-stage"];
  // Fresh possession change starts the push: phase < 1.
  assert.equal(stage.classList.contains("pushing"), true);
  // A re-render long after the phase started ends the push.
  view._phaseStart = performance.now() - 5000;
  view.render(snap());
  assert.equal(stage.classList.contains("pushing"), false);
});

test("court shot arc: made shot flies shooter to rim and ends clean", () => {
  const { view } = setup();
  // SG (h3) sits off-center, so the arc's travel is actually measurable.
  view.onShot({ shooterId: "h3", made: true });
  assert.ok(view._shot);
  // The arc starts exactly where the shooter token stands.
  assert.deepEqual(view._shot.from, view._lastTokenPos.get("home-h3"));
  assert.equal(view._shot.to.y, 6); // home attacks the top rim
  const start = view._shot.start;
  const fromX = view._shot.from.x;
  const fromY = view._shot.from.y;
  view._shotFrame(start + 375); // mid-flight
  const midLeft = parseFloat(view.ball.style.left);
  const midTop = parseFloat(view.ball.style.top);
  assert.ok(midLeft > fromX && midLeft < 50, `mid x ${midLeft} should travel ${fromX} -> 50`);
  assert.ok(midTop < fromY && midTop > 6, `mid y ${midTop} should travel ${fromY} -> 6`);
  assert.equal(view.ball.style.width, "20px"); // peak height reads as size
  view._shotFrame(start + 750 + 150 + 1); // past the net phase
  assert.equal(view._shot, null);
  assert.equal(view.ball.style.transition, "");
  assert.equal(view.ball.style.width, "");
});

test("court shot arc: missed shot bounces off the rim and settles short", () => {
  const { view } = setup();
  view.onShot({ shooterId: "h3", made: false });
  const start = view._shot.start;
  view._shotFrame(start + 750 + 300 + 1); // past the bounce phase
  assert.equal(view._shot, null);
  assert.equal(parseFloat(view.ball.style.left), 50);
  assert.ok(Math.abs(parseFloat(view.ball.style.top) - 10) < 0.01); // rim 6 + 4 settle
});

test("court shot arc: render during flight does not move the ball", () => {
  const { view } = setup();
  view.onShot({ shooterId: "h3", made: true });
  view._shotFrame(view._shot.start + 200);
  const left = view.ball.style.left;
  const top = view.ball.style.top;
  view.render(snap());
  assert.equal(view.ball.style.left, left);
  assert.equal(view.ball.style.top, top);
});

test("court shot arc: onShot before any render is a silent no-op", () => {
  const root = makeRoot();
  const view = new CourtView(root);
  view.onShot({ shooterId: "h3", made: true });
  assert.equal(view._shot, null);
});

test("court dunk: token drives to the rim, ball shrinks through the net, ends clean", () => {
  const { root, view } = setup();
  const token = view.tokens.get("home-h3");
  assert.equal(view.onDunk("h3"), true);
  assert.ok(view._dunk);
  assert.deepEqual(view._dunk.from, view._lastTokenPos.get("home-h3"));
  assert.equal(view._dunk.to.y, 6); // home attacks the top rim
  assert.equal(token.classList.contains("dunking"), true);
  const start = view._dunk.start;
  const fromX = view._dunk.from.x;
  const fromY = view._dunk.from.y;
  view._dunkFrame(start + 210); // mid-drive
  const midLeft = parseFloat(token.style.left);
  const midTop = parseFloat(token.style.top);
  assert.ok(midLeft > fromX && midLeft < 50, `mid x ${midLeft} should travel ${fromX} -> 50`);
  assert.ok(midTop < fromY && midTop > 6, `mid y ${midTop} should travel ${fromY} -> 6`);
  assert.match(token.style.transform, /scale\(1\.43/);
  assert.equal(view.ball.style.left, token.style.left, "the ball follows the dunker");
  // Render mid-drive must not drag the token back to its slot.
  view.render(snap());
  assert.equal(token.style.left, `${midLeft}%`);
  view._dunkFrame(start + 420 + 75); // mid-net
  // performance.now() floats make the width 9 ± float noise, not exactly 9.
  assert.ok(Math.abs(parseFloat(view.ball.style.width) - 9) < 0.01);
  const hoop = root._parts["#court-stage"].querySelector(".fc-hoop.top");
  assert.equal(hoop.classList.contains("rim-shake"), true);
  view._dunkFrame(start + 420 + 150 + 200 + 1); // past the settle
  assert.equal(view._dunk, null);
  assert.equal(token.style.transition, "");
  assert.equal(token.style.transform, "");
  assert.equal(token.classList.contains("dunking"), false);
  assert.equal(view.ball.style.transition, "");
  assert.equal(view.ball.style.width, "");
});

test("court dunk: the follow-up score's shot arc is swallowed, the next shot is not", () => {
  const { view } = setup();
  assert.equal(view.onDunk("h3"), true);
  view.onShot({ shooterId: "h3", made: true });
  assert.equal(view._shot, null, "the dunk's own score must not also arc");
  view.onShot({ shooterId: "h3", made: true });
  assert.ok(view._shot, "the next shot arcs normally");
});

test("court dunk: missing token returns false and never suppresses", () => {
  const { view } = setup();
  assert.equal(view.onDunk("nobody"), false);
  assert.equal(view._dunk, null);
  view.onShot({ shooterId: "h3", made: true });
  assert.ok(view._shot, "no suppression without a drive");
});

test("court skill pop: token pulses, then clears", async () => {
  const { view } = setup();
  const token = view.tokens.get("home-h3");
  view.skillPop("h3");
  assert.equal(token.classList.contains("skill-pop"), true);
  view.skillPop("nobody"); // unknown id: silent no-op, never throws
  await new Promise((r) => setTimeout(r, 950));
  assert.equal(token.classList.contains("skill-pop"), false);
});

/**
 * B24: the six most-used tactics have their own frontcourt sets instead of
 * falling back to balanced. Rendered token positions carry a small live
 * drift (up to ~1.2 x / ~1.0 y), so every assertion below keeps a margin
 * of at least 3-4 over the drift. Slots are C(h0) → PF(h1) → SF(h2) →
 * SG(h3) → PG(h4); home attacks up, so a larger y is farther from the rim.
 */
function settledPositions(tacticId) {
  const { view } = setup();
  const s = snap();
  s.home.tactic = { id: tacticId, name: tacticId };
  view._phaseStart = performance.now() - 5000;
  view.render(s);
  const pos = {};
  for (const [key, p] of view._lastTokenPos) {
    if (key.startsWith("home-h")) pos[key.slice(5)] = p;
  }
  return pos;
}

test("B24: pnr_spam sets a high screen, handler stacked above the screener", () => {
  const p = settledPositions("pnr_spam");
  const b = settledPositions("balanced");
  assert.ok(Math.abs(p.h0.x - p.h4.x) < 4, "C and PG share an x (vertical stack)");
  assert.ok(p.h0.y - b.h0.y > 5, "screening C sits much higher than balanced C");
});

test("B24: post_up puts the C deep on the block", () => {
  const p = settledPositions("post_up");
  const b = settledPositions("balanced");
  assert.ok(p.h0.y < p.h1.y - 4, "C is nearest the rim, well clear of PF");
  assert.ok(p.h0.x - b.h0.x > 10, "C is on the block, not centered like balanced");
});

test("B24: five_out keeps everyone on the arc, nobody under the rim", () => {
  const p = settledPositions("five_out");
  const ys = Object.values(p).map((q) => q.y);
  assert.ok(Math.min(...ys) > 25, "no token near the rim");
});

test("B24: twin_towers puts both bigs on the blocks", () => {
  const p = settledPositions("twin_towers");
  assert.ok(Math.abs(p.h0.y - p.h1.y) < 4, "C and PF share the low block line");
  const sorted = Object.entries(p).sort((a, b) => a[1].y - b[1].y);
  assert.deepEqual(
    sorted
      .slice(0, 2)
      .map(([k]) => k)
      .sort(),
    ["h0", "h1"],
    "the two lowest tokens are the two bigs (either order — drift can swap them)",
  );
});

test("B24: paint_attack crowds three inside", () => {
  const p = settledPositions("paint_attack");
  const inside = Object.values(p).filter((q) => q.y < 20).length;
  assert.equal(inside, 3);
  const b = settledPositions("balanced");
  assert.ok(p.h1.y - b.h1.y < -4, "PF sits much lower than balanced PF");
});

test("B24: transition pushes the PG ahead with wide lanes", () => {
  const p = settledPositions("transition");
  const b = settledPositions("balanced");
  const ys = Object.values(p).map((q) => q.y);
  assert.equal(ys.indexOf(Math.max(...ys)), 4, "PG is farthest up-court");
  assert.ok(Math.abs(p.h2.x - p.h3.x) > 68, "wings fill both lanes");
  assert.ok(p.h4.y - b.h4.y > 2, "PG ahead of balanced PG");
});

// B54: court zone tags, the default formation label, and the formation line
// (phase + attack direction + balanced fallback) come from opts.labels, so
// English mode shows no hardcoded Chinese. Tactic names are also covered now
// (B54 remainder): they come from sim data (off.tactic) but every TACTICS
// entry carries nameEn, so CourtView resolves it per render via opts.getLang.
// (sim.js coach-switch feed text still uses tactic.name raw — separate gap.)
const EN_LABELS = {
  zoneAway: "Away basket",
  zoneHome: "Home basket",
  advancing: "Advancing",
  phaseInbound: "Inbounding",
  phaseCrossHalf: "Crossing half court",
  phaseSet: "Setting up offense",
  phaseFinish: "Finishing possession",
  attackHome: "Home attacking the away basket",
  attackAway: "Away attacking the home basket",
  balanced: "Balanced",
};

test("B54: English labels render zone tags and the advancing default, no hardcoded Chinese", () => {
  const root = makeRoot();
  const view = new CourtView(root, { labels: EN_LABELS });
  view.ensureDom();
  assert.ok(root.innerHTML.includes("Away basket"), "away zone tag in English");
  assert.ok(root.innerHTML.includes("Home basket"), "home zone tag in English");
  assert.ok(root.innerHTML.includes("Advancing"), "default formation label in English");
  assert.ok(!root.innerHTML.includes("客队篮筐"), "no hardcoded away zone tag");
  assert.ok(!root.innerHTML.includes("主队篮筐"), "no hardcoded home zone tag");
  assert.ok(!root.innerHTML.includes("推进中"), "no hardcoded advancing label");
});

test("B54: no labels passed keeps the Chinese defaults", () => {
  const root = makeRoot();
  const view = new CourtView(root);
  view.ensureDom();
  assert.ok(root.innerHTML.includes("客队篮筐"), "away zone tag defaults to Chinese");
  assert.ok(root.innerHTML.includes("主队篮筐"), "home zone tag defaults to Chinese");
  assert.ok(root.innerHTML.includes("推进中"), "default formation label stays Chinese");
});

test("B54: formation line uses English phase and direction with labels passed", () => {
  const root = makeRoot();
  const view = new CourtView(root, { labels: EN_LABELS, getLang: () => "en" });
  const s = snap();
  s.home.tactic = { id: "balanced", name: "均衡", nameEn: "Balanced Offense" };
  view.render(s);
  const line = root._parts["#court-formation"].textContent;
  // A fresh render starts a new possession, so the phase is inbounding.
  assert.ok(line.includes("Inbounding"), `phase in English, got: ${line}`);
  assert.ok(
    line.includes("Home attacking the away basket"),
    `direction in English, got: ${line}`,
  );
  assert.ok(!line.includes("发球推进"), "no hardcoded phase name");
  assert.ok(!line.includes("主队攻向客队篮"), "no hardcoded direction");
  // B54 remainder: the tactic name resolves via nameEn in English mode.
  assert.ok(line.includes("Balanced Offense"), `tactic name in English, got: ${line}`);
  assert.ok(!line.includes("均衡"), "no Chinese tactic name in English mode");
});

test("B54: no getLang passed keeps the Chinese tactic name (bare construction)", () => {
  const root = makeRoot();
  const view = new CourtView(root, { labels: EN_LABELS });
  const s = snap();
  s.home.tactic = { id: "balanced", name: "均衡", nameEn: "Balanced Offense" };
  view.render(s);
  const line = root._parts["#court-formation"].textContent;
  assert.ok(line.includes("均衡"), `tactic name defaults to Chinese, got: ${line}`);
  assert.ok(!line.includes("Balanced Offense"), "no English tactic name by default");
});

test("B54: English mode falls back to the Chinese name when nameEn is missing", () => {
  const root = makeRoot();
  const view = new CourtView(root, { labels: EN_LABELS, getLang: () => "en" });
  view.render(snap());
  const line = root._parts["#court-formation"].textContent;
  assert.ok(line.includes("均衡"), `missing nameEn falls back to name, got: ${line}`);
});

test("B54: a mid-game language flip re-renders the tactic name on next render", () => {
  const root = makeRoot();
  let lang = "zh";
  const view = new CourtView(root, { labels: EN_LABELS, getLang: () => lang });
  const s = snap();
  s.home.tactic = { id: "balanced", name: "均衡", nameEn: "Balanced Offense" };
  view.render(s);
  assert.ok(
    root._parts["#court-formation"].textContent.includes("均衡"),
    "Chinese tactic name before the flip",
  );
  lang = "en";
  view.render(s);
  const line = root._parts["#court-formation"].textContent;
  assert.ok(line.includes("Balanced Offense"), `tactic name flips to English, got: ${line}`);
  assert.ok(!line.includes("均衡"), "no Chinese tactic name after the flip");
});

test("B54: formation line falls back to the balanced label when no tactic is set", () => {
  const root = makeRoot();
  const view = new CourtView(root, { labels: EN_LABELS });
  const s = snap();
  s.home.tactic = null;
  view.render(s);
  const line = root._parts["#court-formation"].textContent;
  assert.ok(line.includes("Balanced"), `balanced fallback in English, got: ${line}`);
  assert.ok(!line.includes("均衡"), "no hardcoded balanced fallback");
});
