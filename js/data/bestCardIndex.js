/**
 * "The best season card of this player" without scanning the whole library each time. The Hometown Legends block asks for ~100 players
 * while the home screen is drawn, and each ask used to walk all 23,000 cards (about a tenth of a second on a laptop, half a second
 * on a phone, right at start-up). The index is built once per library and rebuilt if the list is replaced or grows.
 * Same answer as the old loop: the highest `rate`, the earlier card winning a tie.
 */
export function createBestCardIndex(getPlayers, rate) {
  let list = null;
  let size = -1;
  let byBref = new Map();
  function build() {
    list = getPlayers();
    size = list.length;
    byBref = new Map();
    for (const p of list) {
      const best = byBref.get(p.bref);
      if (!best || rate(p) > rate(best)) byBref.set(p.bref, p);
    }
  }
  return (bref) => {
    if (getPlayers() !== list || getPlayers().length !== size) build();
    return byBref.get(bref) ?? null;
  };
}
