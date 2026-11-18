/**
 * Jersey-exchange offer frequency vs the respect threshold, over REAL Reborn seasons (real GameSim, real rivalry ledger).
 *
 * One season per seed is simulated ONCE. After every game the same real evidence (the settled report, the rivalry ledger and the
 * meetings it produced) is fed to several independent exchange states that differ ONLY in MIN_RESPECT, so the thresholds are
 * compared on identical games and identical opponents. Nothing is fabricated: no meeting, matchup or respect value is changed;
 * the per-person-season and per-season caps, stable ids and idempotency are the shipped ones (offersForGame is unchanged).
 *
 * Also reports WHY a season gets no offer (too few meetings / no direct matchup / respect below the bar), so a threshold change
 * is chosen on evidence rather than on a hunch. The shipped rules cap ordinary offers at MAX_PER_SEASON (2).
 *
 * A career is SEVERAL consecutive seasons joined by the same rolloverSeason the UI uses: the rivalry ledger and the exchange state carry
 * over, so meetings accumulate exactly as they do for a player. Counts are reported per season number.
 *
 * Usage: node scripts/measure/jersey-exchange-thresholds.mjs [seeds=8] [thresholds=50,55,60,65] [seasons=4]
 */
import { readFileSync } from "node:fs";
import { createRebornState } from "../../js/reborn/identity.js";
import { buildSeason, playGame } from "../../js/reborn/season.js";
import { rolloverSeason } from "../../js/reborn/contract.js";
import { rivalryLedger, recordRivalryMeetings } from "../../js/reborn/rivalry.js";
import { EXCHANGE_RULES, evaluateExchangeCandidate, gameEvidenceFromReport, relationSummary } from "../../js/collectibles/jerseyEligibility.js";
import { jerseyState, offersForGame } from "../../js/collectibles/jerseyExchange.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const SEEDS = Number(process.argv[2]) || 8;
const THRESHOLDS = (process.argv[3] || "50,55,60,65").split(",").map(Number);
const SEASONS = Number(process.argv[4]) || 4;
const takeover = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });
const BINS = [[0, 40], [40, 50], [50, 55], [55, 60], [60, 65], [65, 101]];
const binOf = (r) => BINS.findIndex(([a, b]) => r >= a && r < b);

const perSeason = Object.fromEntries(THRESHOLDS.map((t) => [t, Array.from({ length: SEASONS }, () => [])]));   // [threshold][season no - 1] -> offers per career
const firstOfferGame = Object.fromEntries(THRESHOLDS.map((t) => [t, []]));
const why = { personGames: 0, tooFewMeetings: 0, noDirectMatchup: 0, pool: 0 };
const poolBins = BINS.map(() => 0);
const poolPeople = new Map();   // seed:bref -> best respect reached while meetings>=2 and facing him directly

for (let s = 1; s <= SEEDS; s += 1) {
  const seed = `jersey-threshold-${s}`;
  let reborn = createRebornState(seed, ROWS);
  reborn.player.coachTrust = 80;   // a starter, same setup as scripts/measure/jersey-offers.mjs
  const states = Object.fromEntries(THRESHOLDS.map((t) => [t, jerseyState(reborn)]));   // carried across the whole career
  const careerLine = [];
  for (let no = 1; no <= SEASONS; no += 1) {
    const season = buildSeason(reborn, ROWS);
    const counts = Object.fromEntries(THRESHOLDS.map((t) => [t, 0]));
    const first = Object.fromEntries(THRESHOLDS.map((t) => [t, null]));
    while (season.index < season.games.length) {
      const before = reborn;
      const out = await playGame(before, season, ROWS, { onTakeover: takeover });
      if (!out) break;
      const report = out.report;
      const rivalry = recordRivalryMeetings(rivalryLedger(before), report);   // pure: the same meetings playGame just recorded
      for (const t of THRESHOLDS) {
        const rules = { ...EXCHANGE_RULES, MIN_RESPECT: t };
        const res = offersForGame(states[t], { report, ledger: rivalry.ledger, rivalry, rules });
        states[t] = res.state;
        counts[t] += res.created.length;
        if (res.created.length && first[t] === null) first[t] = report.game;
      }
      // diagnostics: for everyone who could have offered tonight, what stopped them (shipped rules, no threshold applied)
      const game = gameEvidenceFromReport(report, rivalry.ledger);
      if (game.settled) {
        const brefs = new Set(rivalry.met.map((m) => m.rival.bref));
        for (const m of game.directMatchups) brefs.add(m.opponentId);
        for (const bref of brefs) {
          const person = rivalry.ledger.rivals.find((r) => r.bref === bref) || rivalry.ledger.watch?.[bref];
          const rel = relationSummary(person);
          if (!person || !rel) continue;
          why.personGames += 1;
          if (rel.meetings < EXCHANGE_RULES.MIN_MEETINGS) { why.tooFewMeetings += 1; continue; }
          const v = evaluateExchangeCandidate({ opponent: person, game, respect: rel.respect, meetings: rel.meetings, rules: { ...EXCHANGE_RULES, MIN_RESPECT: 0 } });
          if (v.reason === "NO_DIRECT_MATCHUP") { why.noDirectMatchup += 1; continue; }
          why.pool += 1;
          poolBins[binOf(rel.respect)] += 1;
          const key = `${seed}:${bref}`;
          poolPeople.set(key, Math.max(poolPeople.get(key) || 0, rel.respect));
        }
      }
      reborn = out.reborn;
    }
    for (const t of THRESHOLDS) { perSeason[t][no - 1].push(counts[t]); if (first[t] !== null) firstOfferGame[t].push(first[t]); careerLine.push(counts[t]); }
    reborn = rolloverSeason(reborn, { year: season.year, players: ROWS }).reborn;   // what the UI's "next season" button does
  }
  console.log(`${seed}: ${SEASONS} seasons · offers per season ` + THRESHOLDS.map((t, ti) => `≥${t}:[${Array.from({ length: SEASONS }, (_, n) => careerLine[n * THRESHOLDS.length + ti]).join(",")}]`).join("  "));
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
console.log(`\n=== ${SEEDS} fixed-seed careers x ${SEASONS} consecutive 82-game seasons · shipped caps: ${EXCHANGE_RULES.MAX_PER_SEASON} ordinary offers/season, ${EXCHANGE_RULES.MAX_PER_PERSON_SEASON} per rival ===`);
console.log("MIN_RESPECT | mean offers per season by season no. (1.." + SEASONS + ") | all seasons | seasons with ≥1 | with 2 (cap) | 2nd season on: mean / ≥1 | median game of first offer");
for (const t of THRESHOLDS) {
  const bySeason = perSeason[t];
  const all = bySeason.flat();
  const later = bySeason.slice(1).flat();
  const pct = (a, n) => (a.length ? `${Math.round((100 * a.filter((x) => x >= n).length) / a.length)}%` : "-");
  console.log(`${String(t).padStart(11)} | ${bySeason.map((a) => mean(a).toFixed(2)).join("  ").padEnd(34)} | ${mean(all).toFixed(2).padStart(12)} | ${pct(all, 1).padStart(16)} | ${pct(all, 2).padStart(12)} | ${mean(later).toFixed(2)} / ${pct(later, 1)}`.padEnd(150) + ` | ${median(firstOfferGame[t]) ?? "-"}`);
}
console.log(`\nWhy a night has no offer (person-games = every man who could have offered after a settled game): ${why.personGames}`);
console.log(`  too few meetings (<${EXCHANGE_RULES.MIN_MEETINGS}): ${why.tooFewMeetings}   ·   met enough but no direct matchup tonight: ${why.noDirectMatchup}   ·   real pool (enough meetings AND faced directly): ${why.pool}`);
console.log("  respect of the real pool, person-games per band: " + BINS.map(([a, b], i) => `${a}-${b === 101 ? "100" : b - 1}: ${poolBins[i]}`).join("  |  "));
const best = [...poolPeople.values()];
console.log(`  people who ever reached the pool: ${best.length} · best respect they reached: ${BINS.map(([a, b]) => `${a}-${b === 101 ? "100" : b - 1}: ${best.filter((r) => r >= a && r < b).length}`).join("  |  ")}`);
