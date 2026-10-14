/** Season card headshot helpers. Prefer NBA CDN; graceful fallback if missing. */
export function nbaPhoto(nbaId, size = "260x190") {
  if (!nbaId) return null;
  return `https://cdn.nba.com/headshots/nba/latest/${size}/${nbaId}.png`;
}

export function avatarFallback(name) {
  const n = encodeURIComponent(String(name || "?").slice(0, 24));
  return `https://ui-avatars.com/api/?name=${n}&background=1a3a2a&color=f3efe4&size=128&bold=true`;
}

export function photoUrl(player) {
  if (player?.photo) return player.photo;
  if (player?.nbaId) return nbaPhoto(player.nbaId);
  return avatarFallback(player?.name || "?");
}

/** Safe <img> markup with onerror fallback to initials avatar. */
export function photoImg(player, cls = "headshot") {
  const src = photoUrl(player);
  const fb = avatarFallback(player?.name || "?");
  const alt = player?.name || "";
  return `<img class="${cls}" src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fb}'" />`;
}
