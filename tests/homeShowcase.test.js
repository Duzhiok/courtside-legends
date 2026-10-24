import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME_LEGENDS, legendPhoto, legendPhotoFromToken } from "../js/ui/homeShowcase.js";
import { isCreditedPhoto } from "../js/data/photo.js";

const modeCardTokens = () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  return [...html.matchAll(/data-legend="([^"]+)"/g)].map((match) => match[1]);
};

const isRealArt = (url) => url.startsWith("assets/avatars/") || isCreditedPhoto(url);

test("every home legend has real art: a local illustration or a photo we can credit", () => {
  for (const legend of HOME_LEGENDS) {
    const url = legendPhotoFromToken(`${legend.bref}:${legend.season}`);
    assert.ok(url, `${legend.name} would lose its tile`);
    assert.ok(isRealArt(url), `${legend.name}: ${url}`);
  }
});

test("Jordan, Bird and Jokić use the photos picked for them (not a signed ball, a mayor's photo-op or a hot-link)", () => {
  const file = (token) => decodeURIComponent(legendPhotoFromToken(token));
  assert.match(file("jordami01:1991"), /Michael_Jordan_\(1997\)/);
  assert.match(file("birdla01:1986"), /Larry_Bird_Lipofsky/);
  assert.match(file("jokicni01:2023"), /Nikola_Jokic_\(51914124577\)/);
});

test("a legend with no real art gets NO tile — a silhouette is not a stand-in for a legend", () => {
  assert.equal(legendPhotoFromToken(""), null);
  assert.equal(legendPhotoFromToken("nobodyxx01:1990"), null);
  assert.equal(legendPhoto({ bref: "nobodyxx01", season: 1990 }), null);
});

test("every mode card legend token in index.html has real art too", () => {
  const tokens = modeCardTokens();
  assert.ok(tokens.length >= 9);
  for (const token of tokens) {
    const url = legendPhotoFromToken(token);
    assert.ok(url && isRealArt(url), `${token} has no usable art`);
  }
});
