import test from "node:test";
import assert from "node:assert/strict";
import { feedEventTier, legendHeadline } from "../js/ui/feedTier.js";
import { createRunTracker } from "../js/ui/feedRuns.js";
import { feedRowHtml, scoreSubLabel } from "../js/ui/feedView.js";

const COLORS = { home: { color: "#FDB927", code: "LAL", text: "#111" }, away: { color: "#007A33", code: "BOS", text: "#fff" } };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const AVATAR = '<img class="headshot feed-avatar" alt="">';
const CJK = /[\u4e00-\u9fff]/;

// Fixed event fixtures — nothing here depends on a simulated game.
const block = (over = {}) => ({
  type: "miss", text: "Gobert blocks Paul!", possession: "home", quarter: 4, clock: 20,
  score: { home: 80, away: 81 },
  meta: { actorId: "gob", block: { blockedName: "Paul", side: "away" } }, ...over,
});
const scoreEv = (home, away, over = {}) => ({
  type: "score", text: "X scores", possession: "home", quarter: 2, clock: 300,
  score: { home, away }, meta: { shot: { shooterId: "p", made: true, pts: 2 } }, ...over,
});

// ---- clutch blocks ----
test("a block in the last 24s of Q4 with the margin ≤3 is a legend; otherwise only important", () => {
  assert.deepEqual(feedEventTier(block()), { tier: "legend", kind: "block" });
  assert.equal(feedEventTier(block({ clock: 25 })).tier, "important", "one tick too early");
  assert.equal(feedEventTier(block({ score: { home: 80, away: 85 } })).tier, "important", "margin 5 is not close");
  assert.equal(feedEventTier(block({ score: { home: 80, away: 84 } })).tier, "important", "margin 4 is not close");
  assert.equal(feedEventTier(block({ quarter: 3 })).tier, "important", "Q3 is never clutch time");
  assert.equal(feedEventTier(block({ quarter: 5, clock: 10 })).tier, "legend", "overtime counts");
});

test("a block with no score snapshot can't be called clutch", () => {
  assert.equal(feedEventTier(block({ score: undefined })).tier, "important");
});

test("block card is about the blocker: their side, their avatar, and a sentence naming both players", () => {
  const r = feedRowHtml(block(), { colors: COLORS, actorName: "Gobert", avatarHtml: AVATAR, escFn: esc, lang: "en" });
  assert.match(r.html, /HIGHLIGHT · AWAY/, "the blocker's side, not the team that was attacking");
  assert.match(r.html, />BOS</, "the blocker's team chip");
  assert.equal(r.borderColor, COLORS.away.color);
  assert.match(r.html, /class="feed-legend-avatar">/);
  assert.match(r.html, /Clutch block!/);
  assert.match(r.html, /Gobert rejects Paul!/);
  assert.doesNotMatch(r.html, CJK, "English card must not leak Chinese");
});

test("block card falls back to a generic sentence when the players aren't known", () => {
  const r = feedRowHtml(block({ meta: undefined }), { colors: COLORS, escFn: esc, lang: "zh" });
  assert.match(r.html, /关键时刻的一记大帽！/);
  assert.doesNotMatch(r.html, /feed-legend-avatar/);
});

// ---- run tracker ----
const feedScores = (tracker, seq) => seq.map(([h, a]) => tracker.observe(scoreEv(h, a)));

test("a 10-0 run fires its milestone exactly once, then again at 15 and 20", () => {
  const t = createRunTracker();
  const out = feedScores(t, [[2, 0], [4, 0], [7, 0], [9, 0], [12, 0], [14, 0], [17, 0], [20, 0]]);
  assert.deepEqual(out.map((r) => r.points), [2, 4, 7, 9, 12, 14, 17, 20]);
  assert.deepEqual(out.map((r) => r.milestone), [false, false, false, false, true, false, true, true]);
  assert.ok(out.every((r) => r.side === "home"));
});

test("the other team scoring breaks the run; the new run counts from its own first bucket", () => {
  const t = createRunTracker();
  feedScores(t, [[2, 0], [4, 0], [6, 0], [8, 0], [10, 0]]);
  const answer = t.observe(scoreEv(10, 3));
  assert.deepEqual({ side: answer.side, points: answer.points, milestone: answer.milestone }, { side: "away", points: 3, milestone: false });
  assert.equal(t.observe(scoreEv(12, 3)).points, 2, "home starts a fresh run, not 12");
});

test("free throws and 3s count: the run is built from score deltas, not event text", () => {
  const t = createRunTracker();
  const out = feedScores(t, [[3, 0], [6, 0], [7, 0], [8, 0], [11, 0]]);
  assert.equal(out.at(-1).points, 11);
  assert.equal(out.at(-1).milestone, true);
});

test("non-score events are ignored and never change the run", () => {
  const t = createRunTracker();
  t.observe(scoreEv(2, 0));
  assert.equal(t.observe({ type: "coach", text: "sub" }), null);
  assert.equal(t.observe({ type: "miss", text: "Paul misses", score: { home: 2, away: 0 } }), null);
  assert.equal(t.observe(scoreEv(4, 0)).points, 4);
});

test("a score going down means a new game: the tracker restarts from 0-0", () => {
  const t = createRunTracker();
  feedScores(t, [[50, 40], [52, 40]]);
  const next = t.observe(scoreEv(2, 0));
  assert.equal(next.points, 2);
  assert.equal(next.milestone, false);
});

test("attaching mid-game never invents a run (impossible jump just resyncs)", () => {
  const t = createRunTracker();
  assert.equal(t.observe(scoreEv(61, 58)), null, "60+ points in one event can't be a real bucket");
  assert.equal(t.observe(scoreEv(63, 58)).points, 2, "counting resumes from the resync point");
  assert.equal(t.observe(scoreEv(70, 58)), null, "a +7 jump is another resync, not a run");
});

test("both teams' scores changing in one step is impossible and resyncs", () => {
  const t = createRunTracker();
  t.observe(scoreEv(2, 0));
  assert.equal(t.observe(scoreEv(4, 2)), null);
});

// ---- run card ----
test("run milestone becomes a legend card with the run length in the title", () => {
  assert.deepEqual(feedEventTier(scoreEv(12, 0), { run: { side: "home", points: 12, milestone: true } }), { tier: "legend", kind: "run" });
  assert.equal(feedEventTier(scoreEv(12, 0), { run: { side: "home", points: 12, milestone: false } }).tier, "normal");
  assert.equal(feedEventTier(scoreEv(12, 0), { run: { side: "away", points: 12, milestone: true } }).tier, "normal", "a run belongs to the scoring side only");
  assert.equal(legendHeadline("run", "zh", { points: 12 }), "12-0 攻击波！");
  assert.equal(legendHeadline("run", "en", { points: 12 }), "12-0 run!");
});

test("a clutch go-ahead outranks a run milestone on the same bucket", () => {
  const ev = scoreEv(70, 69, { quarter: 4, clock: 10 });
  assert.equal(feedEventTier(ev, { run: { side: "home", points: 10, milestone: true } }).kind, "goahead");
});

test("run card text in both languages, with the avatar slot only when there is an avatar", () => {
  const run = { side: "home", points: 12, milestone: true };
  const ev = scoreEv(30, 20);
  const en = feedRowHtml(ev, { colors: COLORS, actorName: "Curry", avatarHtml: AVATAR, escFn: esc, lang: "en", run });
  assert.match(en.html, /12-0 run!/);
  assert.match(en.html, /HOME has scored 12 straight/);
  assert.match(en.html, /feed-legend-avatar/);
  assert.doesNotMatch(en.html, CJK);
  const zh = feedRowHtml(ev, { colors: COLORS, escFn: esc, lang: "zh", run });
  assert.match(zh.html, /12-0 攻击波！/);
  assert.match(zh.html, /主队连拿 12 分，对手还没还手！/);
  assert.doesNotMatch(zh.html, /feed-legend-avatar/);
});

test("go-ahead card names the shooter and the kind of shot", () => {
  const three = scoreEv(70, 69, { quarter: 4, clock: 2, meta: { shot: { made: true, pts: 3 } } });
  const en = feedRowHtml(three, { colors: COLORS, actorName: "Curry", avatarHtml: AVATAR, escFn: esc, lang: "en" });
  assert.match(en.html, /Curry hits the key three to take the lead!/);
  assert.match(feedRowHtml(three, { colors: COLORS, actorName: "库里", escFn: esc, lang: "zh" }).html, /库里 命中关键三分，反超比分！/);
});

test("legend card escapes player names: a hostile name can't inject markup", () => {
  const r = feedRowHtml(block(), { colors: COLORS, actorName: "<img src=x onerror=1>", escFn: esc, lang: "en" });
  assert.doesNotMatch(r.html, /<img src=x/);
  assert.match(r.html, /&lt;img src=x onerror=1&gt; rejects Paul!/);
});

// ---- normal row sub-label ----
test("plain made shots get the muted second line; free throws and unknown points don't", () => {
  assert.equal(scoreSubLabel(scoreEv(2, 0), "zh"), "普通得分 · +2");
  assert.equal(scoreSubLabel(scoreEv(3, 0, { meta: { shot: { made: true, pts: 3 } } }), "zh"), "三分命中 · +3");
  assert.equal(scoreSubLabel(scoreEv(3, 0, { meta: { shot: { made: true, pts: 3 } } }), "en"), "Three-pointer · +3");
  assert.equal(scoreSubLabel(scoreEv(2, 0), "en"), "Field goal · +2");
  assert.equal(scoreSubLabel({ type: "score", meta: { actorId: "p" } }, "zh"), "");
  assert.equal(scoreSubLabel(scoreEv(2, 0, { meta: { shot: { made: false, pts: 2 } } }), "zh"), "");
  const r = feedRowHtml(scoreEv(2, 0), { colors: COLORS, escFn: esc, lang: "zh" });
  assert.match(r.html, /class="feed-sub">普通得分 · \+2</);
});

test("legend cards don't also carry the plain-row sub line", () => {
  const r = feedRowHtml(scoreEv(70, 69, { quarter: 4, clock: 2 }), { colors: COLORS, escFn: esc, lang: "en" });
  assert.doesNotMatch(r.html, /class="feed-sub"/);
});
