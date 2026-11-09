import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonGames } from "../js/engine/season.js";

// B59 + B60: the last two items from the 2026-11-07 My Team Season closing notes.
// B59: after a season ends (phase === "done") the "下一场" card's three buttons and the
// playoffs tab's two bulk sims were only disabled — greyed-out dead buttons. They are
// hidden / not rendered instead; the done text already points at 「再来一季」/ offseason.
// B60: the season page's remaining hardcoded "82" follows the season length, so a
// 20-game quick My Team season no longer shows "第 X/82 场".
// renderSeasonHub / renderSeasonPlayoffs are DOM functions in app.js (no jsdom in this
// project), so these pin the source the way tests/playoffPageContrast.test.js does.

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

test("B59: renderSeasonPlayoffs only builds the bulk sims while the season is live", () => {
  const po = fnBody(app, "renderSeasonPlayoffs");
  // The two sim buttons exist only when the phase is not done (no more disabled stubs).
  assert.match(po, /const poSimButtons =\s*\n\s*st\.phase === "done"\s*\n\s*\? ""/);
  assert.ok(po.includes('id="btn-season-advance-po"'), "advance-po button is built");
  assert.ok(po.includes('id="btn-season-sim-all-po"'), "sim-all-po button is built");
  assert.doesNotMatch(po, /id="btn-season-advance-po"[^>]*disabled/);
  assert.doesNotMatch(po, /id="btn-season-sim-all-po"[^>]*disabled/);
  // The offseason button still renders for a done non-My Team season, and the row is
  // omitted entirely when it would be empty (done My Team season).
  assert.match(po, /const poOffseasonButton =\s*\n\s*st\.phase === "done" && !st\.myTeam/);
  assert.match(po, /poSimButtons \|\| poOffseasonButton \? `<div class="btn-row">/);
});

test("B59: the done-phase hub still disables the buttons as before (hidden is additive)", () => {
  const hub = fnBody(app, "renderSeasonHub");
  // The existing disabled assignments stay — hidden only changes presentation.
  assert.ok(hub.includes('$("#btn-season-play").disabled = true;'));
  assert.ok(hub.includes('$("#btn-season-sim-one").disabled = true;'));
});

test("B60: the hub next-match line shows the real season length, not a hardcoded 82", () => {
  const hub = fnBody(app, "renderSeasonHub");
  const line = hub.split("\n").find((l) => l.includes("nm-meta"));
  assert.ok(line, "nm-meta line not found in renderSeasonHub");
  assert.ok(line.includes("第 ${played + 1}/${seasonGames(st)} 场"), `zh line still hardcodes 82: ${line}`);
  assert.ok(line.includes("Game ${played + 1}/${seasonGames(st)}"), `en line still hardcodes 82: ${line}`);
  assert.doesNotMatch(line, /\/82/);
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
