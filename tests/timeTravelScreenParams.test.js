import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression: `params.onStoryEventResolved` was called but the factory had no `params`, so resolving any Reborn
// story event threw a ReferenceError (swallowed into a confusing status line) before the screen repainted.
const src = readFileSync(new URL("../js/ui/timeTravel/screen.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("every option the app injects into the time-travel screen is declared by the factory", () => {
  const block = app.match(/createTimeTravelScreen\(\{([\s\S]*?)\n\}\);/)[1];
  const injected = [...block.matchAll(/^  (\w+)[,:]/gm)].map((m) => m[1]);
  const header = src.match(/export function createTimeTravelScreen\(\{([\s\S]*?)\}\) \{/)[1];
  for (const name of injected) assert.match(header, new RegExp(`\\b${name}\\b`), `${name} is injected by app.js but not declared`);
  assert.ok(injected.includes("onStoryEventResolved"));
});

test("the screen never reads an undeclared `params` object", () => {
  assert.doesNotMatch(src, /\bparams\./);
});

// Regression (perf-r3, 61fd0b4): createTimeTravelPrologue() reads PLAYERS synchronously off js/data/players.js
// to build every roster in the career. 61fd0b4 made PLAYERS start empty and backfill on an idle timer, so a
// player who reaches this interview click before the backfill finishes got a career with zero players on
// every team (reproduced with a real browser: "首发 0/5", bench "替补席空了"). The click handler must wait for
// the pool before calling createTimeTravelPrologue.
test("the interview click awaits playersReady() before building the roster", () => {
  assert.match(src, /import \{ PLAYERS, overall, playersReady \} from "\.\.\/\.\.\/data\/players\.js"/);
  const handler = src.match(/\$\("#btn-time-travel-interview"\)\.addEventListener\("click", async \(\) => \{([\s\S]*?)\n {4}\}\);/)[1];
  const readyLine = handler.search(/await playersReady\(\)/);
  const prologueLine = handler.search(/createTimeTravelPrologue\(/);
  assert.ok(readyLine >= 0, "missing await playersReady()");
  assert.ok(prologueLine >= 0 && readyLine < prologueLine, "playersReady() must be awaited before createTimeTravelPrologue()");
});
