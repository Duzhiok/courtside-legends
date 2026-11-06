import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { seasonToCard, overall, PLAYERS } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { seededStream } from "../js/core/seededRandom.js";
import {
  createSeason,
  buildCpuTeamForYear,
  simScheduledGame,
  computeAwards,
} from "../js/engine/season.js";
import { historicalSeason } from "../js/data/historicalSeasons.js";

// B40: playerSeason rows used to be built from slim() snapshot players (no age, no
// three/mid/paint/iq/clutch), so every row had age null and an ovr 10-17 low, and ROY
// could never fire. Rows must now take age/ovr from the live team card.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROWS = JSON.parse(readFileSync(join(HERE, "../js/data/roster.json"), "utf8")).players;
buildCareerSpanIndex(ROWS);

function installYear(year) {
  if (!PLAYERS.some((p) => p.season === year)) {
    PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
  }
}

/** Run `fn` with Math.random replaced by a fixed stream (the sim reads Math.random). */
function withSeed(seed, fn) {
  const real = Math.random;
  Math.random = seededStream(seed);
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

/** A real historical season (same setup as scripts/sim/b35-season-stats.mjs). */
function historicalSeasonState(year, seed = 1) {
  installYear(year);
  const hist = historicalSeason(year);
  const teamMeta = hist.teams[0];
  const userTeam = buildCpuTeamForYear(year, teamMeta, new Set());
  return createSeason({
    userTeamId: teamMeta.id,
    userTeamName: teamMeta.name,
    userTeam,
    mode: "historical",
    year,
    seed,
  });
}

/** Sim games until every team in `teamIds` has played `games` regular-season games. */
function simTeamGames(st, teamIds, games) {
  const played = Object.fromEntries(teamIds.map((id) => [id, 0]));
  outer: for (const night of st.schedule) {
    for (const g of night) {
      if (g.played) continue;
      if (!teamIds.includes(g.homeId) && !teamIds.includes(g.awayId)) continue;
      simScheduledGame(st, g);
      for (const id of [g.homeId, g.awayId]) if (id in played) played[id] += 1;
      if (teamIds.every((id) => played[id] >= games)) break outer;
    }
  }
  return played;
}

test("playerSeason rows take age and ovr from the live team card", () => {
  withSeed(1, () => {
    const st = historicalSeasonState(1991, 1);
    for (const g of st.schedule[0]) simScheduledGame(st, g);
    const rows = Object.values(st.playerSeason);
    assert.ok(rows.length > 200, `a night of games creates rows (got ${rows.length})`);
    assert.ok(rows.some((r) => r.age != null), "rows carry real ages");
    for (const row of rows) {
      const live = st.teams[row.teamId].players.find((c) => c.id === row.playerId);
      assert.ok(live, `${row.name} has a live card`);
      assert.equal(row.age ?? null, live.age ?? null, `${row.name}: age from the live card`);
      assert.equal(row.ovr, overall(live), `${row.name}: ovr from the live card`);
    }
    // The old code wrote overall(slimmed) instead: prove the fix changes values.
    const slimmed = new Map();
    for (const g of st.schedule[0]) {
      const snap = g._lastSnap;
      if (!snap) continue;
      for (const sideKey of ["home", "away"]) {
        for (const p of snap[sideKey].roster || []) slimmed.set(p.id, p);
      }
    }
    const differs = rows.filter(
      (r) => slimmed.has(r.playerId) && r.ovr !== overall(slimmed.get(r.playerId)),
    );
    assert.ok(differs.length > 0, "live ovr differs from the slimmed snapshot ovr (the old bug)");
  });
});

const stats = (pts, reb, ast, gp = 70) => ({
  gp,
  gs: gp,
  min: gp * 30,
  pts: pts * gp,
  reb: reb * gp,
  ast: ast * gp,
  stl: gp,
  blk: gp,
  tov: 2 * gp,
});

function fabricatedSt(year, rows) {
  const teams = {};
  const standings = {};
  for (const r of rows) {
    teams[r.teamId] = { name: r.teamId };
    standings[r.teamId] = { w: 41, l: 41 };
  }
  return {
    userTeamId: rows[0].teamId,
    teams,
    standings,
    playerSeason: Object.fromEntries(rows.map((r) => [`${r.teamId}:${r.playerId}`, r])),
  };
}

test("ROY goes to a 21-year-old, not to the best veteran", () => {
  const st = fabricatedSt(1991, [
    { playerId: "rook", name: "Rook", teamId: "SAS", pos: "C", season: 1991, age: 21, ovr: 80, stats: stats(22, 10, 2) },
    { playerId: "vet", name: "Vet", teamId: "LAL", pos: "SF", season: 1991, age: 30, ovr: 88, stats: stats(28, 8, 5) },
  ]);
  const awards = computeAwards(st);
  assert.equal(awards.roy?.playerId, "rook", "the age gate beats raw production");
});

test("ROY in 2016 is not a 2012 draftee even when he has the best line", () => {
  const st = fabricatedSt(2016, [
    { playerId: "greendr01", name: "Draymond Green", teamId: "GSW", pos: "PF", season: 2016, age: 26, ovr: 85, stats: stats(20, 10, 8) },
    { playerId: "townska01", name: "Karl-Anthony Towns", teamId: "MIN", pos: "C", season: 2016, age: 21, ovr: 82, stats: stats(18, 10, 2) },
  ]);
  const awards = computeAwards(st);
  assert.equal(awards.roy?.playerId, "townska01", "age 26 is not a rookie, however good the line");
});

test("old-save rows without age still read: ROY falls back to the pre-2015 rule", () => {
  // No `age` key at all, as after a JSON round-trip of a pre-fix save.
  const st = fabricatedSt(2016, [
    { playerId: "old", name: "Old Save", teamId: "GSW", pos: "PF", season: 2016, ovr: 78, stats: stats(16, 7, 3) },
  ]);
  const awards = computeAwards(st);
  assert.equal(awards.roy?.playerId, "old", "age-less rows keep the old fallback");
});

test("a simulated 1991 season crowns a ROY and 2016 does not crown Draymond Green", () => {
  withSeed(1, () => {
    const st91 = historicalSeasonState(1991, 1);
    simTeamGames(st91, ["SAS", "GSW"], 50);
    const roy91 = computeAwards(st91).roy;
    assert.ok(roy91, "1991 has a ROY");
    const row91 = Object.values(st91.playerSeason).find((r) => r.playerId === roy91.playerId);
    assert.ok(row91 && row91.age != null && row91.age <= 22, "1991 ROY is 22 or younger");

    const st16 = historicalSeasonState(2016, 1);
    simTeamGames(st16, ["MIN", "GSW"], 50);
    const roy16 = computeAwards(st16).roy;
    assert.ok(roy16, "2016 has a ROY");
    assert.notEqual(roy16.name, "Draymond Green", "2016 ROY is not the 2012 draftee");
  });
});
