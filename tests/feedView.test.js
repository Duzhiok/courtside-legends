import test from "node:test";
import assert from "node:assert/strict";

const {
  FEED_BG,
  chipTextOn,
  clockLabel,
  colorsDistant,
  contrastRatio,
  feedActorId,
  feedEventSide,
  feedRowHtml,
  isNamedTeam,
  feedTextWithAvatar,
  readableTextColor,
  resolveMatchColors,
  stripTrailingScore,
  teamChipHtml,
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

test("a same-code match (mirror franchise, or two ad-hoc squads both falling to NBA) gets H/A codes", () => {
  // Multi-team-trade rows in the roster data carry the literal team code "NBA" (not a team,
  // a "traded mid-season" marker — see roster.json). Two ad-hoc squads built mostly from such
  // cards both land on teamCodeOf()'s plurality pick of "NBA", far more often than two REAL
  // franchises ever collide — and "NBA" vs "NBA" printed as literal chip text reads like a
  // typo, not like two teams, even though their colours still differ.
  const squad = () => ({ players: [p("NBA", 90), p("NBA", 88), p("NBA", 85), p("LAL", 80), p("BOS", 79)] });
  assert.equal(teamCodeOf(squad()), "NBA", "sanity: this squad shape really does fall back to the generic code");
  const { home, away } = resolveMatchColors(squad(), squad());
  assert.notEqual(home.code, away.code, "the printed codes must differ once resolved");
  assert.deepEqual([home.code, away.code].sort(), ["A", "H"]);
  assert.ok(colorsDistant(home.color, away.color), "colours must still separate the pair too");
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

// --- R134: feed redesign — one team chip per row, avatar spliced after the actor's name ---

test("chip text colour picks whichever of near-black/white actually reads on that chip", () => {
  assert.equal(chipTextOn("#FDB927"), "#0b1a13", "Lakers gold is bright — dark text wins");
  assert.equal(chipTextOn("#000000"), "#f4f7f2", "Spurs/Nets black — light text wins");
  assert.equal(chipTextOn("#552583"), "#f4f7f2", "Lakers purple is dark enough for light text");
});

test("team chip renders the code on its own colour, picks a readable text colour, and escapes it", () => {
  const html = teamChipHtml({ color: "#FDB927", code: "LAL" });
  assert.match(html, /class="feed-chip-team"/);
  assert.match(html, /background:#FDB927/);
  assert.match(html, />LAL<\/i>/);
  assert.equal(teamChipHtml(null), "", "no side -> no chip, not a broken tag");
  assert.equal(teamChipHtml({ color: "#000" }), "", "no code -> still no chip (nothing to print)");
  const escaped = teamChipHtml({ color: "#000", code: "<script>" });
  assert.ok(!escaped.includes("<script>"), "a hostile 'code' can never inject a tag");
});

test("feed actor id: explicit actorId beats shot/dunk/skill meta, in that priority order", () => {
  assert.equal(feedActorId({ meta: { actorId: "a", shot: { shooterId: "b" } } }), "a");
  assert.equal(feedActorId({ meta: { shot: { shooterId: "b" } } }), "b", "jump-shot shooter");
  assert.equal(feedActorId({ meta: { player: { id: "c" } } }), "c", "dunker");
  assert.equal(feedActorId({ meta: { skill: { playerId: "d" } } }), "d", "signature-skill trigger");
  assert.equal(feedActorId({ meta: {} }), null);
  assert.equal(feedActorId({}), null);
  assert.equal(feedActorId(null), null);
});

test("avatar splices in right after the actor's name, not at the start or end of the line", () => {
  const esc = (s) => s.replace(/</g, "&lt;");
  const out = feedTextWithAvatar("詹姆斯空接扣篮！", "詹姆斯", "<img>", esc);
  assert.equal(out, "詹姆斯<img>空接扣篮！");
});

test("avatar splice matches the RAW name before escaping (apostrophes survive)", () => {
  const esc = (s) => s.replace(/'/g, "&#39;");
  const out = feedTextWithAvatar("De'Aaron Fox buries the three", "De'Aaron Fox", "<img>", esc);
  // Escaping the whole line first would turn the apostrophe into &#39; and the literal
  // "De'Aaron Fox" search would never match -- the bug this test exists to catch.
  assert.equal(out, "De&#39;Aaron Fox<img> buries the three");
});

test("avatar splice falls back to a plain escape with no actor, no avatar, or no name match", () => {
  const esc = (s) => s.toUpperCase();
  assert.equal(feedTextWithAvatar("plain", null, "<img>", esc), "PLAIN");
  assert.equal(feedTextWithAvatar("plain", "X", null, esc), "PLAIN");
  assert.equal(feedTextWithAvatar("科比绝杀", "詹姆斯", "<img>", esc), "科比绝杀".toUpperCase());
});

test("feed row: a scored jumper gets a team chip, the avatar after the shooter's name, and a score chip", () => {
  const colors = {
    home: { color: "#FDB927", code: "LAL", text: "#fff" },
    away: { color: "#007A33", code: "BOS", text: "#9effc0" },
  };
  const ev = {
    type: "score",
    text: "詹姆斯三分命中！（45%） 78-75",
    possession: "home",
    score: { home: 78, away: 75 },
    quarter: 3,
    clock: 324,
  };
  const row = feedRowHtml(ev, { colors, actorName: "詹姆斯", avatarHtml: "<img class=avatar>", escFn: (s) => s });
  assert.equal(row.className, "event tm scored");
  assert.equal(row.borderColor, "#FDB927", "borderColor carries the attacking team's colour");
  assert.match(row.html, /feed-chip-team[^>]*>LAL</, "the chip names the attacking team, not a bare dot");
  assert.match(row.html, /Q3 5:24/, "clock meta still shows");
  assert.match(row.html, /詹姆斯<img class=avatar>/, "avatar sits right after the name");
  assert.ok(!row.html.includes("78-75"), "the trailing score is stripped once it moves into the chip");
  assert.match(row.html, /feed-score.*78.*–.*75/s, "the score chip itself still shows both numbers");
});

test("feed row: no resolvable side (coach message) falls back to the plain neutral style", () => {
  const row = feedRowHtml({ type: "coach", text: "活球中不能换人" }, { colors: null, escFn: (s) => s });
  assert.equal(row.className, "event coach");
  assert.equal(row.borderColor, null);
  assert.equal(row.html, "活球中不能换人");
});

test("feed row: a rebound with no actor resolved still renders cleanly (no broken avatar tag)", () => {
  const colors = { home: { color: "#FDB927", code: "LAL" }, away: { color: "#007A33", code: "BOS" } };
  const row = feedRowHtml(
    { type: "reb", text: "某球员抢到防守篮板", possession: "away" },
    { colors, actorName: undefined, avatarHtml: null, escFn: (s) => s }
  );
  assert.equal(row.className, "event tm");
  assert.match(row.html, />BOS</);
  assert.ok(!row.html.includes("<img"), "no actor resolved -> no avatar markup, not a dangling tag");
});

// --- B7: fixed-event fixtures (no simulation, no randomness) ---
const FIX_COLORS = {
  home: { color: "#FDB927", code: "H", text: "#fff" },
  away: { color: "#007A33", code: "A", text: "#9effc0" },
};
const FIX_ROSTER = { p1: "Chris Paul", p2: "De'Aaron Fox", p3: "Rudy Gobert" };
const fixtureRow = (ev) => {
  const id = feedActorId(ev);
  const name = FIX_ROSTER[id];
  return feedRowHtml(ev, { colors: FIX_COLORS, actorName: name, avatarHtml: name ? "<img class=a>" : null, escFn: (s) => s });
};

for (const [label, ev, expectName] of [
  ["steal -> defender", { type: "miss", text: "Chris Paul steals it from X!", possession: "home", meta: { actorId: "p1" } }, "Chris Paul"],
  ["free throw -> shooter", { type: "score", text: "De'Aaron Fox hits the free throw 10-9", possession: "away", score: { home: 9, away: 10 }, meta: { actorId: "p2" } }, "De'Aaron Fox"],
  ["rebound -> rebounder", { type: "reb", text: "Rudy Gobert secures the defensive rebound", possession: "home", meta: { actorId: "p3" } }, "Rudy Gobert"],
  ["jumper -> shooter", { type: "score", text: "Chris Paul pulls up 5-2", possession: "home", score: { home: 5, away: 2 }, meta: { shot: { shooterId: "p1" } } }, "Chris Paul"],
]) {
  test(`fixture: ${label} shows the avatar right after the name`, () => {
    assert.ok(fixtureRow(ev).html.includes(`${expectName}<img class=a>`));
  });
}

test("fixture: team identity comes from the event's side, even when both squads share a label", () => {
  const home = fixtureRow({ type: "reb", text: "Rudy Gobert grabs it", possession: "home", meta: { actorId: "p3" } });
  const away = fixtureRow({ type: "reb", text: "Rudy Gobert grabs it", possession: "away", meta: { actorId: "p3" } });
  assert.match(home.html, /feed-chip-team[^>]*>H</);
  assert.match(away.html, /feed-chip-team[^>]*>A</);
  assert.equal(home.borderColor, "#FDB927");
  assert.equal(away.borderColor, "#007A33");
});

test("an ad-hoc squad prints its side (H/A), never a guessed team code; a real team keeps its code", () => {
  const squad = { players: [p("CHI", 90), p("CHI", 88), p("CHI", 85), p("MIA", 80), p("BOS", 79)] };
  assert.equal(isNamedTeam(squad), false);
  assert.equal(isNamedTeam({ franchiseId: "LAL" }), true);
  const mixed = resolveMatchColors({ franchiseId: "LAL" }, squad);
  assert.equal(mixed.home.code, "LAL", "real team keeps its code");
  assert.equal(mixed.away.code, "A", "squad prints its side");
  const two = resolveMatchColors(squad, { players: squad.players });
  assert.deepEqual([two.home.code, two.away.code], ["H", "A"]);
});
