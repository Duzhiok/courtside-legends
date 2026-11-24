import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esc } from "../js/core/html.js";

// Regression (B111, 2026-11-24): 728a7cbd escaped the two headline bracket
// team names in scoutMatchHtml (m.a?.name / m.b?.name) but left three more
// save-carried name interpolations unescaped in the same board:
//  - m.winner.name in the outcome line (four kind branches),
//  - p.name in formatStarterLine (the starter lines of the same card),
//  - pod.advancers names in renderScoutBoard ("晋级：A、B").
// All three ride innerHTML, and the names come from team objects persisted
// in the career save (pods / bracketLog), so an imported save carrying a
// crafted name is the same vector as the esc audit's 51 medium-risk save
// vectors. The fix wraps each in esc().
const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

function body(fnName) {
  const start = src.search(new RegExp(`(?:async )?function ${fnName}\\(`, "m"));
  assert.ok(start >= 0, `function ${fnName} not found`);
  // The body's opening brace is the one after the parameter list's closing
  // paren -- not the first "{" after the signature, which may sit inside a
  // destructured default parameter (renderScoutBoard's { highlightYours }).
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
  const header = src.slice(start, paramsClose + 1); // "function scoutMatchHtml(m, isYours)"
  const names = ["esc", ...Object.keys(extraParams)];
  const rebuilt = new Function(...names, `return (${header}${body(fnName)});`);
  return rebuilt(esc, ...Object.values(extraParams));
}

const BAD = '<img src=x onerror=alert(1)>';

test("scoutMatchHtml: winner name in the outcome line is escaped", () => {
  const fnSrc = body("scoutMatchHtml");
  assert.ok(!/\$\{m\.winner\.name\}/.test(fnSrc), "no raw ${m.winner.name} interpolation may remain");
  assert.equal((fnSrc.match(/esc\(m\.winner\.name\)/g) || []).length, 4, "all four outcome branches must esc the winner name");
  const scoutMatchHtml = load("scoutMatchHtml", {
    kindLabel: (k) => k,
    formatStarterLine: load("formatStarterLine"),
  });
  for (const kind of ["winners", "revival", "decider", "other"]) {
    const html = scoutMatchHtml(
      { kind, done: true, winner: { name: BAD }, score: { home: 100, away: 99 }, a: { name: "A" }, b: { name: "B" }, startersA: [], startersB: [] },
      false,
    );
    assert.ok(!html.includes(BAD), `raw winner name must not appear in the ${kind} outcome`);
    assert.ok(html.includes("&lt;img"), `winner name must be escaped in the ${kind} outcome`);
  }
});

test("formatStarterLine: player names are escaped", () => {
  const fnSrc = body("formatStarterLine");
  assert.ok(!/\$\{p\.name\}/.test(fnSrc), "no raw ${p.name} interpolation may remain");
  assert.ok(/esc\(p\.name\)/.test(fnSrc), "player names must go through esc()");
  const formatStarterLine = load("formatStarterLine");
  const line = formatStarterLine([{ pos: "PG", name: BAD, season: 1996 }]);
  assert.ok(!line.includes(BAD), "raw player name must not appear in the starter line");
  assert.ok(line.includes("&lt;img"), "player name must be escaped in the starter line");
  assert.equal(formatStarterLine([{ pos: "C", name: "Shaquille O'Neal" }]), "C Shaquille O&#39;Neal");
});

test("renderScoutBoard: advancer team names are escaped", () => {
  const fnSrc = body("renderScoutBoard");
  assert.ok(!/\.map\(\(t\) => t\.name\)/.test(fnSrc), "no raw t.name map may remain for advancers");
  assert.ok(/\.map\(\(t\) => esc\(t\.name\)\)/.test(fnSrc), "advancer names must go through esc()");
});

test("scoutMatchHtml: headline team names stay escaped", () => {
  const fnSrc = body("scoutMatchHtml");
  assert.ok(/esc\(m\.a\?\.name/.test(fnSrc), "team A headline must stay escaped (728a7cbd)");
  assert.ok(/esc\(m\.b\?\.name/.test(fnSrc), "team B headline must stay escaped (728a7cbd)");
});
