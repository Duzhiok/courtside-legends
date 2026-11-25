// B47 finding 4: what win rate does an auto-managed squad actually get? Real GameSim, fixed seeds.
// The squad = 5 starters (one per position) + 5 bench, all drawn from one card-OVR band (what a collection of
// that strength looks like); the opponent = a real historical team (1990-2023). The home side is "hosted":
// no coach orders, no live decisions -- the same as an offline match.
// Usage: node scripts/measure/b47-hosted-winrate.mjs [gamesPerBand=120]
import { readFileSync } from "node:fs";
import { overall, seasonToCard } from "../../js/data/players.js";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream } from "../../js/core/seededRandom.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const N = Number(process.argv[2] || 120);
const withCards = (rows) => rows.map((r) => seasonToCard(r));
const eligible = withCards(ROWS.filter((r) => r.gp >= 40 && r.mpg >= 20)).map((c) => ({ c, o: overall(c) }));
const GROUPS = { PG: ["PG"], SG: ["SG"], SF: ["SF"], PF: ["PF"], C: ["C"] };
const rng = (seed) => seededStream(seed);

function squad(lo, hi, seed) {
  const r = rng(seed);
  const pick = (pred) => {
    const pool = eligible.filter((e) => e.o >= lo && e.o <= hi && pred(e.c));
    return pool[Math.floor(r() * pool.length)]?.c;
  };
  const used = new Set();
  const take = (pred) => { for (let i = 0; i < 40; i++) { const c = pick(pred); if (c && !used.has(c.bref)) { used.add(c.bref); return c; } } return null; };
  const starters = Object.keys(GROUPS).map((pos) => take((c) => c.pos === pos));
  const bench = Array.from({ length: 5 }, () => take(() => true));
  const all = [...starters, ...bench].filter(Boolean);
  return all.length === 10 ? { players: all, starterIds: starters.map((c) => c.id) } : null;
}
const opponents = [];
for (let season = 1990; season <= 2023; season += 1) {
  for (const code of new Set(ROWS.filter((x) => x.season === season).map((x) => x.team))) {
    const players = withCards(ROWS.filter((x) => x.team === code && x.season === season)).sort((a, b) => overall(b) - overall(a)).slice(0, 10);
    if (players.length >= 9) opponents.push({ code, season, players, starterIds: players.slice(0, 5).map((c) => c.id) });
  }
}

const avgOvr = (players) => players.reduce((n, c) => n + overall(c), 0) / players.length;
console.log(`${opponents.length} real opponent team-seasons; mean OVR of their top 10: ${(opponents.reduce((n, t) => n + avgOvr(t.players), 0) / opponents.length).toFixed(1)}`);
console.log("band (card OVR)   squad avg   win rate   avg margin   games");
for (const [lo, hi] of [[60, 69], [70, 77], [78, 84], [85, 95]]) {
  let wins = 0, margin = 0, games = 0, ovr = 0;
  for (let i = 0; i < N; i++) {
    const mine = squad(lo, hi, 9000 + i);
    if (!mine) continue;
    const opp = opponents[Math.floor(rng(5000 + i)() * opponents.length)];
    const real = Math.random; Math.random = seededStream(1000 + i);
    try {
      const sim = new GameSim({ home: { ...mine, coach: null }, away: { players: opp.players, starterIds: opp.starterIds, coach: null }, youSide: "home", injuries: false, speed: 3, onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
      const snap = sim.runFast();
      const d = snap.score.home - snap.score.away;
      wins += d > 0 ? 1 : 0; margin += d; games += 1; ovr += avgOvr(mine.players);
    } finally { Math.random = real; }
  }
  console.log(`${`${lo}-${hi}`.padEnd(16)}  ${(ovr / games).toFixed(1).padStart(8)}   ${`${(100 * wins / games).toFixed(0)}%`.padStart(8)}   ${(margin / games).toFixed(1).padStart(10)}   ${games}`);
}
