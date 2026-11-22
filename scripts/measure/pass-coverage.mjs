/**
 * How much of the ball movement the 3D court can show: per game, the number of pass events, and the share of shots that have a pass into the
 * shooter in front of them (since the previous shot). A shot with none makes the ball appear in the shooter's hands.
 * Usage: node scripts/measure/pass-coverage.mjs [games=24]
 */
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";

const games = Number(process.argv[2]) || 24;
const MATCHUPS = [["CHI", 1996, "SEA", 1996], ["BOS", 1986, "LAL", 1986], ["GSW", 2022, "BOS", 2022], ["SAS", 2014, "MIA", 2014]];
let passes = 0, shots = 0, covered = 0, madeShots = 0, madeCovered = 0, n = 0;
const byKind = {};
for (const [h, hy, a, ay] of MATCHUPS) {
  for (let i = 0; i < games; i += 1) {
    let lastPass = null, lastShotSeq = -1;
    const sim = new GameSim({
      home: realTeam(h, hy), away: realTeam(a, ay), youSide: "home", injuries: false, speed: 3,
      rng: seededStream(hashSeed(`pc|${h}${i}`)),
      onEvent: (e) => {
        const pass = e.meta?.pass;
        if (pass) { passes += 1; byKind[pass.kind] = (byKind[pass.kind] || 0) + 1; lastPass = { ...pass, seq: e.seq }; }
        const shot = e.meta?.shot;
        if (shot && (e.type === "score" || e.type === "miss" || e.type === "dunk")) {
          shots += 1;
          const has = lastPass && lastPass.receiverId === shot.shooterId && lastPass.seq > lastShotSeq;
          if (has) covered += 1;
          if (shot.made) { madeShots += 1; if (has) madeCovered += 1; }
          lastShotSeq = e.seq;
        }
      },
      onTick() {}, onEnd() {},
    });
    sim.running = true;
    for (let steps = 0; sim.running && steps < 2000; steps += 1) {
      sim.step();
      if (sim.paused) sim.setPaused(false); // quarter-break resume, like the UI
    }
    n += 1;
  }
}
console.log(`games ${n}  passes/game ${(passes / n).toFixed(1)}  ${JSON.stringify(byKind)}`);
console.log(`shots with a pass into the shooter: ${((100 * covered) / shots).toFixed(0)}% of ${shots}   made: ${((100 * madeCovered) / madeShots).toFixed(0)}% of ${madeShots}`);
