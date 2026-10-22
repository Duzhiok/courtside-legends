import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eraPhoto, isCreditedPhoto, photoImg, photoSourceOf, photoUrl, resolveCardPhoto } from "../js/data/photo.js";
import { isPortrait } from "../js/data/photoBlocklist.js";
import { PHOTO_CREDITS, UNCREDITED } from "../js/data/photoCredits.js";
import { wikimediaFile } from "../js/data/photoSource.js";
import { LOCAL_AVATARS } from "../js/data/avatars.local.js";
import { CURATED_PHOTOS } from "../js/data/photos.curated.js";
import { PHOTO_BY_BREF, PHOTO_BY_BREF_DECADE } from "../js/data/photos.scraped.js";

const ROSTER = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const BANNED_HOSTS = /basketball-reference\.com|cdn\.nba\.com|nba\.com|ui-avatars\.com|google|duckduckgo|bing\./i;

test("no card in the whole roster can be given a third-party headshot or a search-engine image", () => {
  const seen = { generated: 0, credited: 0 };
  for (const row of ROSTER) {
    const url = photoUrl({ bref: row.bref, season: row.season, name: row.name, team: row.team });
    assert.doesNotMatch(url.slice(0, 120), BANNED_HOSTS, `${row.name} ${row.season}`);
    if (url.startsWith("data:image/svg+xml")) seen.generated += 1;
    else {
      assert.ok(isCreditedPhoto(url), `${row.name} ${row.season}: ${url}`);
      seen.credited += 1;
    }
  }
  assert.ok(seen.credited > 800, `credited photos should cover ~900 cards, got ${seen.credited}`);
  assert.ok(seen.generated > 20000, "everyone else gets a generated avatar");
});

test("an old cached card's hot-linked photo is ignored, with or without a bref", () => {
  const stale = [
    "https://www.basketball-reference.com/req/202106291/images/headshots/jordami01.jpg",
    "https://cdn.nba.com/headshots/nba/latest/260x190/893.png",
    "https://ui-avatars.com/api/?name=Someone",
    "assets/photos/ellisda01_1990.jpg",
  ];
  for (const photo of stale) {
    for (const extra of [{ bref: "nobodyxx01", season: 1990 }, {}]) {
      const url = photoUrl({ name: "Someone Else", team: "BOS", photo, ...extra });
      assert.match(url, /^data:image\/svg\+xml/, `${photo} must not survive`);
    }
  }
});

test("a stored photo is still honoured when it is one we would have chosen (partial objects in feeds)", () => {
  const credited = Object.values(CURATED_PHOTOS)[0].url;
  assert.equal(photoUrl({ name: "X", photo: credited }), credited);
  assert.equal(photoUrl({ name: "X", photo: "assets/avatars/x.webp" }), "assets/avatars/x.webp");
});

test("the local illustration wins over a credited photo, and is labelled as an illustration", () => {
  const bref = "jordami01";
  const withPhoto = photoUrl({ bref, season: 1991, name: "Michael Jordan", team: "CHI" });
  assert.ok(isCreditedPhoto(withPhoto));
  LOCAL_AVATARS[bref] = "assets/avatars/jordami01.webp";
  try {
    const player = { bref, season: 1991, name: "Michael Jordan", team: "CHI" };
    assert.equal(photoUrl(player), "assets/avatars/jordami01.webp");
    assert.equal(photoSourceOf(player), "local");
    assert.deepEqual(resolveCardPhoto(player), { photo: "assets/avatars/jordami01.webp", photoCareerDefault: true, photoSource: "local" });
    assert.match(photoImg(player), /title="1991 CHI · 插画"/);
  } finally {
    delete LOCAL_AVATARS[bref];
  }
  assert.equal(photoUrl({ bref, season: 1991, name: "Michael Jordan" }), withPhoto, "and it falls back once removed");
});

test("a card with no photo stores nothing (23k data URIs would be heavy); photoImg draws the avatar", () => {
  const card = { bref: "nobodyxx01", season: 2001, name: "No Photo", team: "DEN" };
  assert.deepEqual(resolveCardPhoto(card), { photo: null, photoCareerDefault: false, photoSource: "generated" });
  const html = photoImg(card, "headshot lg");
  assert.match(html, /<img class="headshot lg" src="data:image\/svg\+xml/);
  assert.doesNotMatch(html, /data-fb|onerror/, "an avatar cannot fail to load, so it needs no fallback");
});

test("a real photo that fails to load falls back to the generated avatar", () => {
  const html = photoImg({ bref: "jordami01", season: 1991, name: "Michael Jordan", team: "CHI" });
  assert.match(html, /src="https:\/\/thumb\.wikimedia\.org\//);
  assert.match(html, /data-fb="data:image\/svg\+xml/);
  assert.match(html, /onerror="if\(this\.dataset\.fb\)/);
  assert.match(html, /title="1991 CHI"/);
});

test("photoImg escapes names and classes (an apostrophe or a quote must not break the tag)", () => {
  const html = photoImg({ name: 'Shaq "The <b>Diesel</b>" O\'Neal', team: "LAL", season: 2000 }, 'x" onload="alert(1)');
  assert.doesNotMatch(html, /onload="alert|<b>/);
  assert.match(html, /alt="Shaq &quot;The &lt;b&gt;Diesel&lt;\/b&gt;&quot; O&#39;Neal"/);
});

// ---- credits ----

const tableFiles = () => {
  const files = new Set();
  const overridden = (key) => key in CURATED_PHOTOS;
  const add = (url) => {
    const file = wikimediaFile(url);
    if (file && isPortrait(url)) files.add(file);
  };
  for (const [key, url] of [...Object.entries(PHOTO_BY_BREF), ...Object.entries(PHOTO_BY_BREF_DECADE)]) if (!overridden(key)) add(url);
  for (const photo of Object.values(CURATED_PHOTOS)) add(photo.url);
  return [...files].sort();
};

test("the credits cover exactly the photos the game can show — rebuild them after touching a photo table", () => {
  assert.deepEqual(Object.keys(PHOTO_CREDITS).sort(), tableFiles(), "run: NODE_USE_ENV_PROXY=1 node scripts/photos/build-credits.mjs");
  assert.deepEqual(UNCREDITED, {}, "a photo the API could not vouch for needs a human decision");
});

test("every credit names an author, a recognised free licence, and a Commons page", () => {
  for (const [file, credit] of Object.entries(PHOTO_CREDITS)) {
    assert.ok(credit.artist, `${file}: no author`);
    assert.match(credit.license, /^(CC BY|CC0|Public domain|PD[ -]|GFDL)/i, `${file}: ${credit.license}`);
    assert.match(credit.page, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, file);
    assert.ok(credit.brefs.length > 0, `${file}: used by nobody`);
    if (credit.license !== "Public domain") {
      assert.doesNotMatch(credit.artist, /^Unknown author$/i, `${file}: a ${credit.license} photo needs a real author`);
      assert.match(credit.licenseUrl || "", /^https?:\/\//, `${file}: attribution needs a licence link`);
    }
  }
});

test("photos from other sources never get through: NBA CDN entries and the 8 unattributed local files", () => {
  const everything = [...Object.values(PHOTO_BY_BREF), ...Object.values(PHOTO_BY_BREF_DECADE)];
  const foreign = everything.filter((url) => !wikimediaFile(url));
  assert.ok(foreign.length >= 8, "the scraped tables still contain them; the gate must be what stops them");
  for (const url of foreign) assert.equal(isCreditedPhoto(url), false, url);
  for (const season of [1983, 1992, 2003]) {
    const found = eraPhoto({ bref: "ellisda01", season });
    assert.ok(found === null || isCreditedPhoto(found), `ellisda01 ${season}: ${found}`);
  }
});
