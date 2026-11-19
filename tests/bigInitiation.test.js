// B74: big men finish plays more than they start them. Design goal only: over seeded real games, a team's bigs must not take
// materially more shots per 36 than they really did (before the fix 1.21x), and guards must not fall far below theirs.
import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";

const group = (pos) => (["PG", "SG"].includes(pos) ? "guard" : pos === "SF" ? "wing" : "big");

test("shot volume by position follows the real players: bigs not inflated, guards not starved", () => {
  const acc = { guard: { min: 0, fga: 0, real: 0 }, wing: { min: 0, fga: 0, real: 0 }, big: { min: 0, fga: 0, real: 0 } };
  for (const [a, b, year] of [["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["SAS", "MIA", 2014]]) {
    for (let i = 0; i < 12; i += 1) {
      const sim = new GameSim({ home: realTeam(a, year), away: realTeam(b, year), youSide: "home", injuries: false, speed: 3, rng: seededStream(`big-${year}-${i}`) });
      sim.runFast();
      for (const p of [...sim.home.roster, ...sim.away.roster]) {
        const min = p.stats?.min || 0;
        if (!(min > 0) || !((p.raw?.mpg || 0) >= 15)) continue;
        const g = acc[group(p.pos)];
        g.min += min;
        g.fga += p.stats.fga;
        g.real += (p.raw.fga / p.raw.mpg) * min;
      }
    }
  }
  const ratio = (g) => acc[g].fga / acc[g].real;
  assert.ok(ratio("big") <= 1.12, `bigs ${ratio("big").toFixed(2)}x their real shots`);
  assert.ok(ratio("guard") >= 0.85, `guards ${ratio("guard").toFixed(2)}x their real shots`);
});
