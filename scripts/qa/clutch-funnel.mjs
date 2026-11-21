// Story "clutch" reachability: where do the games drop out of the funnel?  (fixed seeds, real GameSim, starter trust, always-take hook)
//   window opened -> takeover accepted -> the player got a shot up -> final margin <= 3 -> a direct matchup exists
//   -> that matchup is not yet a rival -> (2nd+ meeting with him) -> clutch rivalry forms
// Usage: node scripts/qa/clutch-funnel.mjs [seeds=2]
import { readFileSync } from "node:fs";
import { createRebornState } from "../../js/reborn/identity.js";
import { buildSeason, playSeason } from "../../js/reborn/season.js";
import { directMatchup } from "../../js/reborn/rivalry.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const N = Number(process.argv[2]) || 2;
const alwaysTake = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });
const total = { played: 0, accepted: 0, shot: 0, shotClose: 0, withMatchup: 0, clutchBeat: 0, formedClutch: 0 };
for (let s = 0; s < N; s += 1) {
  const reborn = createRebornState(`career2-qa-${[1, 4, 5, 7, 8, 9][s] ?? s + 1}`, ROWS);
  reborn.player.coachTrust = 80;
  const perGame = [];
  const out = await playSeason(reborn, buildSeason(reborn, ROWS), ROWS, { onTakeover: alwaysTake, onGame: (r) => perGame.push(r) });
  const seen = {};
  for (const r of perGame) {
    if ((r.line?.min || 0) <= 0) continue;
    total.played += 1;
    const opp = directMatchup(r);
    if (opp) seen[opp.bref] = (seen[opp.bref] || 0) + 1;
    if (r.takeover) total.accepted += 1;
    if (r.takeover?.attempted) total.shot += 1;
    if (r.takeover?.attempted && Math.abs(r.margin ?? 99) <= 3) {
      total.shotClose += 1;
      if (opp) { total.withMatchup += 1; if (seen[opp.bref] >= 2) total.clutchBeat += 1; }
    }
  }
  total.formedClutch += out.reborn.rivalries?.rivals?.filter((x) => x.reason === "clutch").length || 0;
  console.log(`seed ${s + 1}: played ${perGame.filter((r) => (r.line?.min || 0) > 0).length}`, JSON.stringify(total));
}
console.log("FUNNEL", JSON.stringify(total));
