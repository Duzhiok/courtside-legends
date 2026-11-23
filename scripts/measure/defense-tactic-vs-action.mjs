/**
 * B25: does the defending side's TACTIC react to WHAT the offense runs (docs/implementation/b25-defense-behaviour-design.md)? Same seeds, same teams;
 * only the away side's tactic changes. Points are the HOME side's (the defense under test is the away side).
 *   node scripts/measure/defense-tactic-vs-action.mjs [games=100] [action=pnr|iso|auto|all=all] [--json=out.json] [--defs=balanced,zone_drop]
 * `auto` = the orders the engine derives itself, i.e. the league's natural mix of actions (this is what calibration is judged on).
 * `pnr` / `iso` force every home player onto that action with markOrdersManual (a bare `p.orders.action = ...` is silently re-derived).
 * Averaged over MATCHUPS so one roster does not decide the answer.
 */
import fs from "node:fs";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";
import { markOrdersManual } from "../../js/engine/gameplan.js";

const args = process.argv.slice(2);
const jsonOut = args.find((a) => a.startsWith("--json="))?.slice(7);
const [gamesArg, actionArg = "all"] = args.filter((a) => !a.startsWith("--"));
const games = Number(gamesArg || 100);
const MATCHUPS = [["CHI", 1996, "SEA", 1996], ["LAL", 2000, "POR", 2000], ["BOS", 1986, "LAL", 1986]];
const DEFENSES = (args.find((a) => a.startsWith("--defs="))?.slice(7) || "balanced,pack_paint,zone_drop,switch_all").split(",");
const ACTIONS = actionArg === "all" ? ["auto", "pnr", "iso"] : [actionArg];

function run(action, defense) {
  const t = { games: 0, pts: 0, fga: 0, fgm: 0, tpa: 0, tov: 0, ast: 0, blk: 0 };
  for (const [hc, hy, ac, ay] of MATCHUPS) {
    for (let i = 0; i < games; i += 1) {
      const home = realTeam(hc, hy);
      if (action !== "auto") for (const p of home.players) markOrdersManual(p, { action });
      const sim = new GameSim({
        home, away: realTeam(ac, ay), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`defab|${hc}|${i}`)),
        onEvent() {}, onTick() {}, onEnd() {},
      });
      sim.setTactic(defense, "away");
      sim.running = true;
      for (let steps = 0; sim.running && steps < 2000; steps += 1) { sim.step(); if (sim.paused) sim.setPaused(false); }
      const sum = (side, k) => sim[side].roster.reduce((n, p) => n + (p.stats[k] || 0), 0);
      t.games += 1; t.pts += sim.score.home; t.fga += sum("home", "fga"); t.fgm += sum("home", "fgm"); t.tpa += sum("home", "tpa");
      t.tov += sum("home", "tov"); t.ast += sum("home", "ast"); t.blk += sum("away", "blk");
    }
  }
  return t;
}

const out = {};
console.log(`${MATCHUPS.map((m) => m.join(" ")).join(" | ")} — ${games} games per matchup per cell (home offense vs the away tactic)`);
console.log("action".padEnd(7), "away tactic".padEnd(12), "pts".padStart(6), "fg%".padStart(6), "3pa".padStart(6), "ast".padStart(6), "tov".padStart(6), "blk".padStart(6));
for (const action of ACTIONS) {
  let base = null;
  for (const defense of DEFENSES) {
    const t = run(action, defense); const g = t.games;
    base ??= t.pts / g;
    out[`${action}|${defense}`] = { pts: t.pts / g, fg: (100 * t.fgm) / t.fga, tpa: t.tpa / g, ast: t.ast / g, tov: t.tov / g, blk: t.blk / g };
    console.log(action.padEnd(7), defense.padEnd(12), (t.pts / g).toFixed(1).padStart(6), ((100 * t.fgm) / t.fga).toFixed(1).padStart(6), (t.tpa / g).toFixed(1).padStart(6),
      (t.ast / g).toFixed(1).padStart(6), (t.tov / g).toFixed(1).padStart(6), (t.blk / g).toFixed(1).padStart(6), `  Δpts vs balanced ${((t.pts / g) - base).toFixed(1)}`);
  }
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
