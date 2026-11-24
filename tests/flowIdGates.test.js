import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression (B107, 2026-11-24): 519df336 stamped every save with the flowId of
// the play flow that wrote it, and the final buzzer only clears the
// unfinished-game slot when it holds the current flow's own save -- but only
// the six entries the commit touched call beginFlow(). The family duel
// (father-son / brothers, #btn-custom-father-son / #btn-custom-brothers) is a
// seventh fresh entry: startFamilyDuel() goes straight to openSetup() and
// beginGame() with state.career = null, so its final buzzer ran the guarded
// clearSave() against a STALE state.flowId. In the same session, an unfinished
// Play Now run saved mid-game (flowId f1, state.flowId still f1) followed by a
// family duel played to the buzzer would have its save deleted -- the exact
// bug 519df336 fixed, through an entry it missed. The fix is one line
// (beginFlow() at the top of startFamilyDuel); this test pins that every fresh
// entry which can reach beginGame() as a non-career game stamps its own flow.
const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

function body(fnName) {
  const start = src.search(new RegExp(`(?:async )?function ${fnName}\\(`, "m"));
  assert.ok(start >= 0, `function ${fnName} not found`);
  // Walk brace depth from the first `{` after the signature to find the matching close.
  const openIdx = src.indexOf("{", start);
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

// Every fresh entry that can reach beginGame() as a non-career game must mint
// its own flowId first, so the final buzzer never clears another run's save.
const FRESH_ENTRIES = [
  "startPlayNow",
  "startMode",
  "startHometownChallenge",
  "startRankedMatch",
  "initDraft",
  "startLegendMode",
  "startFamilyDuel", // B107: was missing until 2026-11-24
];

test("flowId gates: every fresh entry stamps its own flow before playing", () => {
  for (const fn of FRESH_ENTRIES) {
    assert.ok(/\bbeginFlow\(\)/.test(body(fn)), `${fn} must call beginFlow()`);
  }
  // The guard the stamp feeds: the final buzzer only clears the slot when it
  // holds this flow's own save (legacy unstamped saves compare null === null).
  assert.ok(src.includes("function sessionSaveIsCurrentFlow()"), "sessionSaveIsCurrentFlow must exist");
  assert.ok(src.includes("else if (sessionSaveIsCurrentFlow()) clearSave();"), "beginGame onEnd must guard clearSave");
});
