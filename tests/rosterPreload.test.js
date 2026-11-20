// The cold-start preload (js/rosterPreload.js, wired in index.html) only helps while it asks for exactly what the app asks for.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const html = read("index.html");
const script = read("js/rosterPreload.js");
const cache = read("js/data/rosterCache.js");
const players = read("js/data/players.js");

test("the preloaded URL is the one players.js fetches", () => {
  const fetched = players.match(/fetchRosterJson\("\.\/(js\/data\/roster\.json)"/)?.[1];
  assert.ok(fetched, "players.js no longer fetches roster.json the way this test expects");
  assert.ok(script.includes(`l.href = "${fetched}"`), "the preload asks for a different URL than the app fetches");
});

test("the preload is skipped for returning visitors: it keys on the marker rosterCache.js writes", () => {
  const key = cache.match(/const LS_KEY = "([^"]+)"/)?.[1];
  assert.ok(key, "rosterCache.js LS_KEY not found");
  assert.ok(script.includes(`if (localStorage.getItem("${key}")) return;`), "the preload is not guarded by the real cache marker");
});

test("the preload is a same-origin CORS fetch preload, so the app's fetch() can reuse it", () => {
  assert.ok(script.includes('l.as = "fetch"') && script.includes('l.crossOrigin = "anonymous"'));
  assert.ok(/fetch\(url\)/.test(cache), "rosterCache fetches with default credentials; the preload's crossorigin mode assumes that");
});

test("it is an external script (CSP-ready), after the stylesheets and before the module graph", () => {
  const at = html.indexOf('<script src="js/rosterPreload.js');
  assert.ok(at > 0, "index.html does not load js/rosterPreload.js");
  assert.ok(at > html.lastIndexOf('<link rel="stylesheet"'), "a preload ahead of the render-blocking CSS delays first paint (measured +0.2-0.5 s)");
  assert.ok(at < html.indexOf('<script type="module" src="js/app.js'), "it must still start before the module graph");
});
