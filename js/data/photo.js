/** Season card headshot helpers. Era map → NBA CDN → Basketball-Reference → avatar. */

import { PHOTO_BY_BREF, PHOTO_BY_BREF_DECADE } from "./photos.scraped.js";

export function nbaPhoto(nbaId, size = "260x190") {
  if (!nbaId) return null;
  return `https://cdn.nba.com/headshots/nba/latest/${size}/${nbaId}.png`;
}

export function brefPhoto(brefId) {
  if (!brefId) return null;
  return `https://www.basketball-reference.com/req/202106291/images/headshots/${brefId}.jpg`;
}

export function avatarFallback(name) {
  const n = encodeURIComponent(String(name || "?").slice(0, 24));
  return `https://ui-avatars.com/api/?name=${n}&background=1a3a2a&color=f3efe4&size=128&bold=true`;
}

function decadeOf(season) {
  const s = Number(season);
  if (!Number.isFinite(s)) return null;
  return Math.floor(s / 10) * 10;
}

/**
 * Scraped Commons files that are NOT a portrait of that player: objects, buildings,
 * paintings, a bus station, someone else. The scraper matched on file names, so
 * these slipped in (e.g. LeBron's 2000s card was a bus-station platform).
 * Matched against the decoded URL; a card that loses its era photo falls back to
 * the NBA CDN headshot. Keep exact — "World_Basketball_Festival_<player>" is fine.
 */
export const NOT_A_PORTRAIT = [
  "signed_basketball",
  "signed_Lakers_jersey",
  "Basketball_Center,_Syracuse",
  "Embassy_of_Hope",
  "Schuh_v._Shaquille",
  "Laney_High_School",
  "Bernard_Cardinal_Law",
  "Girls_playing_basketball",
  "At_Anchor_by_Paul",
  "Cultural_Centre_bus_station",
  "Jerry_Bell_Field",
  "LeBron_James_signs_basketball_for_Airman", // an autograph line; his face is out of frame
  "Magic_Johnson_and_Kareem", // a two-shot, not either player alone
  "thumbnail.jpg",
];

export function isPortrait(url) {
  if (!url) return false;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // keep the raw URL if it is not valid percent-encoding
  }
  return !NOT_A_PORTRAIT.some((bad) => decoded.includes(bad));
}

const usable = (url) => (isPortrait(url) ? url : null);

/**
 * Prefer scraped era photo (same player, different decade) when available.
 */
export function eraPhoto(player) {
  const bref = player?.bref;
  if (!bref) return null;
  const decade = decadeOf(player?.season);
  if (decade != null) {
    const hit = usable(PHOTO_BY_BREF_DECADE[`${bref}:${decade}`]);
    if (hit) return hit;
    // nearby decade (±10y) if exact bucket missing
    for (const d of [decade - 10, decade + 10]) {
      const near = usable(PHOTO_BY_BREF_DECADE[`${bref}:${d}`]);
      if (near) return near;
    }
  }
  return usable(PHOTO_BY_BREF[bref]);
}

export function photoUrl(player) {
  if (player?.photo && !player?.photoCareerDefault) return player.photo;
  const era = eraPhoto(player);
  if (era) return era;
  if (player?.photo) return player.photo;
  if (player?.nbaId) return nbaPhoto(player.nbaId);
  if (player?.bref) return brefPhoto(player.bref);
  return avatarFallback(player?.name || "?");
}

/**
 * Resolve the best photo URL for a season card (used when building cards).
 */
export function resolveCardPhoto(playerLike) {
  const era = eraPhoto(playerLike);
  if (era) {
    return { photo: era, photoCareerDefault: false, photoSource: "era" };
  }
  if (playerLike?.nbaId) {
    return { photo: nbaPhoto(playerLike.nbaId), photoCareerDefault: true, photoSource: "nba" };
  }
  if (playerLike?.bref) {
    return { photo: brefPhoto(playerLike.bref), photoCareerDefault: true, photoSource: "bref" };
  }
  return {
    photo: avatarFallback(playerLike?.name || "?"),
    photoCareerDefault: true,
    photoSource: "avatar",
  };
}

/**
 * Safe <img> markup with cascading onerror fallbacks.
 * Era photos first; then NBA / BRef / initials avatar.
 */
export function photoImg(player, cls = "headshot") {
  const primary = photoUrl(player);
  const bref = player?.bref ? brefPhoto(player.bref) : null;
  const nba = player?.nbaId ? nbaPhoto(player.nbaId) : null;
  const fb = avatarFallback(player?.name || "?");
  const alt = player?.name || "";
  // cascade: primary → other CDN → avatar
  const chain = [];
  for (const u of [nba, bref, fb]) {
    if (u && u !== primary && !chain.includes(u)) chain.push(u);
  }
  while (chain.length < 2) chain.push(fb);
  const [second, third] = chain;
  const team = player?.team || "";
  const img = `<img class="${cls}" src="${primary}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" data-fb1="${second}" data-fb2="${third}" onerror="if(this.dataset.fb1){this.src=this.dataset.fb1;this.dataset.fb1='';}else if(this.dataset.fb2){this.src=this.dataset.fb2;this.dataset.fb2='';}else{this.onerror=null;}" />`;
  if (!team) return img;
  const tip = player?.photoCareerDefault
    ? `${player.season || ""} ${team} · 生涯照（非当季）`
    : `${player.season || ""} ${team}`;
  return `<span class="photo-wrap" title="${tip}"><i class="team-badge">${team}</i>${img}</span>`;
}
