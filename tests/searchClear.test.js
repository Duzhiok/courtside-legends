import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { filterBarHtml, freshFilter } = await import("../js/ui/collectionFilter.js");
const esc = (s) => String(s ?? "");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * R49 (user): searching for a person meant backspacing the previous name
 * letter by letter before the next search. Every person-search box gets a
 * one-tap × that wipes the whole name, resets the results and refocuses.
 */

test("collection filter bar renders a clear button, hidden only while the query is empty", () => {
  const empty = filterBarHtml(freshFilter(), { shown: 0, total: 0, decades: [] }, esc);
  assert.match(empty, /data-cf-clear/);
  assert.match(empty, /data-cf-clear[^>]*hidden/, "no query -> no × to tap");

  const filled = filterBarHtml({ ...freshFilter(), query: "Kobe" }, { shown: 1, total: 9, decades: [] }, esc);
  assert.match(filled, /data-cf-clear/);
  assert.doesNotMatch(filled, /data-cf-clear[^>]*hidden/, "a typed name must show the ×");
});

test("sandbox （时空对决） search boxes and roster rows carry the one-tap clears", () => {
  const src = read("../js/ui/sandboxView.js");
  assert.match(src, /data-clear="\$\{side\}"/, "each side's search box gets its own ×");
  assert.match(src, /class="search-clear"/);
  assert.match(src, /data-remove-all="\$\{side\}:\$\{first\}"/, "roster rows get a remove-all ✕ per selected name");
  assert.match(src, /filter\(\(c\) => c\.id !== card\.id\)/, "remove-all drops every copy of that card at once");
  assert.match(src, /input\?\.focus\(\)/, "clearing returns focus to the search box for the next name");
});

test("wish search in index.html is wrapped with its clear button, and app.js wires both clears", () => {
  const html = read("../index.html");
  assert.match(html, /id="wish-search-clear"/);
  assert.match(html, /<div class="search-wrap">\s*<input id="wish-search"/);

  const app = read("../js/app.js");
  assert.match(app, /\$\("#wish-search-clear"\)\?\.addEventListener\("click"/);
  assert.match(app, /closest\("\[data-cf-clear\]"\)/, "collection filter clear is handled by delegation");
});

test("shared clear-button styles exist and suppress the native search ×", () => {
  const css = read("../css/gacha.css");
  assert.match(css, /\.search-clear\s*\{/);
  assert.match(css, /::-webkit-search-cancel-button/, "exactly one × per box, not the browser's plus ours");
});
