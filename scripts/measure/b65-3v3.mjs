/**
 * B65 measurement: 3v3 half-court v2 candidates, measured before any change.
 *
 * What it measures, per matchup (N games each, fixed seeds):
 * - arc-out shot share: fga2 / (fga1 + fga2), pooled + by position group
 *   (BACKLOG B65: ~20% now, real 3x3 ~35-40%)
 * - shooting efficiency inside vs beyond the arc (is the low share a choice
 *   problem or a make problem?)
 * - game shape: possessions/game, elapsed seconds, final score, capped/aborted
 * - 12s clock pressure: share of possessions using the full 12s
 *   (shotClockUsed == 12) — the closest observable to a would-be violation
 * - turnovers / fouls / FT trips per game, by kind (GameSim has no
 *   shot-clock-violation outcome; see the turnover-kind census below)
 * - ceiling check: the same matchups with every card forced to
 *   threeTend=90 / three=82 — does the share follow the roster, or does the
 *   5v5 chooseShot underneath cap it regardless?
 *
 * Usage: node scripts/measure/b65-3v3.mjs [gamesPerMatchup=30]
 * Nothing is written anywhere; sim.js is never touched.
 */
import { realTeam } from "../../tests/helpers/realGame.js";
import { buildHalfCourtTeam, playHalfCourtGame } from "../../js/modes/halfCourt3v3.js";

const N = Number(process.argv[2] || 30);
const PAIRS = [
  ["CHI", "SEA", 1996, "balanced"],
  ["GSW", "CLE", 2016, "shooter-heavy"],
  ["LAL", "PHI", 2001, "big-heavy"],
];
const GROUP = (pos) => (["PG", "SG"].includes(pos) ? "guard" : pos === "SF" ? "wing" : "big");

const top3 = (code, season) => realTeam(code, season).players.slice(0, 3);

function runMatchup(a, b, year, label, { shooters = false } = {}) {
  const agg = {
    games: 0, poss: 0, elapsed: 0, score: 0, capped: 0, aborted: 0,
    fga1: 0, fgm1: 0, fga2: 0, fgm2: 0, fta: 0, ftm: 0,
    tov: 0, pf: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    fullClock: 0, plays: 0, clockSum: 0,
    timeouts: 0, subs: 0,
    toKind: {}, foulLines: 0,
  };
  const byGroup = new Map();
  for (let i = 0; i < N; i += 1) {
    const mk = (code, side) => {
      const cards = top3(code, year);
      if (shooters) for (const p of cards) { p.threeTend = 90; p.three = 82; p.catchShoot = 82; p.offDribble = 82; p.offenseStyle = "balanced"; }
      return buildHalfCourtTeam(code, cards, { side });
    };
    const res = playHalfCourtGame({
      home: mk(a, "home"), away: mk(b, "away"), seed: `b65|${year}|${shooters ? "shoot" : "base"}|${i}`,
    });
    agg.games += 1;
    agg.poss += res.possessions;
    agg.elapsed += res.elapsedSec;
    agg.score += res.score.home + res.score.away;
    agg.capped += res.capped ? 1 : 0;
    agg.aborted += res.aborted ? 1 : 0;
    for (const side of ["home", "away"]) {
      for (const l of res.box[side]) {
        agg.fga1 += l.fga1; agg.fgm1 += l.fgm1; agg.fga2 += l.fga2; agg.fgm2 += l.fgm2;
        agg.fta += l.fta; agg.ftm += l.ftm; agg.tov += l.tov; agg.pf += l.pf;
        agg.reb += l.reb; agg.ast += l.ast; agg.stl += l.stl; agg.blk += l.blk;
        const g = byGroup.get(GROUP(l.pos)) || { fga1: 0, fga2: 0, n: 0 };
        g.fga1 += l.fga1; g.fga2 += l.fga2; g.n += 1;
        byGroup.set(GROUP(l.pos), g);
      }
    }
    for (const pl of res.plays) {
      agg.plays += 1;
      agg.clockSum += pl.shotClockUsed;
      if (pl.shotClockUsed >= 12) agg.fullClock += 1;
      for (const ln of pl.lines) {
        if (ln.kind === "turnover") {
          // playLines text does not carry the kind; census by text shape instead.
          const t = ln.text.includes("抢断") || ln.text.includes("steals") ? "steal"
            : ln.text.includes("进攻犯规") || ln.text.includes("charge") ? "charge" : "other";
          agg.toKind[t] = (agg.toKind[t] || 0) + 1;
        }
        if (ln.kind === "foul") agg.foulLines += 1;
        if (ln.kind === "timeout") agg.timeouts += 1;
        if (ln.kind === "sub") agg.subs += 1;
      }
    }
  }
  const fga = agg.fga1 + agg.fga2;
  const share = agg.fga2 / Math.max(1, fga);
  console.log(`\n${label} ${a} vs ${b} ${year}${shooters ? " [all cards threeTend=90/three=82]" : ""} — ${agg.games} games:`);
  console.log(`  arc share  ${(share * 100).toFixed(1)}%  (2PA ${agg.fga2} / FGA ${fga})   inside ${((agg.fgm1 / Math.max(1, agg.fga1)) * 100).toFixed(1)}%  arc ${((agg.fgm2 / Math.max(1, agg.fga2)) * 100).toFixed(1)}%`);
  console.log(`  by group:  ${["guard", "wing", "big"].map((g) => {
    const r = byGroup.get(g);
    return `${g} ${r ? ((r.fga2 / Math.max(1, r.fga1 + r.fga2)) * 100).toFixed(1) : "-"}% (${r ? r.fga1 + r.fga2 : 0} FGA)`;
  }).join("  ")}`);
  console.log(`  shape:     ${(agg.poss / agg.games).toFixed(1)} poss/game, ${(agg.elapsed / agg.games).toFixed(0)}s, score ${(agg.score / agg.games).toFixed(1)}, capped ${agg.capped}, aborted ${agg.aborted}`);
  console.log(`  clock:     mean ${(agg.clockSum / Math.max(1, agg.plays)).toFixed(1)}s, full-12s ${(agg.fullClock / Math.max(1, agg.plays) * 100).toFixed(1)}% of possessions`);
  console.log(`  per game:  TOV ${(agg.tov / agg.games).toFixed(2)} (steal ${((agg.toKind.steal || 0) / agg.games).toFixed(2)}, charge ${((agg.toKind.charge || 0) / agg.games).toFixed(2)}, other ${((agg.toKind.other || 0) / agg.games).toFixed(2)}), PF ${(agg.pf / agg.games).toFixed(2)}, FT ${(agg.fta / agg.games).toFixed(2)} att / ${(agg.ftm / agg.games).toFixed(2)} made, AST ${(agg.ast / agg.games).toFixed(2)}, STL ${(agg.stl / agg.games).toFixed(2)}, BLK ${(agg.blk / agg.games).toFixed(2)}, timeouts ${(agg.timeouts / agg.games).toFixed(2)}, subs ${(agg.subs / agg.games).toFixed(2)}`);
  return agg;
}

console.log(`B65 3v3 measurement, N=${N} games per matchup (real 3x3 arc share ~35-40%):`);
for (const [a, b, year, label] of PAIRS) runMatchup(a, b, year, label);
console.log("\nCeiling check (same matchups, every card forced to want threes):");
for (const [a, b, year, label] of PAIRS) runMatchup(a, b, year, label, { shooters: true });
