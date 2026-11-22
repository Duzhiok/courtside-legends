/**
 * B25 baseline: does the defending side's TACTIC react to WHAT the offense runs? Same seeds, same teams; the home side's every player
 * runs one action ("pnr" or "iso"), and ONLY the away side's tactic changes. A real "switch everything" or "drop coverage" should hurt a
 * pick and roll more than an isolation; today the tactic is a flat multiplier, so the two columns should move together.
 *   node scripts/measure/defense-tactic-vs-action.mjs [games=60] [homeCode=CHI] [homeYear=1996] [awayCode=SEA] [awayYear=1996]
 */
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";
import { markOrdersManual } from "../../js/engine/gameplan.js";

const [games = 60, hc = "CHI", hy = 1996, ac = "SEA", ay = 1996] = process.argv.slice(2).map((v, i) => (i === 0 || i === 2 || i === 4 ? Number(v) : v));
const DEFENSES = ["balanced", "pack_paint", "zone_drop", "switch_all"];
const ACTIONS = ["pnr", "iso"];

function run(action, defense) {
  const t = { games: 0, pts: 0, fga: 0, fgm: 0, tpa: 0, tov: 0, ast: 0, blk: 0 };
  for (let i = 0; i < games; i += 1) {
    const home = realTeam(hc, hy);
    for (const p of home.players) markOrdersManual(p, { action }); // without the manual flag the engine re-derives the orders and ignores this
    const away = realTeam(ac, ay);
    const sim = new GameSim({
      home, away, youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`defab|${i}`)),
      onEvent() {}, onTick() {}, onEnd() {},
    });
    sim.setTactic(defense, "away");
    sim.running = true;
    for (let steps = 0; sim.running && steps < 2000; steps += 1) { sim.step(); if (sim.paused) sim.setPaused(false); }
    const sum = (side, k) => sim[side].roster.reduce((n, p) => n + (p.stats[k] || 0), 0);
    t.games += 1; t.pts += sim.score.home; t.fga += sum("home", "fga"); t.fgm += sum("home", "fgm"); t.tpa += sum("home", "tpa");
    t.tov += sum("home", "tov"); t.ast += sum("home", "ast"); t.blk += sum("away", "blk");
  }
  return t;
}

console.log(`${hc} ${hy} (offense: everyone on one action) vs ${ac} ${ay} (defense tactic varies), ${games} games per cell`);
console.log("action".padEnd(7), "away tactic".padEnd(12), "pts".padStart(6), "fg%".padStart(6), "3pa".padStart(6), "ast".padStart(6), "tov".padStart(6), "blk".padStart(6));
const base = {};
for (const action of ACTIONS) {
  for (const defense of DEFENSES) {
    const t = run(action, defense); const g = t.games;
    base[action] ??= t.pts / g;
    console.log(action.padEnd(7), defense.padEnd(12), (t.pts / g).toFixed(1).padStart(6), ((100 * t.fgm) / t.fga).toFixed(1).padStart(6), (t.tpa / g).toFixed(1).padStart(6),
      (t.ast / g).toFixed(1).padStart(6), (t.tov / g).toFixed(1).padStart(6), (t.blk / g).toFixed(1).padStart(6), `  Δpts vs balanced ${((t.pts / g) - base[action]).toFixed(1)}`);
  }
}
