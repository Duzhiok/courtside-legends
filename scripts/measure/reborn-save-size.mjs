// Real Player Reborn save size (cloud-save sizing, DB3.1 follow-up). Plays whole regular seasons through the real engine
// (buildSeason / playGame / rolloverSeason) and measures the JSON the cloud slot would carry: the reborn state alone and the
// full root as writeRootSave stores it. Compare with the server's 4,000,000-character cap (SQL) and the 5 MB local budget.
// Usage: node scripts/measure/reborn-save-size.mjs [seasons=4] [gamesPerSeason=82] [seed=size-1]
import { readFileSync } from "node:fs";
import { buildSeason, playGame } from "../../js/reborn/season.js";
import { createRebornState } from "../../js/reborn/identity.js";
import { rolloverSeason } from "../../js/reborn/contract.js";
import { createRootState, exportRootSave } from "../../js/data/saveRoot.js";

const SEASONS = Number(process.argv[2]) || 4;
const GAMES = Number(process.argv[3]) || 82;
const SEED = process.argv[4] || "size-1";
const CLOUD_CAP = 4_000_000;
const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const takeover = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });
const kb = (n) => `${(n / 1024).toFixed(0)} KiB`;
const sizes = (reborn) => {
  const r = JSON.stringify(reborn).length;
  const root = exportRootSave(createRootState({ reborn })).length;
  return { reborn: r, root };
};

let reborn = createRebornState(SEED, ROWS);
const rows = [];
for (let s = 1; s <= SEASONS; s += 1) {
  let season = buildSeason(reborn, ROWS);
  season = { ...season, games: season.games.slice(0, GAMES) };
  for (let g = 0; g < season.games.length; g += 1) {
    const out = await playGame(reborn, season, ROWS, { onTakeover: takeover });
    if (!out) break;
    reborn = out.reborn;
    season = { ...season, index: season.index + 1 };
  }
  const end = sizes(reborn);
  rows.push({ season: s, year: season.year, log: reborn.player.seasonLog?.length ?? 0, ...end });
  console.log(`season ${s} (${season.year}): log ${rows.at(-1).log} games | reborn ${end.reborn.toLocaleString()} u (${kb(end.reborn)}) | root ${end.root.toLocaleString()} u (${kb(end.root)}) = ${((end.root / CLOUD_CAP) * 100).toFixed(1)}% of the cloud cap`);
  reborn = rolloverSeason(reborn, { year: season.year, players: ROWS }).reborn;
}
const last = rows.at(-1);
const perSeason = rows.length > 1 ? Math.round((last.root - rows[0].root) / (rows.length - 1)) : last.root;
console.log(`growth ~${perSeason.toLocaleString()} u per season -> ~${Math.floor((CLOUD_CAP - last.root) / Math.max(perSeason, 1))} more seasons before the 4,000,000 cap`);
