// B64 measurement: 3v3 half-court with and without the optional 4th player (bench).
// Same fixed seeds, same top-3 starters; only the substitute differs. Usage: node scripts/measure/b64-3v3-bench.mjs [games=100]
import { realTeam } from "../../tests/helpers/realGame.js";
import { buildHalfCourtTeam, playHalfCourtGame } from "../../js/modes/halfCourt3v3.js";

const GAMES = Number(process.argv[2] || 100);
const MATCHUPS = [[["GSW", 2016], ["CLE", 2016]], [["CHI", 1996], ["LAL", 2001]], [["SAS", 2014], ["MIA", 2013]]];
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function run(withBench) {
  const fat = []; const starterFat = []; const poss = []; const margin = []; let subs = 0; let capped = 0; let homeWins = 0; let n = 0;
  for (const [a, b] of MATCHUPS) {
    const size = withBench ? 4 : 3;
    for (let i = 0; i < GAMES; i++) {
      const home = buildHalfCourtTeam(a[0], realTeam(...a).players.slice(0, size), { side: "home" });
      const away = buildHalfCourtTeam(b[0], realTeam(...b).players.slice(0, size), { side: "away" });
      const r = playHalfCourtGame({ home, away, seed: `b64-${i}` });
      n++; poss.push(r.possessions); margin.push(Math.abs(r.score.home - r.score.away));
      if (r.capped) capped++; if (r.winner === "home") homeWins++;
      for (const side of ["home", "away"]) {
        r.box[side].forEach((l, idx) => { fat.push(l.fatigue); if (idx < 3) starterFat.push(l.fatigue); });
      }
      for (const p of r.plays) for (const l of p.lines) if (l.kind === "sub") subs++;
    }
  }
  return {
    games: n, subsPerGame: +(subs / n).toFixed(2), possessions: +(poss.reduce((x, y) => x + y, 0) / n).toFixed(1),
    marginAvg: +(margin.reduce((x, y) => x + y, 0) / n).toFixed(2), capped, homeWinPct: +((homeWins / n) * 100).toFixed(1),
    endFatigueMedianStarters: med(starterFat), startersFatigueGE80Pct: +((starterFat.filter((f) => f >= 80).length / starterFat.length) * 100).toFixed(1),
  };
}
console.log("3 players (no bench):", JSON.stringify(run(false)));
console.log("3 + 1 substitute    :", JSON.stringify(run(true)));
