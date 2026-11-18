/**
 * Who steals from whom, who blocks whom, and are the events counted once? Measurement only (reads GameSim's own onEvent stream and the box score).
 *
 * Runs full games between real team-seasons with fixed seeds and reports:
 *   1. Conservation: steal events == sum of players' stl, block events == sum of blk, every steal is also exactly one turnover (stl <= tov), every
 *      block is also exactly one missed FGA. A duplicate-accounting bug would break these.
 *   2. The steal matrix: ball handler position group x defender position group (shares of all steals), and the steal share of each defender group
 *      against the same share in the REAL league (roster.json, same eras).
 *   3. The block share by defender group against the real share.
 *
 * Usage: node scripts/measure/defense-event-matrix.mjs [gamesPerPair=40]
 */
import { readFileSync } from "node:fs";
import { realTeam } from "../../tests/helpers/realGame.js";
import { GameSim } from "../../js/engine/sim.js";
import { hashSeed, seededStream } from "../../js/core/seededRandom.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const N = Number(process.argv[2] || 40);
const PAIRS = [[["GSW", 2016], ["CLE", 2016]], [["CHI", 1996], ["LAL", 2001]], [["SAS", 2014], ["MIA", 2013]], [["DAL", 2011], ["BOS", 2008]], [["HOU", 1995], ["SEA", 1996]]];
const ERAS = [1995, 1996, 2001, 2008, 2011, 2013, 2014, 2016];
const GROUP = (pos) => (["PG", "SG"].includes(pos) ? "guard" : pos === "SF" ? "wing" : ["PF", "C"].includes(pos) ? "big" : "other");
const GROUPS = ["guard", "wing", "big"];
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : "-");

const matrix = Object.fromEntries(GROUPS.map((b) => [b, Object.fromEntries(GROUPS.map((d) => [d, 0]))]));
const blockBy = { guard: 0, wing: 0, big: 0 };
let games = 0, stlEvents = 0, blkEvents = 0, stlStat = 0, blkStat = 0, tov = 0, fga = 0, fgm = 0;

for (const [a, b] of PAIRS) {
  for (let i = 0; i < N; i += 1) {
    const events = [];
    const sim = new GameSim({ home: realTeam(...a), away: realTeam(...b), youSide: "home", injuries: false, speed: 3, lang: "en", rng: seededStream(hashSeed(`dm|${a[0]}|${i}`)) });
    // runFast() is what the Season mode runs. It mutes the onEvent callback (emit() returns early), so listen on emit itself and leave the simulation untouched.
    sim.emit = (type, text, meta) => { if (meta) events.push({ meta }); };
    sim.runFast();
    games += 1;
    const players = [...(sim.home.onCourt || []), ...(sim.away.onCourt || []), ...(sim.home.bench || []), ...(sim.away.bench || [])];
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const p of byId.values()) {
      stlStat += p.stats.stl; blkStat += p.stats.blk; tov += p.stats.tov; fga += p.stats.fga; fgm += p.stats.fgm;
    }
    for (const e of events) {
      const m = e.meta;
      if (m?.turnover?.kind === "steal") {
        stlEvents += 1;
        const d = byId.get(m.actorId); const ball = byId.get(m.turnover.actorId);
        if (d && ball) matrix[GROUP(ball.pos)][GROUP(d.pos)] += 1;
      }
      if (m?.block) {
        blkEvents += 1;
        const d = byId.get(m.actorId);
        if (d) blockBy[GROUP(d.pos)] += 1;
      }
    }
  }
}

console.log(`\n=== ${games} fixed-seed full games (${PAIRS.length} real matchups x ${N}) ===`);
console.log(`per team-game: steals ${(stlStat / games / 2).toFixed(2)}  blocks ${(blkStat / games / 2).toFixed(2)}  turnovers ${(tov / games / 2).toFixed(2)}  FGA ${(fga / games / 2).toFixed(1)}`);
console.log("\n--- 1. Conservation (a double count would break these) ---");
console.log(`steal events ${stlEvents} vs sum of players' stl ${stlStat}  -> ${stlEvents === stlStat ? "EQUAL" : "DIFFERENT"}`);
console.log(`block events ${blkEvents} vs sum of players' blk ${blkStat}  -> ${blkEvents === blkStat ? "EQUAL" : "DIFFERENT"}`);
console.log(`steals as a share of all turnovers: ${pct(stlStat, tov)}  (real NBA is about 50-56%)   steals never exceed turnovers: ${stlStat <= tov ? "yes" : "NO"}`);
console.log(`blocks as a share of all field-goal attempts: ${pct(blkStat, fga)}  (real NBA about 5-6%; missed FGA ${fga - fgm}, blocks never exceed misses: ${blkStat <= fga - fgm ? "yes" : "NO"})`);

console.log("\n--- 2. Steal matrix: ball handler (rows) x defender who got the steal (columns), share of ALL steals ---");
console.log("handler \\ stealer | " + GROUPS.join(" | ") + " | row total");
for (const bg of GROUPS) {
  const row = GROUPS.map((dg) => matrix[bg][dg]);
  console.log(`${bg.padEnd(17)} | ` + row.map((n) => pct(n, stlEvents).padStart(5)).join(" | ") + ` | ${pct(row.reduce((x, y) => x + y, 0), stlEvents)}`);
}
const simShare = Object.fromEntries(GROUPS.map((dg) => [dg, GROUPS.reduce((n, bg) => n + matrix[bg][dg], 0) / Math.max(1, stlEvents)]));
const realBy = (key) => {
  const t = { guard: 0, wing: 0, big: 0 }; let all = 0;
  for (const r of ROWS) {
    if (!ERAS.includes(r.season)) continue;
    const g = GROUP(r.pos);
    if (!(g in t)) continue;
    const v = (r[key] || 0) * (r.gp || 0); t[g] += v; all += v;
  }
  return Object.fromEntries(GROUPS.map((g) => [g, t[g] / Math.max(1, all)]));
};
const realStl = realBy("spg"); const realBlk = realBy("bpg");
console.log("\nstealer group      | sim share | real share (same eras, whole league)");
for (const g of GROUPS) console.log(`${g.padEnd(18)} | ${(simShare[g] * 100).toFixed(0).padStart(8)}% | ${(realStl[g] * 100).toFixed(0).padStart(8)}%`);
const bigHandlerShare = GROUPS.reduce((n, dg) => n + matrix.big[dg], 0) / Math.max(1, stlEvents);
console.log(`\nsteals taken FROM a big-man ball handler: ${(bigHandlerShare * 100).toFixed(0)}% of all steals; by a big against a big: ${pct(matrix.big.big, stlEvents)}`);

console.log("\n--- 3. Blocks by the blocker's position group ---");
console.log("blocker group      | sim share | real share");
for (const g of GROUPS) console.log(`${g.padEnd(18)} | ${pct(blockBy[g], blkEvents).padStart(8)} | ${(realBlk[g] * 100).toFixed(0).padStart(8)}%`);
