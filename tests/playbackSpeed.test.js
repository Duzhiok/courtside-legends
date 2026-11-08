import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { humanSideCount, speedLocked } from "../js/ui/playbackSpeed.js";

test("speed is locked only when two humans share the match", () => {
  assert.equal(speedLocked("duel"), true);
  for (const mode of ["draft", "custom", "quick", "season", "career", "ranked", "tournament", "franchise", "timeTravel", undefined, null]) {
    assert.equal(speedLocked(mode), false, `${mode} is one human against the CPU`);
  }
  assert.equal(humanSideCount("duel"), 2);
  assert.equal(humanSideCount("draft"), 1);
});

test("B39③ tournament: a bracket match locks only when BOTH sides are human", () => {
  const twoHumans = { a: { human: true }, b: { human: true } };
  const oneHuman = { a: { human: true }, b: { human: false } };
  const noHumans = { a: { human: false }, b: { human: false } };
  assert.equal(humanSideCount("tournament", twoHumans), 2);
  assert.equal(speedLocked("tournament", twoHumans), true);
  assert.equal(speedLocked("tournament", oneHuman), false, "human vs CPU stays unlocked");
  assert.equal(speedLocked("tournament", noHumans), false, "CPU vs CPU stays unlocked");
  assert.equal(speedLocked("tournament"), false, "no match reported stays unlocked");
  assert.equal(speedLocked("tournament", null), false);
  assert.equal(speedLocked("duel", oneHuman), true, "duel locks regardless of the match arg");
});

test("app.js decides through the helper, with no hand-written mode list left", () => {
  const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  // the old lock was `state.mode === "draft" || ... "duel" || ... "custom"` written out in three places
  assert.ok(!/mode === "draft" \|\| state\.mode === "duel" \|\| state\.mode === "custom"/.test(src), "the three-mode lock must be gone");
  assert.equal((src.match(/speedLocked\(/g) || []).length, 3, "start, resume and the click handler all ask the helper");
  // B39③: every call site must pass the live bracket match, or a two-human tournament match would slip through unlocked.
  assert.equal(
    (src.match(/speedLocked\(state\.mode, currentTournamentMatch\(\)\)/g) || []).length,
    3,
    "all three call sites pass the current tournament match",
  );
  assert.ok(/function currentTournamentMatch\(\)/.test(src), "the bracket-match helper exists");
  assert.ok(/t\.phase !== "match"/.test(src), "no match outside the match phase");
});
