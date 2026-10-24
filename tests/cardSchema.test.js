import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROSTER_SCHEMA, isCurrentSchemaKey, rosterCacheKey } from "../js/data/rosterCache.js";
import { cardsDigest } from "../scripts/cards/cardsDigest.mjs";

const HOW = "Bump ROSTER_SCHEMA in js/data/rosterCache.js, then run: node scripts/cards/update-schema-fixture.mjs";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/cardSchema.json", import.meta.url), "utf8"));

test("the cards the app builds match what was recorded for this ROSTER_SCHEMA (else browsers keep stale cards)", () => {
  const now = cardsDigest();
  assert.equal(fixture.schema, ROSTER_SCHEMA, `the fixture belongs to schema ${fixture.schema}, the code is at ${ROSTER_SCHEMA}. ${HOW}`);
  assert.equal(now.count, fixture.count, `the number of cards changed. ${HOW}`);
  assert.equal(
    now.digest,
    fixture.digest,
    `cards changed (skills, ratings, photos…) but ROSTER_SCHEMA is still ${ROSTER_SCHEMA}: every browser would keep serving the old cards from IndexedDB. ${HOW}`,
  );
});

test("a remembered cache key from an older schema is rejected, a current one accepted", () => {
  const meta = { version: 1, generated: "2026-10-15d", count: 23452 };
  assert.equal(isCurrentSchemaKey(rosterCacheKey(meta)), true);
  assert.equal(isCurrentSchemaKey(`v${ROSTER_SCHEMA - 1}|1|2026-10-15d|23452`), false, "the previous schema must not load");
  assert.equal(isCurrentSchemaKey(`v${ROSTER_SCHEMA}0|1|x|1`), false, "v430 is not v43");
  assert.equal(isCurrentSchemaKey(null), false);
  assert.equal(isCurrentSchemaKey(undefined), false);
  assert.equal(isCurrentSchemaKey(""), false);
});
