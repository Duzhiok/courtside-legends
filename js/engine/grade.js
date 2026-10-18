/**
 * NBA 2K–style live player grade (A+ → F−).
 * Score 0–100 starts near C+; events bump it in real time.
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export const GRADE_START = 78;

/** Map numeric score → letter like 2K MyCareer. */
export function gradeLetter(score) {
  const s = clamp(Number(score) || GRADE_START, 0, 100);
  if (s >= 96) return "A+";
  if (s >= 93) return "A";
  if (s >= 90) return "A-";
  if (s >= 86) return "B+";
  if (s >= 83) return "B";
  if (s >= 80) return "B-";
  if (s >= 76) return "C+";
  if (s >= 73) return "C";
  if (s >= 70) return "C-";
  if (s >= 66) return "D+";
  if (s >= 63) return "D";
  if (s >= 60) return "D-";
  if (s >= 55) return "F+";
  if (s >= 50) return "F";
  return "F-";
}

export function gradeTone(letter) {
  const L = String(letter || "C");
  if (L.startsWith("A")) return "grade-a";
  if (L.startsWith("B")) return "grade-b";
  if (L.startsWith("C")) return "grade-c";
  if (L.startsWith("D")) return "grade-d";
  return "grade-f";
}

export function ensureGrade(p) {
  if (!p) return;
  if (p.gradeScore == null) p.gradeScore = GRADE_START;
  p.grade = gradeLetter(p.gradeScore);
}

export function bumpGrade(p, delta, reason = "") {
  if (!p || !Number.isFinite(delta) || delta === 0) return;
  ensureGrade(p);
  p.gradeScore = clamp(p.gradeScore + delta, 0, 100);
  p.grade = gradeLetter(p.gradeScore);
  if (reason) p.gradeLast = reason;
}

/** Made field goal — tougher looks worth a bit more. */
export function gradeMake(p, { pts = 2, open = 0.5 } = {}) {
  let d = pts === 3 ? 3.2 : 2.4;
  if (open < 0.28) d += 0.85;
  else if (open > 0.72) d -= 0.4;
  bumpGrade(p, d, pts === 3 ? "三分命中" : "投篮命中");
}

export function gradeMiss(p, { pts = 2, open = 0.5 } = {}) {
  let d = pts === 3 ? -2.1 : -1.65;
  if (open > 0.68) d -= 1.0; // 空位打铁重罚
  if (open < 0.3) d += 0.55; // 强干扰不中稍轻
  bumpGrade(p, d, "投篮不中");
}

export function gradeAssist(p) {
  bumpGrade(p, 2.65, "助攻");
}

/** 间接助攻（传球创造空位，最后一传是别人） */
export function gradeHockeyAssist(p) {
  bumpGrade(p, 1.45, "间接助攻");
}

export function gradeTov(p) {
  bumpGrade(p, -3.5, "失误");
}

export function gradeSteal(p) {
  bumpGrade(p, 3.1, "抢断");
}

export function gradeBlock(p) {
  bumpGrade(p, 3.25, "盖帽");
}

/** 进攻篮板加分多于防守篮板（贴近 2K） */
export function gradeOreb(p) {
  bumpGrade(p, 2.45, "进攻篮板");
}

export function gradeDreb(p) {
  bumpGrade(p, 1.15, "防守篮板");
}

export function gradeScreen(p) {
  bumpGrade(p, 1.55, "挡拆掩护");
}

export function gradeFtMake(p) {
  bumpGrade(p, 1.05, "罚球命中");
}

export function gradeFtMiss(p) {
  bumpGrade(p, -1.55, "罚球不中");
}

export function gradeFoul(p) {
  bumpGrade(p, -0.75, "犯规");
}

/**
 * 被人从头上得分：仅在失位（open 高）时重罚；
 * 防守贴住、没有失位则几乎不减，甚至给一点贴防认可。
 */
export function gradeScoredOn(defender, { open = 0.5, pts = 2 } = {}) {
  if (!defender) return;
  const o = clamp(Number(open) || 0.5, 0.05, 0.95);
  if (o <= 0.36) {
    bumpGrade(defender, 0.4, "贴防到位");
    return;
  }
  if (o <= 0.5) {
    bumpGrade(defender, pts === 3 ? -0.55 : -0.35, "被得分（轻微）");
    return;
  }
  const scale = clamp((o - 0.45) / 0.4, 0.55, 1.45);
  bumpGrade(defender, -(pts === 3 ? 2.9 : 2.25) * scale, "失位被捅穿");
}

/** 干扰成功导致不中（open 低） */
export function gradeGoodContest(defender, { open = 0.4 } = {}) {
  if (!defender) return;
  if (open > 0.48) return;
  bumpGrade(defender, open < 0.28 ? 1.15 : 0.75, "成功干扰");
}

export function pickScreener(onCourt, handler, baller) {
  const pool = (onCourt || []).filter(
    (p) => p && p.id !== handler?.id && p.id !== baller?.id
  );
  if (!pool.length) return null;
  const bigs = pool.filter((p) => ["C", "PF"].includes(p.playPos || p.pos));
  const list = bigs.length ? bigs : pool;
  let best = list[0];
  let bestW = -1;
  for (const p of list) {
    const pos = p.playPos || p.pos;
    let w = (p.strength || 50) + (p.iq || 50) * 0.35;
    if (pos === "C") w += 28;
    else if (pos === "PF") w += 18;
    if (w > bestW) {
      bestW = w;
      best = p;
    }
  }
  return best;
}
