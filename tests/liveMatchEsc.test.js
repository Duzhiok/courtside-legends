import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esc } from "../js/core/html.js";
import { takeoverDialogHtml } from "../js/ui/reborn/takeover.js";

// Regression (B118, 2026-11-24): esc audit batch 2 — the live-match group.
// The 2026-11-19 audit listed 51 medium-risk unescaped name interpolations;
// batch 1 (Wibey 519df336, saveNames.js) blocked the crafted-save vector at
// the load boundary (loadSeason / validMyTeamSeason / saveRoot), and
// liveStatusLine / matchupOptionList / renderMatchupBoard / court.js tokens
// were already escaped. Eight interpolations in the live-match screens were
// still raw: the two setup-gameplan matchup selects, the live matchup board
// defender select, the in-game focus select + order rows, the live positions
// list, the defend-target select, and the takeover dialog's player name.
// Each now goes through esc() (defense in depth on top of the load gate).
const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

function body(fnName) {
  const start = src.search(new RegExp(`(?:async )?function ${fnName}\\(`, "m"));
  assert.ok(start >= 0, `function ${fnName} not found`);
  const paramsClose = src.indexOf(") {", start);
  assert.ok(paramsClose >= 0, `function ${fnName} has no ") {"`);
  const openIdx = paramsClose + 1;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${fnName}`);
}

function load(fnName, extraParams = {}) {
  const start = src.search(new RegExp(`(?:async )?function ${fnName}\\(`, "m"));
  const paramsClose = src.indexOf(") {", start);
  const header = src.slice(start, paramsClose + 1);
  const names = ["esc", ...Object.keys(extraParams)];
  const rebuilt = new Function(...names, `return (${header}${body(fnName)});`);
  return rebuilt(esc, ...Object.values(extraParams));
}

const BAD = '<img src=x onerror=alert(1)>';

test("renderSetupGameplan: both matchup selects escape player names", () => {
  const fnSrc = body("renderSetupGameplan");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} interpolation may remain");
  assert.equal(
    (fnSrc.match(/esc\(p\.name\)/g) || []).length,
    2,
    "defender select and target select must both esc the player name",
  );
});

test("paintLiveMatchupBoard: defender select escapes player names", () => {
  const fnSrc = body("paintLiveMatchupBoard");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} interpolation may remain");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "defender select must esc the player name");
});

test("paintPlayerOrders: focus select and order rows escape player names", () => {
  const fnSrc = body("paintPlayerOrders");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} interpolation may remain");
  assert.equal(
    (fnSrc.match(/esc\(p\.name\)/g) || []).length,
    2,
    "focus select and order-row name must both esc the player name",
  );
});

test("paintLivePositions: live position rows escape player names", () => {
  const fnSrc = body("paintLivePositions");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} interpolation may remain");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "position rows must esc the player name");
});

test("paintDefendTargets: defend-target options escape player names", () => {
  const fnSrc = body("paintDefendTargets");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} interpolation may remain");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "defend-target options must esc the player name");
  // Behavior: extract the function with a stubbed $ and render a crafted name.
  const fakeSelect = { value: "", options: [], _html: "" };
  Object.defineProperty(fakeSelect, "innerHTML", {
    set(v) {
      this._html = v;
    },
    get() {
      return this._html;
    },
  });
  const paintDefendTargets = load("paintDefendTargets", {
    $: () => fakeSelect,
  });
  const badPlayer = {
    id: "p1",
    playPos: "PG",
    pos: "PG",
    name: BAD,
    stats: { pts: 12 },
    hotLabel: "热",
    moodLabel: "好",
    strength: 80,
  };
  paintDefendTargets({
    youSide: "home",
    home: { onCourt: [] },
    away: { onCourt: [badPlayer] },
    defensePlan: {},
  });
  assert.ok(!fakeSelect._html.includes(BAD), "raw player name must not appear in the options");
  assert.ok(fakeSelect._html.includes("&lt;img"), "player name must be escaped in the options");
  assert.ok(fakeSelect._html.includes("PG"), "position label still renders");
});

test("takeoverDialogHtml: the takeover player's name is escaped", () => {
  const sim = {
    you: () => ({ onCourt: [{ id: "p1", name: BAD }], roster: [] }),
    youSide: "home",
    score: { home: 98, away: 100 },
    clock: 100,
    quarter: 4,
  };
  const html = takeoverDialogHtml({ sim, playerId: "p1", lang: "zh" });
  assert.ok(!html.includes(BAD), "raw player name must not appear in the dialog");
  assert.ok(html.includes("&lt;img"), "player name must be escaped in the dialog");
  assert.ok(html.includes("Q4"), "situation line still renders");
  const clean = takeoverDialogHtml({
    sim: { ...sim, you: () => ({ onCourt: [{ id: "p1", name: "Michael Jordan" }], roster: [] }) },
    playerId: "p1",
    lang: "en",
  });
  assert.ok(clean.includes("Michael Jordan"), "a normal name still renders");
});
