/**
 * 晋级淘汰：32 → 16 → 8 → 4 → 2 → 1
 * - 自定义预算轮抽：对手为 32 支历史球队
 * - 金币晋级赛：32 支随机联队（非历史绑定），越往后阵容迭代越强
 * 四人一组：开门赛 → 胜者组 / 复活赛 → 晋级决胜；两败出局。
 */
import { accumulateGameToAllTeamBoard, allTeamFromRosters, selectAllTeamByPos } from "./allTeam.js";
import { simulateCpuMatch } from "./careerEconomy.js";
import { cpuUpgradeRoster } from "./draft.js";
import { rollAdvancementInjuries } from "../data/intangibles.js";
import { shuffle } from "../core/seededRandom.js";

export const CAREER_STAGES = [32, 16, 8, 4, 2];

export const CAREER_STAGE_LABELS = {
  32: "三十二强 · 32进16",
  16: "十六强 · 16进8",
  8: "八强 · 8进4",
  4: "四强 · 4进2",
  2: "总决赛 · 2进1",
};

export const CAREER_STAGE_LABELS_EN = {
  32: "Round of 32 · 32→16",
  16: "Round of 16 · 16→8",
  8: "Quarterfinals · 8→4",
  4: "Semifinals · 4→2",
  2: "Finals · 2→1",
};

export function careerStageLabel(stageSize, { finals = false, lang = "zh" } = {}) {
  const table = lang === "en" ? CAREER_STAGE_LABELS_EN : CAREER_STAGE_LABELS;
  if (finals || stageSize === 2) return table[2];
  return table[stageSize] || (lang === "en" ? `Top ${stageSize}` : `${stageSize} 强`);
}

export function nextStageSize(stageSize) {
  const i = CAREER_STAGES.indexOf(stageSize);
  if (i < 0 || i >= CAREER_STAGES.length - 1) return null;
  return CAREER_STAGES[i + 1];
}


function mkMatch(a, b, kind, podId) {
  return {
    a,
    b,
    kind, // opener | winners | revival | decider | final
    podId,
    yours: a?.bracketId === "you" || b?.bracketId === "you",
    done: false,
    score: null,
    winner: null,
    loser: null,
    startersA: null,
    startersB: null,
  };
}

/**
 * Build pods of 4 from alive list. Remainder pairs (should not happen at 32/16/8/4).
 * @returns {{ pods: object[], openers: object[] }}
 */
export function buildStagePods(alive, { rng = Math.random } = {}) {
  const teams = shuffle(alive, rng);
  const pods = [];
  const openers = [];
  let podId = 0;
  for (let i = 0; i < teams.length; i += 4) {
    const chunk = teams.slice(i, i + 4);
    if (chunk.length === 4) {
      const [t0, t1, t2, t3] = chunk;
      const openerA = mkMatch(t0, t1, "opener", podId);
      const openerB = mkMatch(t2, t3, "opener", podId);
      pods.push({
        id: podId,
        teams: chunk,
        openerA,
        openerB,
        winnersMatch: null,
        revivalMatch: null,
        deciderMatch: null,
        advancers: [],
        eliminated: [],
        done: false,
      });
      openers.push(openerA, openerB);
      podId += 1;
    } else if (chunk.length === 2) {
      // Finals / odd fallback: single match
      const final = mkMatch(chunk[0], chunk[1], "final", podId);
      pods.push({
        id: podId,
        teams: chunk,
        openerA: final,
        openerB: null,
        winnersMatch: null,
        revivalMatch: null,
        deciderMatch: null,
        advancers: [],
        eliminated: [],
        done: false,
        isFinal: true,
      });
      openers.push(final);
      podId += 1;
    }
  }
  return { pods, openers };
}

/** After both openers done → create winners + revival matches. */
export function progressPodAfterOpeners(pod) {
  if (!pod || pod.isFinal) return [];
  const oa = pod.openerA;
  const ob = pod.openerB;
  if (!oa?.done || !ob?.done) return [];
  if (pod.winnersMatch && pod.revivalMatch) return [];
  const w1 = oa.winner;
  const l1 = oa.loser;
  const w2 = ob.winner;
  const l2 = ob.loser;
  if (!w1 || !l1 || !w2 || !l2) return [];
  pod.winnersMatch = mkMatch(w1, w2, "winners", pod.id);
  pod.revivalMatch = mkMatch(l1, l2, "revival", pod.id);
  return [pod.winnersMatch, pod.revivalMatch];
}

/** After winners + revival done → create decider (second advance slot). */
export function progressPodAfterMid(pod) {
  if (!pod || pod.isFinal) return [];
  const w = pod.winnersMatch;
  const r = pod.revivalMatch;
  if (!w?.done || !r?.done) return [];
  if (pod.deciderMatch) return [];
  // Winners-match winner already advances
  if (w.winner && !pod.advancers.some((t) => t.bracketId === w.winner.bracketId)) {
    pod.advancers.push(w.winner);
  }
  // Revival loser is out (2 losses)
  if (r.loser && !pod.eliminated.some((t) => t.bracketId === r.loser.bracketId)) {
    pod.eliminated.push(r.loser);
  }
  // Decider: winners-match loser vs revival winner
  if (!w.loser || !r.winner) return [];
  pod.deciderMatch = mkMatch(w.loser, r.winner, "decider", pod.id);
  return [pod.deciderMatch];
}

/** Finalize pod after decider (or after final match). */
export function finalizePod(pod) {
  if (!pod) return;
  if (pod.isFinal) {
    const m = pod.openerA;
    if (!m?.done) return;
    if (m.winner) pod.advancers = [m.winner];
    if (m.loser) pod.eliminated = [m.loser];
    pod.done = true;
    return;
  }
  const d = pod.deciderMatch;
  if (!d?.done) return;
  if (d.winner && !pod.advancers.some((t) => t.bracketId === d.winner.bracketId)) {
    pod.advancers.push(d.winner);
  }
  if (d.loser && !pod.eliminated.some((t) => t.bracketId === d.loser.bracketId)) {
    pod.eliminated.push(d.loser);
  }
  pod.done = true;
}

export function applyMatchResult(match, winnerTeam) {
  if (!match || !winnerTeam) return;
  const win =
    winnerTeam.bracketId === match.a.bracketId
      ? match.a
      : winnerTeam.bracketId === match.b.bracketId
        ? match.b
        : winnerTeam;
  const lose = win.bracketId === match.a.bracketId ? match.b : match.a;
  match.done = true;
  match.winner = win;
  match.loser = lose;
}

/* —— 总决赛系列赛（三局两胜，用户 2026-10-23 拍板，取代最初的七场四胜设想）——
 * 系列赛进行中时，pod 的总决赛 match 保持未结算（不 applyMatchResult），
 * 同一场对阵会被 findYourOpenMatch 反复找到，直到系列赛分出胜负，
 * 才把最后一场的结果正式记进 pod，走原有的夺冠/淘汰流程。
 * 每场之间玩家走市场买卖调整（app.js 的 btn-market-done 在
 * c.finals && c.series 时直接回到与 series.opp 的布置页）。 */
export const FINALS_TARGET_WINS = 2;

export function startFinalsSeries(opp) {
  return { opp, wins: 0, losses: 0, target: FINALS_TARGET_WINS };
}

/** Record one finals game. Returns { done, champion } — done when either side reaches target. */
export function recordFinalsGame(series, youWon) {
  if (!series) return { done: false, champion: false };
  if (youWon) series.wins = (series.wins || 0) + 1;
  else series.losses = (series.losses || 0) + 1;
  const target = series.target || FINALS_TARGET_WINS;
  const champion = series.wins >= target;
  return { done: champion || series.losses >= target, champion };
}

export function finalsSeriesLabel(series) {
  if (!series) return "";
  const target = series.target || FINALS_TARGET_WINS;
  return `总决赛 ${series.wins || 0}–${series.losses || 0}（先赢 ${target} 场）`;
}

export function kindLabel(kind) {
  if (kind === "opener") return "开门赛";
  if (kind === "winners") return "胜者组";
  if (kind === "revival") return "复活赛";
  if (kind === "decider") return "晋级决胜";
  if (kind === "final") return "总决赛";
  return "对决";
}

/** Collect all unfinished matches involving the user across pods. */
export function findYourOpenMatch(pods) {
  for (const pod of pods || []) {
    const seq = [
      pod.openerA,
      pod.openerB,
      pod.winnersMatch,
      pod.revivalMatch,
      pod.deciderMatch,
    ].filter(Boolean);
    for (const m of seq) {
      if (m.yours && !m.done) return m;
    }
  }
  return null;
}

/** All currently scheduled (known) matches for scout UI. */
export function listPodMatches(pods) {
  const out = [];
  for (const pod of pods || []) {
    for (const m of [
      pod.openerA,
      pod.openerB,
      pod.winnersMatch,
      pod.revivalMatch,
      pod.deciderMatch,
    ]) {
      if (m) out.push(m);
    }
  }
  return out;
}

export function allPodsDone(pods) {
  return (pods || []).length > 0 && (pods || []).every((p) => p.done);
}

export function collectAdvancers(pods) {
  const list = [];
  for (const pod of pods || []) {
    for (const t of pod.advancers || []) list.push(t);
  }
  return list;
}

/** Quick self-check: 4-team pod yields 2 advancers. */
export function _selfCheckPodMath() {
  const T = (id) => ({ bracketId: id, name: id, isCpu: id !== "you" });
  const { pods } = buildStagePods([T("a"), T("b"), T("c"), T("d"), T("e"), T("f"), T("g"), T("h")]);
  return pods.length === 2 && pods.every((p) => p.teams.length === 4);
}

export function noteCareerLoss(c, team) {
  if (!c?.losses || !team?.bracketId) return;
  c.losses[team.bracketId] = (c.losses[team.bracketId] || 0) + 1;
}

export function noteCareerAllTeamGame(c, snap, homeTeam, awayTeam) {
  if (!c || !snap) return;
  if (!c.allTeamBoard) c.allTeamBoard = {};
  accumulateGameToAllTeamBoard(c.allTeamBoard, snap, homeTeam, awayTeam);
}

/** Fast-forward a CPU-vs-CPU match the human isn't in and record the result onto it. */
export function runCpuMatchInto(c, match) {
  if (!match || match.done || match.yours) return;
  const result = simulateCpuMatch(match.a, match.b);
  applyMatchResult(match, result.winner);
  match.score = result.score;
  match.startersA = result.startersA;
  match.startersB = result.startersB;
  if (result.snap) noteCareerAllTeamGame(c, result.snap, match.a, match.b);
  if (match.loser) noteCareerLoss(c, match.loser);
}

/** The human's next unfinished match: current pod first, legacy flat roundMatches as fallback. */
export function yourCareerMatch(c) {
  if (c?.pods?.length) {
    const open = findYourOpenMatch(c.pods);
    if (open) return open;
  }
  return (
    c?.roundMatches?.find((m) => m.yours && !m.done) ||
    c?.roundMatches?.find((m) => m.yours) ||
    null
  );
}

/** 总决赛后：按 PG→C 评出本届最佳阵容 */
export function computeCareerAllTeam(c) {
  if (!c) return [];
  if (!c.allTeamBoard) c.allTeamBoard = {};
  let team = selectAllTeamByPos(c.allTeamBoard);
  if (team.length < 5) {
    const finalsTeams = [];
    if (c.team) finalsTeams.push(c.team);
    for (const t of c.alive || []) {
      if (t && !finalsTeams.some((x) => x.bracketId === t.bracketId)) finalsTeams.push(t);
    }
    const m = yourCareerMatch(c);
    if (m?.a && !finalsTeams.some((x) => x.bracketId === m.a.bracketId)) finalsTeams.push(m.a);
    if (m?.b && !finalsTeams.some((x) => x.bracketId === m.b.bracketId)) finalsTeams.push(m.b);
    if (c.series?.opp && !finalsTeams.some((x) => x.bracketId === c.series.opp.bracketId)) {
      finalsTeams.push(c.series.opp);
    }
    team = allTeamFromRosters(finalsTeams);
  }
  c.allTeam = team;
  return team;
}

/**
 * Roll the injury/recovery wave for a career advancement round: your team at full
 * intensity, your current series opponent slightly lighter, and every other team still
 * alive in the bracket lighter still (they're CPU-only, so their injuries are flavor/
 * balance, not something the human needs to manage in detail).
 */
export function applyCareerInjuryWave(c, opts) {
  if (!c?.team?.players) return [];
  const reports = rollAdvancementInjuries(c.team.players, opts);
  if (c.series?.opp?.players) {
    reports.push(...rollAdvancementInjuries(c.series.opp.players, { ...opts, intensity: (opts.intensity || 1) * 0.9 }));
  }
  for (const t of c.alive || []) {
    if (t.bracketId === "you" || !t.players) continue;
    reports.push(...rollAdvancementInjuries(t.players, { ...opts, intensity: (opts.intensity || 1) * 0.85 }));
  }
  return reports.filter((r) => r.type === "injury" || r.type === "recover").map((r) => r.text);
}

/**
 * Give every surviving CPU team a budget to upgrade their roster before the next stage --
 * deeper stages (smaller stageSize) hand out bigger purses and, for random-field gold-ladder
 * teams, more upgrade passes, so CPU rosters visibly get tougher the later you advance.
 */
export function upgradeCpuAdvancers(c, survivors) {
  // stageSize 仍是晋级前规模：32→16 时为 32；越深入 depth 越大
  const depth = Math.max(0, 5 - Math.log2(Math.max(2, c.stageSize || 32)));
  const randomField = c.fieldSource === "random";
  const purseBase = randomField ? 200 : 140;
  const purse = purseBase + depth * (randomField ? 95 : 55);
  const passes = randomField ? 1 + Math.floor(depth) : 1; // 随机联队：越往后多轮换血
  for (const t of survivors) {
    if (!t?.isCpu) continue;
    t.gold = (t.gold || 0) + purse + Math.floor(Math.random() * (randomField ? 120 : 80));
    for (let i = 0; i < passes; i++) {
      const spend = Math.min(
        t.gold,
        110 + Math.floor(purse * 0.75) + Math.floor(Math.random() * 70) + depth * 40
      );
      if (spend < 40) break;
      const res = cpuUpgradeRoster(t, spend, c.used);
      t.gold = Math.max(0, (t.gold || 0) - res.spent);
    }
    t.starterIds = null;
  }
}
