import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression (perf-r3 follow-up, 2026-11-24): a brand-new player's very first tap -- Play Now -- builds
// both exhibition rosters by reading PLAYERS synchronously (exhibitionTeams() -> createDrawPool() in
// js/engine/draft.js). perf-r3 (61fd0b4) made PLAYERS start empty and backfill on an idle timer, so a
// player who taps Play Now before the backfill finishes gets two teams with far fewer than 5 players.
// Reproduced with a real browser: the live feed spammed "场上人数不足，跳过回合" (not enough players on
// court, skip this possession) from Q1 11:50 onward and the game never finished inside a 30-minute
// playback budget. The same gap existed for the "quick" exhibition setup route (startMode), Ranked
// (startRankedMatch -> autoFillTeam), and the Custom/Duel draft (initDraft -> dealPack).
//
// Fix: every one of these reads PLAYERS (directly or via a function that does) must be preceded by
// `await playersReady()`. This test pins the await, not the implementation detail of *which* function
// reads PLAYERS -- that's free to change, but the gate must stay.
const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

function body(fnName) {
  const start = src.search(new RegExp(`(?:async )?function ${fnName}\\(`));
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
  throw new Error(`unbalanced braces for ${fnName}`);
}

function assertAsync(fnName) {
  assert.match(src, new RegExp(`async function ${fnName}\\(`), `${fnName} must be declared async`);
}

test("startPlayNow is async and awaits playersReady() before exhibitionTeams()", () => {
  assertAsync("startPlayNow");
  const b = body("startPlayNow");
  const readyAt = b.search(/await playersReady\(\)/);
  const drawAt = b.search(/exhibitionTeams\(/);
  assert.ok(readyAt >= 0 && drawAt >= 0 && readyAt < drawAt, "playersReady() must be awaited before exhibitionTeams()");
});

test("startMode is async and awaits playersReady() before any mode branch runs", () => {
  assertAsync("startMode");
  const b = body("startMode");
  const readyAt = b.search(/await playersReady\(\)/);
  const firstBranch = b.search(/if \(mode === /);
  assert.ok(readyAt >= 0 && firstBranch >= 0 && readyAt < firstBranch, "playersReady() must be awaited before the first mode branch");
});

test("startRankedMatch is async and awaits playersReady() before autoFillTeam()", () => {
  assertAsync("startRankedMatch");
  const b = body("startRankedMatch");
  const readyAt = b.search(/await playersReady\(\)/);
  const drawAt = b.search(/autoFillTeam\(/);
  assert.ok(readyAt >= 0 && drawAt >= 0 && readyAt < drawAt, "playersReady() must be awaited before autoFillTeam()");
});

test("initDraft is async and awaits playersReady() before dealPack()", () => {
  assertAsync("initDraft");
  const b = body("initDraft");
  const readyAt = b.search(/await playersReady\(\)/);
  const dealAt = b.search(/\bdealPack\(\)/);
  assert.ok(readyAt >= 0 && dealAt >= 0 && readyAt < dealAt, "playersReady() must be awaited before dealPack()");
});

test("every initDraft() call site awaits it, so dealPack() can't run before PLAYERS is ready", () => {
  const calls = [...src.matchAll(/^(\s*)(await )?initDraft\(/gm)];
  assert.ok(calls.length >= 3, `expected at least 3 initDraft() call sites, found ${calls.length}`);
  for (const m of calls) assert.ok(m[2], `initDraft(...) call at offset ${m.index} is missing await`);
});
