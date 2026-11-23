import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TACTICS } from "../js/data/coaches.js";
import { COACH_MODE_KEY, DEFAULT_COACH_MODE, sanitizeCoachMode, readCoachMode, writeCoachMode, simpleTactics, createCoachMode } from "../js/ui/coachMode.js";

const POOL = Array.isArray(TACTICS) ? TACTICS : Object.values(TACTICS);
const ids = (list) => list.map((t) => t.id);
const memory = (initial = {}) => {
  const m = { ...initial };
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, dump: () => m };
};
const fakeEl = () => {
  const attrs = {}, listeners = {};
  return { attrs, setAttribute: (k, v) => { attrs[k] = String(v); }, addEventListener: (t, fn) => { listeners[t] = fn; }, click: () => listeners.click?.(), textContent: "" };
};

test("the mode is a device preference: simple unless the player chose otherwise; junk and a broken store fall back to simple", () => {
  assert.equal(DEFAULT_COACH_MODE, "simple");
  assert.equal(sanitizeCoachMode("advanced"), "advanced");
  for (const bad of [undefined, null, "", "expert", 1]) assert.equal(sanitizeCoachMode(bad), "simple");
  const store = memory();
  assert.equal(readCoachMode(store), "simple");
  assert.equal(writeCoachMode(store, "advanced"), true);
  assert.equal(store.dump()[COACH_MODE_KEY], "advanced");
  assert.equal(readCoachMode(store), "advanced");
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(readCoachMode(broken), "simple");
  assert.equal(writeCoachMode(broken, "advanced"), false);
  assert.equal(readCoachMode(null), "simple");
});

test("simple tactics: the even baseline, the fastest and the sturdiest defence of what THIS coach can run", () => {
  const out = simpleTactics(POOL);
  assert.deepEqual(ids(out), ["balanced", "transition", "grind"]);
  const best = (key, skip) => POOL.filter((t) => !skip.includes(t.id)).reduce((a, b) => ((b[key] || 0) > (a[key] || 0) ? b : a));
  assert.equal(out[1].id, best("pace", ["balanced"]).id);
  assert.equal(out[2].id, best("defense", ["balanced", out[1].id]).id);
});

test("simple tactics: the set does not move when you pick one of them, and the current pick is never missing from the dropdown", () => {
  const base = ids(simpleTactics(POOL, "balanced"));
  for (const id of base) assert.deepEqual(ids(simpleTactics(POOL, id)), base, `picking ${id} must not reshuffle the others`);
  const odd = ids(simpleTactics(POOL, "triangle"));
  assert.deepEqual(odd, [...base, "triangle"], "a tactic outside the three is appended, not swapped in");
  assert.deepEqual(ids(simpleTactics(POOL, "no-such-tactic")), base);
});

test("simple tactics: the baseline is the coach's own system when he has one", () => {
  const out = simpleTactics(POOL, "triangle", "triangle");
  assert.equal(out[0].id, "triangle");
  assert.equal(out.length, 3, "his system IS the baseline, so the current pick adds nothing");
  assert.deepEqual(ids(simpleTactics(POOL, null, "triangle")), ids(out));
  assert.deepEqual(ids(simpleTactics(POOL, null, "not-in-the-pool")), ["balanced", "transition", "grind"], "unknown base falls back to balanced");
  const pool = POOL.filter((t) => ["triangle", "pack_paint", "motion"].includes(t.id));
  assert.equal(simpleTactics(pool, null, "triangle")[0].id, "triangle");
});

test("simple tactics: small or unusual pools", () => {
  assert.deepEqual(simpleTactics([], "x"), []);
  assert.deepEqual(simpleTactics(null), []);
  const only = POOL.filter((t) => t.id === "balanced");
  assert.deepEqual(ids(simpleTactics(only)), ["balanced"]);
  const noBalanced = POOL.filter((t) => ["motion", "grind"].includes(t.id));
  const out = simpleTactics(noBalanced);
  assert.equal(out.length, 2, "never duplicates a tactic");
  assert.equal(new Set(ids(out)).size, 2);
  assert.equal(out[0].id, noBalanced[0].id, "no balanced tactic: the first one the coach has is the baseline");
});

test("createCoachMode: starts from the stored preference, toggles on click, stores it, tells the host once, and survives a throwing host", () => {
  const panel = fakeEl(), button = fakeEl(), store = memory();
  const seen = [];
  const mode = createCoachMode({ panel, button, storage: store, onChange: (m) => seen.push(m) });
  assert.equal(mode.mode(), "simple");
  assert.equal(panel.attrs["data-coach-mode"], "simple");
  assert.equal(button.attrs["aria-pressed"], "false");
  assert.equal(button.textContent, "高级");
  button.click();
  assert.equal(mode.mode(), "advanced");
  assert.equal(panel.attrs["data-coach-mode"], "advanced");
  assert.equal(button.attrs["aria-pressed"], "true");
  assert.equal(store.dump()[COACH_MODE_KEY], "advanced");
  mode.set("advanced"); // no change: no second notification
  assert.deepEqual(seen, ["advanced"]);
  mode.toggle();
  assert.deepEqual(seen, ["advanced", "simple"]);

  const again = createCoachMode({ panel: fakeEl(), button: fakeEl(), storage: memory({ [COACH_MODE_KEY]: "advanced" }) });
  assert.equal(again.mode(), "advanced", "remembered across visits");

  const angry = createCoachMode({ panel: fakeEl(), button: fakeEl(), storage: memory(), onChange() { throw new Error("host broke"); } });
  const quiet = console.error; console.error = () => {};
  try { assert.doesNotThrow(() => angry.set("advanced")); } finally { console.error = quiet; }
  assert.equal(angry.mode(), "advanced");

  let lang = "zh";
  const b2 = fakeEl();
  const l = createCoachMode({ panel: fakeEl(), button: b2, getLang: () => lang });
  assert.equal(b2.textContent, "高级");
  lang = "en"; l.refreshLabel();
  assert.equal(b2.textContent, "Advanced");
  assert.doesNotThrow(() => createCoachMode({ panel: null, button: null }));
});

// ---- the markup: what simple mode keeps and what it hides ----

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const tagOf = (id) => { const i = html.indexOf(`id="${id}"`); assert.ok(i > 0, `#${id} exists`); return html.slice(html.lastIndexOf("<", i), html.indexOf(">", i) + 1); };
const hasAdv = (tag) => /class="[^"]*\badv-only\b/.test(tag);

test("markup: everything a game needs minute to minute stays visible in simple mode", () => {
  const keep = ["btn-timeout", "btn-shout", "btn-resume", "btn-speed", "btn-pause-sim", "btn-coach-drawer", "btn-coach-mode", "tactic-select", "btn-set-tactic", "tactic-help",
    "takeover-tempo-row", "takeover-panel", "deadball-panel", "btn-save-game", "btn-save-leave", "btn-quick-sim", "momentum-meter", "oncourt-you", "bench-you"];
  for (const id of keep) assert.ok(!hasAdv(tagOf(id)), `#${id} must not be advanced-only`);
  // and no enclosing container of those is hidden either
  const body = html.slice(html.indexOf('<aside class="coach-panel">'), html.indexOf("</aside>", html.indexOf('<aside class="coach-panel">')));
  for (const wrapper of ['<div class="takeover-panel"', '<div id="deadball-panel"', '<div class="tactic-row"', '<div class="btn-row live-only-row"', '<div class="coach-body"']) {
    const i = body.indexOf(wrapper);
    assert.ok(i >= 0, `${wrapper} found`);
    assert.ok(!hasAdv(body.slice(i, body.indexOf(">", i) + 1)), `${wrapper} must not be advanced-only`);
  }
});

test("markup: the advanced panels are tagged, none of them removed", () => {
  const adv = ["takeover-focus-select", "tempo-select", "focus-play-select", "tempo-help", "focus-help", "live-skill-panel", "live-packs", "btn-talk", "live-phil-panel", "player-orders-panel",
    "defense-panel", "btn-auto-offense", "btn-auto-defense", "btn-auto-rotation", "btn-tier-conservative", "btn-tier-balanced", "btn-tier-aggressive", "timeout-tier-label", "managed-hint", "takeover-status", "btn-takeover-hide"];
  const containers = new Set(["takeover-focus-select", "tempo-select", "focus-play-select", "btn-talk"]); // controls that are hidden by their row
  for (const id of adv) {
    const tag = tagOf(id);
    if (containers.has(id)) continue;
    assert.ok(hasAdv(tag), `#${id} should be advanced-only`);
  }
  for (const id of containers) {
    const i = html.indexOf(`id="${id}"`);
    const row = html.lastIndexOf('<div class="', i);
    assert.ok(hasAdv(html.slice(row, html.indexOf(">", row) + 1)), `the row holding #${id} should be advanced-only`);
  }
  assert.ok(/\[data-coach-mode="simple"\] \.adv-only \{ display: none/.test(fs.readFileSync(new URL("../css/matchBroadcast.css", import.meta.url), "utf8")));
});
