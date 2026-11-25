// B47 (hosted league) economy sketch: how much gold a hosted day could pay next to what the Training Center
// can burn. Pure arithmetic over the real constants -- no GameSim, no randomness.
// Ranked pays 40 (win) / 12 (loss): js/data/account.js. Taper table: ADR-008 §4 (Q3, modified 2026-11-06).
// Usage: node scripts/measure/b47-hosted-gold.mjs
import { DURATIONS } from "../../js/data/trainingRules.js";

const RANKED = { win: 40, loss: 12 };
const TAPER = [{ games: 5, gold: 1, xp: 1 }, { games: 5, gold: 0.5, xp: 0.5 }, { games: 10, gold: 0, xp: 0.25 }];
const perGame = (winRate) => winRate * RANKED.win + (1 - winRate) * RANKED.loss;
const day = (winRate, base = perGame) => TAPER.reduce((sum, t) => sum + t.games * t.gold * base(winRate), 0);
const xpUnits = TAPER.reduce((sum, t) => sum + t.games * t.xp, 0);

console.log(`ranked-priced hosted game, expected gold: ${[0.3, 0.5, 0.7].map((w) => `${w * 100}% win = ${perGame(w).toFixed(1)}`).join(" · ")}`);
console.log(`hosted day (taper 5/5/10): ${[0.3, 0.5, 0.7].map((w) => `${w * 100}% win = ¤${day(w).toFixed(0)}`).join(" · ")}`);
console.log(`taper XP units per day: ${xpUnits} of 20 (${(100 * xpUnits / 20).toFixed(0)}% of a full-XP day)`);
console.log(`weekly cap 25 rewarded games: at most ${25} x ranked pay, ie ¤${(25 * perGame(0.5)).toFixed(0)} at 50% win before taper`);
console.log("\nTraining Center burn per slot-day (2 slots):");
for (const [id, d] of Object.entries(DURATIONS)) {
  const perDay = d.cost / (d.ms / 86400000);
  console.log(`  ${id.padEnd(8)} ¤${String(d.cost).padStart(4)} / ${(d.ms / 3600000).toFixed(0).padStart(3)}h  = ¤${perDay.toFixed(0).padStart(4)} per slot-day, ¤${(perDay * 2).toFixed(0)} for 2 slots`);
}
const fullDay = DURATIONS.fullDay.cost * 2;
console.log(`\nhosted 50% win-rate day covers ${(100 * day(0.5) / fullDay).toFixed(0)}% of two full-day camps (¤${fullDay}).`);
