// Skills M2: how many real signature-move uses does a Reborn season produce? Plays a whole season per identity on the real Reborn flow
// (no asks: the autopilot fires the equipped move), with an awakened dream_shake, and reads the engine's own per-game counts
// (report.line.zones.sig). Used to set the proficiency XP thresholds from data, not feel.
// Usage: node scripts/measure/proficiency-pace.mjs [seed ...]   (default: 8 seeds whose identity has a paint gate)
import { readFileSync } from "node:fs";
import { createRebornState } from "../../js/reborn/identity.js";
import { buildSeason, playSeason } from "../../js/reborn/season.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const seeds = process.argv.slice(2).map(Number);
const rows = [];
for (const s of seeds) {
  let reborn = createRebornState(`reach-${s}`, ROWS);
  reborn = { ...reborn, player: { ...reborn.player, awakening: { version: 1, season: 1997, form: [], ready: [], awakened: [{ skillId: "dream_shake", source: "awakened", game: 1, season: 1997, evidence: {} }] } } };
  const lines = [];
  await playSeason(reborn, buildSeason(reborn, ROWS), ROWS, { onGame: (r) => lines.push(r.line) });
  const sig = lines.map((l) => l.zones?.sig?.dream_shake || { u: 0, m: 0 });
  rows.push({ seed: s, games: lines.length, played: lines.filter((l) => (l.min || 0) >= 8).length, uses: sig.map((x) => x.u), makes: sig.map((x) => x.m) });
}
console.log(`ROWS ${JSON.stringify(rows)}`);
