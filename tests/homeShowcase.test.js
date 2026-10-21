import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME_LEGENDS, legendPhotoFromToken } from "../js/ui/homeShowcase.js";

test("every home legend resolves to an era photo", () => {
  for (const legend of HOME_LEGENDS) {
    assert.ok(legendPhotoFromToken(`${legend.bref}:${legend.season}`), `${legend.name} has no photo`);
  }
});

test("unknown or empty legend tokens resolve to null instead of throwing", () => {
  assert.equal(legendPhotoFromToken(""), null);
  assert.equal(legendPhotoFromToken("nobodyxx01:1990"), null);
});

test("every home mode card legend token in index.html resolves to a photo", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const tokens = [...html.matchAll(/data-legend="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(tokens.length >= 9);
  for (const token of tokens) assert.ok(legendPhotoFromToken(token), `${token} has no photo`);
});
