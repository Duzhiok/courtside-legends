import test from "node:test";
import assert from "node:assert/strict";
import { NOT_A_PORTRAIT, eraPhoto, isCreditedPhoto, isPortrait, resolveCardPhoto } from "../js/data/photo.js";
import { PHOTO_BY_BREF, PHOTO_BY_BREF_DECADE } from "../js/data/photos.scraped.js";

const allUrls = [...Object.values(PHOTO_BY_BREF), ...Object.values(PHOTO_BY_BREF_DECADE)];
const decoded = (url) => decodeURIComponent(url);

test("every blocklist entry still matches something in the scraped data (no stale rules)", () => {
  for (const bad of NOT_A_PORTRAIT) {
    assert.ok(allUrls.some((url) => decoded(url).includes(bad)), `unused blocklist entry: ${bad}`);
  }
});

test("no usable photo is a signed ball, a bus station, a painting or a building", () => {
  const suspicious = /signed|jersey|bus_station|painting|at_anchor|bell_field|embassy|center,_syracuse|thumbnail\.jpg|girls_playing/i;
  for (const url of allUrls.filter(isPortrait)) {
    assert.doesNotMatch(decoded(url), suspicious, url);
  }
});

test("1991 Jordan shows the credited 1997 Bulls close-up, not the signed-basketball case or a high-school photo", () => {
  const url = eraPhoto({ bref: "jordami01", season: 1991 });
  assert.ok(url && isPortrait(url));
  assert.doesNotMatch(String(url), /signed_basketball|Laney/);
  assert.match(decoded(url), /Michael_Jordan_\(1997\)/);
  const resolved = resolveCardPhoto({ bref: "jordami01", season: 1991, name: "Michael Jordan" });
  assert.equal(resolved.photoSource, "era");
  assert.equal(resolved.photo, url);
});

test("2000s LeBron is not a bus station", () => {
  for (const season of [2003, 2005, 2009]) {
    assert.doesNotMatch(String(eraPhoto({ bref: "jamesle01", season })), /bus_station/i);
  }
});

test("good photos still resolve (World Basketball Festival portraits are fine)", () => {
  assert.ok(isPortrait("https://thumb.wikimedia.org/330px-20140814_World_Basketball_Festival_James_Harden_2_cropped.jpg"));
  const hardenSeason = Object.keys(PHOTO_BY_BREF_DECADE).find((key) => key.startsWith("hardeja01:"));
  if (hardenSeason) {
    const [bref, decade] = hardenSeason.split(":");
    assert.ok(eraPhoto({ bref, season: Number(decade) + 2 }));
  }
});

test("isPortrait tolerates empty and malformed input", () => {
  assert.equal(isPortrait(null), false);
  assert.equal(isPortrait("%E0%A4%A"), true); // invalid escape: kept raw, not blocked
});

// ---- curated overrides ----
import { CURATED_PHOTOS } from "../js/data/photos.curated.js";

test("every curated photo is a portrait, says why it was chosen, and has a credit on file", () => {
  for (const [key, photo] of Object.entries(CURATED_PHOTOS)) {
    assert.ok(isPortrait(photo.url), `${key} is blocked`);
    assert.ok(photo.why, `${key} needs a reason`);
    assert.match(photo.url, /^https:\/\/thumb\.wikimedia\.org\//);
    assert.ok(isCreditedPhoto(photo.url), `${key}: no credit for ${photo.url} — run scripts/photos/build-credits.mjs`);
  }
});

test("Shaq: 1990s, 2000s and later each get a real portrait, never the exhibit or the Celtics sideline candid", () => {
  const file = (season) => decodeURIComponent(eraPhoto({ bref: "onealsh01", season }) || "null");
  assert.match(file(1996), /Shaquille_O'Neal_1998\.jpg/);
  assert.match(file(2002), /Shaq_Heat\.jpg/);
  assert.match(file(2005), /Shaq_Heat\.jpg/);
  assert.match(file(2011), /Shaq_Heat\.jpg/);
  for (let season = 1993; season <= 2011; season++) {
    assert.doesNotMatch(file(season), /Schuh|Shaquille_O'Neal\.JPG/, `${season}`);
  }
});

test("curated entries only replace what they name; everyone else still uses the scraped table", () => {
  assert.equal(eraPhoto({ bref: "curryst01", season: 2016 }), PHOTO_BY_BREF_DECADE["curryst01:2010"]);
});
