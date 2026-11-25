import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Regression (B132, 2026-11-24): the season market's "刷新自由市场" button drew the new free-agent pool from PLAYERS,
// which is still [] for a while after a cold resume (roster is lazy, perf-r3). Pressing it then stored an EMPTY market.
// Found by scripts/qa/season-market.mjs against a real resumed career (PLAYERS.length was 0 at the click, 23448 1.5s later).
// The handler is wired inside renderSeasonMarket, so this pins the source: it must be async and await playersReady()
// BEFORE refreshFreeAgency. Every other full-pool entry point in app.js already follows that pattern.
const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("the refresh-free-agents button waits for the full roster before drawing the pool", () => {
  const at = src.indexOf('$("#btn-sm-refresh-fa")?.addEventListener(');
  assert.ok(at >= 0, "handler not found");
  const handler = src.slice(at, src.indexOf("\n  });", at));
  assert.match(handler, /addEventListener\("click", async \(\) =>/, "handler must be async");
  const ready = handler.indexOf("await playersReady()");
  const refresh = handler.indexOf("refreshFreeAgency(");
  assert.ok(ready >= 0 && refresh >= 0, "both calls present");
  assert.ok(ready < refresh, "await playersReady() must come before refreshFreeAgency()");
});
