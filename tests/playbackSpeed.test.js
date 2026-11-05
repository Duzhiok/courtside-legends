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

test("app.js decides through the helper, with no hand-written mode list left", () => {
  const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  // the old lock was `state.mode === "draft" || ... "duel" || ... "custom"` written out in three places
  assert.ok(!/mode === "draft" \|\| state\.mode === "duel" \|\| state\.mode === "custom"/.test(src), "the three-mode lock must be gone");
  assert.equal((src.match(/speedLocked\(/g) || []).length, 3, "start, resume and the click handler all ask the helper");
});
