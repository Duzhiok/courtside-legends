import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
const qa = readFileSync(new URL("../scripts/qa/career-rotation.mjs", import.meta.url), "utf8");

test("season header buttons stay one line, and a 40px touch height still counts as one line", () => {
  assert.match(css, /\.btn\.small \{[^}]*min-height: 40px/);
  assert.match(css, /\.season-hub-head \.btn \{ white-space: nowrap;/);
  const check = qa.slice(qa.indexOf("season header's save"));
  assert.match(check, /getBoundingClientRect\(\)\.height <= 40/);
  assert.doesNotMatch(check.slice(0, 800), /height < 40/);
});
