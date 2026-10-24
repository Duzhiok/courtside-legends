/**
 * A fingerprint of every season card this app builds, exactly as loadPlayers() builds them
 * (the same cards rosterCache.js stores in IndexedDB). If it changes, every browser's cached
 * cards are out of date — which is what ROSTER_SCHEMA is for.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";
import { seasonToCard } from "../../js/data/players.js";

export function cardsDigest() {
  const rows = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  const hash = createHash("sha256");
  for (const row of rows) hash.update(JSON.stringify(seasonToCard(row)));
  return { digest: hash.digest("hex"), count: rows.length };
}
