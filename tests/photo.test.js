import test from "node:test";
import assert from "node:assert/strict";
import { NOT_A_PORTRAIT, eraPhoto, isPortrait, resolveCardPhoto } from "../js/data/photo.js";
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

test("1991 Jordan no longer shows the signed-basketball display case or a high-school photo", () => {
  const url = eraPhoto({ bref: "jordami01", season: 1991 });
  assert.ok(url === null || isPortrait(url));
  assert.doesNotMatch(String(url), /signed_basketball|Laney/);
  const resolved = resolveCardPhoto({ bref: "jordami01", season: 1991, nbaId: 893, name: "Michael Jordan" });
  assert.equal(resolved.photoSource, "nba");
  assert.equal(resolved.photoCareerDefault, true, "labelled as a career photo, not the season's");
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
