import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { esc } from "../js/core/html.js";
import { esc as ttEsc } from "../js/ui/timeTravel/format.js";
import { esc as kitEsc } from "../js/ui/myTeamViewKit.js";

test("esc escapes all five HTML-significant characters", () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
});

test("esc escapes in one pass and keeps plain text intact", () => {
  assert.equal(esc("&amp;"), "&amp;amp;");
  assert.equal(esc("Chris Paul 保罗 #3"), "Chris Paul 保罗 #3");
});

test("esc turns null/undefined into an empty string and stringifies other values", () => {
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(0), "0");
  assert.equal(esc(false), "false");
});

test("the re-exported esc helpers are the shared implementation", () => {
  assert.equal(ttEsc, esc);
  assert.equal(kitEsc, esc);
});

// Guard: one escaper for the whole client. A new view must import js/core/html.js instead of
// pasting its own copy (22 copies had drifted apart: some skipped ', one printed "null").
// js/app.js keeps its own esc/escAttr until the app.js split; vendor code is not ours.
const ALLOWED = new Set(["js/core/html.js", "js/app.js"]);
const LOCAL_ESCAPER = /^[ \t]*(?:export\s+)?(?:function|const|let|var)\s+(esc|escapeHtml|escHtml|escapeAttr|htmlEscape)\b/m;

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "vendor") jsFiles(path, out);
    } else if (name.endsWith(".js")) out.push(path);
  }
  return out;
}

test("no client module defines its own HTML escaper (import js/core/html.js)", () => {
  const root = new URL("..", import.meta.url).pathname;
  const offenders = jsFiles(join(root, "js"))
    .map((file) => relative(root, file))
    .filter((file) => !ALLOWED.has(file))
    .filter((file) => LOCAL_ESCAPER.test(readFileSync(join(root, file), "utf8")));
  assert.deepEqual(offenders, []);
});
