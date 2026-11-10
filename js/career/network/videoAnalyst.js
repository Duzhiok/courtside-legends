/**
 * Workstream G — Basketball Career Network: Video Analyst career.
 *
 * Short interactive film-study challenges (1–3 minutes) built ONLY on
 * per-possession data that actually exists in the engine:
 *
 *   EXISTS: possession side, quarter, clock and score (snapshots); the
 *   on-court five per side (snapshot onCourt ids); field-goal attempts with
 *   shooterId / made / pts (meta.shot); turnovers with actorId / kind /
 *   forcedById (meta.turnover); fouls (meta.foul); rebounds with
 *   rebounderId / offensive (meta.reb); passes (meta.pass); substitutions
 *   (derived SUBSTITUTION events); period boundaries.
 *
 *   MISSING — never invented: shot zone / location, defender identity on a
 *   field-goal attempt, drive direction, play / set identity, weak-side
 *   rotation timing, matchup data. A challenge therefore never asks about
 *   "left drives" or "a spot on the floor". It asks about scoring runs,
 *   lineup splits, a shooter's cold streak, late-game collapse,
 *   substitution effects and turnover-prone actors — all computed from the
 *   real log of a real simulated game.
 *
 * The log comes from driving a real GameSim step by step (same pattern as
 * tests/b53PassEvents.test.js: `sim.running = true; while (running)
 * sim.step()`), collecting raw events + per-tick snapshots. One tick is
 * one resolved possession (step() resolves, flips possession, then fires
 * onTick), so the log segments on ticks; the domain-event adapter
 * (js/engine/domainEvents.js) derives the same boundaries for live
 * render subscriptions and is not needed for log building.
 * Deterministic under a fixed seed.
 *
 * The analyst's recommendation FEEDS the coach's decision (workstream B
 * owns the decision side). This module only produces the recommendation
 * object; B decides adoption.
 */
import { GameSim } from "../../engine/sim.js";
import { seededStream } from "../../core/seededRandom.js";
import { seasonToCard, overall } from "../../data/players.js";

/** Build a 10-man team from roster rows (same shape as tests/helpers/realGame.js realTeam). */
export function buildTeamFromRows(rows, teamCode, season) {
  const players = (rows || [])
    .filter((r) => r?.team === teamCode && r?.season === season)
    .map(seasonToCard)
    .sort((a, b) => (overall(b) || 0) - (overall(a) || 0))
    .slice(0, 10);
  return { name: teamCode, players };
}

/**
 * Drive one real game on the engine and return its possession log.
 * One log entry per resolved possession (one onTick): the snapshot after
 * the possession plus the raw events that fired while it resolved.
 * `home` / `away` are { name, players } (seasonToCard cards).
 *
 * Possession semantics (verified against sim.js): step() resolves the
 * possession of `this.possession`, flips it, THEN fires onTick — so the
 * snapshot's `possession` field is the NEXT attacker, and the side that
 * just attacked is its flip. The collector records the attacking side.
 * autoRotation is enabled (as the app does when the player turns it on)
 * so the game has realistic fatigue rotations instead of starters
 * playing all 48 minutes.
 */
export function collectPossessionLog({ home, away, seed = 1, maxSteps = 3000 } = {}) {
  const rawBuffer = [];
  const ticks = [];
  const sim = new GameSim({
    home, away, youSide: "home", injuries: false, speed: 3,
    rng: seededStream(seed),
    onEvent: (e) => rawBuffer.push(e),
    onTick: (snap) => {
      ticks.push({ snap, events: rawBuffer.splice(0, rawBuffer.length) });
    },
    onEnd: () => {},
  });
  sim.autoRotation = true;
  sim.running = true;
  let steps = 0;
  while (sim.running && steps < maxSteps) {
    sim.step();
    steps += 1;
    if (sim.paused) sim.setPaused(false); // quarter-break resume, like the UI
  }
  const finalSnap = sim.snapshot();
  // Segment ticks into possessions: one tick = one resolved possession.
  const possessions = [];
  let prevScore = { home: 0, away: 0 };
  let prevOnCourt = null;
  ticks.forEach((tick, i) => {
    const snap = tick.snap;
    const score = { ...(snap.score || {}) };
    const points = {
      home: (score.home || 0) - (prevScore.home || 0),
      away: (score.away || 0) - (prevScore.away || 0),
    };
    const onCourtHome = (snap.home?.onCourt || []).map((p) => p.id);
    const onCourtAway = (snap.away?.onCourt || []).map((p) => p.id);
    const subs = [];
    if (prevOnCourt) {
      for (const [side, prev, next] of [["home", prevOnCourt.home, onCourtHome], ["away", prevOnCourt.away, onCourtAway]]) {
        const out = prev.filter((id) => !next.includes(id));
        const inn = next.filter((id) => !prev.includes(id));
        for (let k = 0; k < Math.max(out.length, inn.length); k += 1) {
          subs.push({ side, outId: out[k] ?? null, inId: inn[k] ?? null });
        }
      }
    }
    const shots = [];
    const turnovers = [];
    const fouls = [];
    const rebounds = [];
    for (const e of tick.events) {
      if (e?.meta?.shot) shots.push({ shooterId: e.meta.shot.shooterId, made: Boolean(e.meta.shot.made), pts: e.meta.shot.pts || 0 });
      if (e?.meta?.turnover) turnovers.push({ actorId: e.meta.turnover.actorId, kind: e.meta.turnover.kind, forcedById: e.meta.turnover.forcedById ?? null });
      if (e?.meta?.foul) fouls.push({ foulerId: e.meta.foul.foulerId, victimId: e.meta.foul.victimId, kind: e.meta.foul.kind });
      if (e?.meta?.reb) rebounds.push({ rebounderId: e.meta.reb.rebounderId, offensive: Boolean(e.meta.reb.offensive) });
    }
    possessions.push({
      index: i,
      quarter: snap.quarter,
      clock: snap.clock,
      // The snapshot's possession is the NEXT attacker; the side that just
      // attacked (this possession's side) is its flip.
      side: snap.possession === "home" ? "away" : "home",
      points,
      shots, turnovers, fouls, rebounds, subs,
      onCourtHome, onCourtAway,
    });
    prevScore = score;
    prevOnCourt = { home: onCourtHome, away: onCourtAway };
  });
  return {
    possessions,
    finalScore: { ...(finalSnap.score || {}) },
    homeName: home?.name || "HOME",
    awayName: away?.name || "AWAY",
    seed,
    finished: !sim.running,
  };
}

/** Points a side scored in a list of possessions. */
const sidePoints = (poss, side) => poss.reduce((s, p) => s + (p.points?.[side] || 0), 0);

/**
 * Analyse a possession log and return every finding, ranked by severity
 * (deterministic). Each finding carries its evidence numbers so the UI
 * can show WHY it is (or isn't) the biggest weakness.
 */
export function analyzeGameLog(log, { focusSide = "away" } = {}) {
  const poss = log?.possessions || [];
  const other = focusSide === "home" ? "away" : "home";
  const findings = [];
  if (!poss.length) return findings;

  // 1. Scoring run — longest run of consecutive OWN possessions where the
  // focus side scored. (Possessions alternate sides, so the run is counted
  // over the side's own possessions only — counting raw ticks could never
  // exceed 1.)
  let bestRun = null;
  let run = null;
  for (const p of poss.filter((q) => q.side === focusSide)) {
    if ((p.points?.[focusSide] || 0) > 0) {
      if (!run) run = { start: p, length: 0, points: 0 };
      run.length += 1;
      run.points += p.points[focusSide];
      run.end = p;
    } else {
      if (run && (!bestRun || run.length > bestRun.length)) bestRun = run;
      run = null;
    }
  }
  if (run && (!bestRun || run.length > bestRun.length)) bestRun = run;
  if (bestRun && bestRun.length >= 3) {
    findings.push({
      kind: "scoring-run", side: focusSide, severity: bestRun.length,
      evidence: { length: bestRun.length, points: bestRun.points, quarter: bestRun.start.quarter, clock: bestRun.start.clock },
      summaryZh: `对方连续 ${bestRun.length} 次进攻回合得分，共得 ${bestRun.points} 分（第 ${bestRun.start.quarter} 节）`,
      summaryEn: `Opponent scored on ${bestRun.length} straight possessions of their own for ${bestRun.points} points (Q${bestRun.start.quarter})`,
      possessionIndices: poss.filter((p) => p.index >= bestRun.start.index && p.index <= bestRun.end.index).map((p) => p.index),
    });
  }

  // 2. On/off splits — per-player presence effects. Five-man lineups
  // fragment across a game (rotations), so the robust split is per
  // player: what happens to scoring when THIS player is on the floor
  // versus off it. Both directions are computed: the studied team's
  // scoring with their player on/off, and the points they allow with
  // OUR player on/off.
  const onOff = (playerId, side) => {
    const on = poss.filter((p) => (side === "home" ? p.onCourtHome : p.onCourtAway).includes(playerId));
    const off = poss.filter((p) => !(side === "home" ? p.onCourtHome : p.onCourtAway).includes(playerId));
    if (on.length < 8 || off.length < 8) return null;
    const pppOn = sidePoints(on, focusSide) / on.length;
    const pppOff = sidePoints(off, focusSide) / off.length;
    return { on: on.length, off: off.length, pppOn, pppOff, delta: pppOn - pppOff, indices: on.map((p) => p.index) };
  };
  const theirIds = new Set();
  const ourIds = new Set();
  for (const p of poss) {
    for (const id of focusSide === "home" ? p.onCourtHome : p.onCourtAway) theirIds.add(id);
    for (const id of focusSide === "home" ? p.onCourtAway : p.onCourtHome) ourIds.add(id);
  }
  let bestOnOffScore = null;
  for (const id of theirIds) {
    const r = onOff(id, focusSide);
    if (!r || Math.abs(r.delta) < 0.3) continue;
    if (!bestOnOffScore || Math.abs(r.delta) > Math.abs(bestOnOffScore.delta)) bestOnOffScore = { id, ...r };
  }
  if (bestOnOffScore) {
    findings.push({
      kind: "onoff-scoring", side: focusSide, severity: Math.round(Math.abs(bestOnOffScore.delta) * 10 * 10) / 10,
      evidence: {
        playerId: bestOnOffScore.id,
        pppOn: Math.round(bestOnOffScore.pppOn * 100) / 100,
        pppOff: Math.round(bestOnOffScore.pppOff * 100) / 100,
        onPoss: bestOnOffScore.on, offPoss: bestOnOffScore.off,
      },
      summaryZh: `对方球员 ${bestOnOffScore.id} 在场时对方每回合 ${bestOnOffScore.pppOn.toFixed(2)} 分，不在场时 ${bestOnOffScore.pppOff.toFixed(2)} 分`,
      summaryEn: `With ${bestOnOffScore.id} on the floor the opponent scores ${bestOnOffScore.pppOn.toFixed(2)} PPP, ${bestOnOffScore.pppOff.toFixed(2)} without him`,
      possessionIndices: bestOnOffScore.indices.slice(0, 12),
    });
  }
  let bestOnOffDef = null;
  for (const id of ourIds) {
    const r = onOff(id, other);
    if (!r || Math.abs(r.delta) < 0.3) continue;
    if (!bestOnOffDef || Math.abs(r.delta) > Math.abs(bestOnOffDef.delta)) bestOnOffDef = { id, ...r };
  }
  if (bestOnOffDef) {
    findings.push({
      kind: "onoff-defense", side: other, severity: Math.round(Math.abs(bestOnOffDef.delta) * 10 * 10) / 10,
      evidence: {
        playerId: bestOnOffDef.id,
        pppOn: Math.round(bestOnOffDef.pppOn * 100) / 100,
        pppOff: Math.round(bestOnOffDef.pppOff * 100) / 100,
        onPoss: bestOnOffDef.on, offPoss: bestOnOffDef.off,
      },
      summaryZh: `我方球员 ${bestOnOffDef.id} 在场时对方每回合 ${bestOnOffDef.pppOn.toFixed(2)} 分，不在场时 ${bestOnOffDef.pppOff.toFixed(2)} 分`,
      summaryEn: `With our ${bestOnOffDef.id} on the floor the opponent scores ${bestOnOffDef.pppOn.toFixed(2)} PPP, ${bestOnOffDef.pppOff.toFixed(2)} without him`,
      possessionIndices: bestOnOffDef.indices.slice(0, 12),
    });
  }

  // 3. Cold shooter — longest run of consecutive missed field goals by one
  // player. A miss by another player starts that player's own run (the
  // previous run is flushed first); only a make by the SAME player ends it.
  let bestCold = null;
  let coldRun = null;
  const flushCold = () => {
    if (coldRun && (!bestCold || coldRun.misses > bestCold.misses)) bestCold = coldRun;
  };
  for (const p of poss) {
    for (const s of p.shots || []) {
      if (!s.made) {
        if (!coldRun || coldRun.shooterId !== s.shooterId) {
          flushCold();
          coldRun = { shooterId: s.shooterId, misses: 0, end: p };
        }
        coldRun.misses += 1;
        coldRun.end = p;
      } else if (coldRun && coldRun.shooterId === s.shooterId) {
        flushCold();
        coldRun = null;
      }
    }
  }
  flushCold();
  if (bestCold && bestCold.misses >= 3) {
    findings.push({
      kind: "cold-shooter", side: null, severity: bestCold.misses,
      evidence: { shooterId: bestCold.shooterId, misses: bestCold.misses },
      summaryZh: `球员 ${bestCold.shooterId} 连续 ${bestCold.misses} 次投篮不中`,
      summaryEn: `Player ${bestCold.shooterId} missed ${bestCold.misses} shots in a row`,
      possessionIndices: [],
    });
  }

  // 4. Late collapse — focus side Q4 PPP vs Q1–Q3 PPP.
  const early = poss.filter((p) => p.quarter <= 3);
  const late = poss.filter((p) => p.quarter >= 4);
  if (early.length >= 10 && late.length >= 5) {
    const pppEarly = sidePoints(early, focusSide) / early.length;
    const pppLate = sidePoints(late, focusSide) / late.length;
    if (pppEarly - pppLate >= 0.35) {
      findings.push({
        kind: "late-collapse", side: focusSide, severity: Math.round((pppEarly - pppLate) * 10 * 10) / 10,
        evidence: { pppEarly: Math.round(pppEarly * 100) / 100, pppLate: Math.round(pppLate * 100) / 100 },
        summaryZh: `对方前三节每回合 ${pppEarly.toFixed(2)} 分，第四节跌到 ${pppLate.toFixed(2)} 分，末节崩盘`,
        summaryEn: `Opponent drops from ${pppEarly.toFixed(2)} points per possession in Q1–Q3 to ${pppLate.toFixed(2)} in Q4`,
        possessionIndices: late.map((p) => p.index).slice(0, 12),
      });
    }
  }

  // 5. Turnover-prone actor — most turnovers by one player.
  const tovByActor = new Map();
  for (const p of poss) {
    for (const t of p.turnovers || []) {
      tovByActor.set(t.actorId, (tovByActor.get(t.actorId) || 0) + 1);
    }
  }
  const tovRows = [...tovByActor.entries()].sort((a, b) => b[1] - a[1]);
  if (tovRows.length && tovRows[0][1] >= 4) {
    findings.push({
      kind: "turnover-prone", side: null, severity: tovRows[0][1],
      evidence: { actorId: tovRows[0][0], turnovers: tovRows[0][1] },
      summaryZh: `球员 ${tovRows[0][0]} 全场失误 ${tovRows[0][1]} 次，是对方最容易丢球的点`,
      summaryEn: `Player ${tovRows[0][0]} turned it over ${tovRows[0][1]} times — the opponent's loosest handle`,
      possessionIndices: [],
    });
  }

  // 6. Substitution effect — PPP in the 5 possessions after a sub vs the 5 before.
  let bestSub = null;
  for (let i = 0; i < poss.length; i += 1) {
    if (!poss[i].subs?.length) continue;
    const before = poss.slice(Math.max(0, i - 5), i);
    const after = poss.slice(i, i + 5);
    if (before.length < 3 || after.length < 3) continue;
    const pppBefore = sidePoints(before, focusSide) / before.length;
    const pppAfter = sidePoints(after, focusSide) / after.length;
    const delta = pppAfter - pppBefore;
    if (Math.abs(delta) >= 0.5 && (!bestSub || Math.abs(delta) > Math.abs(bestSub.delta))) {
      bestSub = { index: i, delta, pppBefore, pppAfter, sub: poss[i].subs[0] };
    }
  }
  if (bestSub) {
    findings.push({
      kind: "sub-effect", side: focusSide, severity: Math.round(Math.abs(bestSub.delta) * 10 * 10) / 10,
      evidence: {
        pppBefore: Math.round(bestSub.pppBefore * 100) / 100,
        pppAfter: Math.round(bestSub.pppAfter * 100) / 100,
        inId: bestSub.sub.inId, outId: bestSub.sub.outId,
      },
      summaryZh: `一次换人后对方每回合得分从 ${bestSub.pppBefore.toFixed(2)} 变为 ${bestSub.pppAfter.toFixed(2)}`,
      summaryEn: `After one substitution the opponent's points per possession moved from ${bestSub.pppBefore.toFixed(2)} to ${bestSub.pppAfter.toFixed(2)}`,
      possessionIndices: poss.slice(bestSub.index, bestSub.index + 5).map((p) => p.index),
    });
  }

  return findings.sort((a, b) => b.severity - a.severity);
}

const FINDING_TITLE = {
  "scoring-run": { zh: "连续得分潮", en: "Scoring run" },
  "onoff-scoring": { zh: "在场时得分暴涨", en: "On/off scoring jump" },
  "onoff-defense": { zh: "在场时失分暴涨", en: "On/off defensive leak" },
  "cold-shooter": { zh: "手感冰凉的球员", en: "Cold shooter" },
  "late-collapse": { zh: "末节崩盘", en: "Late collapse" },
  "turnover-prone": { zh: "失误大户", en: "Turnover-prone player" },
  "sub-effect": { zh: "换人后的变化", en: "Substitution effect" },
};

/**
 * Build one film challenge from a real game log: the top-severity finding
 * is the correct answer; the next two real findings are the distractors.
 * The question is always "what is the BIGGEST exploitable weakness" —
 * every option is a real observation from the same game, with its real
 * numbers attached, so the player compares evidence instead of guessing.
 * Returns null when the log yields fewer than 3 findings.
 */
export function buildFilmChallenge(log, { seed = 1, focusSide = "away" } = {}) {
  const findings = analyzeGameLog(log, { focusSide });
  if (findings.length < 3) return null;
  const correct = findings[0];
  const options = [correct, findings[1], findings[2]].map((f, i) => ({
    id: `opt-${i}`,
    kind: f.kind,
    titleZh: FINDING_TITLE[f.kind]?.zh || f.kind,
    titleEn: FINDING_TITLE[f.kind]?.en || f.kind,
    summaryZh: f.summaryZh,
    summaryEn: f.summaryEn,
    evidence: f.evidence,
    severity: f.severity,
  }));
  const rng = seededStream(seed);
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const correctOptionId = options.find((o) => o.kind === correct.kind && o.severity === correct.severity)?.id || null;
  const stripIndices = new Set(correct.possessionIndices || []);
  return {
    id: `film-${log.seed || seed}-${focusSide}`,
    gameLabel: `${log.homeName} vs ${log.awayName}`,
    finalScore: log.finalScore,
    focusSide,
    options,
    correctOptionId,
    correctKind: correct.kind,
    // The film strip: the possessions behind the correct finding (capped).
    strip: (log.possessions || []).filter((p) => stripIndices.has(p.index)).slice(0, 12),
    findingsCount: findings.length,
  };
}

/** Grade one answer. Reputation moves are small and returned, not applied here. */
export function gradeFilmAnswer(challenge, optionId) {
  const correct = optionId === challenge?.correctOptionId;
  const picked = (challenge?.options || []).find((o) => o.id === optionId) || null;
  const right = (challenge?.options || []).find((o) => o.id === challenge?.correctOptionId) || null;
  return {
    correct,
    reputationDelta: correct ? 3 : -4,
    pickedKind: picked?.kind || null,
    correctKind: challenge?.correctKind || null,
    explanationZh: correct
      ? `判断正确：${right?.summaryZh || ""}，这是本场最值得利用的弱点。`
      : `判断有误：你选的是「${picked?.titleZh || "?"}」（${picked?.summaryZh || ""}），但本场最大的弱点是「${right?.titleZh || "?"}」（${right?.summaryZh || ""}）。`,
    explanationEn: correct
      ? `Correct: ${right?.summaryEn || ""} — the biggest exploitable weakness in this game.`
      : `Not quite: you picked "${picked?.titleEn || "?"}" (${picked?.summaryEn || ""}), but the biggest weakness was "${right?.titleEn || "?"}" (${right?.summaryEn || ""}).`,
  };
}

/**
 * The recommendation this report hands to the coaching side (workstream B
 * owns the decision). `wasCorrect` is carried so a misread report can
 * still be submitted — and can cost the team if the coach adopts it.
 */
export function filmRecommendation(challenge, optionId, { lang = "zh" } = {}) {
  const grade = gradeFilmAnswer(challenge, optionId);
  const picked = (challenge?.options || []).find((o) => o.id === optionId) || null;
  return {
    source: "film-room",
    challengeId: challenge?.id || null,
    kind: picked?.kind || null,
    wasCorrect: grade.correct,
    confidence: grade.correct ? "high" : "low",
    targetId: picked?.evidence?.shooterId || picked?.evidence?.actorId || null,
    suggestionZh: picked ? `建议针对：${picked.summaryZh}` : "无建议",
    suggestionEn: picked ? `Recommend exploiting: ${picked.summaryEn}` : "No recommendation",
    evidence: picked?.evidence || null,
    reputationDelta: grade.reputationDelta,
  };
}

/** Inbox event shape for workstream A: a film report filed to the head coach. */
export function filmReportInboxEvent(recommendation, { teamName = "" } = {}) {
  return {
    type: "film-report",
    source: "film-room",
    teamName,
    kind: recommendation?.kind || null,
    wasCorrect: Boolean(recommendation?.wasCorrect),
    confidence: recommendation?.confidence || "low",
    // A consumes: { type, kind, confidence, suggestionZh, suggestionEn }.
    suggestionZh: recommendation?.suggestionZh || "",
    suggestionEn: recommendation?.suggestionEn || "",
  };
}
