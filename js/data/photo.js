/**
 * Which picture a card gets. One place decides, in this order:
 *
 *   1. a local illustration we made   (assets/avatars/<bref>.*, see avatars.local.js)
 *   2. a Wikimedia Commons photo with a credit   (photoCredits.js, shown on the credits page)
 *   3. a Basketball-Reference headshot thumbnail, hot-linked   (bbrefHeadshotUrl)
 *   4. a generated avatar   (avatarArt.js — depicts nobody, fetches nothing)
 *
 * Tier 3 is a conscious, explicit choice: this build is for the owner's own private play, not a
 * public release, and loading a small thumbnail straight from basketball-reference.com for your
 * own game isn't "stealing" anything — it's just loading a webpage. It IS still a live network
 * fetch with no attribution, so it stays off the public-release checklist (see HOTLINK_HEADSHOTS
 * below if this project is ever shipped to other people: flip it to false and tier 3 disappears,
 * falling straight through to the generated avatar, same as before).
 */

import { avatarDataUri } from "./avatarArt.js";
import { LOCAL_AVATARS } from "./avatars.local.js";
import { isPortrait } from "./photoBlocklist.js";
import { PHOTO_CREDITS } from "./photoCredits.js";
import { wikimediaFile } from "./photoSource.js";
import { CURATED_PHOTOS } from "./photos.curated.js";
import { PHOTO_BY_BREF as SCRAPED_BY_BREF, PHOTO_BY_BREF_DECADE as SCRAPED_BY_DECADE } from "./photos.scraped.js";
import { PHOTO_BY_BREF_WIKI } from "./photos.wiki.js";

export { NOT_A_PORTRAIT, isPortrait } from "./photoBlocklist.js";

/** Single on/off switch for the hot-linked Basketball-Reference tier. See the note above. */
export const HOTLINK_HEADSHOTS = true;

/** Basketball-Reference's own headshot thumbnail for a bref id. 404s gracefully (no bref match)
 *  and photoImg()'s onerror already swaps a failed <img> to the generated avatar. */
export function bbrefHeadshotUrl(bref) {
  if (!bref) return null;
  return `https://www.basketball-reference.com/req/202106291/images/headshots/${bref}.jpg`;
}

// Curated entries override the generated scraped tables, which override the auto-discovered
// Wikipedia ones (photos.wiki.js) -- hand-verified work always wins over name-matched guesses.
// Keys are "bref:decade" or "bref", so one merge serves both lookups.
const CURATED_URLS = Object.fromEntries(Object.entries(CURATED_PHOTOS).map(([key, photo]) => [key, photo.url]));
const PHOTO_BY_BREF_DECADE = { ...SCRAPED_BY_DECADE, ...CURATED_URLS };
const PHOTO_BY_BREF = { ...PHOTO_BY_BREF_WIKI, ...SCRAPED_BY_BREF, ...CURATED_URLS };

function decadeOf(season) {
  const s = Number(season);
  if (!Number.isFinite(s)) return null;
  return Math.floor(s / 10) * 10;
}

/** A photo is shown only if it is a portrait AND we hold its credit. */
export function isCreditedPhoto(url) {
  if (!url || !isPortrait(url)) return false;
  const file = wikimediaFile(url);
  return Boolean(file && PHOTO_CREDITS[file]);
}

const usable = (url) => (isCreditedPhoto(url) ? url : null);

export function localIllustration(bref) {
  return (bref && LOCAL_AVATARS[bref]) || null;
}

/** The credited Wikimedia photo for this card: its own decade first, then ±10 years, then any. */
export function eraPhoto(player) {
  const bref = player?.bref;
  if (!bref) return null;
  const decade = decadeOf(player?.season);
  if (decade != null) {
    const hit = usable(PHOTO_BY_BREF_DECADE[`${bref}:${decade}`]);
    if (hit) return hit;
    for (const d of [decade - 10, decade + 10]) {
      const near = usable(PHOTO_BY_BREF_DECADE[`${bref}:${d}`]);
      if (near) return near;
    }
  }
  return usable(PHOTO_BY_BREF[bref]);
}

/**
 * A stored `photo` (from a cached card or a partial object) is trusted only if it is
 * something we would have chosen ourselves. Old caches hold NBA / Basketball-Reference URLs.
 */
function safeStoredPhoto(url) {
  if (!url) return null;
  if (url.startsWith("assets/avatars/")) return url;
  return usable(url);
}

/** "local" | "era" | "hotlinked" | "generated" — which rung of the chain this card lands on. */
export function photoSourceOf(player) {
  if (localIllustration(player?.bref)) return "local";
  if (eraPhoto(player) || safeStoredPhoto(player?.photo)) return "era";
  if (HOTLINK_HEADSHOTS && player?.bref) return "hotlinked";
  return "generated";
}

export function photoUrl(player) {
  return (
    localIllustration(player?.bref) ||
    eraPhoto(player) ||
    safeStoredPhoto(player?.photo) ||
    (HOTLINK_HEADSHOTS ? bbrefHeadshotUrl(player?.bref) : null) ||
    avatarDataUri(player)
  );
}

/**
 * Photo fields to store on a card. A generated avatar is NOT stored (23k data URIs would be
 * heavy); photoImg() builds it when the card is drawn.
 */
export function resolveCardPhoto(playerLike) {
  const local = localIllustration(playerLike?.bref);
  if (local) return { photo: local, photoCareerDefault: true, photoSource: "local" };
  const era = eraPhoto(playerLike);
  if (era) return { photo: era, photoCareerDefault: false, photoSource: "era" };
  return { photo: null, photoCareerDefault: false, photoSource: "generated" };
}

const escapeAttr = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TIP_SUFFIX = { local: " · 插画", era: "", hotlinked: "", generated: "" };

/**
 * Safe <img> markup. A real photo that fails to load (offline, blocked) falls back to the
 * generated avatar, which is a data URI and cannot fail.
 */
export function photoImg(player, cls = "headshot") {
  const src = photoUrl(player);
  const avatar = avatarDataUri(player);
  const fallback = src === avatar ? "" : ` data-fb="${avatar}" onerror="if(this.dataset.fb){this.src=this.dataset.fb;this.dataset.fb='';}"`;
  const img = `<img class="${escapeAttr(cls)}" src="${src}" alt="${escapeAttr(player?.name)}" loading="lazy" referrerpolicy="no-referrer"${fallback}>`;
  const team = player?.team || "";
  if (!team) return img;
  const tip = escapeAttr(`${player.season || ""} ${team}${TIP_SUFFIX[photoSourceOf(player)]}`.trim());
  return `<span class="photo-wrap" title="${tip}"><i class="team-badge">${escapeAttr(team)}</i>${img}</span>`;
}
