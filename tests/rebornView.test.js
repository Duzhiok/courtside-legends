/**
 * Player Reborn — entry view. Only the pure HTML builders are testable in
 * Node (the screen wiring needs a DOM and is covered by the Mac browser QA).
 * The key pins: an unrevealed identity never leaks the real name, and the
 * report shows the line, the trust change, the growth, and the takeover.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rebornIdentityHtml, rebornReportHtml, careerTimelineHtml } from "../js/ui/reborn/rebornView.js";
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

test("the identity card shows the latest foreshadowing hint, never the name", () => {
  const reborn = createRebornState("reborn-view-1", ROWS);
  assert.equal(reborn.identity.revealed, false);
  const card = buildPlayerCard(reborn.identity, ROWS);
  const noHint = rebornIdentityHtml({ reborn, card, lang: "zh" });
  assert.ok(!noHint.includes("老队员"), "no hint below trust 28");
  const hinted = structuredClone(reborn);
  hinted.player.coachTrust = 30;
  const html = rebornIdentityHtml({ reborn: hinted, card, lang: "zh" });
  assert.match(html, /老队员/);
  assert.ok(!html.includes(reborn.identity.name), "the hint must not leak the name");
  const hinted37 = structuredClone(reborn);
  hinted37.player.coachTrust = 37;
  assert.match(rebornIdentityHtml({ reborn: hinted37, card, lang: "zh" }), /旧照片/);
});

test("careerTimelineHtml lists contract outcomes and season starts in order", () => {
  const reborn = createRebornState("reborn-view-3", ROWS);
  assert.equal(careerTimelineHtml({ reborn, lang: "zh" }), "", "no events yet, no section");
  reborn.timeline.events = [
    { year: 1997, event: "contract", outcome: "minimum", trust: 42, games: 82, avgMin: 12.3 },
    { year: 1998, event: "season_start", outcome: "minimum", trust: 42 },
    { year: 1998, event: "contract", outcome: "resign", trust: 61, games: 80, avgMin: 19.1 },
  ];
  const html = careerTimelineHtml({ reborn, lang: "zh" });
  assert.match(html, /生涯/);
  assert.match(html, /1997.*底薪留队/);
  assert.match(html, /1998.*赛季开始/);
  assert.match(html, /1998.*续约/);
  assert.ok(html.indexOf("底薪留队") < html.indexOf("续约"), "events stay in order");
  const en = careerTimelineHtml({ reborn, lang: "en" });
  assert.match(en, /Minimum deal/);
  assert.match(en, /Re-signed/);
});
