/**
 * Role-aware single-game evaluation (pure, no state).
 *
 * Every category is "actual minus what THIS player is expected to produce
 * in THESE minutes", in Game Score points. Expectations come from the card's
 * real season rates (raw.*pg / raw.mpg) so a center is judged on boards and
 * rim protection and a point guard on playmaking; attribute fallbacks cover
 * cards without raw stats. Coach orders shift the expectation mix.
 *
 * Efficiency is only judged on attempts actually taken (0 shots = 0 penalty),
 * and a low-volume scoring night is only lightly penalised when the player
 * wasn't fed (few attempts) — low points alone is not a bad game.
 */

import { clamp } from "../core/seededRandom.js";

const MIN_RATED_MINUTES = 6;

const W = {
  ast: 1.7,
  tov: 1.5,
  reb: 1.2,
  blk: 2.5,
  stl: 2.5,
  eff: 2, // per true-shot attempt per point of TS%
  volUp: 0.5,
  volDown: 0.3,
};

// Coach duty -> multipliers on per-minute expectations.
const DUTY = {
  score: { pts: 1.15 },
  organize: { pts: 0.9, ast: 1.15 },
  defend: { pts: 0.75, stl: 1.1, blk: 1.1 },
  hustle: { pts: 0.6, reb: 1.15, blk: 1.1, stl: 1.1 },
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Per-36 expectations from attributes when the card has no raw season. */
function attrPer36(p) {
  const pts = clamp(((p.scoring ?? 70) - 45) * 0.55 + 4, 3, 32);
  const ast = clamp(((p.pass ?? 55) - 45) * 0.22, 0.5, 11);
  return {
    pts,
    ast,
    reb: clamp(((p.rebound ?? 50) - 40) * 0.2 + 3, 2, 15),
    stl: clamp(((p.steal ?? p.defense ?? 50) - 40) * 0.03 + 0.5, 0.3, 2.5),
    blk: clamp(((p.block ?? 50) - 40) * 0.04 + 0.2, 0.1, 3.5),
    tov: 1 + ast * 0.25 + pts * 0.04,
    ts: 0.54,
  };
}

/** Per-36 expectations from the card's real season line. */
function rawPer36(raw) {
  const mpg = num(raw.mpg);
  if (mpg < 8 || !Number.isFinite(Number(raw.ppg))) return null;
  const k = 36 / mpg;
  const fga = num(raw.fga);
  const ts = fga > 0 ? clamp(num(raw.ppg) / (2 * fga * 1.1), 0.4, 0.7) : 0.54;
  return {
    pts: num(raw.ppg) * k,
    ast: num(raw.apg) * k,
    reb: num(raw.rpg) * k,
    stl: num(raw.spg) * k,
    blk: num(raw.bpg) * k,
    tov: num(raw.tpg) * k,
    ts,
  };
}

/** What this player should produce in `min` minutes under his coach duty. */
function expectedLine(player, min) {
  const base = (player?.raw && rawPer36(player.raw)) || attrPer36(player || {});
  const duty = DUTY[player?.orders?.usage] || {};
  const s = min / 36;
  const line = { ts: base.ts };
  for (const k of ["pts", "ast", "reb", "stl", "blk", "tov"]) line[k] = base[k] * s * (duty[k] ?? 1);
  line.tsa = line.pts / (2 * line.ts);
  return line;
}

/**
 * Rate one box line. Categories are signed Game-Score deltas vs expectation:
 * scoring / playmaking (offense), rebounding / rimProtection / perimeter (defense).
 */
export function rateGame(player, stats = {}) {
  const min = num(stats.min);
  const pts = num(stats.pts);
  const fga = Math.max(0, num(stats.fga));
  const fta = Math.max(0, num(stats.fta));
  const tsa = fga + 0.44 * fta;
  const base = { pts, ast: num(stats.ast), reb: num(stats.reb), min: Math.round(min) };
  if (min < MIN_RATED_MINUTES) {
    return { ...base, rated: false, scoring: 0, playmaking: 0, rebounding: 0, rimProtection: 0, perimeter: 0, offense: 0, defense: 0, total: 0, fgPct: null };
  }
  const exp = expectedLine(player, min);

  // Efficiency only on shots actually taken, shrunk for tiny samples.
  const ts = tsa > 0 ? pts / (2 * tsa) : exp.ts;
  const efficiency = tsa > 0 ? tsa * (ts - exp.ts) * W.eff * Math.min(1, tsa / 8) : 0;
  // Volume: shortfall is discounted when the player wasn't given the shots.
  const fed = clamp(tsa / Math.max(1, exp.tsa), 0.4, 1);
  const volGap = pts - exp.pts;
  const volume = volGap >= 0 ? volGap * W.volUp : volGap * W.volDown * fed;
  const scoring = efficiency + volume;

  const playmaking = (base.ast - exp.ast) * W.ast - (num(stats.tov) - exp.tov) * W.tov;
  const rebounding = (base.reb - exp.reb) * W.reb;
  const rimProtection = (num(stats.blk) - exp.blk) * W.blk;
  const perimeter = (num(stats.stl) - exp.stl) * W.stl;

  const offense = scoring + playmaking;
  const defense = rebounding + rimProtection + perimeter;
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    ...base,
    rated: true,
    scoring: r1(scoring),
    efficiency: r1(efficiency),
    playmaking: r1(playmaking),
    rebounding: r1(rebounding),
    rimProtection: r1(rimProtection),
    perimeter: r1(perimeter),
    offense: r1(offense),
    defense: r1(defense),
    total: r1(offense + defense),
    fgPct: fga > 0 ? Math.round((num(stats.fgm) / fga) * 100) : null,
  };
}

/** Notes considered negative form (market "近况不佳"). */
export const NEGATIVE_NOTES = ["进攻哑火", "传导不顺", "表现低迷", "高产低效"];

/** One label per game; mixed nights keep a mixed label instead of a blanket negative. */
export function gameNote(r) {
  if (!r.rated) return r.min > 0 ? "出场有限" : "未出场";
  const { scoring, playmaking, rebounding, rimProtection, perimeter, offense, defense, total } = r;
  if (total >= 10 && scoring >= 4 && (playmaking >= 3 || defense >= 3)) return "全能爆发";
  if (scoring >= 6 && defense <= -4) return "攻强守弱";
  if (scoring >= 8) return "得分大火";
  if (playmaking >= 8) return "组织统治";
  if (rebounding + rimProtection >= 5) return rimProtection > rebounding ? "护框统治" : "篮板统治";
  if (perimeter >= 4) return "防守锁死";
  if (offense <= -4 && defense >= 3) return "攻弱守强";
  if (r.pts >= 20 && r.efficiency <= -4) return "高产低效";
  if (scoring >= 4) return "进攻高效";
  if (playmaking >= 4) return "串联出色";
  if (defense >= 3) return "防守尽责";
  if (offense <= -6) return "进攻哑火";
  if (playmaking <= -5) return "传导不顺";
  if (total <= -6) return "表现低迷";
  return "平稳";
}
