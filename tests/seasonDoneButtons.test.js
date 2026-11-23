import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonGames } from "../js/engine/season.js";
import { setLang } from "../js/i18n.js";
import { playoffsHtml } from "../js/ui/seasonPlayoffsView.js";
import { nextCardView } from "../js/ui/seasonHubView.js";

// B59 + B60: the last two items from the 2026-11-07 My Team Season closing notes.
// B59: after a season ends (phase === "done") the "下一场" card's three buttons and the
// playoffs tab's two bulk sims were only disabled — greyed-out dead buttons. They are
// hidden / not rendered instead; the done text already points at 「再来一季」/ offseason.
// B60: the season page's remaining hardcoded "82" follows the season length, so a
// 20-game quick My Team season no longer shows "第 X/82 场".
// renderSeasonHub is a DOM function in app.js (no jsdom in this project); the hiding loop is pinned in its source, but what the
// card says and which buttons it disables is the pure js/ui/seasonHubView.js, and the playoffs tab is js/ui/seasonPlayoffsView.js:
// both are tested by what they draw.

const helpers = { hubTeamHex: () => "#000", playoffSeriesLabel: () => "" };
const season = (over) => ({ phase: "regular", userTeamId: "A", teams: { A: { id: "A", name: "Aces" }, B: { id: "B", name: "Bolts" } }, schedule: [], ...over });
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function: ${name}`);
  return source.slice(start);
}

test("B59: renderSeasonHub hides the three next-game buttons once the season is done", () => {
  const hub = fnBody(app, "renderSeasonHub");
  // The hide is keyed on phase === "done" and covers exactly the three buttons.
  assert.match(
    hub,
    /const seasonDone = st\.phase === "done";\s*\n\s*for \(const id of \["#btn-season-play", "#btn-season-sim-one", "#btn-season-sim-week"\]\) \{\s*\n\s*const b = \$\(id\);\s*\n\s*if \(b\) b\.hidden = seasonDone;\s*\n\s*\}/
  );
});

test("B59: the playoffs tab only builds the bulk sims while the season is live", () => {
  // The tab's markup is a pure view since B61, so this asserts what it draws, not what the source says.
  const series = { high: { id: "A", name: "A" }, low: { id: "B", name: "B" }, winsHigh: 4, winsLow: 0, done: true, games: [] };
  const base = (over) => ({
    year: 2024, userTeamId: "A", teams: { A: { name: "A" }, B: { name: "B" } }, standings: {}, playerSeason: {},
    playoffs: { east: { round: 1, series: [series] }, west: { round: 1, series: [series] }, finals: null, championId: null },
    ...over,
  });
  const live = playoffsHtml(base({ phase: "playoffs" }));
  // The sim buttons exist while the phase is not done, and they are real buttons (no more disabled stubs).
  assert.ok(live.includes('id="btn-season-advance-po"'), "advance-po button is built");
  assert.ok(live.includes('id="btn-season-sim-all-po"'), "sim-all-po button is built");
  assert.doesNotMatch(live, /id="btn-season-advance-po"[^>]*disabled/);
  assert.doesNotMatch(live, /id="btn-season-sim-all-po"[^>]*disabled/);
  assert.doesNotMatch(live, /btn-season-offseason/, "no offseason button while the season is live");
  // Done: no bulk buttons at all; the offseason button still renders for a non-My Team season...
  const done = playoffsHtml(base({ phase: "done" }));
  assert.doesNotMatch(done, /btn-season-night-po|btn-season-advance-po|btn-season-sim-all-po/);
  assert.ok(done.includes('id="btn-season-offseason"'));
  // ...and the row is omitted entirely when it would be empty (a done My Team season).
  assert.doesNotMatch(playoffsHtml(base({ phase: "done", myTeam: true })), /btn-row/);
});

test("B59: the done-phase hub still disables the buttons as before (hidden is additive)", () => {
  // What the card says to disable is now decided by the pure seasonHubView; app.js only writes it onto the buttons and then hides them.
  const card = nextCardView(season({ phase: "done" }), { phase: "done", info: null, managed: false }, helpers);
  assert.equal(card.play, true, "play stays disabled");
  assert.equal(card.simOne, true, "sim-one stays disabled");
  assert.equal(card.simWeek, true, "sim-5 stays disabled");
  const hub = fnBody(app, "renderSeasonHub");
  assert.ok(hub.includes('$("#btn-season-play").disabled = card.play;'), "app.js writes the card's verdict onto the play button");
  assert.ok(hub.includes('$("#btn-season-sim-one").disabled = card.simOne;'));
});

test("B60: the hub next-match line shows the real season length, not a hardcoded 82", () => {
  const info = { game: { homeId: "A", awayId: "B" }, day: 0 };
  const zh = nextCardView(season({ rsGames: 20 }), { phase: "regular", info }, helpers).html;
  assert.match(zh, /第 1\/20 场/);
  setLang("en");
  const en = nextCardView(season({ rsGames: 20 }), { phase: "regular", info }, helpers).html;
  setLang("zh");
  assert.match(en, /Game 1\/20/);
  assert.doesNotMatch(zh + en, /\/82/);
  assert.match(nextCardView(season({}), { phase: "regular", info }, helpers).html, /第 1\/82 场/, "a standard season still reads 82");
});

test("B60: simRestOfSeason caps its loop at the season length, not a hardcoded 82", () => {
  const fn = fnBody(app, "simRestOfSeason");
  assert.match(fn, /const maxGames = seasonGames\(st\);/);
});

test("B60: standard-season setup copy still says 82 — only My Team seasons vary", () => {
  // The setup intro / year blurb describe the standard season mode, which is always
  // 82 games; parameterising them would be wrong. Pin them so a future sweep doesn't
  // "fix" the correct 82s while chasing the variable ones.
  assert.ok(app.includes("先打满 <strong>82 场常规赛</strong>"), "historical setup intro lost its 82");
  assert.ok(app.includes("打满 82 场后评奖，再进季后赛"), "modern setup intro lost its 82");
  assert.ok(app.includes("打满 82 场常规赛后再进季后赛"), "year blurb lost its 82");
});

test("B60: seasonGames is the length source of truth (20 for quick, 82 default)", () => {
  assert.equal(seasonGames({ rsGames: 20 }), 20);
  assert.equal(seasonGames({ rsGames: 82 }), 82);
  assert.equal(seasonGames({}), 82);
  assert.equal(seasonGames(null), 82);
});
