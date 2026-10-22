/**
 * Builds js/data/photoCredits.js: author, licence and source page for every Wikimedia
 * Commons photo the game can show, straight from the Commons API.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/photos/build-credits.mjs   (the flag only matters behind a proxy)
 *
 * Only photos the game can actually show are credited: blocked ones (photoBlocklist.js) and
 * scraped entries replaced by a curated one are skipped. Needs network. A file the API cannot vouch for (missing, no licence, or a licence that is
 * not a recognised free one) is NOT credited — and photo.js only shows credited files, so it
 * falls back to a generated avatar instead. Those files are printed and listed in the output.
 */
import { writeFileSync } from "node:fs";
import { CURATED_PHOTOS } from "../../js/data/photos.curated.js";
import { PHOTO_BY_BREF, PHOTO_BY_BREF_DECADE } from "../../js/data/photos.scraped.js";
import { isPortrait } from "../../js/data/photoBlocklist.js";
import { wikimediaFile } from "../../js/data/photoSource.js";

const API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "CourtsideLegendsCredits/1.0 (local game; builds an attribution page)";
const BATCH = 40;
// Deliberately strict: a bare "Attribution" or an unknown licence is NOT enough.
const FREE_LICENSE = /^(CC BY|CC0|Public domain|PD[ -]|GFDL)/i;
const OUT = new URL("../../js/data/photoCredits.js", import.meta.url);

/** file name → brefs that use it, over every entry the game can actually show. */
function collectFiles() {
  const files = new Map();
  const add = (key, url) => {
    const file = wikimediaFile(url);
    if (!file || !isPortrait(url)) return;
    const bref = key.split(":")[0];
    files.set(file, [...new Set([...(files.get(file) || []), bref])].sort());
  };
  const overridden = (key) => key in CURATED_PHOTOS;
  for (const [key, url] of Object.entries(PHOTO_BY_BREF)) if (!overridden(key)) add(key, url);
  for (const [key, url] of Object.entries(PHOTO_BY_BREF_DECADE)) if (!overridden(key)) add(key, url);
  for (const [key, photo] of Object.entries(CURATED_PHOTOS)) add(key, photo.url);
  return files;
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
function plainText(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (entity) => ENTITIES[entity])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/** "Unknown author Unknown author" (Commons repeats it across two tags) → "Unknown author". */
function dedupe(text) {
  const words = text.split(" ");
  const half = words.length / 2;
  return Number.isInteger(half) && words.slice(0, half).join(" ") === words.slice(half).join(" ") ? words.slice(0, half).join(" ") : text;
}

function firstLink(html) {
  const href = /href="([^"]+)"/.exec(String(html || ""))?.[1];
  if (!href) return null;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://commons.wikimedia.org${href}`;
  return href.startsWith("http") ? href : null;
}

async function queryBatch(titles) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    redirects: "1",
    prop: "imageinfo",
    iiprop: "extmetadata|url",
    titles: titles.map((title) => `File:${title}`).join("|"),
  });
  const response = await fetch(`${API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Commons API ${response.status}`);
  return response.json();
}

/** Resolve each requested title through the API's normalisation + redirect maps. */
function pagesByRequestedTitle(titles, result) {
  const hop = (maps, title) => (maps || []).find((m) => m.from === title)?.to ?? title;
  const pages = Object.values(result.query?.pages || {});
  const byTitle = new Map(pages.map((page) => [page.title, page]));
  return new Map(
    titles.map((title) => {
      const full = `File:${title}`;
      const resolved = hop(result.query?.redirects, hop(result.query?.normalized, full));
      return [title, byTitle.get(resolved)];
    })
  );
}

function creditFrom(page, brefs) {
  const info = page?.imageinfo?.[0];
  const meta = info?.extmetadata || {};
  const license = plainText(meta.LicenseShortName?.value);
  if (!info || page.missing !== undefined) return { problem: "file not found on Commons" };
  if (!license) return { problem: "no licence in the metadata" };
  if (!FREE_LICENSE.test(license)) return { problem: `licence not recognised as free: ${license}` };
  const artist = dedupe(plainText(meta.Artist?.value) || plainText(meta.Credit?.value));
  if (!artist) return { problem: "no author in the metadata" };
  return {
    credit: {
      artist,
      artistUrl: firstLink(meta.Artist?.value),
      license,
      licenseUrl: plainText(meta.LicenseUrl?.value) || null,
      page: info.descriptionurl,
      brefs,
    },
  };
}

const files = collectFiles();
const names = [...files.keys()].sort();
const credits = {};
const problems = {};
for (let i = 0; i < names.length; i += BATCH) {
  const batch = names.slice(i, i + BATCH);
  const pages = pagesByRequestedTitle(batch, await queryBatch(batch));
  for (const name of batch) {
    const { credit, problem } = creditFrom(pages.get(name), files.get(name));
    if (credit) credits[name] = credit;
    else problems[name] = problem;
  }
}

const body = (value) => JSON.stringify(value, null, 2);
writeFileSync(
  OUT,
  `/**
 * AUTO-GENERATED by scripts/photos/build-credits.mjs from the Wikimedia Commons API — do not edit by hand.
 * ${Object.keys(credits).length} credited photos. A photo missing here is never shown (a generated avatar
 * is used instead); the ones the API could not vouch for are listed in UNCREDITED with the reason.
 */

export const PHOTO_CREDITS = ${body(credits)};

export const UNCREDITED = ${body(problems)};
`
);

const byLicense = {};
for (const credit of Object.values(credits)) byLicense[credit.license] = (byLicense[credit.license] || 0) + 1;
console.log(`files referenced: ${names.length} | credited: ${Object.keys(credits).length} | not credited: ${Object.keys(problems).length}`);
console.log("licences:", JSON.stringify(byLicense));
for (const [name, why] of Object.entries(problems)) console.log(`  NOT CREDITED  ${name} — ${why}`);
