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
for (const speed of [1, 2, 3]) {
  const s = (await playThroughController({ speed, possessions, seed })).summary;
  console.log(`\n${speed}x  (${s.wallSec}s of wall time)`);
  console.log(`  shots GameSim made ${s.shotsSim} | 3D showed ${s.shotsShown} | never shown ${s.neverShown}`);
  console.log(`  3D behind the commentary: median ${s.lagMedianMs} ms, p90 ${s.lagP90Ms} ms, max ${s.lagMaxMs} ms`);
  console.log(`  commentary was already ${s.possessionsAheadMedian} possessions ahead (max ${s.possessionsAheadMax}); scoreboard ${s.scoreboardAheadMedianPts} pts ahead (max ${s.scoreboardAheadMaxPts})`);
  console.log(`  shooter is on offense in the 3D court: ${s.shooterOnOffense} | the ball was already with the shooter when his shot began: ${s.ballWithShooter}`);
  console.log(`  passes drawn ${s.passesShown} | from the player holding the ball ${s.passesFromTheHolder} | both ends on offense ${s.passesOnOffense} | possession opened with an offensive holder ${s.openingHolderOnOffense}`);
}
