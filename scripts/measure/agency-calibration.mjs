// Player Agency calibration: same fixed-seed clutch states, three policies, real GameSim.
// Prints per-policy mean trust/autonomy delta, verdict mix and how often the "clearly better" band is hit.
// Usage: node scripts/measure/agency-calibration.mjs [seeds=120]
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";
import { realTeam } from "../../tests/helpers/realGame.js";
import { driveGame } from "../../js/reborn/season.js";
import { teamCoach, gradeTakeover } from "../../js/reborn/agency.js";

const N = Number(process.argv[2]) || 120;
const MATCHUPS = [["CHI", "SEA", 1996], ["LAL", "PHI", 2001], ["BOS", "LAL", 2008], ["SAS", "MIA", 2014], ["GSW", "BOS", 2022], ["BOS", "LAL", 1986]];
const best = (ctx) => Object.entries(ctx.values).sort((a, b) => b[1] - a[1])[0][0];
const POLICIES = {
  obedient: (c) => (c.options.includes("follow") ? "follow" : "pass"),
  reader: (c) => best(c),
  reckless: () => "pullup",
};
const rows = Object.fromEntries(Object.keys(POLICIES).map((k) => [k, []]));
let spreads = [];
for (let i = 0; i < N; i++) {
  const [h, a, y] = MATCHUPS[i % MATCHUPS.length];
  for (const [name, pick] of Object.entries(POLICIES)) {
    const sim = new GameSim({ home: realTeam(h, y), away: realTeam(a, y), youSide: "home", injuries: false, speed: 3, rng: seededStream(hashSeed(`cal|${i}`)), onEvent() {}, onTick() {}, onEnd() {} });
    const rnd = seededStream(hashSeed(`state|${i}`));
    Object.assign(sim, { quarter: 4, clock: 70 + Math.floor(rnd() * 40), possession: "home" });
    sim.score.home = 90; sim.score.away = 90 + Math.floor(rnd() * 5) - 1;
    const me = [...sim.home.onCourt].sort((x, z) => z.scoring - x.scoring)[1 + Math.floor(rnd() * 3)];
    let ctxSeen = null;
    const out = await driveGame(sim, me.id, {
      onTakeover: ({ context }) => { ctxSeen = context; return { choiceId: pick(context) }; },
      agency: { coach: teamCoach(h, y), iq: 50 + Math.floor(rnd() * 40), decisionId: `cal|${i}` },
    });
    if (!ctxSeen || !out.takeover) continue;
    const g = gradeTakeover(out.takeover, out.takeover.attempted !== undefined ? { attempted: out.takeover.attempted, made: out.takeover.made, points: out.takeover.points, reason: out.takeover.reason } : null);
    if (!g) continue;
    rows[name].push(g);
    if (name === "obedient") spreads.push(Math.max(...Object.values(ctxSeen.values)) - Math.min(...Object.values(ctxSeen.values)));
  }
}
const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
for (const [name, gs] of Object.entries(rows)) {
  const mix = {};
  for (const g of gs) mix[g.verdict] = (mix[g.verdict] || 0) + 1;
  console.log(`${name.padEnd(9)} n=${String(gs.length).padStart(3)} trust ${mean(gs.map((g) => g.trustDelta)).toFixed(2)} autonomy ${mean(gs.map((g) => g.autonomyDelta)).toFixed(2)} quality ${mean(gs.map((g) => g.quality)).toFixed(2)} good(q>.3) ${(gs.filter((g) => g.quality > 0.3).length / (gs.length || 1) * 100).toFixed(0)}% poor(q<-.3) ${(gs.filter((g) => g.quality < -0.3).length / (gs.length || 1) * 100).toFixed(0)}%`);
  console.log("   ", JSON.stringify(mix));
}
console.log(`EV spread across options: mean ${mean(spreads).toFixed(2)} pts/poss`);
