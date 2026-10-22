import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME_LEGENDS, legendPhotoFromToken } from "../js/ui/homeShowcase.js";
import { isPortrait } from "../js/data/photo.js";

test("every home legend resolves to a real portrait (never a blocked object / bus-station file)", () => {
  for (const legend of HOME_LEGENDS) {
    const url = legendPhotoFromToken(`${legend.bref}:${legend.season}`);
    assert.ok(url, `${legend.name} has no photo`);
    assert.ok(isPortrait(url), `${legend.name} resolves to a non-portrait: ${url}`);
  }
});

test("Jordan 1991 and Bird 1986 (whose scraped photos were wrong) come from the headshot fallback", () => {
  assert.match(legendPhotoFromToken("jordami01:1991"), /headshots\/jordami01\.jpg$/);
  assert.match(legendPhotoFromToken("birdla01:1986"), /headshots\/birdla01\.jpg$/);
});

test("an empty token is null; an unknown player falls back to a headshot URL (a 404 hides the tile)", () => {
  assert.equal(legendPhotoFromToken(""), null);
  assert.match(legendPhotoFromToken("nobodyxx01:1990"), /headshots\/nobodyxx01\.jpg$/);
});

test("every home mode card legend token in index.html resolves to a real portrait", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const tokens = [...html.matchAll(/data-legend="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(tokens.length >= 9);
  for (const token of tokens) {
    const url = legendPhotoFromToken(token);
    assert.ok(url && isPortrait(url), `${token} has no usable photo`);
  }
});
