import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// B155 fix 1 (85ea3691): settling hosted-league games pays gold, and the
// top-bar chip must show the new balance. The 07:26 verification round
// found the gap: removing the refreshGoldChip() call from the openTraining
// settled branch left the focused suite green (M1, 51/51). openTraining
// lives in js/app.js, which no Node test can import, so this file pins the
// wiring by source check — the same pattern as bootGate.test.js and
// accountStoreCorrupt.test.js (D-P1-2). The browser side of the same
// contract (chip === account gold after a 7-day settle) is checked by
// scripts/qa/hosted-league.mjs, which this file also pins the presence of.

const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const qa = readFileSync(new URL("../scripts/qa/hosted-league.mjs", import.meta.url), "utf8");

/** Body of `function <name>(...) { ... }`, brace-matched (handles nesting). */
function functionBody(src, name) {
  const start = src.search(new RegExp(`function ${name}\\(.*?\\) \\{`));
  assert.notEqual(start, -1, `missing function ${name}`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const openTraining = functionBody(app, "openTraining");
const refreshGoldChip = functionBody(app, "refreshGoldChip");

test("B155: the hosted settle branch refreshes the top-bar gold chip (source check)", () => {
  // The settle callback must repaint the chip only when a settle actually
  // paid (settled === true); refreshing on every open would hide a missing
  // settle, and never refreshing leaves the stale number B155 fixed.
  assert.match(
    openTraining,
    /hostedPanel\?\.open\(\)\.then\(\(settled\) => \{ if \(settled\) \{[^}]*refreshGoldChip\(\)/,
    "openTraining must call refreshGoldChip() inside the `if (settled)` branch",
  );
  assert.match(
    openTraining,
    /if \(settled\) \{[^}]*trainingScreen\?\.open\(\); refreshGoldChip\(\); \}/,
    "the settled branch must repaint the training screen and then the chip",
  );
  assert.equal(
    (openTraining.match(/refreshGoldChip\(\)/g) || []).length,
    1,
    "exactly one refreshGoldChip() call in openTraining (inside the settled branch)",
  );
});

test("B155: refreshGoldChip writes the live account gold into #gold-chip-amt", () => {
  assert.match(refreshGoldChip, /#gold-chip-amt/, "must target the chip amount element");
  assert.match(refreshGoldChip, /activeAccount\(\)/, "must read the live account");
  assert.match(refreshGoldChip, /\.gold/, "must write the account gold, not a cached value");
  assert.match(
    refreshGoldChip,
    /amt\.textContent = String\(acc\?\.gold \|\| 0\)/,
    "must write String(account gold) into the chip",
  );
});

test("B155: openTraining is the only caller of hostedPanel.open()", () => {
  const callers = (app.match(/hostedPanel\?\.open\(\)|hostedPanel\.open\(\)/g) || []).length;
  assert.equal(callers, 1, "hostedPanel.open() must have exactly one call site");
  assert.ok(openTraining.includes("hostedPanel?.open()"), "that call site must be inside openTraining");
});

test("B155: the chip element exists in index.html and the browser check covers it", () => {
  assert.match(html, /id="btn-gold-chip"/, "the gold chip button must exist");
  assert.match(html, /id="gold-chip-amt"/, "the chip amount element must exist");
  assert.match(qa, /#gold-chip-amt/, "hosted-league.mjs must read the chip after settling");
  assert.match(
    qa,
    /the top-bar gold chip shows the settled balance/,
    "hosted-league.mjs must assert chip === account gold after a settle",
  );
});
