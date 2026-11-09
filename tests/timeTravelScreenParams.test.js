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
