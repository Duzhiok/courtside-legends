import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ccb14ea: a headshot <img> that fails to load is rendered by Chrome as an INLINE box that ignores width/height, so the
// 18px feed avatar became a 112x18 oval printing the alt text (the player's name). These tests pin the CSS that keeps a
// broken headshot a small round chip, so a future edit that drops one of the four declarations fails the suite instead
// of silently reintroducing the oval. The real-browser check lives in scripts/qa/feed-avatar-broken.mjs (Mac only).
const CSS = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");

/** The declaration block of the top-level `selector { ... }` rule (line-anchored, so `.play-feed .feed-legend-avatar .feed-avatar` does not match `.feed-avatar`). */
function ruleBlock(selector) {
  const start = CSS.search(new RegExp(`(^|\\n)${selector.replace(".", "\\.")} \\{`));
  assert.notEqual(start, -1, `css/style.css must define ${selector}`);
  const end = CSS.indexOf("}", start);
  assert.notEqual(end, -1, `${selector} rule must close`);
  return CSS.slice(start, end);
}

test("a broken .headshot stays a sized chip: inline-block so width/height apply, overflow hidden, alt text invisible", () => {
  const headshot = ruleBlock(".headshot");
  assert.match(headshot, /display:\s*inline-block;/, "inline-block is what makes Chrome honour width/height on a broken <img>");
  assert.match(headshot, /overflow:\s*hidden;/, "overflow hidden clips anything that would spill out of the chip");
  assert.match(headshot, /font-size:\s*0;/, "font-size 0 hides the alt text (the player's name) inside the chip");
  assert.match(headshot, /color:\s*transparent;/, "transparent text is the second line of defence against a printed name");
  assert.match(headshot, /width:\s*36px;/);
  assert.match(headshot, /height:\s*36px;/);
  assert.match(headshot, /border-radius:\s*50%;/);
});

test("the feed avatar is 18px and sets no display of its own, so it inherits the .headshot inline-block", () => {
  const feedAvatar = ruleBlock(".feed-avatar");
  assert.match(feedAvatar, /width:\s*18px;/);
  assert.match(feedAvatar, /height:\s*18px;/);
  assert.doesNotMatch(feedAvatar, /display\s*:/, ".feed-avatar must not override display: the fix lives on .headshot");
});

test("no .headshot rule anywhere in style.css resets display to bare inline (the oval bug)", () => {
  for (const match of CSS.matchAll(/\.headshot[^{]*\{[^}]*\}/g)) {
    assert.doesNotMatch(match[0], /display:\s*inline;/, `${match[0].slice(0, 60)} must not use bare inline display`);
  }
});
