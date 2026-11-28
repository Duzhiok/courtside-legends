// Skills M1a: can a real Reborn player earn the three moves? Plays a whole season per identity on the real Reborn flow
// (createRebornState + buildSeason + playSeason, no asks) and reads what awakened.
// Cost: ~25 s per season, so it runs in parallel shards and only simulates identities that have a chance (the ones whose rating gate is
// met at the start, plus every 4th identity as a random control); the rest cannot earn anything by definition (the gate is checked at
// the moment the move would fire, but ratings only grow slowly, so this is a lower bound for the others and says so).
// Usage: node scripts/measure/awakening-reach.mjs [identities=200] [shards=cpus-1]
//   (internal) node scripts/measure/awakening-reach.mjs <identities> <shardIndex> <shards>   -> prints one RESULT line
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { createRebornState, buildPlayerCard } from "../../js/reborn/identity.js";
import { buildSeason, playSeason } from "../../js/reborn/season.js";
import { ZONE_MOVES } from "../../js/career/player/signatureAwakening.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const ids = Object.keys(ZONE_MOVES);
const N = Number(process.argv[2]) || 200;

async function shard(index, shards) {
  const out = { identities: 0, simulated: 0, games: 0, played: 0, gatedAtStart: Object.fromEntries(ids.map((i) => [i, 0])), earned: Object.fromEntries(ids.map((i) => [i, 0])), earnedGated: Object.fromEntries(ids.map((i) => [i, 0])), anyEarned: 0, anyGatedSim: 0, anyGatedEarned: 0 };
  for (let s = index; s < N; s += shards) {
    const reborn = createRebornState(`reach-${s}`, ROWS);
    const card = buildPlayerCard(reborn.identity, ROWS, { growth: reborn.player.growth });
    const gated = ids.filter((i) => ZONE_MOVES[i].gate(card));
    out.identities += 1;
    for (const i of gated) out.gatedAtStart[i] += 1;
    if (!gated.length && s % 4 !== 0) continue;
    const run = await playSeason(reborn, buildSeason(reborn, ROWS), ROWS, {});
    out.simulated += 1;
    const log = run.reborn.player.seasonLog || [];
    out.games += log.length;
    out.played += log.filter((g) => (g.min || 0) >= 8).length;
    const got = (run.reborn.player.awakening?.awakened || []).map((a) => a.skillId).filter((i) => ids.includes(i));
    for (const i of got) { out.earned[i] += 1; if (gated.includes(i)) out.earnedGated[i] += 1; }
    if (got.length) out.anyEarned += 1;
    if (gated.length) { out.anyGatedSim += 1; if (got.length) out.anyGatedEarned += 1; }
  }
  console.log(`RESULT ${JSON.stringify(out)}`);
}

async function main() {
  const shards = Number(process.argv[3]) || Math.max(1, cpus().length - 1);
  const results = await Promise.all(Array.from({ length: shards }, (_, i) => new Promise((resolve) => {
    let buf = "";
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), String(N), String(i), String(shards)], { stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.on("data", (d) => { buf += d; });
    child.on("close", () => resolve(JSON.parse(buf.split("RESULT ")[1])));
  })));
  const sum = (f) => results.reduce((t, r) => t + f(r), 0);
  const sumMap = (k) => Object.fromEntries(ids.map((i) => [i, sum((r) => r[k][i])]));
  const total = sum((r) => r.identities);
  const gated = sumMap("gatedAtStart");
  const earned = sumMap("earned");
  const earnedGated = sumMap("earnedGated");
  console.log(`${total} identities; simulated ${sum((r) => r.simulated)} full seasons (${sum((r) => r.games)} games, ${sum((r) => r.played)} with >= 8 min = ${(100 * sum((r) => r.played) / sum((r) => r.games)).toFixed(0)}%)`);
  for (const i of ids) console.log(`  ${i.padEnd(12)} rating gate met at the start by ${(100 * gated[i] / total).toFixed(1)}% of identities (${gated[i]}); earned in season 1 by ${earned[i]} (${earnedGated[i]} of them gated at the start) -> ${gated[i] ? (100 * earnedGated[i] / gated[i]).toFixed(0) : "-"}% of the gated ones`);
  console.log(`  at least one move earned in season 1: ${sum((r) => r.anyEarned)} identities; of the ${sum((r) => r.anyGatedSim)} gated ones, ${sum((r) => r.anyGatedEarned)} (${(100 * sum((r) => r.anyGatedEarned) / Math.max(1, sum((r) => r.anyGatedSim))).toFixed(0)}%)`);
}

if (process.argv[4]) await shard(Number(process.argv[3]), Number(process.argv[4]));
else await main();
