import test from "node:test";
import assert from "node:assert/strict";

const {
  FEED_BG,
  clockLabel,
  colorsDistant,
  contrastRatio,
  feedEventSide,
  readableTextColor,
  resolveMatchColors,
  stripTrailingScore,
  teamCodeOf,
} = await import("../js/ui/feedView.js");
const { teamColors } = await import("../js/data/teamColors.js");

const p = (team, ovr2k) => ({ team, ovr2k });

test("team code: franchise id wins, historical roster reads its own code", () => {
  assert.equal(teamCodeOf({ franchiseId: "LAL", players: [] }), "LAL");
  const celtics = { name: "08凯尔特人", players: [p("BOS", 90), p("BOS", 88), p("BOS", 85)] };
  assert.equal(teamCodeOf(celtics), "BOS");
});

test("team code: a mixed 联队 takes the plurality code of its five best players", () => {
  const mixed = {
    name: "联队",
    players: [p("CHI", 95), p("LAL", 93), p("CHI", 91), p("CHI", 89), p("LAL", 87), p("MIA", 99)],
  };
  // top5 by OVR: MIA 99, CHI 95, LAL 93, CHI 91, CHI 89 -> CHI 3 of 5
  assert.equal(teamCodeOf(mixed), "CHI");
});

test("match colours use the real team colours when they are distinguishable", () => {
  const { home, away } = resolveMatchColors({ franchiseId: "LAL" }, { franchiseId: "BOS" });
  assert.equal(home.color, teamColors("LAL").primary);
  assert.equal(away.color, teamColors("BOS").primary);
});

test("clashing primaries push the away side to its secondary colour", () => {
  // Bulls red vs Hawks red: same hue family, near-equal lightness.
  const { home, away } = resolveMatchColors({ franchiseId: "CHI" }, { franchiseId: "ATL" });
  assert.equal(home.color, teamColors("CHI").primary);
  assert.equal(away.color, teamColors("ATL").secondary, "away must not stay a second red");
  assert.ok(colorsDistant(home.color, away.color));
});

test("a mirror match (same franchise both sides) still separates the pair", () => {
  const { home, away } = resolveMatchColors({ franchiseId: "BOS" }, { franchiseId: "BOS" });
  assert.notEqual(home.color, away.color);
  assert.ok(colorsDistant(home.color, away.color));
});

test("feed text colours stay readable on the dark feed background", () => {
  for (const code of ["SAS", "BRK", "LAL", "BOS", "CHI"]) {
    const raw = teamColors(code).primary;
    const text = readableTextColor(raw);
    assert.ok(contrastRatio(text, FEED_BG) >= 4.2, `${code}: ${text} must read on ${FEED_BG}`);
  }
  // already-bright colours are left (nearly) alone
  assert.ok(contrastRatio(readableTextColor("#FDB927"), FEED_BG) >= 4.2);
});

test("event side comes from the event's possession snapshot", () => {
  assert.equal(feedEventSide({ possession: "home" }), "home");
  assert.equal(feedEventSide({ possession: "away" }), "away");
  assert.equal(feedEventSide({ possession: "nobody" }), null);
  assert.equal(feedEventSide(null), null);
  assert.equal(feedEventSide({}), null);
});

test("score chip replaces the score already trailing the text", () => {
  assert.equal(stripTrailingScore("球星 三分命中！（45%） 78-75"), "球星 三分命中！（45%）");
  assert.equal(stripTrailingScore("罚球命中 60-58"), "罚球命中");
  assert.equal(stripTrailingScore("普通播报没有比分"), "普通播报没有比分");
});

test("clock label formats quarters and overtime", () => {
  assert.equal(clockLabel({ quarter: 3, clock: 324 }), "Q3 5:24");
  assert.equal(clockLabel({ quarter: 5, clock: 63 }), "OT 1:03");
  assert.equal(clockLabel({}), "");
  assert.equal(clockLabel(null), "");
});
