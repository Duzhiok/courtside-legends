// Fixed-seed evaluation of Reborn career fragments over full 82-game seasons (real playGame, real GameSim).
// Usage: node scripts/qa/reborn-fragments-season.mjs [trust=25|80] [seeds...]
import { readFileSync } from "node:fs";
import { buildSeason, playGame, REBORN_GAMES_PER_WEEK } from "../../js/reborn/season.js";
import { createRebornState } from "../../js/reborn/identity.js";
import { chooseFocus } from "../../js/reborn/training.js";
import { INTENSIVE_COST, buyIntensive, earnFromGame, fragmentLedger, intensiveBlocker } from "../../js/reborn/fragments.js";
import { validateReborn } from "../../js/data/saveRoot.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const trust = Number(process.argv[2] || 25);
const seeds = process.argv.slice(3).length ? process.argv.slice(3) : ["frag-s1", "frag-s2", "frag-s3"];
const sum = (a) => a.reduce((n, x) => n + x, 0);
const total = { games: 0, earned: 0, dist: [0, 0, 0], standout: 0, rival: 0, buys: 0, dupPaid: 0, over2: 0, xpPlain: [], xpBoost: [], weeklyDouble: 0, maxBal: 0, rivalGames: 0, rivalWins: 0, played: 0, gameIdDupes: 0 };

for (const seed of seeds) {
  let reborn = createRebornState(seed, ROWS);
  reborn.player.coachTrust = trust;
  if (process.env.FRAG_START) reborn.player.fragments = { balance: Number(process.env.FRAG_START), intensiveWeek: null, history: [] }; // QA: skip the earning grind to exercise spending
  const season = buildSeason(reborn, ROWS);
  const seen = new Set();
  let boughtWeeks = new Set();
  const perSeed = { earned: 0, buys: 0, first: null };
  for (let g = 0; g < season.games.length; g++) {
    const week = Math.floor(season.index / REBORN_GAMES_PER_WEEK) + 1;
    if (reborn.player.training?.week !== week) reborn = chooseFocus(reborn, "shooting", week);
    if (!intensiveBlocker(reborn, week)) {
      reborn = buyIntensive(reborn, week); total.buys++; perSeed.buys++;
      if (boughtWeeks.has(week)) total.weeklyDouble++;
      boughtWeeks.add(week);
      try { buyIntensive(reborn, week); total.weeklyDouble++; } catch { /* expected: weekly limit */ }
    }
    const out = await playGame(reborn, season, ROWS, {});
    if (!out) break;
    const r = out.report;
    total.games++;
    if (seen.has(r.gameId)) total.gameIdDupes++;
    seen.add(r.gameId);
    const e = r.fragments.earned;
    total.earned += e; perSeed.earned += e; total.dist[e]++;
    if (e > 2) total.over2++;
    if (r.fragments.reasons.includes("standout")) total.standout++;
    if (r.fragments.reasons.includes("rivalry-win")) total.rival++;
    if (e && perSeed.first === null) perSeed.first = r.game;
    // idempotency: replaying this very game's evidence must pay nothing
    const replay = earnFromGame(fragmentLedger(out.reborn), { gameId: r.gameId, min: r.line.min, gameScore: r.gameScore, role: r.roleBefore, rivalryWon: r.fragments.reasons.includes("rivalry-win") }); // same evidence the game really had
    if (replay.earned) total.dupPaid++;
    const xp = sum((r.growth || []).map((x) => x.xp || 0));
    if (r.line.min > 0) (r.intensive ? total.xpBoost : total.xpPlain).push(xp);
    if (r.line.min > 0) total.played++;
    total.maxBal = Math.max(total.maxBal, r.fragments.balance);
    reborn = out.reborn;
  }
  const rivals = Object.keys(reborn.rivalries?.rivals || reborn.rivalries || {}).length;
  const valid = validateReborn(reborn);
  console.log(`${seed} trust=${trust}: first fragment at game ${perSeed.first ?? "never"}, earned ${perSeed.earned}, intensive buys ${perSeed.buys}, final balance ${fragmentLedger(reborn).balance}, rivalry entries ${rivals}, save valid ${valid === true || valid?.ok === true || valid == null ? "yes" : JSON.stringify(valid).slice(0, 80)}`);
}
const avg = (a) => (a.length ? (sum(a) / a.length).toFixed(1) : "n/a");
console.log("---- totals over", seeds.length, "seasons,", total.games, "games (", total.played, "with minutes )");
console.log(`fragments earned ${total.earned} (${(total.earned / seeds.length).toFixed(1)}/season, ${(total.earned / total.games).toFixed(3)}/game); per-game dist 0:${total.dist[0]} 1:${total.dist[1]} 2:${total.dist[2]}; >2: ${total.over2}`);
console.log(`reasons: standout ${total.standout}, rivalry-win ${total.rival}; max balance held ${total.maxBal}; purchases ${total.buys} (cost ${INTENSIVE_COST} each, ${(total.buys / seeds.length).toFixed(1)}/season)`);
console.log(`same-gameId replay paid: ${total.dupPaid}; duplicate gameIds in season: ${total.gameIdDupes}; weekly limit breaches: ${total.weeklyDouble}`);
console.log(`avg training XP per played game: plain ${avg(total.xpPlain)} (n=${total.xpPlain.length}) vs intensive ${avg(total.xpBoost)} (n=${total.xpBoost.length}); ratio ${(sum(total.xpBoost) / Math.max(1, total.xpBoost.length) / Math.max(1e-9, sum(total.xpPlain) / Math.max(1, total.xpPlain.length))).toFixed(2)}`);
