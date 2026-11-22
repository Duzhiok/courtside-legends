/**
 * Pick-and-roll roles A/B (docs/implementation/tactics-pnr-roles-design.md §5). Same seeds, same teams, every player on the "pnr" action,
 * and ONLY team.gameplan.pnr differs. Reports what the engine does with each plan; it assumes no answer.
 *   node scripts/measure/pnr-roles-ab.mjs [games=24] [homeCode=CHI] [homeYear=1996] [awayCode=SEA] [awayYear=1996] [screenerBref=longllu01]
 */
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";
import { markOrdersManual } from "../../js/engine/gameplan.js";

const [games = 24, hc = "CHI", hy = 1996, ac = "SEA", ay = 1996, screenerBref = "longllu01"] = process.argv.slice(2).map((v, i) => (i === 0 || i === 2 || i === 4 ? Number(v) : v));

const PLANS = {
  "none (today)": null,
  "roll": { afterScreen: "roll" },
  "pop": { afterScreen: "pop" },
  "slip": { afterScreen: "slip" },
  "ghost": { afterScreen: "ghost" },
  "finish mid": { finish: "mid" },
  "finish drive": { finish: "drive" },
  "finish fake_kick": { finish: "fake_kick" },
};

function run(plan) {
  const total = { games: 0, pts: 0, fga: 0, fgm: 0, ast: 0, kicksToScreener: 0, screenerFga: 0, screenerPts: 0, screenerGrade: 0 };
  for (let i = 0; i < games; i += 1) {
    const home = realTeam(hc, hy);
    const screener = home.players.find((p) => p.bref === screenerBref);
    if (!screener) throw new Error(`no ${screenerBref} on ${hc} ${hy}: ${home.players.map((p) => p.bref).join(", ")}`);
    for (const p of home.players) markOrdersManual(p, { action: "pnr" }); // without the manual flag the engine re-derives the orders
    home.gameplan = { ...(home.gameplan || {}), ...(plan ? { pnr: { screenerId: screener.id, ...plan } } : {}) };
    let kicks = 0;
    const sim = new GameSim({
      home, away: realTeam(ac, ay), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`pnrab|${i}`)),
      onEvent: (e) => { if (e.meta?.pass && e.meta.pass.kind !== "assist" && e.meta.pass.receiverId === screener.id) kicks += 1; },
      onTick() {}, onEnd() {},
    });
    // Step the game (runFast is quiet and emits no events).
    sim.running = true;
    for (let steps = 0; sim.running && steps < 2000; steps += 1) {
      sim.step();
      if (sim.paused) sim.setPaused(false);
    }
    const row = [...sim.home.onCourt, ...sim.home.bench].find((p) => p.id === screener.id);
    const sum = (k) => sim.home.roster.reduce((n, p) => n + (p.stats[k] || 0), 0);
    total.games += 1; total.pts += sim.score.home; total.fga += sum("fga"); total.fgm += sum("fgm"); total.ast += sum("ast");
    total.kicksToScreener += kicks; total.screenerFga += row.stats.fga || 0; total.screenerPts += row.stats.pts || 0; total.screenerGrade += row.gradeScore || 0;
  }
  return total;
}

console.log(`${hc} ${hy} vs ${ac} ${ay}, ${games} games per plan, screener ${screenerBref}`);
console.log("plan".padEnd(18), "pts".padStart(6), "fg%".padStart(6), "ast".padStart(6), "kicks->S".padStart(9), "S fga".padStart(7), "S pts".padStart(7), "S grade".padStart(8));
for (const [name, plan] of Object.entries(PLANS)) {
  const t = run(plan);
  const g = t.games;
  console.log(name.padEnd(18), (t.pts / g).toFixed(1).padStart(6), ((100 * t.fgm) / t.fga).toFixed(1).padStart(6), (t.ast / g).toFixed(1).padStart(6),
    (t.kicksToScreener / g).toFixed(2).padStart(9), (t.screenerFga / g).toFixed(1).padStart(7), (t.screenerPts / g).toFixed(1).padStart(7), (t.screenerGrade / g).toFixed(1).padStart(8));
}
