/**
 * Workstream G — Basketball Career Network: Basketball Analytics
 * Specialist career (NOT "actuary" — the user corrected the title).
 *
 * Moneyball evaluation from REAL simulation statistics with explainable
 * metrics. Analytics = PAST evidence + efficiency. It must feel different
 * from scouting (scoutCareer.js = uncertain FUTURE potential):
 *
 *   - Scouting asks: "who WILL become great?" (noisy, incomplete info)
 *   - Analytics asks: "who IS ALREADY producing more than the box score
 *     and the price tag suggest?" (complete season stats, verifiable)
 *
 * Every metric is computed from the roster row itself (ppg / fga / fg /
 * tp / tpa / apg / tpg / spg / bpg / rpg / mpg / gp) plus overall() and
 * playerPrice() — no invented stats. Contract value compares a player
 * against peers at the same position and season, never against an
 * absolute made-up baseline.
 *
 * Pure module: no DOM, no Math.random (seeded noise only), no sim imports.
 */
import { seededStream } from "../../core/seededRandom.js";
import { seasonToCard, overall } from "../../data/players.js";
import { playerPrice } from "../../data/intangibles.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Explainable per-minute / per-attempt metrics from one roster row. */
export function efficiencyMetrics(row) {
  const mpg = num(row?.mpg) || 0;
  const per36 = (v) => (mpg > 0 ? (num(v) / mpg) * 36 : 0);
  const fga = num(row?.fga);
  return {
    ppg: num(row?.ppg),
    ptsPerFga: fga > 0 ? num(row?.ppg) / fga : 0,
    ptsPer36: per36(row?.ppg),
    astPer36: per36(row?.apg),
    rebPer36: per36(row?.rpg),
    stocksPer36: per36(num(row?.spg) + num(row?.bpg)),
    astTo: num(row?.tpg) > 0 ? num(row?.apg) / num(row?.tpg) : (num(row?.apg) > 0 ? 99 : 0),
    threePct: num(row?.tp),
    threeRate: fga > 0 ? num(row?.tpa) / fga : 0,
    fgPct: num(row?.fg),
    mpg,
    gp: num(row?.gp),
  };
}

/** One production number (per-36) used to compare players across roles. */
export function productionScore(metrics) {
  return (
    metrics.ptsPer36 * 1
    + metrics.astPer36 * 1.5
    + metrics.rebPer36 * 1
    + metrics.stocksPer36 * 2
  );
}

/**
 * Value signals for one player: each names the actual numbers behind it.
 * `price` comes from playerPrice(seasonToCard(row)); pass null to skip
 * price-based signals.
 */
export function valueSignals(row, { price = null } = {}) {
  const m = efficiencyMetrics(row);
  const card = seasonToCard(row);
  const ovr = overall(card);
  const signals = [];
  if (m.stocksPer36 >= 2.5 && m.ppg < 10 && ovr < 80) {
    signals.push({
      id: "defense-value",
      strength: Math.round(m.stocksPer36 * 10) / 10,
      labelZh: `防守价值被低估：每 36 分钟 ${m.stocksPer36.toFixed(1)} 次抢断+盖帽，但场均只有 ${m.ppg.toFixed(1)} 分`,
      labelEn: `Undervalued defense: ${m.stocksPer36.toFixed(1)} steals+blocks per 36 min, but only ${m.ppg.toFixed(1)} ppg`,
    });
  }
  if (m.ptsPerFga >= 1.35 && m.fgPct >= 0.48) {
    signals.push({
      id: "efficient-scorer",
      strength: Math.round(m.ptsPerFga * 100) / 100,
      labelZh: `高效得分：每次出手得 ${m.ptsPerFga.toFixed(2)} 分，命中率 ${(m.fgPct * 100).toFixed(0)}%`,
      labelEn: `Efficient scorer: ${m.ptsPerFga.toFixed(2)} points per attempt at ${(m.fgPct * 100).toFixed(0)}% FG`,
    });
  }
  if (m.astTo >= 3 && num(row?.apg) >= 5) {
    signals.push({
      id: "playmaker-value",
      strength: Math.round(m.astTo * 10) / 10,
      labelZh: `组织价值：助攻失误比 ${m.astTo.toFixed(1)}，场均 ${num(row?.apg).toFixed(1)} 次助攻`,
      labelEn: `Playmaking value: ${m.astTo.toFixed(1)} assist-to-turnover with ${num(row?.apg).toFixed(1)} apg`,
    });
  }
  if (m.rebPer36 >= 10 && m.mpg < 25) {
    signals.push({
      id: "rebound-value",
      strength: Math.round(m.rebPer36 * 10) / 10,
      labelZh: `篮板价值：每 36 分钟 ${m.rebPer36.toFixed(1)} 个篮板，但场均只打 ${m.mpg.toFixed(1)} 分钟`,
      labelEn: `Rebounding value: ${m.rebPer36.toFixed(1)} boards per 36 min on only ${m.mpg.toFixed(1)} mpg`,
    });
  }
  if (m.threePct >= 0.38 && num(row?.tpa) >= 4) {
    signals.push({
      id: "three-value",
      strength: Math.round(m.threePct * 100),
      labelZh: `空间价值：三分命中率 ${(m.threePct * 100).toFixed(0)}%，场均出手 ${num(row?.tpa).toFixed(1)} 次`,
      labelEn: `Spacing value: ${(m.threePct * 100).toFixed(0)}% from three on ${num(row?.tpa).toFixed(1)} attempts`,
    });
  }
  if (price !== null) {
    const prod = productionScore(m);
    // Price bands are the game's own (playerPrice ≈ 55 + mult*115, era-adjusted).
    if (price >= 200 && prod < 22) {
      signals.push({
        id: "overpaid",
        strength: Math.round(price),
        labelZh: `合同溢价：身价 ¤${price}，但每 36 分钟综合产出只有 ${prod.toFixed(1)}`,
        labelEn: `Overpaid: priced ¤${price} but only ${prod.toFixed(1)} production per 36 min`,
      });
    }
  }
  return { ovr, price, metrics: m, signals };
}

/**
 * Rank players of one season by hidden value: production per unit of
 * price (cheaper production = more undervalued). Returns the top entries
 * with their reasons. `minGp` keeps tiny samples out of the ranking.
 */
export function findUndervalued(rows, { season, minGp = 20, minMpg = 12, limit = 5 } = {}) {
  const scored = [];
  for (const row of rows || []) {
    if (!row || row.season !== season || (num(row.gp) || 0) < minGp || (num(row.mpg) || 0) < minMpg) continue;
    const card = seasonToCard(row);
    const price = playerPrice(card);
    const { metrics, signals } = valueSignals(row, { price });
    const prod = productionScore(metrics);
    scored.push({
      row, card, price,
      ovr: overall(card),
      production: Math.round(prod * 10) / 10,
      valueRatio: price > 0 ? Math.round((prod / price) * 1000) / 1000 : 0,
      metrics, signals,
    });
  }
  scored.sort((a, b) => b.valueRatio - a.valueRatio);
  return scored.slice(0, limit);
}

/**
 * Contract value vs peers at the same position and season: production
 * percentile minus price percentile. >= +25 → bargain, <= -25 → overpaid.
 */
export function contractValueReport(row, peers) {
  const card = seasonToCard(row);
  const price = playerPrice(card);
  const prod = productionScore(efficiencyMetrics(row));
  const samePos = (peers || []).filter((r) => r?.pos === row.pos && r?.season === row.season && (num(r.gp) || 0) >= 20);
  const pct = (arr, v) => {
    if (!arr.length) return 50;
    const sorted = [...arr].sort((a, b) => a - b);
    const below = sorted.filter((x) => x < v).length;
    return Math.round((below / sorted.length) * 100);
  };
  const prodPct = pct(samePos.map((r) => productionScore(efficiencyMetrics(r))), prod);
  const pricePct = pct(samePos.map((r) => playerPrice(seasonToCard(r))), price);
  const gap = prodPct - pricePct;
  return {
    bref: row.bref, name: row.name, pos: row.pos, season: row.season,
    price, production: Math.round(prod * 10) / 10,
    prodPct, pricePct, gap,
    verdict: gap >= 25 ? "bargain" : gap <= -25 ? "overpaid" : "fair",
    verdictZh: gap >= 25 ? "超值合同" : gap <= -25 ? "溢价合同" : "价格合理",
    verdictEn: gap >= 25 ? "Bargain" : gap <= -25 ? "Overpaid" : "Fair value",
  };
}

/**
 * Lineup fit from cards (scoring / pass / defense / rebound ratings +
 * positions). Flags usage clashes, missing creators, defensive holes and
 * complementary pairs — with the actual ratings cited.
 */
export function lineupFitReport(cards) {
  const list = (cards || []).filter(Boolean);
  const notes = [];
  let score = 70;
  const guards = list.filter((c) => (c.playPos || c.pos) === "PG" || (c.playPos || c.pos) === "SG");
  const bigScorers = list.filter((c) => (c.scoring || 50) >= 80);
  if (bigScorers.length >= 2 && guards.filter((c) => (c.scoring || 50) >= 80).length >= 2) {
    notes.push({ id: "usage-clash", labelZh: "球权冲突：两名高得分后卫都需要大量持球", labelEn: "Usage clash: two high-scoring guards both need the ball" });
    score -= 12;
  }
  const bestPass = Math.max(0, ...list.map((c) => c.pass || 0));
  if (bestPass < 60) {
    notes.push({ id: "no-creator", labelZh: "缺少组织者：全队最高传球只有 " + bestPass, labelEn: `No primary creator: best passer is only ${bestPass}` });
    score -= 10;
  }
  const worstDef = list.length ? Math.min(...list.map((c) => c.defense || 0)) : 0;
  if (worstDef < 55) {
    const who = list.find((c) => (c.defense || 0) === worstDef);
    notes.push({ id: "defensive-hole", labelZh: `防守短板：${who?.name || "?"} 的防守只有 ${worstDef}`, labelEn: `Defensive hole: ${who?.name || "?"} defends at only ${worstDef}` });
    score -= 8;
  }
  const creator = list.find((c) => (c.pass || 0) >= 75);
  const finisher = list.find((c) => (c.scoring || 0) >= 80);
  if (creator && finisher && creator.id !== finisher.id) {
    notes.push({ id: "creator-finisher", labelZh: `互补组合：${creator.name} 组织 + ${finisher.name} 终结`, labelEn: `Complementary pair: ${creator.name} creates, ${finisher.name} finishes` });
    score += 8;
  }
  return { score: Math.max(0, Math.min(100, score)), notes };
}

/**
 * One analytics challenge: "find the most undervalued player" in a
 * season pool. The correct answer is the top valueRatio; distractors are
 * real players with different profiles (a high-OVR star with poor value,
 * a low-minute specialist). All options show the same stat block — the
 * player must read the numbers, not the names.
 */
export function buildAnalyticsChallenge(rows, { season, seed = 1, minGp = 20 } = {}) {
  const ranked = findUndervalued(rows, { season, minGp, limit: 12 });
  if (ranked.length < 3) return null;
  const correct = ranked[0];
  // Distractors: the highest-OVR player in the ranked set (famous but
  // poor value) and the lowest-minutes player (small sample) — both real.
  const byOvr = [...ranked].sort((a, b) => b.ovr - a.ovr);
  const byMpg = [...ranked].sort((a, b) => a.metrics.mpg - b.metrics.mpg);
  const picks = [correct];
  for (const cand of [byOvr[0], byMpg[0], ranked[1], ranked[2]]) {
    if (picks.length >= 3) break;
    if (cand && !picks.some((p) => p.row.bref === cand.row.bref)) picks.push(cand);
  }
  if (picks.length < 3) return null;
  const options = picks.map((p, i) => ({
    id: `opt-${i}`,
    bref: p.row.bref,
    name: p.row.name,
    pos: p.row.pos,
    team: p.row.team,
    ovr: p.ovr,
    price: p.price,
    valueRatio: p.valueRatio,
    production: p.production,
    stats: {
      ppg: p.row.ppg, rpg: p.row.rpg, apg: p.row.apg,
      fg: p.row.fg, tp: p.row.tp, mpg: p.row.mpg, gp: p.row.gp,
    },
    signals: p.signals.map((s) => s.id),
  }));
  const rng = seededStream(seed);
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const correctOptionId = options.find((o) => o.bref === correct.row.bref)?.id || null;
  return { id: `analytics-${season}-${seed}`, season, options, correctOptionId, correctBref: correct.row.bref };
}

/** Grade one analytics answer; the explanation cites the value numbers. */
export function gradeAnalyticsAnswer(challenge, optionId) {
  const correct = optionId === challenge?.correctOptionId;
  const picked = (challenge?.options || []).find((o) => o.id === optionId) || null;
  const right = (challenge?.options || []).find((o) => o.id === challenge?.correctOptionId) || null;
  return {
    correct,
    reputationDelta: correct ? 3 : -4,
    pickedBref: picked?.bref || null,
    correctBref: challenge?.correctBref || null,
    explanationZh: correct
      ? `判断正确：${right?.name} 每单位身价的产出最高（价值比 ${right?.valueRatio}），是最被低估的球员。`
      : `判断有误：你选了 ${picked?.name || "?"}（价值比 ${picked?.valueRatio ?? "?"}），但 ${right?.name || "?"} 的价值比更高（${right?.valueRatio ?? "?"}）。`,
    explanationEn: correct
      ? `Correct: ${right?.name} produces the most per unit of price (value ratio ${right?.valueRatio}) — the most undervalued player.`
      : `Not quite: you picked ${picked?.name || "?"} (value ratio ${picked?.valueRatio ?? "?"}), but ${right?.name || "?"} rates higher (${right?.valueRatio ?? "?"}).`,
  };
}

/** The report this analysis hands to the coach / GM side. */
export function analyticsReport(challenge, optionId) {
  const grade = gradeAnalyticsAnswer(challenge, optionId);
  const picked = (challenge?.options || []).find((o) => o.id === optionId) || null;
  return {
    source: "analytics",
    challengeId: challenge?.id || null,
    bref: picked?.bref || null,
    wasCorrect: grade.correct,
    confidence: grade.correct ? "high" : "low",
    claimZh: picked ? `建议重用 ${picked.name}：价值比 ${picked.valueRatio}，产出 ${picked.production}` : "无建议",
    claimEn: picked ? `Recommend featuring ${picked.name}: value ratio ${picked.valueRatio}, production ${picked.production}` : "No recommendation",
    reputationDelta: grade.reputationDelta,
  };
}

/**
 * Verify a past analytics claim against later real seasons: did the
 * player's production actually rise (breakout) or hold (sustain)?
 */
export function verifyAnalyticsReport(report, rows, { years = 2 } = {}) {
  const { bref, season } = report || {};
  let peakProd = null;
  for (const r of rows || []) {
    if (r?.bref !== bref || r.season <= season || r.season > season + years) continue;
    const prod = productionScore(efficiencyMetrics(r));
    if (peakProd === null || prod > peakProd) peakProd = prod;
  }
  const base = report?.production ?? null;
  const verified = peakProd !== null && base !== null ? peakProd >= base : peakProd !== null;
  return { verified, baseProduction: base, laterPeakProduction: peakProd === null ? null : Math.round(peakProd * 10) / 10 };
}
