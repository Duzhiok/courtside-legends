/**
 * Brandon Ingram must not have the "passing magic" (dime_dropper) skill pack.
 *
 * Ingram is in no manual skill table; his 2024 card rolled dime_dropper from
 * the generic star-tier pool (archetype connector/playmaking admits it, then
 * the stable 28% roll picked it). The fix is a per-player roll exclusion in
 * SKILL_ROLL_DENY, not a threshold change (which would strip the badge from
 * every connector-type passer) and not SKILL_FREE_BREFS (which would strip
 * his other skills, e.g. 2022 iron_lungs).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

test("no Brandon Ingram season card carries dime_dropper", () => {
  const seasons = [];
  for (const row of ROWS.filter((r) => r.bref === "ingrabr01")) {
    const card = seasonToCard(row);
    seasons.push(card.season);
    assert.ok(
      !card.skills.includes("dime_dropper"),
      `Ingram ${card.season} should not have dime_dropper, got ${JSON.stringify(card.skills)}`
    );
  }
  assert.ok(seasons.length > 0, "expected Ingram rows in roster.json");
});
