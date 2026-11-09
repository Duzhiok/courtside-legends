import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GALLERY_LEGENDS,
  galleryPoolStats,
  eraBucket,
  eraLabel,
  legendTeamName,
  legendPhoto,
  legendPhotoFromToken,
} from "../js/ui/homeShowcase.js";
import { isCreditedPhoto } from "../js/data/photo.js";

const roster = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const byKey = new Map(roster.map((r) => [`${r.bref}:${r.season}`, r]));

const modeCardTokens = () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  return [...html.matchAll(/data-legend="([^"]+)"/g)].map((match) => match[1]);
};

const isRealArt = (url) => url.startsWith("assets/avatars/") || isCreditedPhoto(url);

test("the gallery pool is 40 legends with the approved era distribution", () => {
  assert.equal(GALLERY_LEGENDS.length, 40);
  assert.deepEqual(galleryPoolStats(), { pre1980: 6, 1980: 6, 1990: 8, 2000: 8, 2010: 6, 2020: 6 });
  const tokens = new Set(GALLERY_LEGENDS.map((l) => `${l.bref}:${l.season}`));
  assert.equal(tokens.size, 40, "no duplicate legend seasons");
});

test("every gallery entry resolves to a roster row and its copied data matches", () => {
  for (const legend of GALLERY_LEGENDS) {
    const row = byKey.get(`${legend.bref}:${legend.season}`);
    assert.ok(row, `${legend.nameEn} has no roster row`);
    assert.equal(legend.team, row.team, `${legend.nameEn} team`);
    assert.equal(legend.pos, row.pos, `${legend.nameEn} pos`);
    assert.equal(legend.ppg, row.ppg, `${legend.nameEn} ppg`);
    assert.equal(legend.rpg, row.rpg, `${legend.nameEn} rpg`);
    assert.equal(legend.apg, row.apg, `${legend.nameEn} apg`);
    assert.ok(legend.name && legend.nameEn && legend.name !== legend.nameEn, `${legend.nameEn} needs zh + en names`);
    const enTeam = legendTeamName(legend, "en");
    assert.ok(enTeam && !/[\u4e00-\u9fff]/.test(enTeam), `${legend.nameEn} team has no English name: ${enTeam}`);
  }
});

test("every gallery legend has real art: a local illustration or a photo we can credit", () => {
  for (const legend of GALLERY_LEGENDS) {
    const url = legendPhoto(legend);
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

test("era labels are bilingual and bucketed from the season", () => {
  assert.equal(eraLabel(1969, "zh"), "1960 年代");
  assert.equal(eraLabel(1969, "en"), "1960s");
  assert.equal(eraLabel(1991, "zh"), "1990 年代");
  assert.equal(eraLabel(2024, "en"), "2020s");
  assert.equal(eraBucket(1969), "pre1980");
  assert.equal(eraBucket(1987), 1980);
  assert.equal(eraBucket(2024), 2020);
});
