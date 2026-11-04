import test from "node:test";
import assert from "node:assert/strict";
import { feedEventTier, legendHeadline, CLUTCH_SECONDS, BUZZER_SECONDS } from "../js/ui/feedTier.js";
import { feedRowHtml } from "../js/ui/feedView.js";

// score is the score AFTER the shot, exactly like the engine's emit() snapshot
const made = (over) => ({
  type: "score", text: "X hits 70-68", possession: "home", quarter: 4, clock: 60,
  score: { home: 70, away: 68 }, meta: { shot: { shooterId: "p", made: true, pts: 2 } }, ...over,
});

test("go-ahead shot in the last 24s of Q4 is a legend; one tick earlier is only important", () => {
  assert.equal(feedEventTier(made({ clock: CLUTCH_SECONDS, score: { home: 70, away: 69 } })).tier, "legend");
  assert.equal(feedEventTier(made({ clock: CLUTCH_SECONDS + 1, score: { home: 70, away: 69 } })).tier, "important");
});

test("buzzer-beater kind only inside the last 3 seconds", () => {
  assert.equal(feedEventTier(made({ clock: BUZZER_SECONDS })).kind, "buzzer");
  assert.equal(feedEventTier(made({ clock: BUZZER_SECONDS + 1 })).kind, "goahead");
});

test("overtime counts as clutch time", () => {
  assert.equal(feedEventTier(made({ quarter: 5, clock: 10 })).tier, "legend");
});

test("a shot that only ties, or extends a lead, is not a go-ahead", () => {
  assert.notEqual(feedEventTier(made({ clock: 10, score: { home: 68, away: 68 } })).tier, "legend"); // tie
  assert.notEqual(feedEventTier(made({ clock: 10, score: { home: 80, away: 68 } })).tier, "legend"); // was already ahead
});

test("the same shot in Q2 or Q1 is a normal row", () => {
  assert.equal(feedEventTier(made({ quarter: 2, clock: 5 })).tier, "normal");
  assert.equal(feedEventTier(made({ quarter: 3, clock: 5 })).tier, "important"); // Q3 lead change = important, never legend
});

test("3-pointers only matter in a close fourth quarter", () => {
  const three = { shot: { made: true, pts: 3 } };
  assert.equal(feedEventTier(made({ meta: three, quarter: 4, clock: 200, score: { home: 80, away: 76 } })).tier, "important");
  assert.equal(feedEventTier(made({ meta: three, quarter: 4, clock: 200, score: { home: 90, away: 70 } })).tier, "normal");
  assert.equal(feedEventTier(made({ meta: three, quarter: 1, clock: 200, score: { home: 8, away: 6 } })).tier, "normal");
});

test("blocks are important in both languages; coach lines and free throws never are", () => {
  assert.equal(feedEventTier({ type: "miss", text: "Gobert blocks Paul!", possession: "home" }).kind, "block");
  assert.equal(feedEventTier({ type: "miss", text: "戈贝尔 盖帽 保罗！", possession: "home" }).kind, "block");
  assert.equal(feedEventTier({ type: "miss", text: "Paul misses the jumper", possession: "home" }).tier, "normal");
  assert.equal(feedEventTier({ type: "coach", text: "Gobert blocks the bad habit" }).tier, "normal");
  assert.equal(feedEventTier({ type: "score", text: "FT", possession: "home", quarter: 4, clock: 5, score: { home: 70, away: 69 }, meta: { actorId: "p" } }).tier, "normal");
  assert.equal(feedEventTier(null).tier, "normal");
});

const COLORS = { home: { color: "#FDB927", code: "LAL", text: "#111" }, away: { color: "#007A33", code: "BOS", text: "#fff" } };
const row = (ev, lang) => feedRowHtml(ev, { colors: COLORS, escFn: (s) => s, lang });

test("legend row: headline card in the requested language; normal row carries no tier markup", () => {
  const legend = row(made({ clock: 2 }), "en");
  assert.match(legend.className, /tier-legend/);
  assert.match(legend.html, /HIGHLIGHT · Buzzer-beater!/);
  assert.match(row(made({ clock: 2 }), "zh").html, /HIGHLIGHT · 压哨反超！/);
  assert.ok(legend.tint);
  const plain = row(made({ quarter: 1, clock: 400 }), "en");
  assert.doesNotMatch(plain.className, /tier-/);
  assert.equal(plain.tint, null);
  assert.doesNotMatch(plain.html, /HIGHLIGHT/);
});

test("important row gets a tint but no card", () => {
  const r = row({ type: "miss", text: "Gobert blocks Paul!", possession: "away", quarter: 2, clock: 300 }, "en");
  assert.match(r.className, /tier-important/);
  assert.doesNotMatch(r.html, /HIGHLIGHT/);
  assert.ok(r.tint);
  assert.equal(legendHeadline("block"), "", "only legend kinds have a headline");
});
