/**
 * Legend Duel D3.2 — bobblehead sprites (presentation only).
 * Pins: sprite structure + team colours, the action-state mapping from
 * takeover/DuelSim state, the appearance fallback, the team passthrough
 * in cardToDuelist, and — the load-bearing one — that this slice changed
 * NO DuelSim outcome (makeProb is pinned to its pre-D3.2 values).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { duelSpriteHtml, spriteActionFor, spriteAppearance, SPRITE_ACTIONS, DEFAULT_SKIN, DEFAULT_HAIR } from "../js/ui/duelSprites.js";
import { makeProb } from "../js/duel/duelSim.js";
import { cardToDuelist, legendDuelists } from "../js/duel/duelStore.js";
import { avatarToDuelist } from "../js/duel/duelAvatar.js";
import { PLAYERS, seasonToCard } from "../js/data/players.js";

// Node has no browser roster load (PLAYERS starts empty — see
// tests/helpers/sampleRoster.js), so seed it with the one real row this
// file needs: Jordan 1991, the legend the QA script challenges. That
// makes legendDuelists() resolve the real gallery -> card -> duelist
// chain, including the team the sprite reads for the jersey.
const _rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const _jordanRow = _rows.find((r) => r.bref === "jordami01" && r.season === 1991);
if (_jordanRow) PLAYERS.push(seasonToCard(_jordanRow));

const JORDAN = legendDuelists().find((d) => d.bref === "jordami01" && d.season === 1991);
const SHOOTER = { shooting: 85, finishing: 80, handles: 78, defense: 70, strength: 75, speed: 80, stamina: 90, skills: [] };
const DEFENDER = { shooting: 70, finishing: 70, handles: 70, defense: 85, strength: 80, speed: 75, stamina: 90, skills: [] };

test("the seeded roster resolves Jordan 1991 as a CHI duelist", () => {
  assert.ok(JORDAN, "legendDuelists resolves Jordan 1991 from the seeded row");
  assert.equal(JORDAN.team, "CHI", "the gallery -> card -> duelist chain carries the team");
});

test("sprite is a bobblehead SVG: viewBox, action class, team jersey", () => {
  const svg = duelSpriteHtml(JORDAN, { action: "idle" });
  assert.match(svg, /<svg[^>]*viewBox="0 0 48 64"/);
  assert.match(svg, /class="duel-sprite duel-sprite--idle"/);
  assert.match(svg, /data-action="idle"/);
  // Chicago red jersey (teamColors CHI) + a big head + a headband in the
  // secondary colour; no invented jersey number anywhere.
  assert.ok(svg.includes("#CE1141"), "jersey uses the team primary");
  assert.ok(svg.includes('cx="24" cy="15" r="12"'), "big head circle");
  assert.ok(svg.includes('y="11.5"'), "headband across the forehead");
  assert.doesNotMatch(svg, />\d{1,2}</, "no jersey number is rendered");
});

test("every action renders its own pose class", () => {
  for (const action of SPRITE_ACTIONS) {
    const svg = duelSpriteHtml(JORDAN, { action });
    assert.match(svg, new RegExp(`duel-sprite--${action}`), action);
    assert.match(svg, new RegExp(`data-action="${action}"`), action);
  }
  // Unknown action falls back to idle, never to a broken pose.
  assert.match(duelSpriteHtml(JORDAN, { action: "cartwheel" }), /duel-sprite--idle/);
});

test("team colours: legend team, unknown team, and no team at all", () => {
  assert.ok(duelSpriteHtml(JORDAN).includes("#CE1141"));
  assert.ok(duelSpriteHtml({ name: "Nobody", team: "ZZZ" }).includes("#1A3A2A"), "unknown team -> neutral");
  assert.ok(duelSpriteHtml({ name: "Nobody" }).includes("#1A3A2A"), "no team -> neutral");
  assert.ok(duelSpriteHtml(null).includes("#1A3A2A"), "no duelist at all -> neutral generic figure");
  // The avatar profile has no team: it renders in the neutral palette.
  const avatar = avatarToDuelist({ body: "standard", height: 1.0 });
  assert.equal(avatar.team, undefined);
  assert.ok(duelSpriteHtml(avatar).includes("#1A3A2A"));
});

test("cardToDuelist carries the roster team through (identity passthrough)", () => {
  const duelist = cardToDuelist({ id: "x", name: "Test", bref: "testx01", season: 2020, team: "BOS", overall: 80, three: 80, mid: 80, paint: 80, pass: 80, iq: 80, speed: 80, strength: 80, defense: 80, stamina: 80 });
  assert.equal(duelist.team, "BOS");
  assert.equal(cardToDuelist({ id: "y", name: "NoTeam", bref: "y", season: 2020 }).team, null);
});

test("appearance override: optional input wins, anything missing falls back", () => {
  const ap = spriteAppearance(JORDAN, { appearance: { skin: "#f0c8a0", hair: "#111111", jersey: { primary: "#123456", secondary: "#abcdef" } } });
  assert.deepEqual(ap, { primary: "#123456", secondary: "#abcdef", skin: "#f0c8a0", hair: "#111111" });
  const partial = spriteAppearance(JORDAN, { appearance: { skin: "#f0c8a0" } });
  assert.equal(partial.skin, "#f0c8a0");
  assert.equal(partial.primary, "#CE1141", "jersey still comes from the team");
  assert.equal(partial.hair, DEFAULT_HAIR);
  // Invalid colours never reach the SVG.
  const bad = spriteAppearance(JORDAN, { appearance: { skin: "red", jersey: { primary: "not-a-colour" } } });
  assert.equal(bad.skin, DEFAULT_SKIN);
  assert.equal(bad.primary, "#CE1141");
  const svg = duelSpriteHtml(JORDAN, { appearance: { skin: "#f0c8a0" } });
  assert.ok(svg.includes("#f0c8a0"));
  assert.ok(!svg.includes("red"));
});

const takeover = ({ ball = { x: 50, y: 32 }, defender = { x: 50, y: 20 }, lastShot = null } = {}) => ({ ball, defender, lastShot });

test("action mapping: dribbling for the ball-handler, idle for a far defender", () => {
  assert.equal(spriteActionFor({ takeover: takeover(), myBall: true, side: "a" }), "dribbling");
  assert.equal(spriteActionFor({ takeover: takeover(), myBall: true, side: "b" }), "idle");
  assert.equal(spriteActionFor({ takeover: takeover(), myBall: false, side: "b" }), "dribbling");
  assert.equal(spriteActionFor({ takeover: takeover(), myBall: false, side: "a" }), "idle");
});

test("action mapping: contesting only when the defender is within 6 units (D3.1 threshold)", () => {
  const tight = takeover({ defender: { x: 50, y: 30 } }); // 2 units from the ball
  assert.equal(spriteActionFor({ takeover: tight, myBall: true, side: "b" }), "contesting");
  const edge = takeover({ defender: { x: 50, y: 26 } }); // exactly 6 units: not contesting
  assert.equal(spriteActionFor({ takeover: edge, myBall: true, side: "b" }), "idle");
  const far = takeover({ defender: { x: 50, y: 20 } }); // 12 units away
  assert.equal(spriteActionFor({ takeover: far, myBall: true, side: "b" }), "idle");
});

test("action mapping: shooting beats everything while the shot flashes; the other side watches", () => {
  const shot = takeover({ lastShot: { shooter: "a", offense: "outside", made: true } });
  assert.equal(spriteActionFor({ takeover: shot, myBall: true, side: "a", shotActive: true, moving: true }), "shooting");
  assert.equal(spriteActionFor({ takeover: shot, myBall: true, side: "b", shotActive: true }), "idle");
  // The same lastShot without the flash window is just a live possession.
  assert.equal(spriteActionFor({ takeover: shot, myBall: true, side: "a", shotActive: false }), "dribbling");
  const legendShot = takeover({ lastShot: { shooter: "b", offense: "drive", made: false } });
  assert.equal(spriteActionFor({ takeover: legendShot, myBall: false, side: "b", shotActive: true }), "shooting");
});

test("action mapping: moving only while the controlled player just moved", () => {
  assert.equal(spriteActionFor({ takeover: takeover(), myBall: true, side: "a", moving: true }), "moving");
  assert.equal(spriteActionFor({ takeover: takeover(), myBall: true, side: "a", moving: false }), "dribbling");
  assert.equal(spriteActionFor({ takeover: takeover(), myBall: true, side: "b", moving: true }), "moving", "the view only passes moving for the controlled marker; the function honours the flag as given");
});

test("action mapping: no takeover state at all is idle, never a crash", () => {
  assert.equal(spriteActionFor({ takeover: null, myBall: true, side: "a" }), "idle");
  assert.equal(spriteActionFor({ takeover: {}, myBall: true, side: "a" }), "idle");
  assert.equal(spriteActionFor({ takeover: takeover(), myBall: true, side: "a", moving: true, shotActive: true }), "idle", "shotActive without a lastShot is a defensive idle — the view never produces it (its shotActive requires a lastShot)");
});

test("no outcome changes: makeProb is pinned to its pre-D3.2 values", () => {
  // D3.2 is presentation only — it never touches duelSim.js. These pins
  // (computed from the shipped makeProb) fail if any rule changes.
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);
  close(makeProb(SHOOTER, DEFENDER, "outside", "balanced", { difficulty: "pro", stamina: 90 }), 0.37748079999999995);
  close(makeProb(SHOOTER, DEFENDER, "drive", "balanced", { difficulty: "pro", stamina: 90 }), 0.4690032);
  close(makeProb(SHOOTER, DEFENDER, "outside", "perimeter", { difficulty: "legend", shooterIsLegend: true, stamina: 100 }), 0.3543999999999999);
  // And spacing still applies on top, unchanged (D3.1 contract): the term
  // sits INSIDE the stamina scaling, so +0.03 at stamina 90 adds
  // 0.03 x 0.982 = 0.02946, not a flat 0.03.
  close(makeProb(SHOOTER, DEFENDER, "outside", "balanced", { difficulty: "pro", stamina: 90, spacing: 0.03 }), 0.4069408);
});
