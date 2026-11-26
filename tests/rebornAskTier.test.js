/**
 * PA3 interaction levels (L1 bubble / L2 compact panel / L3 full dialog): the pure rule, the stamp at every ask site (real games),
 * the markup per level, and the bubble's DOM behaviour (fake document + injectable timers). Game results are never asserted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";
import { teamCoach } from "../js/reborn/agency.js";
import { ASK_TIERS, BUBBLE_CLICK_GUARD_MS, BUBBLE_MS, BUBBLE_MS_QUICK, askTier, bubbleWindow, nextIgnored, opportunityOf } from "../js/reborn/participation.js";
import { driveGame } from "../js/reborn/season.js";
import { buildDefenseContext } from "../js/reborn/defense.js";
import { agencyBubbleHtml, agencyDialogHtml } from "../js/ui/reborn/agencyView.js";
import { showAskBubble } from "../js/ui/reborn/bubble.js";

const agency = { coach: teamCoach("CHI", 1996), iq: 60, decisionId: "tiers", autonomy: 0, trust: 60, role: "starter", mateStrength: {} };

function liveSim(seed, slotClock = 720) {
  const sim = new GameSim({ home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3, rng: seededStream(seed), onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  return Object.assign(sim, { autoOffense: true, autoDefense: true, autoRotation: true, _quiet: true, running: true, clock: slotClock });
}
async function collect(mode, seed, slot = 1) {
  const sim = liveSim(seed);
  const seen = [];
  await driveGame(sim, sim.home.onCourt[slot].id, {
    onTakeover: ({ context }) => { if (context) seen.push(context); return null; },
    agency,
    participation: { getMode: () => mode },
  });
  return seen;
}

test("1. the rule: a clutch moment or a coach disagreement is L3; important or a clear opening is L2; everything else is a bubble", () => {
  assert.equal(askTier({ critical: true }), "L3");
  assert.equal(askTier({ conflict: true }), "L3");
  assert.equal(askTier({ critical: true, importance: 0, opportunity: 0 }), "L3");
  assert.equal(askTier({ conflict: true, importance: 0.9, opportunity: 0.9 }), "L3", "L3 wins over L2");
  assert.equal(askTier({ importance: 0.55 }), "L2");
  assert.equal(askTier({ opportunity: 0.3 }), "L2");
  assert.equal(askTier({ importance: 0.54, opportunity: 0.29 }), "L1");
  assert.equal(askTier(), "L1");
  assert.deepEqual(Object.values(ASK_TIERS), ["L1", "L2", "L3"]);
});

test("2. the bubble's window shortens after two unanswered in a row and resets on an answer", () => {
  assert.equal(bubbleWindow(0), BUBBLE_MS);
  assert.equal(bubbleWindow(1), BUBBLE_MS);
  assert.equal(bubbleWindow(2), BUBBLE_MS_QUICK);
  assert.ok(BUBBLE_MS_QUICK < BUBBLE_MS);
  assert.equal(nextIgnored(0, false), 1);
  assert.equal(nextIgnored(5, true), 0);
});

test("3. every ask site stamps the tier by the one rule, in real games on every mode", async () => {
  const all = [];
  for (const mode of ["key", "high", "full"]) for (const seed of [2, 5, 9]) for (const c of await collect(mode, seed)) all.push({ mode, c });
  assert.ok(all.length > 20, `${all.length} contexts`);
  for (const { c } of all) {
    assert.ok(Object.values(ASK_TIERS).includes(c.tier), `every context carries a tier: ${c.tier}`);
    if (c.side === "defense") {
      assert.equal(c.tier, askTier({ importance: c.importance }), "a style choice is never L3");
      assert.notEqual(c.tier, "L3");
    } else {
      assert.equal(c.tier, askTier({ critical: !c.routine, conflict: !!c.coachInstruction, importance: c.importance ?? 0, opportunity: opportunityOf(c.values) }));
      if (c.coachInstruction) assert.equal(c.tier, "L3", "a coach disagreement is always the full panel");
      if (!c.routine) assert.equal(c.tier, "L3", "a clutch possession is always the full panel");
    }
  }
  const full = all.filter((x) => x.mode === "full").map((x) => x.c);
  const bubbles = full.filter((c) => c.tier === "L1").length;
  assert.ok(bubbles / full.length > 0.5, `Full control is mostly bubbles: ${bubbles}/${full.length}`);
  assert.ok(full.some((c) => c.tier === "L3"), "...but the real moments still get the full panel");
});

test("4. the classic once-per-game clutch ask (no participation setting) is L3", async () => {
  const sim = liveSim(7, 120);
  Object.assign(sim, { quarter: 4 });
  sim.score.home = 80;
  sim.score.away = 82;
  const seen = [];
  // Answering ends the once-per-game ask (declining it would ask again at the next eligible possession - PR4 behaviour).
  await driveGame(sim, sim.home.onCourt[1].id, { onTakeover: ({ context }) => { if (context) seen.push(context); return { choiceId: "pass" }; }, agency });
  assert.equal(seen.length, 1, "asked once");
  assert.equal(seen[0].tier, "L3", "the classic clutch ask is the full panel");
});

test("5. markup per level: L2 drops the coach card and the autonomy lecture but keeps the options; L3 is unchanged", async () => {
  const ctxs = [];
  for (const seed of [2, 5, 9]) ctxs.push(...(await collect("full", seed)).filter((c) => c.side !== "defense"));
  const l3 = ctxs.find((c) => c.tier === "L3");
  const l1 = ctxs.find((c) => c.tier === "L1");
  assert.ok(l3 && l1);
  const full = agencyDialogHtml({ context: l3, lang: "zh", mode: "full" });
  assert.match(full, /教练指令/);
  assert.match(full, /你的战术自主权/);
  const compact = agencyDialogHtml({ context: { ...l1, tier: "L2" }, lang: "zh", mode: "full", compact: true });
  assert.ok(!/教练指令/.test(compact) && !/你的战术自主权/.test(compact), "no coach card, no autonomy lecture");
  assert.equal((compact.match(/data-option=/g) || []).length, l1.options.length, "every option is still there");
  assert.match(compact, /reborn-agency-readline/);
  assert.match(compact, /role="dialog"/, "L2 still waits for you");
});

test("6. the bubble markup: one real line, a chip per option with its key, no dialog semantics, names escaped", async () => {
  const c = (await collect("full", 5)).find((x) => x.side !== "defense" && x.tier === "L1");
  assert.ok(c, "a bubble-level context exists");
  const html = agencyBubbleHtml({ context: { ...c, offer: { id: "x", name: "<img src=x onerror=alert(1)>", nameEn: "<b>Bad</b>", pos: "C", afterScreen: "roll", alt: "pop" } }, lang: "en" });
  assert.ok(!/<img|<b>Bad/.test(html), "a teammate's name never becomes markup");
  assert.match(html, /role="status"/);
  assert.ok(!/role="dialog"|aria-modal/.test(html), "a bubble is not a modal");
  assert.equal((html.match(/data-option=/g) || []).length, c.options.length);
  assert.match(html, /<kbd>1<\/kbd>/);
  assert.match(html, /Hover to pause/);
  const sim = liveSim(3);
  for (let i = 0; i < 40 && !(sim.possession === "away" && sim.clock > 30); i++) sim.step();
  const me = sim.home.onCourt[1];
  me.steal = 82;
  const d = buildDefenseContext(sim, me.id, { coach: agency.coach, iq: 60, decisionId: "b|d1" });
  const bubble = agencyBubbleHtml({ context: d, lang: "zh" });
  assert.match(bubble, /抢断能力出色/, "a defensive bubble shows his own facts");
  assert.match(bubble, /data-option="gamble"[^>]*><kbd>1<\/kbd> 赌抢断/);
  assert.match(bubble, /data-option="stay"/);
});

function fakeDom() {
  const doc = { listeners: {}, activeElement: null, body: { kids: [], appendChild(el) { this.kids.push(el); } } };
  doc.addEventListener = (t, f) => { doc.listeners[t] = f; };
  doc.removeEventListener = (t, f) => { if (doc.listeners[t] === f) delete doc.listeners[t]; };
  doc.createElement = () => {
    const classes = new Set();
    const el = { innerHTML: "", vars: {}, handlers: {}, offsetWidth: 0 };
    el.style = { setProperty: (k, v) => { el.vars[k] = v; } };
    el.classList = { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), has: (x) => classes.has(x) };
    el.addEventListener = (t, f) => { el.handlers[t] = f; };
    el.remove = () => { doc.body.kids = doc.body.kids.filter((k) => k !== el); };
    el.contains = () => false;
    return el;
  };
  const timers = [];
  const clock = { timers, set: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; }, clear: (id) => { if (timers[id]) timers[id].live = false; } };
  return { doc, clock };
}
const ctxFor = (options = ["drive", "pullup", "pass"]) => ({ options, offer: null, observation: { pick: "pass", clarity: "sharp" }, side: "offense", tier: "L1" });

test("7. the bubble in a DOM: a key answers it and cleans up; it never takes focus", async () => {
  const { doc, clock } = fakeDom();
  const pace = { ignored: 1 };
  const p = showAskBubble({ context: ctxFor(), lang: "zh", pace, doc, setTimer: clock.set, clearTimer: clock.clear });
  assert.equal(doc.body.kids.length, 1, "mounted on the body, not a shell screen");
  assert.ok(doc.listeners.keydown);
  doc.listeners.keydown({ key: "2", target: { tagName: "BODY" } });
  assert.equal(await p, "pullup");
  assert.equal(doc.body.kids.length, 0, "removed");
  assert.equal(doc.listeners.keydown, undefined, "key listener removed");
  assert.equal(pace.ignored, 0, "an answer resets the run of ignored bubbles");
});

test("8. unanswered: it times out to null, counts as ignored, and the window shortens after two in a row", async () => {
  const { doc, clock } = fakeDom();
  const pace = { ignored: 0 };
  const windows = [];
  for (let i = 0; i < 3; i++) {
    const p = showAskBubble({ context: ctxFor(), pace, doc, setTimer: clock.set, clearTimer: clock.clear });
    const live = clock.timers.filter((t) => t.live).at(-1);
    windows.push(live.ms);
    live.fn();
    assert.equal(await p, null);
  }
  assert.deepEqual(windows, [BUBBLE_MS, BUBBLE_MS, BUBBLE_MS_QUICK]);
  assert.equal(pace.ignored, 3);
  assert.equal(doc.body.kids.length, 0);
});

test("9. WCAG 2.2.1: hovering pauses the countdown, leaving restarts it; typing and modifier keys are ignored; a click answers", async () => {
  const { doc, clock } = fakeDom();
  let t = 1000;
  const p = showAskBubble({ context: ctxFor(), pace: { ignored: 0 }, doc, setTimer: clock.set, clearTimer: clock.clear, now: () => t });
  const host = doc.body.kids[0];
  assert.equal(clock.timers.filter((x) => x.live).length, 1);
  host.handlers.pointerenter();
  assert.equal(clock.timers.filter((t) => t.live).length, 0, "paused: no timer is running");
  assert.ok(host.classList.has("paused"));
  host.handlers.pointerleave();
  assert.equal(clock.timers.filter((t) => t.live).length, 1, "restarted");
  doc.listeners.keydown({ key: "1", target: { tagName: "INPUT" } });
  doc.listeners.keydown({ key: "1", ctrlKey: true, target: { tagName: "BODY" } });
  assert.equal(doc.body.kids.length, 1, "still waiting");
  const tap = { target: { closest: () => ({ dataset: { option: "pass" } }) } };
  t += BUBBLE_CLICK_GUARD_MS - 1;
  host.handlers.click(tap);
  assert.equal(doc.body.kids.length, 1, "a click in the first moments is not an answer (it may be the click that just started the game)");
  t += 1;
  host.handlers.click(tap);
  assert.equal(await p, "pass");
});

test("10. with no document (headless) a bubble resolves null at once and never hangs a game", async () => {
  assert.equal(await showAskBubble({ context: ctxFor(), doc: null }), null);
});
