/**
 * Jersey-exchange offer frequency over REAL Reborn seasons (real engine, real rivalry ledger, starter minutes).
 * Answers: with the initial EXCHANGE_RULES, how often does a rival offer a jersey, and how soon? (Tuning baseline, not a gate.)
 *
 * Usage: node scripts/measure/jersey-offers.mjs [seeds=6]
 */
import { readFileSync } from "node:fs";
import { createRebornState } from "../../js/reborn/identity.js";
import { buildSeason, playSeason } from "../../js/reborn/season.js";
import { rivalryLedger } from "../../js/reborn/rivalry.js";
import { jerseyState } from "../../js/collectibles/jerseyExchange.js";
import { relationSummary } from "../../js/collectibles/jerseyEligibility.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const SEEDS = Number(process.argv[2]) || 6;
const takeover = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });

let seasonsWithOffer = 0;
let totalOffers = 0;
for (let s = 1; s <= SEEDS; s += 1) {
  const seed = `jersey-measure-${s}`;
  const reborn = createRebornState(seed, ROWS);
  reborn.player.coachTrust = 80; // a starter: real minutes, so meetings can happen
  const season = buildSeason(reborn, ROWS);
  const offers = [];
  const out = await playSeason(reborn, season, ROWS, {
    onTakeover: takeover,
    onGame: (r) => { for (const o of r.jersey?.offers || []) offers.push({ game: r.game, ...o }); },
  });
  const ledger = rivalryLedger(out.reborn);
  const state = jerseyState(out.reborn);
  // Where did the closest relationship of the season stop? (diagnostic: why a season with no offer had none)
  const closest = Object.values(ledger.watch).map((w) => ({ w, ...relationSummary(w) })).sort((x, y) => y.respect - x.respect)[0];
  const topLine = closest ? `closest ${closest.w.name}: ${closest.meetings} meetings, heat ${closest.w.heat}, respect ${closest.respect}` : "no one watched";
  totalOffers += offers.length;
  if (offers.length) seasonsWithOffer += 1;
  console.log(`${seed}: ${out.summary.games} games · rivals ${ledger.rivals.length} (meetings ${ledger.rivals.map((r) => r.games.length).join("/") || "-"}) · offers ${offers.length}` +
    (offers.length ? ` → ${offers.map((o) => `g${o.game} ${o.fromName} (respect ${o.respect}, ${o.reasons.join("+")})`).join("; ")}` : "") +
    ` · stored ${state.offers.length} · ${topLine}`);
}
console.log(`\n${seasonsWithOffer}/${SEEDS} seasons produced at least one offer · ${(totalOffers / SEEDS).toFixed(2)} offers per season`);
