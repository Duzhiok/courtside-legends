// How many questions does each participation mode ask per game? Real GameSim, fixed seeds, the player is a rotation guard/wing.
// Usage: node scripts/measure/participation-load.mjs [games=24]
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";
import { driveGame } from "../../js/reborn/season.js";
import { teamCoach } from "../../js/reborn/agency.js";

const N = Number(process.argv[2]) || 24;
const MATCHUPS = [["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022], ["BOS", "LAL", 1986]];
for (const mode of ["auto", "key", "high", "full"]) {
  const counts = [];
  for (let i = 0; i < N; i++) {
    const [h, a, y] = MATCHUPS[i % MATCHUPS.length];
    const sim = new GameSim({ home: realTeam(h, y), away: realTeam(a, y), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`pl|${i}`)), onEvent() {}, onTick() {}, onEnd() {} });
    const me = [...sim.home.roster].sort((x, z) => z.scoring - x.scoring)[2];
    let asked = 0;
    await driveGame(sim, me.id, {
      onTakeover: () => { asked += 1; return { choiceId: "pass" }; },
      agency: { coach: teamCoach(h, y), iq: 60, decisionId: `pl|${i}`, autonomy: 10 },
      participation: { getMode: () => mode },
    });
    counts.push(asked);
  }
  const sorted = [...counts].sort((x, z) => x - z);
  console.log(`${mode.padEnd(5)} mean ${(counts.reduce((s, v) => s + v, 0) / N).toFixed(1)}  min ${sorted[0]}  median ${sorted[N >> 1]}  max ${sorted[N - 1]}`);
}
