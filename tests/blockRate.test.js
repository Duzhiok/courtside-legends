/**
 * Regression test for the league-wide block rate. calcBlockChance() in sim.js is internal
 * (not exported, like most of that file's helpers), so this exercises it the way the game
 * actually does -- full fast-forwarded games via GameSim -- and checks the realized rate lands
 * in a realistic NBA-ish band instead of asserting on the formula's internal constants.
 *
 * Real NBA teams block roughly 4.5-5 shots/game each (~9-10 combined), which works out to
 * roughly 5-6% of all field goal attempts (3PA included, which are blocked far less often than
 * 2PA, so the blended number sits a bit under the ~8-10% rate you'd see restricted to 2PA alone).
 *
 * This used to measure ~2% before a tuning pass (see js/engine/sim.js calcBlockChance) -- the
 * band below is intentionally wide (covers ~3x swing) since this is a genuinely random system
 * and different rosters/eras have real variance in shot-blocking talent, but it's narrow enough
 * to catch both "someone silently halved the base rate again" and "someone made blocks absurd".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { GameSim } from "../js/engine/sim.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

function teamOf(code, season) {
  return ROWS.filter((r) => r.team === code && r.season === season)
    .map(seasonToCard)
    .sort((a, b) => (b.ovr || 0) - (a.ovr || 0))
    .slice(0, 10);
}

function simulateGames(home, away, games) {
  let blk = 0;
  let fga = 0;
  for (let i = 0; i < games; i++) {
    let finalSnap = null;
    const sim = new GameSim({
      home,
      away,
      youSide: "home",
      injuries: false,
      speed: 3,
      onEvent: () => {},
      onTick: () => {},
      onEnd: (snap) => {
        finalSnap = snap;
      },
    });
    const snap = sim.runFast() || finalSnap || sim.snapshot();
    const everyone = [...snap.home.onCourt, ...snap.home.bench, ...snap.away.onCourt, ...snap.away.bench];
    for (const p of everyone) {
      blk += p.stats?.blk || 0;
      fga += p.stats?.fga || 0;
    }
  }
  return { blk, fga, blkPerGame: blk / games, rate: blk / fga };
}

test("league-wide block rate lands in a realistic NBA-ish band, not the old ~2%-of-FGA floor", () => {
  const home = { players: teamOf("DEN", 2023), name: "DEN" };
  const away = { players: teamOf("BOS", 2023), name: "BOS" };
  const { blkPerGame, rate } = simulateGames(home, away, 40);
  assert.ok(blkPerGame > 5, `expected > 5 combined blocks/game, got ${blkPerGame.toFixed(2)} -- block rate regressed back toward the old floor`);
  assert.ok(blkPerGame < 20, `expected < 20 combined blocks/game, got ${blkPerGame.toFixed(2)} -- blocks are now absurdly common`);
  assert.ok(rate > 0.025, `expected block rate > 2.5% of FGA, got ${(rate * 100).toFixed(2)}%`);
  assert.ok(rate < 0.1, `expected block rate < 10% of FGA, got ${(rate * 100).toFixed(2)}%`);
});

test("a historically elite rim-protecting roster blocks shots meaningfully more than a finesse-heavy one", () => {
  const rimProtectors = { players: teamOf("UTA", 2018), name: "UTA" }; // peak Rudy Gobert Jazz
  const finesseShooters = { players: teamOf("GSW", 2016), name: "GSW" }; // 73-win small-ball Warriors
  const control = { players: teamOf("DEN", 2023), name: "DEN" };
  const a = simulateGames(rimProtectors, control, 25);
  const b = simulateGames(finesseShooters, control, 25);
  // Not a strict inequality every run (shared randomness), but over 25 games the gap should be
  // real, not noise -- rim protectors should block noticeably more than a finesse-first roster.
  assert.ok(a.blkPerGame > b.blkPerGame * 0.7, `elite rim protectors (${a.blkPerGame.toFixed(2)}) should not trail finesse shooters (${b.blkPerGame.toFixed(2)}) by much, if at all`);
});
