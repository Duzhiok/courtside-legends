function teamTotals(team) {
  const totals = {
    pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
  };
  for (const player of team.roster || []) {
    const stats = player.stats || {};
    for (const key of Object.keys(totals)) {
      totals[key] += Number(stats[key]) || 0;
    }
  }
  return totals;
}

function pct(made, attempted) {
  return attempted > 0 ? made / attempted : 0;
}

/**
 * Classic box-score "Game Score" (Hollinger), NOT the live gradeScore.
 * gradeScore rewards in-possession process (assists, no-shot efficiency, defense) and can
 * legitimately crown a 0-point/6-assist/0-turnover floor general over a volume scorer who
 * missed a pile of shots — that's a fine signal for player development, but on the RESULT
 * SCREEN "最佳表现" needs to match what the box score next to it actually shows, or it just
 * reads as a bug. So 最佳表现 ranks by the box score itself.
 */
function gameScore(stats = {}) {
  const s = (k) => Number(stats[k]) || 0;
  return (
    s("pts") +
    0.4 * s("fgm") -
    0.7 * s("fga") -
    0.4 * (s("fta") - s("ftm")) +
    0.7 * s("oreb") +
    0.3 * s("dreb") +
    s("stl") +
    0.7 * s("ast") +
    0.7 * s("blk") -
    0.4 * s("pf") -
    s("tov")
  );
}

function topPerformer(team) {
  const ranked = [...(team.roster || [])].sort(
    (a, b) => gameScore(b.stats) - gameScore(a.stats) || (b.stats?.pts || 0) - (a.stats?.pts || 0),
  );
  const player = ranked[0];
  if (!player) return null;
  const stats = player.stats || {};
  return {
    name: player.name,
    pts: stats.pts || 0,
    reb: stats.reb || 0,
    ast: stats.ast || 0,
    grade: player.grade || null,
  };
}

function extremePlusMinus(team) {
  const ranked = [...(team.roster || [])]
    .filter((player) => Number.isFinite(player.stats?.pm))
    .sort((a, b) => b.stats.pm - a.stats.pm);
  if (!ranked.length) return { best: null, worst: null };
  return {
    best: { name: ranked[0].name, pm: ranked[0].stats.pm },
    worst: { name: ranked.at(-1).name, pm: ranked.at(-1).stats.pm },
  };
}

function requireSnap(snap) {
  if (
    !snap
    || typeof snap !== "object"
    || !snap.home
    || !snap.away
    || !snap.score
    || !Array.isArray(snap.home.roster)
    || !Array.isArray(snap.away.roster)
  ) {
    throw new TypeError("a completed game snapshot with home/away rosters is required");
  }
}

export function summarizeMatchResult(snap) {
  requireSnap(snap);
  const home = teamTotals(snap.home);
  const away = teamTotals(snap.away);
  const homeScore = snap.score.home;
  const awayScore = snap.score.away;
  const winnerSide = homeScore === awayScore ? null : homeScore > awayScore ? "home" : "away";
  const winner = winnerSide ? snap[winnerSide] : null;
  const loser = winnerSide ? snap[winnerSide === "home" ? "away" : "home"] : null;
  const winnerTotals = winnerSide ? (winnerSide === "home" ? home : away) : null;
  const loserTotals = winnerSide ? (winnerSide === "home" ? away : home) : null;

  const factors = [];
  if (winnerSide) {
    const tovDiff = loserTotals.tov - winnerTotals.tov;
    if (Math.abs(tovDiff) >= 3) {
      factors.push(
        tovDiff > 0
          ? `${loser.name} 失误比 ${winner.name} 多 ${tovDiff} 次，白送回合`
          : `${winner.name} 失误反而比 ${loser.name} 多 ${-tovDiff} 次，仍靠效率取胜`,
      );
    }
    const orebDiff = winnerTotals.oreb - loserTotals.oreb;
    if (Math.abs(orebDiff) >= 3) {
      factors.push(
        orebDiff > 0
          ? `${winner.name} 前场篮板多抢 ${orebDiff} 个，制造了额外进攻回合`
          : `${loser.name} 前场篮板多抢 ${-orebDiff} 个，但没能转化成胜势`,
      );
    }
    const tpDiffPct = pct(winnerTotals.tpm, winnerTotals.tpa) - pct(loserTotals.tpm, loserTotals.tpa);
    if (Math.abs(tpDiffPct) >= 0.1 && (winnerTotals.tpa >= 5 || loserTotals.tpa >= 5)) {
      factors.push(
        `三分命中率差距 ${(tpDiffPct * 100).toFixed(0)} 个百分点，${
          tpDiffPct > 0 ? winner.name : loser.name
        } 的外线手感是关键`,
      );
    }
    const ftDiff = winnerTotals.ftm - loserTotals.ftm;
    if (Math.abs(ftDiff) >= 6) {
      factors.push(`${winner.name} 罚球多命中 ${ftDiff} 个，罚球线上占了便宜`);
    }
  }

  return {
    winnerSide,
    margin: Math.abs(homeScore - awayScore),
    teamTotals: { home, away },
    shooting: {
      home: { fg: pct(home.fgm, home.fga), tp: pct(home.tpm, home.tpa), ft: pct(home.ftm, home.fta) },
      away: { fg: pct(away.fgm, away.fga), tp: pct(away.tpm, away.tpa), ft: pct(away.ftm, away.fta) },
    },
    topPerformers: { home: topPerformer(snap.home), away: topPerformer(snap.away) },
    plusMinus: { home: extremePlusMinus(snap.home), away: extremePlusMinus(snap.away) },
    factors,
  };
}
