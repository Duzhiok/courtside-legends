/** Season card headshot helpers. NBA CDN → Basketball-Reference → avatar. */
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

export function photoUrl(player) {
  if (player?.photo) return player.photo;
  if (player?.nbaId) return nbaPhoto(player.nbaId);
  if (player?.bref) return brefPhoto(player.bref);
  return avatarFallback(player?.name || "?");
}

/** Safe <img> markup with cascading onerror fallbacks. */
export function photoImg(player, cls = "headshot") {
  const primary = photoUrl(player);
  const bref = player?.bref ? brefPhoto(player.bref) : null;
  const fb = avatarFallback(player?.name || "?");
  const alt = player?.name || "";
  // Try primary → bref (if different) → avatar
  const second = bref && bref !== primary ? bref : fb;
  const third = fb;
  return `<img class="${cls}" src="${primary}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" data-fb1="${second}" data-fb2="${third}" onerror="if(this.dataset.fb1){this.src=this.dataset.fb1;this.dataset.fb1='';}else if(this.dataset.fb2){this.src=this.dataset.fb2;this.dataset.fb2='';}else{this.onerror=null;}" />`;
}
