// B23 (single source): fixed-seed replay hash. Run before and after moving a hard-coded tactic bonus (crash ORB +0.025,
// paint x1.12, twin_towers paint/three) into the tactic data: the printed hash must be identical. Usage: node scripts/sim/b23-orb-equivalence.mjs [games=60]
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { seasonToCard } from "../../js/data/players.js";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const card = ([b, s]) => seasonToCard(ROWS.find((r) => r.bref === b && r.season === s));
const CENTERS = [["duncati01", 2003], ["robinda01", 1995], ["townska01", 2019], ["goberru01", 2019], ["parketo01", 2013]].map(card);
const MIX = [["paulch01", 2015], ["greenda02", 2017], ["georgpa01", 2024], ["duncati01", 2003], ["lopezbr01", 2023]].map(card);
const coach = (t) => ({ id: `t-${t}`, name: "T", specialTactics: [t], preferred: [], buffs: {} });
const games = Number(process.argv[2] || 60);
const hash = createHash("sha256");
let orb = 0;
for (const tactic of ["crash_boards", "second_chance", "twin_towers", "balanced"]) {
  for (const roster of [CENTERS, MIX]) {
    for (let i = 0; i < games; i++) {
      const real = Math.random; Math.random = seededStream(1000 + i);
      try {
        const sim = new GameSim({
          home: { players: MIX, starterIds: MIX.map((p) => p.id), coach: coach("balanced") },
          away: { players: roster, starterIds: roster.map((p) => p.id), coach: coach(tactic) },
          youSide: "home", injuries: false, speed: 3, onEvent: () => {}, onTick: () => {}, onEnd: () => {},
        });
        const snap = sim.runFast();
        const stats = [...snap.away.onCourt, ...snap.away.bench].map((p) => [p.id, p.stats]);
        orb += stats.reduce((n, [, s]) => n + (s?.oreb || 0), 0);
        hash.update(JSON.stringify([snap.score, stats]));
      } finally { Math.random = real; }
    }
  }
}
console.log(`games ${games * 8}, away offensive rebounds ${orb}, replay hash ${hash.digest("hex").slice(0, 16)}`);
