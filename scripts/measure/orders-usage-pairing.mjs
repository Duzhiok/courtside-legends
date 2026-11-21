/**
 * B76: which COMBINATION of coach orders starves (or inflates) a player's shots? Measurement only.
 * Pairs every player's simulated FGA per 36 with his own real FGA per 36 (same season), six eras, paired fixed seeds, and groups
 * the result by the recommended orders he played under (usage / aggression), then lists the worst single players.
 * Usage: node scripts/measure/orders-usage-pairing.mjs [gamesPerPair=40] [worstN=12]
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const N = Number(process.argv[2] || 40);
const WORST = Number(process.argv[3] || 12);
const PAIRS = [["BOS", "LAL", 1986], ["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022]];
const rows = new Map();
for (const [a, b, year] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const sim = new GameSim({ home: i % 2 ? realTeam(a, year) : realTeam(b, year), away: i % 2 ? realTeam(b, year) : realTeam(a, year), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`b76|${year}|${a}${b}|${i}`)) });
    sim.runFast();
    for (const p of [...sim.home.onCourt, ...sim.away.onCourt, ...sim.home.bench, ...sim.away.bench]) {
      if (!(p.stats.min > 0)) continue;
      const k = `${year}|${p.id}`;
      const r = rows.get(k) || { p, year, min: 0, fga: 0, orders: `${p.orders?.usage || "auto"}/${p.orders?.aggression || "auto"}` };
      r.min += p.stats.min; r.fga += p.stats.fga;
      rows.set(k, r);
    }
  }
}
const real36 = (r) => (r.p.raw.fga / r.p.raw.mpg) * 36;
const sim36 = (r) => (r.fga / r.min) * 36;
const used = [...rows.values()].filter((r) => r.min >= 12 * N && (r.p.raw?.mpg || 0) >= 12 && r.p.raw.fga > 0);
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
console.log(`${used.length} players, ${N * PAIRS.length} games. ratio = simulated FGA/36 over real FGA/36 (1.00 is right)`);
const groups = new Map();
for (const r of used) groups.set(r.orders, [...(groups.get(r.orders) || []), r]);
console.log("\nby orders (usage/aggression)      n   ratio  realFGA/36");
for (const [k, g] of [...groups].sort((x, y) => y[1].length - x[1].length)) {
  console.log(`${k.padEnd(28)} ${String(g.length).padStart(4)}  ${(sum(g, sim36) / sum(g, real36)).toFixed(2)}   ${(sum(g, real36) / g.length).toFixed(1)}`);
}
console.log(`\nALL ${(sum(used, sim36) / sum(used, real36)).toFixed(2)}`);
const dev = used.map((r) => ({ r, ratio: sim36(r) / real36(r) }));
console.log("\nmost STARVED (sim far below real):");
for (const { r, ratio } of [...dev].sort((x, y) => x.ratio - y.ratio).slice(0, WORST)) console.log(`  ${String(r.p.name).padEnd(22)} ${r.year} ${r.orders.padEnd(18)} sim ${sim36(r).toFixed(1)} real ${real36(r).toFixed(1)}  x${ratio.toFixed(2)}`);
console.log("most INFLATED:");
for (const { r, ratio } of [...dev].sort((x, y) => y.ratio - x.ratio).slice(0, WORST)) console.log(`  ${String(r.p.name).padEnd(22)} ${r.year} ${r.orders.padEnd(18)} sim ${sim36(r).toFixed(1)} real ${real36(r).toFixed(1)}  x${ratio.toFixed(2)}`);
