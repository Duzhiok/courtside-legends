import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APP_SRC = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

/**
 * liveStatusLine lives in app.js (not a module), so evaluate the real
 * function source with stubbed globals — the same slice trick as
 * tests/duelEscBack.test.js. The function ends at the first column-0 `}`.
 */
function loadLiveStatusLine() {
  const start = APP_SRC.indexOf("function liveStatusLine(");
  assert.notEqual(start, -1, "liveStatusLine not found in app.js");
  const fnSrc = APP_SRC.slice(start);
  const end = fnSrc.indexOf("\n}\n");
  assert.notEqual(end, -1, "liveStatusLine closing brace not found");
  const body = fnSrc.slice(0, end + 3);
  return new Function(
    "photoImg",
    "escAttr",
    "overall",
    "hotClass",
    "moodClass",
    `${body}\nreturn liveStatusLine;`,
  )(
    () => "",
    (s) => s,
    () => 80,
    () => "",
    () => "",
  );
}

const liveStatusLine = loadLiveStatusLine();

const basePlayer = (over = {}) => ({
  id: "p1",
  name: "Terry Porter",
  pos: "PG",
  playPos: "PG",
  fgPct: 48,
  injuredGames: 0,
  injuryStatus: "",
  grade: "B+",
  gradeTone: "grade-b",
  gradeLast: "",
  overall: 82,
  stats: { pts: 12, reb: 3, ast: 6, stl: 1, blk: 0 },
  fatigue: 20,
  fatigueNote: "",
  ironLungs: false,
  confidenceLabel: "",
  hot: 0,
  hotLabel: "平稳",
  mood: 0,
  moodLabel: "平静",
  ...over,
});

test("B86: injured bench row carries draggable=\"false\"", () => {
  const html = liveStatusLine(
    basePlayer({ injuredGames: 3, injuryStatus: "伤停 3 场" }),
    false,
    { draggable: false, side: "bench", showOvr: true },
  );
  assert.match(html, /draggable="false"/);
  assert.match(html, /伤停 3 场/);
});

test("B86: healthy bench row carries draggable=\"true\"", () => {
  const html = liveStatusLine(basePlayer(), false, {
    draggable: true,
    side: "bench",
    showOvr: true,
  });
  assert.match(html, /draggable="true"/);
  assert.doesNotMatch(html, /draggable="false"/);
});

test("B86: your-court row carries draggable=\"true\"", () => {
  const html = liveStatusLine(basePlayer(), false, {
    extra: "",
    draggable: true,
    side: "you",
  });
  assert.match(html, /draggable="true"/);
});

test("B86: opponent row carries no draggable attribute", () => {
  const html = liveStatusLine(basePlayer(), false, { side: "opp" });
  assert.doesNotMatch(html, /draggable=/);
});

test("B86: bindLiveLineups guards still read the draggable attribute", () => {
  // Tap: the bench branch must bail on draggable="false" (injured bench).
  assert.match(
    APP_SRC,
    /if \(li\.getAttribute\("draggable"\) === "false"\) return; \/\/ injured bench: never selectable/,
  );
  // Drag-over: an injured bench row must not be a legal drop target.
  assert.match(
    APP_SRC,
    /li\.getAttribute\("draggable"\) !== "false"/,
  );
  // Drag-start: only draggable="true" rows can start a drag.
  assert.match(
    APP_SRC,
    /li\.getAttribute\("draggable"\) !== "true"\) return;/,
  );
});
