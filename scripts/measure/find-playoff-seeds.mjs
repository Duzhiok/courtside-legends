/**
 * Fixed-seed playoff tests (rebornHonors / rebornTitleExchange) need a real run of a particular kind: a title, a title without a minute
 * for the player, a Finals loss. Which seeds give one moves whenever GameSim is recalibrated (a title is ~1 run in 40). This scans seeds in
 * parallel shards and prints the kinds, so re-picking is one command instead of an afternoon.
 * Usage: node scripts/measure/find-playoff-seeds.mjs <prefix> <from> <to> [shards=4]   (e.g. tx 1 240)
 */
import { fork } from "node:child_process";
import { advanceLeague } from "../../js/reborn/league.js";
import { nextUserGame } from "../../js/reborn/playoffs.js";
import { enterPlayoffs, playPlayoffGame } from "../../js/reborn/playoffFlow.js";
import { ROWS, coin, fakeUserLog, run, userAlways } from "../../tests/helpers/rebornLeagueFixtures.js";

const [prefix = "tx", from = "1", to = "40", shards = "4"] = process.argv.slice(2);

async function classify(seed) {
  let reborn = run(seed, 1997);
  reborn.player.coachTrust = 80;
  fakeUserLog(reborn, 1997, userAlways(reborn, true));
  advanceLeague(reborn, ROWS, { year: 1997, simulate: coin });
  reborn = await enterPlayoffs(reborn, ROWS, { year: 1997 });
  let report = null;
  while (nextUserGame(reborn.playoffs)) {
    const out = await playPlayoffGame(reborn, ROWS, {});
    reborn = out.reborn;
    if (out.report.isChampionship) report = out.report;
  }
  if (reborn.playoffs.status === "champion") return report?.line?.min > 0 ? "title" : "title-dnp";
  return (reborn.honors || []).some((h) => h.id.startsWith("finalist")) ? "finals-loss" : "out-earlier";
}

if (process.send) {
  process.on("message", async ({ seeds }) => {
    for (const seed of seeds) process.send({ seed, kind: await classify(seed) });
    process.exit(0);
  });
} else {
  const all = [];
  for (let i = Number(from); i <= Number(to); i += 1) all.push(`${prefix}-${i}`);
  const n = Number(shards);
  const found = {};
  let live = n;
  for (let k = 0; k < n; k += 1) {
    const child = fork(new URL(import.meta.url));
    child.send({ seeds: all.filter((_, i) => i % n === k) });
    child.on("message", ({ seed, kind }) => { (found[kind] ||= []).push(seed); });
    child.on("exit", () => { if (--live === 0) for (const [kind, seeds] of Object.entries(found)) console.log(kind.padEnd(12), seeds.sort((a, b) => Number(a.split("-").pop()) - Number(b.split("-").pop())).join(" ")); });
  }
}
