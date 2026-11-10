/**
 * Player Reborn — entry view. Only the pure HTML builders are testable in
 * Node (the screen wiring needs a DOM and is covered by the Mac browser QA).
 * The key pins: an unrevealed identity never leaks the real name, and the
 * report shows the line, the trust change, the growth, and the takeover.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rebornIdentityHtml, rebornReportHtml } from "../js/ui/reborn/rebornView.js";
import { createRebornState, buildPlayerCard, maybeReveal } from "../js/reborn/identity.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

test("an unrevealed identity shows the camp-player label, never the real name", () => {
  const reborn = createRebornState("reborn-view-1", ROWS);
  assert.equal(reborn.identity.revealed, false);
  const card = buildPlayerCard(reborn.identity, ROWS);
  const html = rebornIdentityHtml({ reborn, card, lang: "zh" });
  assert.match(html, /无名试训球员/);
  assert.ok(!html.includes(reborn.identity.name), "the real name must not leak before trust 40");
  assert.match(html, new RegExp(reborn.player.teamId));
  assert.match(html, /教练信任 25 \/ 100/);
  const en = rebornIdentityHtml({ reborn, card, lang: "en" });
  assert.match(en, /Unnamed camp player/);
});

test("a revealed identity shows the real name", () => {
  const reborn = createRebornState("reborn-view-2", ROWS);
  reborn.identity = maybeReveal(reborn.identity, 45);
  assert.equal(reborn.identity.revealed, true);
  const card = buildPlayerCard(reborn.identity, ROWS);
  const html = rebornIdentityHtml({ reborn, card, lang: "zh" });
  assert.ok(html.includes(reborn.identity.name));
});

test("the report shows the line, the trust change, the growth, and the takeover", () => {
  const report = {
    game: 5,
    home: true,
    opp: "CHI",
    score: { home: 102, away: 98 },
    won: true,
    line: { min: 18, pts: 11, reb: 4, ast: 2 },
    trustBefore: 40,
    trustAfter: 44,
    trustDelta: 4,
    trustParts: [
      { kind: "performance", delta: 2, gameScore: 9, expected: 7 },
      { kind: "training", delta: 2 },
    ],
    roleBefore: "bench",
    roleAfter: "bench",
    growth: [{ id: "x", name: "Test", xp: 77, leveled: [{ attribute: "three", from: 50, to: 51 }] }],
    takeover: { attempted: true, made: true, zone: "three", points: 3, reason: null },
  };
  const html = rebornReportHtml({ report, lang: "zh" });
  assert.match(html, /102–98/);
  assert.match(html, /11 分/);
  assert.match(html, /信任 \+4/);
  assert.match(html, /训练：three 50 → 51/);
  assert.match(html, /三分打进/);
  const en = rebornReportHtml({ report, lang: "en" });
  assert.match(en, /made the three/);
  assert.equal(rebornReportHtml({ report: null, lang: "zh" }), "");
});
