/**
 * Records the card fingerprint for the current ROSTER_SCHEMA in tests/fixtures/cardSchema.json.
 *
 *   node scripts/cards/update-schema-fixture.mjs
 *
 * Run it AFTER bumping ROSTER_SCHEMA in js/data/rosterCache.js. It refuses to overwrite a
 * fingerprint while the schema is unchanged, so "cards changed" can never be silenced
 * without the bump that makes browsers drop their cached cards.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ROSTER_SCHEMA } from "../../js/data/rosterCache.js";
import { cardsDigest } from "./cardsDigest.mjs";

const path = new URL("../../tests/fixtures/cardSchema.json", import.meta.url);
let previous = null;
try {
  previous = JSON.parse(readFileSync(path, "utf8"));
} catch (_) {
  /* first run */
}
const now = cardsDigest();

if (previous && previous.schema === ROSTER_SCHEMA && previous.digest !== now.digest) {
  console.error(`The cards changed but ROSTER_SCHEMA is still ${ROSTER_SCHEMA}.\nBump it in js/data/rosterCache.js first, then run this again.`);
  process.exit(1);
}
writeFileSync(path, `${JSON.stringify({ schema: ROSTER_SCHEMA, count: now.count, digest: now.digest }, null, 2)}\n`);
console.log(`recorded schema ${ROSTER_SCHEMA}: ${now.count} cards, ${now.digest.slice(0, 16)}…`);
