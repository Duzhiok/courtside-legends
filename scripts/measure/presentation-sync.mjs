// Match-presentation synchronization audit: how far behind the GameSim stream is the 3D court, which shots does it never show,
// and does the 3D court agree with GameSim about who is shooting and who has the ball?
//
// It runs the REAL live wiring on a fake clock (tests/helpers/presentationHarness.js, the same rig tests/presentationSync.test.js
// guards): GameSim.step() resolves a whole possession and emits all its events at once (the feed and scoreboard paint right
// then), then waits sim.possessionDelay() (1x 1.1-3.6 s, 2x 300 ms, 3x 85 ms); the 3D side plays them on its own clock.
//
//   node scripts/measure/presentation-sync.mjs [possessions=60] [seed=sync-1]
import { playThroughController } from "../../tests/helpers/presentationHarness.js";

const possessions = Number(process.argv[2]) || 60;
const seed = process.argv[3] || "sync-1";
console.log(`possessions=${possessions} seed=${seed} (CHI vs SEA 1996, real GameSim + real match3dController, fake clock)`);
const row = (label, r) => `  ${label.padEnd(9)} feed vs shot start: median ${r.feedAfterShotStartMedianMs} / p90 ${r.feedAfterShotStartP90Ms} / max ${r.feedAfterShotStartMaxMs} ms | feed BEFORE the shot: ${r.feedBeforeShotStart}/${r.shownWithEventId} | scoreboard spoiled ${r.scoreboardSpoilerMs} ms, behind max ${r.scoreboardBehindMaxMs} ms | gate peak ${r.gatePendingPeak}, stuck ${r.gateStuck}`;
for (const speed of [1, 2, 3]) {
  const before = (await playThroughController({ speed, possessions, seed, gated: false })).summary;
  const s = (await playThroughController({ speed, possessions, seed })).summary;
  console.log(`\n${speed}x  (${s.wallSec}s of wall time)`);
  console.log(row("before S3", before));
  console.log(row("with S3", s));
  console.log(`  shots GameSim made ${s.shotsSim} | 3D showed ${s.shotsShown} | never shown ${s.neverShown} | 3D behind GameSim: median ${s.lagMedianMs} ms, p90 ${s.lagP90Ms} ms, max ${s.lagMaxMs} ms`);
  console.log(`  ball owner: shooter had the ball ${s.ballWithShooter} (mismatches ${s.ballOwnerMismatches}) | shooter on offense ${s.shooterOnOffense} | passes ${s.passesShown}, from the holder ${s.passesFromTheHolder}`);
}
