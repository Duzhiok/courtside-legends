/**
 * Carry-over confidence / tactical status from last-game box scores.
 * Good scorers get more auto-mode gravity; good passers feed them and create space.
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/** Human label for confidence band. */
export function confidenceLabel(conf) {
  const c = Number(conf) || 50;
  if (c >= 78) return "自信爆棚";
  if (c >= 68) return "信心十足";
  if (c >= 58) return "状态回升";
  if (c >= 45) return "平常心";
  if (c >= 35) return "信心不足";
  return "自我怀疑";
}

export function tacticalLabel(tac) {
  const t = Number(tac) || 50;
  if (t >= 78) return "战术核心";
  if (t >= 68) return "进攻枢纽";
  if (t >= 58) return "战术权重↑";
  if (t >= 45) return "常规轮换";
  if (t >= 35) return "边缘角色";
  return "信任下滑";
}

/**
 * Rate one box line into scoring / passing impact (-30..+35-ish).
 */
export function rateBoxImpact(player, stats = {}) {
  const pts = stats.pts || 0;
  const ast = stats.ast || 0;
  const reb = stats.reb || 0;
  const stl = stats.stl || 0;
  const blk = stats.blk || 0;
  const tov = stats.tov || 0;
  const fgm = stats.fgm || 0;
  const fga = Math.max(0, stats.fga || 0);
  const min = Math.max(1, stats.min || 1);
  const fg = fga > 0 ? fgm / fga : 0.4;
  const expectPts = clamp(((player.scoring || 70) - 55) * 0.65 + 6, 4, 32);
  const expectAst = clamp(((player.pass || 55) - 55) * 0.22 + 1.5, 0.5, 12);

  let scoring =
    (pts - expectPts) * 1.35 +
    (fg - 0.43) * 55 +
    Math.min(12, fga) * 0.35 +
    Math.max(0, pts - 20) * 0.45 -
    Math.max(0, expectPts - pts) * 0.35;
  // Volume without efficiency is only mild credit
  if (fga >= 15 && fg < 0.38) scoring -= 6;

  let passing =
    (ast - expectAst) * 3.4 +
    Math.max(0, ast - 6) * 1.2 -
    tov * 1.6 +
    (ast >= 8 && pts >= 12 ? 4 : 0);

  const twoWay = reb * 0.35 + stl * 1.1 + blk * 0.9;
  // Per-minute soft floor so DNP doesn't tank forever
  if (min < 8 && pts + ast < 4) {
    scoring *= 0.35;
    passing *= 0.35;
  }

  return {
    scoring: clamp(scoring, -28, 36),
    passing: clamp(passing, -22, 32),
    twoWay: clamp(twoWay, 0, 18),
    pts,
    ast,
    reb,
    fgPct: fga > 0 ? Math.round(fg * 100) : null,
    min: Math.round(min),
  };
}

/**
 * Apply last-game impact onto persistent player card fields.
 * Mutates `src` (roster card). Returns a short note for UI.
 */
export function applyFormAfterGame(src, simPlayer, { won = false } = {}) {
  if (!src || !simPlayer) return null;
  const stats = simPlayer.stats || {};
  const impact = rateBoxImpact(src, stats);
  const prevC = clamp(Number(src.confidence) || 50, 25, 92);
  const prevT = clamp(Number(src.tacticalStatus) || 50, 25, 92);

  const winBump = won ? 3.5 : -2;
  // Big nights should visibly lift confidence / tactical gravity for next tip-off
  const scorePull =
    impact.scoring * 1.05 + impact.passing * 0.28 + impact.twoWay * 0.25 + winBump;
  const tacPull =
    impact.scoring * 0.7 + impact.passing * 0.75 + impact.twoWay * 0.2 + (won ? 2.5 : -1.5);

  // Keep a slice of prior form, but let this game swing hard
  const nextC = clamp(prevC * 0.38 + 22 + scorePull, 28, 92);
  const nextT = clamp(prevT * 0.36 + 20 + tacPull, 28, 92);

  src.confidence = Math.round(nextC);
  src.tacticalStatus = Math.round(nextT);
  src.scoreForm = clamp(Math.round(50 + impact.scoring * 1.1), 20, 95);
  src.passForm = clamp(Math.round(50 + impact.passing * 1.15), 20, 95);

  let note = "平稳";
  if (impact.scoring >= 12 && impact.passing >= 8) note = "全能爆发";
  else if (impact.scoring >= 14) note = "得分大火";
  else if (impact.passing >= 12) note = "组织统治";
  else if (impact.scoring >= 6) note = "进攻高效";
  else if (impact.passing >= 6) note = "串联出色";
  else if (impact.scoring <= -10) note = "进攻哑火";
  else if (impact.passing <= -8) note = "传导不顺";

  const gameRow = {
    pts: impact.pts,
    ast: impact.ast,
    reb: impact.reb,
    stl: stats.stl || 0,
    blk: stats.blk || 0,
    tov: stats.tov || 0,
    fgPct: impact.fgPct,
    min: impact.min,
    note,
    won: !!won,
    confidence: src.confidence,
    tacticalStatus: src.tacticalStatus,
  };
  src.lastGame = gameRow;
  // 近几场表现（市场卖人时展示）
  const hist = Array.isArray(src.recentGames) ? src.recentGames.slice() : [];
  hist.push(gameRow);
  src.recentGames = hist.slice(-5);

  // Soft minutes / role gravity for next tip-off
  const baseRole = src.roleExpectation || null;
  const baseMin = src.targetMinutes ?? 24;
  src.targetMinutes = clamp(Math.round(baseMin + (src.tacticalStatus - 50) * 0.14), 8, 40);
  if (src.tacticalStatus >= 78 && baseRole && baseRole !== "alpha") {
    src._formRoleBoost = "alpha";
  } else if (src.tacticalStatus >= 68 && (baseRole === "role" || baseRole === "bench" || baseRole === "sixth")) {
    src._formRoleBoost = "starter";
  } else {
    src._formRoleBoost = null;
  }

  return src.lastGame;
}

/** One-line box for market / UI. */
export function formatGameLine(g) {
  if (!g) return "";
  const fg = g.fgPct != null ? ` ${g.fgPct}%` : "";
  const w = g.won === true ? "胜" : g.won === false ? "负" : "";
  return `${w ? w + " · " : ""}${g.pts}分${g.reb}板${g.ast}助${
    g.stl ? ` ${g.stl}断` : ""
  }${g.blk ? ` ${g.blk}帽` : ""} · ${g.min || 0}分钟${fg}${g.note ? ` · ${g.note}` : ""}`;
}

/** Avg line across recentGames for sell decisions. */
export function summarizeRecentForm(p) {
  const games = Array.isArray(p?.recentGames) ? p.recentGames : p?.lastGame ? [p.lastGame] : [];
  if (!games.length) return null;
  const n = games.length;
  const avg = (k) => games.reduce((s, g) => s + (Number(g[k]) || 0), 0) / n;
  const wins = games.filter((g) => g.won === true).length;
  const losses = games.filter((g) => g.won === false).length;
  return {
    games: n,
    ppg: +avg("pts").toFixed(1),
    rpg: +avg("reb").toFixed(1),
    apg: +avg("ast").toFixed(1),
    spg: +avg("stl").toFixed(1),
    bpg: +avg("blk").toFixed(1),
    mpg: Math.round(avg("min")),
    wins,
    losses,
    lastNote: games[games.length - 1]?.note || "",
  };
}

/** Sync form from both sim sides onto persistent team rosters. */
export function syncFormToTeams(sim, homeTeam, awayTeam) {
  if (!sim) return [];
  const notes = [];
  const hs = sim.score?.home ?? 0;
  const as = sim.score?.away ?? 0;
  const syncSide = (simTeam, srcTeam, won) => {
    if (!simTeam || !srcTeam?.players) return;
    for (const p of simTeam.roster || []) {
      const src = srcTeam.players.find((x) => x.id === p.id);
      if (!src) continue;
      const g = applyFormAfterGame(src, p, { won });
      if (g && (g.confidence >= 68 || g.confidence <= 38 || g.note?.includes("大火") || g.note?.includes("爆发"))) {
        notes.push(`${src.name}：${g.note}（自信${g.confidence} · ${tacticalLabel(g.tacticalStatus)}）`);
      }
    }
  };
  syncSide(sim.home, homeTeam, hs > as);
  syncSide(sim.away, awayTeam, as > hs);
  return notes;
}

export function formConfidence(p) {
  return clamp(Number(p?.confidence) || 50, 25, 95);
}

export function formTactical(p) {
  return clamp(Number(p?.tacticalStatus) || 50, 25, 95);
}

/** Usage gravity multiplier for auto ball distribution. */
export function formUsageMult(p) {
  const tac = formTactical(p);
  const conf = formConfidence(p);
  const scoreForm = clamp(Number(p?.scoreForm) || 50, 20, 95);
  // 50/50 → ~1.0; hot scorer core → ~1.35; cold bench → ~0.78
  return clamp(0.72 + tac * 0.0042 + conf * 0.0018 + (scoreForm - 50) * 0.0022, 0.72, 1.42);
}

/** Shot boldness — higher = more decisive attempts / creation. */
export function formShotBoldMult(p) {
  const conf = formConfidence(p);
  return clamp(0.85 + (conf - 50) * 0.0045, 0.78, 1.28);
}

/** Make / creation cushion from confidence (small). */
export function formMakeBonus(p) {
  const conf = formConfidence(p);
  return (conf - 50) * 0.00035;
}

/** Kick-out attractiveness for a scorer receiving the ball. */
export function formKickTargetMult(p) {
  const tac = formTactical(p);
  const conf = formConfidence(p);
  const scoreForm = clamp(Number(p?.scoreForm) || 50, 20, 95);
  return clamp(0.75 + tac * 0.0035 + conf * 0.002 + (scoreForm - 50) * 0.003, 0.7, 1.55);
}

/** Organizer willingness to hunt hot scorers with kick-outs. */
export function formKickPassMult(organizer) {
  const passForm = clamp(Number(organizer?.passForm) || 50, 20, 95);
  const pass = organizer?.pass || 50;
  return clamp(0.85 + (passForm - 50) * 0.004 + (pass - 60) * 0.002, 0.8, 1.35);
}

/** Off-ball spacing / cut bonus when a passer feeds a confident scorer. */
export function formSpacingBonus(baller, organizer) {
  if (!organizer || organizer.id === baller.id) return 0;
  const passOk = (organizer.pass || 50) >= 68 || (organizer.passForm || 50) >= 60;
  if (!passOk) return 0;
  const conf = formConfidence(baller);
  const tac = formTactical(baller);
  if (conf < 58 && tac < 58) return 0;
  return clamp(((conf - 50) + (tac - 50)) * 0.00055 + ((organizer.passForm || 50) - 50) * 0.0004, 0, 0.07);
}
