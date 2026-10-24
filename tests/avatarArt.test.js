import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avatarDataUri, avatarSvg, contrastRatio, headOverlay, initialsOf, inkOn } from "../js/data/avatarArt.js";
import { NEUTRAL_COLORS, NEUTRAL_TEAMS, TEAM_COLORS, teamColors } from "../js/data/teamColors.js";

const ROSTER = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const ROSTER_TEAMS = [...new Set(ROSTER.map((row) => row.team))];

test("initials: first + last word, suffixes dropped, one-word names use two letters", () => {
  assert.equal(initialsOf("Jeremy Lamb"), "JL");
  assert.equal(initialsOf("Karl-Anthony Towns"), "KT");
  assert.equal(initialsOf("Michael Porter Jr."), "MP");
  assert.equal(initialsOf("Gary Payton II"), "GP");
  assert.equal(initialsOf("Nene"), "NE");
  assert.equal(initialsOf("姚明"), "姚明");
  assert.equal(initialsOf(""), "?");
  assert.equal(initialsOf(undefined), "?");
});

test("every roster team code either has colours or is deliberately neutral", () => {
  assert.ok(ROSTER_TEAMS.length >= 60, `expected ~64 team codes, got ${ROSTER_TEAMS.length}`);
  const unaccounted = ROSTER_TEAMS.filter((code) => !TEAM_COLORS[code] && !NEUTRAL_TEAMS.includes(code));
  assert.deepEqual(unaccounted, [], "add these codes to teamColors.js (or to NEUTRAL_TEAMS)");
  assert.deepEqual(NEUTRAL_TEAMS.filter((code) => TEAM_COLORS[code]), [], "a team cannot be both coloured and neutral");
  for (const code of [...NEUTRAL_TEAMS, "???", undefined]) assert.deepEqual(teamColors(code), NEUTRAL_COLORS, String(code));
});

test("every palette is valid hex and its initials are readable (WCAG AA, 4.5:1) on the jersey", () => {
  for (const [code, { primary, secondary }] of [...Object.entries(TEAM_COLORS), ["neutral", NEUTRAL_COLORS]]) {
    for (const colour of [primary, secondary]) assert.match(colour, /^#[0-9A-Fa-f]{6}$/, `${code} ${colour}`);
    const ratio = contrastRatio(inkOn(secondary), secondary);
    assert.ok(ratio >= 4.5, `${code}: initials on ${secondary} only ${ratio.toFixed(2)}:1`);
  }
});

test("the avatar is deterministic and fetches nothing", () => {
  const player = { name: "Jeremy Lamb", team: "CHO", season: 2019 };
  assert.equal(avatarSvg(player), avatarSvg({ ...player }));
  const svg = avatarSvg(player);
  const urls = svg.match(/https?:\/\/[^"'\s)]+/g) || [];
  assert.deepEqual(urls, ["http://www.w3.org/2000/svg"], "only the SVG namespace, no external references");
  assert.doesNotMatch(svg, /<image|<script|href=/);
  assert.match(avatarDataUri(player), /^data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(decodeURIComponent(avatarDataUri(player).split(",").slice(1).join(",")), svg);
});

test("it depicts nobody: two different players on one team differ ONLY in the initials", () => {
  const strip = (svg) => svg.replace(/<text[^>]*>.*?<\/text>/, "<text/>");
  const jordan = avatarSvg({ name: "Michael Jordan", team: "CHI", season: 1991 });
  const pippen = avatarSvg({ name: "Scottie Pippen", team: "CHI", season: 1993 });
  assert.notEqual(jordan, pippen);
  assert.equal(strip(jordan), strip(pippen));
});

test("a different team changes the colours; a hostile name cannot inject markup", () => {
  const lakers = avatarSvg({ name: "A B", team: "LAL" });
  const celtics = avatarSvg({ name: "A B", team: "BOS" });
  assert.match(lakers, /#552583/);
  assert.match(celtics, /#007A33/);
  const hostile = avatarSvg({ name: '<script>alert(1)</script> "x"', team: "LAL" });
  assert.doesNotMatch(hostile, /<script/);
  assert.equal((hostile.match(/<svg/g) || []).length, 1);
});

test("the head stays visible on every team's colours (it vanished on navy and black when it was fixed dark)", () => {
  const deepOf = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * 0.55).toString(16).padStart(2, "0")).join("")}`;
  };
  for (const [code, { primary }] of [...Object.entries(TEAM_COLORS), ["neutral", NEUTRAL_COLORS]]) {
    const { ratio } = headOverlay(primary, deepOf(primary));
    assert.ok(ratio >= 1.5, `${code}: head only ${ratio.toFixed(2)}:1 against its background`);
  }
  assert.equal(headOverlay("#0E2240", "#081322").fill, "#FFFFFF", "navy gets a light head");
  assert.equal(headOverlay("#CE1141", "#5C0A1D").fill, "#000000", "red gets a dark head");
});

test("CJK initials use a smaller font so two characters stay inside a circular crop", () => {
  const size = (svg) => Number(svg.match(/font-size="(\d+)"/)[1]);
  assert.ok(size(avatarSvg({ name: "姚明", team: "HOU" })) < size(avatarSvg({ name: "Yao Ming", team: "HOU" })));
});
