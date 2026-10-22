/**
 * Discovers a Wikipedia infobox photo for every bref this game doesn't already have a
 * hand-picked/scraped photo for. Writes js/data/photos.wiki.js -- a strictly lower-priority
 * source than photos.scraped.js/photos.curated.js (see photo.js's merge order), because this
 * is automated name-matching and deserves less trust than hand-verified entries.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/photos/discover-wiki.mjs
 *
 * Uses the MediaWiki action API's batched pageimages query (up to 50 titles per request)
 * instead of one request per person -- the per-person REST summary endpoint hits this shared
 * egress IP's rate limit within ~20 requests and took over 10s/person once backoff kicked in;
 * batching the same ~4,300 lookups into ~90 requests finishes in minutes instead of hours.
 *
 * Safety net, not a guarantee: only accepts thumbnails whose URL path is on
 * thumb/upload.wikimedia.org/wikipedia/commons/... (Commons-hosted, excludes non-free fair-use
 * images hosted locally on en.wikipedia.org, which would fail the credit check in
 * build-credits.mjs anyway), and only when the page's own short description mentions
 * "basketball" (cheap defense against a common name resolving to the wrong, more famous person
 * entirely). Still: this is automated and unaudited. Run build-credits.mjs after this to drop
 * anything without a real free licence, and spot-check a sample in a browser before trusting it
 * wholesale -- this script finds *candidates*, it does not replace the human portrait/credit
 * checks the rest of the photo pipeline already does.
 *
 * Resumable: writes photos.wiki.js after every batch, and on a re-run skips any bref already
 * recorded there (success or a recorded miss).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PHOTO_BY_BREF, PHOTO_BY_BREF_DECADE } from "../../js/data/photos.scraped.js";
import { CURATED_PHOTOS } from "../../js/data/photos.curated.js";
import { wikimediaFile } from "../../js/data/photoSource.js";

const OUT = new URL("../../js/data/photos.wiki.js", import.meta.url);
const API = "https://en.wikipedia.org/w/api.php";
const BATCH = 50;
const USER_AGENT = "CourtsideLegendsPhotoDiscovery/1.0 (local single-player game; finds candidate portraits)";
const BASKETBALL_HINT = /basketball/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alreadyCovered() {
  const covered = new Set();
  for (const key of Object.keys(PHOTO_BY_BREF)) covered.add(key);
  for (const key of Object.keys(PHOTO_BY_BREF_DECADE)) covered.add(key.split(":")[0]);
  for (const key of Object.keys(CURATED_PHOTOS)) covered.add(key.split(":")[0]);
  return covered;
}

function peopleToScan() {
  const rows = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
  const covered = alreadyCovered();
  const people = new Map();
  for (const r of rows) {
    if (covered.has(r.bref) || people.has(r.bref)) continue;
    people.set(r.bref, r.name);
  }
  return people;
}

function loadExisting() {
  if (!existsSync(OUT)) return { found: {}, misses: {} };
  const mod = readFileSync(OUT, "utf8");
  const foundMatch = /export const PHOTO_BY_BREF_WIKI = (\{[\s\S]*?\n\});/.exec(mod);
  const missMatch = /export const WIKI_MISSES = (\{[\s\S]*?\n\});/.exec(mod);
  return {
    found: foundMatch ? JSON.parse(foundMatch[1]) : {},
    misses: missMatch ? JSON.parse(missMatch[1]) : {},
  };
}

/** One batched lookup. Retries the whole batch on 429 -- a batch failing is cheap to retry. */
async function queryBatch(titles) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "pageimages|pageprops",
    piprop: "thumbnail",
    pithumbsize: "330",
    redirects: "1",
    titles: titles.join("|"),
  });
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(`${API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
    if (resp.status === 429) {
      await sleep(Math.min(60000, 2000 * 2 ** attempt));
      continue;
    }
    if (!resp.ok) throw new Error(`MediaWiki API ${resp.status}`);
    return resp.json();
  }
}

/** A requested title doesn't necessarily come back verbatim (redirects/normalization). */
function pagesByRequestedTitle(titles, result) {
  const hop = (maps, title) => (maps || []).find((m) => m.from === title)?.to ?? title;
  const pages = Object.values(result.query?.pages || {});
  const byTitle = new Map(pages.map((page) => [page.title, page]));
  return new Map(titles.map((title) => [title, byTitle.get(hop(result.query?.redirects, hop(result.query?.normalized, title)))]));
}

function candidateFrom(page) {
  if (!page || page.missing !== undefined) return null;
  const thumb = page.thumbnail?.source;
  if (!thumb) return null;
  const shortdesc = page.pageprops?.["wikibase-shortdesc"] || "";
  if (!BASKETBALL_HINT.test(shortdesc)) return null;
  const file = wikimediaFile(thumb.split("?")[0]);
  if (!file) return null; // not Commons-hosted (e.g. a local non-free fair-use upload)
  return thumb.split("?")[0];
}

async function runRound(names, found, misses) {
  const entries = [...names.entries()];
  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const titles = slice.map(([, name]) => name);
    const pages = pagesByRequestedTitle(titles, await queryBatch(titles));
    for (const [bref, name] of slice) {
      const url = candidateFrom(pages.get(name));
      if (url) found[bref] = url;
      else misses[bref] = (misses[bref] || 0) + 1; // count of rounds tried, not a message anymore
    }
    save(found, misses);
    console.log(`  ...${Math.min(i + BATCH, entries.length)}/${entries.length} (found so far: ${Object.keys(found).length})`);
  }
}

async function main() {
  const people = peopleToScan();
  const { found, misses } = loadExisting();
  const round1 = new Map([...people.entries()].filter(([bref]) => !(bref in found) && !(bref in misses)));
  console.log(`${people.size} people need lookup, ${round1.size} not yet attempted (resuming) -- round 1 (exact name)`);
  await runRound(round1, found, misses);

  // Round 2: anyone still missing gets one retry with "(basketball)" appended, in case the
  // exact name hit a disambiguation page or someone more famous who shares the name.
  const round2 = new Map([...people.entries()].filter(([bref]) => !(bref in found)).map(([bref, name]) => [bref, `${name} (basketball)`]));
  console.log(`round 2 (disambiguated name): ${round2.size} still missing a photo`);
  await runRound(round2, found, misses);

  save(found, misses);
  console.log(`done: ${Object.keys(found).length} found, ${Object.keys(misses).length} misses`);
}

function save(found, misses) {
  writeFileSync(
    OUT,
    `/**
 * AUTO-GENERATED by scripts/photos/discover-wiki.mjs from Wikipedia's batched pageimages API.
 * Lower priority than photos.scraped.js/photos.curated.js (see photo.js's merge order) --
 * these are name-matched automatically, not hand-verified. Still has to clear
 * build-credits.mjs's Commons licence check before it's ever actually shown.
 * ${Object.keys(found).length} candidates found, ${Object.keys(misses).length} misses.
 */

export const PHOTO_BY_BREF_WIKI = ${JSON.stringify(found, null, 2)};

/** bref -> number of lookup rounds tried with no usable candidate (debugging aid only). */
export const WIKI_MISSES = ${JSON.stringify(misses, null, 2)};
`
  );
}

main();
