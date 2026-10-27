/**
 * Smoke test for the big-handler dribbling tax (user complaint 2026-10-27:
 * centers who can't handle or pass should turn it over more when dribbling).
 *
 * A center/power forward who dribbles the possession up himself (no kick-out,
 * not a putback) pays (100 - pass) * 0.0004 extra turnover chance — about
 * +2.3% for a Gobert-level passer, near zero for a skilled passing big, and
 * nothing for catch-and-finish bigs.
 *
 * Like the stacking effect in packPaint.test.js, the per-possession effect is
 * below full-game noise, so this only locks the branch in (games run, team
 * turnovers stay sane) rather than proving the magnitude. The tax itself is
 * one isolated term in the tovChance sum, verified by inspection.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { GameSim } from "../js/engine/sim.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function cardFor(bref, season) {
  const row = ROWS.find((r) => r.bref === bref && r.season === season);
  if (!row) throw new Error(`no row for ${bref}:${season}`);
  return seasonToCard(row);
}

const CENTERS = [
  ["duncati01", 2003],
  ["robinda01", 1995],
  ["townska01", 2019],
  ["goberru01", 2019],
  ["parketo01", 2013],
].map(([b, s]) => cardFor(b, s));

const OPPONENT = [
  ["paulch01", 2015],
  ["greenda02", 2017],
  ["georgpa01", 2024],
  ["nowitdi01", 2010],
  ["lopezbr01", 2023],
].map(([b, s]) => cardFor(b, s));

test("a five-center team plays full games with sane turnover totals under the big-handler tax", () => {
  const coach = { id: "t", name: "T", specialTactics: ["balanced"], preferred: [], buffs: {} };
  let tov = 0;
  const games = 30;
  for (let i = 0; i < games; i++) {
    const sim = new GameSim({
      home: { players: CENTERS, starterIds: CENTERS.map((p) => p.id), coach },
      away: { players: OPPONENT, starterIds: OPPONENT.map((p) => p.id), coach },
      youSide: "home",
      injuries: false,
      speed: 3,
      onEvent: () => {},
      onTick: () => {},
      onEnd: () => {},
    });
    const snap = sim.runFast();
    for (const p of [...snap.home.onCourt, ...snap.home.bench]) tov += p.stats?.tov || 0;
  }
  const avg = tov / games;
  assert.ok(avg > 8 && avg < 30, `expected 5-center team turnovers/game in a sane band, got ${avg.toFixed(1)}`);
});
