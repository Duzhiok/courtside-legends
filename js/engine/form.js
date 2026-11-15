/**
 * Carry-over confidence / tactical status from last-game box scores.
 * Good scorers get more auto-mode gravity; good passers feed them and create space.
 */

import { clamp } from "../core/seededRandom.js";

import { gameNote, NEGATIVE_NOTES, rateGame } from "./formRating.js";

export { NEGATIVE_NOTES };

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
 * Rate one box line (role-aware; see formRating.js). `passing`/`twoWay`
 * are kept as aliases for older callers.
 */
export function rateBoxImpact(player, stats = {}) {
  const r = rateGame(player, stats);
  return { ...r, passing: r.playmaking, twoWay: r.defense };
}

// Game-Score delta -> state pull. Tuned so a +10 night ≈ +16 confidence.
const CONF_PER_POINT = 1.6;
const TAC_PER_POINT = 1.4;
const MIN_PER_TAC = 0.14;

/** Identity of one settled game for one player (guards double settlement). */
function formKey(stats, won, ctx = "") {
  const s = stats || {};
  return [ctx, won ? 1 : 0, s.min, s.pts, s.reb, s.ast, s.stl, s.blk, s.tov, s.fga, s.fgm, s.pm].join("|");
}

/**
 * Apply last-game impact onto persistent player card fields.
 * Mutates `src` (roster card). Returns the game row, or null when skipped
 * (no sim player, a true DNP, or the same game already settled).
 */
export function applyFormAfterGame(src, simPlayer, { won = false, gameKey = "" } = {}) {
  if (!src || !simPlayer) return null;
  const stats = simPlayer.stats || {};
  if (!(Number(stats.min) > 0)) return null; // DNP: no form change at all
  const key = formKey(stats, won, gameKey);
  if (src._formKey === key) return null;

  const impact = rateGame(src, stats);
  const prevC = clamp(Number(src.confidence) || 50, 25, 92);
  const prevT = clamp(Number(src.tacticalStatus) || 50, 25, 92);
  // Limited minutes still count, but only lightly.
  const weight = impact.rated ? 1 : 0.3;
  const confPull = impact.total * CONF_PER_POINT + (won ? 3.5 : -2) * weight;
  const tacPull = impact.total * TAC_PER_POINT + (won ? 2.5 : -1.5) * weight;
  // Neutral game holds 50: carry 38%/36% of prior deviation, then this game's pull.
  src.confidence = Math.round(clamp(50 + (prevC - 50) * 0.38 + confPull, 28, 92));
  src.tacticalStatus = Math.round(clamp(50 + (prevT - 50) * 0.36 + tacPull, 28, 92));
  src.scoreForm = clamp(Math.round(50 + impact.scoring * 2.2), 20, 95);
  src.passForm = clamp(Math.round(50 + impact.playmaking * 2.2), 20, 95);
  src._formKey = key;

  const gameRow = {
    pts: impact.pts,
    ast: impact.ast,
    reb: impact.reb,
    stl: stats.stl || 0,
    blk: stats.blk || 0,
    tov: stats.tov || 0,
    fgPct: impact.fgPct,
    min: impact.min,
    // Objective shooting/impact inputs for display (TS%, +/-). `note` stays for
    // save compatibility only -- the UI no longer shows it as a verdict.
    fga: stats.fga || 0,
    fgm: stats.fgm || 0,
    fta: stats.fta || 0,
    pm: Number.isFinite(Number(stats.pm)) ? Number(stats.pm) : null,
    note: gameNote(impact),
    rating: impact.total,
    won: !!won,
    prevConfidence: prevC,
    prevTacticalStatus: prevT,
    confidence: src.confidence,
    tacticalStatus: src.tacticalStatus,
  };
  src.lastGame = gameRow;
  // 近几场表现（市场卖人时展示）
  const hist = Array.isArray(src.recentGames) ? src.recentGames.slice() : [];
  hist.push(gameRow);
  src.recentGames = hist.slice(-5);

  // Minutes nudge is an offset from the coach's base, replaced (not stacked) each game.
  const prevOffset = Number(src._formMinOffset) || 0;
  const base = (src.targetMinutes ?? 24) - prevOffset;
  const offset = Math.round((src.tacticalStatus - 50) * MIN_PER_TAC);
  src.targetMinutes = clamp(Math.round(base + offset), 8, 40);
  src._formMinOffset = src.targetMinutes - base;
  const baseRole = src.roleExpectation || null;
  if (src.tacticalStatus >= 78 && baseRole && baseRole !== "alpha") {
    src._formRoleBoost = "alpha";
  } else if (src.tacticalStatus >= 68 && (baseRole === "role" || baseRole === "bench" || baseRole === "sixth")) {
    src._formRoleBoost = "starter";
  } else {
    src._formRoleBoost = null;
  }

  return src.lastGame;
}

/** True shooting % with the attempt count, or null when no shots were taken. */
export function trueShooting(g) {
  const att = (Number(g?.fga) || 0) + 0.44 * (Number(g?.fta) || 0);
  if (!(att > 0)) return null;
  return { pct: Math.round(((Number(g.pts) || 0) / (2 * att)) * 100), fga: Number(g.fga) || 0, fgm: Number(g.fgm) || 0 };
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** "50→62 (+12)" only when the real before value was stored; never inferred. */
export function formDelta(before, after) {
  if (!Number.isFinite(Number(before)) || !Number.isFinite(Number(after))) return "";
  const d = Math.round(after) - Math.round(before);
  return `${Math.round(before)}→${Math.round(after)} (${signed(d)})`;
}

/** Objective one-line box for market / UI: raw stats, shooting sample, +/-, rating, state change. */
export function formatGameLine(g) {
  if (!g) return "";
  const w = g.won === true ? "胜" : g.won === false ? "负" : "";
  const ts = trueShooting(g);
  const shoot = ts
    ? ` · 投${ts.fgm}/${ts.fga} TS ${ts.pct}%`
    : g.fgPct != null
      ? ` · 命中 ${g.fgPct}%`
      : Number.isFinite(g.fga) && g.fga === 0 && g.min > 0
        ? " · 未出手"
        : "";
  const pm = Number.isFinite(g.pm) ? ` · +/- ${signed(g.pm)}` : "";
  const rating = Number.isFinite(g.rating) ? ` · 评分 ${signed(g.rating)}` : "";
  const c = formDelta(g.prevConfidence, g.confidence);
  const t = formDelta(g.prevTacticalStatus, g.tacticalStatus);
  const state = c || t ? ` · ${c ? `信心 ${c}` : ""}${c && t ? " " : ""}${t ? `战术 ${t}` : ""}` : "";
  return `${w ? w + " · " : ""}${g.pts}分${g.reb}板${g.ast}助${g.stl ? ` ${g.stl}断` : ""}${
    g.blk ? ` ${g.blk}帽` : ""
  } · ${g.min || 0}分钟${shoot}${pm}${rating}${state}`;
}

/** Avg line across recentGames for sell decisions. */
export function summarizeRecentForm(p) {
  const games = Array.isArray(p?.recentGames) ? p.recentGames : p?.lastGame ? [p.lastGame] : [];
  if (!games.length) return null;
  const n = games.length;
  const avg = (k) => games.reduce((s, g) => s + (Number(g[k]) || 0), 0) / n;
  const wins = games.filter((g) => g.won === true).length;
  const losses = games.filter((g) => g.won === false).length;
  // Old rows (pre role-aware rating) have no `rating`; only average real ones.
  const rated = games.filter((g) => Number.isFinite(g.rating));
  const avgRating = rated.length ? +(rated.reduce((s, g) => s + g.rating, 0) / rated.length).toFixed(1) : null;
  const lastNote = games[games.length - 1]?.note || "";
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
    lastNote,
    avgRating,
    // Poor form = rated games average clearly below expectation; legacy rows fall back to the note.
    poor: avgRating != null ? avgRating <= -4 : NEGATIVE_NOTES.includes(lastNote) || /哑火|不顺/.test(lastNote),
  };
}

/** Sync form from both sim sides onto persistent team rosters. */
export function syncFormToTeams(sim, homeTeam, awayTeam) {
  if (!sim || sim._formSynced) return [];
  sim._formSynced = true;
  const notes = [];
  const hs = sim.score?.home ?? 0;
  const as = sim.score?.away ?? 0;
  const gameKey = `${homeTeam?.name || ""}-${awayTeam?.name || ""}-${hs}-${as}`;
  const syncSide = (simTeam, srcTeam, won) => {
    if (!simTeam || !srcTeam?.players) return;
    for (const p of simTeam.roster || []) {
      const src = srcTeam.players.find((x) => x.id === p.id);
      if (!src) continue;
      const g = applyFormAfterGame(src, p, { won, gameKey });
      // Report only players whose state actually moved a lot; objective numbers, no verdict.
      if (g && Math.abs(g.confidence - g.prevConfidence) >= 8) {
        notes.push(`${src.name}：${g.pts}分${g.reb}板${g.ast}助 · 信心 ${formDelta(g.prevConfidence, g.confidence)}`);
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
